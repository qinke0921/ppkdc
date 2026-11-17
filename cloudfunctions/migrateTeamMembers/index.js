// cloudfunctions/migrateTeamMembers/index.js
// 主演徒弟：把车队 members 里的成员批量迁移成 disciples 档案（跳过拜师申请流程）
//
// 安全设计
// - 仅师傅(master) / 管理员(admin) 可执行
// - 或使用云开发控制台的「云端测试」时，通过环境变量 MIGRATE_KEY 鉴权：
//   在云函数配置里设 MIGRATE_KEY=任意随机串，调用时传 { bypassKey: '同一个串' }
//   （密钥存在云函数环境变量里，不写进代码，迁移完成后请删除本云函数）
// - dryRun 默认为 true：只预览不写库，必须显式传 dryRun:false 才会真正写入
// - 按 _openid 幂等：已存在徒弟档案的人会被跳过，重复执行不会重复建档
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

const LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'];
const MAX_IDS = 500;
const CHUNK = 100;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isMissingCollection(err) {
  const code = err && err.errCode;
  const msg = (err && err.message) || '';
  return code === -502005 || /collection not exist|COLLECTION_NOT_EXIST|Db or Table not exist/i.test(msg);
}

async function getCaller(openid) {
  if (!openid) return null;
  const res = await db.collection('disciples').where({ _openid: openid }).get();
  return res.data[0] || null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const payload = event || {};

  try {
    // ---------- 1. 鉴权 ----------
    let caller = null;
    try {
      caller = await getCaller(OPENID);
    } catch (err) {
      // disciples 集合还没建时，只有控制台密钥这条路径可用
      if (!isMissingCollection(err)) throw err;
    }

    const isManager = !!caller && (caller.role === 'master' || caller.role === 'admin');
    const key = process.env.MIGRATE_KEY || '';
    const bypass = !!key && payload.bypassKey === key;

    if (!isManager && !bypass) {
      return {
        success: false,
        error: '仅师傅或管理员可执行迁移；控制台测试请在云函数环境变量配置 MIGRATE_KEY 并传入 bypassKey'
      };
    }

    // ---------- 2. 参数 ----------
    const memberIds = Array.isArray(payload.memberIds) ? payload.memberIds.filter(Boolean).map(String) : [];
    const openids = Array.isArray(payload.openids) ? payload.openids.filter(Boolean).map(String) : [];
    const dryRun = payload.dryRun !== false;          // 默认预览
    const useOverallLine = !!payload.useOverallLine;  // 用车队综合分线作为师傅定线
    const includeLeft = !!payload.includeLeft;        // 是否迁移已离队成员
    const keepJoinedAt = payload.keepJoinedAt !== false;
    let masterLine = payload.masterLine || '';

    if (masterLine && LINE_LEVELS.indexOf(masterLine) === -1) {
      return { success: false, error: '定线档位不合法：' + masterLine };
    }
    if (memberIds.length === 0 && openids.length === 0) {
      return { success: false, error: '请提供 memberIds（members._id）或 openids' };
    }
    if (memberIds.length + openids.length > MAX_IDS) {
      return { success: false, error: '单次最多 ' + MAX_IDS + ' 人，请分批执行' };
    }

    // ---------- 3. 取车队成员 ----------
    let members = [];

    for (const part of chunk(memberIds, CHUNK)) {
      const res = await db.collection('members').where({ _id: _.in(part) }).limit(CHUNK).get();
      members = members.concat(res.data);
    }
    for (const part of chunk(openids, CHUNK)) {
      const res = await db.collection('members').where({ _openid: _.in(part) }).limit(CHUNK).get();
      members = members.concat(res.data);
    }

    // 去重（同一个人可能既按 _id 又按 openid 命中）
    const seen = {};
    members = members.filter((m) => {
      if (seen[m._id]) return false;
      seen[m._id] = true;
      return true;
    });

    const foundIds = {};
    const foundOpenids = {};
    members.forEach((m) => {
      foundIds[m._id] = true;
      if (m._openid) foundOpenids[m._openid] = true;
    });

    const notFound = [];
    memberIds.forEach((id) => { if (!foundIds[id]) notFound.push({ memberId: id, type: 'id' }); });
    openids.forEach((o) => { if (!foundOpenids[o]) notFound.push({ memberId: o, type: 'openid' }); });

    // ---------- 4. 已存在的徒弟（按 openid 幂等） ----------
    const existing = {};
    const openidList = members.map((m) => m._openid).filter(Boolean);

    for (const part of chunk(openidList, CHUNK)) {
      const res = await db.collection('disciples').where({ _openid: _.in(part) }).limit(CHUNK).get();
      res.data.forEach((d) => { existing[d._openid] = true; });
    }

    // ---------- 5. 逐条处理 ----------
    const created = [];
    const skippedExisting = [];
    const skippedNotApproved = [];
    const failed = [];

    for (const m of members) {
      if (!m._openid) {
        failed.push({ memberId: m._id, gameName: m.gameName || '', reason: '缺少 _openid，无法建档' });
        continue;
      }
      if (existing[m._openid]) {
        skippedExisting.push({ memberId: m._id, gameName: m.gameName || '', nickname: m.nickname || '' });
        continue;
      }
      if (m.status && m.status !== 'approved' && !includeLeft) {
        skippedNotApproved.push({ memberId: m._id, gameName: m.gameName || '', status: m.status });
        continue;
      }

      // 定线：统一指定优先，其次用队员综合分线
      let line = masterLine;
      if (!line && useOverallLine && m.overallLine && LINE_LEVELS.indexOf(m.overallLine) >= 0) {
        line = m.overallLine;
      }

      const doc = {
        _openid: m._openid,
        nickname: m.nickname || '',
        gameName: m.gameName || '',
        gameId: m.gameId || '',
        statement: m.statement || '',
        masterLine: line || '',
        status: 'approved',
        role: 'member',                       // 车队 admin 不会继承为主演徒弟管理员
        joinedAt: (keepJoinedAt && m.joinedAt) ? m.joinedAt : Date.now(),
        createdAt: Date.now(),
        createdBy: OPENID || 'migration',
        migratedFrom: m._id
      };

      if (dryRun) {
        created.push({ memberId: m._id, gameName: doc.gameName, nickname: doc.nickname, masterLine: doc.masterLine });
        existing[m._openid] = true;
        continue;
      }

      try {
        await db.collection('disciples').add({ data: doc });
        existing[m._openid] = true;
        created.push({ memberId: m._id, gameName: doc.gameName, nickname: doc.nickname, masterLine: doc.masterLine });
      } catch (err) {
        failed.push({ memberId: m._id, gameName: m.gameName || '', reason: err.message });
      }
    }

    masterLine = masterLine || '';

    return {
      success: true,
      dryRun,
      summary: {
        input: memberIds.length + openids.length,
        matched: members.length,
        created: created.length,
        skippedExisting: skippedExisting.length,
        skippedNotApproved: skippedNotApproved.length,
        notFound: notFound.length,
        failed: failed.length
      },
      created: created,
      skippedExisting: skippedExisting,
      skippedNotApproved: skippedNotApproved,
      notFound: notFound,
      failed: failed
    };
  } catch (err) {
    if (isMissingCollection(err)) {
      return {
        success: false,
        needInitCollections: true,
        error: '数据集合还没创建：请先在云开发控制台新建 disciples 与 discipleApplications 两个集合（权限用默认）'
      };
    }
    return { success: false, error: err.message };
  }
};

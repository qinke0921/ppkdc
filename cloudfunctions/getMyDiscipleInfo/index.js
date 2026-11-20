// cloudfunctions/getMyDiscipleInfo/index.js
// 主演徒弟：查询当前用户身份（师傅 / 管理员 / 徒弟）、徒弟总数、可管理人待审批列表
//
// 角色模型（互斥，存于 disciples.role）：
//   master —— 师傅（主演），全平台唯一，拥有全部权限
//   admin  —— 平台协助管理，可审批、可改定线、可维护资料，但不是师傅本人
//   member —— 普通徒弟，只能改自己的基础资料
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

// 主演徒弟定线只有 6 档；车队的 overallLine 是 14 档，读取时按「就慢不就快」收敛
const DISCIPLE_LINES = ['强主', '主力', '一线', '二线', '三线', '娱乐'];
const LINE_ALIAS = {
  '国服记录': '强主',
  '顶尖职业': '强主',
  '职业': '强主',
  '强主': '强主',
  '主力': '主力',
  '强一': '一线',
  '一线': '一线',
  '弱一': '二线',
  '强二': '二线',
  '二线': '二线',
  '弱二': '三线',
  '强三': '三线',
  '三线': '三线',
  '娱乐': '娱乐'
};

const TASK_LINES = ['国服记录', '强主', '主力', '一线', '二线', '三线', '娱乐'];
function normalizeLine(raw) {
  if (!raw) return { effective: '娱乐', source: 'default' };
  const mapped = LINE_ALIAS[raw];
  if (mapped) return { effective: mapped, source: 'set' };
  return { effective: '娱乐', source: 'default' };
}

const STATUS_TEXT = {
  over: '超线完成',
  passed: '达标',
  missed: '未达标',
  absent: '逃课',
  no_target: '无法判定',
  pending: '进行中'
};

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatMs(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '';
  const totalCs = Math.round(ms / 10);
  const min = Math.floor(totalCs / 6000);
  const sec = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return min + ':' + pad2(sec) + '.' + pad2(cs);
}

// 四态判定：快一档为超线，国服记录是天花板
function judge(bestMs, lineTable, memberLine) {
  const idx = TASK_LINES.indexOf(normalizeLine(memberLine).effective);
  const table = {};
  (lineTable || []).forEach((r) => { table[r.level] = r.ms === undefined ? null : r.ms; });

  const targetLevel = TASK_LINES[idx];
  const targetMs = table[targetLevel] === undefined ? null : table[targetLevel];
  const overLevel = idx > 0 ? TASK_LINES[idx - 1] : null;
  const overMs = overLevel && table[overLevel] !== undefined ? table[overLevel] : null;

  if (bestMs === null || bestMs === undefined) return { status: 'absent', targetLevel, targetMs, overLevel, overMs };
  if (targetMs === null) return { status: 'no_target', targetLevel, targetMs, overLevel, overMs };
  if (overMs !== null && bestMs <= overMs) return { status: 'over', targetLevel, targetMs, overLevel, overMs };
  if (bestMs <= targetMs) return { status: 'passed', targetLevel, targetMs, overLevel, overMs };
  return { status: 'missed', targetLevel, targetMs, overLevel, overMs };
}

// 集合不存在时（云开发错误码 -502005）给出可操作的提示，而不是抛出英文技术错误
function isMissingCollection(err) {
  const code = err && err.errCode;
  const msg = (err && err.message) || '';
  return code === -502005 || /collection not exist|COLLECTION_NOT_EXIST|Db or Table not exist/i.test(msg);
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, error: '未获取到用户身份' };
  }

  try {
    // 1. 查自己的档案（本模块没有离队状态，只要 approved）
    const myRes = await db.collection('disciples')
      .where({ _openid: OPENID, status: 'approved' })
      .get();

    const raw = myRes.data[0] || null;
    const lineInfo = raw ? normalizeLine(raw.masterLine) : null;
    const disciple = raw ? {
      _id: raw._id,
      _openid: raw._openid,
      nickname: raw.nickname || '',
      gameName: raw.gameName || '',
      gameId: raw.gameId || '',
      statement: raw.statement || '',
      masterLine: lineInfo.effective,
      masterLineRaw: raw.masterLine || '',
      lineSource: lineInfo.source,
      role: raw.role || 'member',
      joinedAt: raw.joinedAt || null
    } : null;

    // 2. 当前师傅（主演）—— 全平台唯一
    const masterRes = await db.collection('disciples')
      .where({ role: 'master' })
      .limit(1)
      .get();

    const masterRaw = masterRes.data[0] || null;
    const master = masterRaw ? {
      _id: masterRaw._id,
      _openid: masterRaw._openid,
      nickname: masterRaw.nickname || '',
      gameName: masterRaw.gameName || '',
      statement: masterRaw.statement || ''
    } : null;

    // 3. 徒弟总数（不含师傅本人）
    const countRes = await db.collection('disciples')
      .where({ status: 'approved', role: _.neq('master') })
      .count();

    // 4. 权限判定：师傅与管理员都能管，但只有 master 是「师傅」
    const isMaster = !!disciple && disciple.role === 'master';
    const isAdmin = !!disciple && disciple.role === 'admin';
    const canManage = isMaster || isAdmin;

    // 公告（单文档）
    let announcement = null;
    try {
      const annRes = await db.collection('disciple_announcement').limit(1).get();
      if (annRes.data && annRes.data.length) {
        const a = annRes.data[0];
        announcement = {
          content: a.content || '',
          updatedAt: a.updatedAt || null,
          updatedByName: a.updatedByName || ''
        };
      }
    } catch (err) {
      announcement = null;
    }

    // 待审批的成绩申请数（管理端红点）
    let pendingRequestCount = 0;
    if (canManage) {
      try {
        const reqCount = await db.collection('disciple_task_requests').where({ status: 'pending' }).count();
        pendingRequestCount = reqCount.total;
      } catch (err) {
        pendingRequestCount = 0;
      }
    }

    // 待处理的视频失效反馈
    let pendingReportCount = 0;
    if (canManage) {
      try {
        const repCount = await db.collection('disciple_task_reports').where({ status: 'pending' }).count();
        pendingReportCount = repCount.total;
      } catch (err) {
        pendingReportCount = 0;
      }
    }

    // 5. 只有可管理人才能看待审批（走云函数，不依赖集合权限）
    let pendingApplications = [];
    if (canManage) {
      const appRes = await db.collection('discipleApplications')
        .where({ status: 'pending' })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      pendingApplications = appRes.data.map((a) => ({
        _id: a._id,
        nickname: a.nickname || '',
        gameName: a.gameName || '',
        gameId: a.gameId || '',
        statement: a.statement || '',
        createdAt: a.createdAt || null,
        pickedLine: ''
      }));
    }

    // 进行中任务摘要：首页直接可见
    let activeTasks = [];
    try {
      if (disciple) {
        const now = Date.now();
        const taskRes = await db.collection('disciple_tasks')
          .where({ status: 'published', startAt: _.lte(now), endAt: _.gte(now) })
          .orderBy('endAt', 'asc')
          .limit(10)
          .get();

        const tasks = taskRes.data || [];
        if (tasks.length > 0) {
          const ids = tasks.map((t) => t._id);
          const recRes = await db.collection('disciple_task_records')
            .where({ _openid: OPENID, taskId: _.in(ids) })
            .limit(100)
            .get();

          const byTask = {};
          (recRes.data || []).forEach((r) => {
            if (!byTask[r.taskId]) byTask[r.taskId] = [];
            byTask[r.taskId].push(r);
          });

          activeTasks = tasks.map((t) => {
            const list = byTask[t._id] || [];
            const bestMs = list.length ? Math.min.apply(null, list.map((r) => r.scoreMs)) : null;
            const best = list.filter((r) => r.scoreMs === bestMs)[0];
            const j = judge(bestMs, t.lineTable, disciple.masterLineRaw);
            const status = bestMs === null ? 'pending' : j.status;

            return {
              taskId: t._id,
              title: t.title || t.mapName,
              mapName: t.mapName,
              startAt: t.startAt,
              endAt: t.endAt,
              daysLeft: Math.max(0, Math.ceil((t.endAt - now) / 86400000)),
              targetLevel: j.targetLevel,
              targetText: formatMs(j.targetMs),
              targetMissing: j.targetMs === null,
              overLevel: j.overLevel,
              overText: formatMs(j.overMs),
              bestText: best ? best.scoreText : '',
              bestMs,
              status,
              statusText: STATUS_TEXT[status] || '',
              recordCount: list.length
            };
          });
        }
      }
    } catch (err) {
      // 任务集合还没建时不影响首页其它信息
      activeTasks = [];
    }

    return {
      success: true,
      openid: OPENID,
      isDisciple: !!disciple,
      disciple,
      isMaster,
      isAdmin,
      canManage,
      master,
      discipleCount: countRes.total,
      hasMaster: !!master,
      canClaimMaster: !master,
      activeTasks,
      pendingRequestCount,
      announcement,
      pendingReportCount,
      pendingApplications
    };
  } catch (err) {
    if (isMissingCollection(err)) {
      return {
        success: false,
        needInitCollections: true,
        error: '数据集合还没创建：请在云开发控制台新建 disciples 与 discipleApplications 两个集合（权限用默认）'
      };
    }
    return { success: false, error: err.message };
  }
};

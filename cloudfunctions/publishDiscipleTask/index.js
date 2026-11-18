// 主演徒弟 · 任务系统公共逻辑
// 云端函数各自独立部署，故每个函数内保留一份，内容保持一致
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

// 任务分线固定 7 行：国服记录仅作超线天花板
const TASK_LINES = ['国服记录', '强主', '主力', '一线', '二线', '三线', '娱乐'];

// 徒弟定线 6 档；历史 14 档值按「就慢不就快」收敛
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

const STATUS_TEXT = {
  over: '超线完成',
  passed: '达标',
  missed: '未达标',
  absent: '逃课',
  no_target: '无法判定',
  pending: '进行中'
};

const MISSING_COLLECTION = '数据集合还没创建：请先在云开发控制台新建 disciple_tasks / disciple_task_records / disciple_task_results 三个集合（权限用默认）';

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function normalizeLine(raw) {
  if (!raw) return { effective: '娱乐', source: 'default' };
  const mapped = LINE_ALIAS[raw];
  if (mapped) return { effective: mapped, source: 'set' };
  return { effective: '娱乐', source: 'default' };
}

// 支持 1:27.99 / 1.27.99 / 1:27；厘秒 >= 100 或秒 >= 60 视为非法
function timeToMs(text) {
  if (text === null || text === undefined) return NaN;
  const t = String(text).trim().replace(/：/g, ':');
  if (!t) return NaN;

  const parts = t.split(/[:.]/).filter((s) => s !== '');
  if (parts.length < 2 || parts.length > 3) return NaN;

  const min = parseInt(parts[0], 10);
  const sec = parseInt(parts[1], 10);
  const cs = parts.length === 3 ? parseInt(parts[2], 10) : 0;

  if (isNaN(min) || isNaN(sec) || isNaN(cs)) return NaN;
  if (sec >= 60 || cs >= 100) return NaN;

  return min * 60000 + sec * 1000 + cs * 10;
}

function formatMs(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '';
  const totalCs = Math.round(ms / 10);
  const min = Math.floor(totalCs / 6000);
  const sec = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return min + ':' + pad2(sec) + '.' + pad2(cs);
}

function isMissingCollection(err) {
  const code = err && err.errCode;
  const msg = (err && err.message) || '';
  return code === -502005 || /collection not exist|COLLECTION_NOT_EXIST|Db or Table not exist/i.test(msg);
}

function missingErr() {
  return { success: false, needInitCollections: true, error: MISSING_COLLECTION };
}

function q(name, where) {
  const hasWhere = where && Object.keys(where).length > 0;
  return hasWhere ? db.collection(name).where(where) : db.collection(name);
}

async function fetchAll(name, where) {
  const countRes = await q(name, where).count();
  const total = countRes.total;
  let out = [];
  let skip = 0;

  while (skip < total) {
    const res = await q(name, where).skip(skip).limit(100).get();
    out = out.concat(res.data);
    if (res.data.length === 0) break;
    skip += res.data.length;
  }
  return out;
}

async function getCaller(openid) {
  if (!openid) return null;
  const res = await db.collection('disciples').where({ _openid: openid }).get();
  return res.data[0] || null;
}

function isManager(caller) {
  return !!caller && (caller.role === 'master' || caller.role === 'admin');
}

// 入参 rows: [{ level, timeText }] → 固定 7 行 + 校验
function buildLineTable(rows) {
  const errors = [];
  const map = {};

  (rows || []).forEach((r) => {
    if (!r || !r.level || TASK_LINES.indexOf(r.level) < 0) return;
    const text = String(r.timeText || '').trim();
    let ms = null;
    if (text) {
      const v = timeToMs(text);
      if (isNaN(v)) {
        errors.push(r.level + ' ' + text);
        return;
      }
      ms = v;
    }
    map[r.level] = { level: r.level, timeText: text, ms };
  });

  const lineTable = TASK_LINES.map((level) => map[level] || { level, timeText: '', ms: null });

  let orderError = '';
  for (let i = 1; i < lineTable.length; i++) {
    const prev = lineTable[i - 1].ms;
    const cur = lineTable[i].ms;
    if (prev !== null && cur !== null && prev >= cur) {
      orderError = lineTable[i - 1].level + ' 的时间必须快于 ' + lineTable[i].level;
      break;
    }
  }

  return { lineTable, errors, orderError };
}

// 四态判定：逃课 / 未达标 / 达标 / 超线完成（快一档），另有 no_target
function judge(bestMs, lineTable, memberLine) {
  const effective = normalizeLine(memberLine).effective;
  const table = {};
  (lineTable || []).forEach((r) => {
    table[r.level] = r.ms === undefined ? null : r.ms;
  });

  const idx = TASK_LINES.indexOf(effective);
  const targetLevel = effective;
  const targetMs = table[targetLevel] === undefined ? null : table[targetLevel];
  const overLevel = idx > 0 ? TASK_LINES[idx - 1] : null;
  const overMs = overLevel && table[overLevel] !== undefined ? table[overLevel] : null;

  if (bestMs === null || bestMs === undefined) {
    return { status: 'absent', targetLevel, targetMs, overLevel, overMs };
  }
  if (targetMs === null) {
    return { status: 'no_target', targetLevel, targetMs, overLevel, overMs };
  }
  if (overMs !== null && bestMs <= overMs) {
    return { status: 'over', targetLevel, targetMs, overLevel, overMs };
  }
  if (bestMs <= targetMs) {
    return { status: 'passed', targetLevel, targetMs, overLevel, overMs };
  }
  return { status: 'missed', targetLevel, targetMs, overLevel, overMs };
}

function statusRank(status) {
  const order = { over: 0, passed: 1, missed: 2, pending: 3, no_target: 4, absent: 5 };
  return order[status] === undefined ? 9 : order[status];
}

// 结算：全量重算或只重算指定 openid
async function settleTask(taskId, onlyOpenids, operator) {
  const taskRes = await db.collection('disciple_tasks').doc(taskId).get();
  const task = taskRes.data;
  const roster = await fetchAll('disciples', { status: 'approved' });
  const records = await fetchAll('disciple_task_records', { taskId });

  const byOpenid = {};
  records.forEach((r) => {
    if (!byOpenid[r._openid]) byOpenid[r._openid] = [];
    byOpenid[r._openid].push(r);
  });

  const targets = (onlyOpenids && onlyOpenids.length)
    ? roster.filter((m) => onlyOpenids.indexOf(m._openid) >= 0)
    : roster;

  const results = targets.map((m) => {
    const list = byOpenid[m._openid] || [];
    const bestMs = list.length ? Math.min.apply(null, list.map((r) => r.scoreMs)) : null;
    const best = list.filter((r) => r.scoreMs === bestMs)[0];
    const j = judge(bestMs, task.lineTable, m.masterLine);
    return {
      taskId,
      _openid: m._openid,
      gameName: m.gameName || '',
      bestMs,
      bestText: best ? best.scoreText : '',
      targetLevel: j.targetLevel,
      targetMs: j.targetMs,
      status: j.status,
      recordCount: list.length,
      computedAt: Date.now(),
      computedBy: operator || ''
    };
  });

  if (!onlyOpenids || !onlyOpenids.length) {
    await db.collection('disciple_task_results').where({ taskId }).remove();
  }

  for (let i = 0; i < results.length; i += 10) {
    const batch = results.slice(i, i + 10);
    await Promise.all(batch.map((r) => {
      if (onlyOpenids && onlyOpenids.length) {
        return db.collection('disciple_task_results')
          .where({ taskId, _openid: r._openid })
          .get()
          .then((res) => {
            if (res.data && res.data.length) {
              return db.collection('disciple_task_results').doc(res.data[0]._id).update({ data: r });
            }
            return db.collection('disciple_task_results').add({ data: r });
          });
      }
      return db.collection('disciple_task_results').add({ data: r });
    }));
  }

  return results;
}


exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const payload = event || {};

  try {
    const caller = await getCaller(OPENID);
    if (!isManager(caller)) {
      return { success: false, error: '仅师傅或管理员可发布任务' };
    }

    if (!payload.mapName) {
      return { success: false, error: '请选择地图' };
    }

    const startAt = Number(payload.startAt);
    const endAt = Number(payload.endAt);
    if (!startAt || !endAt || endAt <= startAt) {
      return { success: false, error: '任务时间区间不合法' };
    }

    const built = buildLineTable(payload.lineTable);
    if (built.errors.length) {
      return { success: false, error: '时间格式不合法：' + built.errors.join('、') };
    }
    if (built.orderError) {
      return { success: false, error: built.orderError };
    }

    const doc = {
      title: String(payload.title || payload.mapName).trim(),
      mapId: payload.mapId || '',
      mapName: String(payload.mapName).trim(),
      difficulty: payload.difficulty || '',
      server: '国服',
      lineTable: built.lineTable,
      startAt,
      endAt,
      overRule: 'oneAbove',
      status: payload.status === 'draft' ? 'draft' : 'published',
      imported: false,
      updatedAt: Date.now()
    };

    if (payload.taskId) {
      await db.collection('disciple_tasks').doc(payload.taskId).update({ data: doc });
      return { success: true, taskId: payload.taskId, updated: true };
    }

    doc.createdBy = OPENID;
    doc.createdAt = Date.now();
    const res = await db.collection('disciple_tasks').add({ data: doc });
    return { success: true, taskId: res._id, created: true };
  } catch (err) {
    if (isMissingCollection(err)) return missingErr();
    return { success: false, error: err.message };
  }
};

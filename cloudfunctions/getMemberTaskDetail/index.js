// cloudfunctions/getMemberTaskDetail/index.js
// 主演徒弟：查看某人在某任务下的判定、记录与曲线数据（互相可见）
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

const TASK_LINES = ['国服记录', '强主', '主力', '一线', '二线', '三线', '娱乐'];

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

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function normalizeLine(raw) {
  if (!raw) return { effective: '娱乐', source: 'default' };
  const mapped = LINE_ALIAS[raw];
  if (mapped) return { effective: mapped, source: 'set' };
  return { effective: '娱乐', source: 'default' };
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

// 取某个时间点的定线：分线历史里 <= ts 的最后一条；没有历史则回退当前定线
function lineAt(history, fallbackLine, ts) {
  const list = Array.isArray(history) ? history : [];
  const at = typeof ts === 'number' ? ts : Date.now();
  let line = fallbackLine;
  list.forEach((h) => {
    if (!h || !h.line) return;
    const hAt = typeof h.at === 'number' ? h.at : new Date(h.at).getTime();
    if (!isNaN(hAt) && hAt <= at) line = h.line;
  });
  return line || fallbackLine;
}

function judge(bestMs, lineTable, memberLine) {
  const effective = normalizeLine(memberLine).effective;
  const table = {};
  (lineTable || []).forEach((r) => { table[r.level] = r.ms === undefined ? null : r.ms; });

  const idx = TASK_LINES.indexOf(effective);
  const targetLevel = effective;
  const targetMs = table[targetLevel] === undefined ? null : table[targetLevel];
  const overLevel = idx > 0 ? TASK_LINES[idx - 1] : null;
  const overMs = overLevel && table[overLevel] !== undefined ? table[overLevel] : null;

  if (bestMs === null || bestMs === undefined) return { status: 'absent', targetLevel, targetMs, overLevel, overMs };
  if (targetMs === null) return { status: 'no_target', targetLevel, targetMs, overLevel, overMs };
  if (overMs !== null && bestMs <= overMs) return { status: 'over', targetLevel, targetMs, overLevel, overMs };
  if (bestMs <= targetMs) return { status: 'passed', targetLevel, targetMs, overLevel, overMs };
  return { status: 'missed', targetLevel, targetMs, overLevel, overMs };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const payload = event || {};

  if (!payload.taskId || !payload.openid) {
    return { success: false, error: '缺少任务ID或成员' };
  }

  try {
    // 仅徒弟身份可查看（互相可见）
    const me = await db.collection('disciples').where({ _openid: OPENID }).get();
    if (!me.data.length) {
      return { success: false, error: '仅徒弟可查看任务成绩' };
    }

    const taskRes = await db.collection('disciple_tasks').doc(payload.taskId).get();
    const task = taskRes.data;
    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    const targetRes = await db.collection('disciples').where({ _openid: payload.openid }).get();
    const target = targetRes.data[0];
    if (!target) {
      return { success: false, error: '成员不存在' };
    }

    const records = await fetchAll('disciple_task_records', {
      taskId: payload.taskId,
      _openid: payload.openid
    });

    const bestMs = records.length ? Math.min.apply(null, records.map((r) => r.scoreMs)) : null;
    const best = records.filter((r) => r.scoreMs === bestMs)[0] || null;
    const targetLineRaw = lineAt(target.masterLineHistory, target.masterLine, task.endAt || Date.now());
    const j = judge(bestMs, task.lineTable, targetLineRaw);
    const settled = task.status === 'closed';
    const status = bestMs === null ? (settled ? 'absent' : 'pending') : j.status;

    records.sort((a, b) => {
      const ad = a.recordDate || '';
      const bd = b.recordDate || '';
      if (ad !== bd) return ad.localeCompare(bd);
      return (a.recordedAt || 0) - (b.recordedAt || 0);
    });

    return {
      success: true,
      member: {
        openid: target._openid,
        gameName: target.gameName || '',
        nickname: target.nickname || '',
        line: normalizeLine(targetLineRaw).effective,
        lineSource: normalizeLine(targetLineRaw).source
      },
      status,
      statusText: STATUS_TEXT[status] || '',
      bestText: best ? best.scoreText : '',
      bestMs,
      targetLevel: j.targetLevel,
      targetText: formatMs(j.targetMs),
      targetMs: j.targetMs,
      overLevel: j.overLevel,
      overText: formatMs(j.overMs),
      recordCount: records.length,
      records: records.map((r) => ({
        scoreText: r.scoreText,
        scoreMs: r.scoreMs,
        recordDate: r.recordDate || '',
        recordedAt: r.recordedAt || null
      }))
    };
  } catch (err) {
    if (isMissingCollection(err)) {
      return { success: false, needInitCollections: true, error: '数据集合还没创建，请先在云开发控制台建好任务相关集合' };
    }
    return { success: false, error: err.message };
  }
};

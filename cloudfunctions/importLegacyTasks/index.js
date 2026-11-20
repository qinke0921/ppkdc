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


// 历史数据导入：按批处理 legacy/import.json
// 用法：{ "cursor": 0, "batch": 5 } → 返回 nextCursor，继续调用直到 done:true
// 可加 "dryRun": true 只统计不写库
//
// ⚠️ 本函数【无鉴权】：云开发控制台的「云端测试」没有登录态，
//    getWXContext().OPENID 为空，基于身份的判断永远无法通过。
//    仅供开发期一次性使用，导入完成后请立即在控制台删除本云函数。
// data.json 未随函数上传时，require 会在冷启动阶段直接抛错，
// 控制台只会显示 -3 system error。这里改成可读的错误返回。
let legacyData = null;
try {
  legacyData = require('./data.json');
} catch (err) {
  legacyData = null;
}

function nameKey(s) {
  return String(s || '').trim().replace(/\s+/g, '');
}

exports.main = async (event) => {
  const payload = event || {};

  try {
    // 可选：先清空上一次导入的历史数据（只删 legacy 来源，不动新录入的成绩）
    let resetDone = false;
    if (payload.reset === true) {
      await db.collection('disciple_task_records').where({ source: 'legacy' }).remove();
      await db.collection('disciple_task_results').where({ computedBy: 'legacy-import' }).remove();
      await db.collection('disciple_tasks').where({ imported: true }).remove();
      resetDone = true;
    }

    const cursor = Math.max(0, Number(payload.cursor) || 0);
    const batch = Math.min(50, Math.max(1, Number(payload.batch) || 5));
    const dryRun = payload.dryRun === true;

    if (!legacyData) {
      return {
        success: false,
        error: 'data.json 没有随函数上传：请在开发者工具里对 importLegacyTasks 重新执行「上传并部署：云端安装依赖」'
      };
    }

    // data.json 是期数数组；兼容 { weeks: [...] } 结构
    const weeks = Array.isArray(legacyData) ? legacyData : (legacyData.weeks || []);
    const slice = weeks.slice(cursor, cursor + batch);

    // 地图库：名字 → mapId
    const maps = await fetchAll('map_data', {});
    const mapByName = {};
    maps.forEach((m) => {
      if (m && m.name) mapByName[nameKey(m.name)] = m;
    });

    // 现有徒弟：名字 → 账号
    const roster = await fetchAll('disciples', { status: 'approved' });
    const byName = {};
    const ambiguous = [];
    roster.forEach((m) => {
      const keys = [nameKey(m.gameName), nameKey(m.nickname)].filter(Boolean);
      keys.forEach((k) => {
        if (byName[k] && byName[k] !== m._openid) {
          ambiguous.push(k);
        } else {
          byName[k] = m._openid;
        }
      });
    });

    const stats = {
      weeks: 0,
      skippedTopics: [],
      members: 0,
      unmatchedNames: [],
      records: 0,
      skippedRecords: 0,
      results: 0
    };

    for (const week of slice) {
      // 幂等：已导入过的期直接跳过
      const exist = await db.collection('disciple_tasks').where({ legacyKey: week.legacyKey }).limit(1).get();
      if (exist.data && exist.data.length) {
        const prev = exist.data[0];
        if (!prev.importing) {
          // 已经完整导入过
          stats.skippedTopics.push(week.weekLabel);
          continue;
        }
        // 上次执行中断（超时等），清理半成品后重导
        await db.collection('disciple_task_records').where({ taskId: prev._id }).remove();
        await db.collection('disciple_task_results').where({ taskId: prev._id }).remove();
        await db.collection('disciple_tasks').doc(prev._id).remove();
      }

      if (dryRun) {
        stats.weeks += 1;
        week.members.forEach((m) => {
          if (!byName[nameKey(m.name)]) stats.unmatchedNames.push(m.name);
          else { stats.members += 1; stats.records += m.records.length; }
        });
        continue;
      }

      const mapDoc = mapByName[nameKey(week.mapName)] || null;

      const taskDoc = {
        legacyKey: week.legacyKey,
        title: '历史 · ' + week.mapName + ' · ' + week.weekLabel,
        mapId: mapDoc ? mapDoc._id : '',
        mapName: week.mapName,
        difficulty: week.difficulty || (mapDoc && mapDoc['难度']) || '',
        server: '国服',
        lineTable: week.lineTable,
        startAt: week.startAt,
        endAt: week.endAt,
        overRule: 'oneAbove',
        status: 'draft',
        importing: true,
        imported: true,
        sourceNote: '徒弟作业成绩记录.xlsx ' + week.weekLabel,
        createdBy: 'legacy-import',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const added = await db.collection('disciple_tasks').add({ data: taskDoc });
      const taskId = added._id;

      const results = [];
      const recordDocs = [];

      for (const m of week.members) {
        const openid = byName[nameKey(m.name)];
        if (!openid) {
          stats.unmatchedNames.push(m.name);
          continue;
        }

        const valid = m.records.filter((r) => typeof r.ms === 'number' && r.ms > 0);
        stats.skippedRecords += m.records.length - valid.length;

        // 匹配上的成员都要有判定：没交成绩的就是「逃课」
        stats.members += 1;

        if (!valid.length) {
          const member0 = roster.filter((x) => x._openid === openid)[0] || {};
          const j0 = judge(null, week.lineTable, member0.masterLine);
          results.push({
            taskId,
            _openid: openid,
            gameName: m.name,
            bestMs: null,
            bestText: '',
            targetLevel: j0.targetLevel,
            targetMs: j0.targetMs,
            status: 'absent',
            recordCount: 0,
            legacyK: m.legacyK || '',
            computedAt: Date.now(),
            computedBy: 'legacy-import'
          });
          continue;
        }

        stats.records += valid.length;

        valid.forEach((r) => {
          recordDocs.push({
            _openid: openid,
            taskId,
            gameName: m.name,
            scoreText: r.text,
            scoreMs: r.ms,
            recordDate: r.date,
            recordedAt: new Date(r.date + 'T12:00:00').getTime(),
            source: 'legacy',
            recordedBy: 'legacy-import',
            legacyK: m.legacyK || ''
          });
        });

        const bestMs = Math.min.apply(null, valid.map((r) => r.ms));
        const best = valid.filter((r) => r.ms === bestMs)[0];
        const member = roster.filter((x) => x._openid === openid)[0] || {};
        const j = judge(bestMs, week.lineTable, member.masterLine);

        results.push({
          taskId,
          _openid: openid,
          gameName: m.name,
          bestMs,
          bestText: best.text,
          targetLevel: j.targetLevel,
          targetMs: j.targetMs,
          status: j.status,
          recordCount: valid.length,
          legacyK: m.legacyK || '',
          computedAt: Date.now(),
          computedBy: 'legacy-import'
        });
      }

      // 分批写入
      for (let i = 0; i < recordDocs.length; i += 20) {
        await Promise.all(recordDocs.slice(i, i + 20).map((doc) =>
          db.collection('disciple_task_records').add({ data: doc })));
      }
      for (let i = 0; i < results.length; i += 20) {
        await Promise.all(results.slice(i, i + 20).map((doc) =>
          db.collection('disciple_task_results').add({ data: doc })));
      }
      stats.results += results.length;

      const summary = { total: results.length, over: 0, passed: 0, missed: 0, absent: 0, noTarget: 0 };
      results.forEach((r) => {
        if (r.status === 'over') summary.over++;
        else if (r.status === 'passed') summary.passed++;
        else if (r.status === 'missed') summary.missed++;
        else if (r.status === 'no_target') summary.noTarget++;
        else summary.absent++;
      });

      await db.collection('disciple_tasks').doc(taskId).update({
        data: { summary, status: 'closed', importing: false, updatedAt: Date.now() }
      });
      stats.weeks += 1;
    }

    // 去重统计
    const unmatchedUnique = [];
    stats.unmatchedNames.forEach((n) => {
      if (unmatchedUnique.indexOf(n) < 0) unmatchedUnique.push(n);
    });

    return {
      success: true,
      dryRun,
      reset: resetDone,
      nextCursor: cursor + slice.length,
      done: cursor + slice.length >= weeks.length,
      total: weeks.length,
      stats: {
        weeks: stats.weeks,
        members: stats.members,
        records: stats.records,
        skippedRecords: stats.skippedRecords,
        results: stats.results,
        skippedTopics: stats.skippedTopics,
        unmatched: unmatchedUnique
      },
      ambiguousNames: Array.from(new Set(ambiguous))
    };
  } catch (err) {
    if (isMissingCollection(err)) return missingErr();
    return { success: false, error: err.message };
  }
};

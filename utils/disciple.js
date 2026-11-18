// utils/disciple.js - 主演徒弟模块公共工具

// 徒弟定线只有 6 档（国服记录仅作为任务里的超线天花板，不作为定线）
const DISCIPLE_LINES = ['强主', '主力', '一线', '二线', '三线', '娱乐'];

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * 时间字符串 → 毫秒
 * 支持 1:27.99 / 1.27.99 / 1:27（不带厘秒）
 * 非法值（秒 ≥ 60 或厘秒 ≥ 100）返回 NaN，用于挡掉 1:28:99 这类脏数据
 */
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

/** 毫秒 → 1:27.99 */
function formatMs(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '';
  const totalCs = Math.round(ms / 10);
  const min = Math.floor(totalCs / 6000);
  const sec = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return min + ':' + pad2(sec) + '.' + pad2(cs);
}

/** 时间戳 / Date / 字符串 → YYYY-MM-DD */
function formatTime(value) {
  if (value === null || value === undefined || value === '') return '未知';

  let d = null;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'number') {
    d = new Date(value);
  } else if (typeof value === 'string') {
    const ts = parseInt(value, 10);
    d = isNaN(ts) ? new Date(value) : new Date(ts);
  } else if (value && value.$date) {
    const v = value.$date;
    if (typeof v === 'number') d = new Date(v);
    else if (v && v.$numberLong) d = new Date(parseInt(v.$numberLong, 10));
    else if (typeof v === 'string') d = new Date(parseInt(v, 10));
  }

  if (!d || isNaN(d.getTime())) return '未知';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 定线排序权重：越靠前越强，未定线排最后 */
function lineRank(line) {
  const idx = DISCIPLE_LINES.indexOf(line);
  return idx < 0 ? 99 : idx;
}

module.exports = {
  DISCIPLE_LINES,
  timeToMs,
  formatMs,
  formatTime,
  lineRank
};

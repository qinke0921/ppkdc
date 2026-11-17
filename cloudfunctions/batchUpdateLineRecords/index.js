// cloudfunctions/batchUpdateLineRecords/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

const LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'];

function timeToMs(timeStr) {
  if (!timeStr) return Infinity;
  const parts = timeStr.split('.');
  if (parts.length !== 3) return Infinity;
  const minutes = parseInt(parts[0]) || 0;
  const seconds = parseInt(parts[1]) || 0;
  let msStr = parts[2].padEnd(3, '0');
  const ms = parseInt(msStr) || 0;
  return minutes * 60000 + seconds * 1000 + ms;
}

function calculateOverallLine(records) {
  if (records.length === 0) return '';
  const counts = {};
  records.forEach(r => { counts[r.line] = (counts[r.line] || 0) + 1; });
  let maxCount = 0, modeLine = '';
  Object.keys(counts).forEach(line => { if (counts[line] > maxCount) { maxCount = counts[line]; modeLine = line; } });
  const sortedRecords = [...records].sort((a, b) => LINE_LEVELS.indexOf(a.line) - LINE_LEVELS.indexOf(b.line));
  const medianLine = sortedRecords[Math.floor(sortedRecords.length / 2)].line;
  const modeIndex = LINE_LEVELS.indexOf(modeLine);
  const medianIndex = LINE_LEVELS.indexOf(medianLine);
  return LINE_LEVELS[Math.min(modeIndex, medianIndex)] || '';
}

exports.main = async (event, context) => {
  try {
    // 获取所有地图数据
    const mapCountRes = await db.collection('map_data').count();
    const mapTotal = mapCountRes.total;
    
    const mapData = [];
    let mapSkip = 0;
    const BATCH_SIZE = 100;
    
    while (mapSkip < mapTotal) {
      const mapRes = await db.collection('map_data')
        .skip(mapSkip)
        .limit(BATCH_SIZE)
        .get();
      mapData.push(...mapRes.data);
      mapSkip += BATCH_SIZE;
    }
    
    console.log('地图总数:', mapData.length);
    
    // 获取所有分线记录
    const recordsCountRes = await db.collection('line_records').count();
    const recordsTotal = recordsCountRes.total;
    
    const allRecords = [];
    let recordsSkip = 0;
    
    while (recordsSkip < recordsTotal) {
      const recordsRes = await db.collection('line_records')
        .skip(recordsSkip)
        .limit(BATCH_SIZE)
        .get();
      allRecords.push(...recordsRes.data);
      recordsSkip += BATCH_SIZE;
    }
    
    console.log('记录总数:', allRecords.length);
    
    // 批量更新分线
    let updatedCount = 0;
    const updatedList = [];
    
    for (const r of allRecords) {
      const m = mapData.find(m => m.name === r.map);
      if (!m) continue;
      
      const u = timeToMs(r.time);
      const correctLine = LINE_LEVELS.find((lv) => !m[lv] || u < timeToMs(m[lv])) || LINE_LEVELS[13];
      
      if (correctLine !== r.line) {
        await db.collection('line_records').doc(r._id).update({
          data: { line: correctLine }
        });
        updatedCount++;
        updatedList.push({ 
          map: r.map, 
          oldLine: r.line, 
          newLine: correctLine, 
          time: r.time,
          openid: r._openid 
        });
      }
    }
    
    console.log('更新了 ' + updatedCount + ' 条分线记录');
    
    // 更新车队成员的 overallLine
    const openids = [...new Set(allRecords.map(r => r._openid))];
    console.log('需要更新的用户数:', openids.length);
    
    let memberUpdatedCount = 0;
    const memberUpdatedList = [];
    
    for (const openid of openids) {
      // 获取该用户的所有记录
      const userRecords = allRecords.filter(r => r._openid === openid);
      const correctOverallLine = calculateOverallLine(userRecords);
      
      if (!correctOverallLine) continue;
      
      // 检查用户是否在车队成员列表中
      const memberRes = await db.collection('members')
        .where({ _openid: openid, status: 'approved' })
        .get();
      
      if (memberRes.data.length > 0) {
        const member = memberRes.data[0];
        if (member.overallLine !== correctOverallLine) {
          await db.collection('members').doc(member._id).update({
            data: { overallLine: correctOverallLine }
          });
          memberUpdatedCount++;
          memberUpdatedList.push({ 
            openid: openid, 
            oldOverallLine: member.overallLine, 
            newOverallLine: correctOverallLine 
          });
        }
      }
    }
    
    console.log('更新了 ' + memberUpdatedCount + ' 个车队成员的综合水平');
    
    return {
      success: true,
      total: recordsTotal,
      updatedCount: updatedCount,
      updatedList: updatedList,
      memberUpdatedCount: memberUpdatedCount,
      memberUpdatedList: memberUpdatedList
    };
  } catch (err) {
    console.error('批量更新失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};
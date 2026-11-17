// cloudfunctions/updateFenxian/index.js
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
  if (!records || records.length === 0) return null;
  
  const lineCounts = {};
  records.forEach(r => {
    const line = r.line;
    const idx = LINE_LEVELS.indexOf(line);
    if (idx !== -1) {
      lineCounts[line] = (lineCounts[line] || 0) + 1;
    }
  });
  
  let maxCount = 0;
  let bestLine = null;
  Object.entries(lineCounts).forEach(([line, count]) => {
    if (count > maxCount) {
      maxCount = count;
      bestLine = line;
    }
  });
  
  return bestLine;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const result = [];
  
  // 跳过第一行表头
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',');
    if (values.length >= 16) {
      const mapData = {
        difficulty: values[0],
        name: values[1]
      };
      // 添加各分线时间
      for (let j = 0; j < LINE_LEVELS.length; j++) {
        mapData[LINE_LEVELS[j]] = values[j + 2] || '';
      }
      result.push(mapData);
    }
  }
  return result;
}

exports.main = async (event, context) => {
  const { csv } = event;
  
  console.log('开始更新分线数据');
  
  if (!csv || typeof csv !== 'string') {
    return {
      success: false,
      error: '请提供 csv 参数，内容为分线CSV文本'
    };
  }
  
  try {
    const maps = parseCSV(csv);
    console.log('解析得到', maps.length, '条地图数据');
    
    if (maps.length === 0) {
      return {
        success: false,
        error: 'CSV解析失败，请检查格式'
      };
    }
    
    const BATCH_SIZE = 20;
    
    // 获取现有地图数据用于比对
    const mapDataList = [];
    let mapSkip = 0;
    while (true) {
      const mapRes = await db.collection('map_data')
        .skip(mapSkip)
        .limit(BATCH_SIZE)
        .get();
      mapDataList.push(...mapRes.data);
      mapSkip += BATCH_SIZE;
      if (mapRes.data.length < BATCH_SIZE) break;
    }
    
    // 清空并重新导入 map_data
    await db.collection('map_data').where({
      _id: _.neq(null)
    }).remove();
    
    // 批量插入新地图数据
    for (let i = 0; i < maps.length; i += BATCH_SIZE) {
      const batch = maps.slice(i, i + BATCH_SIZE);
      const promises = batch.map(map => 
        db.collection('map_data').add({ data: map })
      );
      await Promise.all(promises);
    }
    
    console.log('地图数据导入完成');
    
    // 获取所有分线记录
    const allRecords = [];
    let recordsSkip = 0;
    while (true) {
      const recordsRes = await db.collection('line_records')
        .skip(recordsSkip)
        .limit(BATCH_SIZE)
        .get();
      allRecords.push(...recordsRes.data);
      recordsSkip += BATCH_SIZE;
      if (recordsRes.data.length < BATCH_SIZE) break;
    }
    
    console.log('开始更新分线记录，记录数:', allRecords.length);
    
    // 批量更新分线
    let updatedCount = 0;
    const updatedList = [];
    
    for (const r of allRecords) {
      const m = mapDataList.find(m => m.name === r.map);
      if (!m) continue;
      
      const u = timeToMs(r.time);
      const correctLine = LINE_LEVELS.find((lv) => !m[lv] || u < timeToMs(m[lv])) || LINE_LEVELS[13];
      
      if (correctLine !== r.line) {
        await db.collection('line_records').doc(r._id).update({
          data: { line: correctLine }
        });
        updatedCount++;
        if (updatedList.length < 20) {
          updatedList.push({ map: r.map, time: r.time, oldLine: r.line, newLine: correctLine });
        }
      }
    }
    
    console.log('分线记录更新完成:', updatedCount);
    
    // 更新车队成员的 overallLine
    const openids = [...new Set(allRecords.map(r => r._openid))];
    let memberUpdatedCount = 0;
    const memberUpdatedList = [];
    
    for (const openid of openids) {
      const userRecords = allRecords.filter(r => r._openid === openid);
      const correctOverallLine = calculateOverallLine(userRecords);
      
      if (!correctOverallLine) continue;
      
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
          if (memberUpdatedList.length < 20) {
            memberUpdatedList.push({ name: member.name, oldLine: member.overallLine, newLine: correctOverallLine });
          }
        }
      }
    }
    
    console.log('成员综合水平更新完成:', memberUpdatedCount);
    
    return {
      success: true,
      total: maps.length,
      lineUpdated: updatedCount,
      updatedList: updatedList,
      memberUpdated: memberUpdatedCount,
      memberUpdatedList: memberUpdatedList,
      message: `成功导入 ${maps.length} 张地图，更新 ${updatedCount} 条分线记录，${memberUpdatedCount} 个成员综合水平`
    };
  } catch (err) {
    console.error('更新失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};

// cloudfunctions/getAllMaps/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    // 获取总数
    const countRes = await db.collection('map_data').count();
    const total = countRes.total;
    
    // 分批获取所有地图数据
    const BATCH_SIZE = 100;
    let allData = [];
    let skip = 0;
    
    while (skip < total) {
      const res = await db.collection('map_data')
        .skip(skip)
        .limit(BATCH_SIZE)
        .get();
      
      allData = allData.concat(res.data);
      skip += BATCH_SIZE;
    }
    
    return {
      success: true,
      total: total,
      maps: allData
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};
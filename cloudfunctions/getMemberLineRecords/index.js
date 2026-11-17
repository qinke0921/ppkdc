// cloudfunctions/getMemberLineRecords/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event, context) => {
  const openid = event.openid;
  
  if (!openid) {
    return {
      success: false,
      error: '缺少 openid 参数'
    };
  }
  
  try {
    // 获取该成员所有记录
    const res = await db.collection('line_records')
      .where({ _openid: openid })
      .get();
    
    return {
      success: true,
      records: res.data,
      total: res.data.length
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};
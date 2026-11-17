// cloudfunctions/getMyLineRecords/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  try {
    // 获取该用户所有记录（用云函数端无限制）
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
// cloudfunctions/updateExchange/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event, context) => {
  const { exchangeId, status, remark } = event;
  
  if (!exchangeId) {
    return { success: false, error: '缺少exchangeId' };
  }
  
  try {
    await db.collection('exchange').doc(exchangeId).update({
      data: {
        status: status || '待报名',
        remark: remark || ''
      }
    });
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
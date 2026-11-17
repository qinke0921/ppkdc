// cloudfunctions/getOpenId/index.js
const cloud = require('wx-server-sdk');
cloud.init();

exports.main = async (event, context) => {
  // 通过 cloudContext 获取用户信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID || 'unknown',
    appid: wxContext.APPID || 'unknown'
  };
};

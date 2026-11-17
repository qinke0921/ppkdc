// cloudfunctions/sendNotification/index.js
const cloud = require('wx-server-sdk');
cloud.init();

// 订阅消息模板ID
const TEMPLATE_ID = 'C64DulIcGA-JUss55uiHEUmY_G8J0YE2ET8v1mG8_Bo';

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { competitionId, competitionName, type, openids } = event;

  if (!openids || openids.length === 0) {
    return { success: true, message: '没有需要通知的用户' };
  }

  try {
    // 发送订阅消息
    const promises = openids.map(openid => {
      return cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: TEMPLATE_ID,
        page: `/pages/competition/competition?id=${competitionId}`,
        data: {
          thing1: {
            value: '比赛已开始'
          },
          thing2: {
            value: competitionName
          },
          thing3: {
            value: '点击查看详情'
          }
        }
      });
    });

    const results = await Promise.allSettled(promises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;
    
    return {
      success: true,
      total: openids.length,
      successCount,
      failCount
    };
  } catch (err) {
    console.error('发送订阅消息失败', err);
    return {
      success: false,
      error: err.message
    };
  }
};

// cloudfunctions/approveMember/index.js
const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { applicationId } = event;

  try {
    // 获取申请记录
    const appRes = await db.collection('memberApplications').doc(applicationId).get();
    const app = appRes.data;

    // 直接在云函数中插入记录，手动设置 _openid 为申请人的
    const newMemberId = await db.collection('members').add({
      data: {
        _openid: app._openid, // 使用申请人原本的 openid
        nickname: app.nickname,
        gameName: app.gameName,
        gameId: app.gameId,
        statement: app.statement || '',
        status: 'approved',
        role: 'member',
        joinedAt: Date.now() // 存时间戳数字
      }
    });

    // 更新申请状态
    await db.collection('memberApplications').doc(applicationId).update({
      data: { status: 'approved' }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
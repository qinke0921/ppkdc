// cloudfunctions/claimDiscipleAdmin/index.js
// 主演徒弟：一次性初始化管理员
// 安全约束：仅当 disciples 集合内不存在任何 admin 时才可用；一经创建即永久失效。
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, error: '未获取到用户身份' };
  }

  try {
    const adminRes = await db.collection('disciples').where({ role: 'admin' }).count();
    if (adminRes.total > 0) {
      return { success: false, error: '管理员已存在，初始化入口已关闭' };
    }

    // 已有自己的档案则只提升角色，避免重复建档
    const mine = await db.collection('disciples').where({ _openid: OPENID }).get();
    if (mine.data.length > 0) {
      await db.collection('disciples').doc(mine.data[0]._id).update({
        data: { role: 'admin', status: 'approved', updatedAt: Date.now() }
      });
      return { success: true, message: '已将你设为主演徒弟管理员' };
    }

    const nickname = (event && event.nickname) ? String(event.nickname).trim() : '主演';
    const gameName = (event && event.gameName) ? String(event.gameName).trim() : '';

    await db.collection('disciples').add({
      data: {
        _openid: OPENID,
        nickname: nickname || '主演',
        gameName: gameName,
        gameId: '',
        statement: '',
        masterLine: '',
        status: 'approved',
        role: 'admin',
        joinedAt: Date.now(),
        createdAt: Date.now(),
        createdBy: OPENID,
        isFounder: true
      }
    });

    return { success: true, message: '已创建管理员身份' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

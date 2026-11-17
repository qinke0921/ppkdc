// cloudfunctions/claimDiscipleMaster/index.js
// 主演徒弟：一次性初始化「师傅」（master）
// 安全约束：仅当 disciples 集合内不存在任何 master 时才可用；一经创建即永久失效。
// 注意：admin（平台协助）不由此函数创建，由人工在云开发控制台改 role 字段任命。
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, error: '未获取到用户身份' };
  }

  try {
    const masterRes = await db.collection('disciples').where({ role: 'master' }).count();
    if (masterRes.total > 0) {
      return { success: false, error: '师傅已存在，初始化入口已关闭' };
    }

    // 已有自己的档案则只提升角色，避免重复建档
    const mine = await db.collection('disciples').where({ _openid: OPENID }).get();
    if (mine.data.length > 0) {
      await db.collection('disciples').doc(mine.data[0]._id).update({
        data: { role: 'master', status: 'approved', updatedAt: Date.now() }
      });
      return { success: true, message: '已将你设为师傅（master）' };
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
        role: 'master',
        joinedAt: Date.now(),
        createdAt: Date.now(),
        createdBy: OPENID,
        isFounder: true
      }
    });

    return { success: true, message: '已创建师傅身份' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

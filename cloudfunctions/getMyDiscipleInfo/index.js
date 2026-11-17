// cloudfunctions/getMyDiscipleInfo/index.js
// 主演徒弟：查询当前用户的徒弟身份、总人数、管理员待审批列表
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, error: '未获取到用户身份' };
  }

  try {
    // 1. 查自己的徒弟档案（只要 approved，本模块没有离队状态）
    const myRes = await db.collection('disciples')
      .where({ _openid: OPENID, status: 'approved' })
      .get();

    const raw = myRes.data[0] || null;
    const disciple = raw ? {
      _id: raw._id,
      _openid: raw._openid,
      nickname: raw.nickname || '',
      gameName: raw.gameName || '',
      gameId: raw.gameId || '',
      statement: raw.statement || '',
      masterLine: raw.masterLine || '',
      role: raw.role || 'member',
      joinedAt: raw.joinedAt || null
    } : null;

    // 2. 徒弟总人数
    const countRes = await db.collection('disciples')
      .where({ status: 'approved' })
      .count();

    // 3. 是否已有管理员（用于首次初始化判断）
    const adminRes = await db.collection('disciples')
      .where({ role: 'admin' })
      .count();

    // 4. 管理员才返回待审批列表（走云函数，不依赖集合权限）
    let pendingApplications = [];
    if (disciple && disciple.role === 'admin') {
      const appRes = await db.collection('discipleApplications')
        .where({ status: 'pending' })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      pendingApplications = appRes.data.map((a) => ({
        _id: a._id,
        nickname: a.nickname || '',
        gameName: a.gameName || '',
        gameId: a.gameId || '',
        statement: a.statement || '',
        createdAt: a.createdAt || null,
        pickedLine: ''
      }));
    }

    return {
      success: true,
      openid: OPENID,
      isDisciple: !!disciple,
      disciple,
      discipleCount: countRes.total,
      hasAdmin: adminRes.total > 0,
      canClaimAdmin: adminRes.total === 0,
      pendingApplications
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

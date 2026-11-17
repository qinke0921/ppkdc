// cloudfunctions/getMyMemberInfo/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event, context) => {
  const openid = event.openid;
  
  if (!openid) {
    return {
      success: false,
      error: '缺少 openid'
    };
  }
  
  try {
    // 1. 直接根据 openid 查询自己的成员信息（必须是 approved 状态才能使用功能）
    const memberRes = await db.collection('members')
      .where({
        _openid: openid,
        status: 'approved'
      })
      .get();
    
    const rawMember = memberRes.data[0] || null;
    
    // 显式构造返回对象，包含所有字段
    const member = rawMember ? {
      _id: rawMember._id,
      _openid: rawMember._openid,
      nickname: rawMember.nickname || '',
      gameName: rawMember.gameName || '',
      gameId: rawMember.gameId || '',
      statement: rawMember.statement || '',
      overallLine: rawMember.overallLine || '',
      role: rawMember.role || 'member',
      joinedAt: rawMember.joinedAt || null
    } : null;
    
    // 2. 获取车队总人数
    const countRes = await db.collection('members')
      .where({ status: 'approved' })
      .count();
    
    return {
      success: true,
      isMember: !!member,
      member: member,
      memberCount: countRes.total
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};
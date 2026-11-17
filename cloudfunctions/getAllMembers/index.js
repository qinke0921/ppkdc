// cloudfunctions/getAllMembers/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    // 获取所有已通过的车队成员
    const countRes = await db.collection('members')
      .where({ status: 'approved' })
      .count();
    const total = countRes.total;
    
    // 分批获取所有成员
    const BATCH_SIZE = 100;
    let allMembers = [];
    let skip = 0;
    
    while (skip < total) {
      const res = await db.collection('members')
        .where({ status: 'approved' })
        .skip(skip)
        .limit(BATCH_SIZE)
        .orderBy('gameName', 'asc')
        .get();
      
      allMembers = allMembers.concat(res.data);
      skip += BATCH_SIZE;
    }
    
    // 只返回需要的字段
    const members = allMembers.map(m => ({
      _id: m._id,
      _openid: m._openid,
      gameName: m.gameName,
      gameId: m.gameId || '',
      nickname: m.nickname || '',
      statement: m.statement || '',
      overallLine: m.overallLine || '',
      role: m.role || 'member',
      joinedAt: m.joinedAt || null
    }));
    
    return {
      success: true,
      total: members.length,
      members: members
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};
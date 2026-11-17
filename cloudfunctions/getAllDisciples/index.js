// cloudfunctions/getAllDisciples/index.js
// 主演徒弟：分批读取全部徒弟（规避小程序端单次 20 条上限）
// 师傅（role=master）单独返回，不计入徒弟名单与人数
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const BATCH_SIZE = 100;

function pick(d) {
  return {
    _id: d._id,
    _openid: d._openid,
    nickname: d.nickname || '',
    gameName: d.gameName || '',
    gameId: d.gameId || '',
    statement: d.statement || '',
    masterLine: d.masterLine || '',
    role: d.role || 'member',
    joinedAt: d.joinedAt || null
  };
}

exports.main = async () => {
  try {
    const countRes = await db.collection('disciples')
      .where({ status: 'approved' })
      .count();
    const total = countRes.total;

    let all = [];
    let skip = 0;

    while (skip < total) {
      const res = await db.collection('disciples')
        .where({ status: 'approved' })
        .orderBy('joinedAt', 'asc')
        .skip(skip)
        .limit(BATCH_SIZE)
        .get();

      all = all.concat(res.data);
      if (res.data.length === 0) break;
      skip += res.data.length;
    }

    const mapped = all.map(pick);
    const master = mapped.filter((d) => d.role === 'master')[0] || null;
    const disciples = mapped.filter((d) => d.role !== 'master');

    return {
      success: true,
      total: disciples.length,
      disciples,
      master
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

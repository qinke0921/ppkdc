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
    masterLineHistory: Array.isArray(d.masterLineHistory) ? d.masterLineHistory : [],
    role: d.role || 'member',
    joinedAt: d.joinedAt || null
  };
}

// 集合不存在时（云开发错误码 -502005）给出可操作的提示，而不是抛出英文技术错误
function isMissingCollection(err) {
  const code = err && err.errCode;
  const msg = (err && err.message) || '';
  return code === -502005 || /collection not exist|COLLECTION_NOT_EXIST|Db or Table not exist/i.test(msg);
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
    if (isMissingCollection(err)) {
      return {
        success: false,
        needInitCollections: true,
        error: '数据集合还没创建：请在云开发控制台新建 disciples 与 discipleApplications 两个集合（权限用默认）'
      };
    }
    return { success: false, error: err.message };
  }
};

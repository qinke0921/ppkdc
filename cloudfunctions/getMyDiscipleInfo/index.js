// cloudfunctions/getMyDiscipleInfo/index.js
// 主演徒弟：查询当前用户身份（师傅 / 管理员 / 徒弟）、徒弟总数、可管理人待审批列表
//
// 角色模型（互斥，存于 disciples.role）：
//   master —— 师傅（主演），全平台唯一，拥有全部权限
//   admin  —— 平台协助管理，可审批、可改定线、可维护资料，但不是师傅本人
//   member —— 普通徒弟，只能改自己的基础资料
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

// 集合不存在时（云开发错误码 -502005）给出可操作的提示，而不是抛出英文技术错误
function isMissingCollection(err) {
  const code = err && err.errCode;
  const msg = (err && err.message) || '';
  return code === -502005 || /collection not exist|COLLECTION_NOT_EXIST|Db or Table not exist/i.test(msg);
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, error: '未获取到用户身份' };
  }

  try {
    // 1. 查自己的档案（本模块没有离队状态，只要 approved）
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

    // 2. 当前师傅（主演）—— 全平台唯一
    const masterRes = await db.collection('disciples')
      .where({ role: 'master' })
      .limit(1)
      .get();

    const masterRaw = masterRes.data[0] || null;
    const master = masterRaw ? {
      _id: masterRaw._id,
      _openid: masterRaw._openid,
      nickname: masterRaw.nickname || '',
      gameName: masterRaw.gameName || '',
      statement: masterRaw.statement || ''
    } : null;

    // 3. 徒弟总数（不含师傅本人）
    const countRes = await db.collection('disciples')
      .where({ status: 'approved', role: _.neq('master') })
      .count();

    // 4. 权限判定：师傅与管理员都能管，但只有 master 是「师傅」
    const isMaster = !!disciple && disciple.role === 'master';
    const isAdmin = !!disciple && disciple.role === 'admin';
    const canManage = isMaster || isAdmin;

    // 5. 只有可管理人才能看待审批（走云函数，不依赖集合权限）
    let pendingApplications = [];
    if (canManage) {
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
      isMaster,
      isAdmin,
      canManage,
      master,
      discipleCount: countRes.total,
      hasMaster: !!master,
      canClaimMaster: !master,
      pendingApplications
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

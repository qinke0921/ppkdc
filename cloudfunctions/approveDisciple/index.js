// cloudfunctions/approveDisciple/index.js
// 主演徒弟：管理员批准拜师申请，写入 disciples 并可同时指定「师傅定线」
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

const LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'];

async function getCaller(openid) {
  const res = await db.collection('disciples').where({ _openid: openid }).get();
  return res.data[0] || null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { applicationId, masterLine } = event;

  if (!applicationId) {
    return { success: false, error: '缺少申请ID' };
  }

  try {
    // 1. 仅管理员可审批
    const caller = await getCaller(OPENID);
    if (!caller || caller.role !== 'admin') {
      return { success: false, error: '仅管理员可审批' };
    }

    // 2. 定线校验（可为空，空表示稍后再录）
    let line = '';
    if (masterLine) {
      if (LINE_LEVELS.indexOf(masterLine) === -1) {
        return { success: false, error: '定线档位不合法' };
      }
      line = masterLine;
    }

    // 3. 读取申请
    const appRes = await db.collection('discipleApplications').doc(applicationId).get();
    const app = appRes.data;
    if (!app) {
      return { success: false, error: '申请不存在' };
    }
    if (app.status !== 'pending') {
      return { success: false, error: '该申请已被处理' };
    }

    // 4. 防止同一 openid 重复入册
    const exist = await db.collection('disciples').where({ _openid: app._openid }).get();
    if (exist.data.length > 0) {
      await db.collection('discipleApplications').doc(applicationId).update({
        data: { status: 'approved', reviewedAt: Date.now(), reviewedBy: OPENID }
      });
      return { success: true, message: '该用户已是徒弟，已清理申请' };
    }

    // 5. 写入徒弟档案（云函数 add 不会自动带 _openid，必须手动写入申请人的）
    await db.collection('disciples').add({
      data: {
        _openid: app._openid,
        nickname: app.nickname || '',
        gameName: app.gameName || '',
        gameId: app.gameId || '',
        statement: app.statement || '',
        masterLine: line,
        status: 'approved',
        role: 'member',
        joinedAt: Date.now(),
        createdAt: Date.now(),
        createdBy: OPENID
      }
    });

    // 6. 更新申请状态
    await db.collection('discipleApplications').doc(applicationId).update({
      data: { status: 'approved', reviewedAt: Date.now(), reviewedBy: OPENID }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

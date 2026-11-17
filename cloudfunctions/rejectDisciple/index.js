// cloudfunctions/rejectDisciple/index.js
// 主演徒弟：师傅或管理员拒绝拜师申请
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

async function getCaller(openid) {
  const res = await db.collection('disciples').where({ _openid: openid }).get();
  return res.data[0] || null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { applicationId } = event;

  if (!applicationId) {
    return { success: false, error: '缺少申请ID' };
  }

  try {
    const caller = await getCaller(OPENID);
    if (!caller || (caller.role !== 'master' && caller.role !== 'admin')) {
      return { success: false, error: '仅师傅或管理员可审批' };
    }

    const appRes = await db.collection('discipleApplications').doc(applicationId).get();
    const app = appRes.data;
    if (!app) {
      return { success: false, error: '申请不存在' };
    }
    if (app.status !== 'pending') {
      return { success: false, error: '该申请已被处理' };
    }

    await db.collection('discipleApplications').doc(applicationId).update({
      data: { status: 'rejected', reviewedAt: Date.now(), reviewedBy: OPENID }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

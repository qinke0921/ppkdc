// cloudfunctions/updateMemberStatus/index.js
const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  const { memberId, status } = event;

  try {
    await db.collection('members').doc(memberId).update({
      data: { status: status }
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
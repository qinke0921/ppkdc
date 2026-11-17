// cloudfunctions/deleteRegistration/index.js
const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  const { registrationId } = event;

  try {
    await db.collection('exchange_registrations').doc(registrationId).remove();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
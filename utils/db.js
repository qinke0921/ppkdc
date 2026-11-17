/**
 * 分批拉取云数据库记录（规避单次 get 默认 20 条上限）
 */
const BATCH_SIZE = 100;

async function fetchAll(collectionName, where = {}, orderBy = null) {
  const db = wx.cloud.database();
  const collection = db.collection(collectionName);
  const countRes = await collection.where(where).count();
  const total = countRes.total;
  let data = [];
  let skip = 0;

  while (skip < total) {
    let query = collection.where(where);
    if (orderBy && orderBy.field) {
      query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
    }
    const res = await query.skip(skip).limit(BATCH_SIZE).get();
    data = data.concat(res.data);
    skip += res.data.length;
    if (res.data.length === 0) break;
  }

  return data;
}

async function deleteTeamActivityCascade(activityId) {
  const db = wx.cloud.database();
  const participants = await fetchAll('team_activity_participants', { activityId });
  const prizes = await fetchAll('team_activity_prizes', { activityId });

  for (const p of participants) {
    await db.collection('team_activity_participants').doc(p._id).remove();
  }
  for (const p of prizes) {
    await db.collection('team_activity_prizes').doc(p._id).remove();
  }
  await db.collection('team_activities').doc(activityId).remove();
}

module.exports = {
  BATCH_SIZE,
  fetchAll,
  deleteTeamActivityCascade
};

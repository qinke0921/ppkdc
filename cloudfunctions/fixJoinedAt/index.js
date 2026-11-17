// cloudfunctions/fixJoinedAt/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 获取所有成员
    const countRes = await db.collection('members').count();
    const total = countRes.total;
    
    let fixed = 0;
    const BATCH_SIZE = 100;
    let skip = 0;
    
    while (skip < total) {
      const res = await db.collection('members')
        .skip(skip)
        .limit(BATCH_SIZE)
        .get();
      
      for (const m of res.data) {
        // 如果 joinedAt 是对象（云数据库时间），尝试修复
        if (m.joinedAt && typeof m.joinedAt === 'object' && m.joinedAt.$date) {
          let ts = 0;
          const v = m.joinedAt.$date;
          if (typeof v === 'number') ts = v;
          else if (v.$numberLong) ts = parseInt(v.$numberLong);
          else if (typeof v === 'string') ts = parseInt(v);
          
          if (ts > 0) {
            await db.collection('members').doc(m._id).update({
              data: { joinedAt: ts }
            });
            fixed++;
          }
        }
      }
      
      skip += BATCH_SIZE;
    }
    
    return { success: true, fixed };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
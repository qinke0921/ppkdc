// cloudfunctions/fixMapNames/index.js
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const results = [];
  
  const nameMappings = [
    { old: '遗忘古城', new: '遗忘孤城' },
    { old: '城镇高速公路（反向）', new: '城镇高速公路(反向)' },
    { old: '海盗绝壁海湾（反向）', new: '海盗绝壁海湾(反向)' },
    { old: '森林发夹反向', new: '森林发夹(反向)' }
  ];

  try {
    // 1. 修复 map_data 集合
    for (const mapping of nameMappings) {
      // 查询该旧名称的地图
      const mapRes = await db.collection('map_data')
        .where({ name: mapping.old })
        .get();
      
      if (mapRes.data.length > 0) {
        // 更新为新名称
        const updateRes = await db.collection('map_data')
          .where({ name: mapping.old })
          .update({ data: { name: mapping.new } });
        
        results.push({
          collection: 'map_data',
          old: mapping.old,
          new: mapping.new,
          updated: updateRes.updated || 0
        });
      } else {
        results.push({
          collection: 'map_data',
          old: mapping.old,
          new: mapping.new,
          updated: 0,
          note: '未找到'
        });
      }
    }

    // 2. 修复 line_records 集合
    for (const mapping of nameMappings) {
      // 查询该旧名称的记录
      const recordRes = await db.collection('line_records')
        .where({ map: mapping.old })
        .get();
      
      const count = recordRes.data.length;
      
      if (count > 0) {
        // 批量更新
        let updated = 0;
        for (const record of recordRes.data) {
          await db.collection('line_records')
            .doc(record._id)
            .update({ data: { map: mapping.new } });
          updated++;
        }
        
        results.push({
          collection: 'line_records',
          old: mapping.old,
          new: mapping.new,
          updated: updated
        });
      } else {
        results.push({
          collection: 'line_records',
          old: mapping.old,
          new: mapping.new,
          updated: 0,
          note: '未找到'
        });
      }
    }

    return {
      success: true,
      results: results
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      results: results
    };
  }
};
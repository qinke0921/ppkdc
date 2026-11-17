// cloudfunctions/updateDiscipleInfo/index.js
// 主演徒弟：修改徒弟资料
// - 本人可改：昵称 / 游戏名 / 游戏ID / 个人宣言
// - 师傅（master）与管理员（admin）可改：以上全部 + 师傅定线（手动录入）
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
  const { discipleId, nickname, gameName, gameId, statement, masterLine } = event;

  if (!discipleId) {
    return { success: false, error: '缺少徒弟ID' };
  }

  try {
    const caller = await getCaller(OPENID);
    const canManage = !!caller && (caller.role === 'master' || caller.role === 'admin');

    const targetRes = await db.collection('disciples').doc(discipleId).get();
    const target = targetRes.data;
    if (!target) {
      return { success: false, error: '徒弟不存在' };
    }

    const isSelf = target._openid === OPENID;
    if (!canManage && !isSelf) {
      return { success: false, error: '无权修改他人资料' };
    }

    const data = {};

    if (nickname !== undefined) {
      const v = String(nickname).trim();
      if (!v) return { success: false, error: '昵称不能为空' };
      data.nickname = v;
    }
    if (gameName !== undefined) {
      const v = String(gameName).trim();
      if (!v) return { success: false, error: '游戏昵称不能为空' };
      data.gameName = v;
    }
    if (gameId !== undefined) {
      data.gameId = String(gameId).trim();
    }
    if (statement !== undefined) {
      data.statement = String(statement).trim();
    }

    // 定线只允许师傅或管理员改
    if (masterLine !== undefined) {
      if (!canManage) {
        return { success: false, error: '仅师傅或管理员可设定线' };
      }
      const v = String(masterLine).trim();
      if (v && LINE_LEVELS.indexOf(v) === -1) {
        return { success: false, error: '定线档位不合法' };
      }
      data.masterLine = v;
    }

    if (Object.keys(data).length === 0) {
      return { success: false, error: '没有需要更新的内容' };
    }

    data.updatedAt = Date.now();
    await db.collection('disciples').doc(discipleId).update({ data });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

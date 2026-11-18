// cloudfunctions/approveDisciple/index.js
// 主演徒弟：师傅或管理员批准拜师申请，写入 disciples 并可同时指定「师傅定线」
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

// 主演徒弟定线只有 6 档；车队的 overallLine 是 14 档，读取时按「就慢不就快」收敛
const DISCIPLE_LINES = ['强主', '主力', '一线', '二线', '三线', '娱乐'];
const LINE_ALIAS = {
  '国服记录': '强主',
  '顶尖职业': '强主',
  '职业': '强主',
  '强主': '强主',
  '主力': '主力',
  '强一': '一线',
  '一线': '一线',
  '弱一': '二线',
  '强二': '二线',
  '二线': '二线',
  '弱二': '三线',
  '强三': '三线',
  '三线': '三线',
  '娱乐': '娱乐'
};

function normalizeLine(raw) {
  if (!raw) return { effective: '娱乐', source: 'default' };
  const mapped = LINE_ALIAS[raw];
  if (mapped) return { effective: mapped, source: 'set' };
  return { effective: '娱乐', source: 'default' };
}

async function getCaller(openid) {
  const res = await db.collection('disciples').where({ _openid: openid }).get();
  return res.data[0] || null;
}

// 集合不存在时（云开发错误码 -502005）给出可操作的提示，而不是抛出英文技术错误
function isMissingCollection(err) {
  const code = err && err.errCode;
  const msg = (err && err.message) || '';
  return code === -502005 || /collection not exist|COLLECTION_NOT_EXIST|Db or Table not exist/i.test(msg);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { applicationId, masterLine } = event;

  if (!applicationId) {
    return { success: false, error: '缺少申请ID' };
  }

  try {
    // 1. 仅师傅或管理员可审批
    const caller = await getCaller(OPENID);
    if (!caller || (caller.role !== 'master' && caller.role !== 'admin')) {
      return { success: false, error: '仅师傅或管理员可审批' };
    }

    // 2. 定线校验（可为空，空表示稍后再录；14 档旧值会收敛到 6 档）
    let line = '';
    if (masterLine) {
      if (!LINE_ALIAS[masterLine]) {
        return { success: false, error: '定线档位不合法：' + masterLine };
      }
      line = normalizeLine(masterLine).effective;
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

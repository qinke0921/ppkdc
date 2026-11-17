// pages/disciples/disciples.js
// 主演徒弟模块：人员展示 / 身份识别 / 拜师申请 / 管理员审批 / 师傅定线
// 说明：数据完全独立于车队模块（disciples + discipleApplications 两个集合）

const db = wx.cloud.database();

// 定线档位，与分线查询的等级体系保持一致
const LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'];

Page({
  data: {
    loading: true,
    singlePageMode: false,
    isDisciple: false,
    isMaster: false,
    isAdmin: false,
    canManage: false,
    discipleInfo: null,
    masterInfo: null,
    discipleCount: 0,
    canClaimMaster: false,

    disciples: [],
    showDisciples: false,

    pendingApplications: [],
    showAdminPanel: false,

    // 从车队批量导入
    showImportModal: false,
    importText: '',
    useOverallLine: false,
    importLineIndex: 0,
    lineOptionsWithEmpty: ['不指定', '国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'],
    importResult: null,

    showApplyModal: false,
    showDetail: false,
    showEditModal: false,

    selectedDisciple: null,
    isMyOwnProfile: false,

    lineOptions: LINE_LEVELS,
    editLineIndex: 0,

    applyForm: {
      nickname: '',
      gameName: '',
      gameId: '',
      statement: ''
    },
    editForm: {
      nickname: '',
      gameName: '',
      gameId: '',
      statement: '',
      masterLine: ''
    }
  },

  onLoad(options) {
    this._firstShow = true;

    // 场景值 1154 = 朋友圈单页模式：无登录态，云函数调不通，只做静态展示
    let scene = 0;
    try {
      scene = (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().scene) || 0;
    } catch (err) {
      scene = 0;
    }

    if (scene === 1154) {
      this.setData({ singlePageMode: true, loading: false });
      return;
    }

    // 开启右上角菜单的「转发给好友」和「分享到朋友圈」
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    this.loadMyStatus();
  },

  onShow() {
    // onLoad 已经拉过一次，首次 onShow 直接跳过
    if (this._firstShow) {
      this._firstShow = false;
      return;
    }
    if (this.data.isDisciple) {
      this.loadMyStatus(true);
    }
  },

  /* ---------------- 时间格式化 ---------------- */

  formatTime(value) {
    if (value === null || value === undefined || value === '') return '未知';

    let d = null;

    if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'number') {
      d = new Date(value);
    } else if (typeof value === 'string') {
      const ts = parseInt(value, 10);
      d = isNaN(ts) ? new Date(value) : new Date(ts);
    } else if (value && value.$date) {
      const v = value.$date;
      if (typeof v === 'number') d = new Date(v);
      else if (v && v.$numberLong) d = new Date(parseInt(v.$numberLong, 10));
      else if (typeof v === 'string') d = new Date(parseInt(v, 10));
    }

    if (!d || isNaN(d.getTime())) return '未知';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  },

  /* ---------------- 身份识别 ---------------- */

  async loadMyStatus(silent) {
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyDiscipleInfo' });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        this.showError(r.error);
        return;
      }

      const info = r.disciple || null;
      if (info) {
        info.formattedJoinedAt = this.formatTime(info.joinedAt);
      }

      this.setData({
        loading: false,
        isDisciple: !!r.isDisciple,
        isMaster: !!r.isMaster,
        isAdmin: !!r.isAdmin,
        canManage: !!r.canManage,
        discipleInfo: info,
        masterInfo: r.master || null,
        discipleCount: r.discipleCount || 0,
        canClaimMaster: !!r.canClaimMaster,
        pendingApplications: this.decorateApplications(r.pendingApplications || [])
      });
    } catch (err) {
      console.error('加载徒弟身份失败', err);
      this.setData({ loading: false });
      this.showError('加载失败，请检查云函数是否已部署');
    }
  },

  /* ---------------- 分享转发 ---------------- */

  buildShareTitle() {
    const m = this.data.masterInfo;
    const name = m ? (m.nickname || m.gameName || '') : '';
    const count = this.data.discipleCount || 0;

    if (name && count > 0) return name + ' 的徒弟招募｜已收 ' + count + ' 位';
    if (name) return name + ' 的徒弟招募';
    if (count > 0) return '主演徒弟｜已收 ' + count + ' 位';
    return '主演徒弟｜拜师申请通道';
  },

  // 转发给好友
  onShareAppMessage() {
    return {
      title: this.buildShareTitle(),
      path: '/pages/disciples/disciples',
      imageUrl: '/images/share-disciples.png'
    };
  },

  // 分享到朋友圈（单页模式打开）
  onShareTimeline() {
    return {
      title: this.buildShareTitle(),
      imageUrl: '/images/share-disciples.png'
    };
  },

  showError(msg) {
    const text = msg || '操作失败';
    // 集合未创建这类长文案用弹窗，避免 toast 被截断
    if (text.indexOf('集合') >= 0) {
      wx.showModal({
        title: '还差一步',
        content: text,
        showCancel: false,
        confirmText: '知道了'
      });
    } else {
      wx.showToast({ title: text, icon: 'none' });
    }
  },

  decorateApplications(list) {
    return list.map((a) => {
      a.pickedLine = a.pickedLine || '';
      a.formattedCreatedAt = this.formatTime(a.createdAt);
      return a;
    });
  },

  async claimMaster() {
    wx.showLoading({ title: '初始化中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'claimDiscipleMaster',
        data: { nickname: '主演' }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();
      if (r.success) {
        wx.showToast({ title: r.message || '已设为师傅', icon: 'success' });
        await this.loadMyStatus();
      } else {
        this.showError(r.error || '初始化失败');
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '初始化失败', icon: 'none' });
    }
  },

  /* ---------------- 徒弟名单 ---------------- */

  async toggleDisciples() {
    const willShow = !this.data.showDisciples;
    this.setData({ showDisciples: willShow });
    if (willShow && this.data.disciples.length === 0) {
      await this.loadDisciples();
    }
  },

  async loadDisciples() {
    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getAllDisciples' });
      const r = (res && res.result) || {};
      if (r.success) {
        const list = (r.disciples || []).map((d) => {
          d.formattedJoinedAt = this.formatTime(d.joinedAt);
          return d;
        });
        this.setData({
          disciples: list,
          discipleCount: r.total || list.length,
          masterInfo: r.master || this.data.masterInfo
        });
      }
    } catch (err) {
      console.error('加载徒弟名单失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /* ---------------- 拜师申请 ---------------- */

  showApplyModal() {
    this.setData({ showApplyModal: true });
  },

  hideApplyModal() {
    this.setData({
      showApplyModal: false,
      applyForm: { nickname: '', gameName: '', gameId: '', statement: '' }
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['applyForm.' + field]: e.detail.value });
  },

  async submitApplication() {
    const f = this.data.applyForm;
    if (!f.nickname.trim() || !f.gameName.trim() || !f.gameId.trim()) {
      wx.showToast({ title: '请填写昵称、游戏昵称和游戏ID', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...', mask: true });
    try {
      // 默认集合权限下，这里只会读到自己提交的申请，用于防重复提交
      const pending = await db.collection('discipleApplications')
        .where({ status: 'pending' })
        .get();

      if (pending.data && pending.data.length > 0) {
        wx.hideLoading();
        wx.showToast({ title: '你已提交申请，请等待审批', icon: 'none' });
        return;
      }

      await db.collection('discipleApplications').add({
        data: {
          nickname: f.nickname.trim(),
          gameName: f.gameName.trim(),
          gameId: f.gameId.trim(),
          statement: f.statement.trim(),
          status: 'pending',
          createdAt: db.serverDate()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '申请已提交', icon: 'success' });
      this.hideApplyModal();
    } catch (err) {
      console.error('提交申请失败', err);
      wx.hideLoading();
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },

  /* ---------------- 管理员审批 ---------------- */

  toggleAdminPanel() {
    this.setData({ showAdminPanel: !this.data.showAdminPanel });
    if (this.data.showAdminPanel) {
      this.loadMyStatus(true);
    }
  },

  onApproveLineChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const line = LINE_LEVELS[Number(e.detail.value)];
    this.setData({ ['pendingApplications[' + index + '].pickedLine']: line });
  },

  async approveApplication(e) {
    const { id, index } = e.currentTarget.dataset;
    const item = this.data.pendingApplications[index];
    const line = item ? item.pickedLine : '';

    wx.showLoading({ title: '处理中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'approveDisciple',
        data: { applicationId: id, masterLine: line }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        this.showError(r.error || '操作失败');
        return;
      }

      wx.showToast({ title: '已批准', icon: 'success' });
      await this.loadMyStatus(true);
      if (this.data.showDisciples) {
        await this.loadDisciples();
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async rejectApplication(e) {
    const { id } = e.currentTarget.dataset;

    wx.showLoading({ title: '处理中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'rejectDisciple',
        data: { applicationId: id }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        this.showError(r.error || '操作失败');
        return;
      }

      wx.showToast({ title: '已拒绝', icon: 'success' });
      await this.loadMyStatus(true);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /* ---------------- 从车队批量导入 ---------------- */

  openImportModal() {
    this.setData({ showImportModal: true });
  },

  closeImportModal() {
    this.setData({ showImportModal: false });
  },

  onImportInput(e) {
    this.setData({ importText: e.detail.value });
  },

  onUseOverallLineChange(e) {
    this.setData({ useOverallLine: !!e.detail.value });
  },

  onImportLineChange(e) {
    this.setData({ importLineIndex: Number(e.detail.value) });
  },

  parseImportIds() {
    return String(this.data.importText || '')
      .split(/[\s,，;；、]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  },

  async callImport(dryRun) {
    const ids = this.parseImportIds();
    if (ids.length === 0) {
      this.showError('请先粘贴车队成员的 _id');
      return null;
    }

    wx.showLoading({ title: dryRun ? '预览中...' : '导入中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'migrateTeamMembers',
        data: {
          memberIds: ids,
          dryRun: !!dryRun,
          useOverallLine: !!this.data.useOverallLine,
          masterLine: this.data.importLineIndex > 0 ? LINE_LEVELS[this.data.importLineIndex - 1] : ''
        }
      });
      wx.hideLoading();

      const r = (res && res.result) || {};
      if (!r.success) {
        this.showError(r.error || '迁移失败');
        return null;
      }

      this.setData({ importResult: r });

      if (!dryRun) {
        await this.loadMyStatus(true);
        if (this.data.showDisciples) {
          await this.loadDisciples();
        }
      }
      return r;
    } catch (err) {
      console.error('迁移失败', err);
      wx.hideLoading();
      this.showError('迁移失败，请查看云函数日志');
      return null;
    }
  },

  async runImport(e) {
    const dry = String(e.currentTarget.dataset.dry) === '1';

    if (dry) {
      await this.callImport(true);
      return;
    }

    // 真正写入前先预览一次，让用户确认数量
    const preview = await this.callImport(true);
    if (!preview || !preview.success) return;

    const n = preview.summary.created;
    if (n === 0) {
      this.showError('没有需要新增的成员（可能都已存在，或 _id 没匹配到）');
      return;
    }

    wx.showModal({
      title: '确认导入',
      content: '将新增 ' + n + ' 位徒弟，导入后走正常徒弟数据，是否继续？',
      confirmText: '确认导入',
      success: (r) => {
        if (r.confirm) {
          this.callImport(false);
        }
      }
    });
  },

  /* ---------------- 详情 ---------------- */

  viewDetail(e) {
    const item = e.currentTarget.dataset.item;
    const myOpenid = this.data.discipleInfo ? this.data.discipleInfo._openid : '';

    this.setData({
      selectedDisciple: item,
      isMyOwnProfile: !!myOpenid && item._openid === myOpenid,
      showDetail: true
    });
  },

  closeDetail() {
    this.setData({ showDetail: false, selectedDisciple: null, isMyOwnProfile: false });
  },

  /* ---------------- 编辑资料 / 定线 ---------------- */

  showEditModal() {
    const target = this.data.selectedDisciple;
    if (!target) return;

    const idx = LINE_LEVELS.indexOf(target.masterLine || '');

    this.setData({
      showEditModal: true,
      editLineIndex: idx < 0 ? 0 : idx,
      editForm: {
        nickname: target.nickname || '',
        gameName: target.gameName || '',
        gameId: target.gameId || '',
        statement: target.statement || '',
        masterLine: target.masterLine || ''
      }
    });
  },

  hideEditModal() {
    this.setData({ showEditModal: false });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editForm.' + field]: e.detail.value });
  },

  onEditLineChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      editLineIndex: idx,
      'editForm.masterLine': LINE_LEVELS[idx]
    });
  },

  async saveEdit() {
    const target = this.data.selectedDisciple;
    if (!target) return;

    const f = this.data.editForm;
    if (!f.nickname.trim() || !f.gameName.trim()) {
      wx.showToast({ title: '昵称和游戏昵称不能为空', icon: 'none' });
      return;
    }

    const payload = {
      discipleId: target._id,
      nickname: f.nickname.trim(),
      gameName: f.gameName.trim(),
      gameId: f.gameId.trim(),
      statement: f.statement.trim()
    };

    // 定线仅师傅 / 管理员可改
    if (this.data.canManage) {
      payload.masterLine = f.masterLine;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateDiscipleInfo',
        data: payload
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        this.showError(r.error || '保存失败');
        return;
      }

      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ showEditModal: false });

      if (this.data.isMyOwnProfile) {
        await this.loadMyStatus(true);
      }
      if (this.data.disciples.length > 0) {
        await this.loadDisciples();
      }

      // 刷新详情中显示的数据
      const updated = {
        nickname: payload.nickname,
        gameName: payload.gameName,
        gameId: payload.gameId,
        statement: payload.statement
      };
      if (this.data.canManage) {
        updated.masterLine = payload.masterLine;
      }
      this.setData({
        selectedDisciple: Object.assign({}, this.data.selectedDisciple, updated)
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  stopPropagation() {}
});

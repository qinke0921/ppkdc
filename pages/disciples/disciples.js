// pages/disciples/disciples.js
// 主演徒弟首页：只做「概览 + 入口」，功能都进独立页面（与车队模块的组织方式一致）
const db = wx.cloud.database();

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

    // 进行中任务（任务系统上线后填充）
    activeTasks: [],
    pendingTotal: 0,

    showApplyModal: false,
    applyForm: {
      nickname: '',
      gameName: '',
      gameId: '',
      statement: ''
    }
  },

  onLoad() {
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

    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    this.loadMyStatus();
  },

  onShow() {
    if (this._firstShow) {
      this._firstShow = false;
      return;
    }
    if (this.data.isDisciple) {
      this.loadMyStatus(true);
    }
  },

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

  showError(msg) {
    const text = msg || '操作失败';
    if (text.indexOf('集合') >= 0) {
      wx.showModal({ title: '还差一步', content: text, showCancel: false, confirmText: '知道了' });
    } else {
      wx.showToast({ title: text, icon: 'none' });
    }
  },

  /* ---------------- 身份 ---------------- */

  async loadMyStatus(silent) {
    if (!silent) this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({ name: 'getMyDiscipleInfo' });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        this.showError(r.error);
        return;
      }

      const info = r.disciple || null;
      if (info) info.formattedJoinedAt = this.formatTime(info.joinedAt);

      // 待办 = 拜师申请 + 成绩申请
      // 兼容旧版云函数：没返回 pendingRequestCount 时，直接查一次待审批列表
      let pendingRequestCount = r.pendingRequestCount;
      if (r.canManage && (pendingRequestCount === undefined || pendingRequestCount === null)) {
        try {
          const reqRes = await wx.cloud.callFunction({ name: 'getPendingTaskRequests' });
          const rr = (reqRes && reqRes.result) || {};
          pendingRequestCount = rr.success ? (rr.total || 0) : 0;
        } catch (err) {
          pendingRequestCount = 0;
        }
      }

      const pendingTotal = ((r.pendingApplications || []).length) + (pendingRequestCount || 0);

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
        activeTasks: r.activeTasks || [],
        pendingTotal
      });

      if (r.canManage) {
        this.syncTabBadge(pendingTotal);
      }
    } catch (err) {
      console.error('加载徒弟身份失败', err);
      this.setData({ loading: false });
      this.showError('加载失败，请检查云函数是否已部署');
    }
  },

  // tabBar 红点：主演徒弟在第 4 个 tab（index 3）
  syncTabBadge(count) {
    try {
      if (count > 0) {
        wx.setTabBarBadge({ index: 3, text: count > 99 ? '99+' : String(count) });
      } else {
        wx.removeTabBarBadge({ index: 3 });
      }
    } catch (err) {
      // 非 tabBar 页面或基础库不支持时忽略
    }
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
      this.showError('初始化失败');
    }
  },

  /* ---------------- 跳转 ---------------- */

  goMembers() {
    wx.navigateTo({ url: '/pages/disciples/members/members' });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/disciples/admin/admin' });
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/disciples/history/history' });
  },

  goTask(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: '任务系统开发中', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/disciples/task/task?id=' + id });
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

  /* ---------------- 分享 ---------------- */

  buildShareTitle() {
    const m = this.data.masterInfo;
    const name = m ? (m.nickname || m.gameName || '') : '';
    const count = this.data.discipleCount || 0;

    if (name && count > 0) return name + ' 的徒弟招募｜已收 ' + count + ' 位';
    if (name) return name + ' 的徒弟招募';
    if (count > 0) return '主演徒弟｜已收 ' + count + ' 位';
    return '主演徒弟｜拜师申请通道';
  },

  onShareAppMessage() {
    return {
      title: this.buildShareTitle(),
      path: '/pages/disciples/disciples',
      imageUrl: '/images/share-disciples.png'
    };
  },

  onShareTimeline() {
    return {
      title: this.buildShareTitle(),
      imageUrl: '/images/share-disciples.png'
    };
  },

  stopPropagation() {}
});

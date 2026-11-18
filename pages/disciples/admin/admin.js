// pages/disciples/admin/admin.js
// 管理中心：待审批 + 进行中任务（任务系统上线后填充）
const util = require('../../../utils/disciple');

function fmtRange(startAt, endAt) {
  const s = new Date(startAt || 0);
  const e = new Date(endAt || 0);
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return pad(s.getMonth() + 1) + '.' + pad(s.getDate()) + ' - ' + pad(e.getMonth() + 1) + '.' + pad(e.getDate());
}

Page({
  data: {
    loading: true,
    canManage: false,
    isMaster: false,
    pendingApplications: [],
    activeTasks: [],
    lineOptions: util.DISCIPLE_LINES
  },

  onLoad() {
    this.load();
  },

  onShow() {
    if (this._loaded) {
      this.load(true);
    }
    this._loaded = true;
  },

  async load(silent) {
    if (!silent) this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({ name: 'getMyDiscipleInfo' });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        return;
      }

      if (!r.canManage) {
        this.setData({ loading: false });
        wx.showModal({
          title: '无权访问',
          content: '仅师傅与管理员可以进入管理中心',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }

      const pending = (r.pendingApplications || []).map((a) => {
        a.pickedLine = a.pickedLine || '';
        a.formattedCreatedAt = util.formatTime(a.createdAt);
        return a;
      });

      this.setData({
        loading: false,
        canManage: true,
        isMaster: !!r.isMaster,
        pendingApplications: pending,
        activeTasks: (r.activeTasks || []).map((t) => {
          t.rangeText = fmtRange(t.startAt, t.endAt);
          return t;
        })
      });
    } catch (err) {
      console.error('加载管理中心失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    }
  },

  onApproveLineChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const line = util.DISCIPLE_LINES[Number(e.detail.value)];
    this.setData({ ['pendingApplications[' + index + '].pickedLine']: line });
  },

  async approve(e) {
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
        wx.showToast({ title: r.error || '操作失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: '已批准', icon: 'success' });
      this.load(true);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async reject(e) {
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
        wx.showToast({ title: r.error || '操作失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: '已拒绝', icon: 'success' });
      this.load(true);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  goMembers() {
    wx.navigateTo({ url: '/pages/disciples/members/members' });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/disciples/admin/publish/publish' });
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/disciples/admin/history/history' });
  },

  goScores(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/disciples/admin/scores/scores?taskId=' + id });
  },

  goTask(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/disciples/task/task?id=' + id });
  }
});

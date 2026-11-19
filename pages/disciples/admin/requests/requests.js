// pages/disciples/admin/requests/requests.js
// 成绩申请审批：通过才写入成绩，拒绝则不入库
Page({
  data: {
    loading: true,
    list: [],
    total: 0
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
      const res = await wx.cloud.callFunction({ name: 'getPendingTaskRequests' });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        return;
      }

      this.setData({ loading: false, list: r.list || [], total: r.total || 0 });
    } catch (err) {
      console.error('加载成绩申请失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    }
  },

  async review(e) {
    const { id, approve } = e.currentTarget.dataset;
    const isApprove = String(approve) === '1';

    wx.showLoading({ title: isApprove ? '通过中...' : '拒绝中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'reviewTaskScoreRequest',
        data: { requestId: id, approve: isApprove }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        wx.showToast({ title: r.error || '操作失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: isApprove ? '已通过并入库' : '已拒绝', icon: 'success' });
      this.load(true);
    } catch (err) {
      console.error('审批失败', err);
      wx.hideLoading();
      wx.showToast({ title: '操作失败，请检查云函数', icon: 'none' });
    }
  }
});

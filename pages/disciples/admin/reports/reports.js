// pages/disciples/admin/reports/reports.js
// 视频失效反馈：成员反馈后在这里处理
const util = require('../../../../utils/disciple');

Page({
  data: {
    loading: true,
    list: [],
    total: 0,
    taskCount: 0
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
      const res = await wx.cloud.callFunction({ name: 'listTaskReports' });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        return;
      }

      const list = (r.list || []).map((item) => {
        item.dateText = util.formatTime(item.createdAt);
        return item;
      });

      this.setData({
        loading: false,
        list,
        total: r.total || list.length,
        taskCount: r.taskCount || 0
      });
    } catch (err) {
      console.error('加载反馈失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    }
  },

  goTask(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: '/pages/disciples/task/task?id=' + id });
    }
  },

  async resolve(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '处理中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'resolveTaskReport',
        data: { reportId: id }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        wx.showToast({ title: r.error || '操作失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: '已标记处理', icon: 'success' });
      this.load(true);
    } catch (err) {
      console.error('处理反馈失败', err);
      wx.hideLoading();
      wx.showToast({ title: '操作失败，请检查云函数', icon: 'none' });
    }
  }
});

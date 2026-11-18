// pages/disciples/admin/scores/scores.js
// 批量录入成绩：按日期列出全员，已录成绩预填，改完批量保存
const util = require('../../../../utils/disciple');

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

Page({
  data: {
    taskId: '',
    task: null,
    date: todayStr(),
    rows: [],
    visible: [],
    keyword: '',
    onlyEmpty: false,
    loading: true,
    saving: false,
    stats: { total: 0, filled: 0 }
  },

  onLoad(options) {
    this.setData({ taskId: (options && options.taskId) || '' });
    this.load();
  },

  async load(silent) {
    if (!this.data.taskId) {
      wx.showToast({ title: '缺少任务ID', icon: 'none' });
      return;
    }

    if (!silent) this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getScoreSheet',
        data: { taskId: this.data.taskId, date: this.data.date }
      });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        return;
      }

      const rows = (r.rows || []).map((row) => {
        row.editValue = row.scoreText || '';
        return row;
      });

      this.setData({
        loading: false,
        task: r.task,
        rows,
        stats: r.stats || { total: rows.length, filled: 0 }
      });
      this.applyFilter();
    } catch (err) {
      console.error('加载录入名单失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    }
  },

  applyFilter() {
    const kw = String(this.data.keyword || '').trim().toLowerCase();
    let list = this.data.rows.slice();

    if (kw) {
      list = list.filter((r) => (r.gameName + ' ' + r.nickname).toLowerCase().indexOf(kw) >= 0);
    }
    if (this.data.onlyEmpty) {
      list = list.filter((r) => !String(r.editValue || '').trim());
    }

    this.setData({ visible: list });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  toggleEmpty() {
    this.setData({ onlyEmpty: !this.data.onlyEmpty });
    this.applyFilter();
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value }, () => this.load());
  },

  clearDate() {
    this.setData({ date: '' }, () => this.load());
  },

  onScoreInput(e) {
    const openid = e.currentTarget.dataset.openid;
    const value = e.detail.value;
    const rows = this.data.rows.map((r) => {
      if (r.openid !== openid) return r;
      const next = Object.assign({}, r, { editValue: value });
      return next;
    });
    this.setData({ rows });
  },

  async save() {
    const changed = this.data.rows.filter((r) => {
      return String(r.editValue || '').trim() !== String(r.scoreText || '').trim();
    });

    if (changed.length === 0) {
      wx.showToast({ title: '没有需要保存的改动', icon: 'none' });
      return;
    }

    // 先做格式校验，避免整批失败
    for (const r of changed) {
      const text = String(r.editValue || '').trim();
      if (text && isNaN(util.timeToMs(text))) {
        wx.showToast({ title: r.gameName + ' 时间不合法：' + text, icon: 'none' });
        return;
      }
    }

    const entries = changed.map((r) => ({
      openid: r.openid,
      scoreText: String(r.editValue || '').trim()
    }));

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'saveTaskScores',
        data: { taskId: this.data.taskId, date: this.data.date, entries }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();
      this.setData({ saving: false });

      if (!r.success) {
        wx.showToast({ title: r.error || '保存失败', icon: 'none' });
        return;
      }

      if (r.invalid && r.invalid.length) {
        wx.showModal({
          title: '部分未保存',
          content: '有 ' + r.invalid.length + ' 条时间格式不合法，已跳过',
          showCancel: false
        });
      } else {
        wx.showToast({ title: '已保存 ' + r.saved + ' 条', icon: 'success' });
      }

      this.load(true);
    } catch (err) {
      console.error('保存成绩失败', err);
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败，请检查云函数', icon: 'none' });
    }
  }
});

// pages/disciples/members/members.js
// 徒弟名单：搜索 + 排序，点名片进成员详情页
const util = require('../../../utils/disciple');

Page({
  data: {
    loading: true,
    all: [],
    list: [],
    keyword: '',
    sortBy: 'line', // line | name
    total: 0
  },

  onLoad() {
    this.load();
  },

  onShow() {
    // 从成员详情页返回时静默刷新，避免定线/资料改了列表还是旧的
    if (this._loaded) {
      this.load(true);
    }
    this._loaded = true;
  },

  async load(silent) {
    if (!silent) {
      wx.showLoading({ title: '加载中...', mask: true });
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'getAllDisciples' });
      const r = (res && res.result) || {};

      if (!r.success) {
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const all = (r.disciples || []).map((d) => {
        d.rank = util.lineRank(d.masterLine);
        d.formattedJoinedAt = util.formatTime(d.joinedAt);
        return d;
      });

      this.setData({ all, total: r.total || all.length, loading: false });
      this.applyFilter();
    } catch (err) {
      console.error('加载徒弟名单失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    } finally {
      if (!silent) {
        wx.hideLoading();
      }
    }
  },

  applyFilter() {
    const kw = String(this.data.keyword || '').trim().toLowerCase();
    let list = this.data.all.slice();

    if (kw) {
      list = list.filter((m) => {
        const hay = (m.gameName + ' ' + m.nickname + ' ' + (m.gameId || '')).toLowerCase();
        return hay.indexOf(kw) >= 0;
      });
    }

    if (this.data.sortBy === 'line') {
      list.sort((a, b) => (a.rank - b.rank) || String(a.gameName).localeCompare(String(b.gameName)));
    } else {
      list.sort((a, b) => String(a.gameName).localeCompare(String(b.gameName)));
    }

    this.setData({ list });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  toggleSort() {
    this.setData({ sortBy: this.data.sortBy === 'line' ? 'name' : 'line' });
    this.applyFilter();
  },

  goMember(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/disciples/member?id=' + id });
  }
});

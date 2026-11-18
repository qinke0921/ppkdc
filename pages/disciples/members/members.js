// pages/disciples/members/members.js
// 徒弟名单：按分线档位分组，默认收起，点开才展开该档成员
const util = require('../../../utils/disciple');

// 展示顺序：从强到弱，未定线单独放最后
const GROUPS = ['强主', '主力', '一线', '二线', '三线', '娱乐', '未定线'];

Page({
  data: {
    loading: true,
    total: 0,
    keyword: '',
    groups: []
  },

  onLoad() {
    this._openState = {};   // 记录每个档位的展开状态，刷新后保持
    this._all = [];
    this.load();
  },

  onShow() {
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

      this._all = (r.disciples || []).map((d) => {
        d.formattedJoinedAt = util.formatTime(d.joinedAt);
        return d;
      });

      this.setData({ loading: false, total: r.total || this._all.length });
      this.buildGroups();
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

  buildGroups() {
    const kw = String(this.data.keyword || '').trim().toLowerCase();
    const buckets = {};
    GROUPS.forEach((g) => { buckets[g] = []; });

    this._all.forEach((m) => {
      const level = (m.masterLine && GROUPS.indexOf(m.masterLine) >= 0) ? m.masterLine : '未定线';

      if (kw) {
        const hay = ((m.gameName || '') + ' ' + (m.nickname || '') + ' ' + (m.gameId || '')).toLowerCase();
        if (hay.indexOf(kw) < 0) return;
      }

      buckets[level].push(m);
    });

    const groups = GROUPS
      .map((level) => {
        const members = buckets[level].sort((a, b) => String(a.gameName).localeCompare(String(b.gameName)));
        // 有搜索词时自动展开命中结果，否则按记忆的展开状态
        const open = kw ? members.length > 0 : this._openState[level] === true;
        return { level, members, count: members.length, open };
      })
      .filter((g) => g.count > 0);

    this.setData({ groups });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value }, () => this.buildGroups());
  },

  clearSearch() {
    this.setData({ keyword: '' }, () => this.buildGroups());
  },

  toggleGroup(e) {
    const level = e.currentTarget.dataset.level;
    this._openState[level] = !this._openState[level];
    this.buildGroups();
  },

  goMember(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/disciples/member/member?id=' + id });
  }
});

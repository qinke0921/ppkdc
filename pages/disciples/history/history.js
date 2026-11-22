// pages/disciples/history/history.js
// 我的任务历史：只展示已结算任务
function fmtRange(startAt, endAt) {
  const s = new Date(startAt || 0);
  const e = new Date(endAt || 0);
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return pad(s.getMonth() + 1) + '.' + pad(s.getDate()) + ' - ' + pad(e.getMonth() + 1) + '.' + pad(e.getDate());
}

Page({
  data: {
    loading: true,
    allList: [],
    list: [],
    onlyMine: false,
    summary: null,
    targetOpenid: '',
    targetName: ''
  },

  onLoad(options) {
    const openid = (options && options.openid) || '';

    // URL 里的中文是编码过的，取出来要解码，否则标题会显示成 %E5%B0%8F%E5%87%A1
    let name = (options && options.name) || '';
    try {
      name = decodeURIComponent(name);
    } catch (err) {
      // 已经解码过或格式不合法时保持原样
    }

    this.setData({ targetOpenid: openid, targetName: name });

    if (openid) {
      wx.setNavigationBarTitle({ title: (name || '徒弟') + ' 的任务历史' });
    }

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
      const data = this.data.targetOpenid ? { openid: this.data.targetOpenid } : {};
      const res = await wx.cloud.callFunction({ name: 'getDiscipleTaskHistory', data });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        return;
      }

      const allList = (r.list || []).map((t) => {
        t.rangeText = fmtRange(t.startAt, t.endAt);
        return t;
      });

      // 优先用云端返回的真实名字，避免 URL 编码问题导致标题乱码
      let titleName = this.data.targetName;
      if (r.member && r.member.gameName) {
        titleName = r.member.gameName;
        if (this.data.targetOpenid) {
          wx.setNavigationBarTitle({ title: titleName + ' 的任务历史' });
        }
      }

      this.setData({
        loading: false,
        allList,
        summary: r.summary || null,
        targetName: titleName
      });
      this.applyFilter();
    } catch (err) {
      console.error('加载历史失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    }
  },

  applyFilter() {
    const list = this.data.onlyMine
      ? this.data.allList.filter((t) => t.hasResult)
      : this.data.allList;
    this.setData({ list });
  },

  toggleOnlyMine() {
    this.setData({ onlyMine: !this.data.onlyMine }, () => this.applyFilter());
  },

  goTask(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/disciples/task/task?id=' + id });
  }
});

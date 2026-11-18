// pages/disciples/member/member.js
// 成员详情：资料展示 + 页内编辑（定线仅师傅/管理员可改）
const util = require('../../../utils/disciple');

Page({
  data: {
    id: '',
    loading: true,
    member: null,
    canManage: false,
    isSelf: false,

    editing: false,
    saving: false,
    lineOptions: util.DISCIPLE_LINES,
    lineIndex: 0,
    form: {
      nickname: '',
      gameName: '',
      gameId: '',
      statement: '',
      masterLine: ''
    }
  },

  onLoad(options) {
    this.setData({ id: (options && options.id) || '' });
    this.load();
  },

  async load() {
    if (!this.data.id) {
      wx.showToast({ title: '缺少成员ID', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const [meRes, listRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'getMyDiscipleInfo' }),
        wx.cloud.callFunction({ name: 'getAllDisciples' })
      ]);

      const me = (meRes && meRes.result) || {};
      const listResData = (listRes && listRes.result) || {};
      let all = listResData.disciples || [];
      if (listResData.master) all = all.concat([listResData.master]);

      const member = all.filter((m) => m._id === this.data.id)[0];
      if (!member) {
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showToast({ title: '成员不存在', icon: 'none' });
        return;
      }

      member.formattedJoinedAt = util.formatTime(member.joinedAt);
      const myOpenid = me.disciple ? me.disciple._openid : '';

      this.setData({
        loading: false,
        member,
        canManage: !!me.canManage,
        isSelf: !!myOpenid && member._openid === myOpenid
      });
    } catch (err) {
      console.error('加载成员详情失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  startEdit() {
    const m = this.data.member;
    if (!m) return;

    const idx = util.DISCIPLE_LINES.indexOf(m.masterLine);

    this.setData({
      editing: true,
      lineIndex: idx < 0 ? 0 : idx,
      form: {
        nickname: m.nickname || '',
        gameName: m.gameName || '',
        gameId: m.gameId || '',
        statement: m.statement || '',
        masterLine: m.masterLine || ''
      }
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onLineChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      lineIndex: idx,
      'form.masterLine': util.DISCIPLE_LINES[idx]
    });
  },

  async save() {
    const f = this.data.form;
    if (!f.nickname.trim() || !f.gameName.trim()) {
      wx.showToast({ title: '昵称和游戏昵称不能为空', icon: 'none' });
      return;
    }

    const payload = {
      discipleId: this.data.id,
      nickname: f.nickname.trim(),
      gameName: f.gameName.trim(),
      gameId: f.gameId.trim(),
      statement: f.statement.trim()
    };

    // 定线仅师傅 / 管理员可改
    if (this.data.canManage) {
      payload.masterLine = f.masterLine;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateDiscipleInfo',
        data: payload
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        this.setData({ saving: false });
        wx.showToast({ title: r.error || '保存失败', icon: 'none' });
        return;
      }

      // 本地同步展示
      const member = Object.assign({}, this.data.member, {
        nickname: payload.nickname,
        gameName: payload.gameName,
        gameId: payload.gameId,
        statement: payload.statement
      });
      if (this.data.canManage) {
        member.masterLine = payload.masterLine;
      }

      this.setData({ member, editing: false, saving: false });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      console.error('保存失败', err);
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  }
});

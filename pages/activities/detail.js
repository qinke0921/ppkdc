// pages/activities/detail.js
const db = wx.cloud.database();
const { fetchAll, deleteTeamActivityCascade } = require('../../utils/db.js');

Page({
  data: {
    activityId: '',
    activity: null,
    participants: [],
    prizes: [],
    hasJoined: false,
    isAdmin: false,
    isMember: false,
    myOpenId: '',
    memberInfo: null,
    showParticipants: false,
    showPrizes: false,
    loading: true,
    prizeTotal: 0,
    prizeTotalText: '0'
  },

  /** 从奖金说明中解析数字金额并累加（如 11.11、18.88红包） */
  parsePrizeAmount(note) {
    if (!note || typeof note !== 'string') return 0;
    const matches = note.match(/\d+(?:\.\d+)?/g);
    if (!matches) return 0;
    return matches.reduce((sum, m) => sum + parseFloat(m), 0);
  },

  formatPrizeTotal(total) {
    if (!Number.isFinite(total) || total <= 0) return '0';
    const rounded = Math.round(total * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  },

  calcPrizeTotal(prizes) {
    const total = (prizes || []).reduce(
      (sum, p) => sum + this.parsePrizeAmount(p.prizeNote),
      0
    );
    return {
      prizeTotal: total,
      prizeTotalText: this.formatPrizeTotal(total)
    };
  },

  async onLoad(options) {
    const activityId = options.id || '';
    if (!activityId) {
      wx.showToast({ title: '活动不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ activityId });
    await this.getOpenId();
    await this.checkMember();
    if (!this.data.isMember) {
      wx.showModal({
        title: '提示',
        content: '请先加入车队',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }
    await this.loadDetail();
  },

  async onShow() {
    if (this.data.activityId && this.data.isMember) {
      await this.loadDetail();
    }
  },

  async getOpenId() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      if (res.result && res.result.openid) {
        this.setData({ myOpenId: res.result.openid });
      }
    } catch (err) {
      console.error('获取openid失败', err);
    }
  },

  async checkMember() {
    if (!this.data.myOpenId) return;
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyMemberInfo',
        data: { openid: this.data.myOpenId }
      });
      if (res.result && res.result.success && res.result.isMember && res.result.member) {
        if (res.result.member.status === 'left') {
          this.setData({ isMember: false });
          return;
        }
        this.setData({
          isMember: true,
          isAdmin: res.result.member.role === 'admin',
          memberInfo: res.result.member
        });
      }
    } catch (err) {
      console.error('检查成员失败', err);
    }
  },

  getActivityStatus(activity) {
    const now = Date.now();
    if (now < activity.startAtMs) return { text: '未开始', cls: 'status-upcoming' };
    if (now > activity.endAtMs) return { text: '已结束', cls: 'status-ended' };
    return { text: '进行中', cls: 'status-ongoing' };
  },

  async loadDetail() {
    const { activityId, myOpenId } = this.data;
    this.setData({ loading: true });
    try {
      const actRes = await db.collection('team_activities').doc(activityId).get();
      const activity = actRes.data;
      if (!activity || !activity._id) {
        wx.showToast({ title: '活动不存在', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const status = this.getActivityStatus(activity);
      activity.statusText = status.text;
      activity.statusCls = status.cls;

      const participants = await fetchAll(
        'team_activity_participants',
        { activityId },
        { field: 'createdAt', direction: 'asc' }
      );
      const prizes = await fetchAll(
        'team_activity_prizes',
        { activityId },
        { field: 'createdAt', direction: 'asc' }
      );

      const hasJoined = participants.some(
        (p) => p.memberOpenid === myOpenId || p._openid === myOpenId
      );

      const prizeTotals = this.calcPrizeTotal(prizes);

      this.setData({
        activity,
        participants,
        prizes,
        hasJoined,
        loading: false,
        ...prizeTotals
      });
    } catch (err) {
      console.error('加载详情失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  toggleParticipants() {
    this.setData({ showParticipants: !this.data.showParticipants });
  },

  togglePrizes() {
    this.setData({ showPrizes: !this.data.showPrizes });
  },

  async joinActivity() {
    const { activity, hasJoined, memberInfo, myOpenId } = this.data;
    if (!activity || hasJoined) return;

    const now = Date.now();
    if (now > activity.endAtMs) {
      wx.showToast({ title: '活动已结束', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '报名中...', mask: true });
    try {
      await db.collection('team_activity_participants').add({
        data: {
          activityId: activity._id,
          memberOpenid: myOpenId,
          gameName: (memberInfo && memberInfo.gameName) || '',
          nickname: (memberInfo && memberInfo.nickname) || '',
          createdAt: db.serverDate()
        }
      });
      wx.showToast({ title: '报名成功', icon: 'success' });
      await this.loadDetail();
    } catch (err) {
      console.error('报名失败', err);
      wx.showToast({ title: '报名失败', icon: 'none' });
    }
    wx.hideLoading();
  },

  cancelJoin() {
    const { participants, myOpenId } = this.data;
    const mine = participants.find(
      (p) => p.memberOpenid === myOpenId || p._openid === myOpenId
    );
    if (!mine) return;

    wx.showModal({
      title: '取消报名',
      content: '确定取消参加此活动？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        try {
          await db.collection('team_activity_participants').doc(mine._id).remove();
          wx.showToast({ title: '已取消', icon: 'success' });
          await this.loadDetail();
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
        wx.hideLoading();
      }
    });
  },

  onParticipateTap() {
    if (this.data.hasJoined) {
      this.cancelJoin();
    } else {
      this.joinActivity();
    }
  },

  goToEdit() {
    wx.navigateTo({ url: `/pages/activities/edit?id=${this.data.activityId}` });
  },

  onShareAppMessage() {
    const { activity, activityId } = this.data;
    const name = (activity && activity.name) || '车队活动';
    return {
      title: `🏆 车队活动「${name}」等你来参加！`,
      path: `/pages/activities/detail?id=${activityId}`,
      imageUrl: '/images/share-exchange.png'
    };
  },

  onShareTimeline() {
    const { activity, activityId } = this.data;
    const name = (activity && activity.name) || '车队活动';
    return {
      title: `🏆 车队活动「${name}」等你来参加！`,
      query: `id=${activityId}&from=timeline`
    };
  },

  deleteActivity() {
    const { activity } = this.data;
    if (!activity) return;
    wx.showModal({
      title: '删除活动',
      content: `确定删除「${activity.name}」？`,
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        try {
          await deleteTeamActivityCascade(activity._id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
        wx.hideLoading();
      }
    });
  }
});

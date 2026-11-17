// pages/activities/list.js
const { fetchAll, deleteTeamActivityCascade } = require('../../utils/db.js');

Page({
  data: {
    activities: [],
    isAdmin: false,
    isMember: false,
    myOpenId: '',
    loading: true
  },

  async onLoad() {
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
    await this.loadActivities();
  },

  async onShow() {
    if (this.data.isMember) {
      await this.loadActivities();
    }
  },

  onPullDownRefresh() {
    this.loadActivities().then(() => wx.stopPullDownRefresh());
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
          isAdmin: res.result.member.role === 'admin'
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

  async loadActivities() {
    this.setData({ loading: true });
    try {
      let activities = await fetchAll('team_activities', {}, {
        field: 'startAtMs',
        direction: 'desc'
      });

      activities = activities.map((a) => {
        const status = this.getActivityStatus(a);
        return {
          ...a,
          statusText: status.text,
          statusCls: status.cls
        };
      });

      const activityIds = activities.map((a) => a._id);
      const participantCounts = {};
      const prizeCounts = {};

      if (activityIds.length > 0) {
        const participants = await fetchAll('team_activity_participants', {});
        const prizes = await fetchAll('team_activity_prizes', {});

        participants.forEach((p) => {
          if (p.activityId) {
            participantCounts[p.activityId] = (participantCounts[p.activityId] || 0) + 1;
          }
        });
        prizes.forEach((p) => {
          if (p.activityId) {
            prizeCounts[p.activityId] = (prizeCounts[p.activityId] || 0) + 1;
          }
        });
      }

      activities = activities.map((a) => ({
        ...a,
        participantCount: participantCounts[a._id] || 0,
        prizeCount: prizeCounts[a._id] || 0
      }));

      this.setData({ activities, loading: false });
    } catch (err) {
      console.error('加载活动失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/activities/detail?id=${id}` });
  },

  goToCreate() {
    wx.navigateTo({ url: '/pages/activities/edit' });
  },

  goToEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/activities/edit?id=${id}` });
  },

  deleteActivity(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除活动',
      content: `确定删除「${name}」？相关报名与奖金登记将一并删除。`,
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        try {
          await deleteTeamActivityCascade(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          await this.loadActivities();
        } catch (err) {
          console.error('删除失败', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
        wx.hideLoading();
      }
    });
  },

  stopPropagation() {}
});

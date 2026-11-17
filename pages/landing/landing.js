// pages/landing/landing.js
Page({
  data: {
    advertisement: ''
  },

  onLoad() {
    const db = wx.cloud.database();
    
    db.collection('advertise')
      .limit(1)
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          this.setData({ advertisement: res.data[0].advertisement });
        }
      });
  },

  goToTeam() {
    wx.switchTab({
      url: '/pages/team/team'
    });
  },

  goToDisciples() {
    wx.switchTab({
      url: '/pages/disciples/disciples'
    });
  },

  goToCompetition() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  goToLine() {
    wx.switchTab({
      url: '/pages/line/line'
    });
  }
});
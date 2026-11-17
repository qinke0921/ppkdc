// pages/home/home.js
Page({
  data: {
    advertisement: ''
  },

  onLoad() {
    const db = wx.cloud.database();
    console.log('home onLoad 触发');
    
    db.collection('advertise')
      .limit(1)
      .get()
      .then(res => {
        console.log('查询结果:', res);
        if (res.data && res.data.length > 0) {
          this.setData({ advertisement: res.data[0].advertisement });
        }
      })
      .catch(err => {
        console.error('查询失败:', err);
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
// app.js
App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloudbase-0ga9zc1ub244d4ba',
        traceUser: true,
      });
    }
  }
});

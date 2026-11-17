/**
 * 统一加载提示工具
 * 使用方法:
 *   const loading = require('../../utils/loading.js');
 *   loading.show('加载中...');
 *   loading.hide();
 */

const show = (title = '🏀 加载中...') => {
  // 先隐藏任何已有的 loading
  wx.hideLoading();
  
  // 使用原生 loading，它自带旋转图标
  wx.showLoading({
    title: title,
    mask: true
  });
};

const showMsg = (title = '处理中...') => {
  wx.hideLoading();
  wx.showLoading({
    title: title,
    mask: true
  });
};

const hide = () => {
  wx.hideLoading();
};

// 带成功提示
const showSuccess = (title = '完成!', duration = 1500) => {
  wx.hideLoading();
  wx.showToast({
    title: title,
    icon: 'success',
    duration: duration
  });
};

// 带失败提示
const showError = (title = '出错了', duration = 1500) => {
  wx.hideLoading();
  wx.showToast({
    title: title,
    icon: 'none',
    duration: duration
  });
};

// 带警告提示
const showWarn = (title = '提示', duration = 1500) => {
  wx.hideLoading();
  wx.showToast({
    title: title,
    icon: 'warn',
    duration: duration
  });
};

// 空心 loading（无图标）
const showNone = (title = '请稍候...', duration = 1500) => {
  wx.hideLoading();
  wx.showToast({
    title: title,
    icon: 'none',
    duration: duration
  });
};

module.exports = {
  show,
  showMsg,
  hide,
  showSuccess,
  showError,
  showWarn,
  showNone
};
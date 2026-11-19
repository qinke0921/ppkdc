// utils/share.js - 网盘分享文本解析
// 支持：夸克 / 百度 / 阿里云盘 / 微云 / 123 网盘 / 蓝奏云 等
// 典型文本：
//   我用夸克网盘给你分享了「2025年1月第4周 街头狂飙」，点击链接或复制整段内容，打开「夸克APP」即可获取。
//   /~54433cMcwA~:/
//   链接：https://pan.quark.cn/s/efdf6593e157
//   提取码：tdnG

const PLATFORMS = [
  { re: /pan\.quark\.cn/i, name: '夸克网盘' },
  { re: /pan\.baidu\.com/i, name: '百度网盘' },
  { re: /alipan\.com|aliyundrive\.com/i, name: '阿里云盘' },
  { re: /weiyun\.com/i, name: '腾讯微云' },
  { re: /123pan\.(cn|com)|123684\.com|123865\.com/i, name: '123 网盘' },
  { re: /lanzou[a-z]*\.com/i, name: '蓝奏云' },
  { re: /share\.weiyun\.com/i, name: '腾讯微云' }
];

function detectPlatform(url) {
  if (!url) return '';
  for (let i = 0; i < PLATFORMS.length; i++) {
    if (PLATFORMS[i].re.test(url)) return PLATFORMS[i].name;
  }
  return '';
}

/**
 * 解析网盘分享文本
 * @param {string} raw 用户粘贴的整段分享内容
 * @returns {{url:string, code:string, title:string, platform:string, raw:string}}
 */
function parseShareText(raw) {
  const text = String(raw || '');

  // 1. 链接：取第一段 http(s)
  let url = '';
  const urlMatch = text.match(/https?:\/\/[^\s，。、；："'）)]+/i);
  if (urlMatch) {
    url = urlMatch[0].replace(/[.,;!?]+$/, '');
  }

  // 2. 提取码：优先取 URL 里的 pwd，其次取「提取码：xxx」
  let code = '';
  const pwdMatch = url.match(/[?&]pwd=([A-Za-z0-9]{2,10})/i);
  if (pwdMatch) {
    code = pwdMatch[1];
  } else {
    const codeMatch = text.match(/(?:提取码|提取碼|访问码|訪問碼|密码|密碼)\s*[:：]?\s*([A-Za-z0-9]{2,10})/);
    if (codeMatch) code = codeMatch[1];
  }

  // 3. 标题：优先中文引号「」，其次书名号
  let title = '';
  const titleMatch = text.match(/「([^」]{1,80})」/);
  if (titleMatch && titleMatch[1].indexOf('APP') < 0 && titleMatch[1].indexOf('夸克') < 0) {
    title = titleMatch[1];
  } else {
    const bookMatch = text.match(/《([^》]{1,80})》/);
    if (bookMatch) title = bookMatch[1];
  }

  return {
    url,
    code,
    title: title.trim(),
    platform: detectPlatform(url),
    raw: text.trim()
  };
}

module.exports = {
  parseShareText,
  detectPlatform
};

// pages/disciples/task/task.js
// 任务详情：分线表、我的目标与判定、记录、进步曲线、全员榜单（可点开某人看成绩）
const util = require('../../../utils/disciple');
const share = require('../../../utils/share');

const STATUS_TEXT = {
  over: '超线完成',
  passed: '达标',
  missed: '未达标',
  absent: '逃课',
  no_target: '无法判定',
  pending: '进行中'
};

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatSize(bytes) {
  if (!bytes || typeof bytes !== 'number') return '';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function shortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
}

Page({
  data: {
    taskId: '',
    loading: true,
    task: null,
    me: null,
    myRecords: [],
    board: [],
    boardDone: [],
    boardUndone: [],
    showUndone: false,
    settled: false,
    canManage: false,
    dateRange: '',
    daysLeft: 0,
    boardOpen: true,      // 榜单默认展开
    showLineTable: false, // 分线表默认收起
    showRecords: false,   // 我的记录默认收起

    // 成绩申请
    showApply: false,
    applyDate: '',
    applyScore: '',
    submitting: false,
    myRequests: [],
    showRequests: false,     // 我的申请：默认收起
    requestsLoaded: false,
    requestsLoading: false,
    today: (function () {
      const d = new Date();
      const pad = (n) => (n < 10 ? '0' + n : String(n));
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    })(),

    // 地图笔记（PDF）
    doc: null,
    uploadingDoc: false,

    // 视频讲解
    showVideoEdit: false,
    videoText: '',
    videoUrl: '',
    videoCode: '',
    videoNote: '',
    videoPlatform: '',

    // 视频反馈
    myReported: false,
    showReport: false,
    reportNote: '',
    reporting: false,

    // 某人成绩弹层
    showMember: false,
    memberDetail: null,
    memberStatus: '',
    memberStatusClass: '',
    memberBest: '',
    memberTargetLevel: '',
    memberTargetText: '',
    memberRecords: []
  },

  onLoad(options) {
    this.setData({ taskId: (options && (options.id || options.taskId)) || '' });
    this.load();
  },

  onShow() {
    if (this._loaded && this.data.taskId) {
      this.load(true);
    }
    this._loaded = true;
  },

  async load(silent) {
    if (!this.data.taskId) {
      wx.showToast({ title: '缺少任务ID', icon: 'none' });
      return;
    }

    if (!silent) this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getDiscipleTaskDetail',
        data: { taskId: this.data.taskId }
      });
      const r = (res && res.result) || {};

      if (!r.success) {
        this.setData({ loading: false });
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        return;
      }

      const task = r.task || {};
      const board = (r.board || []).map((b) => {
        b.statusText = STATUS_TEXT[b.status] || '';
        return b;
      });
      const now = Date.now();

      const boardDone = board.filter((b) => b.bestMs !== null && b.bestMs !== undefined);
      const boardUndone = board.filter((b) => b.bestMs === null || b.bestMs === undefined);

      this.setData({
        loading: false,
        task,
        me: r.me || null,
        myRecords: r.myRecords || [],
        myReported: !!r.myReported,
        doc: r.doc ? Object.assign({}, r.doc, { sizeText: formatSize(r.doc.size) }) : null,
        board,
        boardDone,
        boardUndone,
        settled: !!r.settled,
        canManage: !!r.canManage,
        dateRange: shortDate(task.startAt) + ' - ' + shortDate(task.endAt),
        daysLeft: Math.max(0, Math.ceil((task.endAt - now) / 86400000))
      }, () => {
        this.drawChart('#curve', this.data.myRecords, (this.data.me || {}).targetMs);
      });
    } catch (err) {
      console.error('加载任务详情失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    }
  },

  /* ---------------- 曲线（通用） ---------------- */

  drawChart(selector, records, targetMs) {
    if (!records || records.length < 2) return;

    wx.createSelectorQuery()
      .select(selector)
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) return;

        const canvas = item.node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getSystemInfoSync().pixelRatio) || 2;
        const w = item.width;
        const h = item.height;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const vals = records.map((r) => r.scoreMs).filter((v) => typeof v === 'number');
        const all = targetMs ? vals.concat([targetMs]) : vals;
        let min = Math.min.apply(null, all);
        let max = Math.max.apply(null, all);
        const span = Math.max(500, max - min);
        min -= span * 0.35;
        max += span * 0.35;

        const padL = 12;
        const padR = 12;
        const padT = 26;
        const padB = 30;

        const x = (i) => padL + (w - padL - padR) * (records.length === 1 ? 0.5 : i / (records.length - 1));
        const y = (v) => padT + (h - padT - padB) * ((v - min) / (max - min));

        // 目标线
        if (targetMs) {
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(253, 185, 39, 0.9)';
          ctx.lineWidth = 1.5;
          const ty = y(targetMs);
          ctx.beginPath();
          ctx.moveTo(padL, ty);
          ctx.lineTo(w - padR, ty);
          ctx.stroke();
          ctx.restore();
        }

        // 折线
        ctx.beginPath();
        ctx.strokeStyle = '#552583';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        records.forEach((r, i) => {
          const px = x(i);
          const py = y(r.scoreMs);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // 数据点 + 成绩 + 日期
        const dense = records.length > 7;
        records.forEach((r, i) => {
          const px = x(i);
          const py = y(r.scoreMs);

          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#552583';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.stroke();

          // 成绩（点在点上方）
          ctx.fillStyle = '#552583';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(r.scoreText || '', px, Math.max(10, py - 9));

          // 日期（点在点下方，拥挤时隔一个显示）
          const showDate = !dense || i % 2 === 0 || i === records.length - 1;
          if (showDate) {
            ctx.fillStyle = '#aaa';
            ctx.font = '9px sans-serif';
            const label = r.recordDate ? String(r.recordDate).slice(5) : (r.recordedAt ? shortDate(r.recordedAt) : '—');
            ctx.fillText(label, px, h - 10);
          }
        });
      });
  },

  /* ---------------- 地图笔记（PDF） ---------------- */

  async openDoc() {
    const doc = this.data.doc;
    if (!doc || !doc.fileID) {
      wx.showToast({ title: '还没有笔记', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '下载中...', mask: true });
    try {
      const res = await wx.cloud.downloadFile({ fileID: doc.fileID });
      wx.hideLoading();
      wx.openDocument({
        filePath: res.tempFilePath,
        fileType: 'pdf',
        showMenu: true,
        fail: () => wx.showToast({ title: '打开失败，请重试', icon: 'none' })
      });
    } catch (err) {
      console.error('下载笔记失败', err);
      wx.hideLoading();
      wx.showToast({ title: '下载失败，请检查文件是否还在', icon: 'none' });
    }
  },

  async chooseDoc() {
    if (this.data.uploadingDoc) return;

    // 从聊天记录选文件：先把 PDF 发到「文件传输助手」即可选择
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: async (res) => {
        const file = res.tempFiles[0];
        if (!file) return;

        this.setData({ uploadingDoc: true });
        wx.showLoading({ title: '上传中...', mask: true });

        try {
          const mapKey = this.data.task.mapId || this.data.task.mapName || 'map';
          const cloudPath = 'map-docs/' + mapKey + '_' + Date.now() + '.pdf';
          const up = await wx.cloud.uploadFile({ cloudPath, filePath: file.path });

          const save = await wx.cloud.callFunction({
            name: 'saveMapDoc',
            data: {
              mapId: this.data.task.mapId || '',
              mapName: this.data.task.mapName || '',
              title: '兔姐笔记',
              fileID: up.fileID,
              fileName: file.name || '笔记.pdf',
              size: file.size || 0
            }
          });

          wx.hideLoading();
          this.setData({ uploadingDoc: false });

          const r = (save && save.result) || {};
          if (!r.success) {
            wx.showToast({ title: r.error || '保存失败', icon: 'none' });
            return;
          }

          wx.showToast({ title: '上传成功', icon: 'success' });
          this.load(true);
        } catch (err) {
          console.error('上传笔记失败', err);
          wx.hideLoading();
          this.setData({ uploadingDoc: false });
          wx.showToast({ title: '上传失败，请检查云存储权限', icon: 'none' });
        }
      },
      fail: () => {}
    });
  },

  /* ---------------- 视频讲解 ---------------- */

  copyVideoLink() {
    const url = this.data.task && this.data.task.videoUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '链接已复制',
          content: '微信内不能直接打开网盘链接。请打开网盘 App 或浏览器，粘贴后即可查看。',
          showCancel: false,
          confirmText: '知道了'
        });
      }
    });
  },

  copyVideoCode() {
    const code = this.data.task && this.data.task.videoCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '提取码已复制', icon: 'success' })
    });
  },

  openVideoEdit() {
    const t = this.data.task || {};
    this.setData({
      showVideoEdit: true,
      videoText: t.videoRaw || '',
      videoUrl: t.videoUrl || '',
      videoCode: t.videoCode || '',
      videoNote: t.videoNote || '',
      videoPlatform: t.videoPlatform || ''
    });
  },

  closeVideoEdit() {
    this.setData({ showVideoEdit: false });
  },

  onVideoTextInput(e) {
    const text = e.detail.value;
    const parsed = share.parseShareText(text);
    this.setData({
      videoText: text,
      videoUrl: parsed.url || '',
      videoCode: parsed.code || '',
      videoNote: parsed.title || '',
      videoPlatform: parsed.platform || ''
    });
  },

  onVideoFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  async saveVideo() {
    const url = String(this.data.videoUrl || '').trim();
    if (!url) {
      wx.showToast({ title: '请先粘贴分享内容或填写链接', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateTaskVideo',
        data: {
          taskId: this.data.taskId,
          videoUrl: url,
          videoCode: this.data.videoCode,
          videoNote: this.data.videoNote,
          videoRaw: this.data.videoText,
          videoPlatform: this.data.videoPlatform
        }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        wx.showToast({ title: r.error || '保存失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ showVideoEdit: false });
      this.load(true);
    } catch (err) {
      console.error('保存视频失败', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请检查云函数', icon: 'none' });
    }
  },

  /* ---------------- 我的申请（懒加载） ---------------- */

  async toggleRequests() {
    const willShow = !this.data.showRequests;
    this.setData({ showRequests: willShow });
    if (willShow && !this.data.requestsLoaded) {
      await this.loadRequests();
    }
  },

  async loadRequests() {
    if (this.data.requestsLoading) return;
    this.setData({ requestsLoading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyTaskRequests',
        data: { taskId: this.data.taskId }
      });
      const r = (res && res.result) || {};
      if (r.success) {
        this.setData({ myRequests: r.list || [], requestsLoaded: true });
      }
    } catch (err) {
      console.error('加载我的申请失败', err);
    } finally {
      this.setData({ requestsLoading: false });
    }
  },

  /* ---------------- 视频失效反馈 ---------------- */

  openReport() {
    this.setData({ showReport: true, reportNote: '' });
  },

  closeReport() {
    this.setData({ showReport: false });
  },

  onReportNote(e) {
    this.setData({ reportNote: e.detail.value });
  },

  async submitReport() {
    if (this.data.reporting) return;

    this.setData({ reporting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'reportTaskVideo',
        data: { taskId: this.data.taskId, note: this.data.reportNote }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();
      this.setData({ reporting: false });

      if (!r.success) {
        wx.showToast({ title: r.error || '提交失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: r.duplicate ? '已反馈过' : '已反馈给管理', icon: 'success' });
      this.setData({ showReport: false, myReported: true });
    } catch (err) {
      console.error('反馈视频失败', err);
      wx.hideLoading();
      this.setData({ reporting: false });
      wx.showToast({ title: '提交失败，请检查云函数', icon: 'none' });
    }
  },

  /* ---------------- 折叠区 ---------------- */

  toggleLineTable() {
    this.setData({ showLineTable: !this.data.showLineTable });
  },

  toggleRecords() {
    this.setData({ showRecords: !this.data.showRecords });
  },

  /* ---------------- 榜单 ---------------- */

  toggleBoard() {
    this.setData({ boardOpen: !this.data.boardOpen });
  },

  toggleUndone() {
    this.setData({ showUndone: !this.data.showUndone });
  },

  async openMember(e) {
    const openid = e.currentTarget.dataset.openid;
    if (!openid) return;

    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMemberTaskDetail',
        data: { taskId: this.data.taskId, openid }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        wx.showToast({ title: r.error || '加载失败', icon: 'none' });
        return;
      }

      this.setData({
        showMember: true,
        memberDetail: r.member || null,
        memberStatus: r.statusText || '',
        memberStatusClass: r.status || '',
        memberBest: r.bestText || '',
        memberTargetLevel: r.targetLevel || '',
        memberTargetText: r.targetText || '',
        memberRecords: r.records || []
      }, () => {
        this.drawChart('#curveMember', this.data.memberRecords, r.targetMs);
      });
    } catch (err) {
      console.error('加载成员成绩失败', err);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  closeMember() {
    this.setData({ showMember: false });
  },

  /* ---------------- 成绩申请 ---------------- */

  openApply() {
    if (this.data.settled) {
      wx.showToast({ title: '任务已结束，无法申请', icon: 'none' });
      return;
    }
    this.setData({ showApply: true, applyDate: this.data.today, applyScore: '' });
  },

  closeApply() {
    this.setData({ showApply: false, applyScore: '' });
  },

  onApplyDate(e) {
    this.setData({ applyDate: e.detail.value });
  },

  clearApplyDate() {
    this.setData({ applyDate: '' });
  },

  onApplyScore(e) {
    this.setData({ applyScore: e.detail.value });
  },

  async submitApply() {
    const text = String(this.data.applyScore || '').trim();
    if (!text) {
      wx.showToast({ title: '请填写成绩', icon: 'none' });
      return;
    }
    if (isNaN(util.timeToMs(text))) {
      wx.showToast({ title: '成绩格式不合法：' + text, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitTaskScoreRequest',
        data: {
          taskId: this.data.taskId,
          scoreText: text,
          recordDate: this.data.applyDate || ''
        }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();
      this.setData({ submitting: false });

      if (!r.success) {
        wx.showToast({ title: r.error || '提交失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: r.updated ? '申请已更新' : '申请已提交', icon: 'success' });
      this.setData({ showApply: false, applyScore: '', showRequests: true, requestsLoaded: false });
      await this.loadRequests();
      this.load(true);
    } catch (err) {
      console.error('提交成绩申请失败', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请检查云函数', icon: 'none' });
    }
  },

  /* ---------------- 管理操作 ---------------- */

  goScores() {
    wx.navigateTo({ url: '/pages/disciples/admin/scores/scores?taskId=' + this.data.taskId });
  },

  async closeTask() {
    const self = this;
    wx.showModal({
      title: '结束并结算',
      content: '结算后按当前记录生成判定，之后仍可修正成绩（会自动重算当事人）',
      success: async (r) => {
        if (!r.confirm) return;

        wx.showLoading({ title: '结算中...', mask: true });
        try {
          const res = await wx.cloud.callFunction({
            name: 'closeDiscipleTask',
            data: { taskId: self.data.taskId }
          });
          const rr = (res && res.result) || {};
          wx.hideLoading();

          if (!rr.success) {
            wx.showToast({ title: rr.error || '结算失败', icon: 'none' });
            return;
          }

          const s = rr.summary || {};
          wx.showModal({
            title: '结算完成',
            content: '超线 ' + (s.over || 0) + ' · 达标 ' + (s.passed || 0) + ' · 未达标 ' + (s.missed || 0) + ' · 逃课 ' + (s.absent || 0),
            showCancel: false
          });
          self.load(true);
        } catch (err) {
          console.error('结算失败', err);
          wx.hideLoading();
          wx.showToast({ title: '结算失败', icon: 'none' });
        }
      }
    });
  },

  stopPropagation() {}
});

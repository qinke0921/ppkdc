// pages/disciples/task/task.js
// 任务详情：分线表、我的目标与判定、记录、进步曲线、全员榜单
const util = require('../../../utils/disciple');

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
    settled: false,
    canManage: false,
    dateRange: '',
    daysLeft: 0,
    boardOpen: false
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

      this.setData({
        loading: false,
        task,
        me: r.me || null,
        myRecords: r.myRecords || [],
        board,
        settled: !!r.settled,
        canManage: !!r.canManage,
        dateRange: shortDate(task.startAt) + ' - ' + shortDate(task.endAt),
        daysLeft: Math.max(0, Math.ceil((task.endAt - now) / 86400000))
      }, () => {
        this.drawCurve();
      });
    } catch (err) {
      console.error('加载任务详情失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    }
  },

  /* ---------------- 进步曲线 ---------------- */

  drawCurve() {
    const records = this.data.myRecords || [];
    if (records.length < 2) return;

    const me = this.data.me || {};
    const targetMs = me.targetMs || null;

    wx.createSelectorQuery()
      .select('#curve')
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
        min -= span * 0.2;
        max += span * 0.2;

        const padL = 10;
        const padR = 10;
        const padT = 16;
        const padB = 22;

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

        // 数据点
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
        });

        // 底部标签（首尾）
        ctx.fillStyle = '#bbb';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(records[0].recordDate || '', padL, h - 6);
        ctx.textAlign = 'right';
        const last = records[records.length - 1];
        ctx.fillText(last.recordDate || '', w - padR, h - 6);
      });
  },

  toggleBoard() {
    this.setData({ boardOpen: !this.data.boardOpen });
  },

  goScores() {
    wx.navigateTo({ url: '/pages/disciples/admin/scores/scores?taskId=' + this.data.taskId });
  },

  goMember(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: '/pages/disciples/member?id=' + id });
    }
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
  }
});

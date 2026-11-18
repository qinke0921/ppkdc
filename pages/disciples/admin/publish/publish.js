// pages/disciples/admin/publish/publish.js
// 发布任务：选地图 → 自动带出 7 档分线 → 调整时间与分线 → 发布
const util = require('../../../../utils/disciple');

const TASK_LINES = ['国服记录', '强主', '主力', '一线', '二线', '三线', '娱乐'];

function dateToTs(str, endOfDay) {
  const p = String(str).split('-').map(Number);
  if (p.length !== 3 || p.some(isNaN)) return 0;
  return new Date(p[0], p[1] - 1, p[2], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0).getTime();
}

function todayStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

Page({
  data: {
    loading: true,
    maps: [],
    mapNames: [],
    mapIndex: -1,
    selectedMap: null,
    lineRows: TASK_LINES.map((level) => ({ level, timeText: '' })),
    startDate: todayStr(0),
    endDate: todayStr(6),
    saving: false
  },

  onLoad() {
    this.loadMaps();
  },

  async loadMaps() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getAllMaps' });
      const r = (res && res.result) || {};
      if (!r.success) {
        wx.showToast({ title: r.error || '地图加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const maps = (r.maps || []).filter((m) => m && m.name);
      maps.sort((a, b) => String(a.name).localeCompare(String(b.name)));

      this.setData({
        loading: false,
        maps,
        mapNames: maps.map((m) => m.name)
      });
    } catch (err) {
      console.error('加载地图失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '地图加载失败', icon: 'none' });
    }
  },

  onMapChange(e) {
    const idx = Number(e.detail.value);
    const map = this.data.maps[idx];
    if (!map) return;

    const rows = TASK_LINES.map((level) => ({
      level,
      timeText: map[level] || ''
    }));

    this.setData({ mapIndex: idx, selectedMap: map, lineRows: rows });
  },

  onLineInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ ['lineRows[' + idx + '].timeText']: e.detail.value });
  },

  onStartChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  async submit() {
    const { selectedMap, startDate, endDate, lineRows } = this.data;

    if (!selectedMap) {
      wx.showToast({ title: '请先选择地图', icon: 'none' });
      return;
    }

    const startAt = dateToTs(startDate, false);
    const endAt = dateToTs(endDate, true);
    if (!startAt || !endAt || endAt <= startAt) {
      wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' });
      return;
    }

    const lineTable = [];
    for (const row of lineRows) {
      const text = String(row.timeText || '').trim();
      if (text && isNaN(util.timeToMs(text))) {
        wx.showToast({ title: row.level + ' 时间不合法：' + text, icon: 'none' });
        return;
      }
      lineTable.push({ level: row.level, timeText: text });
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '发布中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'publishDiscipleTask',
        data: {
          mapId: selectedMap._id,
          mapName: selectedMap.name,
          difficulty: selectedMap['难度'] || '',
          startAt,
          endAt,
          lineTable,
          status: 'published'
        }
      });
      const r = (res && res.result) || {};
      wx.hideLoading();

      if (!r.success) {
        this.setData({ saving: false });
        wx.showToast({ title: r.error || '发布失败', icon: 'none' });
        return;
      }

      wx.showToast({ title: '任务已发布', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      console.error('发布任务失败', err);
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: '发布失败，请检查云函数', icon: 'none' });
    }
  }
});

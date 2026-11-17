// pages/line/line.js
const db = wx.cloud.database();
const dbCmd = db.command;

const LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'];

const LEVEL_CLASS_MAP = {
  '国服记录': 'gf-record',
  '顶尖职业': 'top-pro',
  '职业': 'pro',
  '强主': 'strong-host',
  '主力': 'main',
  '强一': 'strong-one',
  '一线': 'tier1',
  '弱一': 'weak-one',
  '强二': 'strong-two',
  '二线': 'tier2',
  '弱二': 'weak-two',
  '强三': 'strong-three',
  '三线': 'tier3',
  '娱乐': 'fun'
};

function getLevelClass(level) { return LEVEL_CLASS_MAP[level] || level; }

function timeToMs(timeStr) {
  if (!timeStr) return Infinity;
  const parts = timeStr.split('.');
  if (parts.length !== 3) return Infinity;
  const minutes = parseInt(parts[0]) || 0;
  const seconds = parseInt(parts[1]) || 0;
  let msStr = parts[2].padEnd(3, '0');
  const ms = parseInt(msStr) || 0;
  return minutes * 60000 + seconds * 1000 + ms;
}

Page({
  data: {
    mapData: [],
    mapGroups: [],
    searchText: '',
    filteredMapGroups: [],
    selectedMap: '',
    selectedDifficulty: '',
    currentMapLines: [],
    userTime: '',
    userLine: '',
    userLineClass: '',
    isTop: false,
    showHistoryModal: false,
    historyRecords: [],
    overallLine: '',
    overallLineClass: '',
    myOpenId: '',
    savedRecords: {},
    enableBatchUpdate: false,
    scrollRatio: 0  // 滚动比率
  },

  onLoad() {
    this.loadMapData();
    this.getOpenId();
  },

  async getOpenId() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      if (res.result && res.result.openid) {
        this.setData({ myOpenId: res.result.openid });
        // 获取 OpenId 后加载用户记录
        this.loadUserRecords();
      }
    } catch (err) { console.error('获取openid失败', err); }
  },

  // 加载用户所有地图记录
  async loadUserRecords() {
    if (!this.data.myOpenId) return;
    try {
      // 使用云函数获取记录（云函数不受 20 条限制）
      const res = await wx.cloud.callFunction({ name: 'getMyLineRecords' });
      console.log('getMyLineRecords 结果:', res);
      
      if (res.result && res.result.success && res.result.records) {
        const savedRecords = {};
        res.result.records.forEach(r => {
          savedRecords[r.map] = { time: r.time, line: r.line };
        });
        this.setData({ savedRecords });
        console.log('已加载用户记录:', Object.keys(savedRecords));
      }
    } catch (err) {
      console.error('加载用户记录失败', err);
    }
  },

  loadMapData() { this.loadMapDataFromCloud(); },

  async loadMapDataFromCloud() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getAllMaps' });
      if (res.result && res.result.success) {
        const maps = res.result.maps || [];
        if (maps.length > 0) {
          this.setData({ mapData: maps });
          this.groupMaps();
        }
      }
    } catch (err) { console.error('加载失败', err); }
  },

  groupMaps() {
    const groups = {};
    this.data.mapData.forEach(item => {
      const diff = item['难度'] || '未知';
      if (!groups[diff]) groups[diff] = [];
      groups[diff].push({ name: item.name, data: item });
    });
    const mapGroups = Object.keys(groups).map(diff => ({ difficulty: diff, maps: groups[diff] }));
    this.setData({ mapGroups, filteredMapGroups: mapGroups });
  },

  onSearchInput(e) {
    const searchText = e.detail.value.trim();
    this.setData({ searchText });
    if (!searchText) {
      this.setData({ filteredMapGroups: this.data.mapGroups });
      return;
    }
    const filtered = this.data.mapGroups.map(group => ({
      ...group,
      maps: group.maps.filter(map => map.name.toLowerCase().includes(searchText.toLowerCase()))
    })).filter(group => group.maps.length > 0);
    this.setData({ filteredMapGroups: filtered });
  },

  selectMap(e) {
    const mapName = e.currentTarget.dataset.map;
    const mapInfo = this.data.mapData.find(m => m.name === mapName);
    if (!mapInfo) return;
    const difficulty = mapInfo['难度'];
    const lines = LINE_LEVELS.map(level => ({ level, time: mapInfo[level] || '' }))
      .filter(item => item.time)
      .sort((a, b) => timeToMs(a.time) - timeToMs(b.time));
    
    // 从 savedRecords 或从云端获取当前地图的记录
    const savedRecord = this.data.savedRecords[mapName];
    
    this.setData({
      selectedMap: mapName,
      selectedDifficulty: difficulty,
      currentMapLines: lines,
      userTime: savedRecord ? savedRecord.time : '',
      userLine: savedRecord ? savedRecord.line : '',
      userLineClass: savedRecord ? getLevelClass(savedRecord.line) : '',
      isTop: savedRecord ? (savedRecord.line === '国服记录' || savedRecord.line === '顶尖职业') : false
    });
    
    // 如果没有本地记录，尝试从云端获取
    if (!savedRecord && this.data.myOpenId) {
      this.loadMapRecordFromCloud(mapName);
    }
  },

  // 从云端加载单个地图的记录
  async loadMapRecordFromCloud(mapName) {
    if (!this.data.myOpenId) return;
    try {
      // 使用云函数获取
      const res = await wx.cloud.callFunction({ name: 'getMyLineRecords' });
      if (res.result && res.result.success && res.result.records) {
        const record = res.result.records.find(r => r.map === mapName);
        if (record) {
          const savedRecords = { ...this.data.savedRecords };
          savedRecords[mapName] = { time: record.time, line: record.line };
          this.setData({
            savedRecords,
            userTime: record.time,
            userLine: record.line,
            userLineClass: getLevelClass(record.line),
            isTop: record.line === '国服记录' || record.line === '顶尖职业'
          });
        }
      }
    } catch (err) {
      console.error('加载记录失败', err);
    }
  },

  onTimeInput(e) { this.setData({ userTime: e.detail.value }); },

  checkMyLine() {
    const { selectedMap, userTime, currentMapLines } = this.data;
    if (!selectedMap) return wx.showToast({ title: '请先选择地图', icon: 'none' });
    if (!userTime) return wx.showToast({ title: '请输入成绩', icon: 'none' });
    const userMs = timeToMs(userTime);
    if (userMs === Infinity) return wx.showToast({ title: '格式错误', icon: 'none' });
    let userLine = '娱乐';
    let isTop = false;
    for (let i = 0; i < currentMapLines.length; i++) {
      if (userMs < timeToMs(currentMapLines[i].time)) {
        userLine = currentMapLines[i].level;
        if (i < 2) isTop = true;
        break;
      }
    }
    this.setData({ userLine, userLineClass: getLevelClass(userLine), isTop });
    this.saveRecord(selectedMap, userTime, userLine);
  },

  async saveRecord(map, time, line) {
    if (!this.data.myOpenId) return;
    try {
      await db.collection('line_records').where({ _openid: this.data.myOpenId, map }).remove();
      const mapInfo = this.data.mapData.find(m => m.name === map);
      await db.collection('line_records').add({
        data: { map, time, line, difficulty: mapInfo ? mapInfo['难度'] : '', createdAt: db.serverDate() }
      });
      const savedRecords = { ...this.data.savedRecords };
      savedRecords[map] = { time, line };
      this.setData({ savedRecords });
    } catch (err) { console.error('保存失败', err); }
  },

  showHistory() {
    this.loadUserRecords();
    this.setData({ showHistoryModal: true });
  },

  closeHistory() { this.setData({ showHistoryModal: false }); },

  async loadUserRecords() {
    if (!this.data.myOpenId) return;
    wx.showLoading({ title: '🏀 加载中...' });
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyLineRecords' });
      if (!res.result || !res.result.success) throw new Error();
      const records = res.result.records || [];
      const savedRecords = {};
      const historyRecords = records.map(r => ({
        _id: r._id, map: r.map, time: r.time, line: r.line, lineClass: getLevelClass(r.line), difficulty: r.difficulty
      }));
      historyRecords.sort((a, b) => LINE_LEVELS.indexOf(a.line) - LINE_LEVELS.indexOf(b.line));
      records.forEach(r => { savedRecords[r.map] = { time: r.time, line: r.line }; });
      const overallLine = this.calculateOverallLine(historyRecords);
      this.setData({ savedRecords, historyRecords, overallLine, overallLineClass: getLevelClass(overallLine) });
      if (overallLine) await this.updateMemberOverallLine(overallLine);
    } catch (err) { console.error('加载失败', err); }
    wx.hideLoading();
  },

  calculateOverallLine(records) {
    if (records.length === 0) return '';
    const counts = {};
    records.forEach(r => { counts[r.line] = (counts[r.line] || 0) + 1; });
    let maxCount = 0, modeLine = '';
    Object.keys(counts).forEach(line => { if (counts[line] > maxCount) { maxCount = counts[line]; modeLine = line; } });
    const sortedRecords = [...records].sort((a, b) => LINE_LEVELS.indexOf(a.line) - LINE_LEVELS.indexOf(b.line));
    const medianLine = sortedRecords[Math.floor(sortedRecords.length / 2)].line;
    const modeIndex = LINE_LEVELS.indexOf(modeLine);
    const medianIndex = LINE_LEVELS.indexOf(medianLine);
    return LINE_LEVELS[Math.min(modeIndex, medianIndex)] || '';
  },

  async updateMemberOverallLine(overallLine) {
    if (!overallLine || !this.data.myOpenId) return;
    try {
      const memberRes = await db.collection('members').where({ _openid: this.data.myOpenId, status: 'approved' }).get();
      if (memberRes.data.length > 0) {
        await db.collection('members').doc(memberRes.data[0]._id).update({ data: { overallLine } });
      }
    } catch (err) { console.error('更新失败', err); }
  },

  async deleteRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    const mapName = e.currentTarget.dataset.map;
    wx.showModal({
      title: '删除记录', content: '确定删除 ' + mapName + ' 吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '🗑️ 删除中...' });
          try {
            await db.collection('line_records').doc(recordId).remove();
            wx.showToast({ title: '已删除', icon: 'success' });
            await this.loadUserRecords();
          } catch (err) { wx.showToast({ title: '删除失败', icon: 'none' }); }
          wx.hideLoading();
        }
      }
    });
  },

  stopPropagation() {},

  // 批量更新分线（通过云函数，所有用户的记录都会更新）
  async batchUpdateLines() {
    if (!this.data.enableBatchUpdate) return;
    
    wx.showLoading({ title: '🔄 更新中...' });
    try {
      console.log('开始批量更新分线...');
      const res = await wx.cloud.callFunction({ name: 'batchUpdateLineRecords' });
      
      if (res.result && res.result.success) {
        console.log('共处理 ' + res.result.total + ' 条记录');
        console.log('更新了 ' + res.result.updatedCount + ' 条分线记录:', res.result.updatedList);
        console.log('更新了 ' + res.result.memberUpdatedCount + ' 个车队成员的综合水平:', res.result.memberUpdatedList);
        wx.hideLoading();
        wx.showToast({ title: '已更新' + res.result.updatedCount + '条分线,' + res.result.memberUpdatedCount + '个成员', icon: 'success' });
      } else {
        throw new Error(res.result?.error || '更新失败');
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
      console.error('批量更新失败', err);
    }
  },

  // 滚动事件
  onMapScroll(e) {
    const detail = e.detail;
    const scrollTop = detail.scrollTop || 0;
    const scrollHeight = detail.scrollHeight || 1;
    const clientHeight = detail.clientHeight || 1;
    
    if (scrollHeight > clientHeight) {
      const ratio = Math.min(scrollTop / (scrollHeight - clientHeight), 1);
      this.setData({ scrollRatio: ratio });
    }
  },

});
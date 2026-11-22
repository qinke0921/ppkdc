// pages/disciples/admin/import/import.js
// 历史数据导入：先检查匹配，再自动分批导入（超时自动减小批量）
const DEFAULT_BATCH = 1;

Page({
  data: {
    checking: false,
    importing: false,
    resetting: false,
    recomputing: false,
    progress: '',
    stats: null,
    unmatched: [],
    batchSize: DEFAULT_BATCH
  },

  async check() {
    if (this.data.checking || this.data.importing) return;
    this.setData({ checking: true, progress: '检查中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'importLegacyTasks',
        data: { cursor: 0, batch: 47, dryRun: true }
      });
      const r = (res && res.result) || {};
      this.setData({ checking: false, progress: '' });

      if (!r.success) {
        wx.showToast({ title: r.error || '检查失败', icon: 'none' });
        return;
      }

      this.setData({
        stats: r.stats || null,
        unmatched: (r.stats && r.stats.unmatched) || []
      });
    } catch (err) {
      console.error('检查失败', err);
      this.setData({ checking: false, progress: '' });
      wx.showToast({ title: '检查失败（可能超时），可直接开始导入', icon: 'none' });
    }
  },

  async recompute() {
    if (this.data.recomputing || this.data.importing) return;

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '重算历史判定',
        content: '按每期结束时的定线，重新计算 47 期历史任务的判定与统计。只改动导入的任务，不影响新发布的任务。',
        confirmText: '开始重算',
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;

    this.setData({ recomputing: true, progress: '准备重算...' });

    let cursor = 0;
    let done = false;
    let batch = 5;
    let updated = 0;

    while (!done) {
      this.setData({
        progress: '重算中 ' + cursor + '/47 期 · 已更新 ' + updated + ' 条判定（每批 ' + batch + ' 期）'
      });

      let r = null;
      let attempt = 0;
      while (attempt < 3) {
        try {
          const res = await wx.cloud.callFunction({
            name: 'importLegacyTasks',
            data: { recompute: true, cursor, batch }
          });
          r = (res && res.result) || {};
          break;
        } catch (err) {
          attempt += 1;
          if (batch > 1) {
            batch = Math.max(1, Math.floor(batch / 2));
            break;
          }
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          this.setData({ recomputing: false, progress: '重算中断，请重试（幂等，可重复执行）' });
          return;
        }
      }

      if (!r) continue;
      if (!r.success) {
        this.setData({ recomputing: false, progress: r.error || '重算失败' });
        return;
      }

      updated += r.resultsUpdated || 0;
      cursor = r.nextCursor || (cursor + batch);
      done = !!r.done;
    }

    this.setData({ recomputing: false, progress: '重算完成：更新了 ' + updated + ' 条判定' });
    wx.showToast({ title: '重算完成', icon: 'success' });
  },

  async resetAll() {
    if (this.data.importing || this.data.resetting) return;

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '重置历史数据',
        content: '只删除上次导入的历史任务与成绩（source=legacy），不会影响手动录入的数据。确定继续？',
        confirmText: '确定重置',
        confirmColor: '#c0392b',
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;

    this.setData({ resetting: true, progress: '重置中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'importLegacyTasks',
        data: { reset: true, resetOnly: true }
      });
      const r = (res && res.result) || {};
      this.setData({ resetting: false, progress: r.success ? '已重置，可以重新导入' : '' });
      wx.showToast({ title: r.success ? '已重置' : (r.error || '重置失败'), icon: r.success ? 'success' : 'none' });
    } catch (err) {
      console.error('重置失败', err);
      this.setData({ resetting: false, progress: '' });
      wx.showToast({ title: '重置失败（可能超时）', icon: 'none' });
    }
  },

  async start() {
    if (this.data.importing) return;

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认导入',
        content: '将写入 47 期历史任务与成绩，已导入的期会自动跳过。过程中请勿退出。',
        confirmText: '开始导入',
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;

    this.setData({ importing: true, progress: '准备中...' });

    let cursor = 0;
    let done = false;
    let batch = this.data.batchSize;
    const total = { weeks: 0, records: 0 };
    let lastError = '';

    while (!done) {
      this.setData({
        batchSize: batch,
        progress: '进度 ' + cursor + '/47 期 · 已写入 ' + total.records + ' 条（每批 ' + batch + ' 期）'
      });

      let r = null;
      let attempt = 0;
      const MAX_RETRY = 2;

      while (attempt < MAX_RETRY) {
        try {
          const res = await wx.cloud.callFunction({
            name: 'importLegacyTasks',
            data: { cursor, batch }
          });
          r = (res && res.result) || {};
          break;
        } catch (err) {
          attempt += 1;
          if (batch > 1) {
            // 超时：减小批量并重试同一位置
            batch = Math.max(1, Math.floor(batch / 2));
            this.setData({ progress: '单次执行超时，改为每批 ' + batch + ' 期重试…' });
            continue;
          }
          if (attempt < MAX_RETRY) {
            this.setData({ progress: '第 ' + cursor + ' 期超时，第 ' + attempt + ' 次重试…' });
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          lastError = '第 ' + cursor + ' 期多次超时。请到云开发控制台把 importLegacyTasks 的超时时间调到 60 秒后重试（已导入的期不会重复）';
        }
      }

      if (!r) break;

      if (!r.success) {
        if (batch > 1 && /timeout|timed out|超时/i.test(r.error || '')) {
          batch = Math.max(1, Math.floor(batch / 2));
          continue;
        }
        lastError = r.error || '导入失败';
        break;
      }

      const s = r.stats || {};
      total.weeks += s.weeks || 0;
      total.records += s.records || 0;

      cursor = r.nextCursor || (cursor + batch);
      done = !!r.done;
    }

    this.setData({
      importing: false,
      progress: lastError || ('完成：' + total.weeks + ' 期 · ' + total.records + ' 条成绩')
    });

    if (lastError) {
      wx.showModal({ title: '导入未完成', content: lastError, showCancel: false });
    } else {
      wx.showToast({ title: '导入完成', icon: 'success' });
    }
  }
});

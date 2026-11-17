// pages/activities/edit.js
const db = wx.cloud.database();
const { fetchAll } = require('../../utils/db.js');

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return { ms: 0, display: '' };
  const normalized = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const d = new Date(`${dateStr.replace(/-/g, '/')} ${normalized}`);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return { ms: 0, display: '' };
  return { ms, display: `${dateStr} ${timeStr}` };
}

Page({
  data: {
    activityId: '',
    isEdit: false,
    form: {
      name: '',
      description: '',
      startDate: '',
      startTime: '09:00',
      endDate: '',
      endTime: '22:00'
    },
    prizes: [],
    allMembers: [],
    showPrizeModal: false,
    editingPrizeIndex: -1,
    prizeForm: {
      gameName: '',
      memberOpenid: '',
      prizeNote: ''
    },
    selectedMemberIndex: -1
  },

  async onLoad(options) {
    const activityId = options.id || '';
    const today = todayStr();
    this.setData({
      activityId,
      isEdit: !!activityId,
      'form.startDate': today,
      'form.endDate': today
    });

    await this.checkAdmin();
    if (!this.data.isAdmin) {
      wx.showModal({
        title: '提示',
        content: '仅管理员可操作',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }

    await this.loadAllMembers();

    if (activityId) {
      wx.setNavigationBarTitle({ title: '编辑活动' });
      await this.loadActivity(activityId);
    } else {
      wx.setNavigationBarTitle({ title: '新建活动' });
    }
  },

  async checkAdmin() {
    try {
      const openRes = await wx.cloud.callFunction({ name: 'getOpenId' });
      const openid = openRes.result && openRes.result.openid;
      if (!openid) return;
      const res = await wx.cloud.callFunction({
        name: 'getMyMemberInfo',
        data: { openid }
      });
      if (
        res.result &&
        res.result.success &&
        res.result.member &&
        res.result.member.role === 'admin'
      ) {
        this.setData({ isAdmin: true });
      }
    } catch (err) {
      console.error('检查管理员失败', err);
    }
  },

  async loadAllMembers() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getAllMembers' });
      if (res.result && res.result.success) {
        this.setData({ allMembers: res.result.members });
      }
    } catch (err) {
      console.error('加载成员失败', err);
    }
  },

  async loadActivity(activityId) {
    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const actRes = await db.collection('team_activities').doc(activityId).get();
      const activity = actRes.data;
      if (!activity) {
        wx.showToast({ title: '活动不存在', icon: 'none' });
        return;
      }

      const startParts = (activity.startTime || '').split(' ');
      const endParts = (activity.endTime || '').split(' ');

      const prizes = await fetchAll(
        'team_activity_prizes',
        { activityId },
        { field: 'createdAt', direction: 'asc' }
      );

      this.setData({
        form: {
          name: activity.name || '',
          description: activity.description || '',
          startDate: startParts[0] || todayStr(),
          startTime: startParts[1] || '09:00',
          endDate: endParts[0] || todayStr(),
          endTime: endParts[1] || '22:00'
        },
        prizes: prizes.map((p) => ({
          _id: p._id,
          memberOpenid: p.memberOpenid || '',
          gameName: p.gameName || '',
          prizeNote: p.prizeNote || ''
        }))
      });
    } catch (err) {
      console.error('加载活动失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
    wx.hideLoading();
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onTimeChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  showAddPrizeModal() {
    this.setData({
      showPrizeModal: true,
      editingPrizeIndex: -1,
      selectedMemberIndex: -1,
      prizeForm: { gameName: '', memberOpenid: '', prizeNote: '' }
    });
  },

  showEditPrizeModal(e) {
    const index = e.currentTarget.dataset.index;
    const prize = this.data.prizes[index];
    let selectedMemberIndex = -1;
    if (prize.memberOpenid) {
      selectedMemberIndex = this.data.allMembers.findIndex(
        (m) => m._openid === prize.memberOpenid
      );
    }
    this.setData({
      showPrizeModal: true,
      editingPrizeIndex: index,
      selectedMemberIndex,
      prizeForm: {
        gameName: prize.gameName,
        memberOpenid: prize.memberOpenid,
        prizeNote: prize.prizeNote
      }
    });
  },

  hidePrizeModal() {
    this.setData({ showPrizeModal: false, editingPrizeIndex: -1 });
  },

  onPrizeMemberChange(e) {
    const index = parseInt(e.detail.value, 10);
    const member = this.data.allMembers[index];
    if (member) {
      this.setData({
        selectedMemberIndex: index,
        'prizeForm.memberOpenid': member._openid,
        'prizeForm.gameName': member.gameName
      });
    }
  },

  onPrizeFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`prizeForm.${field}`]: e.detail.value });
  },

  savePrizeLocal() {
    const { prizeForm, prizes, editingPrizeIndex } = this.data;
    if (!prizeForm.gameName.trim()) {
      wx.showToast({ title: '请选择或输入队员', icon: 'none' });
      return;
    }
    if (!prizeForm.prizeNote.trim()) {
      wx.showToast({ title: '请输入奖金说明', icon: 'none' });
      return;
    }

    const item = {
      memberOpenid: prizeForm.memberOpenid || '',
      gameName: prizeForm.gameName.trim(),
      prizeNote: prizeForm.prizeNote.trim()
    };

    const next = prizes.slice();
    if (editingPrizeIndex >= 0) {
      item._id = prizes[editingPrizeIndex]._id;
      next[editingPrizeIndex] = item;
    } else {
      next.push(item);
    }

    this.setData({ prizes: next });
    this.hidePrizeModal();
  },

  deletePrizeLocal(e) {
    const index = e.currentTarget.dataset.index;
    const next = this.data.prizes.slice();
    next.splice(index, 1);
    this.setData({ prizes: next });
  },

  validateForm() {
    const { form } = this.data;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' });
      return false;
    }
    const start = combineDateTime(form.startDate, form.startTime);
    const end = combineDateTime(form.endDate, form.endTime);
    if (!start.ms || !end.ms) {
      wx.showToast({ title: '请填写完整时间', icon: 'none' });
      return false;
    }
    if (end.ms <= start.ms) {
      wx.showToast({ title: '结束时间须晚于开始', icon: 'none' });
      return false;
    }
    return { start, end };
  },

  async saveActivity() {
    const validated = this.validateForm();
    if (!validated) return;

    const { form, activityId, isEdit, prizes } = this.data;
    const { start, end } = validated;

    const activityData = {
      name: form.name.trim(),
      description: form.description.trim(),
      startTime: start.display,
      endTime: end.display,
      startAtMs: start.ms,
      endAtMs: end.ms,
      updatedAt: db.serverDate()
    };

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      let targetId = activityId;

      if (isEdit) {
        await db.collection('team_activities').doc(activityId).update({ data: activityData });
        await this.syncPrizes(activityId, prizes);
      } else {
        const addRes = await db.collection('team_activities').add({
          data: {
            ...activityData,
            createdAt: db.serverDate()
          }
        });
        targetId = addRes._id;
        await this.syncPrizes(targetId, prizes);
      }

      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
        if (isEdit) {
          wx.navigateBack();
        } else {
          wx.redirectTo({ url: `/pages/activities/detail?id=${targetId}` });
        }
      }, 600);
    } catch (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    wx.hideLoading();
  },

  async syncPrizes(activityId, prizes) {
    const existing = await fetchAll('team_activity_prizes', { activityId });
    const existingMap = {};
    existing.forEach((p) => {
      existingMap[p._id] = p;
    });

    const keepIds = new Set();

    for (const prize of prizes) {
      const data = {
        activityId,
        memberOpenid: prize.memberOpenid || '',
        gameName: prize.gameName,
        prizeNote: prize.prizeNote,
        updatedAt: db.serverDate()
      };

      if (prize._id && existingMap[prize._id]) {
        keepIds.add(prize._id);
        await db.collection('team_activity_prizes').doc(prize._id).update({ data });
      } else {
        const addRes = await db.collection('team_activity_prizes').add({
          data: { ...data, createdAt: db.serverDate() }
        });
        keepIds.add(addRes._id);
      }
    }

    for (const old of existing) {
      if (!keepIds.has(old._id)) {
        await db.collection('team_activity_prizes').doc(old._id).remove();
      }
    }
  },

  stopPropagation() {}
});

// pages/team/team.js
const db = wx.cloud.database();

Page({
  data: {
    isMember: false,
    isAdmin: false,
    memberInfo: null,
    members: [],
    memberCount: 0,
    showMembers: false,
    showMemberDetail: false,
    selectedMember: null,
    showApplyModal: false,
    showAdminPanel: false,
    showMemberLineModal: false,
    showEditModal: false,
    memberLineRecords: [],
    memberOverallLine: '',
    myOpenId: '',
    isMyOwnProfile: false,
    pendingApplications: [],
    leftMembers: [],
    showLeftMembers: false,
    applyForm: {
      nickname: '',
      gameName: '',
      gameId: '',
      statement: ''
    },
    editForm: {
      nickname: '',
      gameName: '',
      gameId: '',
      statement: ''
    }
  },

  async onLoad() {
    console.log('=== onLoad 开始 ===');
    wx.showLoading({ title: '🏀 加载中...', mask: true });
    await this.getOpenId();
    await this.checkMemberStatus();
    wx.hideLoading();
  },

  async onShow() {
    // 仅检查成员状态，不重新加载成员列表以提升速度
    if (this.data.myOpenId) {
      await this.checkMemberStatus();
    }
  },

  async getOpenId() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      if (res.result && res.result.openid) {
        this.setData({ myOpenId: res.result.openid });
      }
    } catch (err) {
      console.error('获取openid失败', err);
    }
  },

  async checkMemberStatus() {
    if (!this.data.myOpenId) return;
    try {
      // 使用云函数一次性获取自己的成员信息和总人数
      const res = await wx.cloud.callFunction({
        name: 'getMyMemberInfo',
        data: { openid: this.data.myOpenId }
      });
      
      if (res.result && res.result.success) {
        this.setData({ memberCount: res.result.memberCount });
        
        // 检查是否已离队
        if (res.result.member && res.result.member.status === 'left') {
          wx.showModal({
            title: '您已离队',
            content: '请联系管理员恢复成员身份',
            showCancel: false
          });
          this.setData({ isMember: false, memberInfo: null });
          return;
        }
        
        if (res.result.isMember && res.result.member) {
          this.setData({
            isMember: true,
            isAdmin: res.result.member.role === 'admin',
            memberInfo: res.result.member
          });
          // 管理员才加载待审批申请
          if (res.result.member.role === 'admin') {
            await this.loadPendingApplications();
          }
        }
      }
    } catch (err) {
      console.error('检查失败', err);
    }
  },

  async loadMembers(skipLoading = false) {
    if (!skipLoading) wx.showLoading({ title: '🏀 加载中...', mask: true });
    try {
      // 使用云函数获取完整成员列表（突破20条限制）
      const res = await wx.cloud.callFunction({ name: 'getAllMembers' });
      if (res.result && res.result.success) {
        this.setData({ 
          members: res.result.members,
          memberCount: res.result.total 
        });
      }
    } catch (err) {
      console.error('加载成员失败', err);
    } finally {
      if (!skipLoading) wx.hideLoading();
    }
  },

  async loadPendingApplications() {
    try {
      const res = await db.collection('memberApplications').where({ status: 'pending' }).orderBy('createdAt', 'desc').get();
      this.setData({ pendingApplications: res.data });
    } catch (err) {
      console.error('加载申请失败', err);
    }
  },

  async loadLeftMembers() {
    try {
      const res = await db.collection('members').where({ status: 'left' }).get();
      this.setData({ leftMembers: res.data });
    } catch (err) {
      console.error('加载离队成员失败', err);
    }
  },

  toggleLeftMembers() {
    const willShow = !this.data.showLeftMembers;
    this.setData({ showLeftMembers: willShow });
    if (willShow && this.data.leftMembers.length === 0) {
      this.loadLeftMembers();
    }
  },

  async toggleMembers() {
    const willShow = !this.data.showMembers;
    this.setData({ showMembers: willShow });
    // 只有展开时才加载成员列表
    if (willShow && this.data.members.length === 0) {
      await this.loadMembers();
    }
  },

  formatTime(dateObj) {
    if (!dateObj) return '未知';
    // 直接返回（假设已经是可读格式或时间戳）
    if (typeof dateObj === 'string' && dateObj.includes('-')) return dateObj;
    
    let ts = 0;
    try {
      // 时间戳数字
      if (typeof dateObj === 'number') ts = dateObj;
      // 云数据库对象 { $date: { $numberLong: "..." } }
      else if (dateObj.$date) {
        const v = dateObj.$date;
        if (typeof v === 'number') ts = v;
        else if (v.$numberLong) ts = parseInt(v.$numberLong);
        else if (typeof v === 'string') ts = parseInt(v);
      }
      else return '未知';
      
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '未知';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch(e) { return '未知'; }
  },

  viewMemberDetail(e) {
    const member = e.currentTarget.dataset.member;
    const formattedJoinedAt = this.formatTime(member.joinedAt);
    const isMyOwn = this.data.myOpenId && member._openid === this.data.myOpenId;
    this.setData({
      selectedMember: { ...member, formattedJoinedAt },
      showMemberDetail: true,
      isMyOwnProfile: isMyOwn,
      editForm: {
        nickname: member.nickname || '',
        gameName: member.gameName || '',
        gameId: member.gameId || '',
        statement: member.statement || ''
      }
    });
  },

  closeMemberDetail() {
    this.setData({
      showMemberDetail: false,
      selectedMember: null,
      isMyOwnProfile: false,
      editForm: { nickname: '', gameName: '', gameId: '', statement: '' }
    });
  },

  showApplyModal() {
    this.setData({ showApplyModal: true });
  },

  hideApplyModal() {
    this.setData({ showApplyModal: false, applyForm: { nickname: '', gameName: '', gameId: '', statement: '' } });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`applyForm.${field}`]: e.detail.value
    });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`editForm.${field}`]: e.detail.value
    });
  },

  async submitApplication() {
    const { applyForm } = this.data;
    if (!applyForm.nickname.trim() || !applyForm.gameName.trim() || !applyForm.gameId.trim()) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '📤 提交中...' });
    try {
      await db.collection('memberApplications').add({
        data: {
          nickname: applyForm.nickname.trim(),
          gameName: applyForm.gameName.trim(),
          gameId: applyForm.gameId.trim(),
          statement: applyForm.statement.trim() || '',
          status: 'pending',
          createdAt: db.serverDate()
        }
      });
      wx.showToast({ title: '申请已提交', icon: 'success' });
      this.hideApplyModal();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
    wx.hideLoading();
  },

  toggleAdminPanel() {
    this.setData({ showAdminPanel: !this.data.showAdminPanel });
    if (this.data.showAdminPanel) {
      this.loadPendingApplications();
    }
  },

  async approveApplication(e) {
    const appId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '⏳ 处理中...' });
    try {
      await wx.cloud.callFunction({
        name: 'approveMember',
        data: { applicationId: appId }
      });
      wx.showToast({ title: '已批准', icon: 'success' });
      await this.loadPendingApplications();
      await this.loadMembers();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    wx.hideLoading();
  },

  async rejectApplication(e) {
    const appId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '⏳ 处理中...' });
    try {
      const updateRes = await db.collection('memberApplications').doc(appId).update({
        data: { status: 'rejected' }
      });
      console.log('拒绝申请结果:', updateRes);
      if (updateRes.stats.updated === 0) {
        // 可能已经被处理过，再查一次确保状态
        const app = await db.collection('memberApplications').doc(appId).get();
        if (app.data.status !== 'pending') {
          wx.showToast({ title: '该申请已被处理', icon: 'none' });
          await this.loadPendingApplications();
          wx.hideLoading();
          return;
        }
      }
      wx.showToast({ title: '已拒绝', icon: 'success' });
      await this.loadPendingApplications();
    } catch (err) {
      console.error('拒绝失败:', err);
      wx.showToast({ title: '操作失败: ' + err.message, icon: 'none' });
    }
    wx.hideLoading();
  },

  calculateOverallLine(records) {
    if (records.length === 0) return '';
    const LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'];
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

  async viewMemberLineRecords() {
    const { selectedMember, isAdmin } = this.data;
    if (!isAdmin) {
      wx.showToast({ title: '仅管理员可用', icon: 'none' });
      return;
    }
    if (!selectedMember || !selectedMember._openid) {
      wx.showToast({ title: '无法获取成员信息', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '🏀 加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMemberLineRecords',
        data: { openid: selectedMember._openid }
      });
      if (res.result && res.result.success) {
        const records = res.result.records || [];
        wx.hideLoading();
        if (records.length === 0) {
          wx.showModal({ title: '分线记录', content: selectedMember.gameName + ' 还没有分线记录', showCancel: false });
          return;
        }
        const LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐'];
        const overallLine = this.calculateOverallLine(records);
        records.sort((a, b) => LINE_LEVELS.indexOf(a.line) - LINE_LEVELS.indexOf(b.line));
        this.setData({
          showMemberLineModal: true,
          showMemberDetail: false,
          memberLineRecords: records,
          memberOverallLine: overallLine
        });
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  closeMemberLineModal() {
    this.setData({
      showMemberLineModal: false,
      memberLineRecords: [],
      memberOverallLine: ''
    });
  },

  goToFeature(e) {
    const feature = e.currentTarget.dataset.feature;
    if (feature === '今日交流') {
      wx.navigateTo({ url: '/pages/exchange/exchange' });
    } else if (feature === '周图任务') {
      wx.navigateTo({ url: '/pages/weekly/weekly' });
    } else if (feature === '车队活动') {
      wx.navigateTo({ url: '/pages/activities/list' });
    } else {
      wx.showModal({ title: feature, content: '正在开发中...', showCancel: false });
    }
  },

  // ===== 编辑功能 =====
  showEditModal() {
    const { selectedMember } = this.data;
    this.setData({
      showEditModal: true,
      showMemberDetail: false,
      editForm: {
        nickname: selectedMember.nickname || '',
        gameName: selectedMember.gameName || '',
        gameId: selectedMember.gameId || '',
        statement: selectedMember.statement || ''
      }
    });
  },

  hideEditModal() {
    this.setData({ showEditModal: false });
  },

  async saveEdit() {
    const { editForm, selectedMember } = this.data;
    if (!editForm.nickname.trim() || !editForm.gameName.trim()) {
      wx.showToast({ title: '昵称和游戏名必填', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '💾 保存中...' });
    try {
      await db.collection('members').doc(selectedMember._id).update({
        data: {
          nickname: editForm.nickname.trim(),
          gameName: editForm.gameName.trim(),
          gameId: editForm.gameId.trim(),
          statement: editForm.statement.trim()
        }
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.hideEditModal();
      // 更新显示
      const updatedMember = {
        ...selectedMember,
        nickname: editForm.nickname.trim(),
        gameName: editForm.gameName.trim(),
        gameId: editForm.gameId.trim(),
        statement: editForm.statement.trim(),
        formattedJoinedAt: selectedMember.formattedJoinedAt
      };
      this.setData({
        selectedMember: updatedMember,
        showMemberDetail: true,
        memberInfo: this.data.memberInfo ? {
          ...this.data.memberInfo,
          nickname: editForm.nickname.trim(),
          gameName: editForm.gameName.trim()
        } : null
      });
      // 刷新成员列表（不显示loading，避免干扰）
      await this.loadMembers(true);
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    wx.hideLoading();
  },

  // ===== 离队功能 =====
  async removeMember(e) {
    const member = e.currentTarget.dataset.member;
    wx.showModal({
      title: '成员离队',
      content: `确定要将 ${member.nickname} (${member.gameName}) 设为离队吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '⏳ 处理中...' });
          try {
            const updateRes = await db.collection('members').doc(member._id).update({
              data: { status: 'left' }
            });
            console.log('离队结果:', updateRes);
            wx.showToast({ title: '已设为离队', icon: 'success' });
            this.closeMemberDetail();
            await this.loadMembers();
            if (this.data.showLeftMembers) {
              await this.loadLeftMembers();
            }
          } catch (err) {
            console.error('离队失败:', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
          wx.hideLoading();
        }
      }
    });
  },

  async restoreMember(e) {
    const member = e.currentTarget.dataset.member;
    wx.showModal({
      title: '恢复成员',
      content: `确定要恢复 ${member.nickname} 的成员身份吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '⏳ 处理中...' });
          try {
            await db.collection('members').doc(member._id).update({
              data: { status: 'approved' }
            });
            wx.showToast({ title: '已恢复', icon: 'success' });
            this.closeLeftMembersModal();
            await this.loadMembers();
          } catch (err) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
          wx.hideLoading();
        }
      }
    });
  },

  closeLeftMembersModal() {
    this.setData({ showLeftMembers: false });
  },

  stopPropagation() {}
});
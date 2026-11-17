// pages/exchange/exchange.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    // 是否有任何场次（不再使用，保留以防其他逻辑需要）
    hasAnyExchange: false,
    
    // 所有场次列表
    exchanges: [],
    groupedExchanges: {},
    
    // 时间段列表 - 始终显示，不管有没有场次
    timeSlots: ['9点', '10点', '11点'],
    
    // 分线选择（用于筛选或新建）
    matchTypes: ['主/主1', '1/12', '2/23', '3/34'],
    selectedMatchType: '主/主1',
    selectedTimeSlot: '',
    
    // 创建场次弹窗
    showCreateModal: false,
    
    // 用户信息
    myOpenId: '',
    isAdmin: false,
    memberInfo: null,
    
    // 报名弹窗
    showRegisterModal: false,
    registerForm: {
      gameName: '',
      isReserve: false
    },
    currentExchangeId: '',
    
    // 成员列表（管理员报名时使用）
    allMembers: [],
    selectedMemberOpenid: '',
    
    // 管理弹窗
    showManageModal: false,
    manageForm: {
      status: '',
      remark: ''
    },
    currentExchange: null,
    
    // 状态选项
    statusOptions: ['待报名', '预约中', '约成功', '赢', '输'],

    // 展开的场次ID（用于控制折叠/展开）
    expandedExchanges: {},
    
    // 筛选：全部/我的报名
    filterTab: 'all', // all | mine

    // 历史记录弹窗
    showHistoryModal: false,
    historyData: [],
    historyStats: {}
  },

  async onLoad() {
    await this.getOpenId();
    await this.checkAdmin();
    if (this.data.isAdmin) {
      this.loadAllMembers();
    }
    this.loadExchanges();
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

  async checkAdmin() {
    try {
      const res = await db.collection('members')
        .where({ _openid: this.data.myOpenId })
        .get();
      
      if (res.data.length > 0) {
        const isAdmin = res.data[0].role === 'admin';
        this.setData({ 
          isAdmin: isAdmin,
          memberInfo: res.data[0]
        });
      }
    } catch (err) {
      console.error('检查管理员失败', err);
    }
  },

  // 加载所有车队成员（管理员用）
  async loadAllMembers() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getAllMembers' });
      if (res.result && res.result.success) {
        this.setData({ allMembers: res.result.members });
      }
    } catch (err) {
      console.error('加载成员列表失败', err);
    }
  },

  // 加载交流场次数据（空场次也能显示时间段）
  async loadExchanges() {
    const today = this.getTodayDate();
    
    wx.showLoading({ title: '🏀 加载中...' });
    
    try {
      const res = await db.collection('exchange')
        .where({
          date: today
        })
        .orderBy('timeSlot', 'asc')
        .orderBy('matchType', 'asc')
        .get();
      
      // 为每个场次加载报名人数和成员信息
      const exchanges = await Promise.all(res.data.map(async (exchange) => {
        const regRes = await db.collection('exchange_registrations')
          .where({ exchangeId: exchange._id })
          .get();
        
        // 获取每个报名者的 overallLine（优先用 memberOpenid，否则用默认的 _openid）
        const registrationsWithLine = await Promise.all(regRes.data.map(async (reg) => {
          const lookupOpenid = reg.memberOpenid || reg._openid;
          try {
            const memberRes = await db.collection('members')
              .where({ _openid: lookupOpenid, status: 'approved' })
              .get();
            if (memberRes.data.length > 0) {
              return { ...reg, overallLine: memberRes.data[0].overallLine || '' };
            }
          } catch (err) {}
          return { ...reg, overallLine: '' };
        }));
        
        const mainCount = registrationsWithLine.filter(r => !r.isReserve).length;
        const reserveCount = registrationsWithLine.filter(r => r.isReserve).length;
        
        return {
          ...exchange,
          mainCount,
          reserveCount,
          totalCount: regRes.data.length,
          registrations: registrationsWithLine
        };
      }));
      
      // 按时间段分组
      const groupedExchanges = {};
      this.data.timeSlots.forEach(slot => {
        groupedExchanges[slot] = exchanges.filter(e => e.timeSlot === slot);
      });
      
      // 保留展开状态
      const expandedExchanges = { ...this.data.expandedExchanges };
      const { myOpenId, filterTab } = this.data;
      
      // 判断每个场次是否有当前用户的报名
      exchanges.forEach(exchange => {
        const hasMyRegister = exchange.registrations.some(reg => {
          const regOpenid = reg.memberOpenid || reg._openid;
          return regOpenid === myOpenId;
        });
        exchange.hasMyRegister = hasMyRegister;
      });
      
      // 根据筛选类型过滤
      let filteredExchanges = exchanges;
      if (filterTab === 'mine') {
        filteredExchanges = exchanges.filter(e => e.hasMyRegister);
      }
      
      // 重新按时间段分组（过滤后）
      const groupedFilteredExchanges = {};
      this.data.timeSlots.forEach(slot => {
        groupedFilteredExchanges[slot] = filteredExchanges.filter(e => e.timeSlot === slot);
      });
      
      // 总是显示时间段，不管有没有场次
      this.setData({ 
        exchanges: exchanges,
        groupedExchanges: groupedFilteredExchanges,
        expandedExchanges: expandedExchanges
      });
      
    } catch (err) {
      console.error('加载交流失败', err);
    }
    
    wx.hideLoading();
  },

  getTodayDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 创建新场次
  async createExchange(e) {
    const { timeSlot, matchType } = e.currentTarget.dataset;
    const today = this.getTodayDate();
    
    // 检查是否已存在同名场次
    const existRes = await db.collection('exchange')
      .where({
        date: today,
        timeSlot: timeSlot,
        matchType: matchType
      })
      .get();
    
    if (existRes.data.length > 0) {
      wx.showToast({ title: '该场次已存在', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '✨ 创建中...' });
    
    try {
      await db.collection('exchange').add({
        data: {
          date: today,
          timeSlot: timeSlot,
          matchType: matchType,
          status: '待报名',
          remark: '',
          createdAt: db.serverDate()
        }
      });
      
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.loadExchanges();
      
    } catch (err) {
      console.error('创建失败', err);
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 报名
  showRegisterModal(e) {
    const exchangeId = e.currentTarget.dataset.id;
    const { memberInfo, isAdmin, allMembers, myOpenId } = this.data;
    
    if (isAdmin && allMembers.length > 0) {
      // 管理员：显示成员下拉选择
      this.setData({
        showRegisterModal: true,
        currentExchangeId: exchangeId,
        registerForm: {
          gameName: '',
          isReserve: false
        },
        selectedMemberOpenid: allMembers[0]._openid
      });
    } else {
      // 普通成员：直接使用自己的昵称
      this.setData({
        showRegisterModal: true,
        currentExchangeId: exchangeId,
        registerForm: {
          gameName: memberInfo ? memberInfo.gameName : '',
          isReserve: false
        },
        selectedMemberOpenid: myOpenId
      });
    }
  },

  hideRegisterModal() {
    this.setData({ showRegisterModal: false });
  },

  onRegisterInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`registerForm.${field}`]: value
    });
  },

  onReserveChange(e) {
    this.setData({
      'registerForm.isReserve': e.detail.value
    });
  },

  // 管理员选择成员
  onMemberChange(e) {
    const index = e.detail.value;
    const member = this.data.allMembers[index];
    this.setData({
      selectedMemberOpenid: member._openid,
      'registerForm.gameName': member.gameName
    });
  },

  async submitRegister() {
    const { registerForm, currentExchangeId, myOpenId, exchanges, isAdmin, allMembers, selectedMemberOpenid, memberInfo } = this.data;
    
    // 确定报名的 openid（管理员选择成员时使用选中的，否则用自己）
    const targetOpenid = isAdmin ? selectedMemberOpenid : myOpenId;
    const targetGameName = isAdmin ? registerForm.gameName.trim() : (memberInfo ? memberInfo.gameName : '');
    
    if (!targetGameName) {
      wx.showToast({ title: '请填写游戏名', icon: 'none' });
      return;
    }

    // 获取当前场次的报名情况
    const currentExchange = exchanges.find(e => e._id === currentExchangeId);
    if (!currentExchange) return;
    
    // 检查是否已报名（优先用 memberOpenid 匹配，如果没有则用 gameName 匹配）
    // 管理员手动输入名字时，不检查 openid，只检查名字
    const existingByName = currentExchange.registrations.find(r => r.gameName === targetGameName);
    if (existingByName) {
      wx.showToast({ title: '该成员已报名', icon: 'none' });
      return;
    }
    
    // 只有用自己的 openid 报名时才检查 openid（普通成员）
    if (!isAdmin && targetOpenid && targetOpenid !== '') {
      const existingByOpenid = currentExchange.registrations.find(r => r.memberOpenid === targetOpenid);
      if (existingByOpenid) {
        wx.showToast({ title: '该成员已报名', icon: 'none' });
        return;
      }
    }
    
    // 检查人数限制
    if (!registerForm.isReserve && currentExchange.mainCount >= 4) {
      wx.showToast({ title: '主力已满，可以报替补', icon: 'none' });
      return;
    }
    
    if (registerForm.isReserve && currentExchange.reserveCount >= 1) {
      wx.showToast({ title: '替补已满', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '📤 提交中...' });

    try {
      // 准备数据：普通成员存 memberOpenid，管理员手动报名只存 gameName
      const data = {
        exchangeId: currentExchangeId,
        gameName: targetGameName,
        isReserve: registerForm.isReserve,
        createdAt: db.serverDate()
      };
      
      // 只有不是手动输入名字时才存 memberOpenid
      // （自己报名或管理员选择车队成员时）
      if (targetOpenid && targetOpenid !== '') {
        // 检查是否真的是自己的 openid 或选中的成员
        const isMyOwn = !isAdmin || (isAdmin && selectedMemberOpenid === targetOpenid);
        if (isMyOwn) {
          data.memberOpenid = targetOpenid;
        }
      }
      
      await db.collection('exchange_registrations').add({
        data: data
      });
      
      wx.showToast({ title: '报名成功', icon: 'success' });
      this.hideRegisterModal();
      this.loadExchanges();
      
    } catch (err) {
      console.error('报名失败', err);
      wx.showToast({ title: '报名失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 取消报名 - 管理员可以删除任何人的报名，成员只能删除自己的
  async cancelRegister(e) {
    const regId = e.currentTarget.dataset.id;
    const gameName = e.currentTarget.dataset.name;
    const openid = e.currentTarget.dataset.openid;
    const { isAdmin, myOpenId } = this.data;
    
    // 检查权限：管理员 或 自己
    const isOwn = openid === myOpenId;
    
    if (!isAdmin && !isOwn) {
      wx.showToast({ title: '不能删除他人的报名', icon: 'none' });
      return;
    }
    
    wx.showModal({
      title: '取消报名',
      content: `确定要取消 ${gameName} 的报名吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '✈️ 取消中...' });
          
          try {
            await db.collection('exchange_registrations').doc(regId).remove();
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadExchanges();
          } catch (err) {
            console.error('取消失败', err);
            wx.showToast({ title: '取消失败', icon: 'none' });
          }
          
          wx.hideLoading();
        }
      }
    });
  },

  // 管理
  showManageModal(e) {
    const exchange = e.currentTarget.dataset.exchange;
    this.setData({
      showManageModal: true,
      currentExchange: exchange,
      manageForm: {
        status: exchange.status || '待报名',
        remark: exchange.remark || ''
      }
    });
  },

  hideManageModal() {
    this.setData({ showManageModal: false });
  },

  onManageInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`manageForm.${field}`]: value
    });
  },

  onStatusChange(e) {
    const status = this.data.statusOptions[e.detail.value];
    this.setData({
      'manageForm.status': status
    });
  },

  async saveManage() {
    const { currentExchange, manageForm } = this.data;
    
    wx.showLoading({ title: '💾 保存中...' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateExchange',
        data: {
          exchangeId: currentExchange._id,
          status: manageForm.status,
          remark: manageForm.remark
        }
      });
      
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.hideManageModal();
        this.loadExchanges();
      } else {
        throw new Error(res.result?.error || '保存失败');
      }
      
    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 创建场次
  showCreateModal(e) {
    const timeSlot = e.currentTarget.dataset.timeslot;
    this.setData({
      showCreateModal: true,
      selectedTimeSlot: timeSlot,
      selectedMatchType: '主/主1'
    });
  },

  hideCreateModal() {
    this.setData({ showCreateModal: false });
  },

  onMatchTypeSelect(e) {
    const matchType = e.currentTarget.dataset.type;
    this.setData({ selectedMatchType: matchType });
  },

  async confirmCreate() {
    const { selectedTimeSlot, selectedMatchType } = this.data;
    const today = this.getTodayDate();
    
    wx.showLoading({ title: '✨ 创建中...' });
    
    try {
      await db.collection('exchange').add({
        data: {
          date: today,
          timeSlot: selectedTimeSlot,
          matchType: selectedMatchType,
          status: '待报名',
          remark: '',
          createdAt: db.serverDate()
        }
      });
      
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.hideCreateModal();
      this.loadExchanges();
      
    } catch (err) {
      console.error('创建失败', err);
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 点击展开/收起场次详情
  toggleExchangeDetail(e) {
    const exchangeId = e.currentTarget.dataset.id;
    const expandedExchanges = { ...this.data.expandedExchanges };
    expandedExchanges[exchangeId] = !expandedExchanges[exchangeId];
    this.setData({ expandedExchanges });
  },

  // 停止冒泡
  stopPropagation() {},

  // 切换筛选标签
  onFilterTabChange(e) {
    const filterTab = e.currentTarget.dataset.tab;
    this.setData({ filterTab });
    this.loadExchanges();
  },

  // 复制交流情况
  copyExchangeInfo() {
    const { groupedExchanges, exchanges } = this.data;
    const today = exchanges[0]?.date || this.getTodayDate();
    
    let text = `交流 ${today}\n`;
    const processedSlots = new Set();
    
    this.data.timeSlots.forEach(timeSlot => {
      const slots = groupedExchanges[timeSlot] || [];
      slots.forEach(slot => {
        if (processedSlots.has(slot._id)) return;
        processedSlots.add(slot._id);
        
        const mainCount = slot.mainCount || 0;
        const reserveCount = slot.reserveCount || 0;
        const missing = 4 - mainCount;
        const status = slot.status || '待报名';
        const remark = slot.remark || '';
        
        const mains = (slot.registrations || []).filter(r => !r.isReserve);
        const reserves = (slot.registrations || []).filter(r => r.isReserve);
        
        if (mainCount > 0 || reserveCount > 0) {
          text += `${timeSlot} ${slot.matchType}`;
          
          // 有约成功/赢/输状态显示状态和备注
          if (status === '约成功' || status === '赢' || status === '输') {
            text += ` ${status}`;
            if (remark) {
              text += ` ${remark}`;
            }
          }
          
          text += '\n - ';
          
          if (mains.length > 0) {
            text += mains.map(r => r.gameName).join(' ');
          }
          
          if (reserves.length > 0) {
            text += ` 替补：${reserves.map(r => r.gameName).join(' ')}`;
          }
          
          if (missing > 0) {
            text += ` 缺${missing}`;
          }
          
          text += '\n';
        } else if (missing > 0) {
          text += `${timeSlot} ${slot.matchType}\n - 缺${missing}\n`;
        }
      });
    });
    
    wx.setClipboardData({
      data: text.trim(),
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      }
    });
  },

  // 查看历史交流
  showHistoryModal() {
    this.setData({ showHistoryModal: true });
    this.loadHistoryData();
  },

  hideHistoryModal() {
    this.setData({ showHistoryModal: false });
  },

  async loadHistoryData() {
    // 获取过去7天的日期
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }
    
    wx.showLoading({ title: '📜 加载历史...' });
    
    try {
      // 获取过去7天的所有场次
      const res = await db.collection('exchange')
        .where({
          date: db.command.in(dates)
        })
        .orderBy('date', 'desc')
        .orderBy('timeSlot', 'asc')
        .get();
      
      // 获取每个场次的报名记录
      const historyWithRegs = await Promise.all(res.data.map(async (exchange) => {
        const regRes = await db.collection('exchange_registrations')
          .where({ exchangeId: exchange._id })
          .get();
        
        // 获取成员的分线信息
        const regsWithLine = await Promise.all(regRes.data.map(async (reg) => {
          const lookupOpenid = reg.memberOpenid || reg._openid;
          try {
            const memberRes = await db.collection('members')
              .where({ _openid: lookupOpenid, status: 'approved' })
              .get();
            if (memberRes.data.length > 0) {
              return { ...reg, overallLine: memberRes.data[0].overallLine || '' };
            }
          } catch (err) {}
          return { ...reg, overallLine: '' };
        }));
        
        return {
          ...exchange,
          registrations: regsWithLine,
          mainCount: regsWithLine.filter(r => !r.isReserve).length,
          reserveCount: regsWithLine.filter(r => r.isReserve).length,
          membersDisplay: regsWithLine.map(r => r.gameName + (r.overallLine ? '(' + r.overallLine + ')' : '') + (r.isReserve ? '(替补)' : '')).join(', ')
        };
      }));
      
      // 统计各状态数量
      const stats = {
        '待报名': 0,
        '预约中': 0,
        '约成功': 0,
        '赢': 0,
        '输': 0
      };
      
      historyWithRegs.forEach(item => {
        const status = item.status || '待报名';
        if (stats.hasOwnProperty(status)) {
          stats[status]++;
        }
      });
      
      this.setData({
        historyData: historyWithRegs,
        historyStats: stats
      });
      
    } catch (err) {
      console.error('加载历史失败', err);
    }
    
    wx.hideLoading();
  },

  // 删除场次
  async deleteExchange(e) {
    const exchange = e.currentTarget.dataset.exchange;
    
    // 检查是否有人报名
    if (exchange.totalCount > 0) {
      wx.showToast({ title: '有人报名，不能删除', icon: 'none' });
      return;
    }
    
    wx.showModal({
      title: '删除场次',
      content: `确定要删除 ${exchange.timeSlot} ${exchange.matchType} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '🗑️ 删除中...' });
          
          try {
            await db.collection('exchange').doc(exchange._id).remove();
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadExchanges();
          } catch (err) {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
          
          wx.hideLoading();
        }
      }
    });
  },

  // 分享给朋友
  onShareAppMessage() {
    return {
      title: '今日交流车队缺人！快来报名~',
      path: '/pages/exchange/exchange',
      imageUrl: '/images/share-exchange.png'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '今日交流车队缺人！快来报名~',
      query: 'from=timeline'
    };
  }
});
// pages/weekly/weekly.js
const db = wx.cloud.database();

/** 转盘扇区配色（湖人紫 / 金），与界面主题一致 */
const WHEEL_PURPLE = '#552583';
const WHEEL_GOLD = '#FDB927';

Page({
  data: {
    // 当前周任务
    currentTask: null,
    
    // 地图名称 (手动输入)
    selectedMap: '',
    
    // 时间线
    maleTime: '',
    femaleTime: '',
    
    // 提交记录
    submissions: [],
    maleSubmissions: [],
    femaleSubmissions: [],
    
    // 成员列表（管理员用）
    allMembers: [],
    selectedMemberOpenid: '',
    
    // 编辑中的提交
    editingSubmission: null,
    
    // 管理状态
    isAdmin: false,
    myOpenId: '',
    memberInfo: null,
    
    // 弹窗状态
    showCreateModal: false,
    showEditModal: false,
    showAddModal: false,
    showCopyModal: false,
    showEditTargetModal: false,
    editMaleTime: '',
    editFemaleTime: '',
    copiedText: '',
    
    // 表单
    form: {
      gameName: '',
      score: '',
      gender: 'male',
      passed: true
    },
    
    // 日期辅助
    weekStart: '',
    weekEnd: '',
    
    // 抽奖相关
    showLotteryModal: false,
    lotteryWinner: null,
    lotteryHistory: [],
    lotteryPool: [],
    
    // 转盘相关
    isSpinning: false,
    lotteryFinished: false,
    animationData: {},
    itemDeg: 0,
    lotteryWheelItems: [],
    wheelBgStyle: '',
    namesLayerStyle: '',
    wheelLabelRadiusRpx: 200,
    lotteryPoolHint: ''
  },

  async onLoad() {
    // 初始化本周日期范围
    const weekStart = this.getWeekStart();
    const weekEnd = this.getWeekEnd();
    this.setData({ weekStart, weekEnd });
    
    await this.getOpenId();
    await this.checkAdmin();
    if (this.data.isAdmin) {
      this.loadAllMembers();
    }
    // 不再需要加载地图列表，改为手动输入
    // await this.loadMapList();
    await this.loadCurrentTask();
  },

  async onShow() {
    await this.checkAdmin();
    await this.loadCurrentTask();
  },

  onPullDownRefresh() {
    this.loadCurrentTask().then(() => {
      wx.stopPullDownRefresh();
    });
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
    if (!this.data.myOpenId) return;
    
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

  async loadMapList() {
    try {
      const res = await db.collection('map_data').limit(100).get();
      const mapList = res.data.map(m => m.name);
      this.setData({ mapList });
    } catch (err) {
      console.error('加载地图列表失败', err);
    }
  },

  async loadCurrentTask() {
    const today = this.getTodayDate();
    const weekStart = this.getWeekStart();
    const weekEnd = this.getWeekEnd();
    
    try {
      // 1. 先查本周的任务
      const res = await db.collection('weekly_tasks')
        .where({
          weekStart: weekStart,
          weekEnd: weekEnd
        })
        .get();
      
      let task = res.data[0] || null;
      
      // 2. 如果本周没有任务，获取最近一次发布的任务
      if (!task) {
        const lastRes = await db.collection('weekly_tasks')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        if (lastRes.data.length > 0) {
          task = lastRes.data[0];
          task.isPastWeek = true; // 标记是历史的任务
        }
      }
      
      if (task) {
        this.setData({ currentTask: task });
        // 判断是否是当前周
        if (!task.isPastWeek) {
          this.setData({ weekStart: task.weekStart, weekEnd: task.weekEnd });
        }
        await this.loadSubmissions(task._id);
      } else {
        this.setData({ 
          currentTask: null,
          submissions: [],
          maleSubmissions: [],
          femaleSubmissions: []
        });
      }
    } catch (err) {
      console.error('加载周任务失败', err);
    }
  },

  async loadSubmissions(taskId) {
    if (!taskId) return;
    
    try {
      const collection = wx.cloud.database().collection('weekly_submissions');
      const query = { taskId };
      const BATCH_SIZE = 100;

      const countRes = await collection.where(query).count();
      const total = countRes.total;

      let submissions = [];
      let skip = 0;

      while (skip < total) {
        const res = await collection
          .where(query)
          .orderBy('scoreMs', 'asc')
          .skip(skip)
          .limit(BATCH_SIZE)
          .get();
        submissions = submissions.concat(res.data);
        skip += res.data.length;
        if (res.data.length === 0) break;
      }
      
      // 智能识别性别：兼容各种格式
      const maleSubmissions = [];
      const femaleSubmissions = [];
      
      submissions.forEach(s => {
        // 标准化性别字段
        let genderVal = s.gender;
        if (typeof genderVal !== 'string') {
          genderVal = '';
        }
        genderVal = genderVal.toLowerCase().trim();
        
        // 根据 gameName 自动推断（备用方案）
        const gameName = s.gameName || '';
        const isFemaleName = gameName.includes('兔') || gameName.includes('妹') || 
                            gameName.includes('姐') || gameName.includes('美女') ||
                            gameName.includes(' girl') || gameName.includes(' Girl');
        
        if (genderVal === 'male' || genderVal === '男') {
          maleSubmissions.push(s);
        } else if (genderVal === 'female' || genderVal === '女') {
          femaleSubmissions.push(s);
        } else if (isFemaleName) {
          // 根据名字推断为女生
          femaleSubmissions.push(s);
        } else {
          // 默认归为男生
          maleSubmissions.push(s);
        }
      });
      
      // 最快者：仅在及格记录中取成绩最好（排序后第一条及格）
      maleSubmissions.forEach((s) => {
        s.isFastest = false;
      });
      femaleSubmissions.forEach((s) => {
        s.isFastest = false;
      });
      const firstPassedMale = maleSubmissions.find((s) => s.passed !== false);
      const firstPassedFemale = femaleSubmissions.find((s) => s.passed !== false);
      if (firstPassedMale) firstPassedMale.isFastest = true;
      if (firstPassedFemale) firstPassedFemale.isFastest = true;
      
      this.setData({ 
        submissions,
        maleSubmissions,
        femaleSubmissions
      });
    } catch (err) {
      console.error('加载提交记录失败', err);
    }
  },

  getTodayDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  getWeekStart() {
    const date = new Date();
    const day = date.getDay();
    const diff = day === 0 ? 6 : day - 1; // 周一为开始
    const monday = new Date(date);
    monday.setDate(date.getDate() - diff);
    return this.formatDate(monday);
  },

  getWeekEnd() {
    const date = new Date();
    const day = date.getDay();
    const diff = day === 0 ? 0 : 7 - day; // 周日为结束
    const sunday = new Date(date);
    sunday.setDate(date.getDate() + diff);
    return this.formatDate(sunday);
  },

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  },

  // 显示创建弹窗
  showCreateModal() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可用', icon: 'none' });
      return;
    }
    this.setData({
      showCreateModal: true,
      selectedMap: '',
      maleTime: '',
      femaleTime: ''
    });
  },

  hideCreateModal() {
    this.setData({ showCreateModal: false });
  },

  // 地图输入
  onMapSelect(e) {
    this.setData({ selectedMap: e.currentTarget.dataset.map });
  },

  // 时间线输入
  onTimeInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  // 发布任务
  async publishTask() {
    const { selectedMap, maleTime, femaleTime } = this.data;
    
    if (!selectedMap) {
      wx.showToast({ title: '请选择地图', icon: 'none' });
      return;
    }
    if (!maleTime) {
      wx.showToast({ title: '请输入男生时间线', icon: 'none' });
      return;
    }
    if (!femaleTime) {
      wx.showToast({ title: '请输入女生时间线', icon: 'none' });
      return;
    }
    
    const weekStart = this.getWeekStart();
    const weekEnd = this.getWeekEnd();
    
    wx.showLoading({ title: '📢 发布中...' });
    
    try {
      // 检查是否已存在
      const existRes = await db.collection('weekly_tasks')
        .where({ weekStart, weekEnd })
        .get();
      
      if (existRes.data.length > 0) {
        // 更新
        await db.collection('weekly_tasks').doc(existRes.data[0]._id).update({
          data: {
            map: selectedMap,
            maleTime: maleTime.trim(),
            femaleTime: femaleTime.trim(),
            published: true,
            updatedAt: db.serverDate()
          }
        });
      } else {
        // 创建新任务
        const newWeekStart = this.getWeekStart();
        const newWeekEnd = this.getWeekEnd();
        await db.collection('weekly_tasks').add({
          data: {
            map: selectedMap,
            maleTime: maleTime.trim(),
            femaleTime: femaleTime.trim(),
            maleScore: this.timeToMs(maleTime),
            femaleScore: this.timeToMs(femaleTime),
            weekStart: newWeekStart,
            weekEnd: newWeekEnd,
            published: true,
            createdAt: db.serverDate()
          }
        });
      }
      
      wx.showToast({ title: '发布成功', icon: 'success' });
      this.hideCreateModal();
      await this.loadCurrentTask();
      
    } catch (err) {
      console.error('发布失败', err);
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 复制任务到粘贴板
  copyTaskText() {
    const { currentTask, maleSubmissions, femaleSubmissions } = this.data;
    if (!currentTask) return;
    
    const weekStart = currentTask.weekStart;
    const weekEnd = currentTask.weekEnd;
    const map = currentTask.map;
    const maleTime = currentTask.maleTime;
    const femaleTime = currentTask.femaleTime;
    
    let text = `本周周图(${weekStart}~${weekEnd}):\n`;
    text += `==${map}==\n`;
    text += `男生👨🏻及格成绩：${maleTime}\n`;
    text += `女生👩🏻及格成绩：${femaleTime}\n`;
    text += `随机抽取5名幸运儿：11.11🧧\n`;
    text += `男女最快者🏆：18.88🧧\n`;
    text += `各位帅哥美女加油～\n`;
    text += `周图作业请交给double美女`;
    
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 添加成员成绩 (管理员)
  showAddModal() {
    if (!this.data.isAdmin) return;
    this.setData({
      showAddModal: true,
      form: {
        gameName: '',
        score: '',
        gender: 'male',
        passed: true
      },
      selectedMemberOpenid: ''
    });
  },

  hideAddModal() {
    this.setData({ showAddModal: false, selectedMemberOpenid: '' });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  // 管理员选择成员
  onMemberChange(e) {
    const index = e.detail.value;
    const member = this.data.allMembers[index];
    this.setData({
      selectedMemberOpenid: member._openid,
      'form.gameName': member.gameName
    });
  },

  onGenderChange(e) {
    this.setData({
      'form.gender': e.detail.value === 'male' ? 'male' : 'female'
    });
  },

  onPassedChange(e) {
    this.setData({
      'form.passed': e.detail.value === 'true'
    });
  },

  async submitScore() {
    const { form, currentTask, isAdmin, selectedMemberOpenid } = this.data;
    
    if (!isAdmin) {
      wx.showToast({ title: '仅管理员可添加', icon: 'none' });
      return;
    }
    if (!form.gameName.trim()) {
      wx.showToast({ title: '请选择或输入名字', icon: 'none' });
      return;
    }
    if (!form.score) {
      wx.showToast({ title: '请输入成绩', icon: 'none' });
      return;
    }
    
    const scoreMs = this.timeToMs(form.score);
    if (scoreMs === Infinity) {
      wx.showToast({ title: '成绩格式错误', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '📤 提交中...' });
    
    try {
      await db.collection('weekly_submissions').add({
        data: {
          taskId: currentTask._id,
          memberOpenid: selectedMemberOpenid || null,
          gameName: form.gameName.trim(),
          score: form.score,
          scoreMs: scoreMs,
          gender: form.gender,
          passed: form.passed !== false,
          createdAt: db.serverDate()
        }
      });
      
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.hideAddModal();
      await this.loadSubmissions(currentTask._id);
      
    } catch (err) {
      console.error('添加失败', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 编辑成绩
  showEditModal(e) {
    if (!this.data.isAdmin) return;
    const submission = e.currentTarget.dataset.submission;
    this.setData({
      showEditModal: true,
      editingSubmission: submission,
      form: {
        gameName: submission.gameName,
        score: submission.score,
        gender: submission.gender,
        passed: submission.passed !== false
      },
      selectedMemberOpenid: submission.memberOpenid || ''
    });
  },

  hideEditModal() {
    this.setData({ showEditModal: false, editingSubmission: null });
  },

  async updateScore() {
    const { form, editingSubmission, currentTask, selectedMemberOpenid } = this.data;
    
    if (!form.score) {
      wx.showToast({ title: '请输入成绩', icon: 'none' });
      return;
    }
    
    const scoreMs = this.timeToMs(form.score);
    if (scoreMs === Infinity) {
      wx.showToast({ title: '成绩格式错误', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '🔄 更新中...' });
    
    try {
      const updateData = {
        gameName: form.gameName.trim(),
        score: form.score,
        scoreMs: scoreMs,
        passed: form.passed !== false
      };
      
      // 如果选择了成员，更新 memberOpenid
      if (selectedMemberOpenid) {
        updateData.memberOpenid = selectedMemberOpenid;
      }
      
      await db.collection('weekly_submissions').doc(editingSubmission._id).update({
        data: updateData
      });
      
      wx.showToast({ title: '更新成功', icon: 'success' });
      this.hideEditModal();
      await this.loadSubmissions(currentTask._id);
      
    } catch (err) {
      console.error('更新失败', err);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 删除记录
  async deleteSubmission(e) {
    if (!this.data.isAdmin) return;
    
    const submission = e.currentTarget.dataset.submission;
    
    wx.showModal({
      title: '删除记录',
      content: `确定删除 ${submission.gameName} 的记录吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '🗑️ 删除中...' });
          
          try {
            await db.collection('weekly_submissions').doc(submission._id).remove();
            wx.showToast({ title: '已删除', icon: 'success' });
            await this.loadSubmissions(this.data.currentTask._id);
          } catch (err) {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
          
          wx.hideLoading();
        }
      }
    });
  },

  // 复制合格名单
  copyQualifiedList(e) {
    const { currentTask, maleSubmissions, femaleSubmissions } = this.data;
    if (!currentTask) return;
    
    // 从 event 获取 gender
    const gender = e.currentTarget.dataset.gender;
    
    const submissions = gender === 'male' ? maleSubmissions : femaleSubmissions;
    const genderText = gender === 'male' ? '男生' : '女生';
    const flag = gender === 'male' ? '🏆' : '👑';
    
    // 根据性别取对应的及格成绩
    const qualifiedTime = gender === 'male' ? currentTask.maleTime : currentTask.femaleTime;
    
    let text = `${genderText}周图作业:${currentTask.map}\n`;
    text += `及格成绩:${qualifiedTime}\n`;
    text += `注： ①仅限队号\n`;
    text += `②起止日期${currentTask.weekStart}~${currentTask.weekEnd}22:00点截止\n`;
    text += `③计时冲线截图或单排结算:\n`;
    
    // 固定列宽对齐
    const NAME_WIDTH = 16; // 名字列固定宽度（中文算2）
    
    submissions
      .filter((s) => s.passed !== false)
      .forEach((s) => {
      const fastFlag = s.isFastest ? flag : '';
      const name = s.gameName || '';
      const score = s.score || '';
      // 计算名字显示宽度（中文字符算2）
      const displayLen = name.replace(/[\u4e00-\u9fa5]/g, 'xx').length;
      const padding = ' '.repeat(Math.max(1, NAME_WIDTH - displayLen));
      text += `${name}${padding}${score}${fastFlag}\n`;
    });
    
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 时间转换为毫秒
  timeToMs(timeStr) {
    if (!timeStr) return Infinity;
    const parts = timeStr.split('.');
    if (parts.length !== 3) return Infinity;
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    const ms = parseInt(parts[2]) || 0;
    return minutes * 60000 + seconds * 1000 + ms;
  },

  stopPropagation() {},

  /** 可参与周图抽奖：已登记且未标记不及格（不按成绩是否压线筛选） */
  getQualifiedSubmissions() {
    const { maleSubmissions, femaleSubmissions } = this.data;
    const eligible = (sub) => sub.passed !== false;
    const out = [];
    maleSubmissions.forEach((s) => {
      if (eligible(s)) out.push(s);
    });
    femaleSubmissions.forEach((s) => {
      if (eligible(s)) out.push(s);
    });
    return out;
  },

  getLotteryPoolHint(qualifiedCount) {
    const { maleSubmissions, femaleSubmissions } = this.data;
    const total = maleSubmissions.length + femaleSubmissions.length;
    if (total === 0) return '';
    if (qualifiedCount >= total) {
      return `共 ${qualifiedCount} 人可抽奖`;
    }
    return `已登记 ${total} 人，${qualifiedCount} 人可抽奖（${total - qualifiedCount} 人已标不及格）`;
  },

  buildWheelVisuals(pool, labelRadiusRpx) {
    const n = pool.length;
    if (n === 0) {
      return { wheelBgStyle: '', namesLayerStyle: '', lotteryWheelItems: [], itemDeg: 0 };
    }
    const sectorDeg = 360 / n;
    const stops = [];
    for (let i = 0; i < n; i++) {
      const start = i * sectorDeg;
      const end = (i + 1) * sectorDeg;
      const fill = i % 2 === 0 ? WHEEL_PURPLE : WHEEL_GOLD;
      stops.push(`${fill} ${start}deg ${end}deg`);
    }
    // 内联写满定位与尺寸，避免 wxss 被误删时盘面不显示；样式类仍可叠加美化
    const wheelBgStyle = [
      `background:conic-gradient(from 0deg,${stops.join(',')})`,
      'position:absolute',
      'left:0',
      'top:0',
      'width:100%',
      'height:100%',
      'border-radius:50%'
    ].join(';');
    const namesLayerStyle =
      'position:absolute;left:0;top:0;width:100%;height:100%;border-radius:50%;pointer-events:none';
    const lotteryWheelItems = pool.map((sub, i) => {
      const midDeg = (i + 0.5) * sectorDeg;
      const labelTransform = `rotate(${midDeg}deg) translateY(-${labelRadiusRpx}rpx) rotate(${-midDeg}deg)`;
      return {
        _id: sub._id,
        gameName: sub.gameName || '未命名',
        labelTransform
      };
    });
    return { wheelBgStyle, namesLayerStyle, lotteryWheelItems, itemDeg: sectorDeg };
  },

  // 分享给朋友
  onShareAppMessage() {
    const { currentTask } = this.data;
    const mapName = currentTask ? currentTask.map : '周图任务';
    return {
      title: '本周周图 ' + mapName + ' 等你来完成！',
      path: '/pages/weekly/weekly',
      imageUrl: '/images/share-weekly.png'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { currentTask } = this.data;
    const mapName = currentTask ? currentTask.map : '周图任务';
    return {
      title: '本周周图 ' + mapName + ' 等你来完成！',
      query: 'from=timeline'
    };
  },

  // 抽奖功能：仅合格成员；扇区均分；指针在正上方；停转后展示中奖者；再来一次移除该成员
  startLottery() {
    if (this.data.isSpinning) return;
    if (this._lotteryFinishTimer) {
      clearTimeout(this._lotteryFinishTimer);
      this._lotteryFinishTimer = null;
    }

    const { lotteryHistory, lotteryPool, lotteryFinished, wheelLabelRadiusRpx } = this.data;
    const qualified = this.getQualifiedSubmissions();
    const lotteryPoolHint = this.getLotteryPoolHint(qualified.length);

    let pool =
      lotteryPool.length > 0
        ? lotteryPool.slice()
        : qualified.filter((sub) => !lotteryHistory.some((h) => h._id === sub._id));

    if (pool.length === 0) {
      if (qualified.length === 0) {
        wx.showToast({ title: '暂无合格成员可抽', icon: 'none' });
        return;
      }
      this.setData({
        showLotteryModal: true,
        lotteryWinner: null,
        lotteryFinished: true,
        lotteryWheelItems: [],
        wheelBgStyle: '',
        namesLayerStyle: '',
        itemDeg: 0,
        isSpinning: false,
        lotteryPoolHint
      });
      return;
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    const winner = pool[randomIndex];
    const n = pool.length;
    const sectorDeg = 360 / n;
    const sectorCenterDeg = (randomIndex + 0.5) * sectorDeg;
    const spinLaps = 5;
    const targetRotation = spinLaps * 360 - sectorCenterDeg;

    const { wheelBgStyle, namesLayerStyle, lotteryWheelItems, itemDeg } = this.buildWheelVisuals(
      pool,
      wheelLabelRadiusRpx
    );

    const spinDurationMs = 2600;

    const applySpin = () => {
      const animation = wx.createAnimation({
        duration: spinDurationMs,
        timingFunction: 'ease-out'
      });
      animation.rotate(targetRotation).step();
      this.setData({ animationData: animation.export() });
    };

    const finishSpin = () => {
      const newHistory = [...lotteryHistory, winner];
      const newPool = pool.filter((_, i) => i !== randomIndex);
      // 保持停转瞬间的盘面（含中奖扇区）；「再来一次」时再根据 newPool 重绘并清零角度
      this.setData({
        isSpinning: false,
        lotteryFinished: true,
        lotteryWinner: winner,
        lotteryPool: newPool,
        lotteryHistory: newHistory
      });
    };

    if (lotteryFinished) {
      const resetAnim = wx.createAnimation({ duration: 0, timingFunction: 'linear' });
      resetAnim.rotate(0).step();
      this.setData({
        lotteryFinished: false,
        lotteryWinner: null,
        isSpinning: true,
        showLotteryModal: true,
        lotteryPool: pool,
        wheelBgStyle,
        namesLayerStyle,
        lotteryWheelItems,
        itemDeg,
        lotteryPoolHint,
        animationData: resetAnim.export()
      });
      setTimeout(() => {
        applySpin();
        this._lotteryFinishTimer = setTimeout(finishSpin, spinDurationMs + 80);
      }, 60);
      return;
    }

    this.setData({
      isSpinning: true,
      lotteryFinished: false,
      showLotteryModal: true,
      lotteryPool: pool,
      wheelBgStyle,
      namesLayerStyle,
      lotteryWheelItems,
      itemDeg,
      lotteryPoolHint
    });

    const resetAnim = wx.createAnimation({ duration: 0, timingFunction: 'linear' });
    resetAnim.rotate(0).step();
    this.setData({ animationData: resetAnim.export() });

    setTimeout(() => {
      applySpin();
      if (this._lotteryFinishTimer) clearTimeout(this._lotteryFinishTimer);
      this._lotteryFinishTimer = setTimeout(finishSpin, spinDurationMs + 80);
    }, 60);
  },

  hideLotteryModal() {
    if (this._lotteryFinishTimer) {
      clearTimeout(this._lotteryFinishTimer);
      this._lotteryFinishTimer = null;
    }
    this.setData({
      showLotteryModal: false,
      lotteryFinished: false,
      animationData: {},
      isSpinning: false
    });
  },

  resetLottery() {
    if (this._lotteryFinishTimer) {
      clearTimeout(this._lotteryFinishTimer);
      this._lotteryFinishTimer = null;
    }
    this.setData({
      lotteryWinner: null,
      lotteryHistory: [],
      lotteryPool: [],
      lotteryFinished: false,
      animationData: {},
      lotteryWheelItems: [],
      wheelBgStyle: '',
      namesLayerStyle: '',
      itemDeg: 0
    });
  },

  // 显示修改目标弹窗
  showEditTargetModal() {
    const { currentTask, isAdmin } = this.data;
    
    if (!isAdmin) {
      wx.showToast({ title: '仅管理员可用', icon: 'none' });
      return;
    }
    
    this.setData({
      showEditTargetModal: true,
      editMaleTime: currentTask.maleTime || '',
      editFemaleTime: currentTask.femaleTime || ''
    });
  },

  hideEditTargetModal() {
    this.setData({ showEditTargetModal: false });
  },

  onTargetInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [field]: value
    });
  },

  async saveTarget() {
    const { currentTask, editMaleTime, editFemaleTime } = this.data;
    
    if (!editMaleTime || !editFemaleTime) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '保存中...' });
    
    try {
      await db.collection('weekly_tasks').doc(currentTask._id).update({
        data: {
          maleTime: editMaleTime,
          femaleTime: editFemaleTime
        }
      });
      
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.hideEditTargetModal();
      this.loadCurrentTask();
      
    } catch (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    
    wx.hideLoading();
  }

});
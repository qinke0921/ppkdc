// pages/index/index.js
const db = wx.cloud.database();

Page({
  data: {
    // Tab 切换
    activeTab: 'score', // score: 比赛分数记录, tools: 比赛工具栏
    
    competitions: [],
    filteredCompetitions: [],
    displayedCompetitions: [],
    currentPage: 1,
    itemsPerPage: 5,
    hasMore: false,
    searchQuery: '',
    filterType: 'all', // all, personal, team
    filterRule: 'all', // all, 千分赛, 抢分赛, 抢1赛, 1v1, 2v2, 3v3, 4v4
    filterStatus: 'all', // all, ongoing, finished
    showCreateModal: false,
    newCompetition: {
      name: '',
      type: 'personal', // personal | team
      rule: '千分赛', // 千分赛 | 抢分赛 | 抢1赛 | 1v1 | 2v2 | 3v3 | 4v4
      targetScore: 1000,
      description: ''
    }
  },

  onLoad() {
    // 确保云开发已初始化
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloudbase-0ga9zc1ub244d4ba',
        traceUser: true,
      });
    }
    this.loadCompetitions();
  },

  onShow() {
    if (this.data.activeTab === 'score') {
      this.loadCompetitions();
    }
  },

  // 切换 Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 跳转工具栏-按分组池分组
  goToGroupPool() {
    wx.navigateTo({
      url: '/pages/group-pool/group-pool'
    });
  },

  // 加载比赛列表
  async loadCompetitions() {
    wx.showLoading({ title: '🏀 加载中...' });
    
    try {
      const res = await db.collection('competitions')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      
      const competitions = res.data;
      this.setData({ competitions: competitions });
      this.applyFilters(); // 应用搜索和筛选
    } catch (err) {
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
    this.applyFilters();
  },

  // 筛选类型
  onFilterTypeChange(e) {
    this.setData({ filterType: e.currentTarget.dataset.type });
    this.applyFilters();
  },

  // 筛选规则
  onFilterRuleChange(e) {
    this.setData({ filterRule: e.currentTarget.dataset.rule });
    this.applyFilters();
  },

  // 筛选状态
  onFilterStatusChange(e) {
    this.setData({ filterStatus: e.currentTarget.dataset.status });
    this.applyFilters();
  },

  // 应用筛选
  applyFilters() {
    const { competitions, searchQuery, filterType, filterRule, filterStatus } = this.data;
    let filtered = [...competitions];

    // 按状态筛选
    if (filterStatus !== 'all') {
      filtered = filtered.filter(c => c.status === filterStatus);
    }

    // 按类型筛选
    if (filterType !== 'all') {
      filtered = filtered.filter(c => c.type === filterType);
    }

    // 按规则筛选
    if (filterRule !== 'all') {
      filtered = filtered.filter(c => c.rule === filterRule);
    }

    // 按名字模糊搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.name && c.name.toLowerCase().includes(query)
      );
    }

    this.setData({ 
      filteredCompetitions: filtered,
      currentPage: 1 
    });
    this.updateDisplayedCompetitions();
  },

  // 更新显示的比赛（分页）
  updateDisplayedCompetitions() {
    const { filteredCompetitions, currentPage, itemsPerPage } = this.data;
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const displayed = filteredCompetitions.slice(start, end);
    this.setData({
      displayedCompetitions: displayed,
      hasMore: end < filteredCompetitions.length
    });
  },

  // 加载更多
  loadMore() {
    if (this.data.hasMore) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.updateDisplayedCompetitions();
    }
  },

  // 收起/回到首页
  resetPage() {
    this.setData({ currentPage: 1 });
    this.updateDisplayedCompetitions();
  },

  // 显示创建弹窗
  showCreateModal() {
    this.setData({ showCreateModal: true });
  },

  // 隐藏创建弹窗
  hideCreateModal() {
    this.setData({ showCreateModal: false });
  },

  // 输入框绑定
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`newCompetition.${field}`]: value
    });
  },

  // 选择类型
  onTypeSelect(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.currentTarget.dataset.value;
    
    // 切换比赛类型时，自动调整规则和目标分数
    let update = { [`newCompetition.${field}`]: value };
    if (field === 'type') {
      if (value === 'team') {
        update['newCompetition.rule'] = '4v4';
        update['newCompetition.targetScore'] = 5; // 团队赛默认抢5分
      } else {
        update['newCompetition.rule'] = '千分赛';
        update['newCompetition.targetScore'] = 1000;
      }
    }
    
    this.setData(update);
  },

  // 创建比赛
  async createCompetition() {
    const { newCompetition } = this.data;
    
    if (!newCompetition.name.trim()) {
      wx.showToast({ title: '请输入比赛名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '✨ 创建中...' });

    try {
      await db.collection('competitions').add({
        data: {
          name: newCompetition.name,
          type: newCompetition.type,
          rule: newCompetition.rule,
          description: newCompetition.description || '',
          targetScore: parseInt(newCompetition.targetScore) || 1000,
          description: newCompetition.description || '',
          status: 'ongoing',
          createdAt: db.serverDate(),
          scores: {} // 玩家分数累计
        }
      });

      wx.showToast({ title: '创建成功', icon: 'success' });
      this.hideCreateModal();
      this.loadCompetitions();
      
    } catch (err) {
      console.error('创建失败', err);
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 进入比赛详情
  goToCompetition(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/competition/competition?id=${id}`
    });
  },

  // 打开腾讯云文档
  openTencentDoc() {
    const docUrl = 'https://docs.qq.com/sheet/DWWpvY3Fic05jRERz?tab=k3t7yp';
    
    // 尝试跳转到腾讯文档小程序
    wx.navigateToMiniProgram({
      appId: 'wx069ba97219f66d99', // 腾讯文档小程序AppId
      path: 'doc?tab=k3t7yp&url=' + encodeURIComponent(docUrl),
      envVersion: 'release',
      success: () => {
        console.log('跳转腾讯文档成功');
      },
      fail: (err) => {
        console.log('跳转失败，尝试其他方式', err);
        // 失败则复制链接
        wx.setClipboardData({
          data: docUrl,
          success: () => {
            wx.showToast({ title: '链接已复制，请在微信打开', icon: 'none' });
          }
        });
      }
    });
  }
});

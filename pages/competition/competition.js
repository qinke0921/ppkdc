// pages/competition/competition.js
const db = wx.cloud.database();
const dbCmd = db.command;
const { getPersonalScore, getTeamScore } = require('../../utils/score.js');

Page({
  methods: {
    stopPropagation() {}
  },
  data: {
    competition: null,
    rounds: [],
    players: [], // 已录入的选手列表
    
    // 报名相关
    myOpenId: '',
    isCreator: false, // 是否是创建者
    hasRegistered: false, // 是否已报名
    registrationStatus: '', // pending/approved/rejected
    registrations: [], // 报名列表（创建者可见）
    showRegisterModal: false, // 报名弹窗
    showManageRegistrationModal: false, // 管理报名弹窗
    newRegisterName: '', // 报名时填写的名字
    teamA: [], // 红队选手
    teamB: [], // 蓝队选手
    expandedRound: null, // 当前展开的回合ID
    gameStarted: false, // 比赛是否已开始
    startTimeStr: '-',
    endTimeStr: '-',
    totalScore: 0,
    maxScore: 0,
    allPlayers: [], // 所有选手列表（团队赛用）
    teamRankPlayers: [], // 名次选择（团队赛用）
    availablePlayers: [], // 可选选手列表（排除已选的）
    competitionId: '', // 比赛ID
    isCreator: true, // 是否是创建者（默认true，分享后可为false）
    
    showAddPlayersModal: false,
    showAddRoundModal: false,
    newPlayers: ['', '', '', '', '', '', '', ''], // 最多8人
    
    // 当前编辑的回合信息
    newRoundInfo: {
      mapName: '',
      hasTime: false
    },
    
    // 当前编辑的回合（团队赛用）
    newRound: {
      type: 'personal',
      winner: 'red',
      showRanks: false // 是否显示名次选择
    },
    
    // 当前编辑的玩家（从已录入的选手选择）
    editingPlayers: [
      { name: '', rank: 1, finished: true },
      { name: '', rank: 2, finished: true },
      { name: '', rank: 3, finished: true },
      { name: '', rank: 4, finished: true },
      { name: '', rank: 5, finished: true },
      { name: '', rank: 6, finished: true },
      { name: '', rank: 7, finished: true },
      { name: '', rank: 8, finished: true }
    ]
  },

  onLoad(options) {
    // 获取当前用户 openid
    this.getOpenId().then(() => {
      if (options.id) {
        this.setData({ competitionId: options.id });
        this.loadCompetition(options.id);
      }
    });
    
    // 启用分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 获取当前用户 openid - 暂时用模拟值
  async getOpenId() {
    // 暂时禁用云函数调用，用测试用 openid
    // try {
    //   const res = await wx.cloud.callFunction({ name: 'getOpenId' });
    //   this.setData({ myOpenId: res.result.openid });
    //   return res.result.openid;
    // } catch (err) {
    //   console.error('获取openid失败', err);
    //   return null;
    // }
    const mockOpenId = 'test_openid_' + Date.now();
    this.setData({ myOpenId: mockOpenId });
    return mockOpenId;
  },

  // 分享给朋友
  onShareAppMessage() {
    const { competition } = this.data;
    return {
      title: `${competition.name} - 跑跑卡丁车记分助手`,
      path: `/pages/competition/competition?id=${competition._id}`,
      imageUrl: '/images/WechatIMG29.jpg'
    };
  },

  // 加载比赛信息
  async loadCompetition(id) {
    wx.showLoading({ title: '🏀 加载中...' });
    
    try {
      const compRes = await db.collection('competitions').doc(id).get();
      const roundsRes = await db.collection('rounds')
        .where({ competitionId: id })
        .orderBy('roundNumber', 'asc')
        .get();
      
      const competition = compRes.data;
      
      // 判断当前用户是否是创建者 - 暂时禁用，用模拟判断
      // const isCreator = competition._openid === this.data.myOpenId;
      const isCreator = true; // 暂时默认是创建者，显示所有功能
      
      // 获取报名列表 - 暂时所有人都能看到所有报名（测试用）
      let registrations = [];
      let myRegistration = null;
      
      // 获取所有报名（暂时都获取，用于测试）
      const regRes = await db.collection('registrations')
        .where({ competitionId: id })
        .orderBy('createdAt', 'desc')
        .get();
      registrations = regRes.data;
      
      // 查找自己的报名（用模拟openid可能匹配不到，所以暂时显示未报名）
      // const myRegRes = await db.collection('registrations')
      //   .where({ 
      //     competitionId: id,
      //     _openid: this.data.myOpenId
      //   })
      //   .get();
      // if (myRegRes.data.length > 0) {
      //   myRegistration = myRegRes.data[0];
      // }
      
      // 获取已录入的选手
      const players = competition.players || [];
      const teamA = competition.teamA || [];
      const teamB = competition.teamB || [];
      
      // 格式化团队成员显示
      const formatTeam = (arr) => {
        if (!arr || arr.length === 0) return '未录入';
        return arr.map(t => t.name || t).join('、');
      };
      
      // 如果有teamA/teamB但没有players，从teamA/teamB重建players
      let allPlayers = players;
      if (players.length === 0 && (teamA.length > 0 || teamB.length > 0)) {
        allPlayers = [...teamA, ...teamB].map(t => t.name || t);
      }
      
      // 确保 allPlayers 是字符串数组
      if (competition.type === 'team') {
        allPlayers = [...teamA, ...teamB].map(t => t.name || t);
      }
      
      // 计算实时排名
      let ranking = [];
      if (competition.type === 'personal') {
        // 个人赛：按分数排列
        const scores = competition.scores || {};
        allPlayers.forEach(name => {
          if (scores[name] !== undefined) {
            ranking.push({ name: name, score: scores[name] });
          }
        });
        ranking.sort((a, b) => b.score - a.score);
      } else {
        // 团队赛：显示两队分数
        const scores = competition.scores || {};
        ranking = [
          { name: '🔴 红队', score: scores['红队'] || 0, isTeam: true },
          { name: '🔵 蓝队', score: scores['蓝队'] || 0, isTeam: true }
        ];
      }
      
      // 格式化时间
      const formatTime = (time) => {
        if (!time) return '-';
        if (typeof time === 'string') return time;
        // 处理云数据库的时间对象
        const date = time instanceof Date ? time : new Date(time);
        return date.toLocaleString('zh-CN', { 
          month: 'numeric', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      };
      
      // 格式化报名时间
      const formatRegTime = (time) => {
        if (!time) return '';
        if (typeof time === 'string') return time;
        const date = time instanceof Date ? time : new Date(time);
        return date.toLocaleString('zh-CN', { 
          month: 'numeric', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      };
      
      // 格式化报名列表中的时间
      registrations = registrations.map(r => ({
        ...r,
        createdAt: formatRegTime(r.createdAt)
      }));
      
      // 预先分组报名列表
      const pendingRegs = registrations.filter(r => r.status === 'pending');
      const approvedRegs = registrations.filter(r => r.status === 'approved');
      const rejectedRegs = registrations.filter(r => r.status === 'rejected');
      
      // 计算当前总分和最高分
      let totalScore = 0;
      let maxScore = 0;
      if (competition.scores) {
        const scoreValues = Object.values(competition.scores);
        totalScore = scoreValues.reduce((a, b) => a + b, 0);
        maxScore = Math.max(...scoreValues, 0);
      }
      
      this.setData({
        competition: competition,
        rounds: roundsRes.data,
        players: players,
        allPlayers: allPlayers,
        teamA: teamA,
        teamB: teamB,
        teamAStr: formatTeam(teamA),
        teamBStr: formatTeam(teamB),
        ranking: ranking,
        gameStarted: !!competition.startTime,
        startTimeStr: formatTime(competition.startTime),
        endTimeStr: formatTime(competition.endTime),
        totalScore: totalScore,
        maxScore: maxScore,
        // 报名相关
        isCreator: isCreator,
        hasRegistered: !!myRegistration,
        registrationStatus: myRegistration ? myRegistration.status : '',
        registrations: registrations,
        pendingRegs: pendingRegs,
        approvedRegs: approvedRegs,
        rejectedRegs: rejectedRegs
      });
    } catch (err) {
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // ========== 录入选手相关 ==========
  
  // 显示录入选手弹窗
  showAddPlayersModal() {
    const { players, competition, approvedRegs } = this.data;
    
    // 获取已批准的报名人列表（可选）
    const registeredPlayers = approvedRegs ? approvedRegs.map(r => r.name) : [];
    
    // 初始化输入框
    let newPlayers = [];
    let half = 2;
    if (competition.type === 'team') {
      // 团队赛：根据规则确定人数（必须满员）
      const rule = competition.rule;
      const count = rule === '1v1' ? 2 : rule === '2v2' ? 4 : rule === '3v3' ? 6 : 8;
      half = count / 2;
      // 初始化带排名的选手列表
      for (let i = 0; i < count; i++) {
        newPlayers.push({ name: '', rank: i + 1 });
      }
    } else {
      // 个人赛：默认8个位置，但可以不填满
      newPlayers = new Array(8).fill(null).map((_, i) => ({ name: '', rank: i + 1 }));
      half = 4;
    }
    
    // 如果已有选手，回填
    if (players.length > 0) {
      players.forEach((p, i) => {
        if (i < newPlayers.length) {
          if (typeof p === 'object' && p.name) {
            newPlayers[i] = p;
          } else if (typeof p === 'string') {
            newPlayers[i] = { name: p, rank: i + 1 };
          }
        }
      });
    }
    
    this.setData({
      showAddPlayersModal: true,
      newPlayers: newPlayers,
      half: half,
      registeredPlayers: registeredPlayers
    });
  },

  // 隐藏录入选手弹窗
  hideAddPlayersModal() {
    this.setData({ showAddPlayersModal: false });
  },

  // 从报名人列表添加选手
  addPlayerFromRegistered(e) {
    const name = e.currentTarget.dataset.name;
    const { newPlayers } = this.data;
    
    // 找到第一个空位填入
    for (let i = 0; i < newPlayers.length; i++) {
      if (!newPlayers[i].name || !newPlayers[i].name.trim()) {
        if (typeof newPlayers[i] === 'string') {
          newPlayers[i] = { name: name, rank: i + 1 };
        } else {
          newPlayers[i].name = name;
        }
        this.setData({ newPlayers: newPlayers });
        wx.showToast({ title: `已添加 ${name}`, icon: 'none' });
        return;
      }
    }
    wx.showToast({ title: '已满员', icon: 'none' });
  },

  // 输入新选手名字
  onNewPlayerInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const newPlayers = [...this.data.newPlayers];
    // 支持字符串（旧格式）或对象（新格式）
    if (typeof newPlayers[index] === 'string') {
      newPlayers[index] = { name: value, rank: index + 1 };
    } else {
      newPlayers[index].name = value;
    }
    this.setData({ newPlayers: newPlayers });
  },

  // 输入选手排名
  onRankInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const newPlayers = [...this.data.newPlayers];
    if (typeof newPlayers[index] === 'object') {
      newPlayers[index].rank = parseInt(value) || 0;
    } else {
      newPlayers[index] = { name: newPlayers[index], rank: parseInt(value) || 0 };
    }
    this.setData({ newPlayers: newPlayers });
  },

  // 保存选手
  async savePlayers() {
    const { competition, newPlayers } = this.data;
    // 提取有效选手（只保留有名字的）
    const players = newPlayers.filter(p => p && p.name && p.name.trim());
    
    if (players.length === 0) {
      wx.showToast({ title: '请至少输入一个选手', icon: 'none' });
      return;
    }

    // 团队赛：验证人数是否符合规则（必须满员）
    if (competition.type === 'team') {
      const rule = competition.rule;
      const requiredCount = parseInt(rule) * 2;
      // 提取有效选手
      const validPlayers = newPlayers.filter(p => p && p.name && p.name.trim());
      if (validPlayers.length !== requiredCount) {
        wx.showToast({ 
          title: `${rule}需要${requiredCount}名选手，当前${validPlayers.length}名`, 
          icon: 'none',
          duration: 2500 
        });
        return;
      }
    } else {
      // 个人赛：检查是否至少录入了1人
      const validPlayers = newPlayers.filter(p => p && p.name && p.name.trim());
      if (validPlayers.length === 0) {
        wx.showToast({ title: '请至少录入1名选手', icon: 'none' });
        return;
      }
    }

    wx.showLoading({ title: '💾 保存中...' });

    try {
      let dataToSave;
      
      if (competition.type === 'team') {
        // 团队赛：保存选手对象（包含名字和排名）
        // 提取有效选手
        const validPlayers = newPlayers.filter(p => p && p.name && p.name.trim());
        
        const half = validPlayers.length / 2;
        const teamA = validPlayers.slice(0, half);
        const teamB = validPlayers.slice(half);
        
        dataToSave = {
          teamA: teamA,
          teamB: teamB,
          players: validPlayers.map(p => p.name), // 保持兼容，只存名字
          scores: {
            '红队': 0,
            '蓝队': 0
          }
        };
      } else {
        // 个人赛：只保存有名字的选手
        const validPlayers = newPlayers.filter(p => p && p.name && p.name.trim());
        dataToSave = { 
          players: validPlayers.map(p => p.name)
        };
      }

      await db.collection('competitions').doc(competition._id).update({
        data: dataToSave
      });

      wx.showToast({ title: '保存成功', icon: 'success' });
      this.hideAddPlayersModal();
      this.loadCompetition(competition._id);
      
    } catch (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // ========== 添加成绩相关 ==========

  // 显示添加回合弹窗
  // 显示添加回合弹窗
  showAddRoundModal() {
    const { players, competition } = this.data;
    
    if (players.length === 0) {
      wx.showModal({
        title: '提示',
        content: '请先录入参赛选手',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    // 根据比赛类型初始化
    const myTeamA = this.data.teamA || [];
    const myTeamB = this.data.teamB || [];
    const myPlayers = this.data.players || [];
    
    if (competition.type === 'team') {
      // 团队赛：初始化两队选择（默认不选，需要手动选择）
      // 从 teamA 和 teamB 获取原始队伍信息
      const teamAWithIndex = myTeamA.map((t, i) => ({ name: '', originalName: t.name, team: 'red' }));
      const teamBWithIndex = myTeamB.map((t, i) => ({ name: '', originalName: t.name, team: 'blue' }));
      const allTeamPlayers = [...teamAWithIndex, ...teamBWithIndex];
      const teamRankPlayers = allTeamPlayers.map((p, index) => ({
        name: '',
        team: p.team,
        selectedIndex: -1
      }));
      
      this.setData({
        showAddRoundModal: true,
        'newRound.winner': 'red',
        'newRound.type': 'team',
        'newRound.showRanks': false,
        allPlayers: allTeamPlayers.map(p => p.originalName),
        teamRankPlayers: teamRankPlayers,
        availablePlayers: allTeamPlayers.map(p => p.originalName)
      });
    } else {
      // 个人赛：根据已录入的选手数量初始化（默认不选，需要手动选择）
      const playerCount = myPlayers.length;
      // 默认都是空的，需要手动选择
      const editingPlayers = [];
      for (let i = 0; i < playerCount; i++) {
        editingPlayers.push({ name: '', rank: i + 1, selectedIndex: -1 });
      }

      this.setData({
        showAddRoundModal: true,
        editingPlayers: editingPlayers,
        'newRound.type': 'personal',
        'newRoundInfo.mapName': '',
        'newRoundInfo.hasTime': false,
        availablePlayers: myPlayers
      });
    }
  },

  // 隐藏添加回合弹窗
  hideAddRoundModal() {
    this.setData({ showAddRoundModal: false });
  },

  // 更新玩家信息
  onPlayerInput(e) {
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    let value = field === 'finished' ? e.detail.checked : e.detail.value;
    
    // 修复 switch 组件关闭时返回 undefined 的问题
    if (field === 'finished' && (value === undefined || value === null)) {
      value = false;
    }
    value = Boolean(value);
    
    const key = `editingPlayers[${index}].${field}`;
    this.setData({ [key]: value });
    
    // 更新可选选手列表（排除已选的）
    if (field === 'name') {
      this.updateAvailablePlayers();
    }
  },

  // 更新可选选手列表（排除已选的）
  updateAvailablePlayers() {
    const { editingPlayers, players } = this.data;
    // 获取已选的选手名字
    const selectedNames = editingPlayers
      .filter(p => p.name)
      .map(p => p.name);
    
    // 过滤出未选的选手
    const availablePlayers = players.filter(p => !selectedNames.includes(p));
    this.setData({ availablePlayers: availablePlayers });
  },

  // 选择选手
  onPlayerSelect(e) {
    const index = e.currentTarget.dataset.index;
    const playerIndex = e.detail.value;
    // 从 availablePlayers 获取选中的选手（过滤后的列表）
    const playerName = this.data.availablePlayers[playerIndex];
    
    this.setData({
      [`editingPlayers[${index}].name`]: playerName,
      [`editingPlayers[${index}].selectedIndex`]: playerIndex
    });
    
    // 更新可选选手列表
    this.updateAvailablePlayers();
  },

  // 输入地图名称
  onMapInput(e) {
    this.setData({
      'newRoundInfo.mapName': e.detail.value
    });
  },

  // 选择获胜队伍（团队赛）
  onWinnerSelect(e) {
    const winner = e.currentTarget.dataset.winner;
    this.setData({
      'newRound.winner': winner
    });
  },

  // 切换显示名次选择（团队赛）
  toggleShowRanks() {
    const current = this.data.newRound.showRanks;
    this.setData({
      'newRound.showRanks': !current
    });
  },

  // 选择团队选手名次
  onTeamPlayerSelect(e) {
    const index = e.currentTarget.dataset.index;
    const playerIndex = e.detail.value;
    const playerName = this.data.availablePlayers[playerIndex];
    const teamRankPlayers = [...this.data.teamRankPlayers];
    
    // 根据选中的选手名字，从原始数据中找到对应的队伍
    let playerTeam = 'red'; // 默认
    const myTeamA = this.data.teamA || [];
    const myTeamB = this.data.teamB || [];
    // 检查是否在红队
    const teamAMatch = myTeamA.find(t => t.name === playerName);
    if (teamAMatch) {
      playerTeam = 'red';
    } else {
      const teamBMatch = myTeamB.find(t => t.name === playerName);
      if (teamBMatch) {
        playerTeam = 'blue';
      }
    }
    
    teamRankPlayers[index] = {
      name: playerName,
      team: playerTeam,
      selectedIndex: playerIndex
    };
    this.setData({ teamRankPlayers: teamRankPlayers });
    
    // 更新可用选手列表
    this.updateTeamAvailablePlayers();
  },

  // 更新团队赛可用选手列表
  updateTeamAvailablePlayers() {
    const { teamRankPlayers, allPlayers } = this.data;
    const selectedNames = teamRankPlayers.filter(p => p.name).map(p => p.name);
    const availablePlayers = allPlayers.filter(p => !selectedNames.includes(p));
    this.setData({ availablePlayers: availablePlayers });
  },

  // 手动添加成绩
  async addManualResult() {
    const { competition, editingPlayers, newRound, teamA, teamB, players } = this.data;
    
    wx.showLoading({ title: '💾 保存中...' });

    try {
      const roundNumber = competition.currentRound || 0;
      const { newRoundInfo } = this.data;
      
      if (competition.type === 'team') {
        // 团队赛：记录哪队赢了
        const winner = newRound.winner || 'red';
        const winTeam = winner === 'red' ? '红队' : '蓝队';
        
        // 获取填写的名次（可选）
        const teamRankPlayers = this.data.teamRankPlayers || [];
        const teamResultsFilled = teamRankPlayers.filter(p => p.name);
        
        // 改为可选，不再强制要求全部填写
        
        const teamResults = teamResultsFilled.map(p => ({
          name: p.name,
          team: p.team
        }));
        const teamANames = teamResults.filter(p => p.team === 'red').map(p => p.name);
        
        await db.collection('rounds').add({
          data: {
            competitionId: competition._id,
            roundNumber: roundNumber + 1,
            type: 'team',
            mapName: newRoundInfo.mapName || '',
            winner: winner,
            winTeam: winTeam,
            teamA: teamA,
            teamB: teamB,
            teamResults: teamResults,
            teamANames: teamANames,
            createdAt: db.serverDate()
          }
        });

        // 更新队伍分数
        const updateData = {
          currentRound: roundNumber + 1
        };
        updateData[`scores.${winTeam}`] = dbCmd.inc(1);
        
        await db.collection('competitions').doc(competition._id).update({
          data: updateData
        });
        
        // 团队赛检查结束条件
        const teamScores = { ...competition.scores };
        teamScores[winTeam] = (teamScores[winTeam] || 0) + 1;
        await this.checkAndFinishCompetition(competition, teamScores);
        
      } else {
        // 个人赛：记录选手成绩
        // 遍历所有已录入的选手，未选择的视为未完成(-3分)
        const playerCount = players.length;
        
        // 构建选手名次映射（从editingPlayers中获取已选择的选手）
        const playerRankMap = {}; // {选手名: 名次}
        editingPlayers.forEach((p, index) => {
          if (p.name && p.name.trim()) {
            playerRankMap[p.name] = index + 1;
          }
        });

        // 检查是否有重复选手
        const selectedNames = Object.keys(playerRankMap);
        const nameCount = {};
        selectedNames.forEach(name => {
          nameCount[name] = (nameCount[name] || 0) + 1;
        });
        const duplicateName = Object.keys(nameCount).find(name => nameCount[name] > 1);
        if (duplicateName) {
          wx.hideLoading();
          wx.showToast({ title: `选手「${duplicateName}」重复选择了`, icon: 'none', duration: 2500 });
          return;
        }

        // 计算得分（遍历所有选手，选中的按名次计算，未选的有效-3分）
        let scores = {};
        let playerScores = [];
        
        players.forEach((playerName, index) => {
          const rank = playerRankMap[playerName];
          let finished = !!rank; // 选中了就是完成了，没选中就是未完成
          const score = getPersonalScore(rank || 8, finished, competition.rule); // 未完成的传8（最后一名）
          scores[playerName] = score;
          playerScores.push({
            name: playerName,
            rank: rank || 0, // 0表示未参与
            score: score,
            finished: finished
          });
        });

        await db.collection('rounds').add({
          data: {
            competitionId: competition._id,
            roundNumber: roundNumber + 1,
            type: 'personal',
            mapName: newRoundInfo.mapName || '',
            results: playerScores,
            createdAt: db.serverDate()
          }
        });

        // 更新比赛数据（累加分数）
        let updateData = {};
        let newTotalScores = {};
        
        Object.keys(scores).forEach(name => {
          const oldScore = competition.scores ? (competition.scores[name] || 0) : 0;
          const newScore = oldScore + scores[name];
          updateData[`scores.${name}`] = newScore;
          newTotalScores[name] = newScore;
        });
        updateData.currentRound = roundNumber + 1;
        
        await db.collection('competitions').doc(competition._id).update({
          data: updateData
        });
        
        // 检查是否达到结束条件 - 使用累加后的分数
        await this.checkAndFinishCompetition(competition, newTotalScores);
      }

      wx.showToast({ title: '添加成功', icon: 'success' });
      this.hideAddRoundModal();
      this.loadCompetition(competition._id);
      
    } catch (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // ========== 比赛操作 ==========

  // 开始比赛
  async startGame() {
    const { competition } = this.data;
    
    if (competition.startTime) {
      wx.showToast({ title: '比赛已开始过了', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '▶️ 开始中...' });

    try {
      await db.collection('competitions').doc(competition._id).update({
        data: { 
          startTime: db.serverDate(),
          status: 'ongoing'
        }
      });
      
      wx.showToast({ title: '比赛开始！', icon: 'success' });
      
      // 发送报名通知 - 暂时禁用
      // this.sendStartNotification();
      
      this.loadCompetition(competition._id);
    } catch (err) {
      console.error('开始失败', err);
      wx.showToast({ title: '开始失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 发送比赛开始通知
  async sendStartNotification() {
    const { competition, registrations } = this.data;
    
    // 获取需要通知的人（pending 和 approved 状态的报名者）
    const notifyList = registrations.filter(r => 
      r.status === 'pending' || r.status === 'approved'
    );
    
    if (notifyList.length === 0) return;
    
    try {
      await wx.cloud.callFunction({
        name: 'sendNotification',
        data: {
          competitionId: competition._id,
          competitionName: competition.name,
          type: 'competition_start',
          openids: notifyList.map(r => r._openid)
        }
      });
    } catch (err) {
      console.error('发送通知失败', err);
      // 通知失败不影响主流程
    }
  },

  // 结束比赛
  async finishCompetition() {
    const { competition } = this.data;
    
    wx.showModal({
      title: '确认',
      content: '确定要结束比赛吗？',
      success: async (res) => {
        if (res.confirm) {
          await db.collection('competitions').doc(competition._id).update({
            data: { 
              status: 'finished',
              endTime: db.serverDate()
            }
          });
          this.loadCompetition(competition._id);
          wx.showToast({ title: '比赛已结束', icon: 'success' });
        }
      }
    });
  },

  // 编辑描述
  editDescription() {
    const competition = this.data.competition;
    wx.showModal({
      title: '编辑描述',
      placeholderText: '请输入比赛描述',
      editable: true,
      value: competition.description || '',
      success: async (res) => {
        if (res.confirm && res.content !== undefined) {
          try {
            await db.collection('competitions').doc(competition._id).update({
              data: { description: res.content }
            });
            wx.showToast({ title: '保存成功', icon: 'success' });
            this.loadCompetition(competition._id);
          } catch (err) {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 检查比赛是否达到结束条件
  async checkAndFinishCompetition(competition, scores) {
    if (competition.status !== 'ongoing') return false;
    
    const { rule, targetScore, type } = competition;
    if (!rule || !targetScore) {
      return false;
    }
    
    const target = parseInt(targetScore) || 0;
    
    let shouldFinish = false;
    let finishReason = '';
    
    if (type === 'team') {
      // 团队赛：抢X分
      const teamScores = [scores['红队'] || 0, scores['蓝队'] || 0];
      const maxTeamScore = Math.max(...teamScores);
      if (maxTeamScore >= target) {
        shouldFinish = true;
        finishReason = `团队赛抢${target}分达成`;
      }
    } else if (type === 'personal') {
      const scoreValues = Object.values(scores || {});
      const totalScore = scoreValues.reduce((a, b) => a + b, 0);
      const maxScore = Math.max(...scoreValues, 0);
      
      if (rule === '千分赛') {
        // 所有人分数总和达到目标
        if (totalScore >= target) {
          shouldFinish = true;
          finishReason = `千分赛总分达到${target}分`;
        }
      } else if (rule === '抢分赛' || rule === '抢1赛') {
        // 最高分达到目标
        if (maxScore >= target) {
          shouldFinish = true;
          finishReason = `${rule}达到${target}分`;
        }
      }
    }
    
    if (shouldFinish) {
      try {
        await db.collection('competitions').doc(competition._id).update({
          data: { 
            status: 'finished',
            endTime: db.serverDate(),
            finishReason: finishReason
          }
        });
        wx.showToast({ title: `比赛已结束！${finishReason}`, icon: 'success', duration: 3000 });
        return true;
      } catch (err) {
        console.error('自动结束失败', err);
      }
    }
    return false;
  },
  toggleRound(e) {
    const roundId = e.currentTarget.dataset.id;
    const current = this.data.expandedRound;
    this.setData({
      expandedRound: current === roundId ? null : roundId
    });
  },

  // ========== 报名相关 ==========

  // 显示报名弹窗
  showRegisterModal() {
    if (this.data.hasRegistered) return;
    this.setData({ 
      showRegisterModal: true,
      newRegisterName: '' 
    });
  },

  // 隐藏报名弹窗
  hideRegisterModal() {
    this.setData({ showRegisterModal: false });
  },

  // 输入报名名字
  onRegisterNameInput(e) {
    this.setData({ newRegisterName: e.detail.value });
  },

  // 提交报名
  async submitRegistration() {
    const { newRegisterName, competition, myOpenId } = this.data;
    
    if (!newRegisterName.trim()) {
      wx.showToast({ title: '请输入名字', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '报名中...' });

    try {
      // 检查是否已报名 - 暂时禁用（因为用模拟openid）
      // const existing = await db.collection('registrations')
      //   .where({ 
      //     competitionId: competition._id,
      //     _openid: myOpenId
      //   })
      //   .get();
      
      // if (existing.data.length > 0) {
      //   wx.showToast({ title: '你已经报过名了', icon: 'none' });
      //   wx.hideLoading();
      //   return;
      // }

      await db.collection('registrations').add({
        data: {
          competitionId: competition._id,
          name: newRegisterName.trim(),
          status: 'pending', // pending/approved/rejected
          // _openid: myOpenId, // 暂时去掉，需要云数据库配置索引
          createdAt: db.serverDate()
        }
      });

      wx.showToast({ title: '报名成功！', icon: 'success' });
      this.hideRegisterModal();
      this.loadCompetition(competition._id);
      
    } catch (err) {
      console.error('报名失败', err);
      wx.showToast({ title: '报名失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 取消报名
  async cancelRegistration() {
    const { competition, myOpenId } = this.data;
    
    wx.showModal({
      title: '确认',
      content: '确定要取消报名吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '✈️ 取消中...' });
          
          try {
            // 查找并删除报名记录 - 暂时用名字匹配
            const name = this.data.newRegisterName || this.data.newRegisterName; // 需要记录报名时填的名字
            const reg = await db.collection('registrations')
              .where({ 
                competitionId: competition._id
              })
              .get();
            
            if (reg.data.length > 0) {
              await db.collection('registrations').doc(reg.data[0]._id).remove();
            }
            
            wx.showToast({ title: '已取消报名', icon: 'success' });
            this.loadCompetition(competition._id);
            
          } catch (err) {
            console.error('取消报名失败', err);
            wx.showToast({ title: '取消失败', icon: 'none' });
          }
          
          wx.hideLoading();
        }
      }
    });
  },

  // 显示管理报名弹窗
  showManageRegistrationModal() {
    this.setData({ showManageRegistrationModal: true });
  },

  // 隐藏管理报名弹窗
  hideManageRegistrationModal() {
    this.setData({ showManageRegistrationModal: false });
  },

  // 录取报名人
  async approveRegistration(e) {
    const regId = e.currentTarget.dataset.id;
    const regName = e.currentTarget.dataset.name;
    
    wx.showLoading({ title: '⏳ 处理中...' });
    
    try {
      await db.collection('registrations').doc(regId).update({
        data: { status: 'approved' }
      });
      
      wx.showToast({ title: `已录取 ${regName}`, icon: 'success' });
      this.loadCompetition(this.data.competition._id);
      
    } catch (err) {
      console.error('录取失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 拒绝报名人
  async rejectRegistration(e) {
    const regId = e.currentTarget.dataset.id;
    const regName = e.currentTarget.dataset.name;
    
    wx.showModal({
      title: '确认拒绝',
      content: `确定拒绝 ${regName} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '⏳ 处理中...' });
          
          try {
            await db.collection('registrations').doc(regId).update({
              data: { status: 'rejected' }
            });
            
            wx.showToast({ title: '已拒绝', icon: 'success' });
            this.loadCompetition(this.data.competition._id);
            
          } catch (err) {
            console.error('拒绝失败', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
          
          wx.hideLoading();
        }
      }
    });
  },

  // 使用报名人（添加到选手列表）
  async useRegistration(e) {
    const regId = e.currentTarget.dataset.id;
    const regName = e.currentTarget.dataset.name;
    const { competition, players } = this.data;
    
    // 检查是否已达人数上限
    if (competition.type === 'personal' && players.length >= 8) {
      wx.showToast({ title: '个人赛最多8人', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '⏳ 处理中...' });
    
    try {
      // 更新为已录取状态
      await db.collection('registrations').doc(regId).update({
        data: { status: 'approved' }
      });
      
      // 添加到选手列表
      const newPlayers = [...players, regName];
      await db.collection('competitions').doc(competition._id).update({
        data: { players: newPlayers }
      });
      
      wx.showToast({ title: `已添加到选手列表`, icon: 'success' });
      this.loadCompetition(competition._id);
      
    } catch (err) {
      console.error('添加选手失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    
    wx.hideLoading();
  },

  // 修改报名人名字
  async editRegistrationName(e) {
    const regId = e.currentTarget.dataset.id;
    const currentName = e.currentTarget.dataset.name;
    
    wx.showModal({
      title: '修改名字',
      placeholderText: '请输入新名字',
      editable: true,
      value: currentName,
      success: async (res) => {
        if (res.confirm && res.content && res.content.trim() !== currentName) {
          wx.showLoading({ title: '💾 保存中...' });
          
          try {
            await db.collection('registrations').doc(regId).update({
              data: { name: res.content.trim() }
            });
            
            wx.showToast({ title: '已修改', icon: 'success' });
            this.loadCompetition(this.data.competition._id);
            
          } catch (err) {
            console.error('修改失败', err);
            wx.showToast({ title: '修改失败', icon: 'none' });
          }
          
          wx.hideLoading();
        }
      }
    });
  }
});

// pages/group-pool/group-pool.js
Page({
  data: {
    // 分组池列表
    pools: [],
    
    // 新建分组池表单
    showAddModal: false,
    newPool: {
      name: '',
      color: '#FF6B6B',
      drawCount: 1,
      members: ''
    },
    
    // 颜色选项
    colorOptions: [
      { name: '红色', value: '#FF6B6B' },
      { name: '橙色', value: '#FF9F43' },
      { name: '黄色', value: '#Feca57' },
      { name: '绿色', value: '#48dbfb' },
      { name: '蓝色', value: '#54a0ff' },
      { name: '紫色', value: '#5f27cd' },
      { name: '粉色', value: '#ff9ff3' },
      { name: '灰色', value: '#8395a7' }
    ],
    
    // 抽签结果（多次抽签的累积）
    allDrawResults: [],
    
    // 当前抽签结果（用于显示）
    drawResult: [],
    
    // 抽签结果文本（用于复制）
    resultText: ''
  },

  onLoad() {
    // 可以在这里加载保存的数据，目前不需要
  },

  // 显示添加分组池弹窗
  showAddModal() {
    this.setData({
      showAddModal: true,
      newPool: {
        name: '',
        color: '#FF6B6B',
        drawCount: 1,
        members: ''
      }
    });
  },

  // 人数减
  onCountMinus() {
    if (this.data.newPool.drawCount > 1) {
      this.setData({
        'newPool.drawCount': this.data.newPool.drawCount - 1
      });
    }
  },

  // 人数加
  onCountPlus() {
    this.setData({
      'newPool.drawCount': this.data.newPool.drawCount + 1
    });
  },

  // 隐藏添加弹窗
  hideAddModal() {
    this.setData({ showAddModal: false });
  },

  // 输入新分组池信息
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    let value = e.detail.value;
    
    if (field === 'drawCount') {
      value = parseInt(value) || 1;
    }
    
    this.setData({
      [`newPool.${field}`]: value
    });
  },

  // 选择颜色
  onColorSelect(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ 'newPool.color': color });
  },

  // 添加分组池
  addPool() {
    const { newPool, pools } = this.data;
    
    if (!newPool.name.trim()) {
      wx.showToast({ title: '请输入分组池名称', icon: 'none' });
      return;
    }
    
    if (!newPool.members.trim()) {
      wx.showToast({ title: '请输入成员', icon: 'none' });
      return;
    }
    
    // 解析成员列表
    const members = newPool.members.split(/[\s,，]+/).filter(m => m.trim()).map(name => ({
      name: name.trim(),
      used: false
    }));
    
    if (members.length < newPool.drawCount) {
      wx.showToast({ title: '成员数不能少于抽签人数', icon: 'none' });
      return;
    }
    
    const pool = {
      id: Date.now(),
      name: newPool.name,
      color: newPool.color,
      drawCount: newPool.drawCount,
      members: members,
      totalCount: members.length
    };
    
    this.setData({
      pools: [...pools, pool],
      showAddModal: false
    });
    
    wx.showToast({ title: '添加成功', icon: 'success' });
  },

  // 删除分组池
  deletePool(e) {
    const id = e.currentTarget.dataset.id;
    const pools = this.data.pools.filter(p => p.id !== id);
    this.setData({ pools });
  },

  // 执行抽签
  doDraw() {
    const { pools } = this.data;
    
    if (pools.length === 0) {
      wx.showToast({ title: '请先添加分组池', icon: 'none' });
      return;
    }
    
    // 检查每个分组池是否有足够未使用的成员
    for (const pool of pools) {
      const available = pool.members.filter(m => !m.used).length;
      if (available < pool.drawCount) {
        wx.showToast({ title: `${pool.name}成员不足`, icon: 'none' });
        return;
      }
    }
    
    const result = [];
    
    // 从每个分组池随机抽取
    pools.forEach(pool => {
      const available = pool.members.filter(m => !m.used);
      
      // 随机打乱
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      
      // 抽取指定数量
      const drawn = available.slice(0, pool.drawCount);
      drawn.forEach(member => {
        result.push({
          name: member.name,
          poolName: pool.name,
          poolColor: pool.color,
          poolId: pool.id
        });
        
        // 标记为已使用
        const memberIndex = pool.members.findIndex(m => m.name === member.name);
        if (memberIndex !== -1) {
          pool.members[memberIndex].used = true;
        }
      });
    });
    
    // 更新 pools 状态
    this.setData({ pools });
    
    // 生成结果文本
    const resultText = result.map((r, i) => `${i + 1}. ${r.name} (${r.poolName})`).join('\n');
    
    // 添加到累积结果中
    const newAllResults = [...this.data.allDrawResults, {
      id: Date.now(),
      results: result,
      text: resultText
    }];
    
    // 生成完整复制文本
    const fullText = newAllResults.map((r, i) => `第${i + 1}组：\n${r.text}`).join('\n\n');
    
    this.setData({
      drawResult: result,
      allDrawResults: newAllResults,
      resultText: `分组结果：\n${fullText}`
    });
  },

  // 复制结果到剪贴板
  copyResult() {
    if (this.data.drawResult.length === 0) {
      wx.showToast({ title: '暂无分组结果', icon: 'none' });
      return;
    }
    
    wx.setClipboardData({
      data: this.data.resultText,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      }
    });
  },

  // 重置（清空所有）
  resetAll() {
    wx.showModal({
      title: '确认重置',
      content: '确定要清空所有分组池和抽签结果吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            pools: [],
            drawResult: [],
            resultText: ''
          });
        }
      }
    });
  },

  // 重置抽签结果（清空成员使用状态）
  resetDraw() {
    // 重置所有成员的 used 状态
    const pools = this.data.pools.map(pool => ({
      ...pool,
      members: pool.members.map(m => ({ ...m, used: false }))
    }));
    
    this.setData({
      pools,
      drawResult: [],
      allDrawResults: [],
      resultText: ''
    });
    
    wx.showToast({ title: '已重置抽签结果', icon: 'success' });
  }
});

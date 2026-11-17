// utils/score.js - 积分规则配置

// 个人赛单局得分表
const PERSONAL_SCORES = {
  1: 10,
  2: 7,
  3: 5,
  4: 4,
  5: 3,
  6: 1,
  7: 0,
  8: -1
};

// 抢1赛得分：只有第1名1分，其他0分
const Qiang1_SCORES = {
  1: 1,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0
};

// 未完赛得分
const NOT_FINISHED_SCORE = -3;

/**
 * 计算个人赛得分
 * @param {number} rank 排名 1-8
 * @param {boolean} finished 是否完赛
 * @param {string} rule 比赛规则类型
 */
function getPersonalScore(rank, finished = true, rule = 'normal') {
  if (!finished) return NOT_FINISHED_SCORE;
  
  // 抢1赛：只有第1名1分
  if (rule === '抢1赛') {
    return Qiang1_SCORES[rank] || 0;
  }
  
  return PERSONAL_SCORES[rank] || 0;
}

/**
 * 团队赛得分（赢+1分，输+0分）
 */
function getTeamScore(isWin) {
  return isWin ? 1 : 0;
}

/**
 * 检查比赛是否结束
 * @param {object} competition 比赛对象
 * @param {object} scores 当前分数
 */
function checkCompetitionEnd(competition, scores) {
  const { type, rule, targetScore } = competition;
  
  if (type === 'personal') {
    // 个人赛
    if (rule === '千分赛') {
      // 有人达到1000分结束
      return Object.values(scores).some(s => s >= 1000);
    } else if (rule === '抢分赛' || rule === '抢1赛') {
      // 达到目标分结束
      const target = parseInt(targetScore) || 100;
      return Object.values(scores).some(s => s >= target);
    }
  } else {
    // 团队赛 - 抢X分
    const target = parseInt(targetScore) || 5;
    // 团队赛分数格式可能是 {红队: x, 蓝队: y}
    const teamScores = Object.values(scores);
    return teamScores.some(s => s >= target);
  }
  
  return false;
}

module.exports = {
  PERSONAL_SCORES,
  Qiang1_SCORES,
  NOT_FINISHED_SCORE,
  getPersonalScore,
  getTeamScore,
  checkCompetitionEnd
};

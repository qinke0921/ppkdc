# PLAY.CLUB

车队管理与赛事工具小程序（微信小程序 + 云开发）。面向跑跑卡丁车车队日常运营：记录比赛积分、查询地图分线成绩、管理车队成员与车队活动。

> 本仓库自 `baseline-mature` 标签起纳入版本管理，该标签保存了新功能开发前的线上稳定版本快照，可随时回滚对照。

---

## 功能模块

| 页面 | 路径 | 说明 |
|---|---|---|
| 落地页 | `pages/landing` | 首屏入口，未加入车队的用户引导 |
| 比赛记录 | `pages/index` | 比赛列表与新建比赛，TabBar 主页 |
| 比赛详情 | `pages/competition` | 逐局录入名次，按规则实时累计积分并判定胜负 |
| 分线查询 | `pages/line` | 地图分线成绩查询，TabBar 之一 |
| PLAY 车队 | `pages/team` | 成员列表、入队申请审批、成员状态管理，TabBar 之一 |
| 车队主页 | `pages/home` | 车队概览与快捷入口 |
| 分组池 | `pages/group-pool` | 按颜色/分组管理队员，支持抽签分组 |
| 今日交流 | `pages/exchange` | 日常交流/约跑登记与名单管理 |
| 周图任务 | `pages/weekly` | 每周任务发布与成员提交 |
| 车队活动 | `pages/activities/list` `detail` `edit` | 活动发布、报名、奖品设置、详情查看 |
| 历史记录 | `pages/history` | 个人历史比赛与积分变动 |
| 关于 | `pages/about` | 版本与说明 |

## 技术栈

- **前端**：微信小程序原生框架（WXML / WXSS / JS，无第三方 UI 库）
- **后端**：微信云开发 —— 云函数（Node.js + `wx-server-sdk`）+ 云数据库（文档型）
- **数据处理**：Python 3（`requests`），负责分线数据抓取与批量导入

## 目录结构

```
.
├── app.js                    # 小程序入口，初始化云开发环境
├── app.json                  # 页面注册、TabBar、窗口配置
├── project.config.json       # 开发者工具项目配置（含 AppID、云函数根目录）
├── pages/                    # 14 个页面
├── cloudfunctions/           # 19 个云函数，每个独立部署
├── utils/
│   ├── db.js                 # 分批拉取全量数据（规避单次 20 条上限）、级联删除
│   ├── score.js              # 积分规则配置与结算/结束判定
│   └── loading.js            # 统一 loading 封装
├── python/
│   ├── scrape_one_drift_map.py  # 抓取分线数据 → CSV
│   ├── import_lines.py          # CSV 导入云数据库
│   ├── requirements.txt
│   └── 分线表.csv               # 抓取产物
└── images/                   # 图片资源
```

## 快速开始

### 1. 环境要求

- 微信开发者工具（稳定版）
- 基础库 ≥ 2.21.0
- Node.js（仅用于云函数依赖安装）
- Python 3.9+（仅数据处理脚本需要）

### 2. 导入项目

```bash
git clone git@github.com:qinke0921/ppkdc.git
```

用微信开发者工具「导入项目」选择仓库根目录，AppID 使用 `project.config.json` 中已有的 `wx5dea43ca0eef06b8`（需获得该小程序的管理员权限）。

> `project.private.config.json` 为个人本地配置，已被 `.gitignore` 排除，不随仓库分发。

### 3. 绑定云开发环境

`app.js` 中已写死云环境 ID：

```js
wx.cloud.init({ env: 'cloudbase-0ga9zc1ub244d4ba', traceUser: true })
```

若需切换到自己的测试环境，修改此处 `env` 即可（后续计划抽成配置项）。

### 4. 部署云函数

每个云函数目录独立安装依赖并上传：

```bash
cd cloudfunctions/getAllMaps
npm install
```

然后在开发者工具中右键该云函数目录 → **上传并部署：云端安装依赖**。

首次部署后需在云开发控制台按「数据库集合」一节创建集合，并配置相应权限。

## 云函数清单

| 云函数 | 作用 |
|---|---|
| `getOpenId` | 获取当前用户 OpenID |
| `getAllMembers` / `getMyMemberInfo` | 读取全部成员 / 当前成员资料 |
| `approveMember` | 审批入队申请，写入正式成员表 |
| `updateMemberStatus` | 变更成员状态（在队/离队等） |
| `getAllMaps` | 读取地图与分线基准数据 |
| `getAllLineRecords` / `getMyLineRecords` / `getMemberLineRecords` | 全量 / 本人 / 指定成员的分线记录 |
| `batchUpdateLineRecords` | 批量写入分线记录 |
| `updateFenxian` | 更新分线数据 |
| `importMapData` | 导入地图与分线基准数据 |
| `initExchange` / `updateExchange` | 今日交流的初始化与更新 |
| `deleteRegistration` | 删除报名记录并维护关联数据 |
| `sendNotification` | 订阅消息推送（比赛开始等事件） |
| `fixJoinedAt` / `fixMapName` / `fixMapNames` | **一次性数据修复脚本**，历史遗留，日常勿调用（`fixMapName` 已被 `fixMapNames` 取代） |

## 数据库集合

| 集合 | 用途 |
|---|---|
| `members` | 正式队员资料与状态 |
| `memberApplications` | 入队申请 |
| `competitions` | 比赛主记录 |
| `rounds` | 比赛逐局明细 |
| `registrations` | 比赛报名 |
| `line_records` | 成员分线成绩记录 |
| `map_data` | 地图与分线基准数据 |
| `exchange` | 今日交流主记录 |
| `exchange_registrations` | 交流报名名单 |
| `weekly_tasks` | 周图任务 |
| `weekly_submissions` | 周图任务提交 |
| `team_activities` | 车队活动 |
| `team_activity_participants` | 活动报名人员 |
| `team_activity_prizes` | 活动奖品 |

## 数据管道

分线数据来自 [one-drift-pass.com](https://www.one-drift-pass.com) 的同源 API，脚本直接请求，无需浏览器。

```bash
cd python
python3 -m pip install -r requirements.txt

# 抓取全部竞速地图的分线表
python3 scrape_one_drift_map.py -o 分线表.csv

# 如需登录态（接口要求鉴权时）
python3 scrape_one_drift_map.py --rider-number '00000219' --password '******' -o 分线表.csv
```

抓取结果为 UTF-8 BOM 编码的 CSV，Excel 可直接打开，列结构为：

```
难度, 地图, 国服记录, 顶尖职业, 职业, 强主, 主力, 强一, 一线, 弱一, 强二, 二线, 弱二, 强三, 三线, 娱乐
```

导入云数据库：编辑 `python/import_lines.py` 顶部的 `API_KEY`（云开发控制台 → 环境设置 → HTTP API 密钥），再执行 `python3 import_lines.py`。

> ⚠️ 不要把手上的真实 `API_KEY`、`AppID`、`Secret` 直接写进代码提交。`.env` 已在 `.gitignore` 中，本地密钥请放环境变量。

## 积分规则

配置集中在 `utils/score.js`。

**个人赛单局得分**

| 名次 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 未完赛 |
|---|---|---|---|---|---|---|---|---|---|
| 得分 | 10 | 7 | 5 | 4 | 3 | 1 | 0 | -1 | -3 |

**抢 1 赛**：仅第 1 名得 1 分，其余 0 分。

**团队赛**：每局胜方 +1 分，负方 0 分。

**结束判定**：千分赛达到 1000 分结束；抢分赛/抢 1 赛达到目标分结束；团队赛达到目标分结束。

## 分支与发布

| 分支/标签 | 用途 |
|---|---|
| `main` | 稳定版本。**不直接开发**，仅通过 `develop` 合入 |
| `develop` | 集成分支，新功能在此汇总验证 |
| `feature/*` | 单个功能分支，从 `develop` 拉出，完成后合回 `develop` |
| `baseline-mature`（标签） | 成熟产品基线快照，永久保留的回滚点 |

```bash
# 开新功能
git checkout develop && git pull
git checkout -b feature/xxx

# 完成后合回 develop
git checkout develop
git merge --no-ff feature/xxx
git push

# 发布：develop → main
git checkout main && git merge --no-ff develop && git push
```

**回滚速查**

```bash
git diff baseline-mature..main --stat              # 新功能改动了哪些文件
git show baseline-mature:app.json                  # 查看基线版某文件内容
git checkout baseline-mature -- pages/home/home.js # 单文件还原
git reset --hard baseline-mature                   # 整体退回基线（丢弃未提交改动）
```

## 已知问题 / 待整理

- 分线 CSV 存在 4 份副本：`play分线.csv`、`utils/play分线.csv`、`python/分线表.csv`、`cloudfunctions/importMapData/play分线.csv`，建议后续收敛为单一数据源，由脚本生成。
- `fixMapName` 与 `fixMapNames` 功能重叠，`pages/line/line.wxss.backup`、`line.wxss.old` 为遗留备份文件，可清理。
- 云环境 ID、订阅消息模板 ID 仍硬编码在代码中，建议抽到配置层。

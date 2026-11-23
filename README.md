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
| 主演徒弟 | `pages/disciples` `members` `member` `admin/admin` | 概览与入口；名单 / 详情 / 管理中心为独立页面，TabBar 之一 |
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

> ⚠️ 必须用「云端安装依赖」这一项。若选「上传并部署：所有文件」而本地又没有 `node_modules`，运行时会报 `Cannot find module 'wx-server-sdk'`。

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
| `getMyDiscipleInfo` | 主演徒弟：本人身份（师傅/管理员/徒弟）、徒弟总数、待审批列表 |
| `getAllDisciples` | 主演徒弟：分批读取全部徒弟（师傅单独返回） |
| `approveDisciple` / `rejectDisciple` | 主演徒弟：审批拜师申请（师傅或管理员） |
| `updateDiscipleInfo` | 主演徒弟：改资料；定线由师傅或管理员录入 |
| `claimDiscipleMaster` | 主演徒弟：**一次性**初始化师傅，已有 master 后永久失效 |
| `migrateTeamMembers` | 主演徒弟：从车队 `members` 批量迁移（**无鉴权，用完即删**，默认预览不写库） |
| `publishDiscipleTask` / `closeDiscipleTask` | 主演徒弟：发布/编辑任务、结算并生成判定快照 |
| `getScoreSheet` / `saveTaskScores` | 主演徒弟：按日批量录入成绩（有日期覆盖 / 无日期追加） |
| `getDiscipleTaskDetail` | 主演徒弟：任务详情、我的目标、全员榜单 |
| `getDiscipleTaskHistory` / `getAdminHistory` | 主演徒弟：个人历史 / 全部任务历史；前者支持 `summaryOnly` 返回四态汇总 |
| `getMemberTaskDetail` | 主演徒弟：查看某人在某任务的判定、记录与曲线（互相可见） |
| `submitTaskScoreRequest` | 主演徒弟：徒弟提交自己的成绩申请（待审批） |
| `reviewTaskScoreRequest` | 主演徒弟：审批成绩申请，通过才写入成绩 |
| `getPendingTaskRequests` | 主演徒弟：待审批成绩申请列表 |
| `getMyTaskRequests` | 主演徒弟：我的成绩申请（任务详情展开时按需查询） |
| `updateTaskVideo` | 主演徒弟：更新任务的视频讲解（链接 / 提取码 / 说明），并自动处理该任务的失效反馈 |
| `reportTaskVideo` | 主演徒弟：徒弟反馈视频打不开 |
| `updateDiscipleAnnouncement` | 主演徒弟：更新「演门公告」（师傅/管理员） |
| `importLegacyTasks` | 主演徒弟：分批导入历史作业数据（一次性，幂等，可 dryRun） |
| `setDiscipleLineHistory` | 主演徒弟：按参数直接设定某人的分线历史（昵称 + 拜师时间 + 多次定线） |
| `saveMapDoc` | 主演徒弟：保存/更换地图笔记（PDF），按 mapId 唯一 |
| `listTaskReports` / `resolveTaskReport` | 主演徒弟：待处理反馈列表 / 标记已处理 |

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
| `disciples` | 主演徒弟：徒弟档案（含 `masterLine` 师傅定线） |
| `discipleApplications` | 主演徒弟：拜师申请 |
| `disciple_tasks` | 主演徒弟任务：地图绑定、7 档分线、起止时间 |
| `disciple_task_records` | 主演徒弟任务：成绩记录（管理代录） |
| `disciple_task_results` | 主演徒弟任务：结算后的判定快照 |
| `disciple_task_requests` | 主演徒弟任务：成绩申请（待审批 → 通过才入库） |
| `disciple_task_reports` | 主演徒弟任务：视频失效反馈（成员报、管理处理） |
| `map_docs` | 主演徒弟：地图笔记（PDF，按 mapId 唯一，云存储 fileID） |
| `disciple_announcement` | 主演徒弟：演门公告（单文档，一句话，首页展示） |

## 主演徒弟模块

与 PLAY 车队**逻辑完全独立**：独立页面、独立云函数、独立集合，唯一的共用是 `getOpenId` 这类纯技术函数（微信 openid 本身无法按模块拆分）。

**集合与权限**

| 集合 | 建议权限 | 说明 |
|---|---|---|
| `disciples` | 仅创建者可读写（默认即可） | 读取全部走云函数，前端不需要直接读 |
| `discipleApplications` | 仅创建者可读写（默认即可） | 用户直接提交申请，`_openid` 由系统自动写入 |

> 与车队模块不同，本模块的管理员审批**全部走云函数**（云函数有管理员权限，绕过集合权限），因此不需要把集合权限放宽到「所有用户可读」。

**字段**

```
disciples
  _openid, nickname, gameName, gameId, statement,
  masterLine          # 师傅定线，6 档：强主/主力/一线/二线/三线/娱乐
  masterLineHistory   # 定线历史 [{ line, at }]，按时间升序，判定时取任务结束时的定线
  status       # approved（本模块无离队状态）
  role         # master | admin | member
  joinedAt, createdAt, createdBy, updatedAt
```

**角色模型**：师傅与管理员是两个独立概念，不能混为一谈。

| 角色 | 含义 | 数量 | 权限 |
|---|---|---|---|
| `master` | 师傅（主演）本人 | 全平台唯一 | 审批 + 录入定线 + 维护资料 |
| `admin` | 平台协助管理 | 可多人 | 审批 + 录入定线 + 维护资料 |
| `member` | 普通徒弟 | 若干 | 只能改自己的昵称/游戏名/游戏ID/宣言 |
| `yang_leader` | 阳门门主 | 若干 | **权限完全等同 member**，仅在名字旁显示「🐲 阳门门主」 |
| `yang_disciple` | 阳门弟子 | 若干 | **权限完全等同 member**，仅在名字旁显示「🥋 阳门弟子」 |

> 师傅不进入「徒弟名单」，界面顶部单独以师傅卡片展示；徒弟人数统计也不含师傅本人。

**首次初始化师傅**

1. 部署 `claimDiscipleMaster` 云函数
2. 用师傅本人的微信打开「主演徒弟」页，出现「初始化师傅」按钮，点击即成为 `master`
3. 该入口在 `disciples` 中存在任一 `master` 后自动失效，不会被人重复利用

**任命管理员**：不做界面，需要时在云开发控制台把该徒弟记录的 `role` 字段改成 `admin` 即可。

**定线流程**：师傅或管理员在审批面板可直接为申请人选择定线（可留空），也可通过「徒弟详情 → 编辑资料 / 定线」随时修改。徒弟本人只能改昵称、游戏昵称、游戏ID、个人宣言，**不能改自己的定线**。

**拜师时间**：`joinedAt` 以「第一次出现在 Excel C 列的那一周」为准，由 `setDiscipleLineHistory` 的 `fromFile` 一并写入。判定与汇总都会跳过拜师之前的期次（显示「未参与」，不计入逃课）。

**分线历史**：每次定线变化都会往 `masterLineHistory` 追加 `{ line, at }`，首页与成员详情会展示「分线变化」时间线。

判定（达标 / 超线）**和展示**都使用**任务结束时间点**对应的定线：历史任务里看到的是当时的定线（若与当前不同，会标注「当时」），因此历史成绩不会因为后来升线被重新判错；没有历史记录的老数据回退到当前定线。

**演门公告**

首页「进行中任务」上方的一条公告，只存一句话（≤120 字），数据在 `disciple_announcement` 集合里只保留一个文档。师傅/管理员点公告右侧的 ✏️ 即可在线编辑，清空内容等于隐藏公告。读取走 `getMyDiscipleInfo`，不额外增加请求。

**地图笔记（PDF）——当前前端已隐藏**

> 前端受 `pages/disciples/task/task.js` 里的 `SHOW_MAP_DOC` 开关控制，当前为 `false`（入口不显示）。云函数 `saveMapDoc`、集合 `map_docs` 与 `getDiscipleTaskDetail` 返回的 `doc` 字段均保留，把开关改为 `true` 即可恢复。

任务详情会显示「📄 查看兔姐笔记」，点击后下载并用 `wx.openDocument` 原生打开 PDF。

- 数据存在 `map_docs` 集合，按 `mapId` 唯一；老任务没有 `mapId` 时按地图名匹配
- 管理在任务详情点「上传兔姐笔记（PDF）」选择文件，自动上传云存储并写库；同一张图再传会覆盖记录（旧文件仍留在存储里，可定期清理）
- 换笔记不需要发版

**视频讲解**

任务可挂一个网盘分享（讲解视频）。管理在发布页或任务详情里**粘贴整段网盘分享文本**，前端 `utils/share.js` 会自动识别链接、提取码与标题，也允许手动修正。成员在任务详情里看到「📺 视频讲解」卡片，可一键复制链接/提取码。

> 微信内直接打开网盘链接常被拦截，页面会提示复制到浏览器或网盘 App。分享链接失效时（网盘分享过期或文件被删），管理在任务详情点「修改视频」更新即可，链接与提取码可分别修改。

徒弟发现视频打不开时，可在视频卡片点「视频打不开？点此反馈给管理」，生成一条 `disciple_task_reports` 待处理记录，管理中心会显示红点与数量。管理员在「视频失效反馈」里可直接标记已处理，或在任务详情更新视频后**自动**把该任务的反馈全部标记为已处理。

**成绩录入的两种方式**

| 方式 | 谁 | 是否需审批 |
|---|---|---|
| 管理批量录入 | 师傅 / 管理员 | 直接入库 |
| 徒弟自己申请 | 徒弟本人（只能给自己） | **需审批**，通过才入库 |

申请由 `disciple_task_requests` 承载：同一任务同一人只保留一条待审批申请，再次提交视为更新；审批通过时按「任务 + 成员 + 日期」覆盖原成绩（无日期则追加），已结算任务会重算当事人。

### 手动设定分线历史

用 `setDiscipleLineHistory` 直接给某个徒弟写入完整的分线历史（一次性整理老数据时用）。

**单个成员**

```json
{
  "nickname": "小凡",
  "joinedAt": "2025-11-10",
  "lines": [
    { "line": "强主", "at": "2025-11-10" },
    { "line": "主力", "at": "2026-02-25" },
    { "line": "一线", "at": "2026-11-20" }
  ]
}
```

**批量**

```json
{
  "members": [
    { "nickname": "小凡", "joinedAt": "2025-11-10", "lines": [{ "line": "一线", "at": "2026-11-20" }] },
    { "gameName": "超级瑞", "lines": [{ "line": "强主", "at": "2025-11-10" }] }
  ]
}
```

| 参数 | 说明 |
|---|---|
| `nickname` / `gameName` | 按昵称或游戏名精确匹配（忽略空格）；重名会报错，改用 `discipleId` |
| `openid` / `discipleId` | 精确定位，优先级最高 |
| `joinedAt` | 拜师时间，支持 `2025-11-10`、`2025-11-10 20:30` 或时间戳 |
| `lines` | 按时间升序传入 `{ line, at }`；最后一条决定当前 `masterLine` |
| `dryRun` | `true` 只返回将写入的内容，不落库 |
| `key` | 若云函数环境变量配了 `LINE_HISTORY_KEY`，调用需带上相同值 |

> ⚠️ 该函数无内置身份校验（云端测试没有登录态）。如担心被小程序端调用，请在云函数环境变量里配置 `LINE_HISTORY_KEY`，或使用后删除。

**批量写入 Excel 颜色生成的历史**（数据已打包为 `cloudfunctions/setDiscipleLineHistory/data.json`，95 人）：

```json
{ "fromFile": true, "dryRun": true }
```

确认无误后去掉 `dryRun` 再跑一次。写入后历史判定仍是旧快照，需要再用 `importLegacyTasks` 的 `recompute` 模式分批重算：

```json
{ "recompute": true, "cursor": 0, "batch": 5 }
```

### 历史数据导入（Excel）

把《徒弟作业成绩记录.xlsx》的 47 期历史成绩导入平台，数据已清洗为 `legacy/import.json`（同时打包进 `cloudfunctions/importLegacyTasks/data.json`）。

清洗结果：47 期、2740 个成员行、3687 条有效成绩、24 条非法时间被跳过。

**清洗规则**

| 项 | 处理 |
|---|---|
| 地图别名 | 沙漠缝合→被遗忘的记忆、逆向巡逻路→巡逻路逆行、绝望墓地→绝望之地下墓穴、森林巨人→沉睡森林巨人、命运之桥→城镇命运之桥、首尔→动感首尔、惊恐高架→太空惊恐高架、比萨斜塔→意大利比萨斜塔、炼油厂→巨大炼油厂 |
| 库里没有的地图 | 景德大道（无对应图，仍导入任务，`mapId` 留空） |
| 台服双表周 | 只导国服表，台服表跳过 |
| 非法时间 | `1:28:99` 这类厘秒 ≥100 的值跳过并计数 |
| 成员匹配 | 按 `gameName` / `nickname` 精确匹配现有徒弟；**匹配不到的不导入** |
| 判定 | 按当前规则重算，原始 √/× 存 `legacyK` 备查 |
| 幂等 | 任务带 `legacyKey`，重复执行跳过已导入的期 |

**用法**（云开发控制台 → 云函数 → importLegacyTasks → 云端测试）：

```json
{ "cursor": 0, "batch": 5 }
```

返回 `nextCursor` 后继续调用，直到 `done: true`；首次可加 `"dryRun": true` 只统计不写库。

**补录新成员**（不删任何数据，只补当前能匹配上、之前没导入的人）：

```json
{ "merge": true, "cursor": 0, "batch": 5 }
```

补录时会顺带把该成员的 `joinedAt` 修正为他在 Excel 里首次出现的周，避免历史被算成「未参与」。

只重导某几期（解析修正后常用），用 `keys` 限定期次、`resetKeys` 先精确清理：

```json
{
  "keys": ["legacy:2026.6.29-2026.7.5"],
  "resetKeys": ["legacy:2026.6.29-2026.7.5"],
  "cursor": 0,
  "batch": 1
}
```

重复导入或修正解析后重跑，加 `"reset": true` 即可先清空上一次的历史数据（只删 `source: legacy` 的成绩与 `imported: true` 的任务，不影响新录入的数据）：

```json
{ "cursor": 0, "batch": 10, "reset": true }
```

> ⚠️ 该函数**无鉴权**（云端测试没有登录态，无法判断调用者身份），仅供开发期一次性使用。**导入完成后请立即在控制台删除 `importLegacyTasks`**，不要留在线上环境。

### 任务（周图任务）设计

任务系统的完整设计（口径、判定规则、数据模型、页面与接口）见 [docs/disciple-tasks-design.md](docs/disciple-tasks-design.md)。

### 从车队批量迁移（跳过拜师申请）

用于把车队 `members` 里已有的人一次性搬进 `disciples`，不走申请审批。

**页面操作**：主演徒弟 → ⚙️ 管理 → 📥 从车队批量导入 → 粘贴 `_id`（换行或逗号分隔）→ 预览 → 导入。

**直接调云函数**（云开发控制台「云端测试」）：

```json
{
  "memberIds": ["<members._id>", "<members._id>"],
  "dryRun": true,
  "masterLine": "",
  "useOverallLine": false
}
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `memberIds` | `[]` | 车队 `members._id` 列表，单次 ≤ 500 |
| `openids` | `[]` | 也可按 `_openid` 指定 |
| `dryRun` | `true` | 只预览，不写库；必须显式传 `false` 才写入 |
| `masterLine` | `''` | 统一指定定线（14 档之一） |
| `useOverallLine` | `false` | 用车队 `overallLine` 作为「师傅定线」 |
| `includeLeft` | `false` | 是否迁移已离队成员 |
| `keepJoinedAt` | `true` | 保留原入队时间，否则用迁移时间 |

**字段映射**：`_openid` / `nickname` / `gameName` / `gameId` / `statement` / `joinedAt` 原样带过来；`status` 固定 `approved`；`role` 固定 `member`（车队 admin **不会**继承为主演徒弟管理员）；另外写入 `migratedFrom`（原 `members._id`）便于追溯。

**执行顺序建议**：先「初始化师傅」，再批量迁移其他人 —— 否则师傅本人也可能被迁成普通徒弟。

**⚠️ 该函数无鉴权**：不做身份校验 —— 云开发控制台的「云端测试」没有登录态，`getWXContext().OPENID` 为空，基于身份的判断永远不可能通过。因此**任何人调用都能触发迁移**，仅供开发期一次性使用；迁移完成后请立即在云开发控制台删除该云函数，不要留在线上环境。

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

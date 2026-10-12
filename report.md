我在另一个对话执行了命令：
把路径  F:\Project_Research\TGactivitybot 的这个项目 所有电报社群相关的功能单独提取出来，放到新的项目路径下 F:\Antigravity_Project\TeleGuard

要求：
1. 保留社群管理所有功能，如 Anti-spam 功能、ban/ unban/mute/unmute、进群验证等管理必备功能
2. 社群抽奖功能 Lucky Draw。
3. 任何cashbox 相关功能都不需要，如 消息推送pushbot、远程数据库连接、指纹图谱Device Tracking Graph、玩家UID、Data Query等
4. 数据库，只保留 社群管理相关数据，cashbox 数据库有关的全部去除。

这是Agent 完成后的报告
### 架构解耦与提取交付报告

已成功将原项目所有电报社群治理与互动抽奖功能完全剥离提取至独立新项目：`F:\Antigravity_Project\TeleGuard`。

---

### 一、功能保留与剔除清单

- **保留的功能模块**：
  - **社群反垃圾与安全防护**：Anti-spam 引擎、域名/路径白名单（X、Reddit、Facebook 等）、Unicode/Premium 自定义表情过滤、关键词/Flood 检测、CAS 拦截、`/ban`、`/unban`、`/mute`、`/unmute`、`/warn` 命令及私信凭据通知。
  - **进群人机验证与动态欢迎**：论坛子话题隔离验证机制、算术验证挑战、超时自动踢出、动态欢迎辞模板（`{mention}`、`{name}`、`{group}`、`{topic_link}`）及定时自动撤回。
  - **动态社群与话题模板**：`renderCommunityTopicTemplate` 智能模板渲染引擎，无缝兼容 Telegram 通用话题（ID 1）与 64 位大群 ID。
  - **社群活跃度体系**：纯电报社群发言与 Reaction 经验值收集、防刷冷却机制、Lv1–Lv100 等级公式、Sharp 离线生成 600×600 PNG `/rank` 徽章卡片、H5 纯社群活跃度排行榜（周榜/总榜）。
  - **幸运抽奖套件 (Lucky Draw)**：完整抽奖机器人子模块、独立 SQLite 存储 (`drawbot.db`)、Quill 富文本描述、全随机/指定中奖者/定时自动开奖模式、阶梯分组播报与广播封存。
  - **MTProto 审计日志**：保留 `userbot.ts` MTProto Recent Actions 群管审计日志轮询功能。
  - **管理后台 (Cyber Dark)**：社群治理面板、用户 XP 调整、违规日志审计、封禁列表管理、自定义命令管理、抽奖控制台；支持 Master 密码 + IP 白名单与 Telegram 2FA 互动验证码双通道登录。

- **100% 彻底剔除的 Cashbox 相关模块与依赖**：
  - 彻底移除 `mysql2` 依赖及所有远程 MySQL 连接代码 (`mysql.ts`)。
  - 彻底移除 Pushbot 消息推送机器人全套引擎与 Web 编辑器模块。
  - 彻底移除指纹图谱 Device Tracking Graph（`visitorId`、Vis.js 拓扑网络关系图、`/graph` 阅后即焚令牌）。
  - 彻底移除玩家 UID 关联查询、`/tg2uid` 解析、`/sa` 运维批量数据查询。
  - 彻底移除 Cashbox 游戏裂变邀请数据同步、伪造数据生成器（Fake Invite Generator）及 H5 邀请榜。

---

### 二、数据库纯净化处理

新项目采用纯本地轻量 SQLite 架构（启用 WAL 模式），零云服务费用、零外部网络依赖，两座数据库物理隔离：

1. **社群主库 (`teleguard.db`)**：
   - 包含数据表：`users`、`cooldowns`、`messages`、`settings`、`weekly_history`、`custom_commands`、`spam_logs`、`banned_users`、`admin_logs`、`captcha_sessions`。
   - 彻底剔除：所有 `cashbox_users`、`player_invites`、`device_history`、`fake_invite_batches` 等业务表。
2. **抽奖专库 (`drawbot.db`)**：
   - 包含数据表：`lotteries`、`prizes`、`participants`、`lottery_participants`、`winners`、`bot_settings`。

---

### 三、新项目文件结构 (`F:\Antigravity_Project\TeleGuard`)

- **配置与环境**：
  - [package.json](file:///F:/Antigravity_Project/TeleGuard/package.json)：精简版依赖声明，无任何 `mysql2` 依赖。
  - [tsconfig.json](file:///F:/Antigravity_Project/TeleGuard/tsconfig.json)：ES2022 / CommonJS / Strict 编译配置。
  - [.env.example](file:///F:/Antigravity_Project/TeleGuard/.env.example)：纯净版环境变量模板。
  - [ecosystem.config.js](file:///F:/Antigravity_Project/TeleGuard/ecosystem.config.js)：PM2 生产守护配置。
  - [README.md](file:///F:/Antigravity_Project/TeleGuard/README.md)：完整的项目架构与部署指南。
- **任务与工程记录**：
  - [tasks/project_feature_checklist.md](file:///F:/Antigravity_Project/TeleGuard/tasks/project_feature_checklist.md)：功能清单跟踪。
  - [tasks/project_resolution_log.md](file:///F:/Antigravity_Project/TeleGuard/tasks/project_resolution_log.md)：解耦技术决策记录。
- **核心后端源码 (`src/`)**：
  - [src/types.ts](file:///F:/Antigravity_Project/TeleGuard/src/types.ts)：社群核心数据类型定义。
  - [src/config.ts](file:///F:/Antigravity_Project/TeleGuard/src/config.ts)：环境变量与全局默认配置。
  - [src/database.ts](file:///F:/Antigravity_Project/TeleGuard/src/database.ts)：SQLite 数据库操作与迁移。
  - [src/bot.ts](file:///F:/Antigravity_Project/TeleGuard/src/bot.ts)：Telegram Grammy 机器人与社群命令管理。
  - [src/server.ts](file:///F:/Antigravity_Project/TeleGuard/src/server.ts)：Express 管理后台与 API 服务。
  - [src/captcha.ts](file:///F:/Antigravity_Project/TeleGuard/src/captcha.ts)：进群验证码生成与会话处理。
  - [src/card.ts](file:///F:/Antigravity_Project/TeleGuard/src/card.ts)：Sharp 等级卡片生成器。
  - [src/session.ts](file:///F:/Antigravity_Project/TeleGuard/src/session.ts)：内存会话管理。
  - [src/utils.ts](file:///F:/Antigravity_Project/TeleGuard/src/utils.ts)：公共工具函数库。
  - [src/userbot.ts](file:///F:/Antigravity_Project/TeleGuard/src/userbot.ts) & [src/userbot-setup.ts](file:///F:/Antigravity_Project/TeleGuard/src/userbot-setup.ts)：MTProto Recent Actions 审计工具。
  - **抽奖子模块 (`src/drawbot/`)**：
    - [src/drawbot/bot.ts](file:///F:/Antigravity_Project/TeleGuard/src/drawbot/bot.ts)
    - [src/drawbot/database.ts](file:///F:/Antigravity_Project/TeleGuard/src/drawbot/database.ts)
    - [src/drawbot/routes.ts](file:///F:/Antigravity_Project/TeleGuard/src/drawbot/routes.ts)
    - [src/drawbot/scheduler.ts](file:///F:/Antigravity_Project/TeleGuard/src/drawbot/scheduler.ts)
    - [src/drawbot/types.ts](file:///F:/Antigravity_Project/TeleGuard/src/drawbot/types.ts)
- **前端静态资产 (`public/`)**：
  - [public/admin.html](file:///F:/Antigravity_Project/TeleGuard/public/admin.html) & [public/js/admin.js](file:///F:/Antigravity_Project/TeleGuard/public/js/admin.js)：Cyber Dark 管理后台（仅社群管理与抽奖）。
  - [public/leaderboard.html](file:///F:/Antigravity_Project/TeleGuard/public/leaderboard.html) & [public/js/leaderboard.js](file:///F:/Antigravity_Project/TeleGuard/public/js/leaderboard.js)：纯社群活跃度 H5 排行榜。
  - [public/css/admin.css](file:///F:/Antigravity_Project/TeleGuard/public/css/admin.css) & [public/css/leaderboard.css](file:///F:/Antigravity_Project/TeleGuard/public/css/leaderboard.css)：样式表。

---

### 四、验证与编译结果

- **TypeScript 类型检查**：执行 `tsc --project F:\Antigravity_Project\TeleGuard\tsconfig.json --noEmit`，结果 **0 错误**。
- **生产构建打包**：执行 `tsc --project F:\Antigravity_Project\TeleGuard\tsconfig.json`，已成功将完整生产代码构建输出至 `F:\Antigravity_Project\TeleGuard\dist\`。
- **SQLite 自动初始化测试**：两套数据库通过 `initDb()` 与 `getDrawDb()` 自动化挂载验证，所有数据表结构生成正常，无任何残留或缺失外键。
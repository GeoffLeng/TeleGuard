# TeleGuard - Telegram 社群治理与互动抽奖机器人套件

[English](README.md) | **简体中文**

TeleGuard 是一个专为 Telegram 大型社群打造的高性能、企业级社群治理与互动抽奖机器人系统。

本项目完全聚焦于电报社群管理与互动，移除了所有外部业务与数据库依赖，采用纯本地 SQLite 存储，具备极简部署、零云服务费用、毫秒级响应和零数据泄漏保障。

---

## 🌟 核心功能模块

### 1. 🛡️ 社群反垃圾与安全防护 (Anti-Spam & Moderation)
- **智能链接与域名白名单**：内置 X/Twitter (`t.co`)、Reddit (`redd.it`)、Facebook (`fb.watch`) 等主流白名单，精准拦截未经许可的推广与钓鱼链接。
- **高级表情与字符过滤**：有效防御 Unicode 隐写垃圾字符、Telegram Premium 自定义动态表情刷屏。
- **违规行为实时拦截**：支持关键词/正则黑名单、高频刷屏 (Flood Detection)、CAS 垃圾账号全局拦截。
- **管理命令集**：支持 `/ban`、`/unban`、`/mute`、`/unmute`、`/warn`。执行时自动校验目标权限，并向违规者发送私信违规凭证。
- **超级管理员双通道特权**：支持配置 `SA_ADMIN_TG_IDS`，享有 Web 2FA 验证码免密登录以及全群防刷防禁言豁免权。

### 2. 🧩 进群人机验证与欢迎系统 (Captcha & Welcome)
- **论坛话题精准隔离**：支持多社群及特定子话题 (`captcha_communities`) 验证绑定，验证消息与交互严格路由至指定话题，不打扰主聊天区。
- **轻量数学验证挑战**：友好型算术/图形验证码，带倒计时与重试保护，超时自动移出群组。
- **动态欢迎辞模板**：支持 `{mention}`、`{name}`、`{group}`、`{topic_link}` 占位符，可配置仅在验证通过后发送并设定定时自动撤回。

### 3. 💬 动态社群与话题提示模板 (Dynamic Prompt Templating)
- 智能渲染上下文感知的社群和话题引导通知（如违规发帖引导、错误话题提示、进群欢迎），无缝兼容 Telegram 通用话题 (General Topic ID 1) 及 64 位大群组 ID。

### 4. 🏆 社群活跃度等级系统 (Activity XP & Rank)
- **消息与互动积分引擎**：根据发言和 Emoji 反应赋予经验值，内置多重防刷防滥用冷却时间。
- **精美 Rank 卡片**：`/rank` 命令生成 600x600 高清 PNG 个人等级徽章卡片（基于 Sharp 离线渲染）。
- **H5 活跃度排行榜**：现代 Cyber Dark 风格 WebApp，支持周榜 (Weekly) 与总榜 (All-Time) 自由切换，自适应移动端与桌面端。

### 5. 🎁 幸运抽奖套件 (Lucky Draw / Giveaway Suite)
- **开箱即用独立抽奖引擎**：基于本地 SQLite (`drawbot.db`) 独立存储，与社群管理主库物理隔离。
- **Quill 富文本描述**：支持 Telegram HTML 实体安全转义的高级抽奖文案编辑。
- **多种开奖模式**：支持全随机抽奖、预设指定中奖者 (Designated Winners) 以及定时自动开奖 (Scheduled Auto Draw)。
- **奖品阶梯分组播报**：开奖结果按奖品等级自动聚合格式化，原群广播消息自动封存为 `[🔒 已开奖 / Ended]`。

### 6. 🕵️ MTProto Userbot Recent Actions 审计日志
- 集成 GramJS MTProto 客户端，自动轮询抓取社群近期管理操作日志 (Recent Actions)，记录成员封禁、消息撤回等审计流水。

### 7. 🖥️ 管理后台 (Web Admin Dashboard)
- **Cyber Dark 风格界面**：专注于社群治理（配置中心、用户 XP 管理、黑名单/禁言管理、垃圾日志审计、自定义命令管理）与幸运抽奖两大核心板块。
- **双通道安全认证**：通道 1（主密码 + `ADMIN_IP_WHITELIST` 严格 IP 白名单校验）；通道 2（向官方机器人请求 6 位 Telegram 2FA 互动验证码）。

---

## 📁 目录结构

```
TeleGuard/
├── dist/                      # 编译后的生产代码
├── public/                    # 前端静态资源
│   ├── css/
│   │   ├── admin.css          # 管理后台 Cyber Dark 样式
│   │   └── leaderboard.css    # H5 排行榜样式
│   ├── js/
│   │   ├── admin.js           # 管理后台前端逻辑 (社群治理 + 抽奖)
│   │   └── leaderboard.js     # 排行榜前端逻辑
│   ├── admin.html             # 管理后台 HTML 页面
│   └── leaderboard.html       # H5 排行榜 HTML 页面
├── src/
│   ├── drawbot/               # 幸运抽奖子模块
│   │   ├── bot.ts             # 抽奖机器人实例与交互逻辑
│   │   ├── database.ts        # 抽奖专属 SQLite 数据库操作
│   │   ├── routes.ts          # 抽奖 Web API 路由
│   │   ├── scheduler.ts       # 定时自动开奖调度器
│   │   └── types.ts           # 抽奖数据类型定义
│   ├── bot.ts                 # 主 Telegram 机器人与社群管理命令
│   ├── captcha.ts             # 进群人机验证挑战逻辑
│   ├── card.ts                # Sharp 离线生成 /rank 视觉卡片
│   ├── config.ts              # 集中配置管理
│   ├── database.ts            # 主 SQLite 数据库治理 (teleguard.db)
│   ├── server.ts              # Express Web API 与静态页面服务
│   ├── session.ts             # 内存会话管理
│   ├── types.ts               # 核心社群数据类型与接口
│   ├── userbot.ts             # GramJS MTProto 近期操作审计客户端
│   ├── userbot-setup.ts       # Userbot 首次交互式登录脚本
│   └── utils.ts               # 实用工具函数
├── tasks/                     # 项目任务清单与变更决议
│   ├── project_feature_checklist.md
│   └── project_resolution_log.md
├── ecosystem.config.js        # PM2 进程守护配置文件
├── package.json               # 项目依赖声明
├── tsconfig.json              # TypeScript 编译配置
└── .env.example               # 环境变量配置模板
```

---

## 🚀 快速启动指南

### 1. 环境准备
- Node.js 18+ 或 20+
- 推荐使用 npm 或 pnpm

### 2. 安装依赖与配置环境变量
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 配置 BOT_TOKEN 与 ADMIN_PASSWORD 等关键参数
```

### 3. 开发环境运行
```bash
# 启动热重载开发服务
npm run dev
```

### 4. 生产环境构建与启动
```bash
# 编译 TypeScript
npm run build

# 启动生产服务
npm run start

# 或使用 PM2 进行进程守护
pm2 start ecosystem.config.js
```

### 5. 可选：配置 Userbot 审计日志
若需要监听社群近期管理操作日志 (Recent Actions)：
1. 在 [my.telegram.org](https://my.telegram.org) 获取 `TELEGRAM_API_ID` 与 `TELEGRAM_API_HASH`。
2. 运行交互式授权命令：
   ```bash
   npm run userbot:setup
   ```
3. 按照提示输入手机号与验证码，生成的 Session 将自动配置并运行。

---

## 🔒 安全与数据保护规范
1. **纯本地 SQLite 持久化**：所有社群配置、发言 XP、封禁记录存储在 `./teleguard.db`，抽奖数据存储在 `./drawbot.db`，严禁提交任何 `*.db` 文件至代码仓库。
2. **零第三方云 API 账单**：完全基于 Node.js 原生 `crypto` 与本地 Sharp 图形引擎，无需 AWS 或任何第三方付费 API。

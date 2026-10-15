# TeleGuard - Telegram 社群治理与互动抽奖套件

[English](README.md) | **简体中文**

TeleGuard 是一个专为 Telegram 大型社群打造的高性能、企业级社群治理与互动抽奖机器人系统。采用纯本地 SQLite 存储架构，具备极简部署、零云服务费用、毫秒级响应和严格的零数据外泄保障。

---

## 核心功能

### 1. 社群反垃圾与安全防护 (Anti-Spam & Moderation)
- **智能链接与域名白名单**：内置 X/Twitter、Reddit、Facebook 等主流白名单与自定义域名，拦截未授权推广与钓鱼链接。
- **高级字符与表情过滤**：防御 Unicode 隐写字符、RTLO 伪装以及 Telegram Premium 自定义动态表情刷屏。
- **违规行为实时拦截**：支持关键词/正则黑名单、高频刷屏检测 (Flood Detection) 以及 CAS 垃圾账号全局库拦截。
- **管理命令集**：提供 `/ban`、`/unban`、`/mute`、`/unmute`、`/warn`，带管理员权限校验与违规私信送达。
- **超级管理员特权**：支持配置 `SA_ADMIN_TG_IDS`，用于 Web 2FA 验证登录及全群防刷/防禁言豁免权。

### 2. 进群人机验证与欢迎系统 (Captcha & Welcome)
- **论坛话题精准隔离**：支持绑定指定论坛子话题 (`captcha_communities`)，验证交互完全不打扰主聊天区。
- **轻量数学与文本挑战**：算术与字符图形验证码，带重试保护与超时自动移出群组。
- **动态欢迎辞模板**：支持 `{mention}`、`{name}`、`{group}` 等占位符，可配置定时自动撤回。

### 3. 社群与话题动态提示 (Prompt Templating)
- 智能渲染上下文感知的通知引擎，兼容 Telegram 通用话题 (General Topic ID 1) 及 64 位大群组 ID。

### 4. 活跃度等级系统 (Activity XP & Rank)
- **互动积分引擎**：根据发言和 Emoji 反应赋予经验值，内置多重防刷防滥用冷却时间。
- **等级徽章卡片**：`/rank` 命令通过本地 Sharp 引擎离线生成 600×600 高清 PNG 徽章卡片。
- **H5 活跃度排行榜**：Cyber Dark 风格 WebApp，支持周榜与总榜自由切换，自适应移动与桌面端。

### 5. 幸运抽奖套件 (Lucky Draw Suite)
- **物理隔离存储**：采用独立 SQLite 数据库 (`drawbot.db`)，与社群管理主数据完全隔离。
- **Quill 富文本编辑**：支持样式文案编辑并执行严格的 Telegram HTML 实体安全转义。
- **多样化开奖模式**：支持全随机抽奖、预设指定中奖者以及定时自动开奖。
- **奖品阶梯分组播报**：开奖结果按奖品等级聚合，自动将原广播消息标记为 `[已开奖 / Ended]`。

### 6. MTProto 近期管理操作审计 (Audit Logger)
- 集成 GramJS MTProto 客户端轮询抓取 Telegram Recent Actions 审计流水，记录踢人、封禁、撤回等管理操作。

### 7. Web 管理后台 (Admin Dashboard)
- **一体化控制面板**：集中管理社群配置、用户积分、黑名单、垃圾日志、自定义命令与抽奖活动。
- **双通道安全认证**：通道 1（主密码 + `ADMIN_IP_WHITELIST` 白名单校验）；通道 2（6 位 Telegram 2FA 互动验证码）。
- **全栈国际化**：默认纯英文界面，右上角支持中英文即时无刷新切换。

---

## 目录结构

```
TeleGuard/
├── dist/                      # 编译后的生产代码
├── public/                    # 静态 Web 资源 (管理后台与 H5 排行榜)
│   ├── css/
│   ├── js/
│   ├── admin.html
│   └── leaderboard.html
├── src/
│   ├── drawbot/               # 幸运抽奖子模块 (Bot、数据库、路由、调度器)
│   ├── bot.ts                 # 主 Telegram 机器人与社群管理命令
│   ├── captcha.ts             # 进群人机验证挑战生成器
│   ├── card.ts                # 基于 Sharp 的离线 /rank 视觉卡片生成器
│   ├── config.ts              # 集中配置与环境变量管理
│   ├── database.ts            # 主 SQLite 数据库驱动 (teleguard.db)
│   ├── server.ts              # Express API 与 Web 服务
│   ├── session.ts             # 内存会话与 2FA Token 管理
│   ├── types.ts               # 核心社群 TypeScript 类型定义
│   ├── userbot.ts             # MTProto 近期管理操作审计客户端
│   ├── userbot-setup.ts       # 交互式 Userbot 登录配置脚本
│   └── utils.ts               # 通用工具函数
├── tasks/                     # 任务追踪与架构决议
├── ecosystem.config.js        # PM2 进程守护配置
├── package.json               # 项目依赖与执行脚本
├── tsconfig.json              # TypeScript 编译配置
└── .env.example               # 环境变量配置模板
```

---

## 快速启动指南

### 1. 环境准备
- Node.js 18+ 或 20+
- 包管理器：npm 或 pnpm

### 2. 安装依赖与配置环境变量
```bash
# 安装依赖
npm install

# 复制环境变量模板
cp .env.example .env
# 编辑 .env 配置 BOT_TOKEN、ADMIN_PASSWORD 等关键参数
```

### 3. 开发环境运行
```bash
# 启动热重载开发服务
npm run dev
```

### 4. 生产环境构建与启动
```bash
# 编译 TypeScript 至 dist/
npm run build

# 启动生产服务
npm run start

# 或使用 PM2 进行进程守护
pm2 start ecosystem.config.js
```

### 5. 可选：配置 Userbot 审计日志
若需要监听 Telegram 群组近期管理操作日志 (Recent Actions)：
1. 在 [my.telegram.org](https://my.telegram.org) 获取 `TELEGRAM_API_ID` 与 `TELEGRAM_API_HASH` 并填入 `.env`。
2. 运行交互式授权命令：
   ```bash
   npm run userbot:setup
   ```
3. 按照提示输入手机号与验证码，Session 将自动保存并启动。

---

## 安全与数据保护规范
1. **纯本地 SQLite 持久化**：所有社群配置、发言 XP 与管理日志存储在 `./teleguard.db`，抽奖数据存储在 `./drawbot.db`。SQLite 数据库与备份文件严格禁止提交至 Git。
2. **零第三方付费云 API**：完全基于 Node.js 原生 `crypto` 与本地 `sharp` 图形处理，无 AWS 或任何付费云服务厂商锁定。

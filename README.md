# TeleGuard - Telegram Community Management & Giveaway Suite

**English** | [简体中文](README_CN.md)

TeleGuard is a high-performance, enterprise-grade Telegram community management and interactive giveaway bot system built for large-scale groups and supergroups. Operating on a pure local SQLite model, it delivers simple deployment, zero cloud service costs, sub-millisecond response latency, and strict zero-data-leakage isolation.

---

## Key Features

### 1. Anti-Spam & Moderation
- **Intelligent Link & Domain Whitelisting**: Built-in whitelists for major platforms (X/Twitter, Reddit, Facebook) and custom domains, blocking unauthorized links and phishing.
- **Advanced Character & Emoji Filtering**: Defends against RTLO spoofing, Unicode homoglyphs, and Telegram Premium animated emoji floods.
- **Real-Time Violation Interception**: Regex/keyword blacklists, high-velocity flood protection, and Combating Auto Spam (CAS) global blacklist integration.
- **Moderation Commands**: `/ban`, `/unban`, `/mute`, `/unmute`, `/warn` with administrator verification and private DM receipt delivery.
- **Super Administrator Privileges**: Configure `SA_ADMIN_TG_IDS` for Web 2FA login verification and complete anti-spam/moderation bypass immunity.

### 2. Captcha Verification & Welcome System
- **Forum Topic Isolation**: Bind verification to dedicated forum topics (`captcha_communities`) without polluting the main group discussion.
- **Lightweight Math & Text Challenges**: Arithmetic and distorted text challenges with retry protection and automatic kick on expiry.
- **Dynamic Welcome Templating**: Customizable welcome messages supporting `{mention}`, `{name}`, and `{group}` placeholders, with auto-deletion timers.

### 3. Community & Topic Prompt Templating
- Context-aware notification engine that dynamically resolves active communities and topics, compatible with Telegram General Topic (ID 1) and 64-bit group IDs.

### 4. Activity XP & Ranking System
- **Activity Points Engine**: Awards experience points for regular messages and emoji reactions, fortified with multi-tiered anti-abuse cooldowns.
- **Rank Badge Cards**: `/rank` command generates 600×600 PNG badge cards offline via native Sharp rendering.
- **H5 Web Leaderboard**: Cyber Dark WebApp with seamless switching between Weekly and All-Time rankings on mobile and desktop viewports.

### 5. Lucky Draw & Giveaway Suite
- **Autonomous Sub-Module**: Independent SQLite storage (`drawbot.db`) physically isolated from primary community data.
- **Quill Rich-Text Editor**: Compose styled event descriptions with rigorous Telegram HTML entity sanitization.
- **Flexible Drawing Modes**: Supports random selection, pre-configured designated winners, and scheduled auto-draw timers.
- **Tiered Winner Announcements**: Aggregates winners by prize tiers and seals the original Telegram broadcast post with `[Ended]`.

### 6. MTProto Recent Actions Audit Logger
- Built-in GramJS MTProto client that polls Telegram Recent Actions audit trails, logging administrative actions such as kicks, bans, and message deletions.

### 7. Web Admin Dashboard
- **Consolidated Dashboard**: Centralized management for community settings, user XP balances, spam logs, banned users, custom commands, and lucky draw giveaways.
- **Dual-Channel Security**: Channel 1 (Master Password + strict `ADMIN_IP_WHITELIST` check); Channel 2 (Interactive 6-digit Telegram 2FA verification code).
- **Full-Stack i18n**: Pure English by default with instant bilingual switching in the top-right corner.

---

## Directory Structure

```
TeleGuard/
├── dist/                      # Compiled production JavaScript
├── public/                    # Static Web assets (Admin Dashboard & H5 Leaderboard)
│   ├── css/
│   ├── js/
│   ├── admin.html
│   └── leaderboard.html
├── src/
│   ├── drawbot/               # Lucky Draw sub-module (bot, db, routes, scheduler)
│   ├── bot.ts                 # Primary Telegram Grammy bot & commands
│   ├── captcha.ts             # Captcha challenge generator
│   ├── card.ts                # Offline /rank card generator via Sharp
│   ├── config.ts              # Configuration & environment variables
│   ├── database.ts            # Primary SQLite database driver (teleguard.db)
│   ├── server.ts              # Express API & Web server
│   ├── session.ts             # In-memory authentication & 2FA tokens
│   ├── types.ts               # Core community TypeScript definitions
│   ├── userbot.ts             # MTProto Recent Actions auditor
│   ├── userbot-setup.ts       # Interactive Userbot login setup
│   └── utils.ts               # Shared utility functions
├── tasks/                     # Task tracking & architecture logs
├── ecosystem.config.js        # PM2 process daemon configuration
├── package.json               # Dependencies & project scripts
├── tsconfig.json              # TypeScript compiler configuration
└── .env.example               # Environment variables template
```

---

## Quick Start Guide

### 1. Prerequisites
- Node.js 18+ or 20+
- Package manager: npm or pnpm

### 2. Install Dependencies & Configure Environment
```bash
# Install dependencies
npm install

# Copy environment variables template
cp .env.example .env
# Edit .env and configure BOT_TOKEN, ADMIN_PASSWORD, and other parameters
```

### 3. Development Mode
```bash
# Start with hot-reload
npm run dev
```

### 4. Production Build & Deployment
```bash
# Compile TypeScript to dist/
npm run build

# Start production server
npm run start

# Alternatively, manage via PM2
pm2 start ecosystem.config.js
```

### 5. Optional: Setup Userbot Audit Log
To monitor Telegram group Recent Actions:
1. Obtain `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org) and set in `.env`.
2. Run the interactive authorization script:
   ```bash
   npm run userbot:setup
   ```
3. Input your phone number and SMS code; the session will be saved and started automatically.

---

## Security & Data Persistence
1. **Local Persistent Storage**: All community settings, user XP scores, and moderation logs reside in `./teleguard.db`, while giveaways reside in `./drawbot.db`. SQLite databases and backups are strictly blocked from Git commits.
2. **Zero Paid Cloud Service APIs**: Powered entirely by Node.js native `crypto` and offline `sharp` graphic processing. Zero AWS or paid cloud vendor lock-in.

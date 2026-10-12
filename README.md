# TeleGuard - Telegram Community Management & Giveaway Suite

**English** | [简体中文](README_CN.md)

TeleGuard is a high-performance, enterprise-grade Telegram community management and interactive giveaway bot system built specifically for large-scale groups and supergroups.

Architected with a **100% focus on Telegram community governance and interaction**, TeleGuard operates on a pure local SQLite storage model. It provides simple one-click deployment, zero third-party cloud service fees, sub-millisecond response latency, and strict zero-data-leakage isolation.

---

## 🌟 Key Features

### 1. 🛡️ Anti-Spam & Moderation Suite
- **Intelligent Link & Domain Whitelisting**: Built-in whitelist covering X/Twitter (`t.co`), Reddit (`redd.it`), Facebook (`fb.watch`), and custom domains, strictly filtering out unverified promotional and phishing links.
- **Advanced Emoji & Unicode Filtering**: Protects groups from Unicode right-to-left override (RTLO) homoglyphs and Telegram Premium custom animated emoji floods.
- **Real-Time Violation Interception**: Regex/keyword blacklists, high-velocity flood protection, and Combating Auto Spam (CAS) blacklist integration.
- **Moderation Commands**: Instant `/ban`, `/unban`, `/mute`, `/unmute`, and `/warn` actions. Verifies administrator privileges and delivers private DM receipts to punished users.
- **Super Administrator Privileges**: Configure `SA_ADMIN_TG_IDS` for Web 2FA login verification and complete anti-spam/moderation bypass immunity.

### 2. 🧩 Captcha Verification & Welcome System
- **Forum Topic Isolation**: Designate verification scope across multi-group communities (`captcha_communities`). Challenge generation and answer callbacks are strictly confined to dedicated topics without polluting the main discussion forum.
- **Lightweight Math Challenges**: User-friendly arithmetic and visual challenges with retry counters and configurable auto-kick timers for expired sessions.
- **Dynamic Welcome Templating**: Customizable welcome messages supporting `{mention}`, `{name}`, `{group}`, and `{topic_link}` placeholders, with post-verification delivery and auto-deletion delays.

### 3. 💬 Dynamic Community & Topic Templating Engine
- Context-aware notification engine (`renderCommunityTopicTemplate`) that dynamically resolves active groups and topics, with backward compatibility for Telegram General Topics (ID 1) and 64-bit group IDs.

### 4. 🏆 Community Activity XP & Rank System
- **Activity Points Engine**: Awards experience points for regular messages and emoji reactions, fortified with multi-tiered anti-abuse cooldowns.
- **Sharp-Powered `/rank` Cards**: Generates high-definition 600×600 PNG badge cards offline using native Sharp rendering.
- **H5 Activity Leaderboard Mini App**: Sleek Cyber Dark interface providing seamless switching between Weekly and All-Time rankings, optimized for mobile and desktop viewports.

### 5. 🎁 Lucky Draw Giveaway Suite
- **Autonomous Sub-Module**: Independent SQLite storage (`drawbot.db`) physically isolated from primary community data.
- **Quill Rich-Text Editor**: Compose styled event descriptions with rigorous Telegram HTML entity sanitization.
- **Flexible Drawing Modes**: Supports pure random selection, pre-configured designated winners, and scheduled auto-draw timers.
- **Tiered Winner Announcements**: Automatically aggregates winners by prize tiers and seals the original Telegram announcement post with `[🔒 Ended]`.

### 6. 🕵️ MTProto Userbot Recent Actions Logger
- Built-in GramJS MTProto client that polls Telegram Recent Actions audit trails, capturing administrative events such as kicks, bans, and message deletions.

### 7. 🖥️ Cyber Dark Web Admin Dashboard
- **Consolidated Dashboard**: Dual control modules for Community Management (settings, user XP balances, spam logs, banned users, custom commands) and Lucky Draw giveaways.
- **Dual-Channel Security**: Channel 1 (Master Password + strict `ADMIN_IP_WHITELIST` check); Channel 2 (Interactive 6-digit Telegram 2FA verification code).

---

## 📁 Directory Structure

```
TeleGuard/
├── dist/                      # Compiled production JavaScript
├── public/                    # Static Web assets
│   ├── css/
│   │   ├── admin.css          # Cyber Dark admin styling
│   │   └── leaderboard.css    # H5 Leaderboard styling
│   ├── js/
│   │   ├── admin.js           # Admin Dashboard client logic
│   │   └── leaderboard.js     # H5 Leaderboard client logic
│   ├── admin.html             # Admin Dashboard entry point
│   └── leaderboard.html       # H5 Leaderboard entry point
├── src/
│   ├── drawbot/               # Lucky Draw Giveaway sub-module
│   │   ├── bot.ts             # Giveaway bot instance & handlers
│   │   ├── database.ts        # Giveaway SQLite database driver
│   │   ├── routes.ts          # Giveaway Express API routes
│   │   ├── scheduler.ts       # Scheduled auto-draw daemon
│   │   └── types.ts           # Giveaway data contracts
│   ├── bot.ts                 # Primary Telegram Grammy bot & commands
│   ├── captcha.ts             # Captcha challenge generator
│   ├── card.ts                # Offline /rank card generator via Sharp
│   ├── config.ts              # Configuration & environment variables
│   ├── database.ts            # Primary SQLite database driver (teleguard.db)
│   ├── server.ts              # Express API & Web server
│   ├── session.ts             # In-memory authentication sessions
│   ├── types.ts               # Core community TypeScript definitions
│   ├── userbot.ts             # MTProto Recent Actions auditor
│   ├── userbot-setup.ts       # Interactive Userbot login setup
│   └── utils.ts               # Shared utility functions
├── tasks/                     # Task tracking & architecture logs
│   ├── project_feature_checklist.md
│   └── project_resolution_log.md
├── ecosystem.config.js        # PM2 process daemon configuration
├── package.json               # Dependencies & project scripts
├── tsconfig.json              # TypeScript compiler configuration
└── .env.example               # Environment variables template
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js 18+ or 20+
- Package manager: `npm` or `pnpm`

### 2. Install Dependencies & Configure Environment
```bash
# Clone the repository
git clone https://github.com/YourUsername/TeleGuard.git
cd TeleGuard

# Install dependencies
npm install

# Copy environment variables template
cp .env.example .env

# Configure BOT_TOKEN, ADMIN_PASSWORD, and other parameters in .env
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
1. Obtain `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org).
2. Run the interactive authorization script:
   ```bash
   npm run userbot:setup
   ```
3. Input your phone number and SMS code; the generated session will automatically be stored and activated.

---

## 🔒 Security & Data Persistence
1. **Local Persistent Storage**: All community settings, user XP scores, and moderation logs reside in `./teleguard.db`, while giveaways reside in `./drawbot.db`. SQLite databases and backups are strictly blocked from Git commits via `.gitignore`.
2. **Zero Paid Cloud Service APIs**: Powered entirely by Node.js native `crypto` and offline `sharp` graphic processing. Zero AWS or paid cloud vendor lock-in.

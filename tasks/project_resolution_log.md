# TeleGuard - Architecture Decoupling & Resolution Log

Chronological technical record of the standalone community bot extraction from TGactivitybot.

---

### [2026-10-12] Architecture Extraction & Cashbox Decoupling

#### 1. Background & Requirement
- The upstream repository `TGactivitybot` bundled both Telegram group community management and internal Cashbox gaming analytics/operations (Pushbot, Remote MySQL connections, Device Tracking Graph, Player UID query, fake invite generator, etc.).
- The objective was to extract a pristine, independent community management repository `TeleGuard` located at `F:\Antigravity_Project\TeleGuard` containing ONLY group management, anti-spam, verification, activity XP, and Lucky Draw giveaways, excising all Cashbox modules and dependencies.

#### 2. Key Architecture Decoupling Steps
1. **Dependency Modernization & MySQL Removal**:
   - Removed `mysql2` and all remote database drivers from `package.json`.
   - Kept purely `grammy`, `express`, `sqlite`, `sqlite3`, `sharp`, `telegram` (GramJS MTProto), and `dotenv`.
2. **Database Clean Room Rebuild**:
   - Replaced `src/database.ts` with a dedicated SQLite schema: `users`, `cooldowns`, `messages`, `settings`, `weekly_history`, `custom_commands`, `spam_logs`, `banned_users`, `admin_logs`, and `captcha_sessions`.
   - Completely omitted all tables related to Cashbox: `cashbox_users`, `player_invites`, `device_history`, `device_graph_edges`, `fake_invite_batches`, etc.
   - Preserved isolated `drawbot.db` for the Lucky Draw sub-module.
3. **Bot Command & Route Sanitization**:
   - Cleaned `src/bot.ts` of `/sa`, `/tg2uid`, `/graph`, and Cashbox session middleware.
   - Retained group moderation commands (`/ban`, `/unban`, `/mute`, `/unmute`, `/warn`), `/rank`, join captcha handlers, anti-spam filters, and dynamic command triggers.
4. **Server & Admin API Streamlining**:
   - Cleaned `src/server.ts` of pushbot workers, device graph endpoints, player UID queries, and fake invite generation endpoints.
   - Retained settings API, user XP management, spam log review, admin audit log, custom command configuration, and full Lucky Draw routes.
5. **Frontend Asset Adaptation**:
   - Rewrote `public/leaderboard.html` and `public/js/leaderboard.js` into a pure Telegram activity XP leaderboard (Weekly & All-Time), removing all Invite tabs and player UIDs.
   - Rebuilt `public/admin.html` and `public/js/admin.js` into a focused Cyber Dark admin interface featuring solely Community Management and Lucky Draw.
6. **Type Safety & Build Verification**:
   - Verified clean compilation with `tsc --noEmit` (0 errors).
   - Produced production build in `dist/`. Tested runtime SQLite initialization for both `teleguard.db` and `drawbot.db`.

### [2026-10-12] Deep Code Audit & Front-End Governance Functionality Restoration

#### 1. Issues Identified during Comprehensive Audit
1. **Critical Functionality Loss in `public/js/admin.js`**:
   - During initial decoupling, approximately 31 community governance client-side functions (including `loadCommands`, `openCommandModal`, `deleteCommand`, `loadSpamLogs`, `renderSpamLogs`, `executeSpamAction`, `loadBannedUsersList`, `restoreBannedUser`, `loadHistoryPeriods`, `loadHistoryLeaderboard`, `toggleHistoryView`, `confirmResetWeekly`, `searchUsers`, `openEditModal`, `confirmDeleteUser`, `showToast`, `renderCaptchaCommunities`, `loadAdminLogs`, `showLogDetails`, etc.) were inadvertently truncated along with the Cashbox code.
   - When administrators clicked the "Command Settings", "Safety & Spam", "Leaderboard History", or "Recent Actions" sidebar tabs, the browser threw fatal `ReferenceError: function is not defined` exceptions.
2. **API Parameter & Response Casing Incompatibilities (`src/server.ts`)**:
   - Front-end payload conventions (`chatId`, `userId`, `totalXp`, `weeklyXp`, `logId`) were not normalized against backend snake_case destructuring (`chat_id`, `user_id`, `total_xp`, `weekly_xp`, `log_id`), causing HTTP 400 rejection on user updates, deletions, and spam mitigation actions.
   - Missing target user resolution: If front-end passed only `logId` to `/api/admin/spam/action`, `chat_id` and `user_id` remained undefined, bypassing live Telegram member moderation.
   - Response formatting mismatches: Front-end expected direct arrays from `/api/admin/commands`, `/api/admin/banned-users`, and `/api/admin/spam-logs`, while backend wrapped them in singular objects, which risked `data.forEach is not a function` runtime errors.
3. **Dead Asset References (`public/admin.html`)**:
   - Residual HTML comment `<!-- Vis.js Network CDN -->` remained in document head after library decoupling.

#### 2. Resolutions Applied
1. **Full Restoration of Sanitized Governance Functions (`public/js/admin.js`)**:
   - Re-integrated all 31 community management functions cleanly extracted from the upstream repository, with all legacy Cashbox Invite Leaderboard and Device Tracking logic 100% expunged.
   - Restored pure Activity XP historical cycle review, banned user list rendering, one-click restoration, custom command CRUD modals, spam audit actions with DM receipts, dynamic captcha topic binding, and MTProto Recent Actions inspector.
   - Syntax validated with `node --check` (0 errors).
2. **Robust Dual-Casing & Response Normalization (`src/server.ts`)**:
   - Enhanced `/api/admin/users/update`, `/api/admin/users/delete`, `/api/admin/banned-users/restore`, `/api/admin/spam/action`, and history endpoints to accept both `camelCase` and `snake_case` parameters seamlessly.
   - In `/api/admin/spam/action`, added automatic fallback lookup to `db.getSpamLog(logId)` to retrieve `chat_id` and `user_id` if omitted by caller.
   - Normalized `/api/admin/commands`, `/api/admin/banned-users`, and `/api/admin/spam-logs` endpoints to deliver directly compatible arrays and MTProto status metadata.
3. **Asset Cleanup & Verification**:
   - Removed orphaned CDN comment in `public/admin.html`.
   - Verified compilation via `npx tsc` (0 errors, clean output to `dist/`).
   - Verified all 35 admin and giveaway endpoints aligned with 0 missing routes.

---

### [2026-10-13] Security Hardening: Strict Secrets & Environment Variable Isolation

#### 1. Context & Objective
- Prevent any accidental commitment or leak of sensitive secrets (API keys, Telegram bot tokens, session files, passwords) to GitHub or remote repositories.
- Standardize local environment generation to strictly isolate `.env` from git tracking.

#### 2. Resolutions Applied
1. **Repository Security Hardening (`.gitignore`)**:
   - Expanded ignore filters: `.env`, `.env.*`, `*.session`, `*.session-journal`, `*.pem`, `*.key`, `*.cert`.
   - Explicitly preserved `.env.example` as a tracked, sanitized configuration template.
2. **Project Policy Enforcement (`.agents/AGENTS.md`)**:
   - Codified `Strict Zero Secrets / API Keys / Bot Tokens Exposure Rule`: Real credentials must never be written into tracked codebase files or templates; only clear placeholders permitted.

---

### [2026-10-13] Bug Fix: Lucky Draw Module Tab Activation Restoration

#### 1. Context & Root Cause
- When clicking the "Lucky Draw" top tab in [public/admin.html](file:///f:/Antigravity_Project/TeleGuard/public/admin.html), the module failed to open.
- **Root Cause**: The HTML header buttons triggered `onclick="switchModule('draw')"`, but `switchModule` was missing from [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js), throwing `Uncaught ReferenceError: switchModule is not defined`. Consequently, `#module-draw` remained hidden and `loadDrawModule()` was never called.

#### 2. Resolutions Applied
1. **Implemented `switchModule(moduleName)`**:
   - Added in [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js#L233-L255) to dynamically toggle `#module-community` and `#module-draw`, seamlessly switching active tab styling and triggering `loadDrawModule()` + `initDrawQuill()`.
2. **Complete Global Window Exports**:
   - Exported all Draw modal controllers (`openCreateDrawModal`, `openEditDrawModal`, `closeDrawCampaignModal`, `openDrawWinnersModal`, `openDrawSettingsModal`, `loadDrawModule`, etc.) to the `window` scope for robust inline HTML event binding.
3. **Asset Sanitization**:
   - Polished remaining legacy "Cashbox Draw" titles and CSV export filenames to "Lucky Draw" / "TeleGuard Draw".

---

### [2026-10-13] Bug Fix: Lucky Draw Master Switch Visual Reactivity Restoration

#### 1. Context & Root Cause
- When clicking the Lucky Draw master switch ("开关: 运行中 / 休眠"), the switch failed to visually update immediately. Only after switching tabs to Community Management and back did the new state reflect.
- **Root Cause**: The backend `/api/draw/status/toggle` endpoint succeeded and updated SQLite. However, upon completion, `toggleDrawEngineMasterSwitch()` attempted to call `showToastNotification(...)`, which was undefined in [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js). This threw `Uncaught ReferenceError: showToastNotification is not defined`, catching into the error block that rolled back the UI switch state (`updateDrawEngineUI(!targetState)`). Tab re-entry re-fetched `/api/draw/status`, which displayed the true server-persisted state.

#### 2. Resolutions Applied
1. **Implemented Floating `showToastNotification(message, type)`**:
   - Added in [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js#L1847-L1925), featuring automatic DOM injection, Cyber Dark gradients for success/info/error, micro-animations, and 3.5s auto-dismiss.
   - Restored instant optimistic UI rendering and flawless state synchronization on switch toggles.



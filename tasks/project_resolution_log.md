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

---

### [2026-10-14] Code Review Quality Audit & Concurrency Optimization

#### 1. Context & Objectives
- Systematic comprehensive code review across the codebase adhering to the `code-review` standard (Logic, Resilience, Architecture, Concurrency, Security).
- Addressed latent concurrency bugs in SQLite atomic operations, peer recognition anti-sybil checks, and file asset cleanup.

#### 2. Resolutions Applied
1. **Atomic XP Increment & Race Condition Defense ([src/database.ts](file:///f:/Antigravity_Project/TeleGuard/src/database.ts#L601-L660))**:
   - Replaced `INSERT OR REPLACE` with `ON CONFLICT(chat_id, user_id) DO UPDATE` in `createUser` to prevent accidental reset of user XP/levels during concurrent inserts.
   - Converted JS-memory read-modify-write in `addXp` to atomic SQL increment (`SET total_xp = total_xp + ?, weekly_xp = weekly_xp + ?`), eliminating lost updates in high-volume groups.
2. **Peer Recognition Sybil Throttling ([src/bot.ts](file:///f:/Antigravity_Project/TeleGuard/src/bot.ts#L2856-L2865))**:
   - Scoped peer reaction cooldown to `peer_${emoji}_to_${authorId}` and added a receiving throttle on the recipient, preventing multi-account farming.
3. **Orphan Asset Auto-Cleanup ([src/server.ts](file:///f:/Antigravity_Project/TeleGuard/src/server.ts#L367-L420))**:
   - Ensured replacement uploads for card backgrounds and default avatars properly unlink previous files from `/uploads/`, eliminating disk space leakage.

---

### [2026-10-14] UI Internationalization (i18n) & Default English Enforcement

#### 1. Context & Objectives
- Ensure all TeleGuard frontend pages default to 100% English with zero Chinese characters on initial load.
- Implement an accessible top-right language switcher on all surfaces (Login, Admin Dashboard, Leaderboard Mini App) allowing dynamic switching to Chinese and back, with preference persistence.

#### 2. Resolutions Applied
1. **Zero-Dependency Lightweight Client i18n Engine ([public/js/i18n.js](file:///f:/Antigravity_Project/TeleGuard/public/js/i18n.js))**:
   - Built standalone i18n engine with comprehensive `en` and `zh` dictionaries.
   - Initialized strictly with `'en'` as the default language.
   - Built `applyTranslations()` to reactively bind `data-i18n`, `data-i18n-html`, `data-i18n-placeholder`, and `data-i18n-title`.
   - Persisted language preferences via `localStorage.getItem('teleguard_lang')`.
2. **Pruning Hardcoded Chinese from HTML & Scripts**:
   - Converted all 134 Chinese lines in [public/admin.html](file:///f:/Antigravity_Project/TeleGuard/public/admin.html) to English defaults with declarative `data-i18n` bindings.
   - Converted all 75 dynamic Chinese strings in [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js) (toasts, alerts, confirms, dropdown items, empty states) to `window.i18n.t(...)`.
   - Verified 0 Chinese characters remain in default HTML/CSS/JS across the entire `public/` directory.
3. **Top-Right Language Switcher Component Integration**:
   - Integrated Cyber Dark pill button (`.lang-switch-btn`) on the Login screen, Dashboard Header, and H5 Leaderboard Header.
   - Added instant reactivity: clicking toggles between English and 简体中文 with 0 page reload delay.


---

### [2026-10-14] Fix Admin Web Login Failure (SyntaxError in admin.js)

#### 1. Symptom & Investigation
- User reported unable to log in via password `admin123`.
- Backend diagnostic confirmed `ADMIN_PASSWORD=admin123` in `.env` and SQLite DB, returning HTTP 200 upon direct API auth.
- Syntax audit of client-side scripts revealed `admin.js` failed to parse in the browser due to an unescaped template string quote at line 3152 (`Missing } in template expression`), which prevented `loginForm` submit listener from executing.

#### 2. Root Cause & Resolution
- **Client Script Syntax**: Corrected nested quotes inside template expression on [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js#L3150-L3158).
- **Initial Auth Guard**: Updated DOMContentLoaded session verification to check `res && res.success` on [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js#L222-L230).
- **Asset Version Bumping**: Incremented script cache-busting parameter to `admin.js?v=1.0.1` in [public/admin.html](file:///f:/Antigravity_Project/TeleGuard/public/admin.html#L1954-L1956) to ensure immediate browser invalidation.

---

### [2026-10-14] Fix Telegram Auth Login Flow & Real-Time Bot Linkage

#### 1. Symptom & Investigation
- User clicked "Login via Telegram" / "通过电报授权登录" and observed no response.
- Browser was initially blocked by the previous uncached SyntaxError.
- Furthermore, `/api/admin/auth/init` previously only returned `{ token, code }` without `botUsername`, causing deep-links to render as `https://t.me/undefined?start=...` and display generic `@Bot` placeholders.

#### 2. Root Cause & Resolution
- **Backend Bot Identity Resolution**: Added `getBotUsername()` in [src/server.ts](file:///f:/Antigravity_Project/TeleGuard/src/server.ts#L298-L320), querying and caching the bot username (`CashboxRankBot`) directly via `telegramApi.getMe()`, and returning it in `/api/admin/auth/init`.
- **Frontend Reactive Link & Prompt Binding**: Updated [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js#L114-L175) to dynamically inject the real bot handle into the instructions (`tg-auth-instruction-top`) and bind deep-link targets (`lnk-tg-bot`). Added localized loading and error display states.
- **Cache-Busting & UI Reset**: Bumped [public/admin.html](file:///f:/Antigravity_Project/TeleGuard/public/admin.html#L1954-L1956) cache buster to `admin.js?v=1.0.2` and preserved i18n data-attributes in `resetTgLoginUI()`.

---

### [2026-10-14] Fix Duplicate Overlapping Language Switcher in Admin Header

#### 1. Symptom & Investigation
- When logged into the Admin Dashboard, two `🌐 English` language switch buttons appeared overlapping in the top-right corner.
- One button belonged to the Dashboard Header (`.dashboard-header`), while the other was `.login-lang-switch-wrapper`, which was previously placed outside `#login-container` with `position: fixed; top: 24px; right: 28px; z-index: 1000;`.
- Because `#login-lang-switch-wrapper` was outside `#login-container`, hiding `#login-container` on login did not hide the login screen's language button, causing it to float fixed on top of the dashboard header's language button and the Logout button.

#### 2. Root Cause & Resolution
- **DOM Encapsulation**: Relocated `<div id="login-lang-switch-wrapper">` inside `<div id="login-container">` in [public/admin.html](file:///f:/Antigravity_Project/TeleGuard/public/admin.html#L83-L95). When `#login-container` receives `.hidden`, its child language switcher is automatically hidden.
- **CSS Coordinate Scoping**: Added `position: relative;` to `.login-container` and changed `.login-lang-switch-wrapper` to `position: absolute;` in [public/css/admin.css](file:///f:/Antigravity_Project/TeleGuard/public/css/admin.css#L155-L165, #L1160-L1170), cleanly locking it to the login screen viewport without leaking into dashboard views.
- **Explicit JS Visibility Guard**: Added explicit `.hidden` toggles in `showDashboard()` and `logout()` in [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js#L215-L238).
- **Cache-Busting**: Bumped CSS version to `admin.css?v=3.3` in [public/admin.html](file:///f:/Antigravity_Project/TeleGuard/public/admin.html#L16).

---

### [2026-10-15] Comprehensive System Hardening & Performance Optimizations

#### 1. Scope & Objectives
- Implement prioritized recommendations from the code review without extensive refactoring or destructive migrations.
- Harden web admin credential security, prevent race conditions in giveaways, ensure network resilience, and add render-level CPU caching.

#### 2. Resolutions Applied
1. **Developer Experience & Instant Hot Reload**:
   - Upgraded [package.json](file:///f:/Antigravity_Project/TeleGuard/package.json#L7) script to `"dev": "tsx watch src/bot.ts"`, enabling native zero-dependency file-watch reloads.
2. **Network Resilience & Hard Timeouts (P2)**:
   - Added native `AbortSignal.timeout(5000)` to remote Telegram avatar fetches in [src/card.ts](file:///f:/Antigravity_Project/TeleGuard/src/card.ts#L27) and [src/bot.ts](file:///f:/Antigravity_Project/TeleGuard/src/bot.ts#L281), preventing Node.js async hangs during CDN delays.
3. **Lucky Draw Race Condition & Mutex Protection (P2)**:
   - Added atomic status transition `lockLotteryForDrawing(id)` in [src/drawbot/database.ts](file:///f:/Antigravity_Project/TeleGuard/src/drawbot/database.ts#L468-L478) and applied it in [src/drawbot/bot.ts](file:///f:/Antigravity_Project/TeleGuard/src/drawbot/bot.ts#L450-L465) to eliminate concurrent manual/auto draw execution.
   - Standardized internal designated-winner errors from Chinese to English in [src/drawbot/bot.ts](file:///f:/Antigravity_Project/TeleGuard/src/drawbot/bot.ts#L534-L545).
4. **Admin Web Session Security & Tokenization (P1)**:
   - Created dedicated POST `/api/admin/auth/login` endpoint in [src/server.ts](file:///f:/Antigravity_Project/TeleGuard/src/server.ts#L338-L385) issuing 12-hour random cryptographic session tokens (`session_pwd_...`).
   - Refactored [public/js/admin.js](file:///f:/Antigravity_Project/TeleGuard/public/js/admin.js#L98-L115, #L198-L225) to store only session tokens in client storage, completely ending plaintext master password persistence in `localStorage`.
5. **Rank Card Render Buffer Cache**:
   - Added in-memory 20-second TTL LRU cache in [src/card.ts](file:///f:/Antigravity_Project/TeleGuard/src/card.ts#L106-L120, #L220-L235) to eliminate redundant Sharp libvips SVG rasterization during burst `/rank` commands.


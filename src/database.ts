import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import { DB_PATH, DEFAULT_SETTINGS } from "./config";
import { DbUser, DbMessage, DbCooldown, BotSettings, CustomCommand, SpamLog, DbBannedUser, AdminLog, CaptchaSession } from "./types";


let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

// Power formula solver for leveling
export function calculateLevel(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.pow(xp / 50, 0.6)) + 1;
}

export function getXpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.ceil(50 * Math.pow(level - 1, 5 / 3));
}

export async function getDb(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (db) return db;
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
  try {
    await db.exec("PRAGMA journal_mode=WAL");
    await db.exec("PRAGMA synchronous=NORMAL");
    await db.exec("PRAGMA busy_timeout=5000");
    await db.exec("PRAGMA cache_size = -16000"); // 16MB page cache ceiling
    await db.exec("PRAGMA temp_store = MEMORY");
    await db.exec("PRAGMA mmap_size = 268435456"); // 256MB memory-mapped I/O
  } catch (err) {
    console.error("[Database] Failed to configure SQLite pragmas:", err);
  }
  return db;
}

export async function initDb(): Promise<void> {
  const database = await getDb();

  // -------------------------------------------------------
  // MIGRATION: Detect and migrate old single-key users table
  // -------------------------------------------------------
  const userColumns = await database.all("PRAGMA table_info(users)");
  const userHasChatId = userColumns.some((c: any) => c.name === "chat_id");

  if (userColumns.length > 0 && !userHasChatId) {
    // Old table exists without chat_id — migrate
    console.log("[Database] Migrating users table to multi-community schema (adding chat_id)...");

    // Read last_active_chat_id from settings for data migration
    let defaultChatId = 0;
    try {
      const row = await database.get("SELECT value FROM settings WHERE key = 'last_active_chat_id'");
      if (row) {
        defaultChatId = JSON.parse(row.value) || 0;
      }
    } catch {}

    await database.exec("ALTER TABLE users RENAME TO users_old");
    await database.exec(`
      CREATE TABLE users (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        total_xp INTEGER DEFAULT 0,
        weekly_xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        avatar_url TEXT,
        PRIMARY KEY (chat_id, user_id)
      )
    `);
    await database.run(
      `INSERT INTO users (chat_id, user_id, username, first_name, last_name, total_xp, weekly_xp, level, avatar_url)
       SELECT ?, user_id, username, first_name, last_name, total_xp, weekly_xp, level, avatar_url FROM users_old`,
      [defaultChatId]
    );
    await database.exec("DROP TABLE users_old");
    console.log(`[Database] Users table migrated. Old data bound to chat_id=${defaultChatId}.`);
  } else if (userColumns.length === 0) {
    // Fresh install — create new schema directly
    await database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        total_xp INTEGER DEFAULT 0,
        weekly_xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        avatar_url TEXT,
        PRIMARY KEY (chat_id, user_id)
      )
    `);
  }

  // -------------------------------------------------------
  // MIGRATION: Detect and migrate old cooldowns table
  // -------------------------------------------------------
  const cdColumns = await database.all("PRAGMA table_info(cooldowns)");
  const cdHasChatId = cdColumns.some((c: any) => c.name === "chat_id");

  if (cdColumns.length > 0 && !cdHasChatId) {
    console.log("[Database] Migrating cooldowns table to multi-community schema (adding chat_id)...");
    await database.exec("ALTER TABLE cooldowns RENAME TO cooldowns_old");
    await database.exec(`
      CREATE TABLE cooldowns (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        last_triggered INTEGER,
        PRIMARY KEY (chat_id, user_id, action_type)
      )
    `);
    await database.run(
      `INSERT INTO cooldowns (chat_id, user_id, action_type, last_triggered)
       SELECT 0, user_id, action_type, last_triggered FROM cooldowns_old`
    );
    await database.exec("DROP TABLE cooldowns_old");
    console.log("[Database] Cooldowns table migrated.");
  } else if (cdColumns.length === 0) {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS cooldowns (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        last_triggered INTEGER,
        PRIMARY KEY (chat_id, user_id, action_type)
      )
    `);
  }

  // Create Messages Table (already has chat_id)
  await database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id INTEGER,
      chat_id INTEGER,
      user_id INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id, chat_id)
    )
  `);
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)
  `);

  // Create Settings Table
  await database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // -------------------------------------------------------
  // MIGRATION: Weekly History — add chat_id if missing
  // -------------------------------------------------------
  await database.exec(`
    CREATE TABLE IF NOT EXISTS weekly_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_date TEXT,
      chat_id INTEGER DEFAULT 0,
      user_id INTEGER,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      weekly_xp INTEGER,
      rank INTEGER
    )
  `);
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_weekly_history_period ON weekly_history(period_date)
  `);
  // Add chat_id column to existing weekly_history if missing
  const whColumns = await database.all("PRAGMA table_info(weekly_history)");
  const whHasChatId = whColumns.some((c: any) => c.name === "chat_id");
  if (!whHasChatId) {
    try {
      await database.run("ALTER TABLE weekly_history ADD COLUMN chat_id INTEGER DEFAULT 0");
      console.log("[Database] Migrated weekly_history table: added chat_id column.");
    } catch (e) {
      console.error("[Database] Failed to add chat_id to weekly_history:", e);
    }
  }

  // -------------------------------------------------------
  // Custom Commands Table — with action_type
  // -------------------------------------------------------
  await database.exec(`
    CREATE TABLE IF NOT EXISTS custom_commands (
      trigger_name TEXT PRIMARY KEY,
      content TEXT,
      action_type TEXT DEFAULT 'text'
    )
  `);
  // Add action_type column if missing (migration from old schema)
  const cmdColumns = await database.all("PRAGMA table_info(custom_commands)");
  const cmdHasActionType = cmdColumns.some((c: any) => c.name === "action_type");
  if (!cmdHasActionType) {
    try {
      await database.run("ALTER TABLE custom_commands ADD COLUMN action_type TEXT DEFAULT 'text'");
      console.log("[Database] Migrated custom_commands table: added action_type column.");
      // Set action_type for existing system commands
      await database.run("UPDATE custom_commands SET action_type = 'start' WHERE trigger_name = 'start'");
      await database.run("UPDATE custom_commands SET action_type = 'text' WHERE trigger_name = 'rules'");
    } catch (e) {
      console.error("[Database] Failed to add action_type column:", e);
    }
  }

  // -------------------------------------------------------
  // Populate Default Commands if not exists
  // -------------------------------------------------------
  const defaultCommands: CustomCommand[] = [
    {
      trigger_name: "start",
      action_type: "start",
      content: "👋 Welcome to the Activity Tracker Bot!\n\n" +
               "I have started tracking the activity in the group.\n" +
               "💬 Send messages: +{xp_message_sent} XP (Cooldown: {cooldown_message_sent}s)\n" +
               "👍 React to messages: +{xp_reaction_added} XP (Cooldown: {cooldown_reaction_added}s)\n" +
               "❤️ Received reactions: +{xp_peer_recognition} XP (Cooldown: {cooldown_peer_recognition}s)\n\n" +
               "🔍 Send `/rank` to view your level card and ranking!"
    },
    {
      trigger_name: "rules",
      action_type: "text",
      content: "📋 **Community Activity XP Rules** 📋\n\n" +
               "💬 **Send messages**: +{xp_message_sent} XP (Cooldown: {cooldown_message_sent}s)\n" +
               "👍 **React to messages**: +{xp_reaction_added} XP (Cooldown: {cooldown_reaction_added}s)\n" +
               "❤️ **Received reactions (Peer Recognition)**: +{xp_peer_recognition} XP (Cooldown: {cooldown_peer_recognition}s)\n\n" +
               "📈 *Keep chatting and reacting to earn more XP and level up!*"
    },
    {
      trigger_name: "rank",
      action_type: "rank",
      content: ""
    },
    {
      trigger_name: "xp",
      action_type: "rank",
      content: ""
    },
    {
      trigger_name: "leaderboard",
      action_type: "leaderboard",
      content: "📈 Click the button below to view the community leaderboard:"
    }
  ];

  for (const cmd of defaultCommands) {
    const exists = await database.get("SELECT 1 FROM custom_commands WHERE trigger_name = ?", [cmd.trigger_name]);
    if (!exists) {
      await database.run("INSERT INTO custom_commands (trigger_name, content, action_type) VALUES (?, ?, ?)", [
        cmd.trigger_name,
        cmd.content,
        cmd.action_type
      ]);
    }
  }

  // Populate Default Settings if not exists
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    const exists = await database.get("SELECT 1 FROM settings WHERE key = ?", [key]);
    if (!exists) {
      await database.run("INSERT INTO settings (key, value) VALUES (?, ?)", [
        key,
        JSON.stringify(val),
      ]);
    }
  }

  // Sync ADMIN_PASSWORD from .env on startup
  const finalPassword = process.env.ADMIN_PASSWORD || "admin123";
  await database.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    "admin_password",
    JSON.stringify(finalPassword),
  ]);

  // Migrate existing cooldown_peer_recognition to 5s if it was previously 60s
  const currentVal = await database.get("SELECT value FROM settings WHERE key = 'cooldown_peer_recognition'");
  if (currentVal) {
    try {
      const valParsed = JSON.parse(currentVal.value);
      if (valParsed === 60) {
        await database.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
          "cooldown_peer_recognition",
          JSON.stringify(5),
        ]);
        console.log("[Database] Migrated cooldown_peer_recognition from 60s to 5s.");
      }
    } catch {}
  }

  // Clean up deprecated settings keys from previous versions
  await database.run("DELETE FROM settings WHERE key IN ('allowed_chat_id', 'allowed_topic_id')");

  // Non-destructive auto-migration: Ensure whitelist_domains contains mainstream social platforms and short links
  const currentWhitelistRow = await database.get<{ value: string }>("SELECT value FROM settings WHERE key = 'whitelist_domains'");
  if (currentWhitelistRow) {
    try {
      const currentList: string[] = JSON.parse(currentWhitelistRow.value) || [];
      const essentialDomains = [
        "*.x.com",
        "*.twitter.com",
        "*.t.co",
        "*.fxtwitter.com",
        "*.vxtwitter.com",
        "*.fixupx.com",
        "*.reddit.com",
        "*.redd.it",
        "*.facebook.com",
        "*.fb.com",
        "*.fb.me",
        "*.fb.watch",
        "*.m.me"
      ];
      let hasChanges = false;
      const mergedList = [...currentList];
      for (const d of essentialDomains) {
        if (!mergedList.includes(d)) {
          mergedList.push(d);
          hasChanges = true;
        }
      }
      const uniqueList = Array.from(new Set(mergedList));
      if (hasChanges || uniqueList.length !== currentList.length) {
        await database.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
          "whitelist_domains",
          JSON.stringify(uniqueList),
        ]);
        console.log("[Database] Automatically updated whitelist_domains with social & short link protections.");
      }
    } catch (e) {
      console.error("[Database] Failed to check/migrate whitelist_domains:", e);
    }
  }

  // Create Spam Logs Table
  await database.exec(`
    CREATE TABLE IF NOT EXISTS spam_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      reason TEXT NOT NULL,
      evidence TEXT,
      risk_score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_spam_logs_created ON spam_logs(created_at)
  `);

  // Create Banned Users Table
  await database.exec(`
    CREATE TABLE IF NOT EXISTS banned_users (
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      banned_by INTEGER,
      banned_by_name TEXT,
      banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (chat_id, user_id)
    )
  `);
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_banned_users_chat ON banned_users(chat_id)
  `);

  // Create Admin Logs Table (from Telegram Recent Actions)
  await database.exec(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      date INTEGER NOT NULL,
      raw_data TEXT NOT NULL,
      display_id TEXT NOT NULL DEFAULT '',
      operator_name TEXT NOT NULL DEFAULT '',
      target_name TEXT NOT NULL DEFAULT '',
      message_content TEXT NOT NULL DEFAULT '',
      ban_reason TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chat_id, event_id) ON CONFLICT IGNORE
    )
  `);
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_admin_logs_chat_event ON admin_logs(chat_id, event_id)
  `);

  // Auto-migrate: add new columns if they don't exist (for existing databases)
  const adminLogCols = await database.all("PRAGMA table_info(admin_logs)");
  const colNames = adminLogCols.map((c: any) => c.name);
  if (!colNames.includes("display_id")) {
    await database.exec("ALTER TABLE admin_logs ADD COLUMN display_id TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.includes("operator_name")) {
    await database.exec("ALTER TABLE admin_logs ADD COLUMN operator_name TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.includes("target_name")) {
    await database.exec("ALTER TABLE admin_logs ADD COLUMN target_name TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.includes("message_content")) {
    await database.exec("ALTER TABLE admin_logs ADD COLUMN message_content TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.includes("ban_reason")) {
    await database.exec("ALTER TABLE admin_logs ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
  }

  // Create unique index now that display_id column is guaranteed to exist
  await database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_logs_display_id ON admin_logs(display_id) WHERE display_id != ''
  `);


  // Create Captcha Sessions table
  await database.exec(`
    CREATE TABLE IF NOT EXISTS captcha_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      captcha_type TEXT NOT NULL,
      answer TEXT NOT NULL,
      message_id INTEGER,
      created_at INTEGER NOT NULL,
      expire_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      UNIQUE(chat_id, user_id)
    )
  `);
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_captcha_expire ON captcha_sessions(status, expire_at)
  `);

  // Auto-migration: check if attempts column exists
  const csCols = await database.all("PRAGMA table_info(captcha_sessions)");
  const csColNames = csCols.map((c: any) => c.name);
  if (!csColNames.includes("attempts")) {
    try {
      await database.exec("ALTER TABLE captcha_sessions ADD COLUMN attempts INTEGER DEFAULT 0");
    } catch {}
  }

}

// -------------------------------------------------------
// SETTINGS (with 10-second TTL in-memory cache)
// -------------------------------------------------------

let _settingsCache: { data: BotSettings; expiresAt: number } | null = null;

export async function getSettings(): Promise<BotSettings> {
  const now = Date.now();
  if (_settingsCache && _settingsCache.expiresAt > now) {
    return _settingsCache.data;
  }

  const database = await getDb();
  const rows = await database.all("SELECT key, value FROM settings");
  const settings: any = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  // Auto-migration: If database contains legacy Chinese captcha texts, upgrade to English templates
  const captchaKeys: (keyof BotSettings)[] = [
    "captcha_welcome_msg_math",
    "captcha_welcome_msg_text",
    "captcha_welcome_msg_click",
    "captcha_button_text",
    "captcha_success_msg",
    "captcha_fail_msg",
    "captcha_alert_other_user",
    "captcha_alert_expired",
    "captcha_alert_attempt1_fail",
    "captcha_alert_final_fail",
    "captcha_alert_success",
  ];

  let migrated = false;
  for (const k of captchaKeys) {
    const val = settings[k];
    if (typeof val === "string" && /[\u4e00-\u9fa5]/.test(val)) {
      settings[k] = DEFAULT_SETTINGS[k] as any;
      migrated = true;
    }
  }

  if (migrated) {
    for (const k of captchaKeys) {
      if (settings[k]) {
        await database.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
          k,
          JSON.stringify(settings[k]),
        ]);
      }
    }
  }

  _settingsCache = {
    data: settings as BotSettings,
    expiresAt: now + 30000 // 30 seconds TTL
  };

  return settings as BotSettings;
}

export async function updateSettings(newSettings: Partial<BotSettings>): Promise<void> {
  _settingsCache = null; // Invalidate settings cache
  const database = await getDb();
  for (const [key, val] of Object.entries(newSettings)) {
    await database.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      key,
      JSON.stringify(val),
    ]);
  }
}

export const saveSettings = updateSettings;


// -------------------------------------------------------
// USERS (multi-community isolated)
// -------------------------------------------------------

export async function getUser(chatId: number, userId: number): Promise<DbUser | null> {
  const database = await getDb();
  const user = await database.get<DbUser>("SELECT * FROM users WHERE chat_id = ? AND user_id = ?", [chatId, userId]);
  return user || null;
}

export async function getUserGlobal(userId: number): Promise<DbUser | null> {
  // Get user from any community (for avatar lookup etc.)
  const database = await getDb();
  const user = await database.get<DbUser>("SELECT * FROM users WHERE user_id = ? LIMIT 1", [userId]);
  return user || null;
}

export async function findUserByMention(chatId: number, identifier: string): Promise<DbUser | null> {
  if (!identifier) return null;
  const clean = identifier.replace(/^@/, "").trim();
  if (!clean) return null;

  const database = await getDb();

  // If pure numeric user_id
  if (/^\d+$/.test(clean)) {
    const uid = parseInt(clean, 10);
    const byId = await getUser(chatId, uid) || await getUserGlobal(uid);
    if (byId) return byId;
  }

  // 1. Search in current chat_id by username or first_name (case insensitive)
  const inChat = await database.get<DbUser>(
    `SELECT * FROM users 
     WHERE chat_id = ? 
       AND (LOWER(username) = LOWER(?) OR LOWER(first_name) = LOWER(?)) 
     ORDER BY rowid DESC LIMIT 1`,
    [chatId, clean, clean]
  );
  if (inChat) return inChat;

  // 2. Global fallback search across all chats
  const globalUser = await database.get<DbUser>(
    `SELECT * FROM users 
     WHERE LOWER(username) = LOWER(?) OR LOWER(first_name) = LOWER(?) 
     ORDER BY rowid DESC LIMIT 1`,
    [clean, clean]
  );
  return globalUser || null;
}


export async function createUser(
  chatId: number,
  userId: number,
  username: string | null,
  firstName: string,
  lastName: string | null
): Promise<DbUser> {
  const database = await getDb();
  await database.run(
    `INSERT INTO users (chat_id, user_id, username, first_name, last_name, total_xp, weekly_xp, level)
     VALUES (?, ?, ?, ?, ?, 0, 0, 1)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name`,
    [chatId, userId, username, firstName, lastName]
  );
  return {
    chat_id: chatId,
    user_id: userId,
    username,
    first_name: firstName,
    last_name: lastName,
    total_xp: 0,
    weekly_xp: 0,
    level: 1,
  };
}

export async function addXp(
  chatId: number,
  userId: number,
  xp: number,
  userDetails: { username: string | null; firstName: string; lastName: string | null }
): Promise<{ previousLevel: number; newLevel: number; totalXp: number; weeklyXp: number }> {
  const database = await getDb();
  let user = await getUser(chatId, userId);
  if (!user) {
    user = await createUser(chatId, userId, userDetails.username, userDetails.firstName, userDetails.lastName);
  } else {
    // Keep user profile info updated in DB
    await database.run(
      "UPDATE users SET username = ?, first_name = ?, last_name = ? WHERE chat_id = ? AND user_id = ?",
      [userDetails.username, userDetails.firstName, userDetails.lastName, chatId, userId]
    );
  }

  const previousLevel = user.level;

  // Atomic increment in SQL prevents lost updates under concurrent messages
  await database.run(
    `UPDATE users 
     SET total_xp = total_xp + ?, 
         weekly_xp = weekly_xp + ? 
     WHERE chat_id = ? AND user_id = ?`,
    [xp, xp, chatId, userId]
  );

  const updatedUser = await getUser(chatId, userId);
  const newXp = updatedUser ? updatedUser.total_xp : user.total_xp + xp;
  const newWeeklyXp = updatedUser ? updatedUser.weekly_xp : user.weekly_xp + xp;
  const newLevel = calculateLevel(newXp);

  if (newLevel !== previousLevel) {
    await database.run("UPDATE users SET level = ? WHERE chat_id = ? AND user_id = ?", [newLevel, chatId, userId]);
  }

  return {
    previousLevel,
    newLevel,
    totalXp: newXp,
    weeklyXp: newWeeklyXp,
  };
}

export async function checkCooldown(
  chatId: number,
  userId: number,
  actionType: string,
  cooldownSeconds: number
): Promise<boolean> {
  const database = await getDb();
  const now = Date.now();
  const cooldown = await database.get<DbCooldown>(
    "SELECT last_triggered FROM cooldowns WHERE chat_id = ? AND user_id = ? AND action_type = ?",
    [chatId, userId, actionType]
  );

  if (cooldown) {
    const elapsed = now - cooldown.last_triggered;
    if (elapsed < cooldownSeconds * 1000) {
      return false; // Still in cooldown
    }
  }

  // Update cooldown timestamp
  await database.run(
    "INSERT OR REPLACE INTO cooldowns (chat_id, user_id, action_type, last_triggered) VALUES (?, ?, ?, ?)",
    [chatId, userId, actionType, now]
  );
  return true;
}

export async function recordMessage(messageId: number, chatId: number, userId: number): Promise<void> {
  const database = await getDb();
  await database.run(
    "INSERT OR REPLACE INTO messages (message_id, chat_id, user_id) VALUES (?, ?, ?)",
    [messageId, chatId, userId]
  );
}

export async function getMessageAuthor(messageId: number, chatId: number): Promise<number | null> {
  const database = await getDb();
  const row = await database.get<{ user_id: number }>(
    "SELECT user_id FROM messages WHERE message_id = ? AND chat_id = ?",
    [messageId, chatId]
  );
  return row ? row.user_id : null;
}

export async function pruneOldMessages(daysThreshold: number = 7): Promise<void> {
  const database = await getDb();
  await database.run(
    "DELETE FROM messages WHERE timestamp < datetime('now', ?)",
    [`-${daysThreshold} days`]
  );
}

export async function getWeeklyLeaderboard(chatId: number, limit: number = 100): Promise<DbUser[]> {
  const database = await getDb();
  return database.all<DbUser[]>(
    `SELECT * FROM users 
     WHERE chat_id = ? 
       AND weekly_xp > 0 
       AND user_id NOT IN (SELECT user_id FROM banned_users WHERE chat_id = ?)
     ORDER BY weekly_xp DESC, total_xp DESC, user_id ASC LIMIT ?`,
    [chatId, chatId, limit]
  );
}

export async function getAllTimeLeaderboard(chatId: number, limit: number = 100): Promise<DbUser[]> {
  const database = await getDb();
  return database.all<DbUser[]>(
    `SELECT * FROM users 
     WHERE chat_id = ? 
       AND user_id NOT IN (SELECT user_id FROM banned_users WHERE chat_id = ?)
     ORDER BY total_xp DESC, user_id ASC LIMIT ?`,
    [chatId, chatId, limit]
  );
}

export async function getUserRank(chatId: number, userId: number, type: "weekly" | "all"): Promise<number> {
  const database = await getDb();

  // If the user is banned, they don't have a rank
  const isBanned = await database.get("SELECT 1 FROM banned_users WHERE chat_id = ? AND user_id = ?", [chatId, userId]);
  if (isBanned) {
    return 0;
  }

  let query = "";
  if (type === "weekly") {
    const user = await database.get<{ weekly_xp: number }>(
      "SELECT weekly_xp FROM users WHERE chat_id = ? AND user_id = ?",
      [chatId, userId]
    );
    if (!user || user.weekly_xp <= 0) {
      return 0;
    }
    query = `
      SELECT COUNT(*) + 1 as rank 
      FROM users 
      WHERE chat_id = ?
      AND weekly_xp > 0
      AND user_id NOT IN (SELECT user_id FROM banned_users WHERE chat_id = ?)
      AND (
        weekly_xp > ?
        OR (
          weekly_xp = ?
          AND total_xp > (SELECT total_xp FROM users WHERE chat_id = ? AND user_id = ?)
        )
        OR (
          weekly_xp = ?
          AND total_xp = (SELECT total_xp FROM users WHERE chat_id = ? AND user_id = ?)
          AND user_id < ?
        )
      )
    `;
    const row = await database.get<{ rank: number }>(query, [
      chatId,
      chatId,
      user.weekly_xp,
      user.weekly_xp,
      chatId, userId,
      user.weekly_xp,
      chatId, userId,
      userId
    ]);
    return row ? row.rank : 0;
  } else {
    query = `
      SELECT COUNT(*) + 1 as rank 
      FROM users 
      WHERE chat_id = ?
      AND user_id NOT IN (SELECT user_id FROM banned_users WHERE chat_id = ?)
      AND (
        total_xp > (SELECT total_xp FROM users WHERE chat_id = ? AND user_id = ?)
        OR (
          total_xp = (SELECT total_xp FROM users WHERE chat_id = ? AND user_id = ?)
          AND user_id < ?
        )
      )
    `;
    const row = await database.get<{ rank: number }>(query, [chatId, chatId, chatId, userId, chatId, userId, userId]);
    return row ? row.rank : 0;
  }
}

export async function resetWeeklyXp(chatId?: number): Promise<void> {
  const database = await getDb();
  if (chatId !== undefined) {
    await database.run("UPDATE users SET weekly_xp = 0 WHERE chat_id = ?", [chatId]);
  } else {
    await database.run("UPDATE users SET weekly_xp = 0");
  }
}

export async function updateUserXp(chatId: number, userId: number, totalXp: number, weeklyXp: number): Promise<void> {
  const database = await getDb();
  const level = calculateLevel(totalXp);
  await database.run(
    "UPDATE users SET total_xp = ?, weekly_xp = ?, level = ? WHERE chat_id = ? AND user_id = ?",
    [totalXp, weeklyXp, level, chatId, userId]
  );
}

export async function deleteUser(chatId: number, userId: number): Promise<void> {
  const database = await getDb();
  await database.run("DELETE FROM users WHERE chat_id = ? AND user_id = ?", [chatId, userId]);
  await database.run("DELETE FROM cooldowns WHERE chat_id = ? AND user_id = ?", [chatId, userId]);
}

export async function updateUserAvatar(userId: number, avatarUrl: string | null): Promise<void> {
  // Update avatar across ALL communities (avatar is user-global)
  const database = await getDb();
  await database.run("UPDATE users SET avatar_url = ? WHERE user_id = ?", [avatarUrl, userId]);
}

export async function getUserCommunities(userId: number): Promise<number[]> {
  // Return all chat_ids where this user has records
  const database = await getDb();
  const rows = await database.all<{ chat_id: number }[]>(
    "SELECT DISTINCT chat_id FROM users WHERE user_id = ? AND chat_id != 0",
    [userId]
  );
  return rows.map(r => r.chat_id);
}

// -------------------------------------------------------
// WEEKLY HISTORY (multi-community)
// -------------------------------------------------------

export async function archiveWeeklyLeaderboard(periodDate: string, limit: number, chatId?: number): Promise<void> {
  const database = await getDb();

  const chatFilter = chatId !== undefined ? "AND chat_id = ?" : "";
  const chatParams = chatId !== undefined ? [chatId] : [];

  // Fetch active users for this week
  const activeUsers = await database.all<DbUser[]>(
    `SELECT * FROM users WHERE weekly_xp > 0 ${chatFilter} ORDER BY weekly_xp DESC, total_xp DESC, user_id ASC`,
    chatParams
  );

  await database.exec("BEGIN TRANSACTION");
  let insertStmt: any = null;
  try {
    if (activeUsers.length > 0) {
      insertStmt = await database.prepare(`
        INSERT INTO weekly_history (period_date, chat_id, user_id, username, first_name, last_name, weekly_xp, rank)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < activeUsers.length; i++) {
        const user = activeUsers[i];
        const rank = i + 1;
        await insertStmt.run(
          periodDate,
          user.chat_id || 0,
          user.user_id,
          user.username,
          user.first_name,
          user.last_name,
          user.weekly_xp,
          rank
        );
      }
    }

    // Pruning logic: Keep only the most recent N (limit) periods
    const distinctPeriods = await database.all<{ period_date: string }[]>(
      "SELECT DISTINCT period_date FROM weekly_history ORDER BY period_date DESC"
    );

    if (distinctPeriods.length > limit) {
      const periodsToKeep = distinctPeriods.slice(0, limit).map(p => p.period_date);
      const placeholders = periodsToKeep.map(() => "?").join(",");
      await database.run(
        `DELETE FROM weekly_history WHERE period_date NOT IN (${placeholders})`,
        periodsToKeep
      );
      console.log(`[Database] Pruned weekly history to keep only the ${limit} most recent periods.`);
    }

    await database.exec("COMMIT");
  } catch (err) {
    await database.exec("ROLLBACK").catch(() => {});
    console.error("[Database] Error archiving weekly leaderboard:", err);
    throw err;
  } finally {
    if (insertStmt) {
      await insertStmt.finalize().catch(() => {});
    }
  }
}

export async function getHistoryPeriods(): Promise<string[]> {
  const database = await getDb();
  const rows = await database.all<{ period_date: string }[]>(
    "SELECT DISTINCT period_date FROM weekly_history ORDER BY period_date DESC"
  );
  return rows.map(r => r.period_date);
}

export async function getHistoryLeaderboard(periodDate: string): Promise<any[]> {
  const database = await getDb();
  return database.all<any[]>(
    "SELECT * FROM weekly_history WHERE period_date = ? ORDER BY rank ASC",
    [periodDate]
  );
}

// -------------------------------------------------------
// CUSTOM COMMANDS (with action_type)
// -------------------------------------------------------

export async function getCustomCommand(trigger: string): Promise<CustomCommand | null> {
  const database = await getDb();
  const row = await database.get<CustomCommand>(
    "SELECT trigger_name, content, action_type FROM custom_commands WHERE trigger_name = ?",
    [trigger]
  );
  return row || null;
}

export async function getAllCustomCommands(): Promise<CustomCommand[]> {
  const database = await getDb();
  return database.all<CustomCommand[]>(
    "SELECT trigger_name, content, action_type FROM custom_commands ORDER BY trigger_name ASC"
  );
}

export async function saveCustomCommand(trigger: string, content: string, actionType: string = "text"): Promise<void> {
  const database = await getDb();
  await database.run(
    "INSERT OR REPLACE INTO custom_commands (trigger_name, content, action_type) VALUES (?, ?, ?)",
    [trigger, content, actionType]
  );
}

export async function deleteCustomCommand(trigger: string): Promise<void> {
  const database = await getDb();
  await database.run("DELETE FROM custom_commands WHERE trigger_name = ?", [trigger]);
}

// -------------------------------------------------------
// SPAM LOGS
// -------------------------------------------------------

export async function logSpam(
  chatId: number,
  userId: number,
  username: string | null,
  firstName: string,
  lastName: string | null,
  reason: string,
  evidence: string | null,
  riskScore: number,
  status: string
): Promise<number> {
  const database = await getDb();
  const res = await database.run(
    `INSERT INTO spam_logs (chat_id, user_id, username, first_name, last_name, reason, evidence, risk_score, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [chatId, userId, username, firstName, lastName, reason, evidence, riskScore, status]
  );
  return res.lastID || 0;
}

export async function getSpamLogs(limit: number = 50, offset: number = 0): Promise<SpamLog[]> {
  const database = await getDb();
  return database.all<SpamLog[]>(
    "SELECT * FROM spam_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
}

export async function getSpamLog(id: number): Promise<SpamLog | null> {
  const database = await getDb();
  const row = await database.get<SpamLog>("SELECT * FROM spam_logs WHERE id = ?", [id]);
  return row || null;
}

export async function updateSpamLogStatus(id: number, status: string): Promise<void> {
  const database = await getDb();
  await database.run("UPDATE spam_logs SET status = ? WHERE id = ?", [status, id]);
}

// [ignoring loop detection]
// -------------------------------------------------------
// BANNED USERS (Leaderboard Exclusion)
// -------------------------------------------------------

export async function banUser(
  chatId: number,
  userId: number,
  username: string | null,
  firstName: string,
  lastName: string | null,
  bannedBy: number | null,
  bannedByName: string | null
): Promise<void> {
  const database = await getDb();
  await database.run(
    `INSERT OR REPLACE INTO banned_users (chat_id, user_id, username, first_name, last_name, banned_by, banned_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [chatId, userId, username, firstName, lastName, bannedBy, bannedByName]
  );
}

export async function unbanUser(chatId: number, userId: number): Promise<void> {
  const database = await getDb();
  await database.run("DELETE FROM banned_users WHERE chat_id = ? AND user_id = ?", [chatId, userId]);
}

export async function getBannedUsers(chatId: number): Promise<DbBannedUser[]> {
  const database = await getDb();
  return database.all<DbBannedUser[]>(
    "SELECT * FROM banned_users WHERE chat_id = ? ORDER BY banned_at DESC",
    [chatId]
  );
}

// -------------------------------------------------------
// ADMIN LOGS (Telegram Recent Actions)
// -------------------------------------------------------

/**
 * Generate a display ID in format YYYYMMDDNNNN based on the event date.
 * NNNN is a 4-digit sequential number (0001-9999+) for that day.
 */
async function generateDisplayId(eventDate: number): Promise<string> {
  const database = await getDb();
  const d = new Date(eventDate * 1000);
  const datePrefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  // Count how many logs already exist for this date prefix
  const row = await database.get<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM admin_logs WHERE display_id LIKE ?",
    [`${datePrefix}%`]
  );
  const seq = (row?.cnt || 0) + 1;
  const seqStr = seq <= 9999 ? String(seq).padStart(4, "0") : String(seq);
  return `${datePrefix}${seqStr}`;
}

export async function saveAdminLog(
  eventId: number,
  chatId: number,
  userId: number,
  actionType: string,
  date: number,
  rawData: string,
  operatorName: string = "",
  targetName: string = "",
  messageContent: string = "",
  banReason: string = ""
): Promise<void> {
  const database = await getDb();

  // Generate display_id
  const displayId = await generateDisplayId(date);

  await database.run(
    `INSERT OR IGNORE INTO admin_logs (event_id, chat_id, user_id, action_type, date, raw_data, display_id, operator_name, target_name, message_content, ban_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [eventId, chatId, userId, actionType, date, rawData, displayId, operatorName, targetName, messageContent, banReason]
  );
}

export async function getAdminLogs(chatId: number, limit: number = 50, offset: number = 0): Promise<AdminLog[]> {
  const database = await getDb();
  return database.all<AdminLog[]>(
    `SELECT * FROM admin_logs WHERE chat_id = ? AND action_type IN ('Banned', 'Delete', 'Mute', 'Unmute', 'Ban', 'Unban') ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
    [chatId, limit, offset]
  );
}

// -------------------------------------------------------
// PUSH BOT HELPERS
// -------------------------------------------------------

// -------------------------------------------------------

export async function createCaptchaSession(session: CaptchaSession): Promise<void> {
  const database = await getDb();
  await database.run(
    `INSERT OR REPLACE INTO captcha_sessions 
     (chat_id, user_id, username, first_name, captcha_type, answer, message_id, created_at, expire_at, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.chat_id,
      session.user_id,
      session.username || null,
      session.first_name || "User",
      session.captcha_type,
      session.answer,
      session.message_id || null,
      session.created_at,
      session.expire_at,
      session.status || "pending",
    ]
  );
}

export async function getPendingCaptchaSession(chatId: number, userId: number): Promise<CaptchaSession | null> {
  const database = await getDb();
  const row = await database.get(
    `SELECT * FROM captcha_sessions WHERE chat_id = ? AND user_id = ? AND status = 'pending'`,
    [chatId, userId]
  );
  return row || null;
}

export async function updateCaptchaSessionMessageId(chatId: number, userId: number, messageId: number): Promise<void> {
  const database = await getDb();
  await database.run(
    `UPDATE captcha_sessions SET message_id = ? WHERE chat_id = ? AND user_id = ? AND status = 'pending'`,
    [messageId, chatId, userId]
  );
}

export async function updateCaptchaSessionStatus(
  chatId: number,
  userId: number,
  status: "passed" | "failed" | "expired"
): Promise<void> {
  const database = await getDb();
  await database.run(
    `UPDATE captcha_sessions SET status = ? WHERE chat_id = ? AND user_id = ?`,
    [status, chatId, userId]
  );
}

export async function getExpiredCaptchaSessions(): Promise<CaptchaSession[]> {
  const database = await getDb();
  const now = Date.now();
  const rows = await database.all(
    `SELECT * FROM captcha_sessions WHERE status = 'pending' AND expire_at <= ?`,
    [now]
  );
  return rows || [];
}

export async function deleteCaptchaSession(chatId: number, userId: number): Promise<void> {
  const database = await getDb();
  await database.run(`DELETE FROM captcha_sessions WHERE chat_id = ? AND user_id = ?`, [chatId, userId]);
}

export async function incrementCaptchaSessionAttempts(chatId: number, userId: number): Promise<number> {
  const database = await getDb();
  await database.run(
    `UPDATE captcha_sessions SET attempts = attempts + 1 WHERE chat_id = ? AND user_id = ? AND status = 'pending'`,
    [chatId, userId]
  );
  const row = await database.get<{ attempts: number }>(
    `SELECT attempts FROM captcha_sessions WHERE chat_id = ? AND user_id = ?`,
    [chatId, userId]
  );
  return row?.attempts || 1;
}

export async function updateCaptchaSessionChallenge(
  chatId: number,
  userId: number,
  answer: string,
  messageId: number
): Promise<void> {
  const database = await getDb();
  await database.run(
    `UPDATE captcha_sessions SET answer = ?, message_id = ? WHERE chat_id = ? AND user_id = ? AND status = 'pending'`,
    [answer, messageId, chatId, userId]
  );
}

export async function cleanupOldCaptchaSessions(): Promise<number> {
  const database = await getDb();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
  const result = await database.run(
    `DELETE FROM captcha_sessions WHERE status != 'pending' AND created_at < ?`,
    [cutoff]
  );
  return result.changes || 0;
}



// -------------------------------------------------------
// ADMIN USER MANAGEMENT HELPERS
// -------------------------------------------------------
export async function getAllUsers(chatId: number | null, page: number = 1, limit: number = 20, search: string = ""): Promise<DbUser[]> {
  const database = await getDb();
  const offset = (page - 1) * limit;
  let sql = "SELECT * FROM users WHERE 1=1";
  const params: any[] = [];

  if (chatId) {
    sql += " AND chat_id = ?";
    params.push(chatId);
  }
  if (search) {
    sql += " AND (username LIKE ? OR first_name LIKE ? OR user_id LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  sql += " ORDER BY total_xp DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return database.all<DbUser[]>(sql, params);
}

export async function getUserCount(chatId: number | null, search: string = ""): Promise<number> {
  const database = await getDb();
  let sql = "SELECT COUNT(*) as count FROM users WHERE 1=1";
  const params: any[] = [];
  if (chatId) {
    sql += " AND chat_id = ?";
    params.push(chatId);
  }
  if (search) {
    sql += " AND (username LIKE ? OR first_name LIKE ? OR user_id LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  const row = await database.get<{ count: number }>(sql, params);
  return row?.count || 0;
}

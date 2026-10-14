import drawbotRouter from "./drawbot/routes";
import { startDrawScheduler } from "./drawbot/scheduler";
import { isDrawModuleEnabled, getSavedBotToken } from "./drawbot/database";
import { connectBot, getConnectedBot } from "./drawbot/bot";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Api } from "grammy";
import { PORT, BOT_TOKEN } from "./config";
import * as db from "./database";
import { BotSettings } from "./types";
import { getActiveMonitor } from "./userbot";
import { activeSessions, codeSessions, cleanExpiredSessions, createLoginSession } from "./session";

const app = express();
app.set("trust proxy", 1);
const telegramApi = new Api(BOT_TOKEN);

// Apply helmet for standard security HTTP headers (disable CSP to avoid breaking telegram/fonts CDNs)
app.use(helmet({
  contentSecurityPolicy: false
}));

// Configure CORS allowed origins based on WEBAPP_URL and local dev origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];
if (process.env.WEBAPP_URL) {
  try {
    const url = new URL(process.env.WEBAPP_URL);
    allowedOrigins.push(url.origin);
  } catch {}
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  }
}));

// Rate limiter for general public API endpoints (100 req/min per IP, skip admin paths)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: (req) => req.path.startsWith("/admin") || req.path.startsWith("/api/admin") || req.path.startsWith("/api/draw"),
  message: { error: "Too many requests from this IP, please try again after a minute." }
});

// Dedicated strict rate limiter for login verification sessions
const authInitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: "Too many login verification requests. Please try again after a minute." }
});

app.use("/api/", apiLimiter);
app.use(express.json());

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve static assets from public folder with optimized caching headers
app.use(express.static(path.join(process.cwd(), "public"), {
  maxAge: 0,
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".css")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else if (filePath.includes("uploads")) {
      res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day for uploaded media
    }
  }
}));

// Route aliases to serve HTML files cleanly
app.get("/leaderboard", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(process.cwd(), "public", "leaderboard.html"));
});

app.get("/admin", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(process.cwd(), "public", "admin.html"));
});

app.get("/", (req, res) => {
  res.redirect("/admin");
});

// Admin Authorization Middleware
export async function authorizeAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.substring(7);
  const settings = await db.getSettings();

  // 1. Check if token is the master admin password (constant-time timingSafeEqual protection)
  const configuredPassword = settings.admin_password || "";
  const tokenBuf = Buffer.from(token);
  const passBuf = Buffer.from(configuredPassword);
  const isPasswordMatch = tokenBuf.length === passBuf.length && tokenBuf.length > 0 && crypto.timingSafeEqual(tokenBuf, passBuf);

  if (isPasswordMatch) {
    // Check IP whitelist if configured
    const whitelistStr = process.env.ADMIN_IP_WHITELIST || "";
    if (whitelistStr) {
      const allowedIps = whitelistStr.split(",").map(ip => ip.trim());
      const clientIp = req.ip || req.socket.remoteAddress || "";
      let cleanIp = clientIp.startsWith("::ffff:") ? clientIp.substring(7) : clientIp;
      const rawSocketIp = req.socket.remoteAddress || "";
      const socketIp = rawSocketIp.startsWith("::ffff:") ? rawSocketIp.substring(7) : rawSocketIp;
      const isLoopback = socketIp === "127.0.0.1" || socketIp === "::1";
      const effectiveIp = isLoopback ? (cleanIp || socketIp) : socketIp;
      const isAllowed = allowedIps.includes(effectiveIp);
      if (!isAllowed) {
        console.warn(`[Security Warning] Admin password auth blocked from unauthorized IP: ${effectiveIp} (Socket: ${socketIp})`);
        return res.status(403).json({ error: "Password login is restricted to whitelisted IPs. Please use Telegram Login instead." });
      }
    }
    return next();
  }

  // 2. Check if token is an active Telegram authorized session
  cleanExpiredSessions();
  const session = activeSessions.get(token);
  if (session && session.authorized && session.expiresAt > Date.now()) {
    return next();
  }

  res.status(403).json({ error: "Invalid password or session" });
}

// Lucky Draw Module API (Protected by admin auth)
app.use("/api/draw", authorizeAdmin, drawbotRouter);

// Multer Storage config for uploaded assets
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === "avatar" ? "default_avatar" : "card_bg";
    cb(null, `${prefix}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG and WebP images are allowed."));
    }
  },
});

// In-memory cache for Leaderboard responses (TTL: 5 seconds, max 200 items)
const leaderboardResponseCache = new Map<string, { data: any; expiresAt: number }>();

// -------------------------------------------------------------
// PUBLIC API ROUTES
// -------------------------------------------------------------
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await db.getSettings();
    const safeSettings = {
      card_bg_color: settings.card_bg_color,
      card_bg_image: settings.card_bg_image,
      card_text_color: settings.card_text_color,
      card_progress_color: settings.card_progress_color,
      card_font_size_level: settings.card_font_size_level,
      card_font_size_rank: settings.card_font_size_rank,
      card_font_size_name: settings.card_font_size_name,
      xp_message_sent: settings.xp_message_sent,
      cooldown_message_sent: settings.cooldown_message_sent,
      xp_reaction_added: settings.xp_reaction_added,
      cooldown_reaction_added: settings.cooldown_reaction_added,
      xp_peer_recognition: settings.xp_peer_recognition,
      cooldown_peer_recognition: settings.cooldown_peer_recognition,
      community_name: settings.community_name || "Community",
      default_avatar: settings.default_avatar || "",
    };
    res.json(safeSettings);
  } catch (err: any) {
    console.error("Fetch public settings error:", err);
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const period = (req.query.period as string) || "weekly";
    const userId = req.query.user_id ? parseInt(req.query.user_id as string, 10) : undefined;
    const settings = await db.getSettings();

    let chatId = 0;
    if (req.query.chat_id) {
      chatId = parseInt(req.query.chat_id as string, 10);
    } else if (settings.allowed_communities && settings.allowed_communities.length > 0) {
      chatId = settings.allowed_communities[0].chat_id;
    } else if (settings.last_active_chat_id) {
      chatId = typeof settings.last_active_chat_id === "string"
        ? parseInt(settings.last_active_chat_id, 10)
        : settings.last_active_chat_id;
    }

    const cacheKey = `act_${period}_${chatId}_${userId || 0}`;
    const cached = leaderboardResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const limit = 50;
    const users = period === "all"
      ? await db.getAllTimeLeaderboard(chatId, limit)
      : await db.getWeeklyLeaderboard(chatId, limit);

    const leaderboard = users.map((u, index) => ({
      ...u,
      rank: index + 1
    }));

    let currentUser: any = undefined;
    if (userId) {
      const u = await db.getUser(chatId, userId);
      if (u) {
        const rank = await db.getUserRank(chatId, userId, period === "all" ? "all" : "weekly");
        currentUser = {
          ...u,
          rank
        };
      }
    }

    const responseData = {
      leaderboard,
      currentUser,
      community_name: settings.community_name || "Community",
      period
    };

    if (leaderboardResponseCache.size > 200) {
      leaderboardResponseCache.clear();
    }
    leaderboardResponseCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 5000 });

    res.json(responseData);
  } catch (err: any) {
    console.error("Fetch leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard data." });
  }
});

// -------------------------------------------------------------
// ADMIN AUTHENTICATION
// -------------------------------------------------------------
app.get("/api/admin/auth/init", authInitLimiter, (req, res) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress;
    const { token, code } = createLoginSession(clientIp);
    res.json({ token, code });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to initialize login verification session." });
  }
});

app.get("/api/admin/auth/poll", (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ error: "Token is required." });
  }
  cleanExpiredSessions();
  const session = activeSessions.get(token);
  if (!session) {
    return res.json({ status: "expired" });
  }
  if (session.authorized) {
    return res.json({ status: "authorized" });
  }
  return res.json({ status: "pending" });
});

app.post("/api/admin/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const session = activeSessions.get(token);
    if (session) {
      codeSessions.delete(session.code);
      activeSessions.delete(token);
    }
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// ADMIN SETTINGS & MEDIA
// -------------------------------------------------------------
app.get("/api/admin/settings", authorizeAdmin, async (req, res) => {
  try {
    const settings = await db.getSettings();
    const safeSettings = { ...settings };
    delete safeSettings.admin_password; // Never expose password in GET
    res.json(safeSettings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch settings." });
  }
});

app.post("/api/admin/settings", authorizeAdmin, async (req, res) => {
  try {
    const current = await db.getSettings();
    const payload = req.body;
    if (!payload.admin_password) {
      delete payload.admin_password;
    }
    const updated = { ...current, ...payload };
    await db.saveSettings(updated);
    leaderboardResponseCache.clear();
    res.json({ success: true, message: "Settings saved successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save settings." });
  }
});

app.post("/api/admin/upload-bg", authorizeAdmin, upload.single("background"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    const settings = await db.getSettings();
    if (settings.card_bg_image && settings.card_bg_image.startsWith("/uploads/")) {
      const oldLocalPath = path.join(process.cwd(), "public", settings.card_bg_image);
      if (fs.existsSync(oldLocalPath)) {
        try { fs.unlinkSync(oldLocalPath); } catch {}
      }
    }
    const webPath = `/uploads/${req.file.filename}`;
    await db.updateSettings({ card_bg_image: webPath });
    res.json({ success: true, url: webPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to upload background." });
  }
});

app.post("/api/admin/delete-bg", authorizeAdmin, async (req, res) => {
  try {
    const settings = await db.getSettings();
    if (settings.card_bg_image && settings.card_bg_image.startsWith("/uploads/")) {
      const localPath = path.join(process.cwd(), "public", settings.card_bg_image);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }
    await db.updateSettings({ card_bg_image: "" });
    res.json({ success: true, message: "Card background removed." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete background." });
  }
});

app.post("/api/admin/upload-avatar", authorizeAdmin, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    const settings = await db.getSettings();
    if (settings.default_avatar && settings.default_avatar.startsWith("/uploads/")) {
      const oldLocalPath = path.join(process.cwd(), "public", settings.default_avatar);
      if (fs.existsSync(oldLocalPath)) {
        try { fs.unlinkSync(oldLocalPath); } catch {}
      }
    }
    const webPath = `/uploads/${req.file.filename}`;
    await db.updateSettings({ default_avatar: webPath });
    res.json({ success: true, url: webPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to upload avatar." });
  }
});

app.post("/api/admin/delete-avatar", authorizeAdmin, async (req, res) => {
  try {
    const settings = await db.getSettings();
    if (settings.default_avatar && settings.default_avatar.startsWith("/uploads/")) {
      const localPath = path.join(process.cwd(), "public", settings.default_avatar);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }
    await db.updateSettings({ default_avatar: "" });
    res.json({ success: true, message: "Default avatar removed." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete avatar." });
  }
});

// -------------------------------------------------------------
// ADMIN USER MANAGEMENT (ACTIVITY XP)
// -------------------------------------------------------------
app.get("/api/admin/users", authorizeAdmin, async (req, res) => {
  try {
    const rawChatId = req.query.chat_id || req.query.chatId;
    const chatId = rawChatId ? parseInt(rawChatId as string, 10) : null;
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "20", 10);
    const search = (req.query.search as string || "").trim();

    const users = await db.getAllUsers(chatId, page, limit, search);
    const totalCount = await db.getUserCount(chatId, search);

    res.json({
      users,
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch users." });
  }
});

app.post("/api/admin/users/update", authorizeAdmin, async (req, res) => {
  try {
    const chatId = req.body.chat_id !== undefined ? req.body.chat_id : req.body.chatId;
    const userId = req.body.user_id !== undefined ? req.body.user_id : req.body.userId;
    const totalXp = req.body.total_xp !== undefined ? req.body.total_xp : req.body.totalXp;
    const weeklyXp = req.body.weekly_xp !== undefined ? req.body.weekly_xp : req.body.weeklyXp;

    if (chatId === undefined || userId === undefined) {
      return res.status(400).json({ error: "chat_id and user_id are required." });
    }
    await db.updateUserXp(
      parseInt(String(chatId), 10),
      parseInt(String(userId), 10),
      parseInt(String(totalXp || 0), 10),
      parseInt(String(weeklyXp || 0), 10)
    );
    leaderboardResponseCache.clear();
    res.json({ success: true, message: "User XP updated successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update user XP." });
  }
});

app.post("/api/admin/users/delete", authorizeAdmin, async (req, res) => {
  try {
    const chatId = req.body.chat_id !== undefined ? req.body.chat_id : req.body.chatId;
    const userId = req.body.user_id !== undefined ? req.body.user_id : req.body.userId;

    if (chatId === undefined || userId === undefined) {
      return res.status(400).json({ error: "chat_id and user_id are required." });
    }
    await db.deleteUser(parseInt(String(chatId), 10), parseInt(String(userId), 10));
    leaderboardResponseCache.clear();
    res.json({ success: true, message: "User deleted." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete user." });
  }
});

// -------------------------------------------------------------
// ADMIN HISTORY & RESET
// -------------------------------------------------------------
app.get("/api/admin/history-periods", authorizeAdmin, async (req, res) => {
  try {
    const periods = await db.getHistoryPeriods();
    res.json({ periods });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch history periods." });
  }
});

app.get("/api/admin/history-leaderboard", authorizeAdmin, async (req, res) => {
  try {
    const periodDate = (req.query.period_date || req.query.periodDate) as string;
    if (!periodDate) {
      return res.status(400).json({ error: "period_date is required." });
    }
    const history = await db.getHistoryLeaderboard(periodDate);
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch history leaderboard." });
  }
});

app.post("/api/admin/reset-weekly", authorizeAdmin, async (req, res) => {
  try {
    const periodDate = new Date().toISOString().split("T")[0];
    const settings = await db.getSettings();
    const historyLimit = settings.history_periods_limit !== undefined ? settings.history_periods_limit : 5;
    await db.archiveWeeklyLeaderboard(periodDate, historyLimit);
    leaderboardResponseCache.clear();
    res.json({ success: true, message: `Weekly XP archived and reset for ${periodDate}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to reset weekly XP." });
  }
});

// -------------------------------------------------------------
// CUSTOM COMMANDS
// -------------------------------------------------------------
app.get("/api/admin/commands", authorizeAdmin, async (req, res) => {
  try {
    const commands = await db.getAllCustomCommands();
    res.json(commands);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch commands." });
  }
});

app.post("/api/admin/commands/save", authorizeAdmin, async (req, res) => {
  try {
    const triggerName = req.body.trigger_name || req.body.triggerName;
    const { content, action_type, actionType } = req.body;
    if (!triggerName) {
      return res.status(400).json({ error: "trigger_name is required." });
    }
    await db.saveCustomCommand(String(triggerName).trim().toLowerCase(), content || "", action_type || actionType || "text");
    res.json({ success: true, message: "Command saved." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save command." });
  }
});

app.post("/api/admin/commands/delete", authorizeAdmin, async (req, res) => {
  try {
    const triggerName = req.body.trigger_name || req.body.triggerName;
    if (!triggerName) {
      return res.status(400).json({ error: "trigger_name is required." });
    }
    await db.deleteCustomCommand(String(triggerName).trim().toLowerCase());
    res.json({ success: true, message: "Command deleted." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete command." });
  }
});

// -------------------------------------------------------------
// SAFETY & SPAM LOGS
// -------------------------------------------------------------
app.get("/api/admin/spam-logs", authorizeAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || "50", 10);
    const offset = parseInt(req.query.offset as string || "0", 10);
    const logs = await db.getSpamLogs(limit, offset);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch spam logs." });
  }
});

app.post("/api/admin/spam/action", authorizeAdmin, async (req, res) => {
  try {
    const logIdRaw = req.body.log_id !== undefined ? req.body.log_id : req.body.logId;
    const action = req.body.action;
    let chatId = req.body.chat_id !== undefined ? req.body.chat_id : req.body.chatId;
    let userId = req.body.user_id !== undefined ? req.body.user_id : req.body.userId;

    if (!logIdRaw || !action) {
      return res.status(400).json({ error: "log_id and action are required." });
    }
    const logId = parseInt(String(logIdRaw), 10);

    // If chat_id or user_id not provided by client, query from spam_logs table
    if (!chatId || !userId) {
      const logRecord = await db.getSpamLog(logId);
      if (logRecord) {
        chatId = logRecord.chat_id;
        userId = logRecord.user_id;
      }
    }

    if (action === "ban" && chatId && userId) {
      try {
        await telegramApi.banChatMember(chatId, userId);
      } catch (tgErr: any) {
        console.warn("Telegram ban API error:", tgErr.message);
      }
      await db.banUser(chatId, userId, null, "User", null, null, "Admin via Web");
      await db.updateSpamLogStatus(logId, "banned");
    } else if (action === "mute" && chatId && userId) {
      try {
        const durationSec = req.body.duration ? parseInt(String(req.body.duration), 10) * 60 : 3600;
        const untilDate = Math.floor(Date.now() / 1000) + durationSec;
        await telegramApi.restrictChatMember(chatId, userId, {
          can_send_messages: false
        }, { until_date: untilDate });
      } catch (tgErr: any) {
        console.warn("Telegram mute API error:", tgErr.message);
      }
      await db.updateSpamLogStatus(logId, "muted");
    } else if (action === "dismiss") {
      await db.updateSpamLogStatus(logId, "dismissed");
    }

    res.json({ success: true, message: `Action ${action} executed.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to execute spam action." });
  }
});

// -------------------------------------------------------------
// BANNED USERS
// -------------------------------------------------------------
app.get("/api/admin/banned-users", authorizeAdmin, async (req, res) => {
  try {
    const rawChatId = req.query.chat_id || req.query.chatId;
    const chatId = rawChatId ? parseInt(rawChatId as string, 10) : undefined;
    const users = await db.getBannedUsers(chatId || 0);
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch banned users." });
  }
});

app.post("/api/admin/banned-users/restore", authorizeAdmin, async (req, res) => {
  try {
    const chatId = req.body.chat_id !== undefined ? req.body.chat_id : req.body.chatId;
    const userId = req.body.user_id !== undefined ? req.body.user_id : req.body.userId;

    if (!chatId || !userId) {
      return res.status(400).json({ error: "chat_id and user_id are required." });
    }
    try {
      await telegramApi.unbanChatMember(parseInt(String(chatId), 10), parseInt(String(userId), 10), { only_if_banned: true });
    } catch (tgErr: any) {
      console.warn("Telegram unban API warning:", tgErr.message);
    }
    await db.unbanUser(parseInt(String(chatId), 10), parseInt(String(userId), 10));
    res.json({ success: true, message: "User unbanned and restored." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to unban user." });
  }
});

// -------------------------------------------------------------
// RECENT ACTIONS (MTProto Userbot Admin Logs)
// -------------------------------------------------------------
app.get("/api/admin/admin-logs", authorizeAdmin, async (req, res) => {
  try {
    const rawChatId = req.query.chat_id || req.query.chatId;
    const chatId = rawChatId ? parseInt(rawChatId as string, 10) : undefined;
    const isConfigured = !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_USER_SESSION);
    const logs = await db.getAdminLogs(chatId || 0, 100);
    res.json({ configured: isConfigured, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch admin logs." });
  }
});

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------
export function startServer() {
  const host = process.env.HOST || "127.0.0.1";
  app.listen(PORT, host, () => {
    console.log(`[Server] TeleGuard Web service running on http://${host}:${PORT}`);
    isDrawModuleEnabled().then(async (enabled) => {
      if (enabled) {
        startDrawScheduler();
        console.log("[Server] Draw module engine is ACTIVE, auto-draw scheduler started.");
        const token = await getSavedBotToken();
        if (token && token.trim() && !getConnectedBot()) {
          try {
            const botInfo = await connectBot(token.trim());
            console.log("[Server] DrawBot auto-connected on boot: @" + botInfo.bot?.username);
          } catch (botErr: any) {
            console.warn("[Server] DrawBot auto-connect on boot warning:", botErr.message);
          }
        }
      } else {
        console.log("[Server] Draw module engine is DORMANT (0 background memory/polling).");
      }
    }).catch(err => {
      console.warn("[Server] Check draw module status warning:", err.message);
    });
  });
}

export default app;

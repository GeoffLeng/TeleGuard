import { Bot, InlineKeyboard, InputFile, Context } from "grammy";
import { escapeHtml } from "./utils";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { BOT_TOKEN, WEBAPP_URL, TELEGRAM_APP_URL, PORT, TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_USER_SESSION, MONITOR_CHAT_IDS, USERBOT_POLL_INTERVAL_MS, SA_ADMIN_TG_IDS } from "./config";
import { UserbotMonitor, getActiveMonitor } from "./userbot";
import * as db from "./database";
import { generateRankCard } from "./card";
import { generateMathCaptcha, generateTextCaptcha } from "./captcha";
import { startServer } from "./server";
import { handleDrawCallbackQuery } from "./drawbot/bot";

import { BotSettings, CommunityTarget } from "./types";
import { activeSessions, codeSessions } from "./session";

// Global Process Crash Guards: Prevent network drop or 409 conflict from terminating server
process.on('unhandledRejection', (reason) => {
  console.warn('[Process Warning] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught Exception:', err);
});

if (!BOT_TOKEN || BOT_TOKEN.includes("PlaceholderToken")) {
  console.warn("⚠️ [Bot Warning] BOT_TOKEN has not been configured in .env. The bot will not start successfully without a valid token.");
}

const bot = new Bot(BOT_TOKEN, {
  client: {
    // Custom endpoint if needed, default is standard telegram api
  }
});

// Global error handler to prevent crashing on unhandled Grammy/API errors
bot.catch((err) => {
  console.error("Error in bot middleware:", err);
});

// -------------------------------------------------------
// MULTI-COMMUNITY / TOPIC FILTERING HELPERS
// -------------------------------------------------------

/**
 * Check if the current chat is in the allowed communities list.
 * Returns the matching CommunityTarget or null.
 * If allowed_communities is empty, returns a wildcard match (all allowed).
 */
function findCommunityTarget(chatId: number, communities: CommunityTarget[]): CommunityTarget | null {
  if (!communities || communities.length === 0) {
    // No restrictions configured — allow all
    return { chat_id: chatId, command_topic_ids: [], data_topic_ids: [] };
  }
  return communities.find(c => c.chat_id === chatId) || null;
}

/**
 * Check if the command's topic is allowed within a community.
 */
function isCommandTopicAllowed(threadId: number | null, target: CommunityTarget): boolean {
  if (!target.command_topic_ids || target.command_topic_ids.length === 0) {
    return true; // No command topic restriction
  }
  if (threadId === null) {
    // If target permits Topic 1 (Telegram General Topic) and client omitted thread_id, allow it
    return target.command_topic_ids.includes(1);
  }
  return target.command_topic_ids.includes(threadId);
}

/**
 * Check if the message's topic is allowed for data collection within a community.
 */
function isDataTopicAllowed(threadId: number | null, target: CommunityTarget): boolean {
  if (!target.data_topic_ids || target.data_topic_ids.length === 0) {
    return true; // No data topic restriction
  }
  if (threadId === null) {
    // If target permits Topic 1 (Telegram General Topic) and client omitted thread_id, allow it
    return target.data_topic_ids.includes(1);
  }
  return target.data_topic_ids.includes(threadId);
}

/**
 * Full check: is this context (chat + topic) allowed for commands?
 * Returns { allowed: boolean, community: CommunityTarget | null, wrongGroup: boolean }
 */
function checkAccess(ctx: Context, settings: BotSettings): {
  allowed: boolean;
  community: CommunityTarget | null;
  wrongGroup: boolean;
} {
  // Private chats are always allowed
  if (ctx.chat?.type === "private") {
    return { allowed: true, community: null, wrongGroup: false };
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    return { allowed: false, community: null, wrongGroup: true };
  }
  const threadId = ctx.message?.message_thread_id || null;
  const community = findCommunityTarget(chatId, settings.allowed_communities);

  if (!community) {
    return { allowed: false, community: null, wrongGroup: true };
  }

  const topicOk = isCommandTopicAllowed(threadId, community);
  return { allowed: topicOk, community, wrongGroup: false };
}


// Helper to generate WebApp keyboard, passing chat_id for multi-community isolation
function getLeaderboardKeyboard(text: string, isPrivateChat: boolean, chatId?: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let url = WEBAPP_URL;
  if (chatId) {
    const separator = url.includes("?") ? "&" : "?";
    url += `${separator}chat_id=${chatId}`;
  }
  if (isPrivateChat && url.startsWith("https://")) {
    return keyboard.webApp(text, url);
  } else {
    const finalUrl = TELEGRAM_APP_URL || url;
    return keyboard.url(text, finalUrl);
  }
}

// Interpolate dynamic placeholders in command content
function interpolateContent(content: string, settings: BotSettings): string {
  return content
    .replace(/{xp_message_sent}/g, String(settings.xp_message_sent))
    .replace(/{cooldown_message_sent}/g, String(settings.cooldown_message_sent))
    .replace(/{xp_reaction_added}/g, String(settings.xp_reaction_added))
    .replace(/{cooldown_reaction_added}/g, String(settings.cooldown_reaction_added))
    .replace(/{xp_peer_recognition}/g, String(settings.xp_peer_recognition))
    .replace(/{cooldown_peer_recognition}/g, String(settings.cooldown_peer_recognition))
    .replace(/{community_name}/g, String(settings.community_name || "Community"));
}

/**
 * Constructs a dynamic Telegram topic or group URL based on chat metadata
 */
export function buildTopicLink(chat: any, topicId?: number | null): string {
  if (!chat) return "";
  const username = chat.username ? String(chat.username).replace(/^@/, "").trim() : "";
  if (username) {
    return topicId ? `https://t.me/${username}/${topicId}` : `https://t.me/${username}`;
  }
  const chatId = chat.id;
  if (chatId) {
    const rawId = String(chatId).replace(/^-100/, "").replace(/^-/, "");
    return topicId ? `https://t.me/c/${rawId}/${topicId}` : `https://t.me/c/${rawId}`;
  }
  return "";
}

/**
 * Renders community and topic dynamic placeholders in template strings.
 * Supports: {group}, {group_name}, {community}, {topic_id}, {topic}, {topic_link}, {topic_url}, {group_link}
 * Also automatically upgrades/replaces legacy hardcoded Telegram topic links to match the active group & topic.
 */
export function renderCommunityTopicTemplate(
  template: string,
  ctx: Context,
  target?: CommunityTarget | null,
  designatedTopicId?: number | null,
  settings?: BotSettings
): string {
  if (!template) return "";

  const chat = ctx.chat;
  const groupTitle = chat && "title" in chat && chat.title ? chat.title : (settings?.community_name || "the group");

  let topicIdNum: number | undefined;
  let topicIdStr = "";
  if (designatedTopicId !== undefined && designatedTopicId !== null) {
    topicIdNum = Number(designatedTopicId);
    topicIdStr = String(designatedTopicId);
  } else if (target?.command_topic_ids && target.command_topic_ids.length > 0) {
    topicIdNum = target.command_topic_ids[0];
    topicIdStr = target.command_topic_ids.join(", ");
  } else if (target?.data_topic_ids && target.data_topic_ids.length > 0) {
    topicIdNum = target.data_topic_ids[0];
    topicIdStr = target.data_topic_ids.join(", ");
  }

  const topicLink = buildTopicLink(chat, topicIdNum);
  const groupLink = buildTopicLink(chat, null);

  // If template is the default plain warning without any placeholder or link, render standardized dynamic warning
  if (template.trim() === "❌ This command is restricted. Please use it in the designated topic." && topicLink) {
    return `❌ Restricted command. Please use Topic ${topicIdStr || "1"} in ${groupTitle}: ${topicLink}`;
  }

  let rendered = template
    .replace(/\{group\}/g, groupTitle)
    .replace(/\{group_name\}/g, groupTitle)
    .replace(/\{community\}/g, groupTitle)
    .replace(/\{topic_id\}/g, topicIdStr || "1")
    .replace(/\{topic\}/g, topicIdStr || "1")
    .replace(/\{topic_link\}/g, topicLink)
    .replace(/\{topic_url\}/g, topicLink)
    .replace(/\{group_link\}/g, groupLink)
    .replace(/\{community_link\}/g, groupLink);

  // If template doesn't explicitly use {topic_link} or {topic_url}, upgrade legacy topic links safely:
  // 1) Historical project default links (CashboxCommunity / 1967420845)
  // 2) Any topic link pointing to this active chat (to update outdated topic IDs)
  // External channel/group links (e.g. rules, news) are preserved without being overwritten.
  if (topicLink && !template.includes("{topic_link}") && !template.includes("{topic_url}")) {
    rendered = rendered.replace(/https:\/\/t\.me\/(?:c\/1967420845|CashboxCommunity)\/\d+/gi, topicLink);

    const username = chat && "username" in chat && chat.username ? String(chat.username).replace(/^@/, "").trim() : "";
    if (username) {
      const chatLinkRegex = new RegExp(`https:\\/\\/t\\.me\\/${username}\\/\\d+`, "gi");
      rendered = rendered.replace(chatLinkRegex, topicLink);
    }

    const rawId = chat?.id ? String(chat.id).replace(/^-100/, "").replace(/^-/, "") : "";
    if (rawId) {
      const rawLinkRegex = new RegExp(`https:\\/\\/t\\.me\\/c\\/${rawId}\\/\\d+`, "gi");
      rendered = rendered.replace(rawLinkRegex, topicLink);
    }
  }

  return rendered;
}

// -------------------------------------------------------
// DYNAMIC COMMAND EXECUTOR
// -------------------------------------------------------

async function executeCommand(ctx: Context, cmd: { trigger_name: string; content: string; action_type: string }, settings: BotSettings) {
  const isPrivate = ctx.chat?.type === "private";
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  switch (cmd.action_type) {
    case "rank": {
      // Generate and send rank card
      const userId = ctx.from?.id;
      if (!userId) return;

      const loadingMsg = await ctx.reply("⏳ Generating your rank card, please wait...", {
        message_thread_id: ctx.message?.message_thread_id
      });

      try {
        const firstName = ctx.from!.first_name || "User";
        const lastName = ctx.from!.last_name || null;
        const username = ctx.from!.username || null;
        const displayName = `${firstName} ${lastName || ""}`.trim();

        // For rank cards in private chat, try to find user's first community
        let effectiveChatId = chatId;
        if (isPrivate) {
          const communities = await db.getUserCommunities(userId);
          effectiveChatId = communities.length > 0 ? communities[0] : 0;
        }

        let userObj = await db.getUser(effectiveChatId, userId);
        if (!userObj) {
          userObj = await db.createUser(effectiveChatId, userId, username, firstName, lastName);
        }

        const rank = await db.getUserRank(effectiveChatId, userId, "all");

        // Fetch user avatar URL from Telegram API only if not cached
        let avatarUrl: string | null = userObj.avatar_url || null;
        if (avatarUrl === null) {
          try {
            const photos = await ctx.api.getUserProfilePhotos(userId, { limit: 1 });
            if (photos.total_count > 0 && photos.photos[0].length > 0) {
              const photoSize = photos.photos[0][1] || photos.photos[0][0];
              const file = await ctx.api.getFile(photoSize.file_id);
              const remoteAvatarUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

              const imgRes = await fetch(remoteAvatarUrl);
              if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const localFileName = `avatar_${userId}.jpg`;
                const localPath = path.join(process.cwd(), "public", "uploads", localFileName);

                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(localPath, buffer);

                avatarUrl = `/uploads/${localFileName}`;
                await db.updateUserAvatar(userId, avatarUrl);
              } else {
                avatarUrl = remoteAvatarUrl;
              }
            } else {
              avatarUrl = "none";
              await db.updateUserAvatar(userId, "none");
            }
          } catch (e) {
            console.error("Failed to fetch Telegram user avatar:", e);
          }
        }

        const finalAvatarUrl = avatarUrl === "none" ? null : avatarUrl;

        const cardBuffer = await generateRankCard(
          {
            level: userObj.level,
            rank,
            displayName,
            username,
            totalXp: userObj.total_xp,
            avatarUrl: finalAvatarUrl,
          },
          settings
        );

        try {
          await ctx.api.deleteMessage(chatId, loadingMsg.message_id);
        } catch { }

        const keyboard = getLeaderboardKeyboard("Leaderboard 📈", isPrivate, effectiveChatId);

        await ctx.replyWithPhoto(new InputFile(cardBuffer), {
          reply_markup: keyboard,
          message_thread_id: ctx.message?.message_thread_id
        });
      } catch (err) {
        console.error("Failed to generate and send rank card:", err);
        try {
          await ctx.api.deleteMessage(chatId, loadingMsg.message_id);
        } catch { }
        await ctx.reply("⚠️ Failed to load rank card. Please try again later.", {
          message_thread_id: ctx.message?.message_thread_id
        });
      }
      break;
    }

    case "leaderboard": {
      const replyText = cmd.content ? interpolateContent(cmd.content, settings) : "📈 Click the button below to view the community leaderboard:";
      const keyboard = getLeaderboardKeyboard("Leaderboard 📈", isPrivate, chatId);
      await ctx.reply(replyText, {
        reply_markup: keyboard,
        message_thread_id: ctx.message?.message_thread_id
      });
      break;
    }

    case "start": {
      const replyText = interpolateContent(cmd.content, settings);
      const keyboard = getLeaderboardKeyboard("Leaderboard 📈", isPrivate, chatId);
      try {
        await ctx.reply(replyText, {
          reply_markup: keyboard,
          parse_mode: "Markdown",
          message_thread_id: ctx.message?.message_thread_id
        });
      } catch (parseErr) {
        // Fallback to plain text if Markdown parsing fails
        await ctx.reply(replyText, {
          reply_markup: keyboard,
          message_thread_id: ctx.message?.message_thread_id
        });
      }
      break;
    }

    case "text":
    default: {
      const replyText = interpolateContent(cmd.content, settings);
      try {
        await ctx.reply(replyText, {
          parse_mode: "Markdown",
          message_thread_id: ctx.message?.message_thread_id
        });
      } catch (parseErr) {
        // Fallback to plain text if Markdown parsing fails
        await ctx.reply(replyText, {
          message_thread_id: ctx.message?.message_thread_id
        });
      }
      break;
    }
  }
}

// -------------------------------------------------------
// ANTI-SPAM & LINK INTERCEPTOR ENGINE
// -------------------------------------------------------

const adminStatusCache = new Map<string, { isAdmin: boolean; timestamp: number }>();
const adminStatusPending = new Map<string, Promise<boolean>>();

async function isUserAdmin(ctx: Context, userId: number, chatId: number): Promise<boolean> {
  // Global Super Administrator (SA Admin) full bypass
  try {
    const settings = await db.getSettings();
    const saAdminIds = (settings.sa_admin_tg_ids && settings.sa_admin_tg_ids.length > 0)
      ? settings.sa_admin_tg_ids
      : SA_ADMIN_TG_IDS;
    if (saAdminIds.includes(userId)) {
      return true;
    }
  } catch {}

  // In private chat, only SA Admins are authorized as administrators
  if (ctx.chat?.type === "private") return false;

  const cacheKey = `${chatId}_${userId}`;
  const now = Date.now();
  const cached = adminStatusCache.get(cacheKey);

  // Cache admin status for 5 minutes (300,000 ms)
  if (cached && (now - cached.timestamp < 300000)) {
    return cached.isAdmin;
  }

  // Deduplicate concurrent requests
  let pendingPromise = adminStatusPending.get(cacheKey);
  if (!pendingPromise) {
    pendingPromise = (async () => {
      try {
        const member = await ctx.api.getChatMember(chatId, userId);
        const isAdmin = member.status === "administrator" || member.status === "creator";
        adminStatusCache.set(cacheKey, { isAdmin, timestamp: Date.now() });
        return isAdmin;
      } catch (err) {
        console.error(`[Security] Failed to fetch chat member status for ${userId} in ${chatId}:`, err);
        return cached ? cached.isAdmin : false;
      } finally {
        adminStatusPending.delete(cacheKey);
      }
    })();
    adminStatusPending.set(cacheKey, pendingPromise);
  }

  return pendingPromise;
}

function isConversationalPseudoUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  const trimmed = urlStr.trim();

  // Explicit protocols, www prefixes, paths, queries, or credentials indicate an intended URL
  if (/^(https?:\/\/|ftp:\/\/|www\.)/i.test(trimmed)) {
    return false;
  }
  if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#") || trimmed.includes("@") || trimmed.includes(":")) {
    return false;
  }

  // Matches standalone word ending with conversational slang/interjections that happen to be ICANN TLDs (e.g. mind.lol, think.lol, really.wtf, cat.meme)
  const conversationalSlangRegex = /^[a-zA-Z0-9_-]+\.(lol|lmao|rofl|wtf|meme)$/i;
  return conversationalSlangRegex.test(trimmed);
}

function extractUrls(ctx: Context): string[] {
  const text = ctx.message?.text || ctx.message?.caption || "";
  const entities = ctx.message?.entities || ctx.message?.caption_entities || [];
  const urls: string[] = [];

  for (const ent of entities) {
    if (ent.type === "url") {
      const urlStr = text.substring(ent.offset, ent.offset + ent.length);
      if (isConversationalPseudoUrl(urlStr)) {
        continue;
      }
      urls.push(urlStr);
    } else if (ent.type === "text_link") {
      if (ent.url) {
        if (isConversationalPseudoUrl(ent.url)) {
          continue;
        }
        urls.push(ent.url);
      }
    }
  }

  // Extract URLs from inline keyboards
  const keyboard = ctx.message?.reply_markup?.inline_keyboard;
  if (keyboard && Array.isArray(keyboard)) {
    for (const row of keyboard) {
      if (Array.isArray(row)) {
        for (const button of row) {
          if ('url' in button && button.url) {
            urls.push(button.url);
          }
          if ('web_app' in button && button.web_app?.url) {
            urls.push(button.web_app.url);
          }
        }
      }
    }
  }

  return urls;
}

function matchDomainHost(targetHost: string, ruleDomain: string): boolean {
  let base = ruleDomain.toLowerCase().trim();
  if (base.startsWith("*.")) {
    base = base.substring(2);
  } else if (base.startsWith(".")) {
    base = base.substring(1);
  }
  return targetHost === base || targetHost.endsWith("." + base);
}

function isDomainWhitelisted(urlStr: string, whitelist: string[]): boolean {
  try {
    let target = urlStr.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = "http://" + target;
    }
    const parsedTarget = new URL(target);
    let targetHost = parsedTarget.hostname.toLowerCase().trim();
    if (targetHost.endsWith(".")) {
      targetHost = targetHost.slice(0, -1);
    }
    let targetPath = parsedTarget.pathname;
    if (targetPath.length > 1 && targetPath.endsWith("/")) {
      targetPath = targetPath.slice(0, -1);
    }

    return whitelist.some(rule => {
      let cleanedRule = rule.toLowerCase().trim();
      if (!cleanedRule) return false;

      // Strip protocols from rule if present
      if (cleanedRule.startsWith("http://")) {
        cleanedRule = cleanedRule.substring(7);
      } else if (cleanedRule.startsWith("https://")) {
        cleanedRule = cleanedRule.substring(8);
      }

      const slashIndex = cleanedRule.indexOf("/");
      if (slashIndex === -1) {
        // Domain-only rule (e.g. "x.com" or "*.x.com")
        return matchDomainHost(targetHost, cleanedRule);
      } else {
        // Domain + path rule (e.g. "t.me/cashboxgamebot" or "*.x.com/status")
        const ruleDomain = cleanedRule.substring(0, slashIndex);
        let rulePath = cleanedRule.substring(slashIndex);
        if (rulePath.length > 1 && rulePath.endsWith("/")) {
          rulePath = rulePath.slice(0, -1);
        }

        if (!matchDomainHost(targetHost, ruleDomain)) return false;
        if (rulePath === "" || rulePath === "/") return true;

        const targetPathLower = targetPath.toLowerCase();
        const rulePathLower = rulePath.toLowerCase();
        return targetPathLower === rulePathLower || targetPathLower.startsWith(rulePathLower + "/");
      }
    });
  } catch (e) {
    return false;
  }
}


const userMessageTimestamps = new Map<string, number[]>();

function checkSpamFlood(userId: number, chatId: number, thresholdMsgs: number, thresholdSecs: number, messageTimestamp?: number): boolean {
  const key = `${chatId}_${userId}`;
  const now = messageTimestamp ? messageTimestamp * 1000 : Date.now();

  // Stale message protection: ignore historical messages delivered in backlog during startup (older than 60s)
  if (Date.now() - now > 60000) {
    return false;
  }

  let timestamps = userMessageTimestamps.get(key);
  if (!timestamps) {
    timestamps = [];
    userMessageTimestamps.set(key, timestamps);
  }
  timestamps.push(now);
  const cutOff = now - (thresholdSecs * 1000);
  const filtered = timestamps.filter(t => t > cutOff);
  userMessageTimestamps.set(key, filtered);

  return filtered.length > thresholdMsgs;
}

// Memory cache for CAS verified clean users (to avoid hitting Combot API on every message)
const casCleanUsers = new Set<number>();

// Background Memory Garbage Collector (runs every 10 minutes)
setInterval(() => {
  const now = Date.now();

  // 1. Clean userMessageTimestamps
  for (const [key, timestamps] of userMessageTimestamps.entries()) {
    if (!timestamps || timestamps.length === 0 || timestamps[timestamps.length - 1] < now - 60000) {
      userMessageTimestamps.delete(key);
    }
  }

  // 2. Clean adminStatusCache (5 mins expiry)
  for (const [key, val] of adminStatusCache.entries()) {
    if (now - val.timestamp >= 300000) {
      adminStatusCache.delete(key);
    }
  }

  // 3. Clean interactive query sessions
}, 10 * 60 * 1000);

// Daily TTL reset for CAS verified users (every 24h)
setInterval(() => {
  casCleanUsers.clear();
}, 24 * 60 * 60 * 1000);

// Map of lookalike Unicode characters (Cyrillic, Greek, etc.) to standard Latin characters
const HOMOGLYPHS_MAP: { [key: string]: string } = {
  // Cyrillic to Latin
  '\u0430': 'a', '\u0410': 'A', // а, А
  '\u0435': 'e', '\u0415': 'E', // е, Е
  '\u043e': 'o', '\u041e': 'O', // о, О
  '\u0440': 'p', '\u0420': 'P', // р, Р
  '\u0441': 'c', '\u0421': 'C', // с, С
  '\u0445': 'x', '\u0425': 'X', // х, Х
  '\u0456': 'i', '\u0406': 'I', // і, І
  '\u0443': 'y', '\u0423': 'Y', // у, У
  '\u0455': 's', '\u0405': 'S', // ѕ, Ѕ
  '\u045d': 's',
  '\u043c': 'm', '\u041c': 'M', // м, М
  '\u0442': 't', '\u0422': 'T', // т, Т
  '\u0432': 'b', '\u0412': 'B', // в, В
  '\u043d': 'h', '\u041d': 'H', // н, Н
  '\u043a': 'k', '\u041a': 'K', // к, К
  '\u0437': '3', '\u0417': '3', // з, З
  // Greek to Latin
  '\u03b1': 'a', '\u0391': 'A', // α, Α
  '\u03b5': 'e', '\u0395': 'E', // ε, Ε
  '\u03bf': 'o', '\u039f': 'O', // ο, Ο
  '\u03bd': 'v', '\u039d': 'N', // ν, Ν
  '\u03c4': 't', '\u03a4': 'T', // τ, Τ
  '\u03ba': 'k', '\u039a': 'K', // κ, Κ
  '\u03c5': 'y', '\u03a5': 'Y', // υ, Υ
  '\u03c1': 'r', '\u03a1': 'P', // ρ, Ρ
  '\u03c7': 'x', '\u03a7': 'X', // χ, Χ
  '\u03b9': 'i', '\u0399': 'I', // ι, Ι
  '\u03b7': 'h', '\u0397': 'H', // η, Η
  '\u03bc': 'u', // μ
};

// Helper to normalize styled Unicode alphanumeric characters and resolve homoglyphs
function normalizeUnicodeText(str: string): string {
  if (!str) return "";
  try {
    const normalized = str
      .normalize("NFKD") // Decompose math symbols, circled/fullwidth letters, etc.
      .replace(/[\u0300-\u036f]/g, ""); // Strip accents/combining marks
    
    let result = "";
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      result += HOMOGLYPHS_MAP[char] || char;
    }
    return result;
  } catch (err) {
    return str;
  }
}


// Fetch helper for Combot CAS (Combat Anti-Spam) database check
async function checkCasBanned(userId: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

    const res = await fetch(`https://api.cas.chat/check?user_id=${userId}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return false;
    const data = await res.json() as any;
    return !!(data.ok && data.result && data.result.offender);
  } catch (err) {
    console.error(`[Security] CAS API check failed for user ${userId}:`, err);
    return false;
  }
}

// -------------------------------------------------------
// GROUP CAPTCHA VERIFICATION & WELCOME SYSTEM
// -------------------------------------------------------

// Runtime cache for group username -> numeric chat ID
const groupUsernameToChatIdMap = new Map<string, number>();

export function parseCommunityIdentifier(input: string | number): {
  numericId?: number;
  username?: string;
  topicId?: number;
} {
  const str = String(input || "").trim();
  if (!str) return {};

  // Pure number (e.g. -1001967420845 or 1967420845)
  if (/^-?\d+$/.test(str)) {
    return { numericId: Number(str) };
  }

  // Telegram private supergroup topic link: https://t.me/c/1967420845/1
  const cMatch = str.match(/(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/c\/(\d+)(?:\/(\d+))?/i);
  if (cMatch) {
    const rawId = cMatch[1];
    const numericId = (rawId.length >= 12 && rawId.startsWith("100")) ? Number(`-${rawId}`) : Number(`-100${rawId}`);
    const topicId = cMatch[2] ? Number(cMatch[2]) : undefined;
    return { numericId, topicId };
  }

  // Telegram public link with username and optional topic: https://t.me/testdrawlevel2000/1
  const linkMatch = str.match(/(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)(?:\/(\d+))?/i);
  if (linkMatch) {
    const username = linkMatch[1].toLowerCase();
    const topicId = linkMatch[2] ? Number(linkMatch[2]) : undefined;
    return { username, topicId };
  }

  // Plain username: @testdrawlevel2000 or testdrawlevel2000
  const cleanUsername = str.replace(/^@/, "").toLowerCase();
  return { username: cleanUsername };
}

// Helper to resolve community and topic configuration for captcha & welcome
function getCaptchaCommunityConfig(
  settings: BotSettings,
  chatId: number,
  chatUsername?: string | null
): { matched: boolean; topicId?: number } {
  const list = settings.captcha_communities || [];
  if (list.length === 0) {
    return { matched: true };
  }

  const currentChatUsername = chatUsername ? chatUsername.replace(/^@/, "").trim().toLowerCase() : undefined;

  for (const c of list) {
    if (c.chat_id === undefined || c.chat_id === null || c.chat_id === "") continue;
    const parsed = parseCommunityIdentifier(c.chat_id);

    let isMatch = false;

    // 1. Numeric ID matching
    if (parsed.numericId !== undefined) {
      if (parsed.numericId === Number(chatId)) {
        isMatch = true;
      }
    } else if (/^-?\d+$/.test(String(c.chat_id).trim())) {
      if (Number(c.chat_id) === Number(chatId)) {
        isMatch = true;
      }
    }

    // 2. Direct username matching (e.g. testdrawlevel2000)
    if (!isMatch && parsed.username && currentChatUsername) {
      if (parsed.username === currentChatUsername) {
        isMatch = true;
      }
    }

    // 3. Cached username-to-chatId matching
    if (!isMatch && parsed.username) {
      const cachedId = groupUsernameToChatIdMap.get(parsed.username);
      if (cachedId !== undefined && cachedId === Number(chatId)) {
        isMatch = true;
      }
    }

    if (isMatch) {
      let resolvedTopic: number | undefined = undefined;
      if (c.topic_id && Number(c.topic_id) > 0) {
        resolvedTopic = Number(c.topic_id);
      } else if (parsed.topicId && Number(parsed.topicId) > 0) {
        resolvedTopic = Number(parsed.topicId);
      }
      return {
        matched: true,
        topicId: resolvedTopic,
      };
    }
  }

  return { matched: false };
}

// In-memory deduplication cache for welcome messages (chatId:userId -> timestamp)
const recentWelcomeCache = new Map<string, number>();

function isWelcomeDeduplicated(chatId: number, userId: number): boolean {
  const key = `${chatId}:${userId}`;
  const now = Date.now();
  const lastTime = recentWelcomeCache.get(key);
  if (lastTime && now - lastTime < 60_000) {
    return true; // Duplicate detected within 60s window
  }
  recentWelcomeCache.set(key, now);
  // Periodic cleanup if map grows
  if (recentWelcomeCache.size > 2000) {
    for (const [k, time] of recentWelcomeCache.entries()) {
      if (now - time > 120_000) {
        recentWelcomeCache.delete(k);
      }
    }
  }
  return false;
}

// Helper to send customizable welcome message with optional topic routing and auto-deletion
async function sendWelcomeMessage(
  ctx: Context,
  chatId: number,
  user: { id: number; first_name?: string; username?: string | null },
  topicId: number | undefined,
  settings: BotSettings
): Promise<void> {
  if (!settings.welcome_enabled) return;
  if (isWelcomeDeduplicated(chatId, user.id)) {
    return;
  }

  const tpl = settings.welcome_message || "🎉 Welcome {mention} to {group}! Glad to have you here.";
  const mention = user.username ? `@${user.username}` : (user.first_name || "New Member");
  const baseRendered = renderCommunityTopicTemplate(tpl, ctx, null, topicId, settings);
  const msgText = baseRendered
    .replace(/\{mention\}/g, mention)
    .replace(/\{name\}/g, user.first_name || "New Member");

  try {
    let sent;
    const sendOpts: any = {};
    if (topicId) {
      sendOpts.message_thread_id = topicId;
    }
    try {
      sent = await ctx.api.sendMessage(chatId, msgText, sendOpts);
    } catch (err: any) {
      if (topicId && (err?.description?.includes("thread") || err?.description?.includes("topic"))) {
        sent = await ctx.api.sendMessage(chatId, msgText);
      } else {
        throw err;
      }
    }

    if (sent && settings.welcome_delete_delay_mins && settings.welcome_delete_delay_mins > 0) {
      const delayMs = Math.round(settings.welcome_delete_delay_mins * 60 * 1000);
      setTimeout(async () => {
        try {
          await ctx.api.deleteMessage(chatId, sent.message_id);
        } catch {}
      }, delayMs);
    }
  } catch (err) {
    console.error(`[Welcome] Failed to send welcome message in chat ${chatId}:`, err);
  }
}

// Helper to send a new captcha challenge photo and keyboard on attempt 1 failure
async function sendCaptchaRetryChallenge(
  ctx: Context,
  chatId: number,
  targetUserId: number,
  captchaType: string,
  mention: string,
  timeoutSec: number,
  topicId?: number
): Promise<void> {
  const isMath = captchaType === "math";
  const captchaData = isMath ? await generateMathCaptcha() : await generateTextCaptcha();
  const keyboard = new InlineKeyboard();
  if (captchaData.options && captchaData.options.length === 4) {
    keyboard
      .text(captchaData.options[0], `verify_choice:${targetUserId}:${captchaData.options[0]}`)
      .text(captchaData.options[1], `verify_choice:${targetUserId}:${captchaData.options[1]}`)
      .row()
      .text(captchaData.options[2], `verify_choice:${targetUserId}:${captchaData.options[2]}`)
      .text(captchaData.options[3], `verify_choice:${targetUserId}:${captchaData.options[3]}`);
  }

  const caption = isMath
    ? `⚠️ Incorrect answer on Attempt 1/2 for ${mention}. Please calculate & select/reply within ${timeoutSec}s:`
    : `⚠️ Incorrect code on Attempt 1/2 for ${mention}. Please enter/select 6-char code within ${timeoutSec}s:`;

  const sendOpts: any = {
    caption,
    reply_markup: keyboard,
  };
  if (topicId) {
    sendOpts.message_thread_id = topicId;
  }

  let sent;
  try {
    sent = await ctx.api.sendPhoto(chatId, new InputFile(captchaData.pngBuffer!), sendOpts);
  } catch (err: any) {
    if (topicId && (err?.description?.includes("thread") || err?.description?.includes("topic"))) {
      sent = await ctx.api.sendPhoto(chatId, new InputFile(captchaData.pngBuffer!), {
        caption,
        reply_markup: keyboard,
      });
    } else {
      throw err;
    }
  }
  await db.updateCaptchaSessionChallenge(chatId, targetUserId, captchaData.answer, sent.message_id);
}

// Global middleware to track group username to chat ID mapping
bot.use(async (ctx, next) => {
  if (ctx.chat?.id && (ctx.chat as any).username) {
    groupUsernameToChatIdMap.set((ctx.chat as any).username.replace(/^@/, "").toLowerCase(), ctx.chat.id);
  }
  await next();
});

// 1. Captcha Answer Interceptor Middleware (Runs before any commands or anti-spam)
bot.use(async (ctx, next) => {
  if (ctx.chat && (ctx.chat.type === "group" || ctx.chat.type === "supergroup") && ctx.from && ctx.message?.text) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const pendingSession = await db.getPendingCaptchaSession(chatId, userId);

    if (pendingSession) {
      const settings = await db.getSettings();
      const chatUsername = ctx.chat && "username" in ctx.chat ? (ctx.chat as any).username : undefined;
      const communityConfig = getCaptchaCommunityConfig(settings, chatId, chatUsername);

      // Topic restriction check: user can only answer in designated topic!
      if (communityConfig.topicId) {
        const msgThreadId = ctx.message.message_thread_id;
        if (msgThreadId !== communityConfig.topicId) {
          await next();
          return;
        }
      }

      const userText = ctx.message.text.trim();
      // Normalize comparison for both text and math formula answers
      const isCorrect = userText.toUpperCase() === pendingSession.answer.trim().toUpperCase();

      if (isCorrect) {
        // Mark session passed
        await db.updateCaptchaSessionStatus(chatId, userId, "passed");

        // Unrestrict user
        try {
          await ctx.api.restrictChatMember(chatId, userId, {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_invite_users: true,
          });
        } catch (e) {
          console.error(`[Captcha] Failed to unrestrict user ${userId}:`, e);
        }

        // Clean up messages if configured
        if (settings.captcha_delete_messages !== false) {
          try {
            await ctx.deleteMessage();
          } catch {}
          if (pendingSession.message_id) {
            try {
              await ctx.api.deleteMessage(chatId, pendingSession.message_id);
            } catch {}
          }
        }

        // Send Welcome Message if enabled
        if (settings.welcome_enabled) {
          await sendWelcomeMessage(
            ctx,
            chatId,
            { id: userId, first_name: pendingSession.first_name || undefined, username: pendingSession.username },
            communityConfig.topicId,
            settings
          );
        } else {
          try {
            const tpl = settings.captcha_success_msg || "✅ Verification successful! Welcome {name} to {group}!";
            const baseRendered = renderCommunityTopicTemplate(tpl, ctx, null, communityConfig.topicId, settings);
            const msgText = baseRendered.replace(/\{name\}/g, pendingSession.first_name || "New Member");
            const sendOpts: any = {};
            if (communityConfig.topicId) {
              sendOpts.message_thread_id = communityConfig.topicId;
            }
            const successMsg = await ctx.reply(msgText, sendOpts);
            setTimeout(async () => {
              try {
                await ctx.api.deleteMessage(chatId, successMsg.message_id);
              } catch {}
            }, 5000);
          } catch {}
        }

        return; // Block message from triggering XP gain
      } else {
        // Incorrect Answer Handler — Support 2 attempts retry
        const attempts = await db.incrementCaptchaSessionAttempts(chatId, userId);

        if (settings.captcha_delete_messages !== false) {
          try {
            await ctx.deleteMessage();
          } catch {}
        }

        if (attempts < 2) {
          // 1st wrong answer -> Delete 1st challenge message and push 2nd challenge!
          if (pendingSession.message_id) {
            try {
              await ctx.api.deleteMessage(chatId, pendingSession.message_id);
            } catch (err: any) {
              console.warn(`[Captcha] Could not delete previous challenge message ${pendingSession.message_id}:`, err?.message || err);
            }
          }

          const mention = pendingSession.username ? `@${pendingSession.username}` : `${pendingSession.first_name || "New Member"}`;
          const timeoutSec = Math.max(10, Math.floor((pendingSession.expire_at - Date.now()) / 1000));

          await sendCaptchaRetryChallenge(ctx, chatId, userId, pendingSession.captcha_type, mention, timeoutSec, communityConfig.topicId);
        } else {
          // 2nd wrong answer -> Delete challenge & Kick user out so they must rejoin to try again
          if (pendingSession.message_id) {
            try {
              await ctx.api.deleteMessage(chatId, pendingSession.message_id);
            } catch {}
          }
          await db.updateCaptchaSessionStatus(chatId, userId, "failed");
          try {
            if (settings.captcha_failed_action === "ban") {
              await ctx.api.banChatMember(chatId, userId);
            } else {
              await ctx.api.banChatMember(chatId, userId);
              await ctx.api.unbanChatMember(chatId, userId);
            }
          } catch {}
        }
        return;
      }
    }
  }

  await next();
});

// 2. Click & Choice Verification Callback Handler
bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const isClick = data.startsWith("verify_click:");
  const isChoice = data.startsWith("verify_choice:");

  if (!isClick && !isChoice) {
    await next();
    return;
  }

  const parts = data.split(":");
  if (parts.length < 3) return;
  const targetUserId = parseInt(parts[1], 10);
  if (isNaN(targetUserId)) return;
  const clickerUserId = ctx.from.id;

  const settings = await db.getSettings();
  const chatUsername = ctx.chat && "username" in ctx.chat ? (ctx.chat as any).username : undefined;
  const communityConfig = getCaptchaCommunityConfig(settings, ctx.chat?.id || 0, chatUsername);

  if (clickerUserId !== targetUserId) {
    const alertMsg = settings.captcha_alert_other_user || "❌ This verification button belongs to a new member, no action required for you!";
    await ctx.answerCallbackQuery({ text: alertMsg, show_alert: true });
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = await db.getPendingCaptchaSession(chatId, clickerUserId);
  if (!session) {
    const alertMsg = settings.captcha_alert_expired || "⚠️ Verification session has expired or already been completed.";
    await ctx.answerCallbackQuery({ text: alertMsg, show_alert: true });
    return;
  }

  if (isClick) {
    // Mark session passed
    await db.updateCaptchaSessionStatus(chatId, clickerUserId, "passed");

    // Clean up challenge message
    if (settings.captcha_delete_messages !== false && session.message_id) {
      try {
        await ctx.api.deleteMessage(chatId, session.message_id);
      } catch {}
    }
  } else if (isChoice) {
    const selectedOption = parts.slice(2).join(":");
    const isCorrect = selectedOption.toUpperCase() === session.answer.toUpperCase();

    if (!isCorrect) {
      const attempts = await db.incrementCaptchaSessionAttempts(chatId, clickerUserId);

      if (attempts < 2) {
        // 1st wrong click -> Delete 1st challenge and push 2nd challenge!
        if (session.message_id) {
          try {
            await ctx.api.deleteMessage(chatId, session.message_id);
          } catch (err: any) {
            console.warn(`[Captcha] Could not delete previous challenge message ${session.message_id}:`, err?.message || err);
          }
        }

        const alertFail1 = settings.captcha_alert_attempt1_fail || "❌ Incorrect option! Attempt 1/2. Please try again.";
        await ctx.answerCallbackQuery({ text: alertFail1, show_alert: true });

        const mention = session.username ? `@${session.username}` : `${session.first_name || "New Member"}`;
        const timeoutSec = Math.max(10, Math.floor((session.expire_at - Date.now()) / 1000));

        await sendCaptchaRetryChallenge(ctx, chatId, clickerUserId, session.captcha_type, mention, timeoutSec, communityConfig.topicId);
        return;
      } else {
        // 2nd wrong click -> Fail & Kick user out so they must rejoin to try again
        const alertFinalFail = settings.captcha_alert_final_fail || "❌ Incorrect option! Attempt 2/2. Verification failed, please rejoin to try again.";
        await ctx.answerCallbackQuery({ text: alertFinalFail, show_alert: true });
        await db.updateCaptchaSessionStatus(chatId, clickerUserId, "failed");
        try {
          if (settings.captcha_failed_action === "ban") {
            await ctx.api.banChatMember(chatId, clickerUserId);
          } else {
            await ctx.api.banChatMember(chatId, clickerUserId);
            await ctx.api.unbanChatMember(chatId, clickerUserId);
          }
        } catch {}
        if (settings.captcha_delete_messages !== false && session.message_id) {
          try {
            await ctx.api.deleteMessage(chatId, session.message_id);
          } catch {}
        }
        return;
      }
    }

    // Mark session passed
    await db.updateCaptchaSessionStatus(chatId, clickerUserId, "passed");

    // Clean up challenge message
    if (settings.captcha_delete_messages !== false && session.message_id) {
      try {
        await ctx.api.deleteMessage(chatId, session.message_id);
      } catch {}
    }
  }

  // Unrestrict member
  try {
    await ctx.api.restrictChatMember(chatId, clickerUserId, {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_invite_users: true,
    });
  } catch (err) {
    console.error(`[Captcha] Failed to unrestrict user ${clickerUserId}:`, err);
  }

  // Send Welcome Message if enabled
  if (settings.welcome_enabled) {
    await sendWelcomeMessage(
      ctx,
      chatId,
      { id: clickerUserId, first_name: session.first_name || undefined, username: session.username },
      communityConfig.topicId,
      settings
    );
  }

  const succAlertTpl = settings.captcha_alert_success || "✅ Verification successful! You can now send messages in {group}.";
  const succAlertText = renderCommunityTopicTemplate(succAlertTpl, ctx, null, communityConfig.topicId, settings);
  await ctx.answerCallbackQuery({ text: succAlertText, show_alert: true });
});

// 3. New Member Join Event Handler (Includes Profile Name Spam Shield)
bot.on(["message:new_chat_members", "chat_member"], async (ctx, next) => {
  const settings = await db.getSettings();
  if (!settings.captcha_enabled && !settings.welcome_enabled) {
    await next();
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await next();
    return;
  }

  const chatUsername = ctx.chat && "username" in ctx.chat ? (ctx.chat as any).username : undefined;
  if (chatId && chatUsername) {
    groupUsernameToChatIdMap.set(chatUsername.replace(/^@/, "").toLowerCase(), chatId);
  }

  const communityConfig = getCaptchaCommunityConfig(settings, chatId, chatUsername);
  if (!communityConfig.matched) {
    await next();
    return;
  }

  let joinedUsers: { id: number; username?: string | null; first_name: string }[] = [];

  if (ctx.message?.new_chat_members) {
    joinedUsers = ctx.message.new_chat_members.filter((u) => !u.is_bot);
  } else if (ctx.chatMember) {
    const oldStatus = ctx.chatMember.old_chat_member.status;
    const newStatus = ctx.chatMember.new_chat_member.status;
    if ((oldStatus === "left" || oldStatus === "kicked") && (newStatus === "member" || newStatus === "restricted")) {
      const u = ctx.chatMember.new_chat_member.user;
      if (!u.is_bot) {
        joinedUsers = [u];
      }
    }
  }

  if (joinedUsers.length === 0) {
    await next();
    return;
  }

  for (const user of joinedUsers) {
    const userId = user.id;

    // Check if user is admin
    const isAdmin = await isUserAdmin(ctx, userId, chatId);
    if (isAdmin) continue;

    // PROFILE SPAM SHIELD: Check for ad links or spam keywords in Name/Username
    const fullName = `${user.first_name || ""} ${user.username || ""}`.toLowerCase();
    const hasAdLink = /t\.me\/|https?:\/\/|www\./.test(fullName) || /[\u202e]/.test(fullName);
    const spamKeywords = settings.spam_keywords || ["包赢", "导师", "兼职", "空投", "彩票", "赌博"];
    const hasSpamKeyword = spamKeywords.some((kw) => kw && fullName.includes(kw.toLowerCase()));

    if (hasAdLink || hasSpamKeyword) {
      console.warn(`[Profile Spam Shield] Auto-banning spam account ${userId} (${fullName})`);
      try {
        await ctx.api.banChatMember(chatId, userId);
      } catch {}
      continue;
    }

    // CASE 1: Welcome is ON, Captcha is OFF -> Send welcome message directly
    if (!settings.captcha_enabled && settings.welcome_enabled) {
      await sendWelcomeMessage(ctx, chatId, user, communityConfig.topicId, settings);
      continue;
    }

    // CASE 2: Captcha is ON -> Restrict user, send challenge to topic, welcome will be sent after pass
    // DEDUPLICATION: Check if user already has a pending session (prevents duplicate Telegram pushes)
    const existingSession = await db.getPendingCaptchaSession(chatId, userId);
    if (existingSession) {
      continue;
    }

    // Restrict user first
    try {
      await ctx.api.restrictChatMember(chatId, userId, {
        can_send_messages: false,
      });
    } catch (err) {
      console.error(`[Captcha] Failed to restrict user ${userId} in chat ${chatId}:`, err);
    }

    // Determine Captcha Type
    let selectedType: "math" | "text" | "click" = "math";
    if (settings.captcha_type === "random") {
      const types: ("math" | "text" | "click")[] = ["math", "text", "click"];
      selectedType = types[Math.floor(Math.random() * types.length)];
    } else if (settings.captcha_type === "text" || settings.captcha_type === "click") {
      selectedType = settings.captcha_type;
    }

    const timeoutSec = settings.captcha_timeout_seconds || 180;
    const createdAt = Date.now();
    const expireAt = createdAt + timeoutSec * 1000;
    const mention = user.username ? `@${user.username}` : `${user.first_name}`;

    if (selectedType === "click") {
      const btnText = settings.captcha_button_text || "🤖 I am human, tap to verify";
      const keyboard = new InlineKeyboard().text(btnText, `verify_click:${userId}:${createdAt}`);
      const clickTpl = settings.captcha_welcome_msg_click || "🛡️ Welcome {mention} to {group}!\nPlease tap the button below within {timeout}s to complete human verification:";
      const clickMsgText = renderCommunityTopicTemplate(clickTpl, ctx, null, communityConfig.topicId, settings)
        .replace(/\{mention\}/g, mention)
        .replace(/\{timeout\}/g, String(timeoutSec));

      const sendOpts: any = { reply_markup: keyboard };
      if (communityConfig.topicId) {
        sendOpts.message_thread_id = communityConfig.topicId;
      }

      try {
        let sent;
        try {
          sent = await ctx.api.sendMessage(chatId, clickMsgText, sendOpts);
        } catch (err: any) {
          if (communityConfig.topicId && (err?.description?.includes("thread") || err?.description?.includes("topic"))) {
            sent = await ctx.api.sendMessage(chatId, clickMsgText, { reply_markup: keyboard });
          } else {
            throw err;
          }
        }

        await db.createCaptchaSession({
          chat_id: chatId,
          user_id: userId,
          username: user.username || null,
          first_name: user.first_name,
          captcha_type: "click",
          answer: "CLICK_PASSED",
          message_id: sent.message_id,
          created_at: createdAt,
          expire_at: expireAt,
          status: "pending",
        });
      } catch (err) {
        console.error(`[Captcha] Error sending click captcha:`, err);
      }
    } else if (selectedType === "math") {
      const captchaData = await generateMathCaptcha();
      // Build 4-choice Inline Keyboard
      const keyboard = new InlineKeyboard();
      if (captchaData.options && captchaData.options.length === 4) {
        keyboard
          .text(captchaData.options[0], `verify_choice:${userId}:${captchaData.options[0]}`)
          .text(captchaData.options[1], `verify_choice:${userId}:${captchaData.options[1]}`)
          .row()
          .text(captchaData.options[2], `verify_choice:${userId}:${captchaData.options[2]}`)
          .text(captchaData.options[3], `verify_choice:${userId}:${captchaData.options[3]}`);
      }

      const mathTpl = settings.captcha_welcome_msg_math || "🛡️ Welcome {mention} to {group}!\nPlease select the correct formula answer within {timeout}s:";
      const mathCaption = renderCommunityTopicTemplate(mathTpl, ctx, null, communityConfig.topicId, settings)
        .replace(/\{mention\}/g, mention)
        .replace(/\{timeout\}/g, String(timeoutSec));

      const sendOpts: any = { caption: mathCaption, reply_markup: keyboard };
      if (communityConfig.topicId) {
        sendOpts.message_thread_id = communityConfig.topicId;
      }

      try {
        let sent;
        try {
          sent = await ctx.api.sendPhoto(chatId, new InputFile(captchaData.pngBuffer!), sendOpts);
        } catch (err: any) {
          if (communityConfig.topicId && (err?.description?.includes("thread") || err?.description?.includes("topic"))) {
            sent = await ctx.api.sendPhoto(chatId, new InputFile(captchaData.pngBuffer!), { caption: mathCaption, reply_markup: keyboard });
          } else {
            throw err;
          }
        }

        await db.createCaptchaSession({
          chat_id: chatId,
          user_id: userId,
          username: user.username || null,
          first_name: user.first_name,
          captcha_type: "math",
          answer: captchaData.answer,
          message_id: sent.message_id,
          created_at: createdAt,
          expire_at: expireAt,
          status: "pending",
        });
      } catch (err) {
        console.error(`[Captcha] Error sending math captcha:`, err);
      }
    } else if (selectedType === "text") {
      const captchaData = await generateTextCaptcha();
      // Build 4-choice Inline Keyboard
      const keyboard = new InlineKeyboard();
      if (captchaData.options && captchaData.options.length === 4) {
        keyboard
          .text(captchaData.options[0], `verify_choice:${userId}:${captchaData.options[0]}`)
          .text(captchaData.options[1], `verify_choice:${userId}:${captchaData.options[1]}`)
          .row()
          .text(captchaData.options[2], `verify_choice:${userId}:${captchaData.options[2]}`)
          .text(captchaData.options[3], `verify_choice:${userId}:${captchaData.options[3]}`);
      }

      const textTpl = settings.captcha_welcome_msg_text || "🛡️ Welcome {mention} to {group}!\nPlease select the correct 6-character captcha option within {timeout}s:";
      const textCaption = renderCommunityTopicTemplate(textTpl, ctx, null, communityConfig.topicId, settings)
        .replace(/\{mention\}/g, mention)
        .replace(/\{timeout\}/g, String(timeoutSec));

      const sendOpts: any = { caption: textCaption, reply_markup: keyboard };
      if (communityConfig.topicId) {
        sendOpts.message_thread_id = communityConfig.topicId;
      }

      try {
        let sent;
        try {
          sent = await ctx.api.sendPhoto(chatId, new InputFile(captchaData.pngBuffer!), sendOpts);
        } catch (err: any) {
          if (communityConfig.topicId && (err?.description?.includes("thread") || err?.description?.includes("topic"))) {
            sent = await ctx.api.sendPhoto(chatId, new InputFile(captchaData.pngBuffer!), { caption: textCaption, reply_markup: keyboard });
          } else {
            throw err;
          }
        }

        await db.createCaptchaSession({
          chat_id: chatId,
          user_id: userId,
          username: user.username || null,
          first_name: user.first_name,
          captcha_type: "text",
          answer: captchaData.answer,
          message_id: sent.message_id,
          created_at: createdAt,
          expire_at: expireAt,
          status: "pending",
        });
      } catch (err) {
        console.error(`[Captcha] Error sending text captcha:`, err);
      }
    }
  }

  await next();
});

// 4. Captcha Expired Sessions Polling Cleanup Task + Periodic DB GC
let lastGcTime = 0;
setInterval(async () => {
  try {
    const expiredSessions = await db.getExpiredCaptchaSessions();
    if (expiredSessions.length > 0) {
      const settings = await db.getSettings();

      for (const session of expiredSessions) {
        await db.updateCaptchaSessionStatus(session.chat_id, session.user_id, "expired");

        // Execute Failed Action
        try {
          if (settings.captcha_failed_action === "ban") {
            await bot.api.banChatMember(session.chat_id, session.user_id);
          } else {
            // Kick (ban then unban so they can rejoin later)
            await bot.api.banChatMember(session.chat_id, session.user_id);
            await bot.api.unbanChatMember(session.chat_id, session.user_id);
          }
        } catch (err) {
          console.error(`[Captcha Task] Failed to kick/ban user ${session.user_id} in chat ${session.chat_id}:`, err);
        }

        // Delete challenge message
        if (settings.captcha_delete_messages !== false && session.message_id) {
          try {
            await bot.api.deleteMessage(session.chat_id, session.message_id);
          } catch {}
        }
      }
    }

    // Run DB GC every 6 hours
    if (Date.now() - lastGcTime > 6 * 60 * 60 * 1000) {
      lastGcTime = Date.now();
      const cleaned = await db.cleanupOldCaptchaSessions();
      if (cleaned > 0) {
        console.log(`[Captcha GC] Cleaned ${cleaned} expired/passed historical captcha sessions.`);
      }
    }
  } catch (err) {
    console.error("[Captcha Task] Error in expired captcha cleanup task:", err);
  }
}, 30000);

// Global Anti-Spam Middleware

bot.use(async (ctx, next) => {

  if (!ctx.chat || (ctx.chat.type !== "supergroup" && ctx.chat.type !== "group")) {
    await next();
    return;
  }

  if (!ctx.message) {
    await next();
    return;
  }

  const userId = ctx.from?.id;
  const chatId = ctx.chat.id;
  if (!userId) {
    await next();
    return;
  }

  const settings = await db.getSettings();

  // Check multi-community access: strictly ignore non-allowed chats
  const community = findCommunityTarget(chatId, settings.allowed_communities);
  if (!community) {
    await next();
    return;
  }

  // Bypass for channel auto-forwards, anonymous channel posts, or group anonymous posts
  if (ctx.message.is_automatic_forward || ctx.message.sender_chat) {
    await next();
    return;
  }

  // Bypass for SA Super Administrators (Community Settings: SA Admin Telegram IDs)
  const saAdminIds = (settings.sa_admin_tg_ids && settings.sa_admin_tg_ids.length > 0)
    ? settings.sa_admin_tg_ids
    : SA_ADMIN_TG_IDS;
  if (saAdminIds.includes(userId)) {
    await next();
    return;
  }

  // Bypass for administrators
  const isAdmin = await isUserAdmin(ctx, userId, chatId);
  if (isAdmin) {
    await next();
    return;
  }

  // Bypass for whitelisted spam topics
  const topicId = ctx.message.message_thread_id;
  if (topicId && settings.ignored_spam_topic_ids && settings.ignored_spam_topic_ids.includes(topicId)) {
    await next();
    return;
  }

  const text = ctx.message.text || ctx.message.caption || "";
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name || "";
  const lastName = ctx.from.last_name || null;
  const fullName = `${firstName} ${lastName || ""}`.trim();

  let isSpam = false;
  let spamReason = "";
  let riskScore = 0;
  let action: "none" | "delete_only" | "restrict" | "ban" = "none";
  let muteDurationMinutes = 60;

  // A. Check for Flooding (HIGHEST PRIORITY - runs before any async network calls)
  if (settings.flood_threshold_messages && settings.flood_threshold_seconds) {
    const isFlooding = checkSpamFlood(
      userId,
      chatId,
      settings.flood_threshold_messages,
      settings.flood_threshold_seconds,
      ctx.message.date
    );
    if (isFlooding) {
      isSpam = true;
      spamReason = `Flooding detected (${settings.flood_threshold_messages} messages in ${settings.flood_threshold_seconds}s)`;
      riskScore = 70;
      action = "restrict";
      muteDurationMinutes = settings.flood_mute_duration || 60;
    }
  }

  // B. Check for Combot CAS Global Database (first message/uncached only)
  if (!isSpam && settings.cas_api_enabled && !casCleanUsers.has(userId)) {
    const isCasBanned = await checkCasBanned(userId);
    if (isCasBanned) {
      isSpam = true;
      spamReason = "User is blacklisted in Combot Anti-Spam (CAS) database";
      riskScore = 95;
      const rawAction = settings.cas_action || "ban";
      action = rawAction === "mute" ? "restrict" : (rawAction as any);
      if (action === "restrict") {
        muteDurationMinutes = settings.cas_mute_duration || 60;
      }
    } else {
      if (casCleanUsers.size >= 20000) {
        casCleanUsers.clear();
      }
      casCleanUsers.add(userId);
    }
  }

  // Normalize text and profile info for keyword analysis (only needed for checks C-G)
  const normalizedText = normalizeUnicodeText(text).toLowerCase();
  const collapsedText = normalizedText.replace(/[\s\p{P}]/gu, ""); // strip all spaces/punctuation
  const normalizedFullName = normalizeUnicodeText(fullName).toLowerCase();
  const collapsedFullName = normalizedFullName.replace(/[\s\p{P}]/gu, "");
  const normalizedUsername = username ? normalizeUnicodeText(username).toLowerCase() : "";

  // C. Check for Unauthorized Inline Keyboards (only bots/exploiters can send buttons)
  if (!isSpam && settings.block_inline_keyboards && ctx.message.reply_markup?.inline_keyboard) {
    let isViaAllowedBot = false;
    if (ctx.message.via_bot) {
      const viaBotUsername = (ctx.message.via_bot.username || "").toLowerCase();
      const allowedBots = settings.allowed_inline_bots || [];
      isViaAllowedBot = allowedBots.some(name => name.toLowerCase().trim() === viaBotUsername);
    }

    if (!isViaAllowedBot) {
      isSpam = true;
      spamReason = "Sent unauthorized inline keyboard buttons";
      riskScore = 95;
      const rawAction = settings.block_inline_keyboards_action || "ban";
      action = rawAction === "mute" ? "restrict" : (rawAction as any);
      if (action === "restrict") {
        muteDurationMinutes = settings.block_inline_keyboards_mute_duration || 60;
      }
    }
  }

  // D. Check for Unauthorized Inline Bot Messages (via @some_bot)
  if (!isSpam && settings.block_inline_bots && ctx.message.via_bot) {
    const viaBotUsername = (ctx.message.via_bot.username || "").toLowerCase();
    const allowedBots = settings.allowed_inline_bots || [];
    const isAllowed = allowedBots.some(name => name.toLowerCase().trim() === viaBotUsername);
    if (!isAllowed) {
      isSpam = true;
      spamReason = `Sent via unauthorized inline bot: @${ctx.message.via_bot.username || "unknown"}`;
      riskScore = 80;
      const rawAction = settings.block_inline_bots_action || "delete_only";
      action = rawAction === "mute" ? "restrict" : (rawAction as any);
      if (action === "restrict") {
        muteDurationMinutes = settings.block_inline_bots_mute_duration || 60;
      }
    }
  }

  // E. Check for RTLO (Right-to-Left Override) character \u202e
  if (!isSpam && settings.rtlo_auto_ban && /[\u202e]/.test(text)) {
    isSpam = true;
    spamReason = "Contains RTLO character (Right-to-Left Override)";
    riskScore = 100;
    const rawAction = settings.rtlo_action || "ban";
    action = rawAction === "mute" ? "restrict" : (rawAction as any);
    if (action === "restrict") {
      muteDurationMinutes = settings.rtlo_mute_duration || 60;
    }
  }

  // F. Check for Spam Keywords (using normalized & collapsed forms)
  if (!isSpam && settings.keyword_auto_ban && settings.spam_keywords && settings.spam_keywords.length > 0) {
    const matchedKeyword = settings.spam_keywords.find(kw => {
      const trimmed = kw.trim();
      if (!trimmed) return false;

      const normKw = normalizeUnicodeText(trimmed).toLowerCase();

      // Standard normalized match
      if (normalizedText.includes(normKw) ||
        normalizedFullName.includes(normKw) ||
        (normalizedUsername && normalizedUsername.includes(normKw))) {
        return true;
      }

      // Collapsed match for spaced-out words (e.g. "加...群", "兼 职")
      const collapsedKw = normKw.replace(/[\s\p{P}]/gu, "");
      if (collapsedKw && collapsedKw.length >= 2) {
        if (collapsedText.includes(collapsedKw) ||
          collapsedFullName.includes(collapsedKw)) {
          return true;
        }
      }
      return false;
    });

    if (matchedKeyword) {
      isSpam = true;
      spamReason = `Matched spam keyword: "${matchedKeyword}"`;
      riskScore = 80;
      const rawAction = settings.keyword_action || "ban";
      action = rawAction === "mute" ? "restrict" : (rawAction as any);
      if (action === "restrict") {
        muteDurationMinutes = settings.keyword_mute_duration || 60;
      }
    }
  }

  // G. Check for Emoji Limit (Prevent spam containing excessive emojis, including custom/dynamic ones)
  if (!isSpam && settings.emoji_auto_ban) {
    const threshold = settings.emoji_threshold || 10;
    
    // 1. Extract and count custom emoji entities
    const entities = (ctx.message.entities || []).concat(ctx.message.caption_entities || []);
    const customEmojiEntities = entities.filter(e => e.type === "custom_emoji");
    
    // 2. To avoid double-counting, replace custom emoji locations in text with spaces before standard counting
    let textForStandardCounting = text;
    for (const entity of customEmojiEntities) {
      const start = entity.offset;
      const end = entity.offset + entity.length;
      if (start >= 0 && end <= textForStandardCounting.length) {
        textForStandardCounting =
          textForStandardCounting.substring(0, start) +
          " ".repeat(entity.length) +
          textForStandardCounting.substring(end);
      }
    }
    
    // 3. Count standard Unicode emojis
    const emojiRegex = /\p{Extended_Pictographic}/gu;
    const emojiMatches = textForStandardCounting.match(emojiRegex);
    const standardEmojiCount = emojiMatches ? emojiMatches.length : 0;
    
    const emojiCount = standardEmojiCount + customEmojiEntities.length;
    
    if (emojiCount > threshold) {
      isSpam = true;
      spamReason = `Excessive emojis detected (${emojiCount} emojis, limit is ${threshold})`;
      riskScore = 85;
      const rawAction = settings.emoji_action || "ban";
      action = rawAction === "mute" ? "restrict" : (rawAction as any);
      if (action === "restrict") {
        muteDurationMinutes = settings.emoji_mute_duration || 60;
      }
    }
  }

  // H. Check for Domain Whitelist Interception
  if (!isSpam && settings.link_intercept_enabled) {
    const urls = extractUrls(ctx);
    if (urls.length > 0) {
      const whitelist = settings.whitelist_domains || [];
      const hasUnallowedLink = urls.some(u => !isDomainWhitelisted(u, whitelist));

      if (hasUnallowedLink) {
        let isNewUser = true;
        try {
          const userObj = await db.getUser(chatId, userId);
          if (userObj && (userObj.level > 1 || userObj.total_xp >= 50)) {
            isNewUser = false;
          }
        } catch { }

        isSpam = true;
        spamReason = "Sent non-whitelisted URL link";
        riskScore = 50;

        if (settings.new_user_link_auto_ban && isNewUser) {
          const rawAction = settings.new_user_link_action || "ban";
          action = rawAction === "mute" ? "restrict" : (rawAction as any);
          if (action === "restrict") {
            muteDurationMinutes = settings.new_user_link_mute_duration || 60;
          }
        } else {
          action = "delete_only";
        }
      }
    }
  }

  // I. Check for Unauthorized Username Mention (Scheme A)
  // Intercept unauthorized @username mentions pointing to bot accounts (suffix "bot" or "_bot") for level 1 / new users.
  if (!isSpam) {
    const entities = (ctx.message.entities || []).concat(ctx.message.caption_entities || []);
    const mentionEntities = entities.filter(e => e.type === "mention");
    if (mentionEntities.length > 0) {
      let isNewUser = true;
      try {
        const userObj = await db.getUser(chatId, userId);
        if (userObj && (userObj.level > 1 || userObj.total_xp >= 50)) {
          isNewUser = false;
        }
      } catch { }

      if (isNewUser) {
        let hasUnauthorizedBotMention = false;
        const textToSearch = text;
        for (const ent of mentionEntities) {
          const mentionStr = textToSearch.substring(ent.offset, ent.offset + ent.length).trim();
          const usernameMentioned = mentionStr.replace(/^@/, "").toLowerCase();
          
          if (usernameMentioned.endsWith("bot") || usernameMentioned.endsWith("_bot")) {
            const allowedInlineBots = settings.allowed_inline_bots || [];
            const currentBotUsername = (bot.botInfo?.username || "").toLowerCase();
            const isAllowed = allowedInlineBots.some(name => name.toLowerCase().trim() === usernameMentioned) ||
                              usernameMentioned === currentBotUsername ||
                              usernameMentioned === "cashboxgamebot"; // Whitelisted CashBoxGameBot
            
            if (!isAllowed) {
              hasUnauthorizedBotMention = true;
              spamReason = `New user sent unauthorized bot mention: @${usernameMentioned}`;
              break;
            }
          }
        }

        if (hasUnauthorizedBotMention) {
          isSpam = true;
          riskScore = 70;
          action = "restrict";
          muteDurationMinutes = 60;
        }
      }
    }
  }

  if (isSpam) {
    console.log(`[Anti-Spam] Intercepted message from user ${userId} in chat ${chatId}. Reason: ${spamReason}. Action: ${action}`);

    // 1. Delete the offending message IMMEDIATELY to minimize exposure time
    try {
      await ctx.api.deleteMessage(chatId, ctx.message.message_id);
    } catch (err) {
      console.error("[Anti-Spam] Failed to delete spam message:", err);
    }

    // 2. Perform database logging
    let finalStatus = "pending";
    if (action === "ban") {
      finalStatus = "auto_banned";
    } else if (action === "delete_only") {
      finalStatus = "dismissed";
    }

    try {
      await db.logSpam(
        chatId,
        userId,
        username,
        firstName,
        lastName,
        spamReason,
        text || "[Media/Other]",
        riskScore,
        finalStatus
      );
    } catch (dbErr) {
      console.error("[Anti-Spam] Failed to log spam to database:", dbErr);
    }

    // 3. Apply administrative restrictions (Ban / Mute)
    if (action === "ban") {
      try {
        await ctx.api.banChatMember(chatId, userId);
        const warnMsg = await ctx.reply(`🚫 User ${fullName} has been automatically banned.`, {
          message_thread_id: ctx.message.message_thread_id
        });
        setTimeout(async () => {
          try {
            await ctx.api.deleteMessage(chatId, warnMsg.message_id);
          } catch { }
        }, 5000);
      } catch (err) {
        console.error(`[Anti-Spam] Failed to ban user ${userId}:`, err);
      }
    } else if (action === "restrict") {
      try {
        const extra: any = {};
        if (muteDurationMinutes && muteDurationMinutes > 0) {
          extra.until_date = Math.floor(Date.now() / 1000) + muteDurationMinutes * 60;
        }
        await ctx.api.restrictChatMember(chatId, userId, {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_manage_topics: false
        }, extra);
        const durationText = muteDurationMinutes > 0 ? `${muteDurationMinutes}m` : "permanently";
        const warnMsg = await ctx.reply(`⚠️ User ${fullName} has been restricted (muted for ${durationText}) for suspicious behavior.`, {
          message_thread_id: ctx.message.message_thread_id
        });
        setTimeout(async () => {
          try {
            await ctx.api.deleteMessage(chatId, warnMsg.message_id);
          } catch { }
        }, 5000);
      } catch (err) {
        console.error(`[Anti-Spam] Failed to restrict user ${userId}:`, err);
      }
    } else if (action === "delete_only") {
      try {
        const warnMsg = await ctx.reply(`⚠️ ${fullName}, links are restricted to whitelisted domains in this group. Your message has been removed.`, {
          message_thread_id: ctx.message.message_thread_id
        });
        setTimeout(async () => {
          try {
            await ctx.api.deleteMessage(chatId, warnMsg.message_id);
          } catch { }
        }, 5000);
      } catch { }
    }

    return;
  }

  await next();
});

// [ignoring loop detection]
// -------------------------------------------------------
// MUTE & BAN ADMIN COMMAND HANDLERS
// -------------------------------------------------------

async function isGroupAdmin(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) return false;

  // Global super admin bypass
  const settings = await db.getSettings();
  const adminIds = settings.sa_admin_tg_ids || SA_ADMIN_TG_IDS;
  if (adminIds.includes(userId)) return true;

  try {
    const member = await ctx.api.getChatMember(chatId, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch (err: any) {
    console.error(`[Bot Admin Check] Failed to check getChatMember status for user ${userId} in chat ${chatId}:`, err.message || err);
    return false;
  }
}

async function resolveTargetUser(ctx: Context, targetStr?: string): Promise<{ userId: number; displayName: string } | null> {
  const cleanStr = (targetStr || "").trim();

  // 1. Prioritize explicit target string typed in the command (e.g. "@username", "username", numeric ID)
  if (cleanStr) {
    // A. Check message entities for text_mention (e.g. users without public username tagged in message)
    if (ctx.message?.entities) {
      for (const entity of ctx.message.entities) {
        if (entity.type === "text_mention" && entity.user) {
          const u = entity.user;
          const name = u.username ? `@${u.username}` : (u.first_name || `User ${u.id}`);
          return { userId: u.id, displayName: name };
        }
      }
    }

    // B. Check SQLite DB by username / mention / first_name / UID
    const dbUser = ctx.chat?.id ? await db.findUserByMention(ctx.chat.id, cleanStr) : null;
    if (dbUser) {
      const name = dbUser.username ? `@${dbUser.username}` : dbUser.first_name;
      return { userId: dbUser.user_id, displayName: name };
    }

    // C. Pure numeric user ID
    const rawDigits = cleanStr.replace(/^@/, '');
    if (/^\d+$/.test(rawDigits)) {
      const parsedId = parseInt(rawDigits, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        return { userId: parsedId, displayName: `User ${parsedId}` };
      }
    }

    // D. Try resolving username via Userbot MTProto + Bot API getChat dual channel
    const usernameMatch = cleanStr.match(/^@?([a-zA-Z0-9_]{3,32})$/);
    if (usernameMatch) {
      try {
        const resolvedId = await resolveTgUsernameDual(ctx, usernameMatch[1]);
        if (resolvedId) {
          return { userId: resolvedId, displayName: `@${usernameMatch[1]}` };
        }
      } catch {}
    }
  }

  // 2. Fallback: If no explicit targetStr was specified, check if admin replied to a user's message
  if (ctx.message?.reply_to_message?.from) {
    const from = ctx.message.reply_to_message.from;
    const name = from.username ? `@${from.username}` : (from.first_name || `User ${from.id}`);
    return { userId: from.id, displayName: name };
  }

  // 3. Fallback: Check text_mention in entities if nothing else matched
  if (ctx.message?.entities) {
    for (const entity of ctx.message.entities) {
      if (entity.type === "text_mention" && entity.user) {
        const u = entity.user;
        const name = u.username ? `@${u.username}` : (u.first_name || `User ${u.id}`);
        return { userId: u.id, displayName: name };
      }
    }
  }

  return null;
}

// Private notification & ephemeral message helper for moderation commands
async function replyAdminPrivate(ctx: Context, htmlMessage: string) {
  // 1. Immediately delete the admin's command message in the group to leave no traces
  try {
    if (ctx.chat && ctx.chat.type !== "private" && ctx.message?.message_id) {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {});
    }
  } catch {}

  const adminId = ctx.from?.id;
  if (!adminId) return;

  // 2. Send moderation receipt directly to Admin's Private Chat (DM) and auto-delete after 5 minutes
  try {
    const dmMsg = await ctx.api.sendMessage(adminId, htmlMessage, { parse_mode: "HTML" });
    if (dmMsg?.message_id) {
      setTimeout(() => {
        ctx.api.deleteMessage(adminId, dmMsg.message_id).catch(() => {});
      }, 300000); // 5 minutes = 300,000 ms
    }
  } catch (err: any) {
    // 3. Fallback: If admin has not started private chat with bot yet, post in group and auto-delete in 5 seconds
    try {
      const chatId = ctx.chat?.id;
      if (chatId) {
        const fallbackNote = `\n\n<i>⚠️ Notice: Start a private chat with @${ctx.me?.username || 'Bot'} to receive confidential receipts directly. (Auto-deleting in 5s)</i>`;
        const sentMsg = await ctx.reply(`${htmlMessage}${fallbackNote}`, {
          parse_mode: "HTML",
          message_thread_id: ctx.message?.message_thread_id
        });
        if (sentMsg?.message_id) {
          setTimeout(() => {
            ctx.api.deleteMessage(chatId, sentMsg.message_id).catch(() => {});
          }, 5000);
        }
      }
    } catch {}
  }
}

async function handleMuteCommand(ctx: Context) {
  if (!ctx.chat || ctx.chat.type === "private") {
    await ctx.reply("❌ This command can only be used in Telegram groups.");
    return;
  }
  const chat = ctx.chat;

  const isAdmin = await isGroupAdmin(ctx);
  if (!isAdmin) {
    await replyAdminPrivate(ctx, "❌ <b>Access Denied</b>: Only group administrators can perform this moderation command.");
    return;
  }

  const text = ctx.message?.text || "";
  // Flexible regex matching: /mute [spaces] [duration] [spaces] [target...]
  const match = text.match(/^\/mute(?:\s+(\d+))?(?:\s+(.+))?$/i);
  
  let durationMinutes = match && match[1] ? parseInt(match[1], 10) : 0;
  let targetStr = match && match[2] ? match[2].trim() : "";

  const target = await resolveTargetUser(ctx, targetStr);

  if (!target || durationMinutes <= 0) {
    await replyAdminPrivate(
      ctx,
      `❌ <b>Invalid Mute Command Format</b>\n\n` +
      `<b>Usage Examples:</b>\n` +
      `1️⃣ <code>/mute 60 @username</code> (Mute target user for 60 minutes)\n` +
      `2️⃣ <code>/mute 60 &lt;Name or UID&gt;</code>\n` +
      `3️⃣ Reply to a user's message with <code>/mute 60</code>\n\n` +
      `<i>Note: Multiple spaces between parameters are supported.</i>`
    );
    return;
  }

  try {
    // Check if target user is currently in the group
    let member: any = null;
    try {
      member = await ctx.api.getChatMember(chat.id, target.userId);
    } catch (e: any) {
      console.warn(`[Bot Mute] Could not fetch chat member ${target.userId}:`, e.message);
    }

    if (member && (member.status === "left" || member.status === "kicked")) {
      await replyAdminPrivate(
        ctx,
        `⚠️ <b>User Not in Group</b>\n\n` +
        `👤 <b>Target</b>: <b>${escapeHtml(target.displayName)}</b> (<code>${target.userId}</code>)\n` +
        `ℹ️ <b>Status</b>: <code>${member.status}</code> (User has left or is already banned from this group)`
      );
      return;
    }

    // SA Admin & Group Admin immunity check
    const settings = await db.getSettings();
    const saAdminIds = (settings.sa_admin_tg_ids && settings.sa_admin_tg_ids.length > 0)
      ? settings.sa_admin_tg_ids
      : SA_ADMIN_TG_IDS;
    if (saAdminIds.includes(target.userId) || (member && (member.status === "administrator" || member.status === "creator"))) {
      await replyAdminPrivate(
        ctx,
        `❌ <b>Operation Denied</b>: Target <b>${escapeHtml(target.displayName)}</b> is an Administrator / SA Admin and cannot be muted.`
      );
      return;
    }

    const untilTimestamp = Math.floor(Date.now() / 1000) + durationMinutes * 60;
    await ctx.api.restrictChatMember(chat.id, target.userId, {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    }, { until_date: untilTimestamp });

    const opName = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Admin');
    const groupTitle = chat.title || `Group ${chat.id}`;

    // Record into admin_logs for Recent Actions
    try {
      const eventId = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
      const nowSec = Math.floor(Date.now() / 1000);
      await db.saveAdminLog(
        eventId,
        chat.id,
        ctx.from?.id || 0,
        "Mute",
        nowSec,
        JSON.stringify({ targetUserId: target.userId, durationMinutes, group: groupTitle }),
        opName,
        `${target.displayName} (ID: ${target.userId})`,
        "",
        `Muted for ${durationMinutes} minute(s)`
      );
    } catch (logErr) {
      console.error("[Bot] Failed to save admin log for mute:", logErr);
    }

    await replyAdminPrivate(
      ctx,
      `🔇 <b>User Muted Successfully</b>\n\n` +
      `👤 <b>Target</b>: <b>${escapeHtml(target.displayName)}</b> (<code>${target.userId}</code>)\n` +
      `⏱️ <b>Duration</b>: <b>${durationMinutes} minute(s)</b>\n` +
      `🏛️ <b>Group</b>: <b>${escapeHtml(groupTitle)}</b>\n` +
      `👮 <b>Moderator</b>: <b>${escapeHtml(opName)}</b>`
    );
  } catch (err: any) {
    console.error(`Failed to mute user ${target.userId}:`, err);
    await replyAdminPrivate(
      ctx,
      `❌ <b>Mute Failed</b>: ${escapeHtml(err.message || "Bot lacks administrator permissions to restrict members.")}`
    );
  }
}

async function handleUnmuteCommand(ctx: Context) {
  if (!ctx.chat || ctx.chat.type === "private") {
    await ctx.reply("❌ This command can only be used in Telegram groups.");
    return;
  }
  const chat = ctx.chat;

  const isAdmin = await isGroupAdmin(ctx);
  if (!isAdmin) {
    await replyAdminPrivate(ctx, "❌ <b>Access Denied</b>: Only group administrators can perform this moderation command.");
    return;
  }

  const text = ctx.message?.text || "";
  // Flexible regex matching: /unmute [spaces] [target...]
  const match = text.match(/^\/unmute(?:\s+(.+))?$/i);
  let targetStr = match && match[1] ? match[1].trim() : "";

  const target = await resolveTargetUser(ctx, targetStr);

  if (!target) {
    await replyAdminPrivate(
      ctx,
      `❌ <b>Invalid Unmute Command Format</b>\n\n` +
      `<b>Usage Examples:</b>\n` +
      `1️⃣ <code>/unmute @username</code> (Restore chat permissions)\n` +
      `2️⃣ <code>/unmute &lt;Name or UID&gt;</code>\n` +
      `3️⃣ Reply to a user's message with <code>/unmute</code>\n\n` +
      `<i>Note: Multiple spaces between parameters are supported.</i>`
    );
    return;
  }

  try {
    // Attempt 1: Use the proven captcha-unrestrict pattern (without can_manage_topics)
    await ctx.api.restrictChatMember(chat.id, target.userId, {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_invite_users: true,
    });

    // Verify the restriction was actually lifted
    let verifyStatus = "";
    try {
      const member = await ctx.api.getChatMember(chat.id, target.userId);
      verifyStatus = member.status;
      console.log(`[Bot Unmute] Post-unmute verification: user ${target.userId} status = "${member.status}"`, JSON.stringify(member));

      // If user is still "restricted", try once more without can_manage_topics
      if (member.status === "restricted") {
        console.log(`[Bot Unmute] User still restricted after first attempt, retrying without can_manage_topics...`);
        await ctx.api.restrictChatMember(chat.id, target.userId, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_invite_users: true,
        });

        // Re-verify
        const member2 = await ctx.api.getChatMember(chat.id, target.userId);
        verifyStatus = member2.status;
        console.log(`[Bot Unmute] Post-retry verification: user ${target.userId} status = "${member2.status}"`, JSON.stringify(member2));
      }
    } catch (verifyErr) {
      console.warn(`[Bot Unmute] Could not verify member status:`, verifyErr);
    }

    const opName = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Admin');
    const groupTitle = chat.title || `Group ${chat.id}`;

    // Record into admin_logs for Recent Actions
    try {
      const eventId = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
      const nowSec = Math.floor(Date.now() / 1000);
      await db.saveAdminLog(
        eventId,
        chat.id,
        ctx.from?.id || 0,
        "Unmute",
        nowSec,
        JSON.stringify({ targetUserId: target.userId, group: groupTitle }),
        opName,
        `${target.displayName} (ID: ${target.userId})`,
        "",
        "Unmuted by admin"
      );
    } catch (logErr) {
      console.error("[Bot] Failed to save admin log for unmute:", logErr);
    }

    const statusNote = verifyStatus === "restricted"
      ? `\n\n⚠️ <i>Warning: User status is still "restricted". The user may have been restricted by a higher-privilege admin or group owner. Bot cannot override owner-level restrictions.</i>`
      : verifyStatus === "member"
        ? `\n\nℹ️ <i>Verified: User status is now "member" — all restrictions lifted.</i>`
        : "";

    await replyAdminPrivate(
      ctx,
      `🔊 <b>User Unmuted Successfully</b>\n\n` +
      `👤 <b>Target</b>: <b>${escapeHtml(target.displayName)}</b> (<code>${target.userId}</code>)\n` +
      `🏛️ <b>Group</b>: <b>${escapeHtml(groupTitle)}</b>\n` +
      `👮 <b>Moderator</b>: <b>${escapeHtml(opName)}</b>${statusNote}`
    );
  } catch (err: any) {
    console.error(`Failed to unmute user ${target.userId}:`, err);
    await replyAdminPrivate(
      ctx,
      `❌ <b>Unmute Failed</b>: ${escapeHtml(err.message || "Bot lacks administrator permissions to modify member restrictions.")}`
    );
  }
}

async function handleBanCommand(ctx: Context) {
  if (!ctx.chat || ctx.chat.type === "private") {
    await ctx.reply("❌ This command can only be used in Telegram groups.");
    return;
  }
  const chat = ctx.chat;

  const isAdmin = await isGroupAdmin(ctx);
  if (!isAdmin) {
    await replyAdminPrivate(ctx, "❌ <b>Access Denied</b>: Only group administrators can perform this moderation command.");
    return;
  }

  const text = ctx.message?.text || "";
  // Flexible regex matching: /ban [spaces] [target...]
  const match = text.match(/^\/ban(?:\s+(.+))?$/i);
  let targetStr = match && match[1] ? match[1].trim() : "";

  const target = await resolveTargetUser(ctx, targetStr);

  if (!target) {
    await replyAdminPrivate(
      ctx,
      `❌ <b>Invalid Ban Command Format</b>\n\n` +
      `<b>Usage Examples:</b>\n` +
      `1️⃣ <code>/ban @username</code> (Ban and kick target user)\n` +
      `2️⃣ <code>/ban &lt;Name or UID&gt;</code>\n` +
      `3️⃣ Reply to a user's message with <code>/ban</code>\n\n` +
      `<i>Note: Multiple spaces between parameters are supported.</i>`
    );
    return;
  }

  try {
    // SA Admin & Group Admin immunity check
    const settings = await db.getSettings();
    const saAdminIds = (settings.sa_admin_tg_ids && settings.sa_admin_tg_ids.length > 0)
      ? settings.sa_admin_tg_ids
      : SA_ADMIN_TG_IDS;
    if (saAdminIds.includes(target.userId)) {
      await replyAdminPrivate(
        ctx,
        `❌ <b>Operation Denied</b>: Target <b>${escapeHtml(target.displayName)}</b> is a Super Administrator and cannot be banned.`
      );
      return;
    }
    try {
      const member = await ctx.api.getChatMember(chat.id, target.userId);
      if (member && (member.status === "administrator" || member.status === "creator")) {
        await replyAdminPrivate(
          ctx,
          `❌ <b>Operation Denied</b>: Target <b>${escapeHtml(target.displayName)}</b> is a Group Administrator and cannot be banned.`
        );
        return;
      }
    } catch {}

    await ctx.api.banChatMember(chat.id, target.userId);

    const opName = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Admin');
    const groupTitle = chat.title || `Group ${chat.id}`;

    // Record into admin_logs for Recent Actions
    try {
      const eventId = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
      const nowSec = Math.floor(Date.now() / 1000);
      await db.saveAdminLog(
        eventId,
        chat.id,
        ctx.from?.id || 0,
        "Ban",
        nowSec,
        JSON.stringify({ targetUserId: target.userId, group: groupTitle }),
        opName,
        `${target.displayName} (ID: ${target.userId})`,
        "",
        "Banned & kicked by admin"
      );
    } catch (logErr) {
      console.error("[Bot] Failed to save admin log for ban:", logErr);
    }

    await replyAdminPrivate(
      ctx,
      `🚫 <b>User Banned & Kicked Successfully</b>\n\n` +
      `👤 <b>Target</b>: <b>${escapeHtml(target.displayName)}</b> (<code>${target.userId}</code>)\n` +
      `🏛️ <b>Group</b>: <b>${escapeHtml(groupTitle)}</b>\n` +
      `👮 <b>Moderator</b>: <b>${escapeHtml(opName)}</b>`
    );
  } catch (err: any) {
    console.error(`Failed to ban user ${target.userId}:`, err);
    await replyAdminPrivate(
      ctx,
      `❌ <b>Ban Failed</b>: ${escapeHtml(err.message || "Bot lacks administrator permissions to ban members.")}`
    );
  }
}

async function handleUnbanCommand(ctx: Context) {
  if (!ctx.chat || ctx.chat.type === "private") {
    await ctx.reply("❌ This command can only be used in Telegram groups.");
    return;
  }
  const chat = ctx.chat;

  const isAdmin = await isGroupAdmin(ctx);
  if (!isAdmin) {
    await replyAdminPrivate(ctx, "❌ <b>Access Denied</b>: Only group administrators can perform this moderation command.");
    return;
  }

  const text = ctx.message?.text || "";
  // Flexible regex matching: /unban [spaces] [target...]
  const match = text.match(/^\/unban(?:\s+(.+))?$/i);
  let targetStr = match && match[1] ? match[1].trim() : "";

  const target = await resolveTargetUser(ctx, targetStr);

  if (!target) {
    await replyAdminPrivate(
      ctx,
      `❌ <b>Invalid Unban Command Format</b>\n\n` +
      `<b>Usage Examples:</b>\n` +
      `1️⃣ <code>/unban @username</code> (Unban user from group blacklist)\n` +
      `2️⃣ <code>/unban &lt;Name or UID&gt;</code>\n` +
      `3️⃣ Reply to a user's message with <code>/unban</code>\n\n` +
      `<i>Note: Multiple spaces between parameters are supported.</i>`
    );
    return;
  }

  try {
    await ctx.api.unbanChatMember(chat.id, target.userId, { only_if_banned: true });
    try {
      await db.unbanUser(chat.id, target.userId);
    } catch {}

    const opName = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Admin');
    const groupTitle = chat.title || `Group ${chat.id}`;

    // Record into admin_logs for Recent Actions
    try {
      const eventId = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
      const nowSec = Math.floor(Date.now() / 1000);
      await db.saveAdminLog(
        eventId,
        chat.id,
        ctx.from?.id || 0,
        "Unban",
        nowSec,
        JSON.stringify({ targetUserId: target.userId, group: groupTitle }),
        opName,
        `${target.displayName} (ID: ${target.userId})`,
        "",
        "Unbanned by admin"
      );
    } catch (logErr) {
      console.error("[Bot] Failed to save admin log for unban:", logErr);
    }

    await replyAdminPrivate(
      ctx,
      `✅ <b>User Unbanned Successfully</b>\n\n` +
      `👤 <b>Target</b>: <b>${escapeHtml(target.displayName)}</b> (<code>${target.userId}</code>)\n` +
      `🏛️ <b>Group</b>: <b>${escapeHtml(groupTitle)}</b>\n` +
      `👮 <b>Moderator</b>: <b>${escapeHtml(opName)}</b>\n` +
      `ℹ️ <i>The user has been removed from the blacklist and can now rejoin the group via invite link.</i>`
    );
  } catch (err: any) {
    console.error(`Failed to unban user ${target.userId}:`, err);
    await replyAdminPrivate(
      ctx,
      `❌ <b>Unban Failed</b>: ${escapeHtml(err.message || "Bot lacks administrator permissions to unban members.")}`
    );
  }
}


// Timeout helper for promise execution
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(defaultValue);
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((result) => {
      clearTimeout(timeoutId);
      return result;
    }),
    timeoutPromise
  ]);
}

// Resolve Telegram username to User ID using dual mechanism
async function resolveTgUsername(username: string): Promise<number | null> {
  const monitor = getActiveMonitor();
  const client = monitor ? (monitor as any).client : null;
  if (client) {
    try {
      const isAuthorized = await client.checkAuthorization();
      if (isAuthorized) {
        const entity = await client.getEntity(username);
        if (entity && entity.id) {
          const idNum = parseInt(entity.id.toString(), 10);
          if (!isNaN(idNum)) {
            return idNum;
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Bot Resolve] MTProto failed to resolve username @${username}:`, err.message || err);
    }
  }
  return null;
}

async function resolveTgUsernameDual(ctx: Context, username: string): Promise<number | null> {
  // Use timeout for MTProto resolve to prevent hanging
  const mtprotoId = await withTimeout<number | null>(resolveTgUsername(username), 4000, null);
  if (mtprotoId) return mtprotoId;

  try {
    // Use timeout for Bot API getChat to prevent hanging
    const chat = await withTimeout<any>(ctx.api.getChat("@" + username), 4000, null);
    if (chat && chat.id) {
      return chat.id;
    }
  } catch (err: any) {
    console.warn(`[Bot Resolve] Bot API failed to resolve username @${username}:`, err.message || err);
  }
  return null;
}

async function handleLoginRequest(ctx: Context, token: string) {
  const session = activeSessions.get(token);
  if (!session) {
    await ctx.reply("❌ Invalid or expired login request. Please refresh the web login page and try again.");
    return;
  }
  if (session.authorized) {
    await ctx.reply("✅ This session is already authorized.");
    return;
  }

  const settings = await db.getSettings();
  const adminIds = settings.sa_admin_tg_ids || SA_ADMIN_TG_IDS;
  const userId = ctx.from?.id;

  if (!userId || !adminIds.includes(userId)) {
    await ctx.reply("❌ Access Denied: You are not authorized as an administrator.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("Confirm Login ✅", `login_yes_${session.code}`)
    .text("Reject ❌", `login_no_${session.code}`);

  await ctx.reply(`🤖 <b>Admin Console Login Request</b>\n\nDo you want to authorize this web login session?\nIP Address: <code>${escapeHtml(session.ip || "Unknown")}</code>\n\n⚠️ <b>Only confirm if YOU just initiated this login on your own device.</b> Never confirm a login link or code sent to you by someone else.`, {
    reply_markup: keyboard,
    parse_mode: "HTML"
  });
}

// Unified dynamic command middleware — handles ALL commands including rank, leaderboard, etc.
bot.on("message:text", async (ctx, next) => {
  const text = ctx.message.text || "";
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!text.startsWith("/")) {
    // Check if this is a private chat and the text is a 6-digit code
    if (ctx.chat?.type === "private") {
      const trimmed = text.trim();
      if (/^\d{6}$/.test(trimmed)) {
        const token = codeSessions.get(trimmed);
        if (token) {
          await handleLoginRequest(ctx, token);
          return;
        }
      }
    }

    // Not a command — let it fall through to XP listener
    await next();
    return;
  }

  const parts = text.split(/\s+/);
  const cmd = parts[0].substring(1).toLowerCase().replace(/@.+$/, ""); // Strip bot username

  if (cmd === "start") {
    const arg = parts.slice(1).join(" ").trim();
    if (arg) {
      if (arg.startsWith("session_")) {
        await handleLoginRequest(ctx, arg);
        return;
      }
      // Also allow entering 6-digit code as a start parameter (e.g. t.me/bot?start=123456)
      if (/^\d{6}$/.test(arg)) {
        const token = codeSessions.get(arg);
        if (token) {
          await handleLoginRequest(ctx, token);
          return;
        }
      }
    }
  }

  if (cmd === "captcha") {
    let isAuthorized = false;
    if (ctx.chat?.type === "private") {
      const settings = await db.getSettings();
      const adminIds = settings.sa_admin_tg_ids || SA_ADMIN_TG_IDS;
      isAuthorized = !!userId && adminIds.includes(userId);
    } else {
      isAuthorized = await isGroupAdmin(ctx);
    }

    if (!isAuthorized) {
      await ctx.reply("❌ This command is only available to authorized group/bot administrators.");
      return;
    }

    const arg = parts[1]?.toLowerCase();
    const settings = await db.getSettings();

    if (!arg) {
      const typeText = {
        math: "Math Arithmetic Challenge",
        text: "6-Character CAPTCHA",
        click: "1-Click Interactive Verification",
        random: "Random Hybrid Mode",
      }[settings.captcha_type || "math"] || "Math Arithmetic Challenge";

      await ctx.reply(
        `🛡️ <b>Join CAPTCHA Current Settings</b>\n\n` +
        `• Verification: <b>${settings.captcha_enabled ? "✅ Enabled" : "❌ Disabled"}</b>\n` +
        `• Mode: <b>${typeText}</b>\n` +
        `• Timeout: <b>${settings.captcha_timeout_seconds || 180}s</b>\n` +
        `• Action on Timeout: <b>${settings.captcha_failed_action === "ban" ? "Permanent Ban" : "Kick from Group"}</b>\n\n` +
        `<b>Commands:</b>\n` +
        `• Toggle: <code>/captcha on</code> | <code>/captcha off</code>\n` +
        `• Switch Mode: <code>/captcha math</code> | <code>/captcha text</code> | <code>/captcha click</code> | <code>/captcha random</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    if (arg === "on") {
      await db.saveSettings({ ...settings, captcha_enabled: true });
      await ctx.reply("✅ Join CAPTCHA verification enabled!");
    } else if (arg === "off") {
      await db.saveSettings({ ...settings, captcha_enabled: false });
      await ctx.reply("❌ Join CAPTCHA verification disabled.");
    } else if (["math", "text", "click", "random"].includes(arg)) {
      await db.saveSettings({ ...settings, captcha_type: arg as any });
      const names: Record<string, string> = {
        math: "Math Arithmetic Challenge",
        text: "6-Character CAPTCHA",
        click: "1-Click Interactive Verification",
        random: "Random Hybrid Mode (Math / Text / Click)",
      };
      await ctx.reply(`✅ Join CAPTCHA mode switched to: <b>${names[arg]}</b>`, { parse_mode: "HTML" });
    } else {
      await ctx.reply("❌ Invalid parameters. Usage: /captcha [on|off|math|text|click|random]");
    }
    return;
  }

  if (cmd === "login") {

    const arg = parts.slice(1).join(" ").trim();
    if (/^\d{6}$/.test(arg)) {
      const token = codeSessions.get(arg);
      if (token) {
        await handleLoginRequest(ctx, token);
        return;
      }
    }
  }

  if (cmd === "mute") {
    await handleMuteCommand(ctx);
    return;
  }

  if (cmd === "unmute") {
    await handleUnmuteCommand(ctx);
    return;
  }

  if (cmd === "ban") {
    await handleBanCommand(ctx);
    return;
  }

  if (cmd === "unban") {
    await handleUnbanCommand(ctx);
    return;
  }


  // Try to find this command in the database
  const customCmd = await db.getCustomCommand(cmd);
  if (!customCmd) {
    // Unknown command — ignore
    return;
  }

  const settings = await db.getSettings();
  const { allowed, community, wrongGroup } = checkAccess(ctx, settings);

  if (!allowed) {
    if (wrongGroup) {
      return; // Silent ignore for unregistered groups
    }
    // Wrong topic in correct group — show dynamic community-aware warning
    const rawTpl = settings.wrong_topic_warning || "❌ Restricted command. Please use Topic {topic_id} in {group}: {topic_link}";
    const warningText = renderCommunityTopicTemplate(rawTpl, ctx, community, community?.command_topic_ids?.[0], settings);
    try {
      await ctx.reply(warningText, {
        message_thread_id: ctx.message?.message_thread_id
      });
    } catch {
      try {
        await ctx.reply(warningText);
      } catch {}
    }
    return;
  }

  // Execute the command based on its action_type
  await executeCommand(ctx, customCmd, settings);
});

// -------------------------------------------------------
// BOT EVENT LISTENERS
// -------------------------------------------------------

// Throttle state for last_active_chat_id / last_active_thread_id writes (avoid per-message SQLite I/O)
let _lastActiveChatId: number | null = null;
let _lastActiveWriteTime = 0;
let _lastActiveThreadId: number | null = null;
let _lastActiveThreadWriteTime = 0;

// Message listener (for message sent XP, including text, stickers, photos, videos, voice, document, etc.)
bot.on([
  "message:text",
  "message:photo",
  "message:sticker",
  "message:video",
  "message:animation",
  "message:audio",
  "message:voice",
  "message:document",
  "message:poll"
], async (ctx) => {
  const text = ctx.message.text || ctx.message.caption || "";

  // Ignore commands starting with '/'
  if (text.startsWith("/")) return;

  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) return;

  // Only process group messages
  if (ctx.chat.type !== "supergroup" && ctx.chat.type !== "group") return;

  const settings = await db.getSettings();

  // Check multi-community access
  const community = findCommunityTarget(chatId, settings.allowed_communities);
  if (!community) return; // Not in allowed communities

  // Check topic restriction for XP collection
  const threadId = ctx.message.message_thread_id || null;
  if (!isDataTopicAllowed(threadId, community)) return;

  // Track and save active group chat ID for weekly cron broadcasts (throttled to avoid excessive I/O)
  if (_lastActiveChatId !== chatId || Date.now() - _lastActiveWriteTime > 60000) {
    _lastActiveChatId = chatId;
    _lastActiveWriteTime = Date.now();
    await db.updateSettings({ last_active_chat_id: chatId });
  }
  if (threadId && (_lastActiveThreadId !== threadId || Date.now() - _lastActiveThreadWriteTime > 60000)) {
    _lastActiveThreadId = threadId;
    _lastActiveThreadWriteTime = Date.now();
    await db.updateSettings({ last_active_thread_id: threadId });
  }

  // Award XP for message
  const cooldownAllowed = await db.checkCooldown(chatId, userId, "msg_sent", settings.cooldown_message_sent);
  if (cooldownAllowed) {
    await db.addXp(chatId, userId, settings.xp_message_sent, {
      username: ctx.from.username || null,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name || null,
    });
  }

  // Record message author to database for reaction author lookup
  await db.recordMessage(ctx.message.message_id, chatId, userId);
});

// Message Reaction listener (for reaction added & peer recognition XP)
bot.on("message_reaction", async (ctx) => {
  const reactionUpdate = ctx.messageReaction;
  const reactorId = reactionUpdate.user?.id;
  const chatId = reactionUpdate.chat.id;
  const messageId = reactionUpdate.message_id;

  if (!reactorId) return;

  const settings = await db.getSettings();

  // Check multi-community access
  const community = findCommunityTarget(chatId, settings.allowed_communities);
  if (!community) return;

  // Compare old and new reactions to find added emojis
  const oldEmojis = (reactionUpdate.old_reaction || [])
    .filter((r) => r.type === "emoji")
    .map((r: any) => r.emoji);
  const newEmojis = (reactionUpdate.new_reaction || [])
    .filter((r) => r.type === "emoji")
    .map((r: any) => r.emoji);

  const addedEmojis = newEmojis.filter((e) => !oldEmojis.includes(e));

  if (addedEmojis.length === 0) return;

  const authorId = await db.getMessageAuthor(messageId, chatId);

  // Self-reaction check: cannot gain XP by reacting to own messages
  if (authorId && authorId === reactorId) {
    return;
  }

  // 1. Award XP to Reactor (Reaction Added rule)
  const canReactorGetXp = await db.checkCooldown(chatId, reactorId, "react_added", settings.cooldown_reaction_added);
  if (canReactorGetXp) {
    const reactorName = reactionUpdate.user?.first_name || "User";
    const reactorLast = reactionUpdate.user?.last_name || null;
    const reactorUser = reactionUpdate.user?.username || null;
    await db.addXp(chatId, reactorId, settings.xp_reaction_added, {
      username: reactorUser,
      firstName: reactorName,
      lastName: reactorLast,
    });
  }

  // 2. Award XP to Message Author (Peer Recognition rule)
  if (authorId) {
    const recognitionEmojis = ["❤️", "👍", "🔥", "😘", "🥰"];
    const matchEmojis = addedEmojis.filter((e) => recognitionEmojis.includes(e));

    for (const emoji of matchEmojis) {
      const actionKey = `peer_${emoji}_to_${authorId}`;
      const canReactorGive = await db.checkCooldown(chatId, reactorId, actionKey, settings.cooldown_peer_recognition);
      const canAuthorReceive = await db.checkCooldown(chatId, authorId, "peer_received", Math.min(settings.cooldown_peer_recognition, 15));

      if (canReactorGive && canAuthorReceive) {
        const authorObj = await db.getUser(chatId, authorId);
        if (authorObj) {
          await db.addXp(chatId, authorId, settings.xp_peer_recognition, {
            username: authorObj.username,
            firstName: authorObj.first_name,
            lastName: authorObj.last_name,
          });
        }
      }
    }
  }
});

// Chat Member status change listener (detecting Admin Bans and manual unbans)
bot.on("chat_member", async (ctx) => {
  const chatMember = ctx.chatMember;
  const chatId = chatMember.chat.id;
  const userId = chatMember.new_chat_member.user.id;
  const oldStatus = chatMember.old_chat_member.status as string;
  const newStatus = chatMember.new_chat_member.status as string;

  // Verify access check to only record in allowed communities
  const settings = await db.getSettings();
  const community = findCommunityTarget(chatId, settings.allowed_communities);
  if (!community) return;

  const targetUser = chatMember.new_chat_member.user;
  const username = targetUser.username || null;
  const firstName = targetUser.first_name || "User";
  const lastName = targetUser.last_name || null;

  if (newStatus === "kicked") {
    // User was banned/kicked from the group
    const adminUser = chatMember.from; // The administrator who banned them
    const adminId = adminUser ? adminUser.id : null;
    const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name || ""}`.trim() : "System";
    const adminUsername = adminUser && adminUser.username ? `@${adminUser.username}` : "";
    const finalAdminName = adminUsername ? `${adminName} (${adminUsername})` : adminName;

    await db.banUser(chatId, userId, username, firstName, lastName, adminId, finalAdminName);
    console.log(`[Security] User ${userId} (${firstName}) was banned in chat ${chatId} by admin ${finalAdminName}`);
  } else if (oldStatus === "kicked" && newStatus !== "kicked") {
    // User was unbanned
    await db.unbanUser(chatId, userId);
    console.log(`[Security] User ${userId} (${firstName}) was unbanned in chat ${chatId}`);
  }
});

// Callback query listener for Telegram login confirmation
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data || "";
  const userId = ctx.from?.id;

  // DrawBot Giveaway Callback Hook
  if (data.startsWith("join_") || data === "ended_notice" || data.startsWith("ended_notice")) {
    try {
      await handleDrawCallbackQuery(ctx);
    } catch (e) {
      console.warn("[Bot] Draw callback query error:", e);
    }
    return;
  }

  if (data.startsWith("login_yes_") || data.startsWith("login_no_")) {
    const isYes = data.startsWith("login_yes_");
    const payload = data.replace(isYes ? "login_yes_" : "login_no_", "");
    const token = payload.startsWith("session_") ? payload : (codeSessions.get(payload) || "");
    
    const settings = await db.getSettings();
    const adminIds = settings.sa_admin_tg_ids || SA_ADMIN_TG_IDS;
    
    if (!userId || !adminIds.includes(userId)) {
      await ctx.answerCallbackQuery({ text: "❌ Unauthorized access", show_alert: true });
      return;
    }

    const session = activeSessions.get(token);
    if (!session) {
      await ctx.answerCallbackQuery({ text: "❌ Session expired or invalid", show_alert: true });
      await ctx.editMessageText("❌ This login request has expired or is invalid.");
      return;
    }

    if (isYes) {
      session.authorized = true;
      session.expiresAt = Date.now() + 12 * 60 * 60 * 1000; // Authorize for 12 hours
      codeSessions.delete(session.code);
      await ctx.answerCallbackQuery({ text: "✅ Login authorized!" });
      await ctx.editMessageText(`✅ <b>Web login authorized successfully!</b>\nIP Address: <code>${escapeHtml(session.ip || "Unknown")}</code>`, { parse_mode: "HTML" });
    } else {
      codeSessions.delete(session.code);
      activeSessions.delete(token);
      await ctx.answerCallbackQuery({ text: "❌ Login request rejected." });
      await ctx.editMessageText("❌ <b>Web login request was rejected.</b>", { parse_mode: "HTML" });
    }
  }
});

// -------------------------------------------------------
// WEEKLY RESET & CRON JOB
// -------------------------------------------------------

async function triggerWeeklyReset() {
  try {
    const settings = await db.getSettings();
    const historyLimit = settings.history_periods_limit !== undefined ? settings.history_periods_limit : 5;

    // Get current UTC date (YYYY-MM-DD)
    const periodDate = new Date().toISOString().split("T")[0];

    console.log(`[Scheduler] Archiving weekly leaderboard for period ending ${periodDate}...`);
    await db.archiveWeeklyLeaderboard(periodDate, historyLimit);

    // Reset weekly XP in DB
    await db.resetWeeklyXp();

    // Prune message log older than 7 days
    await db.pruneOldMessages(7);

    console.log("[Scheduler] Weekly XP Reset and archiving completed successfully.");
  } catch (err) {
    console.error("[Scheduler] Weekly XP Reset error:", err);
  }
}

// Setup Scheduler Job based on DB setting (Sunday 23:59 default)
async function initScheduler() {
  const settings = await db.getSettings();
  const cronExpr = settings.weekly_reset_cron || "59 23 * * 0";

  cron.schedule(cronExpr, async () => {
    console.log("[Scheduler] Running automatic weekly reset...");
    await triggerWeeklyReset();
  }, {
    timezone: "UTC"
  });
}

// -------------------------------------------------------
// BOT INITIALIZATION & RUN
// -------------------------------------------------------

async function main() {
  // 1. Initialize SQLite Database
  await db.initDb();
  console.log("[Database] SQLite initialized successfully.");

  // 2. Start Web Server
  startServer();

  // 3. Start Scheduler
  await initScheduler();

  // 4. Start Telegram Bot — register command menu dynamically from DB
  try {
    const cmds = await db.getAllCustomCommands();
    const menuCommands: { command: string; description: string }[] = [];
    for (const cmd of cmds) {
      if (cmd.action_type === "rank") {
        menuCommands.push({ command: cmd.trigger_name, description: "Show your rank card and level" });
      } else if (cmd.action_type === "leaderboard") {
        menuCommands.push({ command: cmd.trigger_name, description: "View the community leaderboard" });
      } else if (cmd.trigger_name === "rules" || cmd.action_type === "text") {
        if (cmd.trigger_name !== "start") {
          menuCommands.push({ command: cmd.trigger_name, description: `Show ${cmd.trigger_name} info` });
        }
      }
    }
    if (menuCommands.length > 0) {
      await bot.api.setMyCommands(menuCommands);
      console.log("[Bot] Command menu registered with Telegram.");
    }

    // Reset the chat menu button to default to clean up any leftover WebApp buttons from old services
    try {
      await bot.api.setChatMenuButton({ menu_button: { type: "default" } });
      console.log("[Bot] Chat menu button reset to default.");
    } catch (err) {
      console.warn("[Bot] Failed to reset chat menu button:", err);
    }
  } catch (err) {
    console.error("[Bot] Failed to set commands menu:", err);
  }

  // 5. Start Userbot Monitor (Recent Actions Log Reader) if configured
  if (TELEGRAM_API_ID && TELEGRAM_API_HASH && TELEGRAM_USER_SESSION) {
    if (MONITOR_CHAT_IDS.length > 0) {
      const userbot = new UserbotMonitor(
        TELEGRAM_API_ID,
        TELEGRAM_API_HASH,
        TELEGRAM_USER_SESSION,
        MONITOR_CHAT_IDS,
        USERBOT_POLL_INTERVAL_MS
      );
      userbot.start().catch((err) => {
        console.error("[Userbot] Failed to start Userbot background monitor:", err);
      });
    } else {
      console.warn("[Userbot Warning] Userbot config is set, but MONITOR_CHAT_IDS is empty. No chats will be monitored.");
    }
  } else {
    console.log("[Userbot Info] Userbot config is incomplete in .env. Recent Actions persistent logger will not start.");
  }

  bot.start({
    allowed_updates: ["message", "message_reaction", "chat_member", "callback_query"],
  }).catch((err) => {
    console.warn("[Bot Warning] Polling stopped / conflict:", err.message);
  });
  console.log("[Bot] Telegram Bot listener started successfully.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Critical error on startup:", err);
  });
}

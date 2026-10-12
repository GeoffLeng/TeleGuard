import dotenv from "dotenv";
import path from "path";
import { BotSettings } from "./types";

// Load environment variables
dotenv.config();

export const BOT_TOKEN = process.env.BOT_TOKEN || "";
export const PORT = parseInt(process.env.PORT || "3000", 10);
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
if (ADMIN_PASSWORD === "admin123") {
  console.warn("🚨 [Security Warning] Admin password is set to the default value 'admin123'. Please set ADMIN_PASSWORD in your .env file for production use.");
}
export const WEBAPP_URL = (process.env.WEBAPP_URL || "http://localhost:3000/leaderboard").trim();
export const TELEGRAM_APP_URL = (process.env.TELEGRAM_APP_URL || "").trim();
export const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), "teleguard.db");

// Userbot Configuration for MTProto Recent Actions
export const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
export const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || "";
export const TELEGRAM_USER_SESSION = process.env.TELEGRAM_USER_SESSION || "";
export const MONITOR_CHAT_IDS = (process.env.MONITOR_CHAT_IDS || "")
  .split(",")
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));
export const USERBOT_POLL_INTERVAL_MS = parseInt(process.env.USERBOT_POLL_INTERVAL_MS || "3600000", 10);

// Super Admins allowed Telegram 2FA Login and Anti-Spam Exemption
export const SA_ADMIN_TG_IDS = (process.env.SA_ADMIN_TG_IDS || "")
  .split(",")
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));

// Default settings populated in SQLite on boot
export const DEFAULT_SETTINGS: BotSettings = {
  xp_message_sent: 10,
  cooldown_message_sent: 5, // in seconds
  xp_reaction_added: 5,
  cooldown_reaction_added: 60, // in seconds
  xp_peer_recognition: 5,
  cooldown_peer_recognition: 5, // in seconds
  allowed_communities: [], // empty = no restriction, bot responds everywhere
  wrong_topic_warning: "❌ Restricted command. Please use Topic {topic_id} in {group}: {topic_link}",
  card_bg_color: "#512DA8",
  card_bg_image: "",
  card_text_color: "#FFFFFF",
  card_progress_color: "#FFC107",
  card_font_size_level: 70,
  card_font_size_rank: 70,
  card_font_size_name: 28,
  admin_password: ADMIN_PASSWORD,
  weekly_reset_cron: "59 23 * * 0", // Every Sunday at 23:59
  community_name: "TeleGuard Community",
  default_avatar: "",
  history_periods_limit: 5,
  // Safety & Anti-Spam Default Settings
  link_intercept_enabled: true,
  whitelist_domains: [
    "t.me",
    "telegram.org",
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
  ],
  rtlo_auto_ban: true,
  rtlo_action: "ban",
  rtlo_mute_duration: 60,
  new_user_link_auto_ban: true,
  new_user_link_action: "ban",
  new_user_link_mute_duration: 60,
  keyword_auto_ban: true,
  keyword_action: "ban",
  keyword_mute_duration: 60,
  spam_keywords: ["包赢", "导师", "兼职", "空投", "airdrop", "加群", "彩票", "赌博", "投注"],
  flood_threshold_messages: 5,
  flood_threshold_seconds: 3,
  flood_mute_duration: 60,
  cas_api_enabled: true,
  cas_action: "ban",
  cas_mute_duration: 60,
  block_inline_bots: true,
  block_inline_bots_action: "delete_only",
  block_inline_bots_mute_duration: 60,
  allowed_inline_bots: ["gif", "vote", "like", "poll", "pic"],
  block_inline_keyboards: true,
  block_inline_keyboards_action: "ban",
  block_inline_keyboards_mute_duration: 60,
  emoji_auto_ban: false,
  emoji_threshold: 10,
  emoji_action: "ban",
  emoji_mute_duration: 60,
  ignored_spam_topic_ids: [],
  // Member Welcome Defaults
  welcome_enabled: false,
  welcome_message: "🎉 Welcome {mention} to {group}! Glad to have you here.",
  welcome_delete_delay_mins: 0,
  // Captcha Defaults
  captcha_communities: [],
  captcha_enabled: false,
  captcha_type: "math",
  captcha_timeout_seconds: 180,
  captcha_failed_action: "kick",
  captcha_delete_messages: true,
  captcha_welcome_msg_math: "🛡️ Welcome {mention} to {group}!\nPlease select the correct formula answer within {timeout}s:",
  captcha_welcome_msg_text: "🛡️ Welcome {mention} to {group}!\nPlease select the correct 6-character captcha option within {timeout}s:",
  captcha_welcome_msg_click: "🛡️ Welcome {mention} to {group}!\nPlease tap the button below within {timeout}s to complete human verification:",
  captcha_button_text: "🤖 I am human, tap to verify",
  captcha_success_msg: "✅ Verification successful! Welcome {name} to {group}!",
  captcha_fail_msg: "❌ Incorrect option or answer! Please try again.",
  captcha_alert_other_user: "❌ This verification button belongs to a new member, no action required for you!",
  captcha_alert_expired: "⚠️ Verification session has expired or already been completed.",
  captcha_alert_attempt1_fail: "❌ Incorrect option! Attempt 1/2. Please try again.",
  captcha_alert_final_fail: "❌ Incorrect option! Attempt 2/2. Verification failed, please rejoin to try again.",
  captcha_alert_success: "✅ Verification successful! You can now send messages in {group}.",
};

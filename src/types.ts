export interface DbUser {
  chat_id: number;
  user_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  total_xp: number;
  weekly_xp: number;
  level: number;
  avatar_url?: string | null;
}

export interface DbMessage {
  message_id: number;
  chat_id: number;
  user_id: number;
  timestamp: string;
}

export interface DbCooldown {
  chat_id: number;
  user_id: number;
  action_type: string;
  last_triggered: number; // Unix timestamp in milliseconds
}

export interface CommunityTarget {
  chat_id: number;
  command_topic_ids: number[]; // empty array means all topics allowed
  data_topic_ids: number[];    // empty array means all topics allowed
}

export interface CaptchaCommunity {
  chat_id: number | string;
  topic_id?: number | null;
}

export interface CustomCommand {
  trigger_name: string;
  content: string;
  action_type: string; // 'text' | 'start' | 'rules' | 'rank' | 'leaderboard'
}

export interface BotSettings {
  xp_message_sent: number;
  cooldown_message_sent: number; // in seconds
  xp_reaction_added: number;
  cooldown_reaction_added: number; // in seconds
  xp_peer_recognition: number;
  cooldown_peer_recognition: number; // in seconds
  allowed_communities: CommunityTarget[]; // multi-community config
  wrong_topic_warning: string; // custom warning text for wrong topic
  card_bg_color: string;
  card_bg_image: string; // URL or empty
  card_text_color: string;
  card_progress_color: string;
  card_font_size_level: number;
  card_font_size_rank: number;
  card_font_size_name: number;
  admin_password?: string;
  weekly_reset_cron: string;
  community_name?: string;
  last_active_chat_id?: string | number;
  last_active_thread_id?: number | null;
  default_avatar?: string;
  history_periods_limit?: number;
  // Safety & Anti-Spam Settings
  link_intercept_enabled?: boolean;
  whitelist_domains?: string[];
  rtlo_auto_ban?: boolean;
  rtlo_action?: "ban" | "mute" | "delete_only";
  rtlo_mute_duration?: number;
  new_user_link_auto_ban?: boolean;
  new_user_link_action?: "ban" | "mute" | "delete_only";
  new_user_link_mute_duration?: number;
  keyword_auto_ban?: boolean;
  keyword_action?: "ban" | "mute" | "delete_only";
  keyword_mute_duration?: number;
  spam_keywords?: string[];
  flood_threshold_messages?: number;
  flood_threshold_seconds?: number;
  flood_mute_duration?: number;
  cas_api_enabled?: boolean;
  cas_action?: "ban" | "mute" | "delete_only";
  cas_mute_duration?: number;
  block_inline_bots?: boolean;
  block_inline_bots_action?: "ban" | "mute" | "delete_only";
  block_inline_bots_mute_duration?: number;
  allowed_inline_bots?: string[];
  block_inline_keyboards?: boolean;
  block_inline_keyboards_action?: "ban" | "mute" | "delete_only";
  block_inline_keyboards_mute_duration?: number;
  emoji_auto_ban?: boolean;
  emoji_threshold?: number;
  emoji_action?: "ban" | "mute" | "delete_only";
  emoji_mute_duration?: number;
  ignored_spam_topic_ids?: number[];
  sa_admin_tg_ids?: number[];
  // Member Welcome Message Settings
  welcome_enabled?: boolean;
  welcome_message?: string;
  welcome_delete_delay_mins?: number;
  // Group Captcha Settings
  captcha_communities?: CaptchaCommunity[];
  captcha_enabled?: boolean;
  captcha_type?: "math" | "text" | "click" | "random";
  captcha_timeout_seconds?: number;
  captcha_failed_action?: "kick" | "ban";
  captcha_delete_messages?: boolean;
  captcha_welcome_msg_math?: string;
  captcha_welcome_msg_text?: string;
  captcha_welcome_msg_click?: string;
  captcha_button_text?: string;
  captcha_success_msg?: string;
  captcha_fail_msg?: string;
  captcha_alert_other_user?: string;
  captcha_alert_expired?: string;
  captcha_alert_too_fast?: string;
  captcha_alert_attempt1_fail?: string;
  captcha_alert_final_fail?: string;
  captcha_alert_success?: string;
}

export interface CaptchaSession {
  id?: number;
  chat_id: number;
  user_id: number;
  username?: string | null;
  first_name?: string;
  captcha_type: "math" | "text" | "click";
  answer: string;
  message_id?: number | null;
  created_at: number;
  expire_at: number;
  attempts?: number;
  status: "pending" | "passed" | "failed" | "expired";
}

export interface SpamLog {
  id: number;
  chat_id: number;
  user_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  reason: string;
  evidence: string | null;
  risk_score: number;
  status: string; // 'pending' | 'auto_banned' | 'banned' | 'muted' | 'dismissed'
  created_at: string;
}

export interface LeaderboardResponse {
  leaderboard: (DbUser & { rank: number })[];
  currentUser?: DbUser & { rank: number };
}

export interface DbBannedUser {
  chat_id: number;
  user_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  banned_by: number | null;
  banned_by_name: string | null;
  banned_at: string;
}

export interface AdminLog {
  id: number;
  event_id: number;
  chat_id: number;
  user_id: number;
  action_type: string;
  date: number;
  raw_data: string;
  display_id: string;
  operator_name: string;
  target_name: string;
  message_content: string;
  ban_reason: string;
  created_at: string;
}

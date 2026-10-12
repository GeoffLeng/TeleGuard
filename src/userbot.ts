import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import * as db from "./database";
import { BOT_TOKEN } from "./config";

// Extract bot user ID from BOT_TOKEN (format: "123456789:AAAA...")
const BOT_USER_ID = BOT_TOKEN ? parseInt(BOT_TOKEN.split(":")[0], 10) : 0;

// Only these action types are recorded
const ALLOWED_ACTIONS = new Set([
  "ChannelAdminLogEventActionDeleteMessage",
  "ChannelAdminLogEventActionParticipantToggleBan",
]);

// Bot auto-notification patterns to filter out
const BOT_NOTIFICATION_PATTERNS = [
  /has been automatically banned/i,
  /has been automatically muted/i,
  /banned\s+/i,
  /muted\s+/i,
  /🚫/,
  /⚠️.*automatically/i,
];

// Singleton instance container
let activeMonitor: UserbotMonitor | null = null;
const DEBUG_MODE = false; // Set to true to enable verbose event filtering logs

export function getActiveMonitor(): UserbotMonitor | null {
  return activeMonitor;
}

/**
 * Resolve a user entity to a display name string.
 * Returns @username if available, otherwise first_name + last_name.
 */
function resolveUserName(user: any): string {
  if (!user) return "Unknown";
  if (user.username) return `@${user.username}`;
  const first = user.firstName || user.first_name || "";
  const last = user.lastName || user.last_name || "";
  return `${first} ${last}`.trim() || `User#${user.id}`;
}

/**
 * Extract message text content from a Telegram message object.
 * Falls back to describing the media type if no text is present.
 */
function extractMessageContent(message: any): string {
  if (!message) return "";
  const text = message.message || message.text || "";
  if (text) return text;

  // Describe media type
  if (message.photo || message.media?.photo) return "[Photo]";
  if (message.sticker || message.media?.document?.mimeType?.startsWith("image/webp")) return "[Sticker]";
  if (message.video || message.media?.document?.mimeType?.startsWith("video/")) return "[Video]";
  if (message.voice) return "[Voice Message]";
  if (message.audio) return "[Audio]";
  if (message.document || message.media?.document) return "[Document]";
  if (message.animation) return "[GIF / Animation]";
  if (message.contact) return "[Contact]";
  if (message.location || message.venue) return "[Location]";
  if (message.poll) return "[Poll]";
  return "[Media]";
}

/**
 * Check if a message text matches bot auto-notification patterns.
 */
function isBotNotification(text: string): boolean {
  if (!text) return false;
  return BOT_NOTIFICATION_PATTERNS.some(p => p.test(text));
}

export class UserbotMonitor {
  private client: TelegramClient | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private apiId: number,
    private apiHash: string,
    private sessionString: string,
    private monitorChatIds: number[],
    private pollIntervalMs: number = 3600000 // Default: 1 hour
  ) {}

  async start(): Promise<void> {
    if (this.client) return;

    console.log("[Userbot] Initializing MTProto Userbot Client...");
    const stringSession = new StringSession(this.sessionString);
    this.client = new TelegramClient(stringSession, this.apiId, this.apiHash, {
      connectionRetries: 5,
    });

    try {
      await this.client.connect();
      const me = await this.client.getMe();
      const username = me instanceof Api.User ? me.username || me.firstName : "Userbot";
      console.log(`[Userbot] Connected successfully as @${username}`);

      // Register active singleton monitor instance
      activeMonitor = this;

      // Start periodic polling
      this.poll(); // run once immediately
      this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
      console.log(`[Userbot] Polling interval set to ${this.pollIntervalMs / 1000}s (${this.pollIntervalMs / 3600000}h)`);
    } catch (err) {
      console.error("[Userbot] Failed to start Userbot client:", err);
      this.client = null;
    }
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    activeMonitor = null;
    console.log("[Userbot] Userbot client stopped.");
  }

  /**
   * Public manual trigger to run a poll on demand for all or a specific chat
   */
  async triggerImmediatePoll(chatId?: number): Promise<void> {
    if (!this.client || !(await this.client.checkAuthorization())) {
      console.warn("[Userbot] Client not authorized. Manual poll skipped.");
      return;
    }

    console.log(`[Userbot] Manual poll triggered on-demand${chatId ? ` for chat ${chatId}` : ""}`);
    if (chatId) {
      await this.pollChat(chatId);
    } else {
      for (const cid of this.monitorChatIds) {
        await this.pollChat(cid);
      }
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      if (!this.client || !(await this.client.checkAuthorization())) {
        console.warn("[Userbot] Client not authorized. Polling skipped.");
        this.isPolling = false;
        return;
      }

      for (const chatId of this.monitorChatIds) {
        await this.pollChat(chatId);
      }
    } catch (err) {
      console.error("[Userbot] Error during polling cycle:", err);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Fetch and process logs for a specific chat
   */
  private async pollChat(chatId: number): Promise<void> {
    if (!this.client) return;

    try {
      // Resolve group entity robustly: try cache first, fall back to network fetch
      let entity: any = null;
      try {
        entity = await this.client.getInputEntity(chatId);
      } catch {
        try {
          entity = await this.client.getEntity(chatId);
        } catch (err: any) {
          console.warn(`[Userbot] Failed to resolve entity for Chat ID: ${chatId}. Details:`, err.message || err);
        }
      }

      if (!entity) {
        console.warn(`[Userbot] Could not resolve entity for Chat ID: ${chatId} (Is the userbot account in the group?). Skipping.`);
        return;
      }

      // Fetch Recent Actions
      const result = await this.client.invoke(
        new Api.channels.GetAdminLog({
          channel: entity,
          q: "",
          limit: 50,
        })
      );

      const totalEvents = result instanceof Api.channels.AdminLogResults ? result.events.length : 0;
      console.log(`[Userbot] Fetched ${totalEvents} raw recent actions from Telegram for Chat: ${chatId}`);

      if (result instanceof Api.channels.AdminLogResults && result.events.length > 0) {
        // Build user lookup map from result.users
        const userMap = new Map<number, any>();
        if (result.users) {
          for (const u of result.users) {
            const uAny = u as any;
            const uid = uAny.id ? Number(uAny.id.toString()) : 0;
            if (uid) userMap.set(uid, uAny);
          }
        }

        let savedCount = 0;
        for (const event of result.events) {
          const eventAny = event as any;
          const eventId = Number(eventAny.id.toString());
          const operatorUserId = eventAny.userId ? Number(eventAny.userId.toString()) : 0;
          const action = eventAny.action;
          const actionClassName = action ? (action.className || action.constructor.name || "UnknownAction") : "UnknownAction";
          const date = eventAny.date; // unix timestamp

          if (DEBUG_MODE) console.log(`[Userbot Debug] Analyzing Event ID: ${eventId}, Action: ${actionClassName}, Operator: ${operatorUserId}`);

          // === FILTER 1: Only allowed action types ===
          if (!ALLOWED_ACTIONS.has(actionClassName)) {
            if (DEBUG_MODE) console.log(`[Userbot Debug] Filtered out: action '${actionClassName}' is not allowed`);
            continue;
          }



          // Resolve operator name
          const operatorUser = userMap.get(operatorUserId);
          const operatorName = resolveUserName(operatorUser);

          let actionType = "";
          let targetName = "";
          let messageContent = "";
          let banReason = "";

          if (actionClassName === "ChannelAdminLogEventActionDeleteMessage") {
            actionType = "Delete";

            // Extract the deleted message details
            const msg = action.message;
            if (msg) {
              const msgAny = msg as any;
              const fromId = msgAny.fromId?.userId ? Number(msgAny.fromId.userId.toString()) : (msgAny.peerId?.userId ? Number(msgAny.peerId.userId.toString()) : 0);
              const msgSender = userMap.get(fromId);
              targetName = resolveUserName(msgSender);
              messageContent = extractMessageContent(msgAny);

              // === FILTER 3: Skip bot auto-notification messages ===
              if (isBotNotification(messageContent)) {
                if (DEBUG_MODE) console.log(`[Userbot Debug] Filtered out: deleted message matches bot notification pattern: "${messageContent}"`);
                continue;
              }
              // Also skip if the deleted message was sent by the bot itself
              if (BOT_USER_ID && fromId === BOT_USER_ID) {
                if (DEBUG_MODE) console.log(`[Userbot Debug] Filtered out: deleted message was sent by the bot itself`);
                continue;
              }
            }
          } else if (actionClassName === "ChannelAdminLogEventActionParticipantToggleBan") {
            // Check if this is actually a ban (not an unban or just restriction)
            const newParticipant = action.newParticipant || action.prevParticipant;
            const newParticipantAny = newParticipant as any;

            // Determine if banned: check if the new status has bannedRights with viewMessages = true
            // or if the participant type is ChannelParticipantBanned
            const participantClassName = newParticipantAny?.className || "";
            const bannedRights = newParticipantAny?.bannedRights;
            const isBanned = participantClassName === "ChannelParticipantBanned" &&
              bannedRights && bannedRights.viewMessages === true;

            if (!isBanned) {
              if (DEBUG_MODE) console.log(`[Userbot Debug] Filtered out: toggle ban is not a ban action (possibly unban or permission toggle)`);
              continue; // Skip unbans and permission-only changes
            }

            actionType = "Banned";

            // Extract the banned user
            const bannedPeer = newParticipantAny?.peer;
            const bannedUserId = bannedPeer?.userId ? Number(bannedPeer.userId.toString()) : 0;
            const bannedUser = userMap.get(bannedUserId);
            targetName = resolveUserName(bannedUser);
            banReason = "Banned from the group";

            // Try to extract more details from banned rights
            if (bannedRights?.untilDate) {
              const untilDate = new Date(bannedRights.untilDate * 1000);
              const now = new Date();
              if (untilDate.getFullYear() > now.getFullYear() + 5) {
                banReason = "Permanently banned from the group";
              } else {
                banReason = `Banned until ${untilDate.toLocaleString()}`;
              }
            }
          }

          if (!actionType) continue; // Safety guard

          const rawData = JSON.stringify(eventAny.toJSON());

          // Write to SQLite
          if (DEBUG_MODE) console.log(`[Userbot Debug] Saving admin log to DB: ID ${eventId}, Type: ${actionType}, Op: ${operatorName}, Target: ${targetName}`);
          await db.saveAdminLog(
            eventId, chatId, operatorUserId, actionType, date, rawData,
            operatorName, targetName, messageContent, banReason
          );
          savedCount++;
        }
        if (savedCount > 0) {
          console.log(`[Userbot] Saved ${savedCount} filtered Recent Action events for Chat: ${chatId}`);
        }
      }
    } catch (chatErr: any) {
      console.error(`[Userbot] Error fetching Recent Actions for chat ${chatId}:`, chatErr.message || chatErr);
    }
  }
}

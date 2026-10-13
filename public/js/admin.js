
let drawQuill = null;
function initDrawQuill() {
  if (drawQuill) return;
  const container = document.getElementById('draw-desc-editor');
  if (!container || typeof Quill === 'undefined') return;
  drawQuill = new Quill('#draw-desc-editor', {
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'header': [1, 2, 3, false] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link', 'clean']
      ]
    },
    theme: 'snow',
    placeholder: 'Enter event rules, prize details, or welcome note...'
  });
}
let adminPassword = sessionStorage.getItem("admin_password") || localStorage.getItem("admin_password") || "";
let activeSection = "settings";
let allUsers = [];
let activeChatId = null;
let historyViewState = "history";
let activeModule = "community";

// Enforce Dark Theme
document.documentElement.setAttribute("data-theme", "dark");

// Helper: Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Global Timezone-Aware DateTime Formatter (Adapts strictly to client login device's local system time)
function formatLocalDateTime(dateInput) {
  if (!dateInput && dateInput !== 0) return "--";
  if (typeof dateInput === "number") {
    const ms = dateInput < 10000000000 ? dateInput * 1000 : dateInput;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? String(dateInput) : d.toLocaleString();
  }
  let str = String(dateInput).trim();
  if (!str) return "--";
  // Normalize SQL datetime string "YYYY-MM-DD HH:mm:ss" to ISO-8601 UTC format "YYYY-MM-DDTHH:mm:ssZ"
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str.replace(" ", "T") + "Z";
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleString();
}

function formatLocalDate(dateInput) {
  if (!dateInput && dateInput !== 0) return "";
  if (typeof dateInput === "number") {
    const ms = dateInput < 10000000000 ? dateInput * 1000 : dateInput;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  let str = String(dateInput).trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str.replace(" ", "T") + "Z";
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// DOM Elements
const loginContainer = document.getElementById("login-container");
const dashboardContainer = document.getElementById("dashboard-container");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const adminPassInput = document.getElementById("admin-pass");

const btnTgLogin = document.getElementById("btn-tg-login");
const tgAuthQrContainer = document.getElementById("tg-auth-qr-container");
const lnkTgBot = document.getElementById("lnk-tg-bot");
const tgAuthCode = document.getElementById("tg-auth-code");

let pollInterval = null;

// Auth flow (Password)
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = adminPassInput.value;
  const result = await verifyPassword(password);
  if (result.success) {
    adminPassword = password;
    localStorage.setItem("admin_password", password);
    showDashboard();
  } else {
    loginError.textContent = result.error || "Incorrect password, please try again!";
    loginError.classList.remove("hidden");
  }
});

// Telegram Auth Flow
if (btnTgLogin) {
  btnTgLogin.addEventListener("click", async () => {
    btnTgLogin.disabled = true;
    btnTgLogin.textContent = "Requesting Authorization...";
    try {
      const res = await fetch("/api/admin/auth/init");
      if (!res.ok) throw new Error("Failed to initialize authentication");
      const { token, code, botUsername } = await res.json();
      
      const tgLink = `https://t.me/${botUsername}?start=${token}`;
      
      lnkTgBot.href = tgLink;
      if (tgAuthCode) {
        tgAuthCode.textContent = code;
      }
      const tgBotUsernameDisplay = document.getElementById("tg-bot-username-display");
      if (tgBotUsernameDisplay) {
        tgBotUsernameDisplay.textContent = `@${botUsername}`;
      }
      
      btnTgLogin.classList.add("hidden");
      tgAuthQrContainer.classList.remove("hidden");
      
      // Start polling status
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/admin/auth/poll?token=${token}`);
          if (pollRes.ok) {
            const { status } = await pollRes.json();
            if (status === "authorized") {
              clearInterval(pollInterval);
              adminPassword = token;
              sessionStorage.setItem("admin_password", token); // Session Storage for Telegram login!
              showDashboard();
            } else if (status === "expired") {
              clearInterval(pollInterval);
              alert("Authentication request expired. Please try again.");
              resetTgLoginUI();
            }
          }
        } catch (err) {
          console.error("Error polling auth status:", err);
        }
      }, 2000);
      
    } catch (err) {
      console.error(err);
      alert("Failed to start Telegram login. Please check server connection.");
      resetTgLoginUI();
    }
  });
}

function resetTgLoginUI() {
  if (btnTgLogin) {
    btnTgLogin.disabled = false;
    btnTgLogin.classList.remove("hidden");
    btnTgLogin.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; vertical-align: middle;"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      Login via Telegram
    `;
  }
  if (tgAuthQrContainer) {
    tgAuthQrContainer.classList.add("hidden");
  }
}

async function verifyPassword(password) {
  try {
    const res = await fetch("/api/admin/settings", {
      headers: { "Authorization": `Bearer ${password}` }
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Incorrect password, please try again!" };
  } catch (e) {
    console.error("Auth verification failed:", e);
    return { success: false, error: "Network error, please check connection." };
  }
}

function showDashboard() {
  loginContainer.classList.add("hidden");
  dashboardContainer.classList.remove("hidden");
  loadSettings();
  loadUsers();
}

function logout() {
  const tokenToRevoke = adminPassword;
  if (tokenToRevoke) {
    fetch("/api/admin/auth/logout", {
      method: "POST",
      headers: { "Authorization": `Bearer ${tokenToRevoke}` }
    }).catch(() => {});
  }
  localStorage.removeItem("admin_password");
  sessionStorage.removeItem("admin_password");
  adminPassword = "";
  loginContainer.classList.remove("hidden");
  dashboardContainer.classList.add("hidden");
  resetTgLoginUI();
}

// Check initial status
document.addEventListener("DOMContentLoaded", async () => {
  if (adminPassword) {
    const success = await verifyPassword(adminPassword);
    if (success) {
      showDashboard();
    } else {
      logout();
    }
  }
});

// Global Module Switching (Community Management vs Lucky Draw)
function switchModule(moduleName) {
  const btnCommunity = document.getElementById("btn-module-community");
  const btnDraw = document.getElementById("btn-module-draw");
  const modCommunity = document.getElementById("module-community");
  const modDraw = document.getElementById("module-draw");

  if (moduleName === "draw") {
    if (btnCommunity) btnCommunity.classList.remove("active");
    if (btnDraw) btnDraw.classList.add("active");
    if (modCommunity) modCommunity.classList.add("hidden");
    if (modDraw) {
      modDraw.classList.remove("hidden");
      initDrawQuill();
      loadDrawModule();
    }
  } else {
    if (btnDraw) btnDraw.classList.remove("active");
    if (btnCommunity) btnCommunity.classList.add("active");
    if (modDraw) modDraw.classList.add("hidden");
    if (modCommunity) modCommunity.classList.remove("hidden");
  }
}
window.switchModule = switchModule;

// Section switching
function switchSection(section) {
  activeSection = section;
  document.getElementById("nav-settings").classList.toggle("active", section === "settings");
  document.getElementById("nav-users").classList.toggle("active", section === "users");
  document.getElementById("nav-history").classList.toggle("active", section === "history");
  document.getElementById("nav-commands").classList.toggle("active", section === "commands");
  document.getElementById("nav-spam").classList.toggle("active", section === "spam");
  const navCaptcha = document.getElementById("nav-captcha");
  if (navCaptcha) navCaptcha.classList.toggle("active", section === "captcha");
  document.getElementById("nav-admin-logs").classList.toggle("active", section === "admin-logs");

  document.getElementById("section-settings").classList.toggle("hidden", section !== "settings");
  document.getElementById("section-users").classList.toggle("hidden", section !== "users");
  document.getElementById("section-history").classList.toggle("hidden", section !== "history");
  document.getElementById("section-commands").classList.toggle("hidden", section !== "commands");
  document.getElementById("section-spam").classList.toggle("hidden", section !== "spam");
  const secCaptcha = document.getElementById("section-captcha");
  if (secCaptcha) secCaptcha.classList.toggle("hidden", section !== "captcha");
  document.getElementById("section-admin-logs").classList.toggle("hidden", section !== "admin-logs");
  const secQuery = document.getElementById("section-query");
  if (secQuery) secQuery.classList.toggle("hidden", section !== "query");

  if (section === "history") {
    historyViewState = "history";
    switchHistoryTab("active");
  } else if (section === "users") {
    loadUsers();
  } else if (section === "commands") {
    loadCommands();
  } else if (section === "spam") {
    loadSpamLogs();
  } else if (section === "admin-logs") {
    loadAdminLogs();
  }
}

// Bind Color Pickers and Hex Inputs
function bindColorPicker(pickerId, inputId) {
  const picker = document.getElementById(pickerId);
  const input = document.getElementById(inputId);

  picker.addEventListener("input", (e) => {
    input.value = e.target.value.toUpperCase();
  });
  
  input.addEventListener("input", (e) => {
    if (e.target.value.match(/^#[0-9A-F]{6}$/i)) {
      picker.value = e.target.value;
    }
  });
}

bindColorPicker("card_bg_color_picker", "card_bg_color");
bindColorPicker("card_text_color_picker", "card_text_color");
bindColorPicker("card_progress_color_picker", "card_progress_color");

// Load Settings from API
async function loadSettings() {
  try {
    const res = await fetch("/api/admin/settings", {
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (!res.ok) throw new Error("Auth failed");
    const settings = await res.json();
    
    if (settings.last_active_chat_id) {
      activeChatId = settings.last_active_chat_id;
    }
    
    // Fill rules form
    document.getElementById("xp_message_sent").value = settings.xp_message_sent;
    document.getElementById("cooldown_message_sent").value = settings.cooldown_message_sent;
    document.getElementById("xp_reaction_added").value = settings.xp_reaction_added;
    document.getElementById("cooldown_reaction_added").value = settings.cooldown_reaction_added;
    document.getElementById("xp_peer_recognition").value = settings.xp_peer_recognition;
    document.getElementById("cooldown_peer_recognition").value = settings.cooldown_peer_recognition;
    document.getElementById("community_name").value = settings.community_name || "";
    document.getElementById("wrong_topic_warning").value = settings.wrong_topic_warning || "";
    document.getElementById("sa_admin_tg_ids").value = (settings.sa_admin_tg_ids || []).join(", ");
    document.getElementById("history_periods_limit").value = settings.history_periods_limit !== undefined ? settings.history_periods_limit : 5;

    // Render allowed communities list
    const communities = settings.allowed_communities || [];
    renderCommunities(communities);

    // Populate admin-logs-chat-select
    const logsSelect = document.getElementById("admin-logs-chat-select");
    if (logsSelect) {
      const currentSelectedVal = logsSelect.value;
      logsSelect.innerHTML = "";
      if (communities.length === 0) {
        const activeId = activeChatId || 0;
        const opt = document.createElement("option");
        opt.value = activeId;
        opt.textContent = `Group (ID: ${activeId})`;
        logsSelect.appendChild(opt);
      } else {
        communities.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.chat_id;
          opt.textContent = `${c.name || "Group"} (ID: ${c.chat_id})`;
          logsSelect.appendChild(opt);
        });
      }
      if (currentSelectedVal && Array.from(logsSelect.options).some(opt => opt.value === currentSelectedVal)) {
        logsSelect.value = currentSelectedVal;
      }
    }

    // Fill welcome & captcha form
    if (document.getElementById("welcome_enabled")) {
      document.getElementById("welcome_enabled").checked = settings.welcome_enabled || false;
      document.getElementById("welcome_delete_delay_mins").value = settings.welcome_delete_delay_mins !== undefined ? settings.welcome_delete_delay_mins : 0;
      document.getElementById("welcome_message").value = settings.welcome_message !== undefined ? settings.welcome_message : "🎉 Welcome {mention} to {group}! Glad to have you here.";
    }
    if (typeof renderCaptchaCommunities === "function") {
      renderCaptchaCommunities(settings.captcha_communities || []);
    }

    if (document.getElementById("captcha_enabled")) {
      document.getElementById("captcha_enabled").checked = settings.captcha_enabled || false;
      document.getElementById("captcha_type").value = settings.captcha_type || "math";
      document.getElementById("captcha_timeout_seconds").value = settings.captcha_timeout_seconds || 180;
      document.getElementById("captcha_failed_action").value = settings.captcha_failed_action || "kick";
      if (document.getElementById("captcha_welcome_msg_math")) {
        document.getElementById("captcha_welcome_msg_math").value = settings.captcha_welcome_msg_math || "";
        document.getElementById("captcha_welcome_msg_text").value = settings.captcha_welcome_msg_text || "";
        document.getElementById("captcha_welcome_msg_click").value = settings.captcha_welcome_msg_click || "";
        document.getElementById("captcha_button_text").value = settings.captcha_button_text || "";
        document.getElementById("captcha_success_msg").value = settings.captcha_success_msg || "";
        document.getElementById("captcha_fail_msg").value = settings.captcha_fail_msg || "";
        document.getElementById("captcha_alert_other_user").value = settings.captcha_alert_other_user || "";
        document.getElementById("captcha_alert_expired").value = settings.captcha_alert_expired || "";
        document.getElementById("captcha_alert_attempt1_fail").value = settings.captcha_alert_attempt1_fail || "";
        document.getElementById("captcha_alert_final_fail").value = settings.captcha_alert_final_fail || "";
        document.getElementById("captcha_alert_success").value = settings.captcha_alert_success || "";
      }
    }

    document.getElementById("link_intercept_enabled").checked = settings.link_intercept_enabled || false;
    document.getElementById("rtlo_auto_ban").checked = settings.rtlo_auto_ban || false;
    document.getElementById("rtlo_action").value = settings.rtlo_action || "ban";
    document.getElementById("rtlo_mute_duration").value = settings.rtlo_mute_duration !== undefined ? settings.rtlo_mute_duration : 60;
    
    document.getElementById("new_user_link_auto_ban").checked = settings.new_user_link_auto_ban || false;
    document.getElementById("new_user_link_action").value = settings.new_user_link_action || "ban";
    document.getElementById("new_user_link_mute_duration").value = settings.new_user_link_mute_duration !== undefined ? settings.new_user_link_mute_duration : 60;

    document.getElementById("cas_api_enabled").checked = settings.cas_api_enabled !== undefined ? settings.cas_api_enabled : true;
    document.getElementById("cas_action").value = settings.cas_action || "ban";
    document.getElementById("cas_mute_duration").value = settings.cas_mute_duration !== undefined ? settings.cas_mute_duration : 60;

    document.getElementById("block_inline_keyboards").checked = settings.block_inline_keyboards !== undefined ? settings.block_inline_keyboards : true;
    document.getElementById("block_inline_keyboards_action").value = settings.block_inline_keyboards_action || "ban";
    document.getElementById("block_inline_keyboards_mute_duration").value = settings.block_inline_keyboards_mute_duration !== undefined ? settings.block_inline_keyboards_mute_duration : 60;

    document.getElementById("block_inline_bots").checked = settings.block_inline_bots !== undefined ? settings.block_inline_bots : true;
    document.getElementById("block_inline_bots_action").value = settings.block_inline_bots_action || "delete_only";
    document.getElementById("block_inline_bots_mute_duration").value = settings.block_inline_bots_mute_duration !== undefined ? settings.block_inline_bots_mute_duration : 60;

    document.getElementById("keyword_auto_ban").checked = settings.keyword_auto_ban || false;
    document.getElementById("keyword_action").value = settings.keyword_action || "ban";
    document.getElementById("keyword_mute_duration").value = settings.keyword_mute_duration !== undefined ? settings.keyword_mute_duration : 60;

    document.getElementById("emoji_auto_ban").checked = settings.emoji_auto_ban || false;
    document.getElementById("emoji_threshold").value = settings.emoji_threshold !== undefined ? settings.emoji_threshold : 10;
    document.getElementById("emoji_action").value = settings.emoji_action || "ban";
    document.getElementById("emoji_mute_duration").value = settings.emoji_mute_duration !== undefined ? settings.emoji_mute_duration : 60;

    document.getElementById("allowed_inline_bots").value = (settings.allowed_inline_bots || []).join(", ");
    document.getElementById("whitelist_domains").value = (settings.whitelist_domains || []).join("\n");
    document.getElementById("ignored_spam_topic_ids").value = (settings.ignored_spam_topic_ids || []).join(", ");
    document.getElementById("spam_keywords").value = (settings.spam_keywords || []).join(", ");
    document.getElementById("flood_threshold_messages").value = settings.flood_threshold_messages || 5;
    document.getElementById("flood_threshold_seconds").value = settings.flood_threshold_seconds || 3;
    document.getElementById("flood_mute_duration").value = settings.flood_mute_duration !== undefined ? settings.flood_mute_duration : 60;

    // Helper to toggle mute duration input visibility
    function setupMuteToggle(selectId, containerId) {
      const selectEl = document.getElementById(selectId);
      const containerEl = document.getElementById(containerId);
      if (!selectEl || !containerEl) return;
      const updateVisibility = () => {
        if (selectEl.value === 'mute') {
          containerEl.style.display = 'flex';
        } else {
          containerEl.style.display = 'none';
        }
      };
      selectEl.removeEventListener('change', updateVisibility);
      selectEl.addEventListener('change', updateVisibility);
      updateVisibility();
    }

    // Trigger visibility updates
    setupMuteToggle("rtlo_action", "rtlo_duration_container");
    setupMuteToggle("new_user_link_action", "new_user_link_duration_container");
    setupMuteToggle("cas_action", "cas_duration_container");
    setupMuteToggle("block_inline_keyboards_action", "block_inline_keyboards_duration_container");
    setupMuteToggle("block_inline_bots_action", "block_inline_bots_duration_container");
    setupMuteToggle("keyword_action", "keyword_duration_container");
    setupMuteToggle("emoji_action", "emoji_duration_container");

    // Fill style forms
    document.getElementById("card_bg_color").value = settings.card_bg_color;
    document.getElementById("card_bg_color_picker").value = settings.card_bg_color;
    
    document.getElementById("card_text_color").value = settings.card_text_color;
    document.getElementById("card_text_color_picker").value = settings.card_text_color;
    
    document.getElementById("card_progress_color").value = settings.card_progress_color;
    document.getElementById("card_progress_color_picker").value = settings.card_progress_color;

    document.getElementById("card_font_size_level").value = settings.card_font_size_level;
    document.getElementById("card_font_size_rank").value = settings.card_font_size_rank;
    document.getElementById("card_font_size_name").value = settings.card_font_size_name;

    // Reset password field
    document.getElementById("admin_password").value = "";

    // Card background image preview
    if (settings.card_bg_image) {
      document.getElementById("bg-preview").src = settings.card_bg_image;
      document.getElementById("bg-preview-container").classList.remove("hidden");
    } else {
      document.getElementById("bg-preview-container").classList.add("hidden");
    }

    // Default avatar preview
    if (settings.default_avatar) {
      document.getElementById("avatar-preview").src = settings.default_avatar;
      document.getElementById("avatar-preview-container").classList.remove("hidden");
    } else {
      document.getElementById("avatar-preview-container").classList.add("hidden");
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
    logout();
  }
}

// Community Form Submit
document.getElementById("community-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawAdmins = document.getElementById("sa_admin_tg_ids").value || "";
  const adminIds = rawAdmins.split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(val => !isNaN(val));

  const community = {
    community_name: document.getElementById("community_name").value,
    wrong_topic_warning: document.getElementById("wrong_topic_warning").value,
    sa_admin_tg_ids: adminIds
  };
  await saveSettings(community, "Community settings saved successfully!");
});

// Multi-Community Management
function renderCommunities(communities) {
  const container = document.getElementById("communities-list");
  container.innerHTML = "";
  if (!communities || communities.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No communities configured. Bot will not respond in any group until you add one.</p>';
    return;
  }
  communities.forEach((c, idx) => {
    const row = document.createElement("div");
    row.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 15px; flex-wrap: wrap; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);";
    
    // Support migrating old schema topic_ids automatically
    const cmdTopics = c.command_topic_ids || c.topic_ids || [];
    const dataTopics = c.data_topic_ids || c.topic_ids || [];

    row.innerHTML = `
      <div style="flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Group Chat ID</span>
        <input type="number" class="community-chat-id" value="${c.chat_id}" placeholder="Chat ID (e.g. -100...)" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
      </div>
      <div style="flex: 2; min-width: 200px; display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Allowed Command Topics (empty = all)</span>
        <input type="text" class="community-command-topics" value="${cmdTopics.join(", ")}" placeholder="e.g. 38979, 12345" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
      </div>
      <div style="flex: 2; min-width: 200px; display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Collected Data Topics (empty = all)</span>
        <input type="text" class="community-data-topics" value="${dataTopics.join(", ")}" placeholder="e.g. 56789, 999" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
      </div>
      <div style="display: flex; align-items: flex-end; height: 100%; margin-top: 18px;">
        <button type="button" class="btn btn-danger btn-xs" onclick="this.parentElement.parentElement.remove()" style="padding: 8px 12px;">Remove</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function addCommunityRow() {
  const container = document.getElementById("communities-list");
  const placeholder = container.querySelector("p");
  if (placeholder) placeholder.remove();
  const row = document.createElement("div");
  row.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 15px; flex-wrap: wrap; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);";
  row.innerHTML = `
    <div style="flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 4px;">
      <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Group Chat ID</span>
      <input type="number" class="community-chat-id" placeholder="Chat ID (e.g. -100...)" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
    </div>
    <div style="flex: 2; min-width: 200px; display: flex; flex-direction: column; gap: 4px;">
      <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Allowed Command Topics (empty = all)</span>
      <input type="text" class="community-command-topics" placeholder="e.g. 38979, 12345" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
    </div>
    <div style="flex: 2; min-width: 200px; display: flex; flex-direction: column; gap: 4px;">
      <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Collected Data Topics (empty = all)</span>
      <input type="text" class="community-data-topics" placeholder="e.g. 56789, 999" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
    </div>
    <div style="display: flex; align-items: flex-end; height: 100%; margin-top: 18px;">
      <button type="button" class="btn btn-danger btn-xs" onclick="this.parentElement.parentElement.remove()" style="padding: 8px 12px;">Remove</button>
    </div>
  `;
  container.appendChild(row);
}

async function saveCommunities() {
  const chatIdInputs = document.querySelectorAll(".community-chat-id");
  const commandTopicInputs = document.querySelectorAll(".community-command-topics");
  const dataTopicInputs = document.querySelectorAll(".community-data-topics");
  const communities = [];
  chatIdInputs.forEach((input, idx) => {
    const chatId = parseInt(input.value, 10);
    if (isNaN(chatId)) return;
    
    const cmdStr = commandTopicInputs[idx]?.value || "";
    const commandTopicIds = cmdStr.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    
    const dataStr = dataTopicInputs[idx]?.value || "";
    const dataTopicIds = dataStr.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

    communities.push({ 
      chat_id: chatId, 
      command_topic_ids: commandTopicIds, 
      data_topic_ids: dataTopicIds 
    });
  });
  await saveSettings({ allowed_communities: communities }, "Communities saved successfully!");
}

// Rules Form Submit
document.getElementById("rules-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const rules = {
    xp_message_sent: parseInt(document.getElementById("xp_message_sent").value, 10),
    cooldown_message_sent: parseInt(document.getElementById("cooldown_message_sent").value, 10),
    xp_reaction_added: parseInt(document.getElementById("xp_reaction_added").value, 10),
    cooldown_reaction_added: parseInt(document.getElementById("cooldown_reaction_added").value, 10),
    xp_peer_recognition: parseInt(document.getElementById("xp_peer_recognition").value, 10),
    cooldown_peer_recognition: parseInt(document.getElementById("cooldown_peer_recognition").value, 10),
    history_periods_limit: parseInt(document.getElementById("history_periods_limit").value, 10),
  };
  await saveSettings(rules, "Rules configuration saved successfully!");
});

// Styles Form Submit
document.getElementById("styles-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // 1. Upload background image file if selected
  const fileInput = document.getElementById("card_bg_image_file");
  let card_bg_image = undefined;

  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append("background", fileInput.files[0]);
    try {
      const uploadRes = await fetch("/api/admin/upload-bg", {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminPassword}` },
        body: formData
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        card_bg_image = uploadData.imageUrl;
      } else {
        alert("Failed to upload background image");
        return;
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading background image");
      return;
    }
  }

  // 1.5 Upload default avatar if selected
  const avatarInput = document.getElementById("default_avatar_file");
  let default_avatar = undefined;

  if (avatarInput.files.length > 0) {
    const formData = new FormData();
    formData.append("avatar", avatarInput.files[0]);
    try {
      const uploadRes = await fetch("/api/admin/upload-avatar", {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminPassword}` },
        body: formData
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        default_avatar = uploadData.imageUrl;
      } else {
        alert("Failed to upload default avatar");
        return;
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading default avatar");
      return;
    }
  }

  // 2. Prepare style data
  const styles = {
    card_bg_color: document.getElementById("card_bg_color").value,
    card_text_color: document.getElementById("card_text_color").value,
    card_progress_color: document.getElementById("card_progress_color").value,
    card_font_size_level: parseInt(document.getElementById("card_font_size_level").value, 10),
    card_font_size_rank: parseInt(document.getElementById("card_font_size_rank").value, 10),
    card_font_size_name: parseInt(document.getElementById("card_font_size_name").value, 10),
  };

  if (card_bg_image !== undefined) {
    styles.card_bg_image = card_bg_image;
  }

  if (default_avatar !== undefined) {
    styles.default_avatar = default_avatar;
  }

  const passInput = document.getElementById("admin_password").value;
  if (passInput) {
    styles.admin_password = passInput;
    adminPassword = passInput;
    localStorage.setItem("admin_password", passInput);
  }

  await saveSettings(styles, "Style settings saved successfully!");
  fileInput.value = ""; // Clear file selector
  avatarInput.value = ""; // Clear avatar file selector
  loadSettings(); // Reload settings & preview image
});

async function saveSettings(data, successMessage) {
  try {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`
      },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      alert(successMessage);
    } else {
      alert("Failed to save settings");
    }
  } catch (err) {
    console.error(err);
    alert("Request failed, please try again!");
  }
}

// Delete Background Image
async function deleteBgImage() {
  if (!confirm("Are you sure you want to remove the card background image?")) return;
  try {
    const res = await fetch("/api/admin/delete-bg", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (res.ok) {
      alert("Background image removed");
      loadSettings();
    }
  } catch (e) {
    console.error(e);
  }
}

// Delete Default Avatar
async function deleteDefaultAvatar() {
  if (!confirm("Are you sure you want to remove the default avatar?")) return;
  try {
    const res = await fetch("/api/admin/delete-avatar", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (res.ok) {
      alert("Default avatar removed");
      loadSettings();
    }
  } catch (e) {
    console.error(e);
  }
}

let currentUserManagementTab = "activity"; // "activity" | "invites"
let allInviteUsers = [];

// Switch between Activity and Invites tabs in User Management
function switchUserManagementTab(tab) {
  currentUserManagementTab = tab;
  const btnActivity = document.getElementById("btn-user-tab-activity");
  const btnInvites = document.getElementById("btn-user-tab-invites");
  const activityActions = document.getElementById("user-activity-actions");
  const inviteActions = document.getElementById("user-invite-actions");
  const activityTable = document.getElementById("user-activity-table-container");
  const inviteTable = document.getElementById("user-invite-table-container");
  const searchInput = document.getElementById("user-search");

  if (tab === "activity") {
    if (btnActivity) btnActivity.className = "btn btn-sm btn-primary";
    if (btnInvites) btnInvites.className = "btn btn-sm btn-secondary";
    if (activityActions) activityActions.style.display = "block";
    if (inviteActions) inviteActions.style.display = "none";
    if (activityTable) activityTable.style.display = "block";
    if (inviteTable) inviteTable.style.display = "none";
    if (searchInput) {
      searchInput.placeholder = "Search by User ID / Name / Username...";
      searchInput.value = "";
    }
    loadUsers();
  } else {
    if (btnActivity) btnActivity.className = "btn btn-sm btn-secondary";
    if (btnInvites) btnInvites.className = "btn btn-sm btn-primary";
    if (activityActions) activityActions.style.display = "none";
    if (inviteActions) inviteActions.style.display = "flex";
    if (activityTable) activityTable.style.display = "none";
    if (inviteTable) inviteTable.style.display = "block";
    if (searchInput) {
      searchInput.placeholder = "Search by Player / User ID / Name / Username...";
      searchInput.value = "";
    }
    loadInviteUsersList();
  }
}

// Users management list (Activity Tab)
async function loadUsers() {
  try {
    const res = await fetch("/api/admin/users", {
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (res.ok) {
      allUsers = await res.json();
      renderUsersTable(allUsers);
    }
  } catch (e) {
    console.error("Load users failed:", e);
  }
}

function renderUsersTable(usersList) {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (usersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">No matching user data found</td></tr>`;
    return;
  }

  usersList.forEach(user => {
    const tr = document.createElement("tr");
    const name = `${user.first_name} ${user.last_name || ""}`.trim();
    const chatId = user.chat_id || 0;
    tr.innerHTML = `
      <td>${chatId}</td>
      <td>${user.user_id}</td>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td>${user.username ? "@" + escapeHtml(user.username) : "-"}</td>
      <td>Level ${user.level}</td>
      <td>${user.weekly_xp} XP</td>
      <td>${user.total_xp} XP</td>
      <td>
        <button class="btn btn-secondary btn-xs" style="margin-right: 6px;" onclick="openEditModal(${chatId}, ${user.user_id})">Edit</button>
        <button class="btn btn-danger btn-xs" onclick="confirmDeleteUser(${chatId}, ${user.user_id})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}


// =============================================================
// COMMUNITY GOVERNANCE & MEMBER MANAGEMENT (RESTORED)
// =============================================================

function searchUsers() {
  const query = document.getElementById("user-search").value.toLowerCase().trim();
  if (currentUserManagementTab === "invites") {
    if (!query) {
      renderInviteUsersTable(allInviteUsers);
      return;
    }
    const filtered = allInviteUsers.filter(u => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
      const uname = (u.username || "").toLowerCase();
      const acc = (u.account_name || "").toLowerCase();
      const g = String(u.guid);
      const uid = String(u.user_id || "");
      return name.includes(query) || uname.includes(query) || acc.includes(query) || g.includes(query) || uid.includes(query);
    });
    renderInviteUsersTable(filtered);
  } else {
    if (!query) {
      renderUsersTable(allUsers);
      return;
    }
    const filtered = allUsers.filter(user => {
      const fullName = `${user.first_name} ${user.last_name || ""}`.toLowerCase();
      const username = (user.username || "").toLowerCase();
      const id = String(user.user_id);
      return fullName.includes(query) || username.includes(query) || id.includes(query);
    });
    renderUsersTable(filtered);
  }
}

// User edit modal triggers (Activity XP)
function openEditModal(chatId, userId) {
  const user = allUsers.find(u => u.user_id === userId && (u.chat_id || 0) === chatId);
  if (!user) return;

  const name = `${user.first_name} ${user.last_name || ""}`.trim();
  document.getElementById("edit-user-id").value = user.user_id;
  document.getElementById("edit-chat-id").value = chatId;
  document.getElementById("edit-user-name").value = name;
  document.getElementById("edit-weekly-xp").value = user.weekly_xp;
  document.getElementById("edit-total-xp").value = user.total_xp;
  
  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("edit-modal").classList.add("hidden");
}

// Edit submit
document.getElementById("edit-user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const userId = parseInt(document.getElementById("edit-user-id").value, 10);
  const chatId = parseInt(document.getElementById("edit-chat-id").value, 10);
  const weeklyXp = parseInt(document.getElementById("edit-weekly-xp").value, 10);
  const totalXp = parseInt(document.getElementById("edit-total-xp").value, 10);

  try {
    const res = await fetch("/api/admin/users/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`
      },
      body: JSON.stringify({ chatId, userId, weeklyXp, totalXp })
    });
    if (res.ok) {
      alert("XP modified successfully");
      closeModal();
      loadUsers();
    } else {
      alert("Failed to save settings");
    }
  } catch (err) {
    console.error(err);
    alert("Failed to update user XP");
  }
});

// Delete user record
async function confirmDeleteUser(chatId, userId) {
  if (!confirm(`Are you sure you want to completely delete User ID: ${userId}'s activity data? This action cannot be undone.`)) return;
  try {
    const res = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`
      },
      body: JSON.stringify({ chatId, userId })
    });
    if (res.ok) {
      alert("User deleted successfully");
      loadUsers();
    } else {
      alert("Failed to delete user");
    }
  } catch (err) {
    console.error(err);
  }
}


// Toggle hide/unhide on leaderboard for a player (Single confirmation + Floating Toast)

async function confirmResetWeekly() {
  if (!confirm("⚠️ WARNING: This will reset the Weekly XP for ALL users to 0! Total XP will remain unchanged. Do you want to continue?")) return;
  if (!confirm("Please confirm again! This action cannot be undone.")) return;

  try {
    const res = await fetch("/api/admin/reset-weekly", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (res.ok) {
      alert("Weekly XP has been reset and archived successfully!");
      loadUsers();
    } else {
      alert("Reset failed");
    }
  } catch (err) {
    console.error(err);
  }
}

let currentHistoryTab = "active";


function switchHistoryTab(tab) {
  currentHistoryTab = tab;
  const selectContainer = document.getElementById("history-period-select-container");
  if (selectContainer) selectContainer.style.display = "flex";
  loadHistoryPeriods();
}

async function loadHistoryPeriods() {
  const select = document.getElementById("history-period-select");
  if (!select) return;

  select.innerHTML = '<option value="">Loading history cycles...</option>';

  try {
    const res = await fetch("/api/admin/history-periods", {
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (res.ok) {
      const data = await res.json();
      select.innerHTML = "";

      const liveOption = document.createElement("option");
      liveOption.value = "live";
      liveOption.textContent = "Current Live Cycle (Live XP)";
      select.appendChild(liveOption);

      const periods = data.periods || data || [];
      if (periods.length > 0) {
        periods.forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.period_date;
          opt.textContent = `Weekly Archive (${p.period_date})`;
          select.appendChild(opt);
        });
      }
      loadHistoryLeaderboard();
    } else {
      select.innerHTML = '<option value="live">Current Live Cycle</option>';
      loadHistoryLeaderboard();
    }
  } catch (err) {
    console.error("Failed to load history periods:", err);
    select.innerHTML = '<option value="live">Current Live Cycle</option>';
    loadHistoryLeaderboard();
  }
}

async function loadHistoryLeaderboard() {
  const select = document.getElementById("history-period-select");
  const periodVal = select ? select.value : "live";
  const tbody = document.getElementById("history-table-body");
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 20px;">Loading leaderboard data...</td></tr>';

  try {
    if (periodVal === "live") {
      const url = activeChatId ? `/api/leaderboard?period=weekly&chat_id=${activeChatId}` : "/api/leaderboard?period=weekly";
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      const list = data.leaderboard || [];
      tbody.innerHTML = "";

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 20px;">No activity records yet for current live cycle.</td></tr>';
        return;
      }

      list.forEach((u, idx) => {
        const tr = document.createElement("tr");
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "User";
        tr.innerHTML = `
          <td><strong>#${idx + 1}</strong></td>
          <td><strong>${escapeHtml(fullName)}</strong></td>
          <td>${u.username ? "@" + escapeHtml(u.username) : "-"}</td>
          <td><span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">Lv.${u.level || 1}</span></td>
          <td><strong>${(u.weekly_xp || 0).toLocaleString()} XP</strong></td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      const res = await fetch(`/api/admin/history-leaderboard?period_date=${periodVal}`, {
        headers: { "Authorization": `Bearer ${adminPassword}` }
      });
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      const list = data.history || [];
      tbody.innerHTML = "";

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 20px;">No historical records found for this period.</td></tr>';
        return;
      }

      list.forEach(u => {
        const tr = document.createElement("tr");
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "User";
        tr.innerHTML = `
          <td><strong>#${u.rank || "-"}</strong></td>
          <td><strong>${escapeHtml(fullName)}</strong></td>
          <td>${u.username ? "@" + escapeHtml(u.username) : "-"}</td>
          <td><span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">Lv.${u.level || 1}</span></td>
          <td><strong>${(u.weekly_xp || 0).toLocaleString()} XP</strong></td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("Load history leaderboard error:", err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error-color); padding: 20px;">Failed to load leaderboard data.</td></tr>';
  }
}

function toggleHistoryView() {
  const titleEl = document.getElementById("history-title");
  const btnEl = document.getElementById("btn-toggle-ban-list");
  const periodSelectContainer = document.getElementById("period-select-container");
  const thead = document.getElementById("history-table-header");

  if (historyViewState === "history") {
    historyViewState = "ban-list";
    if (titleEl) titleEl.textContent = "Banned Users List";
    btnEl.textContent = "Back to Leaderboard";
    btnEl.className = "btn btn-primary btn-sm";
    periodSelectContainer.style.display = "none";
    
    // Set table headers for Banned Users
    thead.innerHTML = `
      <tr>
        <th>User ID</th>
        <th>Name</th>
        <th>Username</th>
        <th>Banned By</th>
        <th>Banned At</th>
        <th>Actions</th>
      </tr>
    `;
    loadBannedUsersList();
  } else {
    historyViewState = "history";
    if (titleEl) titleEl.textContent = "Weekly Leaderboard History";
    btnEl.textContent = "Ban List (Removed from Leaderboard)";
    btnEl.className = "btn btn-warning btn-sm";
    periodSelectContainer.style.display = "flex";
    
    switchHistoryTab(currentHistoryTab);
  }
}

async function loadBannedUsersList() {
  const tbody = document.getElementById("history-table-body");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 20px;">Loading banned users list...</td></tr>`;

  try {
    const url = activeChatId ? `/api/admin/banned-users?chatId=${activeChatId}` : "/api/admin/banned-users";
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (res.ok) {
      const data = await res.json();
      tbody.innerHTML = "";
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 20px;">No banned users found in this community</td></tr>`;
        return;
      }

      data.forEach(user => {
        const tr = document.createElement("tr");
        const name = `${user.first_name} ${user.last_name || ""}`.trim();
        const bannedAtStr = formatLocalDateTime(user.banned_at);
        const escapedName = escapeHtml(name);
        const escapedAdmin = escapeHtml(user.banned_by_name || "System");
        tr.innerHTML = `
          <td>${user.user_id}</td>
          <td><strong>${escapedName}</strong></td>
          <td>${user.username ? "@" + escapeHtml(user.username) : "-"}</td>
          <td>${escapedAdmin}</td>
          <td>${bannedAtStr}</td>
          <td>
            <button class="btn btn-success btn-xs" onclick="restoreBannedUser(${user.chat_id}, ${user.user_id}, '${escapedName.replace(/'/g, "\\'")}')">Restore</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--error-color); padding: 20px;">Failed to load banned users list</td></tr>`;
    }
  } catch (e) {
    console.error("Load banned users list failed:", e);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--error-color); padding: 20px;">Error loading banned users list</td></tr>`;
  }
}

async function restoreBannedUser(chatId, userId, name) {
  if (!confirm(`Are you sure you want to restore user "${name}" (ID: ${userId})? This will remove them from the leaderboard exclusion list and restore their restrictions in the Telegram group.`)) return;

  try {
    const res = await fetch("/api/admin/banned-users/restore", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`
      },
      body: JSON.stringify({ chatId, userId })
    });
    if (res.ok) {
      alert(`User "${name}" has been successfully restored.`);
      loadBannedUsersList();
    } else {
      alert("Failed to restore user.");
    }
  } catch (err) {
    console.error(err);
    alert("Error restoring user.");
  }
}

// -------------------------------------------------------------
// BOT COMMANDS MANAGEMENT SCRIPTS
// -------------------------------------------------------------

async function loadCommands() {
  const tbody = document.getElementById("commands-table-body");
  tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 20px;">Loading commands...</td></tr>`;

  try {
    const res = await fetch("/api/admin/commands", {
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (res.ok) {
      const data = await res.json();
      tbody.innerHTML = "";
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 20px;">No commands configured</td></tr>`;
        return;
      }

      const actionLabels = {
        text: '📝 Text',
        rank: '🏆 Rank Card',
        leaderboard: '📈 Leaderboard',
        start: '👋 Start',
      };

      data.forEach(cmd => {
        const tr = document.createElement("tr");
        const actionLabel = actionLabels[cmd.action_type] || cmd.action_type;
        const typeLabel = `<span class="badge" style="background-color: #3498db; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${actionLabel}</span>`;
        const previewContent = escapeHtml(cmd.content.length > 80 ? cmd.content.substring(0, 80) + "..." : cmd.content);
        const cmdJson = JSON.stringify(cmd).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

        tr.innerHTML = `
          <td><strong>/${escapeHtml(cmd.trigger_name)}</strong></td>
          <td>${typeLabel}</td>
          <td style="font-family: monospace; white-space: pre-wrap; word-break: break-all;">${previewContent || '<em style="color:var(--text-secondary)">N/A</em>'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick='openCommandModal(${cmdJson})' style="margin-right: 5px;">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCommand('${escapeHtml(cmd.trigger_name)}')">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--error-color); padding: 20px;">Failed to load commands</td></tr>`;
    }
  } catch (e) {
    console.error("Load commands failed:", e);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--error-color); padding: 20px;">Error loading commands</td></tr>`;
  }
}

function openCommandModal(cmd) {
  const modal = document.getElementById("command-modal");
  const title = document.getElementById("command-modal-title");
  const triggerInput = document.getElementById("command-trigger");
  const contentInput = document.getElementById("command-content");
  const actionSelect = document.getElementById("command-action-type");

  modal.classList.remove("hidden");

  if (cmd) {
    title.innerText = `Edit Command: /${cmd.trigger_name}`;
    triggerInput.value = cmd.trigger_name;
    triggerInput.disabled = false;
    contentInput.value = cmd.content;
    actionSelect.value = cmd.action_type || "text";
  } else {
    title.innerText = "Add Custom Command";
    triggerInput.value = "";
    triggerInput.disabled = false;
    contentInput.value = "";
    actionSelect.value = "text";
  }
}

function closeCommandModal() {
  document.getElementById("command-modal").classList.add("hidden");
}

async function deleteCommand(triggerName) {
  if (!confirm(`Are you sure you want to delete the command /${triggerName}?`)) {
    return;
  }

  try {
    const res = await fetch("/api/admin/commands/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`
      },
      body: JSON.stringify({ trigger_name: triggerName })
    });

    if (res.ok) {
      loadCommands();
    } else {
      const err = await res.json();
      alert(`Failed to delete command: ${err.error || "Unknown error"}`);
    }
  } catch (e) {
    console.error("Delete command failed:", e);
    alert("Error deleting command, please check connection.");
  }
}

document.getElementById("command-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const triggerInput = document.getElementById("command-trigger");
  const contentInput = document.getElementById("command-content");
  
  const trigger_name = triggerInput.value;
  const content = contentInput.value;
  const action_type = document.getElementById("command-action-type").value;

  try {
    const res = await fetch("/api/admin/commands/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`
      },
      body: JSON.stringify({ trigger_name, content, action_type })
    });

    if (res.ok) {
      closeCommandModal();
      loadCommands();
    } else {
      const err = await res.json();
      alert(`Failed to save command: ${err.error || "Unknown error"}`);
    }
  } catch (e) {
    console.error("Save command failed:", e);
    alert("Error saving command, please check connection.");
  }
});

// [ignoring loop detection]
// -------------------------------------------------------
// SAFETY & ANTI-SPAM SECTION
// -------------------------------------------------------

// -------------------------------------------------------
// GROUP CAPTCHA & WELCOME SECTION
// -------------------------------------------------------

function parseTgLinkOrHandle(val) {
  let str = (val || "").trim();
  if (!str) return { chatId: "", topicId: null };

  // Case 1: https://t.me/c/1967420845/1 or t.me/c/1967420845/1
  const cMatch = str.match(/(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/c\/(\d+)(?:\/(\d+))?/i);
  if (cMatch) {
    const rawId = cMatch[1];
    const chatId = (rawId.length >= 12 && rawId.startsWith("100")) ? `-${rawId}` : `-100${rawId}`;
    const topicId = cMatch[2] ? parseInt(cMatch[2], 10) : null;
    return { chatId, topicId };
  }

  // Case 2: https://t.me/testdrawlevel2000/1 or t.me/testdrawlevel2000
  const linkMatch = str.match(/(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)(?:\/(\d+))?/i);
  if (linkMatch) {
    const username = linkMatch[1];
    const topicId = linkMatch[2] ? parseInt(linkMatch[2], 10) : null;
    return { chatId: username, topicId };
  }

  // Case 3: Pure number: -1001967420845
  if (/^-?\d+$/.test(str)) {
    return { chatId: str, topicId: null };
  }

  // Case 4: @username or username
  const cleanUsername = str.replace(/^@/, "").trim();
  return { chatId: cleanUsername, topicId: null };
}

function renderCaptchaCommunities(communities) {
  const container = document.getElementById("captcha-communities-list");
  if (!container) return;
  container.innerHTML = "";
  if (!communities || communities.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; margin: 5px 0;">No specific group/topic configured. Captcha will operate across all active groups in default topics.</p>';
    return;
  }
  communities.forEach(c => {
    addCaptchaCommunityRow(c.chat_id, c.topic_id !== null && c.topic_id !== undefined ? c.topic_id : "");
  });
}
window.renderCaptchaCommunities = renderCaptchaCommunities;

function addCaptchaCommunityRow(chatId = "", topicId = "") {
  const container = document.getElementById("captcha-communities-list");
  if (!container) return;
  const placeholder = container.querySelector("p");
  if (placeholder) placeholder.remove();

  const row = document.createElement("div");
  row.style.cssText = "display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);";
  row.innerHTML = `
    <div style="flex: 1.5; min-width: 220px; display: flex; flex-direction: column; gap: 4px;">
      <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Group (ID / @Username / Link)</span>
      <input type="text" class="captcha-community-chat-id" value="${chatId}" placeholder="e.g. -100..., @testdraw, or https://t.me/..." style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
    </div>
    <div style="flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 4px;">
      <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Designated Topic ID (empty = default)</span>
      <input type="number" class="captcha-community-topic-id" value="${topicId}" placeholder="38979" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-family: inherit;" />
    </div>
    <div style="display: flex; align-items: flex-end; height: 100%; margin-top: 18px;">
      <button type="button" class="btn btn-danger btn-xs" onclick="this.parentElement.parentElement.remove()" style="padding: 8px 12px;">Remove</button>
    </div>
  `;

  const chatInput = row.querySelector(".captcha-community-chat-id");
  const topicInput = row.querySelector(".captcha-community-topic-id");

  function autoExtractLink() {
    const raw = chatInput.value.trim();
    if (!raw) return;
    const parsed = parseTgLinkOrHandle(raw);
    if (parsed.chatId && parsed.chatId !== raw && (raw.includes("/") || raw.startsWith("@"))) {
      chatInput.value = parsed.chatId;
    }
    if (parsed.topicId !== null && (!topicInput.value || topicInput.value.trim() === "")) {
      topicInput.value = parsed.topicId;
    }
  }

  chatInput.addEventListener("input", autoExtractLink);
  chatInput.addEventListener("change", autoExtractLink);

  container.appendChild(row);
}
window.addCaptchaCommunityRow = addCaptchaCommunityRow;

const captchaForm = document.getElementById("captcha-settings-form");
if (captchaForm) {
  captchaForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Parse captcha communities
    const chatIdInputs = document.querySelectorAll(".captcha-community-chat-id");
    const topicIdInputs = document.querySelectorAll(".captcha-community-topic-id");
    const captchaCommunities = [];

    chatIdInputs.forEach((input, idx) => {
      const rawVal = input.value.trim();
      if (!rawVal) return;

      const topicInput = topicIdInputs[idx];
      let topicVal = topicInput && topicInput.value.trim() !== "" ? parseInt(topicInput.value.trim(), 10) : null;

      const parsed = parseTgLinkOrHandle(rawVal);
      const finalChatId = parsed.chatId || rawVal;
      if (topicVal === null && parsed.topicId !== null) {
        topicVal = parsed.topicId;
      }

      captchaCommunities.push({
        chat_id: /^-?\d+$/.test(finalChatId) ? parseInt(finalChatId, 10) : finalChatId,
        topic_id: !isNaN(topicVal) && topicVal !== null ? topicVal : null
      });
    });

    const settings = {
      welcome_enabled: document.getElementById("welcome_enabled") ? document.getElementById("welcome_enabled").checked : false,
      welcome_delete_delay_mins: document.getElementById("welcome_delete_delay_mins") ? (parseInt(document.getElementById("welcome_delete_delay_mins").value, 10) || 0) : 0,
      welcome_message: document.getElementById("welcome_message") ? document.getElementById("welcome_message").value.trim() : "",
      captcha_communities: captchaCommunities,

      captcha_enabled: document.getElementById("captcha_enabled").checked,
      captcha_type: document.getElementById("captcha_type").value,
      captcha_timeout_seconds: parseInt(document.getElementById("captcha_timeout_seconds").value, 10) || 180,
      captcha_failed_action: document.getElementById("captcha_failed_action").value,
      captcha_welcome_msg_math: document.getElementById("captcha_welcome_msg_math").value.trim(),
      captcha_welcome_msg_text: document.getElementById("captcha_welcome_msg_text").value.trim(),
      captcha_welcome_msg_click: document.getElementById("captcha_welcome_msg_click").value.trim(),
      captcha_button_text: document.getElementById("captcha_button_text").value.trim(),
      captcha_success_msg: document.getElementById("captcha_success_msg").value.trim(),
      captcha_fail_msg: document.getElementById("captcha_fail_msg").value.trim(),
      captcha_alert_other_user: document.getElementById("captcha_alert_other_user").value.trim(),
      captcha_alert_expired: document.getElementById("captcha_alert_expired").value.trim(),
      captcha_alert_attempt1_fail: document.getElementById("captcha_alert_attempt1_fail").value.trim(),
      captcha_alert_final_fail: document.getElementById("captcha_alert_final_fail").value.trim(),
      captcha_alert_success: document.getElementById("captcha_alert_success").value.trim(),
    };
    await saveSettings(settings, "Captcha & Welcome configuration saved successfully!");
  });
}

document.getElementById("spam-settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const settings = {

    link_intercept_enabled: document.getElementById("link_intercept_enabled").checked,
    whitelist_domains: document.getElementById("whitelist_domains").value.split("\n").map(s => s.trim()).filter(Boolean),
    ignored_spam_topic_ids: document.getElementById("ignored_spam_topic_ids").value.split(/[\n,]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
    
    rtlo_auto_ban: document.getElementById("rtlo_auto_ban").checked,
    rtlo_action: document.getElementById("rtlo_action").value,
    rtlo_mute_duration: parseInt(document.getElementById("rtlo_mute_duration").value, 10) || 0,

    new_user_link_auto_ban: document.getElementById("new_user_link_auto_ban").checked,
    new_user_link_action: document.getElementById("new_user_link_action").value,
    new_user_link_mute_duration: parseInt(document.getElementById("new_user_link_mute_duration").value, 10) || 0,

    cas_api_enabled: document.getElementById("cas_api_enabled").checked,
    cas_action: document.getElementById("cas_action").value,
    cas_mute_duration: parseInt(document.getElementById("cas_mute_duration").value, 10) || 0,

    block_inline_keyboards: document.getElementById("block_inline_keyboards").checked,
    block_inline_keyboards_action: document.getElementById("block_inline_keyboards_action").value,
    block_inline_keyboards_mute_duration: parseInt(document.getElementById("block_inline_keyboards_mute_duration").value, 10) || 0,

    block_inline_bots: document.getElementById("block_inline_bots").checked,
    block_inline_bots_action: document.getElementById("block_inline_bots_action").value,
    block_inline_bots_mute_duration: parseInt(document.getElementById("block_inline_bots_mute_duration").value, 10) || 0,

    allowed_inline_bots: document.getElementById("allowed_inline_bots").value.split(",").map(s => s.trim()).filter(Boolean),
    
    keyword_auto_ban: document.getElementById("keyword_auto_ban").checked,
    keyword_action: document.getElementById("keyword_action").value,
    keyword_mute_duration: parseInt(document.getElementById("keyword_mute_duration").value, 10) || 0,
    
    spam_keywords: document.getElementById("spam_keywords").value.split(",").map(s => s.trim()).filter(Boolean),
    
    flood_threshold_messages: parseInt(document.getElementById("flood_threshold_messages").value, 10) || 5,
    flood_threshold_seconds: parseInt(document.getElementById("flood_threshold_seconds").value, 10) || 3,
    flood_mute_duration: parseInt(document.getElementById("flood_mute_duration").value, 10) || 0,

    emoji_auto_ban: document.getElementById("emoji_auto_ban").checked,
    emoji_threshold: parseInt(document.getElementById("emoji_threshold").value, 10) || 10,
    emoji_action: document.getElementById("emoji_action").value,
    emoji_mute_duration: parseInt(document.getElementById("emoji_mute_duration").value, 10) || 0
  };
  await saveSettings(settings, "Safety & Anti-Spam settings saved successfully!");
});

async function loadSpamLogs() {
  try {
    const res = await fetch("/api/admin/spam-logs?limit=50", {
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (!res.ok) throw new Error("Failed to load logs");
    const logs = await res.json();
    renderSpamLogs(logs);
  } catch (err) {
    console.error("Error loading spam logs:", err);
  }
}

function renderSpamLogs(logs) {
  const tbody = document.getElementById("spam-table-body");
  tbody.innerHTML = "";
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No spam logs found.</td></tr>';
    return;
  }
  logs.forEach(log => {
    const tr = document.createElement("tr");
    const dateStr = formatLocalDateTime(log.created_at);
    
    const usernameText = log.username ? `@${log.username}` : "";
    const nameText = `${log.first_name} ${log.last_name || ""}`.trim();
    const userDetail = `<strong>${escapeHtml(nameText)}</strong><br/><span style="font-size:0.8rem; color:var(--text-secondary);">${usernameText} (ID: ${log.user_id})</span>`;

    let statusClass = "status-pending";
    if (log.status === "auto_banned") statusClass = "status-banned";
    if (log.status === "banned") statusClass = "status-banned";
    if (log.status === "muted") statusClass = "status-muted";
    if (log.status === "dismissed") statusClass = "status-dismissed";

    const statusTag = `<span class="status-tag ${statusClass}">${log.status.toUpperCase()}</span>`;

    let actions = "";
    if (log.status === "pending" || log.status === "muted") {
      actions += `<button class="btn btn-danger btn-xs" onclick="executeSpamAction(${log.id}, 'ban')" style="margin-right: 5px;">Ban</button>`;
    }
    if (log.status === "pending") {
      actions += `<button class="btn btn-warning btn-xs" onclick="executeSpamAction(${log.id}, 'mute')" style="margin-right: 5px;">Mute</button>`;
    }
    if (log.status === "pending" || log.status === "muted" || log.status === "banned" || log.status === "auto_banned") {
      actions += `<button class="btn btn-secondary btn-xs" onclick="executeSpamAction(${log.id}, 'dismiss')">Dismiss</button>`;
    }
    if (!actions) {
      actions = `<span style="color:var(--text-secondary); font-size:0.85rem;">No action needed</span>`;
    }

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${userDetail}</td>
      <td>${escapeHtml(log.reason)}</td>
      <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.evidence || "")}">${escapeHtml(log.evidence || "")}</td>
      <td>${statusTag}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function executeSpamAction(logId, action) {
  let duration = 0;
  if (action === "mute") {
    const durationStr = prompt("Enter mute duration in minutes (e.g. 10, 60, 1440 for 1 day, or leave empty/0 for permanent):", "60");
    if (durationStr === null) return; // cancelled
    duration = parseInt(durationStr.trim(), 10) || 0;
  } else {
    if (!confirm(`Are you sure you want to perform "${action}" on this user?`)) return;
  }
  
  try {
    const res = await fetch("/api/admin/spam/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`
      },
      body: JSON.stringify({ logId, action, duration })
    });
    if (res.ok) {
      alert(`Action "${action}" completed successfully.`);
      loadSpamLogs();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to complete action.");
    }
  } catch (err) {
    console.error(err);
    alert("Network error, please try again.");
  }
}

// Rules Modal Handlers
function openRulesModal() {
  document.getElementById("rules-modal").classList.remove("hidden");
}
function closeRulesModal() {
  document.getElementById("rules-modal").classList.add("hidden");
}

// Recent Actions (Admin Logs) Handlers
async function loadAdminLogs(forceRefresh = false) {
  const warningEl = document.getElementById("admin-logs-warning");
  const containerEl = document.getElementById("admin-logs-table-container");
  const selectEl = document.getElementById("admin-logs-chat-select");
  const chatId = selectEl ? selectEl.value : "";
  const tbody = document.getElementById("admin-logs-table-body");
  const refreshBtn = document.querySelector("#section-admin-logs button.btn-secondary");

  if (forceRefresh) {
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 20px;">🔄 Syncing recent administrative actions from Telegram... Please wait...</td></tr>';
    }
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '🔄 Syncing...';
    }
  }

  try {
    const url = `/api/admin/admin-logs?chatId=${chatId}&limit=100${forceRefresh ? '&refresh=true' : ''}`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${adminPassword}` }
    });
    if (!res.ok) throw new Error("Failed to load admin logs");
    
    const data = await res.json();
    if (data.configured === false) {
      if (warningEl) warningEl.style.display = "block";
      if (containerEl) containerEl.style.display = "none";
    } else {
      if (warningEl) warningEl.style.display = "none";
      if (containerEl) containerEl.style.display = "block";
      renderAdminLogs(data.logs);
    }
  } catch (err) {
    console.error("Error loading admin logs:", err);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '🔄 Refresh Logs';
    }
  }
}

// Store logs in memory for detail lookup
let adminLogsCache = [];

function renderAdminLogs(logs) {
  const tbody = document.getElementById("admin-logs-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  adminLogsCache = logs || [];
  
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 20px;">No administrative logs found.</td></tr>';
    return;
  }

  logs.forEach((log, index) => {
    const tr = document.createElement("tr");
    const dateStr = formatLocalDateTime(log.date * 1000);
    
    // Display ID (YYYYMMDDNNNN format)
    const displayId = log.display_id || log.event_id;
    
    // Operator name (already resolved by backend)
    const operatorDisplay = escapeHtml(log.operator_name || `ID: ${log.user_id}`);

    // Action type tag with color coding (6 Action Types)
    let actionTag = "";
    if (log.action_type === "Banned" || log.action_type === "Ban") {
      actionTag = `<span class="status-tag" style="background: rgba(244, 67, 54, 0.12); color: #f44336; border: 1px solid rgba(244, 67, 54, 0.25); font-weight: 600;">${escapeHtml(log.action_type)}</span>`;
    } else if (log.action_type === "Delete") {
      actionTag = `<span class="status-tag" style="background: rgba(255, 152, 0, 0.12); color: #ff9800; border: 1px solid rgba(255, 152, 0, 0.25); font-weight: 600;">Delete</span>`;
    } else if (log.action_type === "Mute") {
      actionTag = `<span class="status-tag" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); font-weight: 600;">Mute</span>`;
    } else if (log.action_type === "Unmute") {
      actionTag = `<span class="status-tag" style="background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); font-weight: 600;">Unmute</span>`;
    } else if (log.action_type === "Unban") {
      actionTag = `<span class="status-tag" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 600;">Unban</span>`;
    } else {
      actionTag = `<span class="status-tag status-pending">${escapeHtml(log.action_type)}</span>`;
    }

    tr.innerHTML = `
      <td style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(String(displayId))}</td>
      <td>${dateStr}</td>
      <td>${operatorDisplay}</td>
      <td>${actionTag}</td>
      <td>
        <button class="btn btn-secondary btn-xs" onclick="showLogDetails(${index})">👁️ View</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function showLogDetails(index) {
  const log = adminLogsCache[index];
  if (!log) return;

  const modal = document.getElementById("log-details-modal");
  const body = document.getElementById("log-details-body");
  if (!modal || !body) return;

  const dateStr = formatLocalDateTime(log.date * 1000);
  let html = "";

  const fieldStyle = "padding: 8px 12px; border-bottom: 1px solid var(--border-color);";
  const labelStyle = "color: var(--text-secondary); font-size: 0.85rem; display: block; margin-bottom: 2px;";
  const valueStyle = "font-weight: 600;";

  html += `<div style="${fieldStyle}"><span style="${labelStyle}">Event ID</span><span style="${valueStyle}">${escapeHtml(String(log.display_id || log.event_id))}</span></div>`;
  html += `<div style="${fieldStyle}"><span style="${labelStyle}">Time</span><span style="${valueStyle}">${dateStr}</span></div>`;
  html += `<div style="${fieldStyle}"><span style="${labelStyle}">Operator</span><span style="${valueStyle}">${escapeHtml(log.operator_name || `ID: ${log.user_id}`)}</span></div>`;
  html += `<div style="${fieldStyle}"><span style="${labelStyle}">Action Type</span><span style="${valueStyle}">${escapeHtml(log.action_type)}</span></div>`;

  if (log.target_name) {
    html += `<div style="${fieldStyle}"><span style="${labelStyle}">Target User</span><span style="${valueStyle}">${escapeHtml(log.target_name)}</span></div>`;
  }

  if (log.action_type === "Delete" && log.message_content) {
    html += `<div style="${fieldStyle}"><span style="${labelStyle}">Deleted Message</span><div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-top: 4px; font-family: inherit; font-size: 0.9rem; white-space: pre-wrap; word-break: break-all; border: 1px solid var(--border-color);">${escapeHtml(log.message_content)}</div></div>`;
  }

  if (log.ban_reason) {
    let reasonLabel = "Ban Reason";
    if (log.action_type === "Mute") reasonLabel = "Mute Duration / Reason";
    else if (log.action_type === "Unmute") reasonLabel = "Unmute Details";
    else if (log.action_type === "Unban") reasonLabel = "Unban Details";
    else if (log.action_type === "Ban") reasonLabel = "Ban Reason";
    html += `<div style="${fieldStyle}"><span style="${labelStyle}">${reasonLabel}</span><span style="${valueStyle}">${escapeHtml(log.ban_reason)}</span></div>`;
  }

  body.innerHTML = html;
  modal.classList.remove("hidden");
}

function closeLogDetailsModal() {
  const modal = document.getElementById("log-details-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

// Module switching (Community vs Push Bot vs Device Tracking)


// Load invite users list (Invites Tab)

function toBjtInputString(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const find = (type) => parts.find(p => p.type === type)?.value || '';
  return `${find('year')}-${find('month')}-${find('day')}T${find('hour')}:${find('minute')}`;
}

const drawState = {
  engineEnabled: false,
  isToggling: false,
  cachedLotteries: [],
  currentFilter: 'ALL',
  searchQuery: '',
  botConfig: null
};

// Helper for authenticated requests to /api/draw
async function fetchDrawApi(endpoint, options = {}) {
  const token = adminPassword || sessionStorage.getItem("admin_password") || localStorage.getItem("admin_password") || "";
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const res = await fetch(`/api/draw${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Authentication required or session expired.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data;
}

// Floating Cyber Dark Toast Notification
function showToastNotification(message, type = 'show') {
  let container = document.getElementById('global-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: 420px;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'floating-toast-item';
  
  let bg = 'linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%)';
  let border = 'rgba(52, 211, 153, 0.4)';
  let shadow = '0 10px 25px -5px rgba(16, 185, 129, 0.4)';
  
  if (type === 'info') {
    bg = 'linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%)';
    border = 'rgba(96, 165, 250, 0.4)';
    shadow = '0 10px 25px -5px rgba(59, 130, 246, 0.4)';
  } else if (type === 'hide' || type === 'error') {
    bg = 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%)';
    border = 'rgba(248, 113, 113, 0.4)';
    shadow = '0 10px 25px -5px rgba(239, 68, 68, 0.4)';
  }

  toast.style.cssText = `
    background: ${bg};
    border: 1px solid ${border};
    box-shadow: ${shadow}, 0 4px 6px -2px rgba(0, 0, 0, 0.5);
    color: #ffffff;
    padding: 12px 18px;
    border-radius: 10px;
    font-size: 0.88rem;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.01em;
    pointer-events: auto;
    opacity: 0;
    transform: translateY(-12px) scale(0.96);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(8px);
    word-break: break-word;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px) scale(0.96)';
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 250);
  }, 3500);
}
window.showToastNotification = showToastNotification;

// Update Top Draw Engine Master Switch UI
function updateDrawEngineUI(enabled) {
  const drawMod = document.getElementById('module-draw');
  const badge = document.getElementById('draw-engine-status-badge');
  const toggleSwitch = document.getElementById('draw-engine-toggle-switch');
  const toggleLabel = document.getElementById('draw-engine-toggle-label');
  const shadowDoor = document.getElementById('draw-shadow-door');

  if (toggleSwitch) {
    toggleSwitch.checked = !!enabled;
    toggleSwitch.disabled = false;
  }
  if (toggleLabel) {
    toggleLabel.textContent = enabled ? '运行中' : '休眠';
    toggleLabel.style.color = enabled ? '#10b981' : '#94a3b8';
  }

  if (enabled) {
    if (drawMod) drawMod.classList.remove('draw-dormant-mode');
    if (shadowDoor) shadowDoor.classList.add('hidden');
    if (badge) {
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#34d399';
      badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      badge.textContent = 'Engine Active';
    }
  } else {
    if (drawMod) drawMod.classList.add('draw-dormant-mode');
    if (shadowDoor) shadowDoor.classList.remove('hidden');
    if (badge) {
      badge.style.background = 'rgba(100, 116, 139, 0.2)';
      badge.style.color = '#94a3b8';
      badge.style.border = '1px solid rgba(148, 163, 184, 0.3)';
      badge.textContent = 'Dormant (0 Memory)';
    }
  }
}

// Toggle Draw Engine Master Switch
async function toggleDrawEngineMasterSwitch(desiredState) {
  const toggleSwitch = document.getElementById('draw-engine-toggle-switch');
  const toggleLabel = document.getElementById('draw-engine-toggle-label');

  // Anti-shake / concurrency mutex protection: reject rapid duplicate clicks
  if (drawState.isToggling) return;
  drawState.isToggling = true;
  if (toggleSwitch) toggleSwitch.disabled = true;

  // If argument is boolean, use it; otherwise invert current drawState.engineEnabled
  const targetState = (typeof desiredState === 'boolean') ? desiredState : !drawState.engineEnabled;

  // Optimistic UI update: slider instantly glides to green/gray
  if (toggleSwitch) toggleSwitch.checked = targetState;
  if (toggleLabel) {
    toggleLabel.textContent = targetState ? '运行中' : '休眠';
    toggleLabel.style.color = targetState ? '#10b981' : '#94a3b8';
  }
  updateDrawEngineUI(targetState);

  try {
    const res = await fetchDrawApi('/status/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled: targetState })
    });
    drawState.engineEnabled = !!res.enabled;
    updateDrawEngineUI(res.enabled);
    if (res.enabled) {
      showToastNotification('⚡ 抽奖引擎已成功唤醒！自动开奖调度器已启动。', 'show');
      loadDrawModule();
    } else {
      showToastNotification('💤 抽奖引擎已进入休眠模式：0 内存占用。', 'info');
      updateDrawBotStatusUI(null);
    }
  } catch (err) {
    // Rollback switch state on error
    if (toggleSwitch) toggleSwitch.checked = !targetState;
    if (toggleLabel) {
      toggleLabel.textContent = !targetState ? '运行中' : '休眠';
      toggleLabel.style.color = !targetState ? '#10b981' : '#94a3b8';
    }
    updateDrawEngineUI(!targetState);
    showToastNotification('切换抽奖引擎状态失败: ' + err.message, 'hide');
  } finally {
    if (toggleSwitch) toggleSwitch.disabled = false;
    setTimeout(() => {
      drawState.isToggling = false;
    }, 250);
  }
}
window.toggleDrawEngineMasterSwitch = toggleDrawEngineMasterSwitch;
window.updateDrawEngineUI = updateDrawEngineUI;

// Load entire Draw Module
async function loadDrawModule() {
  try {
    // 0. Fetch Engine Status
    const statusData = await fetchDrawApi('/status').catch(() => ({ enabled: false }));
    drawState.engineEnabled = !!statusData.enabled;
    updateDrawEngineUI(statusData.enabled);
    const sw = document.getElementById("draw-engine-toggle-switch");
    if (sw) sw.disabled = false;

    // 1. Fetch Bot Config
    const configData = await fetchDrawApi('/config');
    drawState.botConfig = configData.connectedBot;
    updateDrawBotStatusUI(configData.connectedBot);

    // 2. Fetch Lotteries
    const lotteries = await fetchDrawApi('/lotteries');
    drawState.cachedLotteries = Array.isArray(lotteries) ? lotteries : [];

    // 3. Update KPI Metrics
    updateDrawKpiStats();

    // 4. Render Campaign Cards
    renderDrawCampaigns();
  } catch (err) {
    console.error('[DrawBot] Failed to load module:', err);
    const grid = document.getElementById('draw-campaigns-grid');
    if (grid) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--danger-color);">⚠️ Failed to load events: ${escapeHtml(err.message)}</div>`;
    }
  }
}

// Update Top Bot Connection Status Banner
function updateDrawBotStatusUI(bot) {
  const pill = document.getElementById('draw-bot-status-pill');
  const tokenInput = document.getElementById('draw-session-token-input');
  const connectBtn = document.getElementById('btn-draw-connect-token');
  const disconnectBtn = document.getElementById('btn-draw-disconnect-token');

  if (bot && bot.username) {
    if (pill) {
      pill.textContent = `Connected: @${bot.username}`;
      pill.style.background = 'rgba(16, 185, 129, 0.15)';
      pill.style.color = '#34d399';
      pill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }
    if (tokenInput) {
      tokenInput.value = '••••••••••••••••••••••••••••••••';
      tokenInput.disabled = true;
    }
    if (connectBtn) connectBtn.classList.add('hidden');
    if (disconnectBtn) disconnectBtn.classList.remove('hidden');
  } else {
    if (pill) {
      pill.textContent = 'Disconnected';
      pill.style.background = 'rgba(239, 68, 68, 0.15)';
      pill.style.color = '#f87171';
      pill.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }
    if (tokenInput) {
      tokenInput.value = '';
      tokenInput.disabled = false;
    }
    if (connectBtn) connectBtn.classList.remove('hidden');
    if (disconnectBtn) disconnectBtn.classList.add('hidden');
  }
}

// Save & Connect Bot Token
async function connectDrawSessionBot() {
  const tokenInput = document.getElementById('draw-session-token-input');
  const token = tokenInput ? tokenInput.value.trim() : '';
  if (!token) {
    alert('Please enter a valid Telegram Bot Token.');
    return;
  }

  const btn = document.getElementById('btn-draw-connect-token');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const res = await fetchDrawApi('/bot/connect', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    if (res.ok && res.bot) {
      drawState.botConfig = res.bot;
      updateDrawBotStatusUI(res.bot);
      alert(`🎉 Bot connected successfully as @${res.bot.username}!`);
    }
  } catch (err) {
    alert(`Failed to connect bot: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }
}

// Disconnect Bot
async function disconnectDrawSessionBot() {
  if (!confirm('Are you sure you want to disconnect the running bot session?')) return;
  try {
    await fetchDrawApi('/bot/disconnect', { method: 'POST' });
    drawState.botConfig = null;
    updateDrawBotStatusUI(null);
    alert('Bot session disconnected.');
  } catch (err) {
    alert(`Failed to disconnect: ${err.message}`);
  }
}

// Update KPI Stats Cards
function updateDrawKpiStats() {
  const total = drawState.cachedLotteries.length;
  const active = drawState.cachedLotteries.filter(l => l.status === 'ACTIVE').length;
  const draft = drawState.cachedLotteries.filter(l => l.status === 'DRAFT').length;
  
  let totalWinners = 0;
  drawState.cachedLotteries.forEach(l => {
    if (l.winners && Array.isArray(l.winners)) {
      totalWinners += l.winners.length;
    }
  });

  const elTotal = document.getElementById('draw-stat-total');
  const elActive = document.getElementById('draw-stat-active');
  const elDraft = document.getElementById('draw-stat-draft');
  const elWinners = document.getElementById('draw-stat-winners');

  if (elTotal) elTotal.textContent = total;
  if (elActive) elActive.textContent = active;
  if (elDraft) elDraft.textContent = draft;
  if (elWinners) elWinners.textContent = totalWinners;
}

// Filter and Search Helpers
function filterDrawCampaigns(status, btn) {
  drawState.currentFilter = status;
  const allFilterBtns = document.querySelectorAll('.btn-draw-filter');
  allFilterBtns.forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDrawCampaigns();
}

function onSearchDrawCampaigns() {
  const searchInput = document.getElementById('draw-search-input');
  drawState.searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
  renderDrawCampaigns();
}

// Render Campaign Cards
function renderDrawCampaigns() {
  const grid = document.getElementById('draw-campaigns-grid');
  if (!grid) return;

  let list = [...drawState.cachedLotteries];

  // Filter by status
  if (drawState.currentFilter !== 'ALL') {
    list = list.filter(l => l.status === drawState.currentFilter);
  }

  // Filter by search query
  if (drawState.searchQuery) {
    list = list.filter(l => 
      (l.internalName && l.internalName.toLowerCase().includes(drawState.searchQuery)) ||
      (l.targetChatId && l.targetChatId.toLowerCase().includes(drawState.searchQuery)) ||
      (l.description && l.description.toLowerCase().includes(drawState.searchQuery))
    );
  }

  if (list.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 14px;">
        <p style="margin: 0 0 12px 0; color: var(--text-secondary); font-size: 1rem;">No events found matching criteria.</p>
        <button type="button" class="btn btn-primary btn-sm" onclick="openCreateDrawModal()">➕ New Draw</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = list.map(l => {
    const isDraft = l.status === 'DRAFT';
    const isActive = l.status === 'ACTIVE';
    const isDrawing = l.status === 'DRAWING';
    const isEnded = l.status === 'ENDED';

    let badgeClass = 'badge-draft';
    if (isActive) badgeClass = 'badge-active';
    else if (isDrawing) badgeClass = 'badge-drawing';
    else if (isEnded) badgeClass = 'badge-ended';

    const partCount = (l.participants && l.participants.length) || 0;
    const winnerCount = (l.winners && l.winners.length) || 0;

    let prizeSummary = 'No prizes specified';
    if (l.prizes && l.prizes.length > 0) {
      prizeSummary = l.prizes.map(p => `${p.count}x ${escapeHtml(p.name)}`).join(', ');
    }

    const autoTimeDisplay = l.autoDrawTime ? l.autoDrawTime.replace('T', ' ') : (l.endTime ? l.endTime.replace('T', ' ') : 'Manual');

    return `
      <div class="draw-card">
        <div style="height: ${l.imageUrl ? '130px' : '42px'}; position: relative; overflow: hidden; background: linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%); display: flex; align-items: center; justify-content: flex-end; padding: 0 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          ${l.imageUrl ? `
            <img src="${escapeHtml(l.imageUrl)}" alt="cover" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.style.height='42px';" />
          ` : ''}
          <div style="position: relative; z-index: 2;">
            <span class="badge ${badgeClass}" style="padding: 3px 9px; border-radius: 6px; font-weight: 700; font-size: 11px; text-transform: uppercase; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${l.status}</span>
          </div>
        </div>

        <div style="padding: 18px; display: flex; flex-direction: column; flex: 1; gap: 12px;">
          <!-- Top Content Row: Title + Description on left, Copy as Template Button on top-right -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
            <div style="flex: 1; min-width: 0;">
              <h4 style="margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 700; color: #f8fafc; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.internalName)}">
                ${escapeHtml(l.internalName)}
              </h4>
              <p style="margin: 0; font-size: 0.84rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.45;">
                ${escapeHtml((l.description || 'No description provided.').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())}
              </p>
            </div>
            <button type="button" class="btn btn-secondary btn-xs" onclick="copyDrawCampaignAsTemplate('${l.id}')" title="复制此活动为新模板 (Copy as Template)" style="padding: 5px 9px; font-size: 0.78rem; font-weight: 600; white-space: nowrap; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(30, 41, 59, 0.85); color: #cbd5e1; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; flex-shrink: 0; transition: all 0.2s ease;">
              📋 复制
            </button>
          </div>

          <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 10px; font-size: 0.82rem; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Target Chat:</span>
              <span style="color: #38bdf8; font-family: var(--font-mono); font-weight: 600;">${escapeHtml(l.targetChatId)}${l.targetTopicId ? ` (T:${escapeHtml(l.targetTopicId)})` : ''}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Prizes:</span>
              <span style="color: #fbbf24; font-weight: 600; text-align: right; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">🎁 ${prizeSummary}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Participants:</span>
              <span style="color: #fff; font-weight: 600;">👥 ${partCount} joined</span>
            </div>
            ${l.drawMode === 'AUTO' || l.autoDrawTime ? `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-muted);">Auto Draw:</span>
                <span style="color: #a5b4fc; font-family: var(--font-mono); font-size: 0.78rem;">⏰ ${escapeHtml(autoTimeDisplay)}</span>
              </div>
            ` : ''}
            ${l.designatedWinners && l.designatedWinners.length > 0 ? `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-muted);">Designated:</span>
                <span style="color: #38bdf8; font-weight: 600; font-size: 0.78rem;">🎯 已预设 ${l.designatedWinners.length} 位中奖者</span>
              </div>
            ` : ''}
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; gap: 8px; margin-top: auto; padding-top: 6px; flex-wrap: wrap;">
            ${isDraft ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="openEditDrawModal('${l.id}')" style="flex: 1; padding: 7px 12px; font-weight: 600;">
                ✏️ Edit
              </button>
              <button type="button" class="btn btn-primary btn-sm" onclick="publishDrawCampaign('${l.id}')" style="flex: 1.5; padding: 7px 12px; font-weight: 700;">
                🚀 Publish
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="deleteDrawCampaign('${l.id}')" style="padding: 7px 10px; color: #f87171;" title="Delete">
                🗑️
              </button>
            ` : ''}

            ${isActive ? `
              <button type="button" class="btn btn-primary btn-sm" onclick="triggerDrawCampaign('${l.id}')" style="flex: 2; padding: 7px 14px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); font-weight: 700;">
                🎲 Draw Winners Now
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="deleteDrawCampaign('${l.id}')" style="padding: 7px 10px; color: #f87171;" title="Delete">
                🗑️
              </button>
            ` : ''}

            ${isEnded ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="openDrawWinnersModal('${l.id}')" style="flex: 1.5; padding: 7px 12px; font-weight: 600;">
                🏆 Winners (${winnerCount})
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="reannounceDrawWinners('${l.id}')" style="flex: 1.5; padding: 7px 10px; color: #38bdf8; font-weight: 600;" title="Re-broadcast announcement to Telegram">
                📢 Broadcast
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="deleteDrawCampaign('${l.id}')" style="padding: 7px 10px; color: #f87171;" title="Delete">
                🗑️
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Campaign Modal Logic (Create & Edit)
function openCreateDrawModal() {
  const modal = document.getElementById('modal-draw-campaign');
  const title = document.getElementById('modal-draw-campaign-title');
  const editIdInput = document.getElementById('draw-edit-id');
  const form = document.getElementById('form-draw-campaign');

  if (form) form.reset();
  if (editIdInput) editIdInput.value = '';
  if (title) title.textContent = 'New Event Draft';

  // Setup default 1 prize tier
  const prizeContainer = document.getElementById('draw-prize-rows-container');
  if (prizeContainer) {
    prizeContainer.innerHTML = '';
    addPrizeTierRow('100 USDT', 1);
  }

  toggleDrawModeFields();
  if (modal) modal.classList.remove('hidden');
  initDrawQuill();
  if (drawQuill) drawQuill.setText('');
}

function openEditDrawModal(id) {
  const lottery = drawState.cachedLotteries.find(l => l.id === id);
  if (!lottery) return;

  if (lottery.status !== 'DRAFT' || lottery.telegramMessageId) {
    alert('Only unpublished draft events can be edited.');
    return;
  }

  const modal = document.getElementById('modal-draw-campaign');
  const title = document.getElementById('modal-draw-campaign-title');
  const editIdInput = document.getElementById('draw-edit-id');

  if (title) title.textContent = 'Edit Event Draft';
  if (editIdInput) editIdInput.value = lottery.id;

  const fName = document.getElementById('draw-form-name');
  const fTargetChat = document.getElementById('draw-form-target-chat');
  const fTargetTopic = document.getElementById('draw-form-target-topic');
  const fDesc = document.getElementById('draw-form-desc');
  const fBtnText = document.getElementById('draw-form-button-text');
  const fImgUrl = document.getElementById('draw-form-image-url');
  const fMode = document.getElementById('draw-form-mode');
  const fAutoTime = document.getElementById('draw-form-autotime');
  const fReqChannel = document.getElementById('draw-form-req-channel');
  const fReqGroup = document.getElementById('draw-form-req-group');
  const fAllowedIds = document.getElementById('draw-form-allowed-ids');
  const fAnnouncement = document.getElementById('draw-form-announcement');

  if (fName) fName.value = lottery.internalName || '';
  if (fTargetChat) fTargetChat.value = lottery.targetChatId || '';
  if (fTargetTopic) fTargetTopic.value = lottery.targetTopicId || '';
  if (fDesc) fDesc.value = lottery.description || '';
  if (fBtnText) fBtnText.value = lottery.buttonText || '🎉 Join Lucky Draw';
  if (fImgUrl) fImgUrl.value = lottery.imageUrl || '';
  if (fMode) fMode.value = lottery.drawMode || 'MANUAL';
  if (fAutoTime) fAutoTime.value = lottery.autoDrawTime || '';
  if (fReqChannel) fReqChannel.value = lottery.requiredChannelId || '';
  if (fReqGroup) fReqGroup.value = lottery.requiredGroupId || '';
  if (fAllowedIds) fAllowedIds.value = (lottery.allowedChatIds || []).join(', ');
  if (fAnnouncement) fAnnouncement.value = lottery.announcementTemplate || '';

  // Render prizes
  const prizeContainer = document.getElementById('draw-prize-rows-container');
  if (prizeContainer) {
    prizeContainer.innerHTML = '';
    if (lottery.prizes && lottery.prizes.length > 0) {
      lottery.prizes.forEach(p => addPrizeTierRow(p.name, p.count));
    } else {
      addPrizeTierRow('100 USDT', 1);
    }
  }

  toggleDrawModeFields();
  if (modal) modal.classList.remove('hidden');
  initDrawQuill();
  if (drawQuill) {
    if (lottery.description) {
      drawQuill.root.innerHTML = lottery.description;
    } else {
      drawQuill.setText('');
    }
  }
}

// Copy existing campaign as a new draft template
function copyDrawCampaignAsTemplate(id) {
  const lottery = drawState.cachedLotteries.find(l => l.id === id);
  if (!lottery) return;

  const modal = document.getElementById('modal-draw-campaign');
  const title = document.getElementById('modal-draw-campaign-title');
  const editIdInput = document.getElementById('draw-edit-id');
  const form = document.getElementById('form-draw-campaign');

  if (form) form.reset();
  if (editIdInput) editIdInput.value = ''; // Empty ID ensures saving creates a brand new event draft
  if (title) title.textContent = `New Event Draft (Copied from ${lottery.internalName})`;

  const fName = document.getElementById('draw-form-name');
  const fTargetChat = document.getElementById('draw-form-target-chat');
  const fTargetTopic = document.getElementById('draw-form-target-topic');
  const fDesc = document.getElementById('draw-form-desc');
  const fBtnText = document.getElementById('draw-form-button-text');
  const fImgUrl = document.getElementById('draw-form-image-url');
  const fMode = document.getElementById('draw-form-mode');
  const fAutoTime = document.getElementById('draw-form-autotime');
  const fReqChannel = document.getElementById('draw-form-req-channel');
  const fReqGroup = document.getElementById('draw-form-req-group');
  const fAllowedIds = document.getElementById('draw-form-allowed-ids');
  const fAnnouncement = document.getElementById('draw-form-announcement');

  if (fName) fName.value = `${lottery.internalName} (Copy)`;
  if (fTargetChat) fTargetChat.value = lottery.targetChatId || '';
  if (fTargetTopic) fTargetTopic.value = lottery.targetTopicId || '';
  if (fBtnText) fBtnText.value = lottery.buttonText || '🎉 Join Lucky Draw';
  if (fImgUrl) fImgUrl.value = lottery.imageUrl || '';
  if (fMode) fMode.value = lottery.drawMode || 'MANUAL';
  if (fAutoTime) fAutoTime.value = ''; // Reset schedule time for copied template
  if (fReqChannel) fReqChannel.value = lottery.requiredChannelId || '';
  if (fReqGroup) fReqGroup.value = lottery.requiredGroupId || '';
  if (fAllowedIds) fAllowedIds.value = (lottery.allowedChatIds || []).join(', ');
  if (fAnnouncement) fAnnouncement.value = lottery.announcementTemplate || '';

  // Initialize Quill editor and prefill description
  initDrawQuill();
  if (drawQuill) {
    if (lottery.description) {
      drawQuill.root.innerHTML = lottery.description;
    } else {
      drawQuill.setText('');
    }
  }
  if (fDesc) fDesc.value = lottery.description || '';

  // Render cloned prizes
  const prizeContainer = document.getElementById('draw-prize-rows-container');
  if (prizeContainer) {
    prizeContainer.innerHTML = '';
    if (lottery.prizes && lottery.prizes.length > 0) {
      lottery.prizes.forEach(p => addPrizeTierRow(p.name, p.count));
    } else {
      addPrizeTierRow('100 USDT', 1);
    }
  }

  toggleDrawModeFields();
  if (modal) modal.classList.remove('hidden');
}
window.copyDrawCampaignAsTemplate = copyDrawCampaignAsTemplate;

function closeDrawCampaignModal() {
  const modal = document.getElementById('modal-draw-campaign');
  if (modal) modal.classList.add('hidden');
}

function toggleDrawModeFields() {
  const modeSelect = document.getElementById('draw-form-mode');
  const autoWrap = document.getElementById('draw-form-autotime-wrap');
  if (modeSelect && autoWrap) {
    if (modeSelect.value === 'AUTO') {
      autoWrap.classList.remove('hidden');
      updateDrawFormClock();
    } else {
      autoWrap.classList.add('hidden');
    }
  }
}

function updateDrawFormClock() {
  const clockEl = document.getElementById('draw-form-bjt-clock');
  if (clockEl) {
    clockEl.textContent = `当前北京: ${formatBjtDisplay(new Date())}`;
  }
}

function addPrizeTierRow(name = '', count = 1) {
  const container = document.getElementById('draw-prize-rows-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'draw-prize-row';
  row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
  row.innerHTML = `
    <input type="text" placeholder="Prize Name (e.g. VIP Subscription)" value="${escapeHtml(name)}" class="draw-prize-name input-text" style="flex: 2; padding: 8px 12px; border-radius: 6px; border: 1px solid #334155; background: #0b1120; color: #fff; font-size: 0.85rem;" required />
    <input type="number" min="1" placeholder="Count" value="${count}" class="draw-prize-count input-text" style="width: 80px; padding: 8px 12px; border-radius: 6px; border: 1px solid #334155; background: #0b1120; color: #fff; font-size: 0.85rem; text-align: center;" required />
    <button type="button" class="btn btn-secondary btn-xs" onclick="removePrizeTierRow(this)" style="padding: 7px 10px; color: #f87171;">&times;</button>
  `;
  container.appendChild(row);
}

function removePrizeTierRow(btn) {
  const container = document.getElementById('draw-prize-rows-container');
  if (container && container.children.length > 1) {
    btn.parentElement.remove();
  } else {
    alert('At least one prize tier is required.');
  }
}

// Save Campaign Draft
async function handleSaveDrawCampaign(event) {
  event.preventDefault();

  const editId = document.getElementById('draw-edit-id')?.value || '';
  const internalName = document.getElementById('draw-form-name')?.value.trim();
  const targetChatId = document.getElementById('draw-form-target-chat')?.value.trim();
  const targetTopicId = document.getElementById('draw-form-target-topic')?.value.trim() || undefined;
  let description = '';
  if (drawQuill) {
    const textOnly = drawQuill.getText().trim();
    if (textOnly) {
      description = drawQuill.root.innerHTML.trim();
    }
  } else {
    description = document.getElementById('draw-form-desc')?.value.trim() || '';
  }
  const buttonText = document.getElementById('draw-form-button-text')?.value.trim() || '🎉 Join Lucky Draw';
  const imageUrl = document.getElementById('draw-form-image-url')?.value.trim() || undefined;
  const drawMode = document.getElementById('draw-form-mode')?.value || 'MANUAL';
  const rawAutoTime = document.getElementById('draw-form-autotime')?.value;
    const autoDrawTime = rawAutoTime ? toBjtIsoString(rawAutoTime) : undefined;
  const cleanLinkOrId = (val) => {
    if (!val || !val.trim()) return undefined;
    let clean = val.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^t\.me\//i, '').trim();
    if (!clean.startsWith('@') && !clean.startsWith('-') && !/^-?\d+$/.test(clean)) {
      clean = '@' + clean;
    }
    return clean;
  };
  const requiredChannelId = cleanLinkOrId(document.getElementById('draw-form-req-channel')?.value);
  const requiredGroupId = cleanLinkOrId(document.getElementById('draw-form-req-group')?.value);
  const announcementTemplate = document.getElementById('draw-form-announcement')?.value.trim() || undefined;

  const allowedStr = document.getElementById('draw-form-allowed-ids')?.value || '';
  const allowedChatIds = allowedStr.split(',').map(s => s.trim()).filter(Boolean);

  // Collect prizes
  const prizeRows = document.querySelectorAll('.draw-prize-row');
  const prizes = [];
  prizeRows.forEach((row, idx) => {
    const pName = row.querySelector('.draw-prize-name')?.value.trim();
    const pCount = parseInt(row.querySelector('.draw-prize-count')?.value || '1', 10);
    if (pName) {
      prizes.push({ id: String(idx + 1), name: pName, count: pCount });
    }
  });

  if (prizes.length === 0) {
    alert('Please specify at least one prize tier.');
    return;
  }

  if (drawMode === 'AUTO') {
    if (!autoDrawTime) {
      alert('⚠️ 请设置自动开奖时间 (UTC+8)！');
      return;
    }
    const autoDrawMs = new Date(autoDrawTime).getTime();
    if (isNaN(autoDrawMs)) {
      alert('⚠️ 自动开奖时间格式无效，请重新选择！');
      return;
    }
    if (autoDrawMs <= Date.now()) {
      alert(`⚠️ 自动开奖时间不能早于当前时间！\n\n当前北京时间: ${formatBjtDisplay(new Date())}\n所选开奖时间: ${formatBjtDisplay(autoDrawTime)}\n\n请设置未来的开奖时间。`);
      return;
    }
  }

  const payload = {
    id: editId || undefined,
    internalName,
    targetChatId,
    targetTopicId,
    description,
    buttonText,
    imageUrl,
    drawMode,
    autoDrawTime: drawMode === 'AUTO' ? autoDrawTime : undefined,
    requiredChannelId,
    requiredGroupId,
    allowedChatIds,
    announcementTemplate,
    prizes,
    status: 'DRAFT'
  };

  const btn = document.getElementById('btn-save-draw-campaign');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const res = await fetchDrawApi('/lotteries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeDrawCampaignModal();
      await loadDrawModule();
      alert('Event draft saved successfully!');
    }
  } catch (err) {
    alert(`Failed to save draft: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 Save Event Draft';
    }
  }
}

// Publish Campaign
async function publishDrawCampaign(id) {
  if (!confirm('Are you sure you want to publish this event to Telegram?')) return;

  // Interlock check: Is draw engine currently dormant?
  if (!drawState.engineEnabled) {
    const autoWake = confirm('⚠️ 抽奖引擎当前处于休眠状态（后台自动开奖调度器已停用）。\n\n发布活动后需要引擎处于运行状态才能自动结算与推送。\n\n是否立即一键唤醒抽奖引擎并发布活动？');
    if (!autoWake) return;
    try {
      const wakeRes = await fetchDrawApi('/status/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: true })
      });
      drawState.engineEnabled = !!wakeRes.enabled;
      updateDrawEngineUI(wakeRes.enabled);
      showToastNotification('⚡ 抽奖引擎已自动唤醒！', 'show');
    } catch (e) {
      alert('唤醒抽奖引擎失败: ' + e.message);
      return;
    }
  }

  try {
    const res = await fetchDrawApi(`/lotteries/${id}/publish`, { method: 'POST' });
    if (res.ok) {
      await loadDrawModule();
      showToastNotification('🚀 Event published successfully to Telegram!', 'show');
    }
  } catch (err) {
    alert(`Publish failed: ${err.message}`);
  }
}

// Trigger Manual Draw

// ==================== DRAW CONFIRM & DESIGNATED WINNERS LOGIC ====================
let currentConfirmDrawLottery = null;
let currentConfirmDrawParticipants = [];

async function triggerDrawCampaign(id) {
  openDrawConfirmModal(id);
}

async function openDrawConfirmModal(id) {
  const lottery = drawState.cachedLotteries.find(l => l.id === id);
  if (!lottery) return;

  currentConfirmDrawLottery = lottery;

  // Interlock check: Ensure engine is awake
  if (!drawState.engineEnabled) {
    const autoWake = confirm('⚠️ 抽奖引擎当前处于休眠状态。\n\n执行开奖并宣布中奖者需要引擎处于运行状态。\n\n是否立即唤醒引擎并进入开奖确认？');
    if (!autoWake) return;
    try {
      const wakeRes = await fetchDrawApi('/status/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: true })
      });
      drawState.engineEnabled = !!wakeRes.enabled;
      updateDrawEngineUI(wakeRes.enabled);
      showToastNotification('⚡ 抽奖引擎已自动唤醒！', 'show');
    } catch (e) {
      alert('唤醒抽奖引擎失败: ' + e.message);
      return;
    }
  }

  // Populate Event Summary
  const nameEl = document.getElementById('draw-confirm-event-name');
  const chatEl = document.getElementById('draw-confirm-target-chat');
  const prizesEl = document.getElementById('draw-confirm-prizes');
  const partEl = document.getElementById('draw-confirm-participants');

  if (nameEl) nameEl.textContent = lottery.internalName;
  if (chatEl) chatEl.textContent = `${lottery.targetChatId}${lottery.targetTopicId ? ` (T:${lottery.targetTopicId})` : ''}`;
  
  const totalPrizeCount = (lottery.prizes || []).reduce((sum, p) => sum + p.count, 0);
  const prizeSummary = (lottery.prizes || []).map(p => `${p.count}x ${p.name}`).join(', ');
  if (prizesEl) prizesEl.textContent = `${prizeSummary} (共 ${totalPrizeCount} 份)`;
  
  const partCount = (lottery.participants && lottery.participants.length) || 0;
  if (partEl) partEl.textContent = `${partCount} 人已报名`;

  // Populate Auto Draw Time and Designated Status
  const autoEl = document.getElementById('draw-confirm-autotime');
  const desigEl = document.getElementById('draw-confirm-designated-status');
  const desigRow = document.getElementById('draw-confirm-designated-row');

  if (autoEl) {
    if (lottery.autoDrawTime) {
      autoEl.textContent = `${formatBjtDisplay(lottery.autoDrawTime)} (自动开奖)`;
    } else if (lottery.endTime) {
      autoEl.textContent = `${formatBjtDisplay(lottery.endTime)} (活动结束)`;
    } else {
      autoEl.textContent = '手动开奖 (Manual)';
    }
  }

  if (desigRow && desigEl) {
    if (lottery.designatedWinners && lottery.designatedWinners.length > 0) {
      desigRow.classList.remove('hidden');
      desigEl.textContent = `${lottery.designatedWinners.length} 位中奖者已预设`;
    } else {
      desigRow.classList.add('hidden');
      desigEl.textContent = '--';
    }
  }

  // Fetch full participant list in background to ensure fresh data
  try {
    const res = await fetchDrawApi(`/lotteries/${id}/participants?limit=1000`);
    if (res && res.participants) {
      currentConfirmDrawParticipants = res.participants;
      if (partEl) partEl.textContent = `${res.total || res.participants.length} 人已报名`;
    } else {
      currentConfirmDrawParticipants = lottery.participants || [];
    }
  } catch (err) {
    currentConfirmDrawParticipants = lottery.participants || [];
  }

  // Reset view to Step 1
  switchBackToDrawStep1();

  const modal = document.getElementById('modal-draw-confirm');
  if (modal) modal.classList.remove('hidden');
}

function closeDrawConfirmModal() {
  closeDesignatedPartDropdown();
  const modal = document.getElementById('modal-draw-confirm');
  if (modal) modal.classList.add('hidden');
  currentConfirmDrawLottery = null;
  currentConfirmDrawParticipants = [];
}

function switchBackToDrawStep1() {
  const step1 = document.getElementById('draw-confirm-step-1');
  const step2 = document.getElementById('draw-confirm-step-2');
  if (step1) step1.classList.remove('hidden');
  if (step2) step2.classList.add('hidden');
}

async function executeRandomDraw(id) {
  const lotteryId = id || (currentConfirmDrawLottery && currentConfirmDrawLottery.id);
  if (!lotteryId) return;

  const btn = document.getElementById('btn-draw-confirm-random');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ 正在随机开奖并推送...</span>';
  }

  try {
    const res = await fetchDrawApi(`/lotteries/${lotteryId}/draw`, {
      method: 'POST',
      body: JSON.stringify({ designatedWinners: [] })
    });
    if (res.ok) {
      closeDrawConfirmModal();
      await loadDrawModule();
      const count = (res.winners && res.winners.length) || 0;
      showToastNotification(`🎉 开奖成功！共抽取 ${count} 位中奖者并已推送到社群。`, 'show');
    }
  } catch (err) {
    alert(`开奖失败: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.3rem;">⚡</span>
          <div style="text-align: left;">
            <div>立刻开奖 (全随机)</div>
            <div style="font-size: 0.76rem; font-weight: normal; opacity: 0.9;">所有奖品全随机自动抽取并公布</div>
          </div>
        </div>
        <span style="font-size: 1.1rem; opacity: 0.8;">&rarr;</span>
      `;
    }
  }
}

function switchToDesignatedDrawView() {
  if (!currentConfirmDrawLottery) return;
  if (!currentConfirmDrawParticipants || currentConfirmDrawParticipants.length === 0) {
    alert('当前暂无用户参与本次抽奖，无法指定中奖者！');
    return;
  }

  const step1 = document.getElementById('draw-confirm-step-1');
  const step2 = document.getElementById('draw-confirm-step-2');
  if (step1) step1.classList.add('hidden');
  if (step2) step2.classList.remove('hidden');

  // Clear previous rows
  const container = document.getElementById('draw-designated-rows-container');
  if (container) {
    container.innerHTML = '';
  }

  // Configure Schedule Box display
  const scheduleBadge = document.getElementById('draw-desig-current-autotime-badge');
  const timeInputWrap = document.getElementById('draw-desig-time-input-wrap');
  const newAutoTimeInput = document.getElementById('draw-desig-new-autotime');
  const scheduleBtn = document.getElementById('btn-save-schedule-designated');

  if (currentConfirmDrawLottery.autoDrawTime) {
    if (scheduleBadge) scheduleBadge.textContent = formatBjtDisplay(currentConfirmDrawLottery.autoDrawTime);
    if (timeInputWrap) timeInputWrap.classList.add('hidden');
    if (scheduleBtn) scheduleBtn.textContent = '⏰ 按照 Auto Draw 时间开奖';
  } else {
    if (scheduleBadge) scheduleBadge.textContent = '未预设定时时间';
    if (timeInputWrap) timeInputWrap.classList.remove('hidden');
    if (newAutoTimeInput) newAutoTimeInput.value = '';
    if (scheduleBtn) scheduleBtn.textContent = '⏰ 设置时间并按定时开奖';
  }

  // Pre-fill existing designated winners if any
  if (currentConfirmDrawLottery.designatedWinners && currentConfirmDrawLottery.designatedWinners.length > 0) {
    currentConfirmDrawLottery.designatedWinners.forEach(dw => {
      addDesignatedWinnerRow(dw.participantId, dw.prizeName);
    });
  } else {
    addDesignatedWinnerRow();
  }
  updateDesignatedCounters();
}

function formatParticipantDisplay(p) {
  let username = '';
  if (p && p.username && !p.username.startsWith('User')) {
    username = `@${p.username}`;
  } else {
    const rawId = String((p && (p.chatId || p.id)) || '');
    username = rawId ? `User#${rawId.slice(-4)}` : 'User';
  }

  let nickname = [p && p.firstName, p && p.lastName].filter(Boolean).join(' ').trim();
  if (nickname.length > 20) {
    nickname = nickname.slice(0, 20) + '...';
  }
  if (!nickname) {
    nickname = '--';
  }

  return { username, nickname };
}

let activeDesigPartTrigger = null;
let activePickerTargetRow = null;

function closeDesignatedPartDropdown() {
  const menu = document.getElementById('draw-desig-floating-part-menu');
  if (menu) menu.classList.add('hidden');
  activeDesigPartTrigger = null;
}

function filterParticipantsByQuery(query) {
  const allParticipants = currentConfirmDrawParticipants || [];
  const cleanQ = (query || '').trim().toLowerCase().replace(/^@/, '');
  if (!cleanQ) return allParticipants;

  return allParticipants.filter(p => {
    const uname = (p.username || '').toLowerCase().replace(/^@/, '');
    const nick = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase();
    return uname.includes(cleanQ) || nick.includes(cleanQ);
  });
}

function renderDropdownItems(menu, query = '') {
  const row = activeDesigPartTrigger ? activeDesigPartTrigger.closest('.draw-designated-row') : null;
  const curHiddenInput = row ? row.querySelector('.draw-desig-part-select') : null;
  const curPartId = curHiddenInput ? String(curHiddenInput.value) : '';

  const otherSelectedIds = new Set();
  const allRows = document.querySelectorAll('.draw-designated-row');
  allRows.forEach(r => {
    if (r !== row) {
      const inp = r.querySelector('.draw-desig-part-select');
      if (inp && inp.value) otherSelectedIds.add(String(inp.value));
    }
  });

  const filtered = filterParticipantsByQuery(query);
  const itemsContainer = menu.querySelector('#draw-desig-dropdown-items');
  if (!itemsContainer) return;

  if (filtered.length === 0) {
    itemsContainer.innerHTML = `
      <div style="padding: 16px; text-align: center; color: #64748b; font-size: 0.8rem;">
        未搜索到匹配的参与者
      </div>
    `;
    return;
  }

  itemsContainer.innerHTML = filtered.map(p => {
    const pId = String(p.id || p.chatId);
    const isCurSelected = pId === curPartId;
    const isOtherSelected = otherSelectedIds.has(pId);
    const { username, nickname } = formatParticipantDisplay(p);

    if (isOtherSelected) {
      return `
        <div style="padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); opacity: 0.45; cursor: not-allowed; display: flex; flex-direction: column;">
          <div style="font-size: 0.8rem; color: #94a3b8; font-weight: 500;">
            <span>${escapeHtml(username)}</span>
            <span style="font-size: 0.72rem; color: #f87171; margin-left: 6px;">(已在其他行指定)</span>
          </div>
          <div style="font-size: 0.72rem; color: #64748b;">${escapeHtml(nickname)}</div>
        </div>
      `;
    }

    const activeBg = isCurSelected ? 'background: rgba(56, 189, 248, 0.2);' : '';
    const checkIcon = isCurSelected ? '<span style="color: #38bdf8; font-size: 0.8rem;">✓</span>' : '';

    return `
      <div data-pid="${escapeHtml(pId)}" onclick="selectDesignatedParticipant(this.dataset.pid)" style="padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: background 0.15s; ${activeBg}" onmouseover="this.style.background='rgba(56, 189, 248, 0.15)'" onmouseout="this.style.background='${isCurSelected ? 'rgba(56, 189, 248, 0.2)' : 'transparent'}'">
        <div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0; flex: 1;">
          <div style="font-size: 0.82rem; color: #fff; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(username)}</div>
          <div style="font-size: 0.72rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(nickname)}</div>
        </div>
        ${checkIcon}
      </div>
    `;
  }).join('');
}

function openDesignatedPartDropdown(triggerEl, event) {
  if (event) event.stopPropagation();
  const existingMenu = document.getElementById('draw-desig-floating-part-menu');

  if (activeDesigPartTrigger === triggerEl && existingMenu && !existingMenu.classList.contains('hidden')) {
    closeDesignatedPartDropdown();
    return;
  }
  activeDesigPartTrigger = triggerEl;

  let menu = existingMenu;
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'draw-desig-floating-part-menu';
    menu.className = 'hidden';
    menu.style.cssText = 'position: fixed; z-index: 100000; background: #0f172a; border: 1px solid #38bdf8; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.85); width: 280px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden;';
    menu.innerHTML = `
      <div style="padding: 8px; background: #0b1120; border-bottom: 1px solid #334155; display: flex; gap: 5px; align-items: center;">
        <input type="text" id="draw-desig-dropdown-quick-search" placeholder="搜索用户名或昵称..." oninput="onDropdownQuickFilter(this.value)" style="flex: 1; min-width: 0; height: 30px; padding: 2px 8px; font-size: 0.76rem; border-radius: 4px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box;" />
        <button type="button" class="btn btn-secondary btn-xs" onclick="openParticipantPickerModal(activeDesigPartTrigger)" title="展开弹窗搜索" style="padding: 0 8px; height: 30px; font-size: 0.74rem; color: #38bdf8; white-space: nowrap; display: inline-flex; align-items: center; gap: 2px;">
          ⛶ 展开
        </button>
      </div>
      <div id="draw-desig-dropdown-items" style="max-height: 200px; overflow-y: auto; overflow-x: hidden;"></div>
    `;
    document.body.appendChild(menu);

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#draw-desig-floating-part-menu') && !e.target.closest('.draw-desig-part-trigger')) {
        closeDesignatedPartDropdown();
      }
    });

    window.addEventListener('resize', closeDesignatedPartDropdown);
  }

  // Calculate position
  const rect = triggerEl.getBoundingClientRect();
  menu.style.left = rect.left + 'px';

  // Check if dropdown goes below window
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 250 && rect.top > 250) {
    menu.style.top = Math.max(10, rect.top - 245) + 'px';
  } else {
    menu.style.top = (rect.bottom + 4) + 'px';
  }

  const searchInput = menu.querySelector('#draw-desig-dropdown-quick-search');
  if (searchInput) searchInput.value = '';

  renderDropdownItems(menu, '');
  menu.classList.remove('hidden');
}

function onDropdownQuickFilter(val) {
  const menu = document.getElementById('draw-desig-floating-part-menu');
  if (menu) renderDropdownItems(menu, val);
}

function selectDesignatedParticipant(pId) {
  const targetRow = activePickerTargetRow || (activeDesigPartTrigger ? activeDesigPartTrigger.closest('.draw-designated-row') : null);
  if (!targetRow) return;

  const hiddenInput = targetRow.querySelector('.draw-desig-part-select');
  if (hiddenInput) hiddenInput.value = pId;

  const allParticipants = currentConfirmDrawParticipants || [];
  const partObj = allParticipants.find(p => String(p.id || p.chatId) === String(pId)) || {};
  const { username, nickname } = formatParticipantDisplay(partObj);

  const unameEl = targetRow.querySelector('.desig-part-uname');
  const nickEl = targetRow.querySelector('.desig-part-nick');
  if (unameEl) unameEl.textContent = username;
  if (nickEl) nickEl.textContent = nickname;

  closeDesignatedPartDropdown();
  closeParticipantPickerModal();
  updateDesignatedCounters();
}

// --- Expanded Participant Picker Modal Functions ---
function openParticipantPickerModal(btnOrTrigger) {
  closeDesignatedPartDropdown();
  activePickerTargetRow = btnOrTrigger.closest('.draw-designated-row');

  const modal = document.getElementById('modal-draw-participant-picker');
  if (!modal) return;

  const searchInput = document.getElementById('draw-picker-search-input');
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 50);
  }

  doSearchParticipantPicker();
  modal.classList.remove('hidden');
}

function closeParticipantPickerModal() {
  const modal = document.getElementById('modal-draw-participant-picker');
  if (modal) modal.classList.add('hidden');
  activePickerTargetRow = null;
}

function onParticipantPickerInput() {
  doSearchParticipantPicker();
}

function resetParticipantPickerSearch() {
  const searchInput = document.getElementById('draw-picker-search-input');
  if (searchInput) searchInput.value = '';
  doSearchParticipantPicker();
}

function doSearchParticipantPicker() {
  const searchInput = document.getElementById('draw-picker-search-input');
  const query = searchInput ? searchInput.value : '';
  const filtered = filterParticipantsByQuery(query);

  const allParticipants = currentConfirmDrawParticipants || [];
  const totalEl = document.getElementById('draw-picker-total-count');
  const filteredEl = document.getElementById('draw-picker-filtered-count');
  if (totalEl) totalEl.textContent = allParticipants.length;
  if (filteredEl) filteredEl.textContent = filtered.length;

  const container = document.getElementById('draw-picker-list-container');
  if (!container) return;

  const curHiddenInput = activePickerTargetRow ? activePickerTargetRow.querySelector('.draw-desig-part-select') : null;
  const curPartId = curHiddenInput ? String(curHiddenInput.value) : '';

  const otherSelectedIds = new Set();
  const allRows = document.querySelectorAll('.draw-designated-row');
  allRows.forEach(r => {
    if (r !== activePickerTargetRow) {
      const inp = r.querySelector('.draw-desig-part-select');
      if (inp && inp.value) otherSelectedIds.add(String(inp.value));
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 30px; text-align: center; color: #64748b; font-size: 0.88rem;">
        🔍 没有搜索到匹配【${escapeHtml(query)}】的参与者
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const pId = String(p.id || p.chatId);
    const isCurSelected = pId === curPartId;
    const isOtherSelected = otherSelectedIds.has(pId);
    const { username, nickname } = formatParticipantDisplay(p);
    const initial = (username.replace('@', '')[0] || 'U').toUpperCase();

    if (isOtherSelected) {
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 12px; opacity: 0.45; cursor: not-allowed;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: #334155; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.82rem; flex-shrink: 0;">
              ${escapeHtml(initial)}
            </div>
            <div style="display: flex; flex-direction: column; min-width: 0;">
              <span style="font-size: 0.84rem; font-weight: 600; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(username)}</span>
              <span style="font-size: 0.74rem; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(nickname)}</span>
            </div>
          </div>
          <span style="font-size: 0.74rem; color: #f87171; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 3px 8px; border-radius: 4px; flex-shrink: 0;">已在其他行指定</span>
        </div>
      `;
    }

    const borderStyle = isCurSelected ? 'border: 1px solid #38bdf8; background: rgba(56, 189, 248, 0.12);' : 'border: 1px solid #334155; background: #0b1120;';

    return `
      <div data-pid="${escapeHtml(pId)}" onclick="selectDesignatedParticipant(this.dataset.pid)" style="display: flex; justify-content: space-between; align-items: center; border-radius: 8px; padding: 8px 12px; cursor: pointer; transition: all 0.15s ease; ${borderStyle}" onmouseover="if(!${isCurSelected}) this.style.background='rgba(56, 189, 248, 0.08)';" onmouseout="if(!${isCurSelected}) this.style.background='#0b1120';">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <div style="width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.84rem; flex-shrink: 0; box-shadow: 0 2px 6px rgba(56, 189, 248, 0.3);">
            ${escapeHtml(initial)}
          </div>
          <div style="display: flex; flex-direction: column; min-width: 0;">
            <span style="font-size: 0.86rem; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(username)}</span>
            <span style="font-size: 0.74rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(nickname)}</span>
          </div>
        </div>
        <div>
          ${isCurSelected
            ? '<span style="font-size: 0.74rem; color: #38bdf8; background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; padding: 3px 10px; border-radius: 4px; font-weight: 600;">当前已选 ✓</span>'
            : '<button type="button" class="btn btn-secondary btn-xs" style="padding: 3px 10px; font-size: 0.74rem; color: #38bdf8; border-color: rgba(56, 189, 248, 0.35);">选择</button>'
          }
        </div>
      </div>
    `;
  }).join('');
}

function addDesignatedWinnerRow(preSelectPartId, preSelectPrizeName) {
  if (!currentConfirmDrawLottery) return;
  const container = document.getElementById('draw-designated-rows-container');
  if (!container) return;

  const prizes = currentConfirmDrawLottery.prizes || [];
  const totalPrizeCount = prizes.reduce((sum, p) => sum + p.count, 0);
  const existingRows = Array.from(container.querySelectorAll('.draw-designated-row'));

  // 1. Quota limit check: If rows reached total prize count, pop up alert!
  if (existingRows.length >= totalPrizeCount) {
    alert('已达总奖品数上限，不可再添加。');
    return;
  }

  // 2. Gather currently selected participant IDs and counts per prize
  const selectedPartIds = new Set();
  const assignedByPrize = {};
  prizes.forEach(p => { assignedByPrize[p.name] = 0; });

  existingRows.forEach(r => {
    const pVal = r.querySelector('.draw-desig-part-select')?.value;
    const prVal = r.querySelector('.draw-desig-prize-select')?.value;
    if (pVal) selectedPartIds.add(String(pVal));
    if (prVal) assignedByPrize[prVal] = (assignedByPrize[prVal] || 0) + 1;
  });

  // Check if any prize still has quota
  const hasAvailablePrize = prizes.some(p => (assignedByPrize[p.name] || 0) < p.count);
  if (!hasAvailablePrize && !preSelectPrizeName) {
    alert('已达总奖品数上限，不可再添加。');
    return;
  }

  // Check if all participants are already assigned
  const allParticipants = currentConfirmDrawParticipants || [];
  const unassignedParts = allParticipants.filter(p => !selectedPartIds.has(String(p.id || p.chatId)));
  if (unassignedParts.length === 0 && !preSelectPartId && allParticipants.length > 0) {
    alert('所有参与者均已指定，不可再添加。');
    return;
  }

  // 3. Pick default target participant (first available unselected participant in default order)
  let targetPartId = preSelectPartId;
  if (!targetPartId) {
    const availPart = unassignedParts[0];
    targetPartId = availPart
      ? (availPart.id || availPart.chatId)
      : (allParticipants[0] ? (allParticipants[0].id || allParticipants[0].chatId) : '');
  }

  const targetPartObj = allParticipants.find(p => String(p.id || p.chatId) === String(targetPartId)) || allParticipants[0] || {};
  const { username: targetUname, nickname: targetNick } = formatParticipantDisplay(targetPartObj);

  // 4. Pick default target prize (first prize with remaining quota)
  let targetPrizeName = preSelectPrizeName;
  if (!targetPrizeName) {
    const availPrize = prizes.find(p => (assignedByPrize[p.name] || 0) < p.count);
    targetPrizeName = availPrize ? availPrize.name : (prizes[0] ? prizes[0].name : '');
  }

  // 5. Build prizes options (Display single prize name without misleading total '(2份)')
  const prizeOptions = prizes.map(p => {
    const isSelected = String(p.name) === String(targetPrizeName);
    return `<option value="${escapeHtml(p.name)}" ${isSelected ? 'selected' : ''}>${escapeHtml(p.name)}</option>`;
  }).join('');

  const row = document.createElement('div');
  row.className = 'draw-designated-row';
  row.style.cssText = 'display: flex; gap: 8px; align-items: center; background: #0b1120; border: 1px solid #334155; border-radius: 8px; padding: 6px 8px; width: 100%; box-sizing: border-box;';
  row.innerHTML = `
    <!-- Column 1: 获奖者名字列 (固定长度 260px，稍长一些) -->
    <div class="draw-desig-part-col" style="position: relative; width: 260px; min-width: 260px; max-width: 260px; flex: 0 0 260px; display: flex; gap: 4px; align-items: center;">
      <input type="hidden" class="draw-desig-part-select" value="${escapeHtml(String(targetPartId))}" />
      <div class="draw-desig-part-trigger" onclick="openDesignatedPartDropdown(this, event)" style="flex: 1; min-width: 0; height: 42px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 3px 8px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; box-sizing: border-box;" title="点击选择或搜索中奖者">
        <div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0; flex: 1; text-align: left;">
          <span class="desig-part-uname" style="font-size: 0.82rem; font-weight: 600; color: #fff; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(targetUname)}</span>
          <span class="desig-part-nick" style="font-size: 0.72rem; color: #94a3b8; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(targetNick)}</span>
        </div>
        <span style="font-size: 0.65rem; color: #94a3b8; margin-left: 4px; flex-shrink: 0;">▼</span>
      </div>
      <button type="button" class="btn btn-secondary btn-xs" onclick="openParticipantPickerModal(this)" style="width: 32px; min-width: 32px; max-width: 32px; height: 42px; flex: 0 0 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; border-radius: 6px; cursor: pointer; font-size: 0.85rem;" title="展开搜索弹窗">
        🔍
      </button>
    </div>

    <!-- Column 2: 奖品列 (固定长度 140px) -->
    <div class="draw-desig-prize-col" style="width: 140px; min-width: 140px; max-width: 140px; flex: 0 0 140px;">
      <select class="draw-desig-prize-select input-text" style="width: 100%; height: 42px; padding: 6px 8px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fbbf24; font-size: 0.82rem; font-weight: 600; box-sizing: border-box;" onchange="updateDesignatedCounters()">
        ${prizeOptions}
      </select>
    </div>

    <!-- Column 3: 移除按钮 (固定长度 32px) -->
    <button type="button" class="btn btn-secondary btn-xs" onclick="removeDesignatedWinnerRow(this)" style="width: 32px; min-width: 32px; max-width: 32px; height: 42px; flex: 0 0 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #f87171; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.08); font-size: 1.15rem; line-height: 1;" title="移除">
      &times;
    </button>
  `;
  container.appendChild(row);
  updateDesignatedCounters();
}

function removeDesignatedWinnerRow(btn) {
  closeDesignatedPartDropdown();
  closeParticipantPickerModal();
  const row = btn.closest('.draw-designated-row');
  if (row) {
    row.remove();
    updateDesignatedCounters();
  }
}

function clearAllDesignatedRows() {
  closeDesignatedPartDropdown();
  closeParticipantPickerModal();
  const container = document.getElementById('draw-designated-rows-container');
  if (container) {
    container.innerHTML = '';
    updateDesignatedCounters();
  }
}

function updateDesignatedCounters() {
  if (!currentConfirmDrawLottery) return;
  const container = document.getElementById('draw-designated-rows-container');
  const rows = container ? Array.from(container.querySelectorAll('.draw-designated-row')) : [];
  const prizes = currentConfirmDrawLottery.prizes || [];
  const totalPrizeCount = prizes.reduce((sum, p) => sum + p.count, 0);

  // 1. Gather all current selections
  const selectedPartIds = new Set();
  const assignedByPrize = {};
  prizes.forEach(p => { assignedByPrize[p.name] = 0; });

  rows.forEach(r => {
    const partSel = r.querySelector('.draw-desig-part-select');
    const prizeSel = r.querySelector('.draw-desig-prize-select');
    if (partSel && partSel.value) selectedPartIds.add(String(partSel.value));
    if (prizeSel && prizeSel.value) {
      assignedByPrize[prizeSel.value] = (assignedByPrize[prizeSel.value] || 0) + 1;
    }
  });

  // 2. Render individual prize breakdown badges in #draw-desig-pills-wrap
  const pillsWrap = document.getElementById('draw-desig-pills-wrap');
  if (pillsWrap) {
    pillsWrap.innerHTML = prizes.map(p => {
      const assigned = assignedByPrize[p.name] || 0;
      const isFull = assigned >= p.count;
      const isOver = assigned > p.count;
      const bg = isOver ? 'rgba(239, 68, 68, 0.18)' : (isFull ? 'rgba(34, 197, 94, 0.15)' : 'rgba(251, 191, 36, 0.12)');
      const border = isOver ? 'rgba(239, 68, 68, 0.45)' : (isFull ? 'rgba(34, 197, 94, 0.4)' : 'rgba(251, 191, 36, 0.35)');
      const color = isOver ? '#f87171' : (isFull ? '#4ade80' : '#fbbf24');
      const statusText = isOver ? `超额 +${assigned - p.count}` : (isFull ? '已选满' : `剩 ${p.count - assigned} 份`);
      return `
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; background: ${bg}; border: 1px solid ${border}; color: ${color};">
          <span>🎁 ${escapeHtml(p.name)}:</span>
          <span>${assigned}/${p.count} (${statusText})</span>
        </span>
      `;
    }).join('');
  }

  // 3. Dynamically update select options in each row to enforce quotas
  rows.forEach(r => {
    const prizeSel = r.querySelector('.draw-desig-prize-select');
    const curPrizeVal = prizeSel ? String(prizeSel.value) : '';

    // Update prize select options
    if (prizeSel) {
      Array.from(prizeSel.options).forEach(opt => {
        const prName = opt.value;
        const prizeDef = prizes.find(p => p.name === prName);
        if (!prizeDef) return;
        const total = prizeDef.count;
        // Remaining slots for THIS row if it keeps or changes to this option
        const assignedOtherRows = (assignedByPrize[prName] || 0) - (curPrizeVal === prName ? 1 : 0);
        const remForThisRow = total - assignedOtherRows;

        if (remForThisRow <= 0) {
          opt.disabled = true;
          opt.textContent = `${prName} (已选满)`;
        } else {
          opt.disabled = false;
          opt.textContent = `${prName}`;
        }
      });
    }
  });

  // 4. Update summary counters
  const assignedCount = rows.length;
  const remainingCount = Math.max(0, totalPrizeCount - assignedCount);

  const totalEl = document.getElementById('draw-desig-total-prizes');
  const assignedEl = document.getElementById('draw-desig-assigned-count');
  const remainingEl = document.getElementById('draw-desig-remaining-count');
  const addBtn = document.getElementById('btn-add-designated-row');
  const limitTip = document.getElementById('draw-desig-limit-tip');

  if (totalEl) totalEl.textContent = totalPrizeCount;
  if (assignedEl) assignedEl.textContent = assignedCount;
  if (remainingEl) remainingEl.textContent = remainingCount;

  // 5. Control "➕ 添加指定获奖者" button
  const allPrizesFilled = prizes.every(p => (assignedByPrize[p.name] || 0) >= p.count);
  const allParticipantsAssigned = currentConfirmDrawParticipants && assignedCount >= currentConfirmDrawParticipants.length;
  const isLimitReached = assignedCount >= totalPrizeCount || allPrizesFilled || allParticipantsAssigned;

  if (addBtn) {
    // Keep clickable so clicking triggers alert('已达总奖品数上限，不可再添加。')
    addBtn.disabled = false;
    if (isLimitReached) {
      addBtn.style.opacity = '0.65';
      addBtn.style.cursor = 'not-allowed';
    } else {
      addBtn.style.opacity = '1';
      addBtn.style.cursor = 'pointer';
    }
  }

  if (limitTip) {
    if (isLimitReached) {
      limitTip.classList.remove('hidden');
      if (allPrizesFilled || assignedCount >= totalPrizeCount) {
        limitTip.textContent = '已达总奖品数上限';
      } else if (allParticipantsAssigned) {
        limitTip.textContent = '所有参与者均已指定完毕';
      }
    } else {
      limitTip.classList.add('hidden');
    }
  }
}

async function saveAndScheduleDesignatedDraw() {
  if (!currentConfirmDrawLottery) return;
  const lotteryId = currentConfirmDrawLottery.id;

  const container = document.getElementById('draw-designated-rows-container');
  const rows = container ? container.querySelectorAll('.draw-designated-row') : [];

  const designatedWinners = [];
  const selectedPartIds = new Set();
  const prizeCounts = {};
  (currentConfirmDrawLottery.prizes || []).forEach(p => {
    prizeCounts[p.name] = p.count;
  });

  const currentPrizeAssigned = {};

  for (const row of rows) {
    const partSelect = row.querySelector('.draw-desig-part-select');
    const prizeSelect = row.querySelector('.draw-desig-prize-select');
    const partId = partSelect ? partSelect.value : '';
    const prizeName = prizeSelect ? prizeSelect.value : '';

    if (!partId || !prizeName) continue;

    if (selectedPartIds.has(partId)) {
      alert('⚠️ 参与者已被重复指定，每位用户在同一场抽奖中只能中奖一次！');
      return;
    }
    selectedPartIds.add(partId);

    currentPrizeAssigned[prizeName] = (currentPrizeAssigned[prizeName] || 0) + 1;
    if (currentPrizeAssigned[prizeName] > (prizeCounts[prizeName] || 0)) {
      alert(`⚠️ 奖品【${prizeName}】总数仅有 ${prizeCounts[prizeName]} 份，当前指定了 ${currentPrizeAssigned[prizeName]} 人，已超出奖品数量上限！`);
      return;
    }

    designatedWinners.push({ participantId: partId, prizeName });
  }

  let autoDrawTime = currentConfirmDrawLottery.autoDrawTime;
  const newTimeInput = document.getElementById('draw-desig-new-autotime');
  if ((!autoDrawTime || !autoDrawTime.trim()) && newTimeInput && newTimeInput.value) {
    autoDrawTime = toBjtIsoString(newTimeInput.value);
  }

  if (!autoDrawTime || !autoDrawTime.trim()) {
    alert('⚠️ 按照定时开奖需要设置自动开奖时间，请在上方选择开奖时间！');
    const wrap = document.getElementById('draw-desig-time-input-wrap');
    if (wrap) wrap.classList.remove('hidden');
    if (newTimeInput) newTimeInput.focus();
    return;
  }

  const btn = document.getElementById('btn-save-schedule-designated');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '保存中...';
  }

  try {
    const res = await fetchDrawApi(`/lotteries/${lotteryId}/pre-assign-winners`, {
      method: 'POST',
      body: JSON.stringify({ designatedWinners, autoDrawTime })
    });
    if (res.ok) {
      closeDrawConfirmModal();
      await loadDrawModule();
      const timeFormatted = formatBjtDisplay(autoDrawTime);
      if (designatedWinners.length > 0) {
        showToastNotification(`✅ 已成功保存指定获奖者（共 ${designatedWinners.length} 人）！将在自动开奖时间（${timeFormatted}）自动开奖并公布，无需再次人工操作。`, 'show');
      } else {
        showToastNotification(`✅ 已保存纯随机开奖配置！将在自动开奖时间（${timeFormatted}）自动全随机开奖并公布。`, 'show');
      }
    }
  } catch (err) {
    alert(`保存失败: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⏰ 按照 Auto Draw 时间开奖';
    }
  }
}

async function executeDesignatedDraw() {
  if (!currentConfirmDrawLottery) return;
  const lotteryId = currentConfirmDrawLottery.id;

  const container = document.getElementById('draw-designated-rows-container');
  const rows = container ? container.querySelectorAll('.draw-designated-row') : [];

  const designatedWinners = [];
  const selectedPartIds = new Set();
  const prizeCounts = {};
  (currentConfirmDrawLottery.prizes || []).forEach(p => {
    prizeCounts[p.name] = p.count;
  });

  const currentPrizeAssigned = {};

  for (const row of rows) {
    const partSelect = row.querySelector('.draw-desig-part-select');
    const prizeSelect = row.querySelector('.draw-desig-prize-select');
    const partId = partSelect ? partSelect.value : '';
    const prizeName = prizeSelect ? prizeSelect.value : '';

    if (!partId || !prizeName) continue;

    if (selectedPartIds.has(partId)) {
      alert(`⚠️ 参与者已被重复指定，每位用户在同一场抽奖中只能中奖一次！`);
      return;
    }
    selectedPartIds.add(partId);

    currentPrizeAssigned[prizeName] = (currentPrizeAssigned[prizeName] || 0) + 1;
    if (currentPrizeAssigned[prizeName] > (prizeCounts[prizeName] || 0)) {
      alert(`⚠️ 奖品【${prizeName}】总数仅有 ${prizeCounts[prizeName]} 份，当前指定了 ${currentPrizeAssigned[prizeName]} 人，已超出奖品数量上限！`);
      return;
    }

    designatedWinners.push({ participantId: partId, prizeName });
  }

  const btn = document.getElementById('btn-execute-designated-draw');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '正在开奖...';
  }

  try {
    const res = await fetchDrawApi(`/lotteries/${lotteryId}/draw`, {
      method: 'POST',
      body: JSON.stringify({ designatedWinners })
    });
    if (res.ok) {
      closeDrawConfirmModal();
      await loadDrawModule();
      const count = (res.winners && res.winners.length) || 0;
      showToastNotification(`🎉 开奖成功！指定 ${designatedWinners.length} 人，随机抽取 ${count - designatedWinners.length} 人，已推送到社群。`, 'show');
    }
  } catch (err) {
    alert(`开奖失败: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ 立刻开奖';
    }
  }
}
window.openDrawConfirmModal = openDrawConfirmModal;
window.closeDrawConfirmModal = closeDrawConfirmModal;
window.switchBackToDrawStep1 = switchBackToDrawStep1;
window.executeRandomDraw = executeRandomDraw;
window.switchToDesignatedDrawView = switchToDesignatedDrawView;
window.addDesignatedWinnerRow = addDesignatedWinnerRow;
window.removeDesignatedWinnerRow = removeDesignatedWinnerRow;
window.clearAllDesignatedRows = clearAllDesignatedRows;
window.updateDesignatedCounters = updateDesignatedCounters;
window.saveAndScheduleDesignatedDraw = saveAndScheduleDesignatedDraw;
window.executeDesignatedDraw = executeDesignatedDraw;
window.openDesignatedPartDropdown = openDesignatedPartDropdown;
window.closeDesignatedPartDropdown = closeDesignatedPartDropdown;
window.selectDesignatedParticipant = selectDesignatedParticipant;


// Delete Campaign
async function deleteDrawCampaign(id) {
  if (!confirm('Are you sure you want to permanently delete this event?')) return;

  try {
    await fetchDrawApi(`/lotteries/${id}`, { method: 'DELETE' });
    await loadDrawModule();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}


// Re-broadcast Winner Announcement
async function reannounceDrawWinners(id) {
  if (!confirm('Re-broadcast winner announcement to Telegram channel/group now?')) return;
  try {
    const res = await fetchDrawApi(`/lotteries/${id}/reannounce`, { method: 'POST' });
    if (res.ok) {
      showToastNotification('📢 Results successfully re-broadcast to Telegram!', 'show');
    }
  } catch (err) {
    alert(`Re-broadcast failed: ${err.message}`);
  }
}
window.reannounceDrawWinners = reannounceDrawWinners;

// Modal 2: Winners Management Logic
function openDrawWinnersModal(selectedCampaignId = 'ALL') {
  const modal = document.getElementById('modal-draw-winners');
  const campaignSelect = document.getElementById('draw-winners-filter-campaign');

  if (campaignSelect) {
    campaignSelect.innerHTML = '<option value="ALL">All Events (All Winners)</option>';
    drawState.cachedLotteries.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = `${l.internalName} (${(l.winners && l.winners.length) || 0} winners)`;
      campaignSelect.appendChild(opt);
    });
    campaignSelect.value = selectedCampaignId;
  }

  renderDrawWinnersTable();
  if (modal) modal.classList.remove('hidden');
}

function closeDrawWinnersModal() {
  const modal = document.getElementById('modal-draw-winners');
  if (modal) modal.classList.add('hidden');
}

function renderDrawWinnersTable() {
  const tbody = document.getElementById('draw-winners-tbody');
  const filterSelect = document.getElementById('draw-winners-filter-campaign');
  const searchInput = document.getElementById('draw-winners-search');

  if (!tbody) return;

  const campaignFilter = filterSelect ? filterSelect.value : 'ALL';
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let allWinners = [];
  drawState.cachedLotteries.forEach(l => {
    if (campaignFilter !== 'ALL' && l.id !== campaignFilter) return;

    if (l.winners && Array.isArray(l.winners)) {
      l.winners.forEach(w => {
        allWinners.push({
          ...w,
          lotteryId: l.id,
          campaignName: l.internalName
        });
      });
    }
  });

  if (query) {
    allWinners = allWinners.filter(w => 
      (w.username && w.username.toLowerCase().includes(query)) ||
      (w.firstName && w.firstName.toLowerCase().includes(query)) ||
      (w.chatId && String(w.chatId).includes(query)) ||
      (w.prizeName && w.prizeName.toLowerCase().includes(query))
    );
  }

  if (allWinners.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 30px; text-align: center; color: var(--text-muted);">
          No winners found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allWinners.map(w => {
    const isClaimed = w.claimStatus === 'CLAIMED';
    const statusPill = isClaimed
      ? '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; border-radius: 6px; font-weight: 600;">CLAIMED</span>'
      : '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 3px 8px; border-radius: 6px; font-weight: 600;">PENDING</span>';

    const userHandle = w.username ? `@${escapeHtml(w.username)}` : escapeHtml(w.firstName || 'User');

    return `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
        <td style="padding: 12px 14px; color: #f8fafc; font-weight: 600;">${escapeHtml(w.campaignName)}</td>
        <td style="padding: 12px 14px; color: #38bdf8;">${userHandle}</td>
        <td style="padding: 12px 14px; font-family: var(--font-mono); color: var(--text-muted); font-size: 0.82rem;">${escapeHtml(String(w.chatId))}</td>
        <td style="padding: 12px 14px; color: #fbbf24; font-weight: 600;">🎁 ${escapeHtml(w.prizeName)}</td>
        <td style="padding: 12px 14px;">${statusPill}</td>
        <td style="padding: 12px 14px; text-align: right;">
          <button type="button" class="btn btn-secondary btn-xs" onclick="toggleDrawWinnerClaimStatus('${w.lotteryId}', '${w.chatId}', '${w.claimStatus}')" style="padding: 5px 10px; font-size: 0.78rem;">
            ${isClaimed ? 'Mark Pending' : 'Mark Claimed'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleDrawWinnerClaimStatus(lotteryId, participantId, currentStatus) {
  const newStatus = currentStatus === 'CLAIMED' ? 'PENDING' : 'CLAIMED';
  try {
    await fetchDrawApi(`/lotteries/${lotteryId}/winners/claim-status`, {
      method: 'POST',
      body: JSON.stringify({ participantId, claimStatus: newStatus })
    });

    // Update locally
    const lottery = drawState.cachedLotteries.find(l => l.id === lotteryId);
    if (lottery && lottery.winners) {
      const winner = lottery.winners.find(w => String(w.chatId) === String(participantId) || String(w.id) === String(participantId));
      if (winner) winner.claimStatus = newStatus;
    }

    renderDrawWinnersTable();
  } catch (err) {
    alert(`Failed to update claim status: ${err.message}`);
  }
}

function exportDrawWinnersCsv() {
  const filterSelect = document.getElementById('draw-winners-filter-campaign');
  const campaignFilter = filterSelect ? filterSelect.value : 'ALL';

  let allWinners = [];
  drawState.cachedLotteries.forEach(l => {
    if (campaignFilter !== 'ALL' && l.id !== campaignFilter) return;
    if (l.winners && Array.isArray(l.winners)) {
      l.winners.forEach(w => {
        allWinners.push({
          campaign: l.internalName,
          username: w.username || '',
          firstName: w.firstName || '',
          chatId: w.chatId,
          prize: w.prizeName,
          claimStatus: w.claimStatus || 'PENDING'
        });
      });
    }
  });

  if (allWinners.length === 0) {
    alert('No winners to export.');
    return;
  }

  
  let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
  csvContent += 'EventID,DrawTimestamp,Event,Campaign,Username,FirstName,TelegramChatID,Prize,ClaimStatus\n';

  allWinners.forEach(w => {
    const row = [
      `"${w.lotteryId || ''}"`,
      `"${formatBjtDisplay(Date.now())}"`,
      `"${w.campaign.replace(/"/g, '""')}"`,
      `"${w.campaign.replace(/"/g, '""')}"`,
      `"${w.username.replace(/"/g, '""')}"`,
      `"${w.firstName.replace(/"/g, '""')}"`,
      `"${w.chatId}"`,
      `"${w.prize.replace(/"/g, '""')}"`,
      `"${w.claimStatus}"`
    ];
    csvContent += row.join(',') + '\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `teleguard_draw_winners_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Modal 3: Bot Settings Logic
async function openDrawSettingsModal() {
  const modal = document.getElementById('modal-draw-settings');
  if (!modal) return;

  modal.classList.remove('hidden');

  try {
    const messages = await fetchDrawApi('/bot-messages');
    if (messages) {
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
      };

      setVal('draw-msg-success-join', messages.msg_success_join);
      setVal('draw-msg-already-joined', messages.msg_already_joined);
      setVal('draw-msg-not-started', messages.msg_not_started);
      setVal('draw-msg-ended', messages.msg_ended);
      setVal('draw-msg-entries-closed', messages.msg_entries_closed);
      setVal('draw-msg-og-only', messages.msg_og_only);
      setVal('draw-msg-must-join', messages.msg_must_join_group_channel);
      setVal('draw-msg-rate-limit', messages.msg_rate_limit);
      setVal('draw-msg-join-failed', messages.msg_join_failed);
    }
  } catch (err) {
    console.error('Failed to load bot messages:', err);
  }
}

function closeDrawSettingsModal() {
  const modal = document.getElementById('modal-draw-settings');
  if (modal) modal.classList.add('hidden');
}

async function testDrawBotPing() {
  const token = document.getElementById('draw-settings-token')?.value.trim() || undefined;
  let chatId = document.getElementById('draw-settings-test-chat')?.value.trim();
  const topicId = document.getElementById('draw-settings-test-topic')?.value.trim() || undefined;

  if (!chatId) {
    alert('Please enter a Target Group/Channel ID (Target Chat ID).');
    return;
  }

  // Client-side auto cleanup for @ and t.me
  chatId = chatId.replace(/^https?:\/\/t\.me\//i, '').replace(/^t\.me\//i, '').trim();
  if (!chatId.startsWith('@') && !chatId.startsWith('-') && !/^-?\d+$/.test(chatId)) {
    chatId = '@' + chatId;
    const chatInput = document.getElementById('draw-settings-test-chat');
    if (chatInput) chatInput.value = chatId;
  }

  try {
    const res = await fetchDrawApi('/test-connection', {
      method: 'POST',
      body: JSON.stringify({ token, chatId, topicId })
    });
    if (res.ok) {
      alert('🔔 Test connection ping sent successfully! Please check Telegram group.');
    }
  } catch (err) {
    let msg = err.message;
    if (msg === 'Failed to fetch') {
      msg = '后台服务连接失败 (Failed to fetch)。请确认 Node.js 后台服务正在运行，且端口 3200 正常监听。';
    }
    alert(`Ping failed: ${msg}`);
  }
}

async function handleSaveDrawBotMessages(event) {
  event.preventDefault();

  const getVal = (id) => document.getElementById(id)?.value || '';

  const messages = {
    msg_success_join: getVal('draw-msg-success-join'),
    msg_already_joined: getVal('draw-msg-already-joined'),
    msg_not_started: getVal('draw-msg-not-started'),
    msg_ended: getVal('draw-msg-ended'),
    msg_entries_closed: getVal('draw-msg-entries-closed'),
    msg_og_only: getVal('draw-msg-og-only'),
    msg_must_join_group_channel: getVal('draw-msg-must-join'),
    msg_rate_limit: getVal('draw-msg-rate-limit'),
    msg_join_failed: getVal('draw-msg-join-failed')
  };

  try {
    const res = await fetchDrawApi('/bot-messages', {
      method: 'POST',
      body: JSON.stringify({ messages })
    });
    if (res.ok) {
      alert('💾 Message templates saved successfully!');
      closeDrawSettingsModal();
    }
  } catch (err) {
    alert(`Failed to save templates: ${err.message}`);
  }
}

// Periodic 60-minute background refresh for entrant counters
setInterval(() => {
  const drawMod = document.getElementById('module-draw');
  if (drawMod && !drawMod.classList.contains('hidden') && drawState.engineEnabled) {
    loadDrawModule();
  }
}, 3600000);

// Designated winner participant picker and dropdown global exports
window.openDesignatedPartDropdown = openDesignatedPartDropdown;
window.closeDesignatedPartDropdown = closeDesignatedPartDropdown;
window.onDropdownQuickFilter = onDropdownQuickFilter;
window.selectDesignatedParticipant = selectDesignatedParticipant;
window.openParticipantPickerModal = openParticipantPickerModal;
window.closeParticipantPickerModal = closeParticipantPickerModal;
window.onParticipantPickerInput = onParticipantPickerInput;
window.resetParticipantPickerSearch = resetParticipantPickerSearch;
window.doSearchParticipantPicker = doSearchParticipantPicker;

// Lucky Draw Modal and Operation Global Exports
window.openCreateDrawModal = openCreateDrawModal;
window.openEditDrawModal = openEditDrawModal;
window.closeDrawCampaignModal = closeDrawCampaignModal;
window.handleSaveDrawCampaign = handleSaveDrawCampaign;
window.toggleDrawModeFields = toggleDrawModeFields;
window.addPrizeTierRow = addPrizeTierRow;
window.removePrizeTierRow = removePrizeTierRow;
window.openDrawWinnersModal = openDrawWinnersModal;
window.closeDrawWinnersModal = closeDrawWinnersModal;
window.openDrawSettingsModal = openDrawSettingsModal;
window.closeDrawSettingsModal = closeDrawSettingsModal;
window.testDrawBotPing = testDrawBotPing;
window.handleSaveDrawBotMessages = handleSaveDrawBotMessages;
window.loadDrawModule = loadDrawModule;
window.connectDrawSessionBot = connectDrawSessionBot;
window.disconnectDrawSessionBot = disconnectDrawSessionBot;
window.filterDrawCampaigns = filterDrawCampaigns;
window.onSearchDrawCampaigns = onSearchDrawCampaigns;


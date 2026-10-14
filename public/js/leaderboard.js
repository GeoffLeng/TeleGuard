// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
let currentTab = "weekly"; // "weekly" | "all"
let userId = null;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#07090e");
  tg.setBackgroundColor("#07090e");
  userId = tg.initDataUnsafe?.user?.id || null;
}

if (!userId) {
  const urlParams = new URLSearchParams(window.location.search);
  userId = urlParams.get("user_id") ? parseInt(urlParams.get("user_id"), 10) : null;
}

const urlParams = new URLSearchParams(window.location.search);
let chatId = urlParams.get("chat_id") ? parseInt(urlParams.get("chat_id"), 10) : null;

function switchTab(tab) {
  if (currentTab === tab) return;
  currentTab = tab;

  document.getElementById("tab-weekly").classList.toggle("active", tab === "weekly");
  document.getElementById("tab-all").classList.toggle("active", tab === "all");

  fetchLeaderboard();
}

function formatScore(val) {
  const num = Number(val) || 0;
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M XP";
  }
  if (num >= 10000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k XP";
  }
  return num.toLocaleString() + " XP";
}

async function fetchLeaderboard() {
  const listEl = document.getElementById("leaderboard-list");
  const footerEl = document.getElementById("sticky-footer");

  try {
    let url = `/api/leaderboard?period=${currentTab}`;
    if (userId) url += `&user_id=${userId}`;
    if (chatId) url += `&chat_id=${chatId}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();

    renderLeaderboard(data.leaderboard || []);
    renderFooter(data.currentUser);
  } catch (err) {
    console.error("Failed to load leaderboard:", err);
    const errText = window.i18n ? window.i18n.t("lb_error") : "Failed to load leaderboard data.";
    listEl.innerHTML = `<div class="empty-state">
      <span class="empty-icon">⚠️</span>
      <p>${escapeHtml(errText)}</p>
    </div>`;
    if (footerEl) footerEl.classList.add("hidden");
  }
}

function renderLeaderboard(users) {
  const listEl = document.getElementById("leaderboard-list");
  if (!users || users.length === 0) {
    const emptyText = window.i18n ? window.i18n.t("lb_empty") : "No activity records yet for this period.";
    listEl.innerHTML = `<div class="empty-state">
      <span class="empty-icon">🏆</span>
      <p>${escapeHtml(emptyText)}</p>
    </div>`;
    return;
  }

  let html = "";
  users.forEach((user, index) => {
    const rank = user.rank || index + 1;
    const isTop1 = rank === 1;
    const isTop2 = rank === 2;
    const isTop3 = rank === 3;
    const topClass = isTop1 ? "top-1" : isTop2 ? "top-2" : isTop3 ? "top-3" : "";

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "User";
    const username = user.username ? `@${user.username}` : "";
    const scoreVal = currentTab === "weekly" ? (user.weekly_xp || 0) : (user.total_xp || 0);

    const avatarInitial = (user.first_name || "U").charAt(0).toUpperCase();
    const avatarImg = user.avatar_url
      ? `<img src="${user.avatar_url}" alt="" class="avatar-img" onerror="this.outerHTML='<div class=\\'avatar-initial\\'>${avatarInitial}</div>'"/>`
      : `<div class="avatar-initial">${avatarInitial}</div>`;

    html += `<li class="leaderboard-item ${topClass}">
      <div class="rank-badge">${rank <= 3 ? (rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉') : '#' + rank}</div>
      <div class="user-avatar">${avatarImg}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(fullName)}</div>
        <div class="user-meta">${username ? escapeHtml(username) + ' • ' : ''}Lv.${user.level || 1}</div>
      </div>
      <div class="user-score">${formatScore(scoreVal)}</div>
    </li>`;
  });

  listEl.innerHTML = html;
}

function renderFooter(currentUser) {
  const footerEl = document.getElementById("sticky-footer");
  if (!currentUser) {
    footerEl.classList.add("hidden");
    return;
  }

  footerEl.classList.remove("hidden");
  document.getElementById("footer-rank").textContent = currentUser.rank > 0 ? `#${currentUser.rank}` : "#--";
  const defaultYou = window.i18n ? window.i18n.t("lb_you") : "You";
  const fullName = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(" ") || defaultYou;
  document.getElementById("footer-name").textContent = fullName;

  const scoreVal = currentTab === "weekly" ? (currentUser.weekly_xp || 0) : (currentUser.total_xp || 0);
  document.getElementById("footer-xp").textContent = formatScore(scoreVal);

  const avatarContainer = document.getElementById("footer-avatar");
  const avatarInitial = (currentUser.first_name || "Y").charAt(0).toUpperCase();
  avatarContainer.innerHTML = currentUser.avatar_url
    ? `<img src="${currentUser.avatar_url}" alt="" class="avatar-img" onerror="this.outerHTML='<div class=\\'avatar-initial\\'>${avatarInitial}</div>'"/>`
    : `<div class="avatar-initial">${avatarInitial}</div>`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  fetchLeaderboard();
});

window.addEventListener("teleguard_lang_changed", () => {
  fetchLeaderboard();
});


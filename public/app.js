"use strict";

const state = {
  data: null,
  leaderboard: null,
  tab: "overview",
  collectionFilter: "all"
};

const $ = (id) => document.getElementById(id);

function formatNumber(value) {
  return new Intl.NumberFormat("zh-Hant-TW").format(Number(value || 0));
}

function showNotice(message) {
  const notice = $("notice");
  notice.textContent = message;
  notice.classList.remove("hidden");
}

function hideNotice() {
  $("notice").classList.add("hidden");
}

function setText(id, value) {
  $(id).textContent = value;
}

function setActiveTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-page").forEach((page) => {
    page.classList.toggle("hidden-page", page.dataset.page !== tab && tab !== "overview");
  });
  document.querySelector(".profile").classList.toggle("hidden-page", tab !== "overview");
  if (tab === "overview") {
    document.querySelectorAll(".tab-page").forEach((page) => page.classList.remove("hidden-page"));
  }
}

function renderInventory(items, used, capacity) {
  setText("bagCount", `${used}/${capacity}`);
  const grid = $("inventoryGrid");
  grid.innerHTML = "";
  if (!items.length) {
    grid.innerHTML = `<div class="empty">包包目前是空的</div>`;
    return;
  }
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `<span class="item-icon">${getItemIcon(item.key)}</span><strong>${item.label}</strong><span>x${formatNumber(item.count)}</span>`;
    grid.appendChild(card);
  }
}

function getItemIcon(key) {
  const icons = {
    ore: "🪨",
    goldOre: "🟨",
    platinumOre: "⬜",
    oreIngot: "🔩",
    goldOreIngot: "🟧",
    platinumOreIngot: "◻️",
    redGem: "🔴",
    blueGem: "🔵",
    greenGem: "🟢",
    invertedOre: "🌀",
    invertedGem: "💠",
    orichalcum: "✨",
    bombItem: "💣",
    minerHelmetCount: "⛑️",
    healingPotion: "🧪",
    magicCandy: "🍬",
    quickChickenBall: "🥎",
    thickSoleShoes: "👞",
    guaranteedGemCaveTicket: "🎟️",
    guaranteedRaptorCaveTicket: "🦅",
    undyingTotem: "🗿",
    junk: "🧱",
    platinumJunk: "⬛"
  };
  return icons[key] || "📦";
}

function renderChicken(chicken) {
  const card = $("chickenCard");
  if (!chicken) {
    card.innerHTML = `<div class="empty">還沒有自己的雞</div>`;
    return;
  }
  const expPercent = Math.min(100, Math.floor((chicken.exp / Math.max(1, chicken.requiredExp)) * 100));
  card.innerHTML = `
    <div class="chicken-name">${chicken.icon} ${chicken.name}</div>
    <div class="muted">Lv.${chicken.level}｜${chicken.stage}｜${chicken.evolution}</div>
    <div class="bar"><i style="width:${expPercent}%"></i></div>
    <div class="muted">EXP：${formatNumber(chicken.exp)} / ${formatNumber(chicken.requiredExp)}</div>
    <div class="stat-line">
      <div>速度<br><strong>${chicken.speed}</strong></div>
      <div>衝刺<br><strong>${chicken.sprint}</strong></div>
      <div>穩定<br><strong>${chicken.stability}</strong></div>
      <div>耐力<br><strong>${chicken.stamina}</strong></div>
    </div>
    <div class="status-list">
      <div><span>勝場</span><strong>${formatNumber(chicken.wins)}</strong></div>
      <div><span>出賽</span><strong>${formatNumber(chicken.races)}</strong></div>
      <div><span>心情</span><strong>${chicken.mood}%</strong></div>
      <div><span>健康</span><strong>${chicken.health}%</strong></div>
      <div><span>飢餓</span><strong>${chicken.hunger}%</strong></div>
      <div><span>雞舍</span><strong>${chicken.poop} 坨</strong></div>
    </div>
  `;
}

function renderCollection(collection, summary) {
  setText("collectionCount", `${summary.collectionUnique} / ${collection.length}｜總數 ${summary.collectionTotal}`);
  const grid = $("coinGrid");
  grid.innerHTML = "";
  const filtered = collection.filter((coin) => {
    if (state.collectionFilter === "owned") return coin.count > 0;
    if (state.collectionFilter === "missing") return coin.count <= 0;
    return true;
  });
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">沒有符合條件的紀念幣</div>`;
    return;
  }
  for (const coin of filtered) {
    const card = document.createElement("article");
    card.className = `coin${coin.count > 0 ? "" : " missing"}`;
    const image = coin.image
      ? `<img src="${coin.image}" alt="${coin.name}" loading="lazy">`
      : `<div class="empty">?</div>`;
    card.innerHTML = `
      ${image}
      <strong>${coin.name}</strong>
      <span>${coin.rarity}｜x${formatNumber(coin.count)}</span>
    `;
    grid.appendChild(card);
  }
}

function renderBoard(id, entries, valueKey, suffix = "") {
  const list = $(id);
  list.innerHTML = "";
  if (!entries || !entries.length) {
    list.innerHTML = `<li class="empty-row">暫無資料</li>`;
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("li");
    const sub = valueKey === "chickenWins" && entry.chickenName ? `｜${entry.chickenName}` : "";
    item.innerHTML = `<span>${entry.name}${sub}</span><strong>${formatNumber(entry[valueKey])}${suffix}</strong>`;
    list.appendChild(item);
  }
}

function renderLeaderboard(leaderboard) {
  if (!leaderboard) return;
  renderBoard("depthBoard", leaderboard.bestDepth, "bestDepth", " 層");
  renderBoard("challengeBoard", leaderboard.challengeBestDepth, "challengeBestDepth", " 層");
  renderBoard("assetBoard", leaderboard.totalAsset, "totalAsset");
  renderBoard("chickenBoard", leaderboard.chickenWins, "chickenWins", " 勝");
}

function renderDashboard(payload) {
  const { user, summary, inventory, collection, chicken } = payload;
  $("dashboard").classList.remove("hidden");
  $("loginButton").classList.add("hidden");
  $("logoutButton").classList.remove("hidden");
  $("refreshButton").classList.remove("hidden");

  $("avatar").src = user.avatarUrl || "";
  $("avatar").alt = user.globalName || user.username || "Discord 玩家";
  setText("playerName", user.globalName || user.username || user.id);
  setText("gold", formatNumber(summary.gold));
  setText("bankGold", formatNumber(summary.bankGold));
  setText("totalAsset", formatNumber(summary.totalAsset));
  setText("hp", summary.dead ? "死亡" : summary.hp);
  setText("area", summary.area);
  setText("cave", summary.cave);
  setText("depth", summary.depthLabel || `${summary.depth}`);
  setText("bestDepth", formatNumber(summary.bestDepth));
  setText("runMode", summary.runMode);
  setText("challengeBest", `${formatNumber(summary.challengeBestDepth)} 層`);

  renderInventory(inventory, summary.bagUsed, summary.bagCapacity);
  renderChicken(chicken);
  renderCollection(collection, summary);
  setText("lastUpdated", `更新：${new Date().toLocaleTimeString("zh-Hant-TW", { hour: "2-digit", minute: "2-digit" })}`);
  renderLeaderboard(state.leaderboard);
  setActiveTab(state.tab);
}

async function loadMe() {
  const params = new URLSearchParams(location.search);
  if (params.get("login")) {
    showNotice("Discord 登入尚未完成，請確認 OAuth Redirect URI 和環境變數。");
  } else {
    hideNotice();
  }
  const response = await fetch("/api/me", { credentials: "include" });
  if (response.status === 401) return;
  const body = await response.json();
  if (!body.ok) {
    showNotice(`讀取資料失敗：${body.message || "server_error"}`);
    return;
  }
  state.data = body.data;
  await loadLeaderboard();
  renderDashboard(body.data);
}

async function loadLeaderboard() {
  const response = await fetch("/api/leaderboard", { credentials: "include" });
  if (response.status === 401) return;
  const body = await response.json();
  if (body.ok) state.leaderboard = body.data;
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll("[data-collection-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.collectionFilter = button.dataset.collectionFilter;
    document.querySelectorAll("[data-collection-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    if (state.data) renderCollection(state.data.collection, state.data.summary);
  });
});

$("refreshButton").addEventListener("click", () => {
  loadMe().catch(() => showNotice("刷新失敗，稍後再試。"));
});

$("logoutButton").addEventListener("click", () => {
  location.href = "/logout";
});

loadMe();

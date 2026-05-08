"use strict";

const state = {
  data: null
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

function setText(id, value) {
  $(id).textContent = value;
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
    card.innerHTML = `<strong>${item.label}</strong><span>x${formatNumber(item.count)}</span>`;
    grid.appendChild(card);
  }
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
  for (const coin of collection) {
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

function renderDashboard(payload) {
  const { user, summary, inventory, collection, chicken } = payload;
  $("dashboard").classList.remove("hidden");
  $("loginButton").classList.add("hidden");
  $("logoutButton").classList.remove("hidden");

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
}

async function loadMe() {
  const params = new URLSearchParams(location.search);
  if (params.get("login")) {
    showNotice("Discord 登入尚未完成，請確認 OAuth Redirect URI 和環境變數。");
  }
  const response = await fetch("/api/me", { credentials: "include" });
  if (response.status === 401) return;
  const body = await response.json();
  if (!body.ok) {
    showNotice(`讀取資料失敗：${body.message || "server_error"}`);
    return;
  }
  state.data = body.data;
  renderDashboard(body.data);
}

$("logoutButton").addEventListener("click", () => {
  location.href = "/logout";
});

loadMe();

"use strict";

const state = {
  data: null,
  leaderboard: null,
  tab: "overview",
  collectionFilter: "all",
  loading: false,
  autoSyncTimer: null,
  eventCountdownTimer: null,
  lastSyncAt: null
};

const AUTO_SYNC_INTERVAL_MS = 10000;

const $ = (id) => document.getElementById(id);

function formatNumber(value) {
  return new Intl.NumberFormat("zh-Hant-TW").format(Number(value || 0));
}

function showNotice(message) {
  const notice = $("notice");
  notice.textContent = message;
  notice.classList.remove("hidden");
}

function setRefreshButtonLoading(isLoading) {
  const button = $("refreshButton");
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? "同步中..." : "立即同步";
}

function hideNotice() {
  $("notice").classList.add("hidden");
}

function getInventoryCount(key) {
  if (!state.data || !Array.isArray(state.data.inventory)) return 0;
  return state.data.inventory.find((item) => item.key === key)?.count || 0;
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
    page.classList.toggle("hidden-page", page.dataset.page !== tab);
  });
  document.querySelector(".profile").classList.toggle("hidden-page", tab !== "overview");
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

function renderQuickBag(items, used, capacity) {
  setText("quickBagCount", `${used}/${capacity}`);
  const grid = $("quickBagGrid");
  grid.innerHTML = "";
  const slots = [];
  for (const item of items) {
    slots.push({
      icon: getItemIcon(item.key),
      label: item.label,
      count: item.count
    });
  }
  const visibleSlots = Math.max(12, Math.min(18, capacity || 12));
  for (let index = 0; index < visibleSlots; index += 1) {
    const item = slots[index];
    const cell = document.createElement("div");
    cell.className = `quick-slot${item ? "" : " empty-slot"}`;
    if (item) {
      cell.title = `${item.label} x${formatNumber(item.count)}`;
      cell.innerHTML = `<span>${item.icon}</span><small>x${formatNumber(item.count)}</small>`;
    }
    grid.appendChild(cell);
  }
}

function getShopIcon(itemId, category) {
  const icons = {
    healingPotion: "🧪",
    undyingTotem: "🗿",
    magicCandy: "🍬",
    normalFeed: "🌾",
    gourmetFeed: "🍖",
    chickenMedicine: "💊",
    autoCleaner: "🤖"
  };
  if (icons[itemId]) return icons[itemId];
  if (category === "collectible") return "🪙";
  return "📦";
}

function renderShop(shop) {
  const panel = $("webShop");
  const grid = $("webShopGrid");
  grid.innerHTML = "";
  panel.classList.toggle("disabled-panel", !shop || !shop.enabled);
  setText("shopState", shop && shop.enabled ? "地表可用" : "回地表可用");
  if (!shop || !shop.items || !shop.items.length) {
    grid.innerHTML = `<div class="empty">商店目前沒有可購買商品</div>`;
    return;
  }
  for (const item of shop.items) {
    const button = document.createElement("button");
    button.className = "shop-item-button";
    button.dataset.action = "shopBuy";
    button.dataset.itemId = item.id;
    button.disabled = !shop.enabled || item.disabled;
    const amountHint = item.multiBuy ? "可輸入數量" : "單買";
    button.innerHTML = `
      <span>${getShopIcon(item.id, item.category)}</span>
      <strong>${item.label}</strong>
      <small>${formatNumber(item.priceGold)} 金幣｜持有 ${formatNumber(item.owned)}｜${amountHint}</small>
    `;
    grid.appendChild(button);
  }
}

function renderStorage(storage) {
  const panel = $("webStorage");
  const select = $("storageItem");
  const grid = $("storageGrid");
  panel.classList.toggle("disabled-panel", !storage || !storage.enabled);
  setText("storageState", storage && storage.enabled ? "可使用" : "營地可用");
  select.innerHTML = "";
  grid.innerHTML = "";
  const items = storage && storage.items ? storage.items : [];
  if (!items.length) {
    select.innerHTML = `<option value="">沒有可存取物品</option>`;
    grid.innerHTML = `<div class="empty">倉庫目前沒有可顯示物品</div>`;
    return;
  }
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.label}｜身上 ${formatNumber(item.carried)}｜倉庫 ${formatNumber(item.stored)}`;
    select.appendChild(option);

    const card = document.createElement("div");
    card.className = "storage-card";
    card.innerHTML = `<strong>${getItemIcon(item.id)} ${item.label}</strong><span>身上 ${formatNumber(item.carried)}｜倉庫 ${formatNumber(item.stored)}</span>`;
    grid.appendChild(card);
  }
}

function renderUndergroundInn(inn) {
  const panel = $("webInn");
  const grid = $("innGrid");
  panel.classList.toggle("disabled-panel", !inn || !inn.enabled);
  setText("innState", inn && inn.enabled ? "地底可用" : "地底可用");
  setText("innResource", `顛倒礦石 ${formatNumber(inn && inn.invertedOre)}｜顛倒寶石 ${formatNumber(inn && inn.invertedGem)}`);
  grid.innerHTML = "";
  if (!inn || !inn.items || !inn.items.length) {
    grid.innerHTML = `<div class="empty">客棧今日沒有商品</div>`;
    return;
  }
  for (const item of inn.items) {
    const button = document.createElement("button");
    button.className = "shop-item-button";
    button.dataset.action = "innBuy";
    button.dataset.itemId = item.id;
    button.disabled = item.disabled;
    const resourceLabel = item.resource === "invertedOre" ? "顛倒礦石" : "顛倒寶石";
    button.innerHTML = `
      <span>${item.resource === "invertedOre" ? "🌀" : "💠"}</span>
      <strong>${item.label}</strong>
      <small>${formatNumber(item.price)} ${resourceLabel}｜${item.description || ""}</small>
    `;
    grid.appendChild(button);
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
    normalFeed: "🌾",
    gourmetFeed: "🍖",
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

function getAreaIcon(area = "", cave = "") {
  const text = `${area} ${cave}`;
  if (text.includes("天") || text.includes("天空")) return "☁️";
  if (text.includes("地底") || text.includes("地下")) return "🌋";
  if (text.includes("寶石")) return "💎";
  if (text.includes("猛禽")) return "🦅";
  if (text.includes("顛倒") || text.includes("反轉")) return "🌀";
  return "⛏️";
}

function renderMineScene(payload) {
  const { summary, stateFlags, digPathOptions } = payload;
  const art = $("mineArt");
  const routeStrip = $("routeStrip");
  const areaText = `${summary.area}｜${summary.cave}`;
  setText("sceneArea", areaText);
  setText("sceneDepth", summary.depthLabel || `${summary.depth} 層`);

  const areaIcon = getAreaIcon(summary.area, summary.cave);
  let statusLine = `${areaIcon} ${summary.runMode || "尚未選詞條"}`;
  let center = "⛏️";
  if (summary.dead) {
    statusLine = "💀 探險中斷";
    center = "💀";
  } else if (stateFlags.needsTrait) {
    statusLine = "🏕️ 選一個詞條開始";
    center = "🏕️";
  } else if (stateFlags.hasPendingEvent) {
    statusLine = "⚠️ 事件發生中";
    center = "⚠️";
  } else if (stateFlags.hasSupplyStation) {
    statusLine = "🏪 補給站";
    center = "🏪";
  }

  art.innerHTML = `
    <div class="mine-row ceiling">🪨 🪨 🪨 🪨 🪨 🪨 🪨</div>
    <div class="mine-row tunnel">⬛ ⬛ ${center} ⬛ ⬛</div>
    <div class="mine-row vein">💰 🪨 💎 🪨 💣 🪨 💰</div>
    <div class="scene-status">${statusLine}</div>
  `;

  routeStrip.innerHTML = "";
  if (digPathOptions && digPathOptions.length) {
    const sideIcon = { left: "←", middle: "↓", right: "→" };
    for (const path of digPathOptions) {
      const chip = document.createElement("span");
      chip.className = "route-chip";
      chip.textContent = `${sideIcon[path.side] || "•"} ${path.label}`;
      routeStrip.appendChild(chip);
    }
    return;
  }
  routeStrip.innerHTML = `<span class="route-chip muted-chip">路線：無</span>`;
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

function showActionMessage(message, ok = true) {
  const box = $("actionMessage");
  if (!message) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.textContent = message;
  box.classList.toggle("bad", !ok);
  box.classList.remove("hidden");
}

function makeActionButton(label, action, options = {}) {
  const button = document.createElement("button");
  button.className = `action-button ${options.kind || ""}`.trim();
  button.textContent = label;
  button.dataset.action = action;
  if (options.feedType) button.dataset.feedType = options.feedType;
  if (options.disabled) button.disabled = true;
  return button;
}

function clearEventCountdown() {
  if (state.eventCountdownTimer) {
    clearInterval(state.eventCountdownTimer);
    state.eventCountdownTimer = null;
  }
}

function getChallengeLabel(type) {
  const labels = {
    qte: "QTE",
    memory: "記憶",
    timing: "時機",
    lockpick: "開鎖",
    escape: "逃跑",
    puzzle: "拼圖"
  };
  return labels[type] || (type ? "限時" : "事件");
}

function startEventCountdown(eventData) {
  clearEventCountdown();
  if (!eventData || !eventData.expiresAt) return;
  const fill = $("eventCountdownFill");
  const text = $("eventCountdownText");
  const total = Math.max(1000, Number(eventData.durationMs || eventData.expiresAt - (eventData.startedAt || Date.now())));
  const tick = () => {
    const left = Math.max(0, Number(eventData.expiresAt) - Date.now());
    const ratio = Math.max(0, Math.min(1, left / total));
    if (fill) {
      fill.style.width = `${Math.round(ratio * 100)}%`;
      fill.classList.toggle("danger", ratio <= 0.35);
    }
    if (text) text.textContent = left > 0 ? `${Math.ceil(left / 1000)} 秒` : "超時";
    if (left <= 0) clearEventCountdown();
  };
  tick();
  state.eventCountdownTimer = setInterval(tick, 250);
}

function renderActions(payload) {
  const { stateFlags, runModeOptions, digPathOptions, pendingEvent, supplyStation } = payload;
  const traitPicker = $("traitPicker");
  const actionGrid = $("actionGrid");
  clearEventCountdown();
  traitPicker.innerHTML = "";
  actionGrid.innerHTML = "";

  $("bankConsole").classList.toggle("disabled-panel", !stateFlags.canUseBank);

  if (pendingEvent) {
    traitPicker.classList.add("hidden");
    const eventBox = document.createElement("div");
    eventBox.className = `web-event-card ${pendingEvent.challengeType ? "challenge-card" : ""}`;
    const countdown = pendingEvent.expiresAt
      ? `<span id="eventCountdownText">限時</span>`
      : "";
    const challengeInfo = pendingEvent.challengeType
      ? `
        <div class="challenge-panel">
          <div class="challenge-meter"><i id="eventCountdownFill"></i></div>
          <div class="challenge-meta">
            <b>${getChallengeLabel(pendingEvent.challengeType)}</b>
            ${pendingEvent.durability ? `<span>鐵絲 ${formatNumber(pendingEvent.durability)}｜嘗試 ${formatNumber(pendingEvent.attempts || 0)}</span>` : "<span>快速判斷</span>"}
          </div>
        </div>
      `
      : "";
    eventBox.innerHTML = `
      <div class="web-event-head">
        <strong>${pendingEvent.title}</strong>
        ${countdown}
      </div>
      <p>${pendingEvent.description || "事件發生中。"}</p>
      ${pendingEvent.hint ? `<small>${pendingEvent.hint}</small>` : ""}
      ${challengeInfo}
    `;
    actionGrid.appendChild(eventBox);
    startEventCountdown(pendingEvent);
    for (const choice of pendingEvent.choices || []) {
      const button = makeActionButton(choice.label, "eventChoice", {
        kind: choice.kind || (pendingEvent.challengeType ? "primary" : "")
      });
      button.dataset.choice = choice.id;
      actionGrid.appendChild(button);
    }
    return;
  }

  if (supplyStation) {
    traitPicker.classList.add("hidden");
    const stationBox = document.createElement("div");
    stationBox.className = "web-event-card supply-card";
    stationBox.innerHTML = `
      <div class="web-event-head">
        <strong>🏪 ${supplyStation.title}</strong>
        <span>第 ${formatNumber(supplyStation.depth)} 層</span>
      </div>
      <p>金幣：${formatNumber(payload.summary.gold)}｜買完或賣完可離開繼續挖。</p>
    `;
    actionGrid.appendChild(stationBox);
    for (const item of supplyStation.items || []) {
      const button = makeActionButton(`${item.emoji || "📦"} ${item.label}｜${formatNumber(item.price)}｜庫存 ${formatNumber(item.stock)}`, "supplyBuy", {
        kind: item.type === "potion" ? "safe" : "primary",
        disabled: item.disabled
      });
      button.dataset.itemId = item.id;
      actionGrid.appendChild(button);
    }
    for (const offer of supplyStation.sellOffers || []) {
      const button = makeActionButton(`💰 賣 ${offer.label}｜+${formatNumber(offer.price)}`, "supplySell", {
        disabled: offer.disabled
      });
      button.dataset.buff = offer.buff;
      actionGrid.appendChild(button);
    }
    actionGrid.appendChild(makeActionButton("🚪 離開補給站", "supplyLeave", { kind: "danger" }));
    return;
  }

  if (stateFlags.needsTrait && runModeOptions.length) {
    traitPicker.classList.remove("hidden");
    for (const trait of runModeOptions) {
      const button = document.createElement("button");
      button.className = "trait-option";
      button.dataset.action = "chooseTrait";
      button.dataset.traitId = trait.id;
      button.innerHTML = `<strong>${trait.name}</strong><span>${trait.description || "選擇後開始本輪"}</span>`;
      traitPicker.appendChild(button);
    }
  } else {
    traitPicker.classList.add("hidden");
  }

  if (stateFlags.canMine && digPathOptions && digPathOptions.length) {
    const sideIcon = { left: "⬅️", middle: "⬇️", right: "➡️" };
    const sideName = { left: "左", middle: "中", right: "右" };
    for (const path of digPathOptions) {
      const button = makeActionButton(`${sideIcon[path.side] || "⛏️"} ${sideName[path.side] || "路"}：${path.label}`, "mine", {
        kind: path.side === "right" ? "danger" : "primary"
      });
      button.dataset.path = path.side;
      actionGrid.appendChild(button);
    }
  } else {
    actionGrid.appendChild(makeActionButton("⛏️ 挖礦", "mine", {
      kind: "primary",
      disabled: !stateFlags.canMine
    }));
  }
  actionGrid.appendChild(makeActionButton("↩️ 返回地面", "returnSurface", {
    disabled: !stateFlags.canReturn
  }));
  actionGrid.appendChild(makeActionButton(`🧪 喝藥水 x${formatNumber(getInventoryCount("healingPotion"))}`, "drinkPotion", {
    disabled: !stateFlags.canDrinkPotion
  }));
  actionGrid.appendChild(makeActionButton(`🍖 餵普通 x${formatNumber(getInventoryCount("normalFeed"))}`, "feedChicken", {
    feedType: "normalFeed",
    disabled: !stateFlags.canFeedChicken || getInventoryCount("normalFeed") <= 0
  }));
  actionGrid.appendChild(makeActionButton(`✨ 餵好吃 x${formatNumber(getInventoryCount("gourmetFeed"))}`, "feedChicken", {
    feedType: "gourmetFeed",
    disabled: !stateFlags.canFeedChicken || getInventoryCount("gourmetFeed") <= 0
  }));
  actionGrid.appendChild(makeActionButton("🧹 掃大便", "cleanCoop", {
    disabled: !stateFlags.canCleanCoop
  }));

  if (stateFlags.hasPendingEvent) {
    showActionMessage("目前遇到事件，事件選項仍需回 Discord 處理。", false);
  }
  if (stateFlags.hasSupplyStation) {
    showActionMessage("目前在補給站，購買或離開仍需回 Discord 處理。", false);
  }
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

  renderMineScene(payload);
  renderInventory(inventory, summary.bagUsed, summary.bagCapacity);
  renderQuickBag(inventory, summary.bagUsed, summary.bagCapacity);
  renderShop(payload.shop);
  renderStorage(payload.storage);
  renderUndergroundInn(payload.undergroundInn);
  renderChicken(chicken);
  renderActions(payload);
  renderCollection(collection, summary);
  state.lastSyncAt = new Date();
  setText("lastUpdated", `同步：${state.lastSyncAt.toLocaleTimeString("zh-Hant-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
  renderLeaderboard(state.leaderboard);
  setActiveTab(state.tab);
}

async function postAction(action, payload = {}) {
  showActionMessage("處理中...");
  try {
    const response = await fetch("/api/action", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    if (response.status === 401) {
      showNotice("請重新登入 Discord。");
      return;
    }
    const body = await response.json();
    if (!body.ok && !body.data) {
      showActionMessage(body.message || "操作失敗。", false);
      return;
    }
    if (body.data) {
      state.data = body.data;
      await loadLeaderboard();
      renderDashboard(body.data);
    }
    showActionMessage(body.message || "完成。", body.ok);
  } catch {
    showActionMessage("操作失敗，稍後再試。", false);
  }
}

async function loadMe(options = {}) {
  const { silent = false } = options;
  if (state.loading) return;
  state.loading = true;
  if (!silent) setRefreshButtonLoading(true);
  const params = new URLSearchParams(location.search);
  if (params.get("login")) {
    showNotice("Discord 登入尚未完成，請確認 OAuth Redirect URI 和環境變數。");
  } else {
    hideNotice();
  }
  try {
    const response = await fetch("/api/me", { credentials: "include", cache: "no-store" });
    if (response.status === 401) return;
    const body = await response.json();
    if (!body.ok) {
      showNotice(`讀取資料失敗：${body.message || "server_error"}`);
      return;
    }
    state.data = body.data;
    await loadLeaderboard();
    renderDashboard(body.data);
    if (!params.get("login")) hideNotice();
  } catch {
    if (!silent) showNotice("讀取資料失敗，稍後再試。");
  } finally {
    state.loading = false;
    if (!silent) setRefreshButtonLoading(false);
  }
}

async function loadLeaderboard() {
  const response = await fetch("/api/leaderboard", { credentials: "include", cache: "no-store" });
  if (response.status === 401) return;
  const body = await response.json();
  if (body.ok) state.leaderboard = body.data;
}

function startAutoSync() {
  if (state.autoSyncTimer) clearInterval(state.autoSyncTimer);
  state.autoSyncTimer = setInterval(() => {
    if (document.hidden || !state.data) return;
    loadMe({ silent: true });
  }, AUTO_SYNC_INTERVAL_MS);
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

$("dashboard").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === "chooseTrait") {
    postAction(action, { traitId: button.dataset.traitId });
    return;
  }
  if (action === "feedChicken") {
    postAction(action, { feedType: button.dataset.feedType || "normalFeed" });
    return;
  }
  if (action === "mine") {
    postAction(action, { path: button.dataset.path || null });
    return;
  }
  if (action === "eventChoice") {
    postAction(action, { choice: button.dataset.choice || "" });
    return;
  }
  if (action === "bankDeposit" || action === "bankWithdraw") {
    const input = $("bankAmount");
    postAction(action, { amount: input.value || null });
    input.value = "";
    return;
  }
  if (action === "supplyBuy") {
    postAction(action, { itemId: button.dataset.itemId || "" });
    return;
  }
  if (action === "supplySell") {
    postAction(action, { buff: button.dataset.buff || "" });
    return;
  }
  if (action === "shopBuy") {
    const amount = $("shopAmount").value || 1;
    postAction(action, { itemId: button.dataset.itemId || "", amount });
    $("shopAmount").value = "";
    return;
  }
  if (action === "storageDeposit" || action === "storageWithdraw") {
    const itemId = $("storageItem").value || "";
    const amount = $("storageAmount").value || null;
    postAction(action, { itemId, amount });
    $("storageAmount").value = "";
    return;
  }
  if (action === "innBuy") {
    postAction(action, { itemId: button.dataset.itemId || "" });
    return;
  }
  postAction(action);
});

$("refreshButton").addEventListener("click", () => {
  loadMe().catch(() => showNotice("刷新失敗，稍後再試。"));
});

$("logoutButton").addEventListener("click", () => {
  location.href = "/logout";
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.data) loadMe({ silent: true });
});

startAutoSync();
loadMe();

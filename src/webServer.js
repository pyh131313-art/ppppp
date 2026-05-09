"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URLSearchParams } = require("node:url");

require("dotenv").config();

const { CONFIG } = require("./config");
const { cleanEnvValue } = require("./env");
const {
  buySupplyStationItem,
  buyShopItem,
  chooseRunMode,
  depositBank,
  depositUndergroundStorage,
  drinkHealingPotion,
  getAreaLabel,
  getBagCapacity,
  getBagUsedSlots,
  getCaveLabel,
  getCollectionTotal,
  getCollectionUniqueCount,
  getDepthLabel,
  getDigPathOptions,
  getMaxBombs,
  getMagicCandyPrice,
  getPlayer,
  getRandomEvent,
  getRunModeOptions,
  getRunModeLabel,
  getCommunityProgress,
  getShopConsumables,
  getShopItems,
  getSupplyStationView,
  getTotalAsset,
  getUndergroundInnSnapshot,
  leaveSupplyStation,
  mine,
  openUndergroundInn,
  resolveEventChallenge,
  resolveRandomEvent,
  returnToSurface,
  sellSupplyStationBuff,
  withdrawBank,
  withdrawUndergroundStorage,
  buyUndergroundInnItem
} = require("./game");
const {
  cleanChickenCoop,
  feedChicken,
  getChickenRequiredExp,
  getChickenStage,
  normalizeOwnedChicken
} = require("./chickenCare");
const {
  getGlobalStateFromPlayers,
  setGlobalStateToPlayers
} = require("./globalState");
const { loadPlayers, updatePlayer, updatePlayers } = require("./storage");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const ASSET_DIR = path.join(__dirname, "..");
const DEFAULT_PORT = 3000;
const SESSION_COOKIE = "mine_web_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const serverState = { server: null };
const WEB_STORAGE_ITEMS = [
  ["ore", "普通礦石"],
  ["goldOre", "金礦石"],
  ["platinumOre", "鉑金礦石"],
  ["goldBlock", "金塊"],
  ["oreIngot", "礦錠"],
  ["goldOreIngot", "金錠"],
  ["platinumOreIngot", "鉑金錠"],
  ["bombItem", "完整炸彈"],
  ["junk", "超級破爛"],
  ["redGem", "紅寶石"],
  ["blueGem", "藍寶石"],
  ["greenGem", "綠寶石"],
  ["invertedOre", "顛倒礦石"],
  ["invertedGem", "顛倒寶石"],
  ["orichalcum", "奧利哈鋼"],
  ["platinumJunk", "白金破爛"],
  ["minerHelmetCount", "礦工帽"],
  ["healingPotion", "治療藥水"],
  ["magicCandy", "神奇糖果"],
  ["quickChickenBall", "先機球"],
  ["undyingTotem", "不死圖騰"],
  ["chickenTraitTickets", "賽雞詞條權"]
];

function getSessionSecret() {
  return cleanEnvValue(process.env.WEB_SESSION_SECRET)
    || cleanEnvValue(process.env.DISCORD_CLIENT_SECRET)
    || cleanEnvValue(process.env.DISCORD_TOKEN)
    || "local-dev-session-secret";
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function createSession(user) {
  const payload = base64UrlEncode(JSON.stringify({
    id: String(user.id),
    username: String(user.username || ""),
    globalName: String(user.global_name || user.globalName || ""),
    avatar: user.avatar ? String(user.avatar) : "",
    exp: Date.now() + SESSION_TTL_MS
  }));
  return `${payload}.${signPayload(payload)}`;
}

function readCookies(request) {
  const raw = request.headers.cookie || "";
  return Object.fromEntries(raw
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf("=");
      if (index < 0) return [item, ""];
      return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
    }));
}

function getSessionUser(request) {
  const cookie = readCookies(request)[SESSION_COOKIE];
  if (!cookie || !cookie.includes(".")) return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || signPayload(payload) !== signature) return null;
  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (!session.id || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(body);
}

function sendJson(response, statusCode, body) {
  send(response, statusCode, JSON.stringify(body), {
    "Content-Type": "application/json; charset=utf-8"
  });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function redirect(response, location, headers = {}) {
  send(response, 302, "", {
    Location: location,
    ...headers
  });
}

function getRequestUrl(request) {
  const host = request.headers["x-forwarded-host"] || request.headers.host || `localhost:${getPort()}`;
  const protocol = request.headers["x-forwarded-proto"] || "http";
  return new URL(request.url, `${protocol}://${host}`);
}

function getPublicBaseUrl(request) {
  const configured = cleanEnvValue(process.env.WEB_PUBLIC_BASE_URL);
  if (configured) return configured.replace(/\/+$/g, "");
  const url = getRequestUrl(request);
  return `${url.protocol}//${url.host}`;
}

function getRedirectUri(request) {
  return cleanEnvValue(process.env.DISCORD_REDIRECT_URI)
    || `${getPublicBaseUrl(request)}/auth/discord/callback`;
}

function getDiscordAvatarUrl(user) {
  if (!user || !user.id || !user.avatar) return "";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function getHpText(player) {
  const maxHp = getMaxBombs(player);
  const damage = Number(player.bombs || 0);
  const current = Math.max(0, maxHp - damage);
  return `${current}/${maxHp}`;
}

function getRunModeText(player) {
  if (!player.runMode) return "未選擇";
  return getRunModeLabel(player.runMode);
}

function getChickenSummary(player) {
  if (!player.ownedChicken) return null;
  const chicken = normalizeOwnedChicken(player.ownedChicken);
  return {
    name: chicken.name,
    icon: chicken.icon || "🐔",
    level: chicken.level || 1,
    exp: chicken.exp || 0,
    requiredExp: getChickenRequiredExp(chicken),
    stage: getChickenStage(chicken).label,
    personalityId: chicken.personalityId,
    speed: chicken.speed || 0,
    sprint: chicken.sprint || 0,
    stability: chicken.stability || 0,
    stamina: chicken.stamina || 0,
    wins: chicken.wins || 0,
    races: chicken.races || 0,
    mood: chicken.chickenMood,
    health: chicken.chickenHealth,
    hunger: chicken.chickenHunger,
    poop: chicken.chickenPoop,
    evolution: chicken.evolutionType || "未定",
    secondEvolution: chicken.secondEvolution && chicken.secondEvolution.title ? chicken.secondEvolution.title : "未定",
    skill: [chicken.activeSkill, chicken.passiveSkill].filter(Boolean).join("｜") || "無"
  };
}

function getInventoryItems(player) {
  const labels = {
    ore: "普通礦石",
    goldOre: "金礦石",
    platinumOre: "鉑金礦石",
    oreIngot: "礦錠",
    goldOreIngot: "金錠",
    platinumOreIngot: "鉑金錠",
    redGem: "紅寶石",
    blueGem: "藍寶石",
    greenGem: "綠寶石",
    invertedOre: "顛倒礦石",
    invertedGem: "顛倒寶石",
    orichalcum: "奧利哈鋼",
    bombItem: "完整炸彈",
    minerHelmetCount: "礦工帽",
    healingPotion: "治療藥水",
    magicCandy: "神奇糖果",
    normalFeed: "普通飼料",
    gourmetFeed: "超好吃飼料",
    quickChickenBall: "先雞球",
    thickSoleShoes: "厚底鞋",
    guaranteedGemCaveTicket: "寶石洞券",
    guaranteedRaptorCaveTicket: "猛禽洞券",
    undyingTotem: "不死圖騰",
    junk: "破爛",
    platinumJunk: "白金破爛"
  };
  return Object.entries(labels)
    .map(([key, label]) => ({ key, label, count: Math.max(0, Math.floor(player[key] || 0)) }))
    .filter((item) => item.count > 0);
}

function getCollectionItems(player) {
  return CONFIG.collectibles.map((item) => ({
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    count: Math.max(0, Math.floor(player.collection[item.id] || 0)),
    image: item.image ? `/${item.image}` : ""
  }));
}

function getProgressWithGlobal(players) {
  return {
    ...getCommunityProgress(players),
    globalState: getGlobalStateFromPlayers(players)
  };
}

function buildPlayerPayload(user, playerInput, progressInput = {}) {
  const player = getPlayer(playerInput);
  const pendingEvent = getWebPendingEvent(player);
  const supplyStation = getSupplyStationView(player);
  const shop = getWebShop(player, progressInput);
  const storage = getWebStorage(player);
  const undergroundInn = getWebUndergroundInn(player, progressInput);
  return {
    user: {
      id: user.id,
      username: user.username,
      globalName: user.globalName || user.global_name || "",
      avatarUrl: getDiscordAvatarUrl(user)
    },
    summary: {
      gold: player.gold,
      bankGold: player.bankGold,
      totalAsset: getTotalAsset(player),
      hp: getHpText(player),
      dead: player.dead,
      depth: player.depth,
      runDepthProgress: player.runDepthProgress,
      bestDepth: player.stats.bestDepth,
      area: getAreaLabel(player),
      cave: getCaveLabel(player),
      depthLabel: getDepthLabel(player),
      runMode: getRunModeText(player),
      bagUsed: getBagUsedSlots(player),
      bagCapacity: getBagCapacity(player),
      mines: player.stats.totalMines,
      deaths: player.stats.deaths,
      collectionTotal: getCollectionTotal(player),
      collectionUnique: getCollectionUniqueCount(player),
      challengeBestDepth: player.challengeBestDepth || 0
    },
    runModeOptions: getRunModeOptions(player).map((mode) => ({
      id: mode.id,
      name: mode.label || mode.name || mode.id,
      description: mode.shortDescription || ""
    })),
    digPathOptions: player.runMode && player.zone !== "upward"
      ? getDigPathOptions(player).map((path) => ({
        side: path.side,
        id: path.id,
        label: path.label
      }))
      : [],
    pendingEvent,
    supplyStation,
    shop,
    storage,
    undergroundInn,
    stateFlags: {
      hasPendingEvent: Boolean(player.pendingEvent),
      hasSupplyStation: Boolean(player.supplyStation),
      canUseBank: Boolean(!player.dead && (!player.runMode || player.zone === "undergroundCamp")),
      canUseShop: Boolean(!player.dead && !player.runMode),
      canUseStorage: Boolean(!player.dead && ["surface", "undergroundCamp", "skyCamp"].includes(player.zone)),
      canUseUndergroundInn: Boolean(!player.dead && player.zone === "undergroundCamp"),
      canMine: Boolean(player.runMode && !player.dead && !player.pendingEvent && !player.supplyStation),
      needsTrait: Boolean(!player.runMode && !player.dead),
      canReturn: Boolean(player.runMode || player.depth !== 0 || player.runDepthProgress !== 0 || player.zone !== "surface"),
      canDrinkPotion: Boolean(player.runMode && !player.dead && player.healingPotion > 0),
      canFeedChicken: Boolean(player.ownedChicken),
      canCleanCoop: Boolean(player.ownedChicken)
    },
    inventory: getInventoryItems(player),
    collection: getCollectionItems(player),
    chicken: getChickenSummary(player)
  };
}

function getWebStorage(player) {
  const enabled = Boolean(!player.dead && ["surface", "undergroundCamp", "skyCamp"].includes(player.zone));
  return {
    enabled,
    items: WEB_STORAGE_ITEMS.map(([id, label]) => ({
      id,
      label,
      carried: Math.max(0, Math.floor(player[id] || 0)),
      stored: Math.max(0, Math.floor(player.undergroundStorage && player.undergroundStorage[id] || 0))
    })).filter((item) => item.carried > 0 || item.stored > 0)
  };
}

function getWebUndergroundInn(player, progressInput = {}) {
  const enabled = Boolean(!player.dead && player.zone === "undergroundCamp");
  const snapshot = getUndergroundInnSnapshot(progressInput.globalState, progressInput.now || Date.now());
  return {
    enabled,
    invertedOre: Math.max(0, Math.floor(player.invertedOre || 0)),
    invertedGem: Math.max(0, Math.floor(player.invertedGem || 0)),
    items: snapshot.items.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      resource: item.resource,
      price: item.price,
      disabled: !enabled || (player[item.resource] || 0) < item.price
    }))
  };
}

function getWebShop(player, progressInput = {}) {
  const progress = {
    healingPotionUnlocked: false,
    undyingTotemUnlocked: false,
    ...progressInput
  };
  const consumables = getShopConsumables(progress).map((item) => {
    const priceGold = item.id === "magicCandy" ? getMagicCandyPrice(player) : item.priceGold;
    return {
      id: item.id,
      label: item.label,
      priceGold,
      owned: Math.max(0, Math.floor(player[item.id] || 0)),
      category: /normalFeed|gourmetFeed|chickenMedicine|autoCleaner|magicCandy/.test(item.id) ? "chicken" : "mining",
      multiBuy: item.id === "healingPotion" || item.id === "undyingTotem",
      disabled: player.gold < priceGold
    };
  });
  const collectibles = getShopItems().slice(0, 3).map((item) => ({
    id: item.id,
    label: item.collectible.name,
    priceGold: item.priceGold,
    owned: Math.max(0, Math.floor(player.collection[item.id] || 0)),
    category: "collectible",
    multiBuy: false,
    disabled: player.gold < item.priceGold
  }));
  return {
    enabled: Boolean(!player.dead && !player.runMode),
    progress: {
      bestDepth: progress.bestDepth || 0,
      deaths: progress.deaths || 0,
      healingPotionUnlocked: Boolean(progress.healingPotionUnlocked),
      undyingTotemUnlocked: Boolean(progress.undyingTotemUnlocked)
    },
    items: [...collectibles, ...consumables]
  };
}

function getWebPendingEvent(player) {
  if (!player.pendingEvent) return null;
  const event = getRandomEvent(player.pendingEvent);
  if (!event) return null;
  const buttons = event.buttons || { risk: "冒險選項", safe: "保守選項" };
  let choices = [];
  if (player.eventChallenge && Array.isArray(player.eventChallenge.choices) && player.eventChallenge.choices.length > 0) {
    choices = player.eventChallenge.choices.map((choice) => ({
      id: choice.id,
      label: choice.label
    }));
  } else {
    const labels = { ...buttons };
    if (player.wildChickenEncounter && player.pendingEvent.includes("chicken")) {
      if (player.wildChickenEncounter.captureConfirm) {
        labels.extreme = "確認烤雞捕捉";
        labels.safe = "取消";
      } else if (player.wildChickenEncounter.raceWeakened) {
        labels.extreme = "趁機捕捉";
        labels.safe = "放過";
      }
    }
    choices = [
      labels.risk ? { id: "risk", label: labels.risk, kind: "danger" } : null,
      labels.safe ? { id: "safe", label: labels.safe, kind: "safe" } : null,
      labels.extreme ? { id: "extreme", label: labels.extreme, kind: "danger" } : null
    ].filter(Boolean);
  }
  return {
    id: player.pendingEvent,
    title: event.title || "事件",
    description: event.description || "",
    challengeType: player.eventChallenge ? player.eventChallenge.type : "",
    hint: player.eventChallenge ? player.eventChallenge.hint || "" : "",
    startedAt: player.eventChallenge ? player.eventChallenge.startedAt || 0 : 0,
    expiresAt: player.eventChallenge ? player.eventChallenge.expiresAt || 0 : 0,
    durationMs: player.eventChallenge && player.eventChallenge.expiresAt && player.eventChallenge.startedAt
      ? Math.max(1000, player.eventChallenge.expiresAt - player.eventChallenge.startedAt)
      : 0,
    durability: player.eventChallenge ? player.eventChallenge.durability || 0 : 0,
    attempts: player.eventChallenge ? player.eventChallenge.attempts || 0 : 0,
    choices
  };
}

function getMaskedPlayerName(userId, currentUserId) {
  if (String(userId) === String(currentUserId)) return "你";
  const id = String(userId || "");
  return `玩家 ${id.slice(-4) || "????"}`;
}

function buildLeaderboardPayload(playersInput, currentUserId) {
  const entries = Object.entries(playersInput || {}).map(([userId, playerInput]) => {
    const player = getPlayer(playerInput);
    const chicken = player.ownedChicken ? normalizeOwnedChicken(player.ownedChicken) : null;
    return {
      userId,
      name: getMaskedPlayerName(userId, currentUserId),
      bestDepth: Math.max(0, Math.floor(player.stats.bestDepth || 0)),
      totalAsset: getTotalAsset(player),
      challengeBestDepth: Math.max(0, Math.floor(player.challengeBestDepth || 0)),
      chickenWins: chicken ? Math.max(0, Math.floor(chicken.wins || 0)) : 0,
      chickenName: chicken ? chicken.name : ""
    };
  });
  const sortBy = (key) => entries
    .slice()
    .sort((a, b) => (b[key] || 0) - (a[key] || 0))
    .slice(0, 10);
  return {
    bestDepth: sortBy("bestDepth"),
    totalAsset: sortBy("totalAsset"),
    challengeBestDepth: sortBy("challengeBestDepth"),
    chickenWins: sortBy("chickenWins")
  };
}

async function handleApiMe(request, response) {
  const sessionUser = getSessionUser(request);
  if (!sessionUser) {
    sendJson(response, 401, { ok: false, message: "not_logged_in" });
    return;
  }
  const players = await loadPlayers();
  const progress = getProgressWithGlobal(players);
  sendJson(response, 200, {
    ok: true,
    data: buildPlayerPayload(sessionUser, players[sessionUser.id], progress)
  });
}

async function handleApiLeaderboard(request, response) {
  const sessionUser = getSessionUser(request);
  if (!sessionUser) {
    sendJson(response, 401, { ok: false, message: "not_logged_in" });
    return;
  }
  const players = await loadPlayers();
  sendJson(response, 200, {
    ok: true,
    data: buildLeaderboardPayload(players, sessionUser.id)
  });
}

function buildActionResponse(sessionUser, player, message, ok = true) {
  return {
    ok,
    message,
    data: buildPlayerPayload(sessionUser, player)
  };
}

function buildActionResponseWithProgress(sessionUser, player, players, message, ok = true) {
  return {
    ok,
    message,
    data: buildPlayerPayload(sessionUser, player, getProgressWithGlobal(players))
  };
}

async function handleApiAction(request, response) {
  const sessionUser = getSessionUser(request);
  if (!sessionUser) {
    sendJson(response, 401, { ok: false, message: "not_logged_in" });
    return;
  }

  const body = await readJsonBody(request);
  const action = String(body.action || "");
  let resultPlayer = null;
  let message = "";
  let ok = true;

  if (action === "chooseTrait") {
    const traitId = String(body.traitId || "");
    const result = await updatePlayer(sessionUser.id, (player) => {
      const chosen = chooseRunMode(player, traitId, Math.random);
      resultPlayer = chosen.player;
      message = chosen.message;
      ok = chosen.ok !== false;
      return chosen.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "mine") {
    await updatePlayers((players) => {
      const outcome = mine(players[sessionUser.id], Math.random, Date.now(), body.path || null);
      resultPlayer = outcome.player;
      message = `${outcome.title || "挖礦"}\n${outcome.message || ""}`.trim();
      ok = outcome.kind !== "blocked";
      players[sessionUser.id] = outcome.player;
      return players;
    });
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "returnSurface") {
    await updatePlayers((players) => {
      const globalState = getGlobalStateFromPlayers(players);
      const result = returnToSurface(players[sessionUser.id], Math.random, globalState, Date.now());
      resultPlayer = result.player;
      message = result.message;
      ok = result.ok !== false;
      players[sessionUser.id] = result.player;
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
      return players;
    });
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "bankDeposit" || action === "bankWithdraw") {
    const amount = body.amount === null || body.amount === undefined || body.amount === ""
      ? null
      : Number(body.amount);
    const result = await updatePlayer(sessionUser.id, (player) => {
      const applied = action === "bankDeposit"
        ? depositBank(player, amount)
        : withdrawBank(player, amount);
      resultPlayer = applied.player;
      message = applied.message;
      ok = applied.ok !== false;
      return applied.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "shopBuy") {
    const itemId = String(body.itemId || "");
    const amount = Math.max(1, Math.floor(Number(body.amount || 1)));
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const result = buyShopItem(players[sessionUser.id], itemId, amount, progress);
      resultPlayer = result.player;
      message = result.message;
      ok = result.ok !== false;
      players[sessionUser.id] = result.player;
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
      return players;
    });
    const latestPlayers = await loadPlayers();
    sendJson(response, 200, buildActionResponseWithProgress(sessionUser, resultPlayer, latestPlayers, message, ok));
    return;
  }

  if (action === "storageDeposit" || action === "storageWithdraw") {
    const itemId = String(body.itemId || "");
    const amount = body.amount === null || body.amount === undefined || body.amount === ""
      ? null
      : Number(body.amount);
    const result = await updatePlayer(sessionUser.id, (player) => {
      const applied = action === "storageDeposit"
        ? depositUndergroundStorage(player, itemId || null, amount)
        : withdrawUndergroundStorage(player, itemId || null, amount);
      resultPlayer = applied.player;
      message = applied.message;
      ok = applied.ok !== false;
      return applied.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "innBuy") {
    const itemId = String(body.itemId || "");
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const opened = openUndergroundInn(players[sessionUser.id], progress.globalState, Date.now());
      const result = opened.ok
        ? buyUndergroundInnItem(opened.player, itemId, opened.globalState, Date.now())
        : opened;
      resultPlayer = result.player;
      message = result.message;
      ok = result.ok !== false;
      players[sessionUser.id] = result.player;
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
      return players;
    });
    const latestPlayers = await loadPlayers();
    sendJson(response, 200, buildActionResponseWithProgress(sessionUser, resultPlayer, latestPlayers, message, ok));
    return;
  }

  if (action === "supplyBuy" || action === "supplySell" || action === "supplyLeave") {
    const result = await updatePlayer(sessionUser.id, (player) => {
      const applied = action === "supplyBuy"
        ? buySupplyStationItem(player, String(body.itemId || ""))
        : action === "supplySell"
          ? sellSupplyStationBuff(player, String(body.buff || ""))
          : leaveSupplyStation(player);
      resultPlayer = applied.player;
      message = applied.message;
      ok = applied.ok !== false;
      return applied.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "eventChoice") {
    const choice = String(body.choice || "");
    await updatePlayers((players) => {
      const player = getPlayer(players[sessionUser.id]);
      const result = player.eventChallenge
        ? resolveEventChallenge(player, choice, Math.random, Date.now())
        : resolveRandomEvent(player, choice, Math.random, Date.now());
      resultPlayer = result.player;
      message = `${result.title || "事件"}\n${result.message || ""}`.trim();
      if (result.announcement) message = `${message}\n\n${result.announcement.replace("<@PLAYER>", sessionUser.globalName || sessionUser.username || "你")}`;
      ok = result.ok !== false;
      players[sessionUser.id] = result.player;
      return players;
    });
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "drinkPotion") {
    const result = await updatePlayer(sessionUser.id, (player) => {
      const used = drinkHealingPotion(player);
      resultPlayer = used.player;
      message = used.message;
      ok = used.ok !== false;
      return used.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "feedChicken") {
    const feedType = body.feedType === "gourmetFeed" ? "gourmetFeed" : "normalFeed";
    const result = await updatePlayer(sessionUser.id, (player) => {
      const current = getPlayer(player);
      if (!current.ownedChicken) {
        resultPlayer = current;
        message = "你目前沒有自己的雞。";
        ok = false;
        return current;
      }
      const fed = feedChicken(current, feedType, Date.now(), Math.random);
      resultPlayer = fed.player;
      message = fed.message;
      ok = fed.ok !== false;
      return fed.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "cleanCoop") {
    const result = await updatePlayer(sessionUser.id, (player) => {
      const current = getPlayer(player);
      if (!current.ownedChicken) {
        resultPlayer = current;
        message = "你目前沒有自己的雞。";
        ok = false;
        return current;
      }
      const cleaned = cleanChickenCoop(current, Date.now(), Math.random);
      resultPlayer = cleaned.player;
      message = cleaned.message;
      ok = cleaned.ok !== false;
      return cleaned.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  sendJson(response, 400, { ok: false, message: "unknown_action" });
}

async function handleDiscordCallback(request, response) {
  const url = getRequestUrl(request);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    redirect(response, `/?login=failed&reason=${encodeURIComponent(error)}`);
    return;
  }
  if (!code) {
    redirect(response, "/?login=missing_code");
    return;
  }

  const clientId = cleanEnvValue(process.env.DISCORD_CLIENT_ID);
  const clientSecret = cleanEnvValue(process.env.DISCORD_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    redirect(response, "/?login=oauth_not_configured");
    return;
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(request)
      })
    });
    if (!tokenResponse.ok) throw new Error(`Discord token exchange failed: ${tokenResponse.status}`);
    const tokenBody = await tokenResponse.json();
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    if (!userResponse.ok) throw new Error(`Discord user fetch failed: ${userResponse.status}`);
    const discordUser = await userResponse.json();
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(createSession(discordUser))}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax`;
    redirect(response, "/", { "Set-Cookie": cookie });
  } catch (error) {
    console.error("[web] Discord OAuth failed");
    console.error(error);
    redirect(response, "/?login=failed");
  }
}

function handleLogin(request, response) {
  const clientId = cleanEnvValue(process.env.DISCORD_CLIENT_ID);
  if (!clientId) {
    redirect(response, "/?login=client_id_missing");
    return;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(request),
    response_type: "code",
    scope: "identify",
    prompt: "none"
  });
  redirect(response, `https://discord.com/api/oauth2/authorize?${params.toString()}`);
}

function handleLogout(_request, response) {
  redirect(response, "/", {
    "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  });
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function serveFile(response, filePath, cache = "public, max-age=300") {
  try {
    const body = await fs.readFile(filePath);
    send(response, 200, body, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": cache
    });
  } catch {
    send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

async function handleStatic(url, response) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/assets/collectibles/")) {
    const safeName = path.basename(pathname);
    await serveFile(response, path.join(ASSET_DIR, "assets", "collectibles", safeName), "public, max-age=86400");
    return true;
  }
  if (pathname === "/assets/inventory-items.png") {
    await serveFile(response, path.join(PUBLIC_DIR, "assets", "inventory-items.png"), "public, max-age=86400");
    return true;
  }
  const fileName = pathname === "/" ? "index.html" : path.basename(pathname);
  const allowed = new Set(["index.html", "app.js", "styles.css"]);
  if (!allowed.has(fileName)) return false;
  await serveFile(response, path.join(PUBLIC_DIR, fileName), "no-store");
  return true;
}

async function handleRequest(request, response) {
  const url = getRequestUrl(request);
  try {
    if (url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/login") {
      handleLogin(request, response);
      return;
    }
    if (url.pathname === "/logout") {
      handleLogout(request, response);
      return;
    }
    if (url.pathname === "/auth/discord/callback") {
      await handleDiscordCallback(request, response);
      return;
    }
    if (url.pathname === "/api/me") {
      await handleApiMe(request, response);
      return;
    }
    if (url.pathname === "/api/leaderboard") {
      await handleApiLeaderboard(request, response);
      return;
    }
    if (url.pathname === "/api/action" && request.method === "POST") {
      await handleApiAction(request, response);
      return;
    }
    if (await handleStatic(url, response)) return;
    send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  } catch (error) {
    console.error("[web] request failed");
    console.error(error);
    sendJson(response, 500, { ok: false, message: "server_error" });
  }
}

function getPort() {
  return Number(process.env.PORT || process.env.WEB_PORT || DEFAULT_PORT);
}

function startWebServer() {
  if (serverState.server) return serverState.server;
  const port = getPort();
  const server = http.createServer((request, response) => {
    handleRequest(request, response);
  });
  server.listen(port, () => {
    console.log(`Web 面板已啟動：http://localhost:${port}`);
  });
  serverState.server = server;
  return server;
}

if (require.main === module) {
  startWebServer();
}

module.exports = {
  buildPlayerPayload,
  createSession,
  getSessionUser,
  startWebServer
};

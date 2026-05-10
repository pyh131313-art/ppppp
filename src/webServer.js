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
  chooseMinorBuff,
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
  getMinorBuffOptions,
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
  revive,
  rescuePlayer,
  resolveEventChallenge,
  resolveRandomEvent,
  rerollRunModeOptions,
  returnToSurface,
  sellSupplyStationBuff,
  triggerCharge,
  withdrawBank,
  withdrawUndergroundStorage,
  buyUndergroundInnItem
} = require("./game");
const {
  cleanChickenCoop,
  createBossBattle,
  feedChicken,
  getChickenRequiredExp,
  getChickenStage,
  hasChickenReachedFinish,
  normalizeOwnedChicken,
  settleBattle,
  updateBattleFrame
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
const webChickenBattles = new Map();
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
    isGuest: Boolean(user.isGuest),
    exp: Date.now() + SESSION_TTL_MS
  }));
  return `${payload}.${signPayload(payload)}`;
}

function createSessionCookie(user) {
  return `${SESSION_COOKIE}=${encodeURIComponent(createSession(user))}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax`;
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
  if (user && user.isGuest) return "";
  if (!user || !user.id || !user.avatar) return "";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function getHpText(player) {
  const maxHp = getMaxBombs(player);
  const damage = Number(player.bombs || 0);
  const current = Math.max(0, maxHp - damage);
  return `${current}/${maxHp}`;
}

function getWebChickenBattle(userId) {
  const battle = webChickenBattles.get(userId);
  if (!battle || battle.status === "settled") return null;
  return battle;
}

function formatWebBattleRunner(runner) {
  if (!runner || !runner.chicken) return null;
  return {
    name: runner.chicken.name || "賽雞",
    icon: runner.chicken.icon || "🐔",
    level: Math.max(1, Math.floor(runner.chicken.level || 1)),
    speed: Math.max(0, Math.floor(runner.chicken.speed || 0)),
    sprint: Math.max(0, Math.floor(runner.chicken.sprint || 0)),
    stability: Math.max(0, Math.floor(runner.chicken.stability || 0)),
    stamina: Math.max(0, Math.floor(runner.chicken.stamina || 0)),
    position: Math.max(0, Number(runner.position || 0))
  };
}

function getWebBattleView(userId, player) {
  const battle = getWebChickenBattle(userId);
  if (!battle) {
    return {
      active: false,
      rank: Math.max(1, Math.floor(player.chickenArenaRank || 1)),
      highestClearedRank: Math.max(0, Math.floor((player.chickenArenaRank || 1) - 1))
    };
  }
  return {
    active: true,
    id: battle.id,
    status: battle.status,
    bossRank: Math.max(1, Math.floor(battle.bossRank || 1)),
    frame: battle.frames && battle.frames.length ? battle.frames[battle.frames.length - 1] : "",
    frameCount: Math.max(0, Math.floor(battle.webFrame || 0)),
    challenger: formatWebBattleRunner(Array.isArray(battle.runners) ? battle.runners[0] : null),
    boss: formatWebBattleRunner(Array.isArray(battle.runners) ? battle.runners[1] : null)
  };
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

function getWebRescueTargets(players, currentUserId) {
  return Object.entries(players || {})
    .filter(([userId, player]) => userId !== currentUserId && getPlayer(player).dead)
    .slice(0, 8)
    .map(([userId, player]) => {
      const target = getPlayer(player);
      const deathAt = target.deathAt || 0;
      const refundWindowMs = CONFIG.revive.rescueRefundAfterMs;
      const refundRemainingMs = deathAt ? Math.max(0, refundWindowMs - (Date.now() - deathAt)) : 0;
      return {
        userId,
        label: `玩家 ${userId.slice(0, 4)}...${userId.slice(-4)}`,
        gold: target.gold,
        depth: target.depth,
        refundRemainingMs
      };
    });
}

function buildPlayerPayload(user, playerInput, progressInput = {}, playersInput = null) {
  const player = getPlayer(playerInput);
  const pendingEvent = getWebPendingEvent(player);
  const supplyStation = getSupplyStationView(player);
  const minorBuffs = getWebMinorBuffs(player);
  const shop = getWebShop(player, progressInput);
  const storage = getWebStorage(player);
  const undergroundInn = getWebUndergroundInn(player, progressInput);
  const rescueTargets = playersInput ? getWebRescueTargets(playersInput, user.id) : [];
  return {
    user: {
      id: user.id,
      username: user.username,
      globalName: user.globalName || user.global_name || "",
      isGuest: Boolean(user.isGuest),
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
      zone: player.zone,
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
    rescueTargets,
    stateFlags: {
      hasPendingEvent: Boolean(player.pendingEvent),
      hasSupplyStation: Boolean(player.supplyStation),
      canUseBank: Boolean(!player.dead && (!player.runMode || player.zone === "undergroundCamp")),
      canUseShop: Boolean(!player.dead && !player.runMode),
      canUseStorage: Boolean(!player.dead && ["surface", "undergroundCamp", "skyCamp"].includes(player.zone)),
      canUseUndergroundInn: Boolean(!player.dead && player.zone === "undergroundCamp"),
      canMine: Boolean(player.runMode && !player.dead && !player.pendingEvent && !player.supplyStation && !minorBuffs.needsChoice),
      needsTrait: Boolean(!player.runMode && !player.dead),
      needsMinorBuff: Boolean(!player.dead && minorBuffs.needsChoice),
      canRevive: Boolean(player.dead),
      canRescue: Boolean(!player.dead && rescueTargets.length > 0),
      canReturn: Boolean(player.runMode || player.depth !== 0 || player.runDepthProgress !== 0 || player.zone !== "surface"),
      canDrinkPotion: Boolean(player.runMode && !player.dead && player.healingPotion > 0),
      canFeedChicken: Boolean(player.ownedChicken),
      canCleanCoop: Boolean(player.ownedChicken)
    },
    minorBuffs,
    charge: getWebCharge(player),
    inventory: getInventoryItems(player),
    collection: getCollectionItems(player),
    chicken: getChickenSummary(player),
    chickenBattle: getWebBattleView(user.id, player)
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

function getWebMinorBuffs(player) {
  const active = Object.entries(player.minorBuffs || {})
    .filter(([id, count]) => count > 0 && CONFIG.minorBuffs[id])
    .map(([id, count]) => ({
      id,
      label: CONFIG.minorBuffs[id].label,
      count: Math.max(0, Math.floor(count || 0))
    }));
  const options = getMinorBuffOptions(player).map((buff) => ({
    id: buff.id,
    label: buff.label,
    currentStacks: Math.max(0, Math.floor(buff.currentStacks || 0)),
    effectiveStacks: Number(buff.effectiveStacks || 0),
    breakthrough: Boolean(buff.breakthrough)
  }));
  return {
    active,
    options,
    needsChoice: options.length > 0,
    breakthrough: Boolean(player.minorBuffBreakthroughMode)
  };
}

function getWebCharge(player) {
  const value = Math.max(0, Math.min(100, Math.floor(player.chargeValue || 0)));
  const labels = {
    reward: "收益爆發",
    safe: "穩定爆發",
    resource: "資源爆發"
  };
  return {
    value,
    ready: value >= 100,
    lastUsed: player.lastChargeSkillUsed || "",
    skills: Object.entries(labels).map(([id, label]) => ({
      id,
      label,
      disabled: value < 100 || player.lastChargeSkillUsed === id
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
    imageUrl: getEventCgUrl(player.pendingEvent, event),
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

function getEventCgUrl(eventId, event) {
  const id = String(eventId || "");
  if (!id) return "";
  if (id.includes("chicken")) return "/assets/event-cg-wild-chicken.png?v=20260510";
  if (id.startsWith("sky_") || id.includes("_sky_") || id.includes("thunder") || id.includes("cloud") || id.includes("starlight") || id.includes("lightwing")) return "/assets/event-cg-sky-v2.png?v=20260510";
  if (event && event.traitSwapEvent) return "/assets/event-cg-trait-swap.png?v=20260510";
  if (id.includes("trait_swap") || id.includes("mirror") || id.includes("stele")) return "/assets/event-cg-trait-swap.png?v=20260510";
  if (id.includes("lockpick") || id.includes("vault") || id.includes("seal") || (event && event.lockpick)) return "/assets/event-cg-lockpick-v2.png?v=20260510";
  if (id.includes("puzzle") || id.includes("circuit") || id.includes("valve") || id.includes("pipe") || id.includes("refraction") || id.includes("bridge")) return "/assets/event-cg-puzzle-v2.png?v=20260510";
  if (id.includes("chest") || id.includes("safe") || id.includes("supply_cache") || id.includes("lost_backpack")) return "/assets/event-cg-treasure-chest.png?v=20260510";
  if (id.includes("bomb") || id.includes("powder") || id.includes("explosive") || id.includes("blaster")) return "/assets/event-cg-bomb-defuse.png?v=20260510";
  if (id.includes("collapse") || id.includes("cavein") || id.includes("evacuation") || id.includes("escape")) return "/assets/event-cg-cave-collapse.png?v=20260510";
  return "";
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
    data: buildPlayerPayload(sessionUser, players[sessionUser.id], progress, players)
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

function buildActionResponse(sessionUser, player, message, ok = true, players = null) {
  return {
    ok,
    message,
    data: buildPlayerPayload(sessionUser, player, {}, players)
  };
}

function buildActionResponseWithProgress(sessionUser, player, players, message, ok = true) {
  return {
    ok,
    message,
    data: buildPlayerPayload(sessionUser, player, getProgressWithGlobal(players), players)
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

  if (action === "rerollTraits") {
    const result = await updatePlayer(sessionUser.id, (player) => {
      const rerolled = rerollRunModeOptions(player, Math.random);
      resultPlayer = rerolled.player;
      message = rerolled.message;
      ok = rerolled.ok !== false;
      return rerolled.player;
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

  if (action === "revive") {
    await updatePlayers((players) => {
      const revived = revive(players[sessionUser.id], Date.now(), Math.random);
      resultPlayer = revived.player;
      message = revived.message;
      ok = revived.ok !== false;
      players[sessionUser.id] = revived.player;
      return players;
    });
    const latestPlayers = await loadPlayers();
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok, latestPlayers));
    return;
  }

  if (action === "rescue") {
    const targetUserId = String(body.targetUserId || "");
    if (!targetUserId || targetUserId === sessionUser.id) {
      sendJson(response, 400, { ok: false, message: "不能救援自己。" });
      return;
    }
    await updatePlayers((players) => {
      if (!players[targetUserId]) {
        resultPlayer = getPlayer(players[sessionUser.id]);
        message = "找不到這位玩家。";
        ok = false;
        players[sessionUser.id] = resultPlayer;
        return players;
      }
      const rescue = rescuePlayer(players[sessionUser.id], players[targetUserId], Date.now(), Math.random);
      resultPlayer = rescue.rescuer;
      message = rescue.message;
      ok = rescue.ok !== false;
      players[sessionUser.id] = rescue.rescuer;
      players[targetUserId] = rescue.target;
      return players;
    });
    const latestPlayers = await loadPlayers();
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok, latestPlayers));
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

  if (action === "chooseMinorBuff") {
    const buff = String(body.buff || "");
    const result = await updatePlayer(sessionUser.id, (player) => {
      const applied = chooseMinorBuff(player, buff);
      resultPlayer = applied.player;
      message = applied.message;
      ok = applied.ok !== false;
      return applied.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "triggerCharge") {
    const skill = String(body.skill || "");
    const result = await updatePlayer(sessionUser.id, (player) => {
      const applied = triggerCharge(player, skill);
      resultPlayer = applied.player;
      message = applied.message;
      ok = applied.ok !== false;
      return applied.player;
    });
    resultPlayer = resultPlayer || result;
    sendJson(response, 200, buildActionResponse(sessionUser, resultPlayer, message, ok));
    return;
  }

  if (action === "startBossBattle") {
    await updatePlayers((players) => {
      const created = createBossBattle(sessionUser.id, players, Date.now(), Math.random, "web", null, null);
      if (!created.ok) {
        resultPlayer = getPlayer(players[sessionUser.id]);
        message = created.message || "無法開始賽雞館挑戰。";
        ok = false;
        return players;
      }
      created.battle.status = "racing";
      created.battle.webFrame = 0;
      updateBattleFrame(created.battle, players, 0, Math.random);
      webChickenBattles.set(sessionUser.id, created.battle);
      resultPlayer = getPlayer(players[sessionUser.id]);
      message = `🏟️ 賽雞館 Rank ${created.battle.bossRank || 1} 開始！\n${created.battle.frames[created.battle.frames.length - 1] || ""}`;
      ok = true;
      return created.players || players;
    });
    const latestPlayers = await loadPlayers();
    sendJson(response, 200, buildActionResponseWithProgress(sessionUser, resultPlayer, latestPlayers, message, ok));
    return;
  }

  if (action === "advanceBossBattle") {
    await updatePlayers((players) => {
      const battle = getWebChickenBattle(sessionUser.id);
      if (!battle) {
        resultPlayer = getPlayer(players[sessionUser.id]);
        message = "目前沒有進行中的賽雞館挑戰。";
        ok = false;
        return players;
      }
      battle.webFrame = Math.max(0, Math.floor(battle.webFrame || 0)) + 1;
      updateBattleFrame(battle, players, battle.webFrame, Math.random);
      if (hasChickenReachedFinish(battle) || battle.webFrame >= 18) {
        const settled = settleBattle(battle, players, Math.random, Date.now());
        resultPlayer = getPlayer(settled.players[sessionUser.id]);
        message = `🏁 賽雞館結束！\n${settled.message}`;
        ok = true;
        webChickenBattles.delete(sessionUser.id);
        return settled.players;
      }
      webChickenBattles.set(sessionUser.id, battle);
      resultPlayer = getPlayer(players[sessionUser.id]);
      message = battle.frames[battle.frames.length - 1] || "賽況推進。";
      ok = true;
      return players;
    });
    const latestPlayers = await loadPlayers();
    sendJson(response, 200, buildActionResponseWithProgress(sessionUser, resultPlayer, latestPlayers, message, ok));
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
    const previousSession = getSessionUser(request);
    let boundGuest = false;
    let bindConflict = false;
    if (previousSession && previousSession.isGuest && String(previousSession.id).startsWith("guest_")) {
      await updatePlayers((players) => {
        if (players[previousSession.id] && !players[discordUser.id]) {
          players[discordUser.id] = players[previousSession.id];
          delete players[previousSession.id];
          boundGuest = true;
        } else if (players[previousSession.id] && players[discordUser.id]) {
          bindConflict = true;
        }
        return players;
      });
    }
    const cookie = createSessionCookie(discordUser);
    const bindQuery = boundGuest ? "?login=guest_bound" : bindConflict ? "?login=guest_bind_conflict" : "";
    redirect(response, `/${bindQuery}`, { "Set-Cookie": cookie });
  } catch (error) {
    console.error("[web] Discord OAuth failed");
    console.error(error);
    redirect(response, "/?login=failed");
  }
}

function handleGuestLogin(_request, response) {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const guestUser = {
    id: `guest_${crypto.randomUUID()}`,
    username: `guest_${suffix}`,
    globalName: `訪客${suffix}`,
    isGuest: true
  };
  redirect(response, "/?login=guest", {
    "Set-Cookie": createSessionCookie(guestUser)
  });
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
    scope: "identify"
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
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
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
    await serveFile(response, path.join(PUBLIC_DIR, "assets", "inventory-items.png"), "no-store");
    return true;
  }
  if (pathname === "/assets/mine-scene-map.png") {
    await serveFile(response, path.join(PUBLIC_DIR, "assets", "mine-scene-map.png"), "no-store");
    return true;
  }
  if (pathname.startsWith("/assets/camp-") && pathname.endsWith("-scene.png")) {
    const safeName = path.basename(pathname);
    const allowed = new Set([
      "camp-surface-scene.png",
      "camp-underground-scene.png",
      "camp-sky-scene.png"
    ]);
    if (!allowed.has(safeName)) return false;
    await serveFile(response, path.join(PUBLIC_DIR, "assets", safeName), "no-store");
    return true;
  }
  if (pathname.startsWith("/assets/event-cg-") && pathname.endsWith(".png")) {
    const safeName = path.basename(pathname);
    const allowed = new Set([
      "event-cg-bomb-defuse.png",
      "event-cg-cave-collapse.png",
      "event-cg-lockpick-v2.png",
      "event-cg-puzzle-v2.png",
      "event-cg-sky-v2.png",
      "event-cg-treasure-chest.png",
      "event-cg-wild-chicken.png",
      "event-cg-trait-swap.png"
    ]);
    if (!allowed.has(safeName)) return false;
    await serveFile(response, path.join(PUBLIC_DIR, "assets", safeName), "no-store");
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
    if (url.pathname === "/guest-login") {
      handleGuestLogin(request, response);
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

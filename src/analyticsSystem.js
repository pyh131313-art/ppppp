"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { CONFIG } = require("./config");
const { GLOBAL_STATE_KEY, normalizeGlobalState } = require("./globalState");
const { getPlayer } = require("./playerState");

const ANALYTICS_PAGES = ["active", "economy", "popular", "health"];

function getTaiwanDateKey(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(now));
}

function createDailyAnalyticsDay() {
  return {
    activeUsers: {},
    mineRuns: 0,
    deaths: 0,
    depthTotal: 0,
    depthSamples: 0,
    races: 0,
    challenges: 0,
    potionsUsed: 0,
    eventsTriggered: 0,
    goldEarned: 0,
    goldSpent: 0,
    playMsTotal: 0,
    playMsSamples: 0,
    traitCounts: {},
    routeCounts: {},
    eventCounts: {},
    chickenCounts: {},
    deathCauses: {}
  };
}

function normalizeCountMap(input = {}, limit = 80) {
  return Object.fromEntries(
    Object.entries(input || {})
      .filter(([key, value]) => typeof key === "string" && Number.isFinite(Number(value)))
      .slice(0, limit)
      .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value)))])
  );
}

function normalizeDailyDay(input = {}) {
  const base = createDailyAnalyticsDay();
  return {
    ...base,
    ...(input || {}),
    activeUsers: normalizeCountMap(input.activeUsers, 5000),
    traitCounts: normalizeCountMap(input.traitCounts),
    routeCounts: normalizeCountMap(input.routeCounts),
    eventCounts: normalizeCountMap(input.eventCounts),
    chickenCounts: normalizeCountMap(input.chickenCounts),
    deathCauses: normalizeCountMap(input.deathCauses)
  };
}

function createAnalyticsState(now = Date.now()) {
  return {
    dailyAnalytics: {
      lastDate: getTaiwanDateKey(now),
      days: {}
    },
    playerActivityStats: {},
    economyStats: {
      dailyGoldCreated: {},
      dailyGoldSpent: {}
    }
  };
}

function normalizeAnalyticsState(globalStateInput = {}, now = Date.now()) {
  const base = createAnalyticsState(now);
  const input = globalStateInput || {};
  const dailyInput = input.dailyAnalytics || {};
  const days = {};
  for (const [date, day] of Object.entries(dailyInput.days || {})) {
    if (typeof date !== "string") continue;
    days[date] = normalizeDailyDay(day);
  }
  const sortedDates = Object.keys(days).sort();
  while (sortedDates.length > 14) {
    const date = sortedDates.shift();
    delete days[date];
  }
  return {
    ...base,
    dailyAnalytics: {
      lastDate: typeof dailyInput.lastDate === "string" ? dailyInput.lastDate : getTaiwanDateKey(now),
      days
    },
    playerActivityStats: input.playerActivityStats && typeof input.playerActivityStats === "object"
      ? Object.fromEntries(Object.entries(input.playerActivityStats).map(([userId, value]) => [
        userId,
        {
          lastSeenAt: Math.max(0, Number(value && value.lastSeenAt) || 0),
          firstSeenAt: Math.max(0, Number(value && value.firstSeenAt) || 0),
          activeDates: Array.isArray(value && value.activeDates)
            ? value.activeDates.filter((date) => typeof date === "string").slice(-14)
            : []
        }
      ]))
      : {},
    economyStats: {
      dailyGoldCreated: normalizeCountMap(input.economyStats && input.economyStats.dailyGoldCreated, 14),
      dailyGoldSpent: normalizeCountMap(input.economyStats && input.economyStats.dailyGoldSpent, 14)
    }
  };
}

function ensureAnalytics(globalStateInput = {}, now = Date.now()) {
  const state = normalizeGlobalState(globalStateInput, now);
  const analytics = normalizeAnalyticsState(state, now);
  state.dailyAnalytics = analytics.dailyAnalytics;
  state.playerActivityStats = analytics.playerActivityStats;
  state.economyStats = analytics.economyStats;
  return state;
}

function getTodayAnalyticsDay(globalStateInput = {}, now = Date.now()) {
  const state = ensureAnalytics(globalStateInput, now);
  const dateKey = getTaiwanDateKey(now);
  if (!state.dailyAnalytics.days[dateKey]) state.dailyAnalytics.days[dateKey] = createDailyAnalyticsDay();
  state.dailyAnalytics.lastDate = dateKey;
  return { state, dateKey, day: state.dailyAnalytics.days[dateKey] };
}

function incrementMap(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + Math.max(0, Math.floor(amount || 0));
}

function recordAnalyticsEvent(globalStateInput, userId, type, details = {}, now = Date.now()) {
  const { state, dateKey, day } = getTodayAnalyticsDay(globalStateInput, now);
  if (userId) {
    incrementMap(day.activeUsers, String(userId));
    const previous = state.playerActivityStats[userId] || {};
    const lastSeenAt = Math.max(0, Number(previous.lastSeenAt) || 0);
    const playMs = lastSeenAt > 0 ? Math.min(30 * 60 * 1000, Math.max(0, now - lastSeenAt)) : 0;
    if (playMs > 0) {
      day.playMsTotal += playMs;
      day.playMsSamples += 1;
    }
    const activeDates = Array.isArray(previous.activeDates) ? previous.activeDates.filter((date) => date !== dateKey) : [];
    activeDates.push(dateKey);
    state.playerActivityStats[userId] = {
      firstSeenAt: previous.firstSeenAt || now,
      lastSeenAt: now,
      activeDates: activeDates.slice(-14)
    };
  }

  if (type === "mine") {
    day.mineRuns += 1;
    const depth = Math.max(0, Math.floor(details.depth || 0));
    if (depth > 0) {
      day.depthTotal += depth;
      day.depthSamples += 1;
    }
    incrementMap(day.routeCounts, details.route || "未知路線");
    if (details.trait) incrementMap(day.traitCounts, details.trait);
  }
  if (type === "death") {
    day.deaths += 1;
    incrementMap(day.deathCauses, details.cause || "未知");
  }
  if (type === "race") day.races += 1;
  if (type === "challenge") day.challenges += 1;
  if (type === "potion") day.potionsUsed += Math.max(1, Math.floor(details.amount || 1));
  if (type === "event") {
    day.eventsTriggered += 1;
    incrementMap(day.eventCounts, details.eventId || "未知事件");
  }
  if (type === "goldEarned") {
    const amount = Math.max(0, Math.floor(details.amount || 0));
    day.goldEarned += amount;
    state.economyStats.dailyGoldCreated[dateKey] = (state.economyStats.dailyGoldCreated[dateKey] || 0) + amount;
  }
  if (type === "goldSpent") {
    const amount = Math.max(0, Math.floor(details.amount || 0));
    day.goldSpent += amount;
    state.economyStats.dailyGoldSpent[dateKey] = (state.economyStats.dailyGoldSpent[dateKey] || 0) + amount;
  }
  if (type === "chicken") incrementMap(day.chickenCounts, details.chicken || "未知雞");
  return state;
}

function recordAnalyticsOnPlayers(players, userId, type, details = {}, now = Date.now()) {
  const state = recordAnalyticsEvent(players[GLOBAL_STATE_KEY], userId, type, details, now);
  players[GLOBAL_STATE_KEY] = state;
  return players;
}

function getRecentDays(state, now = Date.now(), count = 7) {
  const today = getTaiwanDateKey(now);
  const dates = Object.keys(state.dailyAnalytics.days || {}).sort().filter((date) => date <= today);
  return dates.slice(-count).map((date) => [date, normalizeDailyDay(state.dailyAnalytics.days[date])]);
}

function getTopEntries(map = {}, labels = {}, limit = 3) {
  const rows = Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => `${labels[key] || key} x${count}`);
  return rows.length ? rows : ["無"];
}

function calculateEconomy(playersInput = {}) {
  const players = Object.entries(playersInput || {})
    .filter(([userId]) => userId !== GLOBAL_STATE_KEY)
    .map(([userId, player]) => [userId, getPlayer(player)]);
  const assets = players.map(([userId, player]) => ({
    userId,
    total: Math.max(0, (player.gold || 0) + (player.bankGold || 0))
  }));
  const totalGold = assets.reduce((sum, row) => sum + row.total, 0);
  const averageAsset = assets.length ? Math.floor(totalGold / assets.length) : 0;
  const richest = assets.sort((a, b) => b.total - a.total)[0] || null;
  const highAssetCount = assets.filter((row) => row.total >= Math.max(50000, averageAsset * 3)).length;
  return {
    totalGold,
    averageAsset,
    richest,
    playerCount: players.length,
    highAssetCount
  };
}

function analyzeHealth(playersInput = {}, stateInput = {}, now = Date.now()) {
  const state = ensureAnalytics(stateInput, now);
  const { day } = getTodayAnalyticsDay(state, now);
  const economy = calculateEconomy(playersInput);
  const activeCount = Object.keys(day.activeUsers || {}).length;
  const deathRate = day.mineRuns > 0 ? day.deaths / day.mineRuns : 0;
  const challengeRate = day.mineRuns > 0 ? day.challenges / day.mineRuns : 0;
  const raceRate = day.mineRuns > 0 ? day.races / day.mineRuns : 0;
  const recent = getRecentDays(state, now, 4);
  const previousMineAverage = recent.length > 1
    ? recent.slice(0, -1).reduce((sum, [, item]) => sum + item.mineRuns, 0) / (recent.length - 1)
    : day.mineRuns;
  let score = 70;
  const reasons = [];
  if (activeCount >= 5) {
    score += 10;
    reasons.push("活躍玩家穩定");
  } else if (activeCount <= 1) {
    score -= 15;
    reasons.push("今日活躍偏低");
  }
  if (day.mineRuns < previousMineAverage * 0.65 && previousMineAverage >= 5) {
    score -= 15;
    reasons.push("近幾日下礦次數下降");
  }
  if (deathRate > 0.35) {
    score -= 15;
    reasons.push("死亡率偏高");
  }
  if (economy.highAssetCount >= Math.max(3, Math.ceil(economy.playerCount * 0.15))) {
    score -= 12;
    reasons.push("高資產玩家比例偏高");
  }
  if (day.goldEarned > Math.max(10000, day.goldSpent * 3 + 5000)) {
    score -= 12;
    reasons.push("今日金幣產出明顯高於消耗");
  }
  if (challengeRate > 0.25) reasons.push("挑戰模式參與率高");
  if (raceRate > 0.25) reasons.push("賽雞參與率高");
  if (!reasons.length) reasons.push("數據穩定，沒有明顯異常");
  const level = score >= 75 ? "🟢 健康" : score >= 50 ? "🟡 普通" : "🔴 危險";
  return {
    level,
    score,
    reasons,
    deathRate,
    challengeRate,
    raceRate
  };
}

function buildTrendLines(stateInput = {}, now = Date.now()) {
  const state = ensureAnalytics(stateInput, now);
  const recent = getRecentDays(state, now, 4);
  if (recent.length < 2) return ["資料累積中"];
  const today = recent[recent.length - 1][1];
  const previous = recent.slice(0, -1);
  const previousMineAverage = previous.reduce((sum, [, day]) => sum + day.mineRuns, 0) / previous.length;
  const previousActiveAverage = previous.reduce((sum, [, day]) => sum + Object.keys(day.activeUsers || {}).length, 0) / previous.length;
  const lines = [];
  if (today.mineRuns >= previousMineAverage * 1.15) lines.push("🟢 下礦活躍上升");
  else if (today.mineRuns <= previousMineAverage * 0.8) lines.push("🟡 近幾日下礦次數下降");
  else lines.push("🟢 下礦活躍穩定");
  const active = Object.keys(today.activeUsers || {}).length;
  if (active < previousActiveAverage * 0.8) lines.push("🟡 今日活躍玩家變少");
  const deathRate = today.mineRuns > 0 ? today.deaths / today.mineRuns : 0;
  if (deathRate > 0.35) lines.push("🔴 死亡率異常提高");
  if (today.goldEarned > Math.max(10000, today.goldSpent * 3 + 5000)) lines.push("⚠️ 金幣產出偏高");
  return lines;
}

function buildDeveloperPanelEmbed(playersInput = {}, page = "active", now = Date.now()) {
  const state = ensureAnalytics(playersInput[GLOBAL_STATE_KEY], now);
  const { day, dateKey } = getTodayAnalyticsDay(state, now);
  const economy = calculateEconomy(playersInput);
  const health = analyzeHealth(playersInput, state, now);
  const averageDepth = day.depthSamples > 0 ? Math.round(day.depthTotal / day.depthSamples) : 0;
  const averageOnlineMinutes = day.playMsSamples > 0 ? Math.round(day.playMsTotal / day.playMsSamples / 60000) : 0;
  const titleMap = {
    active: "📊 開發者面板｜活躍",
    economy: "💰 開發者面板｜經濟",
    popular: "🔥 開發者面板｜熱門",
    health: "⚠️ 開發者面板｜健康度"
  };
  const embed = new EmbedBuilder()
    .setTitle(titleMap[page] || titleMap.active)
    .setColor(page === "health" && health.level.startsWith("🔴") ? 0xd83a3a : page === "economy" ? 0xf0b232 : 0x38bdf8)
    .setFooter({ text: `日期：${dateKey}（台灣時間）` });

  if (page === "economy") {
    const market = state.market && state.market.multipliers ? state.market.multipliers : {};
    embed.setDescription([
      `全服總金幣：${economy.totalGold}`,
      `今日新增：${day.goldEarned}`,
      `今日消耗：${day.goldSpent}`,
      `平均資產：${economy.averageAsset}`,
      `最富玩家：${economy.richest ? `<@${economy.richest.userId}>｜${economy.richest.total}` : "無"}`,
      `市場：${CONFIG.market.trackedItems.map((id) => `${id} x${market[id] || 1}`).join("｜") || "無"}`,
      day.goldEarned > Math.max(10000, day.goldSpent * 3 + 5000) ? "⚠️ 金幣產出異常偏高" : "🟢 經濟產消暫無明顯異常"
    ].join("\n"));
    return embed;
  }

  if (page === "popular") {
    embed.setDescription([
      "今日熱門：",
      `詞條：${getTopEntries(day.traitCounts, Object.fromEntries(Object.entries(CONFIG.runModes).map(([id, trait]) => [id, trait.name]))).join("｜")}`,
      `路線：${getTopEntries(day.routeCounts).join("｜")}`,
      `死法：${getTopEntries(day.deathCauses).join("｜")}`,
      `雞：${getTopEntries(day.chickenCounts).join("｜")}`,
      `事件：${getTopEntries(day.eventCounts).join("｜")}`
    ].join("\n"));
    return embed;
  }

  if (page === "health") {
    embed.setDescription([
      `遊戲健康度：${health.level}`,
      "",
      "原因：",
      ...health.reasons.map((reason) => `- ${reason}`),
      "",
      "📈 活躍度評估",
      ...buildTrendLines(state, now)
    ].join("\n"));
    return embed;
  }

  embed.setDescription([
    "【今日礦坑數據】",
    `活躍玩家：${Object.keys(day.activeUsers || {}).length}`,
    `下礦次數：${day.mineRuns}`,
    `死亡：${day.deaths}`,
    `平均深度：${averageDepth}`,
    `賽雞：${day.races} 場`,
    `挑戰模式：${day.challenges} 場`,
    `藥水消耗：${day.potionsUsed}`,
    `事件觸發：${day.eventsTriggered}`,
    `平均在線：${averageOnlineMinutes} 分`,
    "",
    ...buildTrendLines(state, now)
  ].join("\n"));
  return embed;
}

function buildDeveloperPanelComponents(page = "active") {
  const labels = {
    active: "活躍",
    economy: "經濟",
    popular: "熱門",
    health: "健康度"
  };
  return [
    new ActionRowBuilder().addComponents(
      ...ANALYTICS_PAGES.map((id) => new ButtonBuilder()
        .setCustomId(`devpanel:${id}`)
        .setLabel(labels[id])
        .setStyle(id === page ? ButtonStyle.Primary : ButtonStyle.Secondary))
    )
  ];
}

module.exports = {
  ANALYTICS_PAGES,
  buildDeveloperPanelComponents,
  buildDeveloperPanelEmbed,
  createAnalyticsState,
  createDailyAnalyticsDay,
  ensureAnalytics,
  getTaiwanDateKey,
  recordAnalyticsEvent,
  recordAnalyticsOnPlayers
};

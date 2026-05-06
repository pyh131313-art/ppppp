"use strict";

const { CONFIG } = require("./config");

const GLOBAL_STATE_KEY = "__global";

function getNextHourStart(now = Date.now()) {
  const date = new Date(now);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.getTime();
}

function getCurrentMarketCycle(now = Date.now()) {
  return Math.floor(now / CONFIG.market.cycleMs) * CONFIG.market.cycleMs;
}

function createGlobalState(now = Date.now()) {
  const nextPotionRestockTime = getNextHourStart(now);
  return {
    currentPotionStock: CONFIG.shop.consumables.healingPotion.hourlyStock,
    lastPotionRestockTime: nextPotionRestockTime - 60 * 60 * 1000,
    nextPotionRestockTime,
    market: {
      cycleStartedAt: getCurrentMarketCycle(now),
      sold: {},
      multipliers: {}
    }
  };
}

function normalizeGlobalState(input = {}, now = Date.now()) {
  const base = createGlobalState(now);
  const state = {
    ...base,
    ...(input || {}),
    market: {
      ...base.market,
      ...(input && input.market ? input.market : {})
    }
  };
  restockPotionIfNeeded(state, now);
  resetMarketIfNeeded(state, now);
  return state;
}

function restockPotionIfNeeded(state, now = Date.now()) {
  if (now < (state.nextPotionRestockTime || 0)) return state;
  state.currentPotionStock = CONFIG.shop.consumables.healingPotion.hourlyStock;
  state.lastPotionRestockTime = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;
  state.nextPotionRestockTime = getNextHourStart(now);
  return state;
}

function resetMarketIfNeeded(state, now = Date.now()) {
  const cycleStartedAt = getCurrentMarketCycle(now);
  if (state.market && state.market.cycleStartedAt === cycleStartedAt) return state;
  state.market = {
    cycleStartedAt,
    sold: {},
    multipliers: {}
  };
  return state;
}

function getMarketMultiplier(globalStateInput, itemId, now = Date.now()) {
  const state = normalizeGlobalState(globalStateInput, now);
  if (!CONFIG.market.trackedItems.includes(itemId)) return 1;
  const sold = state.market.sold || {};
  const values = CONFIG.market.trackedItems.map((id) => Math.max(0, sold[id] || 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = total / CONFIG.market.trackedItems.length;
  const itemSold = sold[itemId] || 0;
  let multiplier = 1;
  if (total > 0) multiplier = 1 + (average - itemSold) / Math.max(20, average + 20);
  multiplier = Math.max(CONFIG.market.minMultiplier, Math.min(CONFIG.market.maxMultiplier, multiplier));
  return Math.round(multiplier * 100) / 100;
}

function getMarketSnapshot(globalStateInput, now = Date.now()) {
  const state = normalizeGlobalState(globalStateInput, now);
  return Object.fromEntries(CONFIG.market.trackedItems.map((id) => [id, getMarketMultiplier(state, id, now)]));
}

function recordMarketSale(globalStateInput, sales = {}, now = Date.now()) {
  const state = normalizeGlobalState(globalStateInput, now);
  for (const [itemId, amount] of Object.entries(sales)) {
    if (!CONFIG.market.trackedItems.includes(itemId)) continue;
    state.market.sold[itemId] = (state.market.sold[itemId] || 0) + Math.max(0, Math.floor(amount || 0));
  }
  state.market.multipliers = getMarketSnapshot(state, now);
  return state;
}

function describeMarket(globalStateInput, now = Date.now()) {
  const labels = {
    ore: "普通礦石",
    goldOre: "金礦石",
    platinumOre: "鉑金礦石",
    oreIngot: "礦錠",
    goldOreIngot: "金錠",
    platinumOreIngot: "鉑金錠"
  };
  const snapshot = getMarketSnapshot(globalStateInput, now);
  return CONFIG.market.trackedItems.map((id) => {
    const multiplier = snapshot[id];
    const status = multiplier <= 0.85 ? "供給過剩" : multiplier >= 1.15 ? "需求上升" : "穩定";
    return `${labels[id]}：x${multiplier}（${status}）`;
  });
}

function getGlobalStateFromPlayers(players, now = Date.now()) {
  return normalizeGlobalState(players[GLOBAL_STATE_KEY], now);
}

function setGlobalStateToPlayers(players, state) {
  players[GLOBAL_STATE_KEY] = normalizeGlobalState(state);
  return players;
}

module.exports = {
  GLOBAL_STATE_KEY,
  createGlobalState,
  describeMarket,
  getGlobalStateFromPlayers,
  getMarketMultiplier,
  getMarketSnapshot,
  getNextHourStart,
  normalizeGlobalState,
  recordMarketSale,
  restockPotionIfNeeded,
  setGlobalStateToPlayers
};

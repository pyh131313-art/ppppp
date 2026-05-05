"use strict";

const POSITIVE_KINDS = new Set([
  "gold",
  "ore",
  "goldOre",
  "platinumOre",
  "goldBlock",
  "oreIngot",
  "goldOreIngot",
  "platinumOreIngot",
  "redGem",
  "blueGem",
  "greenGem"
]);

const FAILURE_KINDS = new Set([
  "bomb",
  "dead",
  "empty",
  "junk",
  "platinumJunk",
  "full",
  "stalactite"
]);

function createFunState() {
  return {
    comboCount: 0,
    maxCombo: 0,
    critCount: 0,
    chargeValue: 0,
    jackpotCount: 0,
    chargeBurst: null,
    runRewardStats: {
      baseReward: 0,
      critBonus: 0,
      comboBonus: 0,
      riskBonus: 0,
      burstBonus: 0
    }
  };
}

function normalizeFunState(player) {
  const base = createFunState();
  return {
    comboCount: Math.max(0, Math.floor(player && player.comboCount ? player.comboCount : 0)),
    maxCombo: Math.max(0, Math.floor(player && player.maxCombo ? player.maxCombo : 0)),
    critCount: Math.max(0, Math.floor(player && player.critCount ? player.critCount : 0)),
    chargeValue: Math.max(0, Math.floor(player && player.chargeValue ? player.chargeValue : 0)),
    jackpotCount: Math.max(0, Math.floor(player && player.jackpotCount ? player.jackpotCount : 0)),
    chargeBurst: player && player.chargeBurst ? player.chargeBurst : null,
    runRewardStats: {
      ...base.runRewardStats,
      ...(player && player.runRewardStats ? player.runRewardStats : {})
    }
  };
}

function resetFunRunState(player) {
  const keepCharge = Math.max(0, Math.floor(player.chargeValue || 0));
  player.comboCount = 0;
  player.maxCombo = 0;
  player.critCount = 0;
  player.jackpotCount = 0;
  player.chargeBurst = null;
  player.chargeValue = keepCharge;
  player.runRewardStats = createFunState().runRewardStats;
}

function rollCrit(random = Math.random, bonusChance = 0) {
  const roll = random();
  const critChance = 0.1 + Math.max(0, bonusChance || 0);
  return {
    crit: roll < critChance,
    upgrade: roll < 0.02
  };
}

function rollJackpot(random = Math.random) {
  return random() < 0.01;
}

function updateCombo(player, kind) {
  if (POSITIVE_KINDS.has(kind)) {
    player.comboCount = (player.comboCount || 0) + 1;
    player.maxCombo = Math.max(player.maxCombo || 0, player.comboCount);
  } else if (FAILURE_KINDS.has(kind)) {
    player.comboCount = 0;
  }
  return player.comboCount || 0;
}

function getComboBonusMultiplier(combo) {
  if (combo >= 5) return 1;
  if (combo >= 3) return 0.5;
  if (combo >= 2) return 0.2;
  return 0;
}

function applyRiskScaling(combo) {
  if (combo >= 5) return { rewardMultiplier: 3, bombMultiplier: 2, dangerLabel: "危險提升 x2" };
  if (combo >= 3) return { rewardMultiplier: 1.8, bombMultiplier: 1.5, dangerLabel: "危險提升 x1.5" };
  if (combo >= 1) return { rewardMultiplier: 1.2, bombMultiplier: 1, dangerLabel: "危險提升" };
  return { rewardMultiplier: 1, bombMultiplier: 1, dangerLabel: "" };
}

function addCharge(player, amount = 12) {
  player.chargeValue = Math.min(100, Math.max(0, (player.chargeValue || 0) + amount));
  return player.chargeValue;
}

function triggerCharge(player, type) {
  if (!["reward", "safe", "resource"].includes(type)) {
    return { ok: false, player, message: "沒有這個蓄力爆發。" };
  }
  if ((player.chargeValue || 0) < 100) {
    return { ok: false, player, message: `蓄力還不夠，目前 ${player.chargeValue || 0}/100。` };
  }
  player.chargeValue = 0;
  player.chargeBurst = type;
  const labels = {
    reward: "收益爆發：下一鏟收益 x3。",
    safe: "穩定爆發：下一鏟免疫炸彈。",
    resource: "資源爆發：下一鏟保證高級掉落。"
  };
  return { ok: true, player, message: labels[type] };
}

function calculateFinalReward(player, baseReward = 0) {
  const stats = player.runRewardStats || createFunState().runRewardStats;
  return {
    baseReward,
    critBonus: stats.critBonus || 0,
    comboBonus: stats.comboBonus || 0,
    riskBonus: stats.riskBonus || 0,
    burstBonus: stats.burstBonus || 0,
    total: baseReward + (stats.critBonus || 0) + (stats.comboBonus || 0) + (stats.riskBonus || 0) + (stats.burstBonus || 0),
    maxCombo: player.maxCombo || 0,
    critCount: player.critCount || 0,
    jackpotCount: player.jackpotCount || 0
  };
}

module.exports = {
  POSITIVE_KINDS,
  addCharge,
  applyRiskScaling,
  calculateFinalReward,
  createFunState,
  getComboBonusMultiplier,
  normalizeFunState,
  resetFunRunState,
  rollCrit,
  rollJackpot,
  triggerCharge,
  updateCombo
};

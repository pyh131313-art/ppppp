"use strict";

const EXTRA_RUN_MODES = {
  chainBlast: {
    name: "連鎖爆破",
    label: "連鎖爆破",
    shortDescription: "踩炸彈→收益+30%｜最多5",
    chainBlast: true
  },
  refiningInstinct: {
    name: "精煉本能",
    label: "精煉本能",
    shortDescription: "礦石→錠｜金幣-30%",
    refiningInstinct: true,
    goldMultiplierBonus: -0.3
  },
  greedyLoop: {
    name: "貪婪循環",
    label: "貪婪循環",
    shortDescription: "金幣→下次+20%｜受傷歸零",
    greedyLoop: true
  },
  dangerSense: {
    name: "危險感知",
    label: "危險感知",
    shortDescription: "50%避炸彈｜空挖+40%",
    dangerSense: true,
    emptyWeightMultiplier: 1.4
  },
  anomalousBackpack: {
    name: "異常背包",
    label: "異常背包",
    shortDescription: "包包+6｜每層20%破爛",
    bagBonusSlots: 6,
    anomalousBackpack: true
  }
};

function createTraitState() {
  return {
    chainBlast: 0,
    greedyLoop: 0
  };
}

function normalizeTraitState(input = {}) {
  return {
    ...createTraitState(),
    ...(input || {})
  };
}

function getModeConfig(config, modeId) {
  return modeId ? config.runModes[modeId] || null : null;
}

function applyTraitWeights(weights, player, config) {
  const mode = getModeConfig(config, player.runMode);
  const next = { ...weights };
  if (mode && mode.emptyWeightMultiplier) next.empty *= mode.emptyWeightMultiplier;
  if (mode && mode.chainBlast) next.bomb *= 1 + Math.min(5, player.traitState.chainBlast || 0) * 0.08;
  return next;
}

function getTraitGoldMultiplier(player, config) {
  const mode = getModeConfig(config, player.runMode);
  let multiplier = 1;
  if (mode && mode.goldMultiplierBonus) multiplier += mode.goldMultiplierBonus;
  if (mode && mode.greedyLoop) multiplier += Math.min(5, player.traitState.greedyLoop || 0) * 0.2;
  return Math.max(0.1, multiplier);
}

function shouldRefineOre(player, config) {
  const mode = getModeConfig(config, player.runMode);
  return Boolean(mode && mode.refiningInstinct);
}

function canSenseDanger(player, random = Math.random) {
  return player.runMode === "dangerSense" && random() < 0.5;
}

function onGoldGained(player) {
  if (player.runMode === "greedyLoop") {
    player.traitState.greedyLoop = Math.min(5, (player.traitState.greedyLoop || 0) + 1);
  }
}

function onDamageTaken(player) {
  if (player.runMode === "greedyLoop") player.traitState.greedyLoop = 0;
  if (player.runMode === "chainBlast") {
    player.traitState.chainBlast = Math.min(5, (player.traitState.chainBlast || 0) + 1);
  }
}

function consumeChainBlastReward(player) {
  const stacks = player.runMode === "chainBlast" ? Math.min(5, player.traitState.chainBlast || 0) : 0;
  if (stacks > 0) player.traitState.chainBlast = 0;
  return 1 + stacks * 0.3;
}

module.exports = {
  EXTRA_RUN_MODES,
  applyTraitWeights,
  canSenseDanger,
  consumeChainBlastReward,
  createTraitState,
  getTraitGoldMultiplier,
  normalizeTraitState,
  onDamageTaken,
  onGoldGained,
  shouldRefineOre
};

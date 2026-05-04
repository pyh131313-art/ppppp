"use strict";

const EXTRA_RUN_MODES = {
  chainBlast: {
    label: "連鎖爆破",
    chainBlast: true
  },
  refiningInstinct: {
    label: "精煉本能",
    refiningInstinct: true,
    goldMultiplierBonus: -0.3
  },
  greedyLoop: {
    label: "貪婪循環",
    greedyLoop: true
  },
  dangerSense: {
    label: "危險感知",
    dangerSense: true,
    emptyWeightMultiplier: 1.4
  },
  anomalousBackpack: {
    label: "異常背包",
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

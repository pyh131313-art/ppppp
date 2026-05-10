"use strict";

const {
  getEventTriggerChance,
  rollEventTrigger,
  shouldCheckEvent,
  updateEventState
} = require("./eventPitySystem");
const {
  advanceEventTypeMissCounters,
  getRandomEvent,
  getRandomEvents,
  pickGemEvent,
  pickHighTierEvent,
  pickReverseEvent,
  pickRaptorEvent,
  pickSkyEvent,
  pickRandomEvent,
  recordEventTypeEncounter
} = require("./eventSystem");
const {
  applyTraitWeights,
  canSenseDanger,
  consumeChainBlastReward,
  createTraitState,
  getTraitGoldMultiplier,
  onDamageTaken,
  onGoldGained,
  shouldRefineOre
} = require("./traitSystem");
const {
  POSITIVE_KINDS,
  addCharge,
  applyRiskScaling,
  calculateFinalReward,
  createFunState,
  getComboBonusMultiplier,
  resetFunRunState,
  rollCrit,
  rollJackpot,
  triggerCharge,
  updateCombo
} = require("./funSystem");
const { CONFIG } = require("./config");
const {
  getMarketMultiplier,
  normalizeGlobalState,
  recordMarketSale
} = require("./globalState");
const economySystem = require("./economySystem");
const {
  BAG_CAPACITY,
  CHICKEN_TRAIT_IDS,
  DAMAGE_PER_HIT,
  ITEM_STACK_SIZE,
  STACKABLE_ITEM_KEYS,
  createPlayer,
  getPlayer
} = require("./playerState");
const {
  addChickenExp,
  CHICKEN_RESEARCH_NOTES,
  getChickenRequiredExp,
  hasChickenReachedFinish,
  makeWildMineChicken,
  normalizeOwnedChicken,
  PK_FRAME_COUNT,
  updateBattleFrame
} = require("./chickenCare");

function rollWeighted(weights, random = Math.random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;

  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }

  return entries[entries.length - 1][0];
}

function addTempEffect(player, effect) {
  player.tempEffects.push({ ...effect });
}

function getEffectMultiplier(playerInput, key) {
  const player = getPlayer(playerInput);
  return player.tempEffects.reduce((multiplier, effect) => {
    if (!effect || !effect[key]) return multiplier;
    return multiplier * effect[key];
  }, 1);
}

function tickTempEffects(player) {
  player.tempEffects = player.tempEffects
    .map((effect) => ({ ...effect, remaining: Math.max(0, (effect.remaining || 0) - 1) }))
    .filter((effect) => effect.remaining > 0);
}

function healBombDamage(player, amount = 1) {
  const before = player.bombs;
  player.bombs = Math.max(0, player.bombs - amount);
  return before - player.bombs;
}

function formatHpValue(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function addOreReward(player, amount, preferred = "ore") {
  const target = getOreTargetForMode(preferred, player);
  const gained = Math.min(amount, getItemFreeAmount(player, target));
  if (gained > 0) player[target] += gained;
  return { target, gained };
}

function addItemReward(player, key, amount) {
  const gained = Math.min(Math.max(0, Math.floor(amount)), getItemFreeAmount(player, key));
  if (gained > 0) player[key] = (player[key] || 0) + gained;
  return gained;
}

const getTotalAsset = economySystem.getTotalAsset;
const PLAYER_VALUE_CAP = 1_000_000_000_000;
const SUPPLY_STATION_INTERVAL = 25;
const RAPTOR_CAVE_MAX_DEPTH = 50;
const UNDERGROUND_INN_CYCLE_MS = 6 * 60 * 60 * 1000;
const UNDERGROUND_INN_ITEMS = {
  gemTicket: {
    label: "💎 寶石洞入場券",
    resource: "invertedOre",
    basePrice: 34,
    priceSpread: 20,
    description: "下次從地表下礦必定進入寶石洞窟。"
  },
  raptorTicket: {
    label: "🐓 猛禽洞窟入場券",
    resource: "invertedGem",
    basePrice: 28,
    priceSpread: 18,
    description: "下次從地表下礦必定進入猛禽洞窟，野雞出現率大幅提高。"
  },
  goldOreBlessing: {
    label: "📈 金礦收購祝福",
    resource: "invertedGem",
    basePrice: 12,
    priceSpread: 10,
    blessing: "goldOre",
    description: "30 分鐘內金礦與金錠收購價提升。"
  },
  gemBlessing: {
    label: "💎 寶石收購祝福",
    resource: "invertedGem",
    basePrice: 15,
    priceSpread: 12,
    blessing: "gem",
    description: "30 分鐘內寶石收購價提升。"
  },
  reverseBlessing: {
    label: "🌀 顛倒礦收購祝福",
    resource: "invertedGem",
    basePrice: 18,
    priceSpread: 14,
    blessing: "inverted",
    description: "30 分鐘內保留中的顛倒資源交易價提高。"
  },
  thickSoleShoes: {
    label: "👞 厚底鞋",
    resource: "invertedOre",
    basePrice: 8,
    priceSpread: 9,
    description: "抵擋一次坑洞墜落傷害，不能與藥水共存。"
  },
  quickChickenBall: {
    label: "🥎 先機球",
    resource: "invertedGem",
    basePrice: 22,
    priceSpread: 18,
    description: "抓野生雞時無視等級差靠賽判定，單次消耗。"
  }
};

function migratePreUpdateDeepPlayer(playerInput) {
  const player = getPlayer(playerInput);
  if (player.migratedToUndergroundCamp || player.zone === "undergroundCamp" || player.zone === "upward" || player.zone === "skyCamp") return player;
  if ((player.depth || 0) < CONFIG.mining.lavaDepth) return player;
  player.preUpdateDeepPlayer = true;
  player.migratedToUndergroundCamp = true;
  player.undergroundCampUnlocked = true;
  player.zone = "undergroundCamp";
  player.caveType = null;
  player.depth = CONFIG.mining.lavaDepth;
  player.lastMigrationMessage = "🌋 你穿越了崩塌的深層礦區…\n🏕️ 你抵達了地底營地。";
  return player;
}

const payFromTotalAsset = economySystem.payFromTotalAsset;
const getElevatorCost = economySystem.getElevatorCost;

function getAreaLabel(playerInput) {
  const player = getPlayer(playerInput);
  if (player.zone === "lavaPool") return "岩漿池";
  if (player.zone === "undergroundCamp") return "地底營地";
  if (player.zone === "upward") return (player.depth || 0) >= 0 ? "回升礦道" : "反轉上挖層";
  if (player.zone === "skyCamp") return "天域營地";
  return getCaveLabel(player);
}

function getPressureMultiplier(playerInput) {
  const player = getPlayer(playerInput);
  const absDepth = Math.abs(player.depth || 0);
  if (absDepth < CONFIG.balance.pressureStartDepth) return 1;
  const pressure = Math.min(CONFIG.balance.pressureMaxBombBonus, (absDepth - CONFIG.balance.pressureStartDepth) / 180);
  const fatigue = (player.bestRecordTimestamps || []).length >= 3 ? CONFIG.balance.recordFatigueDangerBonus : 0;
  return 1 + pressure + fatigue;
}

function getJunkFreeSlots(player) {
  return Math.floor(getBagFreeSlots(player) / 3);
}

function consumeRandomGem(player, random = Math.random) {
  const gems = [
    ["redGem", "紅寶石"],
    ["blueGem", "藍寶石"],
    ["greenGem", "綠寶石"]
  ].filter(([key]) => player[key] > 0);
  if (gems.length === 0) return null;
  const [key, name] = gems[Math.floor(random() * gems.length)];
  player[key] -= 1;
  return { key, name };
}

function getDigPathIds() {
  return Object.keys(CONFIG.mining.digPathTypes);
}

function getDigPathSidesForCount(count) {
  if (count <= 1) return ["middle"];
  if (count === 2) return ["left", "right"];
  return ["left", "middle", "right"];
}

function refreshDigPathOptions(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const pool = getDigPathIds();
  const count = Math.min(3, Math.max(1, 1 + Math.floor(random() * 3)));
  const sides = getDigPathSidesForCount(count);
  const options = [];
  while (options.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    options.push(pool.splice(index, 1)[0]);
  }
  player.digPathOptions = sides.reduce((next, side, index) => {
    next[side] = options[index] || "steady";
    return next;
  }, {});
  return player;
}

function getDigPath(playerInput, sideOrPath) {
  const player = getPlayer(playerInput);
  const pathId = player.digPathOptions[sideOrPath] || sideOrPath;
  return CONFIG.mining.digPathTypes && CONFIG.mining.digPathTypes[pathId]
    ? CONFIG.mining.digPathTypes[pathId]
    : null;
}

function getDigPathOptions(playerInput) {
  const player = getPlayer(playerInput);
  const currentSides = ["left", "middle", "right"].filter((side) => player.digPathOptions[side]);
  const normalized = currentSides.length > 0
    ? player
    : refreshDigPathOptions(player, () => 0);
  const sides = ["left", "middle", "right"].filter((side) => normalized.digPathOptions[side]);
  return sides.map((side) => {
    const id = normalized.digPathOptions[side];
    const path = getDigPath(normalized, id);
    return {
      side,
      id,
      label: path ? path.label : side
    };
  });
}

function getDigPathPrefix(playerInput, sideOrPath) {
  const path = getDigPath(playerInput, sideOrPath);
  return path ? `${path.label}。` : "";
}

const MEMORY_EVENT_CHOICES = ["risk", "safe", "extreme"];
const MEMORY_EVENT_OPTION_LABELS = {
  risk: "①",
  safe: "②",
  extreme: "③"
};

function recordDigPathVisit(player, sideOrPath) {
  const path = getDigPath(player, sideOrPath);
  if (!path || !path.label) return;
  player.digPathHistory = [
    ...(Array.isArray(player.digPathHistory) ? player.digPathHistory : []),
    {
      label: path.label,
      depth: player.depth || 0
    }
  ].slice(-10);
}

function rotateOrder(list, amount = 1) {
  if (list.length <= 1) return [...list];
  const offset = ((amount % list.length) + list.length) % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function buildWrongMemoryOrders(correctOrder) {
  const candidates = [
    [...correctOrder].reverse(),
    rotateOrder(correctOrder, 1),
    rotateOrder(correctOrder, 2),
    [...correctOrder.slice(1).reverse(), correctOrder[0]].filter(Boolean)
  ];
  const correctKey = correctOrder.join(">");
  const unique = [];
  const seen = new Set([correctKey]);
  for (const order of candidates) {
    const key = order.join(">");
    if (order.length === correctOrder.length && !seen.has(key)) {
      seen.add(key);
      unique.push(order);
    }
  }
  while (unique.length < 2) {
    unique.push([...correctOrder]);
  }
  return unique.slice(0, 2);
}

function setupMemoryChallenge(player, event, eventId, random = Math.random) {
  if (!event || !event.requiresPathHistory) return "";
  const count = event.requiresPathHistory;
  const correctOrder = (player.digPathHistory || [])
    .slice(-count)
    .map((entry) => entry.label);
  if (correctOrder.length < count) return "";

  const correctChoice = MEMORY_EVENT_CHOICES[Math.floor(random() * MEMORY_EVENT_CHOICES.length)] || "risk";
  const wrongOrders = buildWrongMemoryOrders(correctOrder);
  const options = {};
  let wrongIndex = 0;
  for (const choice of MEMORY_EVENT_CHOICES) {
    options[choice] = choice === correctChoice ? correctOrder : wrongOrders[wrongIndex++];
  }

  player.memoryChallenge = {
    eventId,
    correctChoice,
    options
  };

  const lines = MEMORY_EVENT_CHOICES.map((choice) => (
    `${MEMORY_EVENT_OPTION_LABELS[choice]} ${options[choice].join(" → ")}`
  ));
  return `\n\n請選出前 ${count} 段礦區的正確順序：\n${lines.join("\n")}`;
}

function applyDigPathWeights(weights, playerInput, sideOrPath) {
  const path = getDigPath(playerInput, sideOrPath);
  if (!path || !path.weightMultipliers) return weights;

  const next = { ...weights };
  for (const [key, multiplier] of Object.entries(path.weightMultipliers)) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      next[key] *= multiplier;
    }
  }
  return next;
}

function getDigPathRewardMultiplier(playerInput, sideOrPath) {
  const path = getDigPath(playerInput, sideOrPath);
  return path && path.rewardMultiplier ? path.rewardMultiplier : 1;
}

function resolvePitDigPath(player, path, random = Math.random, now = Date.now(), recordMessage = "") {
  const jumpRange = Array.isArray(path.jumpDepth) ? path.jumpDepth : [1, 2];
  const minJump = Math.max(1, Math.floor(jumpRange[0] || 1));
  const maxJump = Math.max(minJump, Math.floor(jumpRange[1] || minJump));
  const extraDepth = minJump + Math.floor(random() * (maxJump - minJump + 1));
  player.depth += extraDepth;
  const extraRecord = addRunDepthProgress(player, extraDepth);
  let damage = null;
  let fallMessage = "";
  if ((player.thickSoleShoes || 0) > 0) {
    player.thickSoleShoes -= 1;
    damage = { dead: false, damage: 0, message: "👞 厚底鞋幫你緩衝了墜落！" };
    fallMessage = damage.message;
  } else {
    damage = addBombDamage(player, now, path.damage || 1);
    fallMessage = damage.message;
  }
  const recordLine = [recordMessage, extraRecord].filter(Boolean).join("\n");
  const rewardType = path.pitReward === "mixed"
    ? (random() < 0.5 ? "gold" : "ore")
    : path.pitReward;
  const rewardMultiplier = path.rewardMultiplier || 1;

  if (player.dead) {
    return {
      kind: "dead",
      player,
      title: path.label,
      message: `你跳進${path.label}，往下摔了 ${extraDepth} 層。\n${fallMessage}${recordLine ? `\n${recordLine}` : ""}`,
      recordMessage: recordLine
    };
  }

  if (rewardType === "ore") {
    const amount = Math.max(1, Math.floor((2 + getDepthBonus(player.depth)) * rewardMultiplier));
    const reward = addOreReward(player, amount, "ore");
    player.lastReward = makeReward(reward.target, reward.gained);
    return buildOutcome(
      reward.target,
      player,
      path.label,
      `你跳進${path.label}，往下摔了 ${extraDepth} 層，${fallMessage}\n撿到 ${reward.gained} 塊${getOreName(reward.target)}。`,
      recordLine,
      random
    );
  }

  const gold = Math.max(1, Math.floor((25 + Math.max(0, player.depth) * 3) * rewardMultiplier));
  player.gold += gold;
  player.lastReward = makeReward("gold", gold, gold);
  onGoldGained(player);
  return buildOutcome(
    "gold",
    player,
    path.label,
    `你跳進${path.label}，往下摔了 ${extraDepth} 層，${fallMessage}\n撿到 ${gold} 金幣。`,
    recordLine,
    random
  );
}

function getMiningWeights(playerInput, digPath = null) {
  const player = getPlayer(playerInput);
  const dangerTier = Math.min(4, Math.floor(player.depth / 3));
  const mode = player.runMode ? CONFIG.runModes[player.runMode] : null;
  const weights = { ...CONFIG.mining.weights };
  weights.gold = Math.max(32, weights.gold - dangerTier * 2);
  weights.ore += dangerTier * 3;
  if (player.depth >= 15) weights.goldOre = 8 + Math.min(6, Math.floor((player.depth - 15) / 5));
  if (player.depth >= 30) weights.platinumOre = 5 + Math.min(5, Math.floor((player.depth - 30) / 5));
  weights.rusty += dangerTier;
  weights.bomb += dangerTier * 4;
  weights.empty = Math.max(4, weights.empty - dangerTier * 2);
  if (mode && mode.rustyWeightMultiplier) weights.rusty *= mode.rustyWeightMultiplier;
  if (mode && mode.bombWeightMultiplier) weights.bomb *= mode.bombWeightMultiplier;
  if (mode && mode.deepInstinct) weights.bomb *= 1.05 + Math.min(0.2, player.depth / 500);
  if (getChickenMiningBonus(player).eventChanceBonus > 0) weights.empty *= 0.95;
  weights.gold *= getEffectMultiplier(player, "goldWeightMultiplier");
  weights.ore *= getEffectMultiplier(player, "oreWeightMultiplier");
  weights.goldOre *= getEffectMultiplier(player, "oreWeightMultiplier");
  weights.platinumOre *= getEffectMultiplier(player, "oreWeightMultiplier");
  weights.junk *= getEffectMultiplier(player, "junkWeightMultiplier");
  weights.empty *= getEffectMultiplier(player, "emptyWeightMultiplier");
  weights.bomb *= getEffectMultiplier(player, "bombWeightMultiplier");
  weights.bomb *= Math.pow(CONFIG.minorBuffs.bomb.bombWeightMultiplier, getMinorBuffEffectiveStacks(player, "bomb"));
  weights.bomb *= getPressureMultiplier(player);
  return applyTraitWeights(applyDigPathWeights(weights, player, digPath), player, CONFIG);
}

function getMaxBombs(playerInput) {
  const player = getPlayer(playerInput);
  const mode = getMode(player);
  return CONFIG.mining.baseHp + (mode && mode.extraHp ? mode.extraHp : 0) + (player.tempMaxHp || 0);
}

function getModeRewardMultiplier(playerInput) {
  const player = getPlayer(playerInput);
  const mode = getMode(player);
  if (!mode) return 1;
  let multiplier = 1;
  if (mode.earlyRewardMultiplier && player.depth <= 5) multiplier *= mode.earlyRewardMultiplier;
  if (mode.lowHpRewardMultiplier && getMaxBombs(player) - player.bombs <= 1) multiplier *= mode.lowHpRewardMultiplier;
  if (mode.deepRewardMultiplier && player.depth >= 50) multiplier *= mode.deepRewardMultiplier;
  if (mode.deepInstinct) multiplier *= 1 + Math.floor(Math.max(0, player.depth) / 10) * 0.1;
  if (mode.downRewardMultiplier && player.depth > 0) multiplier *= mode.downRewardMultiplier;
  if (mode.reverseRewardMultiplier && player.zone === "upward") multiplier *= mode.reverseRewardMultiplier;
  multiplier *= getChickenMiningBonus(player).deepRewardMultiplier;
  return multiplier;
}

function getDepthLabel(depth) {
  if (depth <= -100) return "天域營地";
  if (depth < 0) return "反轉上挖層";
  if (depth >= 100) return "岩漿邊界";
  if (depth >= 10) return "危險礦層";
  if (depth >= 7) return "古代礦層";
  if (depth >= 4) return "深色礦層";
  return "淺層礦道";
}

function getDepthBonus(depth) {
  return Math.min(8, Math.floor(depth / 3));
}

function getGoldAmount(depth, random = Math.random) {
  const bonus = getDepthBonus(depth);
  return 1 + bonus + Math.floor(random() * (3 + bonus * 2));
}

function getOreAmount(depth, random = Math.random) {
  const bonus = getDepthBonus(depth);
  return 1 + Math.floor(random() * (2 + bonus));
}

function getMode(playerInput) {
  const player = getPlayer(playerInput);
  return player.runMode ? CONFIG.runModes[player.runMode] || null : null;
}

function getChickenStageId(chicken) {
  if (!chicken || !chicken.level) return null;
  if (chicken.level <= 5) return "young";
  if (chicken.level <= 15) return "mature";
  return "complete";
}

function getChickenMiningBonus(playerInput) {
  const player = getPlayer(playerInput);
  const chicken = player.ownedChicken;
  const stage = getChickenStageId(chicken);
  if (!chicken || !stage) {
    return {
      goldMultiplierBonus: 0,
      oreMultiplierBonus: 0,
      critChanceBonus: 0,
      eventChanceBonus: 0,
      bombDodgeChance: 0,
      deepRewardMultiplier: 1
    };
  }
  const stageBonus = {
    young: { goldMultiplierBonus: 0.03, oreMultiplierBonus: 0, critChanceBonus: 0 },
    mature: { goldMultiplierBonus: 0.05, oreMultiplierBonus: 0.05, critChanceBonus: 0 },
    complete: { goldMultiplierBonus: 0.08, oreMultiplierBonus: 0.08, critChanceBonus: 0.03 }
  }[stage];
  const personalityId = chicken.personalityId || "";
  return {
    ...stageBonus,
    eventChanceBonus: personalityId === "chosen" ? 0.04 : 0,
    bombDodgeChance: personalityId === "steady" ? 0.08 : 0,
    deepRewardMultiplier: (personalityId === "sleepy" || personalityId === "veteran") && player.depth >= 20 ? 1.05 : 1
  };
}

function getChickenCompanionText(playerInput) {
  const player = getPlayer(playerInput);
  const chicken = player.ownedChicken;
  if (!chicken) return "無";
  const stage = getChickenStageId(chicken);
  const stageLabel = stage === "complete" ? "完全體" : stage === "mature" ? "成熟期" : "幼雞期";
  return `${chicken.icon || "🐔"} ${chicken.name || "小咕"} Lv.${Math.max(1, Math.floor(chicken.level || 1))}｜${stageLabel}`;
}

function getOreTargetForMode(kind, playerInput) {
  const player = getPlayer(playerInput);
  if (player.runMode !== "fireDragonPickaxe" && !shouldRefineOre(player, CONFIG)) return kind;
  if (kind === "ore") return "oreIngot";
  if (kind === "goldOre") return "goldOreIngot";
  if (kind === "platinumOre") return "platinumOreIngot";
  return kind;
}

function getOreName(kind) {
  const names = {
    ore: "礦石",
    goldOre: "金礦石",
    platinumOre: "鉑金礦石",
    oreIngot: "礦錠",
    goldOreIngot: "金錠",
    platinumOreIngot: "鉑金錠",
    invertedOre: "顛倒礦石",
    invertedGem: "顛倒寶石",
    orichalcum: "奧利哈鋼"
  };
  return names[kind] || "礦物";
}

function getRewardGoldValue(kind, amount) {
  const values = {
    gold: 1,
    ore: CONFIG.ore.goldPerOre,
    goldOre: CONFIG.ore.goldPerGoldOre,
    platinumOre: CONFIG.ore.goldPerPlatinumOre,
    goldBlock: CONFIG.ore.goldPerGoldBlock,
    oreIngot: CONFIG.ore.goldPerOreIngot,
    goldOreIngot: CONFIG.ore.goldPerGoldOreIngot,
    platinumOreIngot: CONFIG.ore.goldPerPlatinumOreIngot,
    redGem: CONFIG.ore.redGemGold,
    blueGem: CONFIG.ore.blueGemGold,
    greenGem: CONFIG.ore.greenGemGold,
    bombItem: CONFIG.ore.goldPerBombItem
  };
  return Math.max(0, Math.floor((values[kind] || 0) * amount));
}

function makeReward(kind, amount, baseValue = null) {
  return {
    kind,
    amount: Math.max(0, Math.floor(amount || 0)),
    baseValue
  };
}

function applyDeathPenalty(player) {
  const mode = getMode(player);
  const multiplier = mode && mode.deathPenaltyMultiplier ? mode.deathPenaltyMultiplier : 1;
  const lostGold = Math.min(player.gold, Math.ceil((player.gold / 3) * multiplier));
  player.gold = Math.max(0, player.gold - lostGold);
  return lostGold;
}

function isInMine(playerInput) {
  const player = getPlayer(playerInput);
  return Boolean(
    player.depth !== 0 ||
    player.ore > 0 ||
    player.goldOre > 0 ||
    player.platinumOre > 0 ||
    player.goldBlock > 0 ||
    player.oreIngot > 0 ||
    player.goldOreIngot > 0 ||
    player.platinumOreIngot > 0 ||
    player.bombItem > 0 ||
    player.redGem > 0 ||
    player.blueGem > 0 ||
    player.greenGem > 0 ||
    player.rusty > 0 ||
    player.junk > 0 ||
    player.platinumJunk > 0 ||
    player.bombs > 0 ||
    player.runMode ||
    player.pendingEvent
  );
}

function getRunModeIds(includeChickenTraits = false) {
  return Object.keys(CONFIG.runModes).filter((id) => (
    (includeChickenTraits || !CONFIG.runModes[id].oneTimeChickenTrait)
      && !CONFIG.runModes[id].nextRunOnly
  ));
}

function refreshRunModeOptions(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const basePool = getRunModeIds(false);
  const chickenPool = CHICKEN_TRAIT_IDS.filter((id) => CONFIG.runModes[id]);
  const nextRunPool = [...new Set(player.pendingNextRunTraits || [])].filter((id) => CONFIG.runModes[id]);
  const options = [];
  while (options.length < 2 && (basePool.length > 0 || chickenPool.length > 0 || nextRunPool.length > 0)) {
    const useChickenTrait = (player.chickenTraitTickets || 0) > 0
      && chickenPool.length > 0
      && random() < 0.35;
    const useNextRunTrait = !useChickenTrait && nextRunPool.length > 0 && random() < 0.65;
    const pool = useChickenTrait ? chickenPool : useNextRunTrait ? nextRunPool : basePool;
    if (pool.length === 0) break;
    const index = Math.floor(random() * pool.length);
    const [picked] = pool.splice(index, 1);
    if (picked && !options.includes(picked)) options.push(picked);
  }
  while (options.length < 2 && basePool.length > 0) {
    const index = Math.floor(random() * basePool.length);
    const [picked] = basePool.splice(index, 1);
    if (picked && !options.includes(picked)) options.push(picked);
  }
  player.runModeOptions = options;
  return player;
}

function getRunModeOptions(playerInput) {
  const player = getPlayer(playerInput);
  const ids = player.runModeOptions.length > 0 ? player.runModeOptions : getRunModeIds(false).slice(0, 2);
  return ids
    .map((id) => ({
      id,
      ...CONFIG.runModes[id]
    }))
    .filter((mode) => mode.label);
}

function ensureRunModeOptions(playerInput, random = Math.random) {
  const repaired = repairPlayerState(playerInput, random);
  const player = migratePreUpdateDeepPlayer(repaired.player);
  if (player.runMode || player.dead || player.runModeOptions.length > 0) return player;
  return refreshRunModeOptions(player, random);
}

function repairPlayerState(playerInput, random = Math.random, options = {}) {
  const player = getPlayer(playerInput);
  const fixed = [];
  const clearBlockingState = Boolean(options.clearBlockingState);
  const validZones = new Set(["surface", "mine", "lavaPool", "undergroundCamp", "upward", "skyCamp", "skyDown"]);
  const basePlayer = createPlayer();
  const addFixed = (message) => {
    if (!fixed.includes(message)) fixed.push(message);
  };
  const repairNumber = (object, field, label = field, options = {}) => {
    const fallback = options.fallback !== undefined ? options.fallback : 0;
    const max = options.max !== undefined ? options.max : null;
    const allowNegative = Boolean(options.allowNegative);
    const integer = options.integer !== false;
    const value = Number(object[field]);
    if (!Number.isFinite(value)) {
      object[field] = fallback;
      addFixed(`修正數值欄位：${label}`);
    } else if (typeof object[field] !== "number") {
      object[field] = value;
      addFixed(`轉換數值欄位：${label}`);
    }
    if (integer) object[field] = Math.floor(object[field]);
    if (max !== null && object[field] > max) {
      object[field] = max;
      addFixed(`封頂異常數值：${label}`);
    }
    if (!allowNegative && object[field] < 0) {
      object[field] = 0;
      addFixed(`歸零負數欄位：${label}`);
    }
  };

  if (player.pendingEvent && !getRandomEvent(player.pendingEvent)) {
    addFixed(`清除不存在的事件：${player.pendingEvent}`);
    player.pendingEvent = null;
    player.memoryChallenge = null;
  }
  if (clearBlockingState && player.pendingEvent) {
    const event = getRandomEvent(player.pendingEvent);
    addFixed(`清除卡住的事件：${event ? event.title : player.pendingEvent}`);
    player.pendingEvent = null;
    player.memoryChallenge = null;
  }
  if (clearBlockingState && player.memoryChallenge) {
    player.memoryChallenge = null;
    addFixed("清除卡住的記憶事件");
  }
  if (clearBlockingState && player.eventChallenge) {
    player.eventChallenge = null;
    player.pendingEvent = null;
    addFixed("清除卡住的互動事件");
  }
  if (clearBlockingState && player.traitSwapEvent) {
    player.traitSwapEvent = null;
    player.pendingEvent = null;
    addFixed("清除卡住的詞條交換事件");
  }
  if (clearBlockingState && player.supplyStation) {
    player.supplyStation = null;
    player.nextSupplyDepth = Math.abs(player.depth || 0) + SUPPLY_STATION_INTERVAL;
    player.nextBuffDepth = player.nextSupplyDepth;
    addFixed("清除卡住的補給站");
  }
  if (clearBlockingState && (player.minorBuffOptions.length > 0 || player.minorBuffSelections.length > 0)) {
    player.minorBuffOptions = [];
    player.minorBuffSelections = [];
    addFixed("清除卡住的小詞條選擇");
  }

  if (clearBlockingState && (player.activeMinePanelMessageId || player.activeMinePanelChannelId)) {
    player.activeMinePanelMessageId = "";
    player.activeMinePanelChannelId = "";
    addFixed("重置礦場面板綁定");
  }

  if (clearBlockingState && !player.runMode && !player.dead && player.runModeOptions.length > 0) {
    if (player.zone === "surface" && player.depth === 0 && player.runDepthProgress === 0 && !player.caveType) {
      player.runModeOptions = refreshRunModeOptions(player, random).runModeOptions;
      addFixed("重建卡住的初始詞條選項");
    } else {
      player.runModeOptions = [];
      addFixed("清除卡住的初始詞條選擇");
    }
  }

  if (clearBlockingState && player.runMode && player.runModeOptions.length > 0) {
    player.runModeOptions = [];
    addFixed("清除多餘的初始詞條候選");
  }

  if (player.runMode && !CONFIG.runModes[player.runMode]) {
    addFixed(`清除不存在的詞條：${player.runMode}`);
    player.runMode = null;
  }

  if (!validZones.has(player.zone)) {
    addFixed(`修正未知區域：${player.zone || "空值"}`);
    player.zone = "surface";
  }
  if (player.zone === "surface" && player.runMode && (player.depth > 0 || player.runDepthProgress > 0 || player.caveType)) {
    player.zone = "mine";
    addFixed("修正礦坑區域狀態");
  }

  const numericFields = [
    "gold",
    "bankGold",
    "enteringGold",
    "depth",
    "runDepthProgress",
    "bombs",
    "mines",
    "ore",
    "goldOre",
    "platinumOre",
    "goldBlock",
    "oreIngot",
    "goldOreIngot",
    "platinumOreIngot",
    "redGem",
    "blueGem",
    "greenGem",
    "invertedOre",
    "invertedGem",
    "orichalcum",
    "junk",
    "platinumJunk",
    "rusty",
    "bombItem",
    "undyingTotem",
    "healingPotion",
    "magicCandy",
    "chickenBooster",
    "minerHelmetCount",
    "chickenTraitTickets",
    "chickenArenaRank",
    "chickenRoastHpBonus",
    "tempMaxHp",
    "bagBonusSlots",
    "lavaProgress",
    "potionCooldown",
    "rescueBonusCount",
    "chargeValue",
    "comboCount",
    "maxCombo",
    "critCount",
    "jackpotCount",
    "lastDeathLostGold"
  ];
  const cappedFields = new Set([
    "gold",
    "bankGold",
    "enteringGold",
    "ore",
    "goldOre",
    "platinumOre",
    "goldBlock",
    "oreIngot",
    "goldOreIngot",
    "platinumOreIngot",
    "redGem",
    "blueGem",
    "greenGem",
    "invertedOre",
    "invertedGem",
    "orichalcum",
    "healingPotion",
    "magicCandy",
    "chickenBooster",
    "minerHelmetCount",
    "chickenTraitTickets",
    "lastDeathLostGold"
  ]);
  for (const field of numericFields) {
    repairNumber(player, field, field, {
      fallback: basePlayer[field] || 0,
      max: cappedFields.has(field) ? PLAYER_VALUE_CAP : null,
      allowNegative: field === "depth" || field === "runDepthProgress",
      integer: field !== "bombs"
    });
  }

  if (!["full", "compact"].includes(player.uiMode)) {
    player.uiMode = "full";
    addFixed("修正 UI 模式");
  }
  if (typeof player.dead !== "boolean") {
    player.dead = Boolean(player.dead);
    addFixed("修正死亡狀態");
  }
  if (player.dead && !Number.isFinite(Number(player.deathAt))) {
    player.deathAt = Date.now();
    addFixed("補上死亡時間");
  }
  if (!player.dead && player.deathAt !== null) {
    player.deathAt = null;
    addFixed("清除多餘死亡時間");
  }
  const maxBombs = getMaxBombs(player);
  if (!player.dead && player.bombs >= maxBombs) {
    player.bombs = Math.max(0, maxBombs - DAMAGE_PER_HIT);
    addFixed("修正超過上限的生命損傷");
  }
  if (player.bombs > maxBombs) {
    player.bombs = maxBombs;
    addFixed("封頂生命損傷");
  }

  if (player.zone !== "lavaPool" && player.lavaProgress !== 0) {
    player.lavaProgress = 0;
    addFixed("清除岩漿進度");
  }
  if (player.zone === "lavaPool" && (player.lavaProgress < 0 || player.lavaProgress > 5)) {
    player.lavaProgress = Math.max(0, Math.min(5, player.lavaProgress));
    addFixed("修正岩漿進度");
  }
  if (!["normal", "gem", "raptor"].includes(player.caveType) && player.caveType !== null) {
    player.caveType = null;
    addFixed("修正洞窟類型");
  }

  if (player.challenge && typeof player.challenge === "object") {
    ["challengeGold", "depth", "potions", "hp", "maxHp"].forEach((field) => repairNumber(player.challenge, field, `challenge.${field}`, {
      fallback: field === "maxHp" ? 3 : 0,
      max: field === "challengeGold" ? PLAYER_VALUE_CAP : null,
      integer: field !== "hp"
    }));
    player.challenge.hp = Math.min(player.challenge.hp, player.challenge.maxHp);
    if (player.challenge.trait && !CONFIG.runModes[player.challenge.trait]) {
      player.challenge.trait = null;
      addFixed("清除挑戰模式錯誤詞條");
    }
    player.challenge.routeOptions = Array.isArray(player.challenge.routeOptions) ? player.challenge.routeOptions.slice(0, 3) : [];
    player.challenge.modifiers = Array.isArray(player.challenge.modifiers) ? player.challenge.modifiers.slice(0, 3) : [];
    player.challenge.items = player.challenge.items && typeof player.challenge.items === "object" ? player.challenge.items : {};
    Object.keys(player.challenge.items).forEach((key) => repairNumber(player.challenge.items, key, `challenge.items.${key}`, { max: PLAYER_VALUE_CAP }));
    player.challenge.miniTraits = player.challenge.miniTraits && typeof player.challenge.miniTraits === "object" ? player.challenge.miniTraits : {};
    Object.keys(player.challenge.miniTraits).forEach((key) => repairNumber(player.challenge.miniTraits, key, `challenge.miniTraits.${key}`, { max: 999 }));
  } else if (player.challenge !== null) {
    player.challenge = null;
    addFixed("清除錯誤挑戰資料");
  }

  player.runModeOptions = (player.runModeOptions || []).filter((id) => CONFIG.runModes[id]).slice(0, 2);
  if (!player.runMode && !player.dead && player.runModeOptions.length === 0) {
    player.runModeOptions = refreshRunModeOptions(player, random).runModeOptions;
    addFixed("重建初始詞條選項");
  }
  player.pendingNextRunTraits = Array.isArray(player.pendingNextRunTraits)
    ? player.pendingNextRunTraits.filter((id) => CONFIG.runModes[id]).slice(0, 10)
    : [];
  player.minorBuffOptions = Array.isArray(player.minorBuffOptions)
    ? player.minorBuffOptions.filter((id) => CONFIG.minorBuffs[id]).slice(0, 3)
    : [];
  player.minorBuffSelections = Array.isArray(player.minorBuffSelections)
    ? player.minorBuffSelections.filter((id) => CONFIG.minorBuffs[id]).slice(0, 1)
    : [];
  Object.keys(player.minorBuffs || {}).forEach((key) => {
    if (!CONFIG.minorBuffs[key]) delete player.minorBuffs[key];
    else repairNumber(player.minorBuffs, key, `minorBuffs.${key}`, { max: 999 });
  });
  for (const key of Object.keys(CONFIG.minorBuffs)) {
    if (player.minorBuffs[key] === undefined) player.minorBuffs[key] = 0;
  }
  if (!player.traitState || typeof player.traitState !== "object") {
    player.traitState = createTraitState();
    addFixed("重建詞條狀態");
  }
  Object.keys(createTraitState()).forEach((key) => repairNumber(player.traitState, key, `traitState.${key}`, { max: 999 }));

  const beforePaths = Object.keys(player.digPathOptions || {}).length;
  player.digPathOptions = Object.fromEntries(
    Object.entries(player.digPathOptions || {}).filter(([side, pathId]) => (
      ["left", "middle", "right"].includes(side) && CONFIG.mining.digPathTypes[pathId]
    ))
  );
  if (beforePaths !== Object.keys(player.digPathOptions).length) addFixed("清理錯誤路線資料");

  const beforeHistory = Array.isArray(player.digPathHistory) ? player.digPathHistory.length : 0;
  player.digPathHistory = Array.isArray(player.digPathHistory)
    ? player.digPathHistory
      .filter((entry) => entry && typeof entry.label === "string" && entry.label.trim())
      .map((entry) => ({ label: entry.label.trim(), depth: Number.isFinite(Number(entry.depth)) ? Number(entry.depth) : 0 }))
      .slice(-10)
    : [];
  if (beforeHistory !== player.digPathHistory.length) addFixed("清理礦區記憶");
  if (player.memoryChallenge && (!player.memoryChallenge.options || !player.memoryChallenge.correctChoice)) {
    player.memoryChallenge = null;
    addFixed("清理錯誤記憶事件");
  }
  if (player.eventChallenge && (!player.eventChallenge.eventId || (!player.eventChallenge.correctChoice && player.eventChallenge.type !== "lockpick"))) {
    player.eventChallenge = null;
    addFixed("清理錯誤互動事件");
  }
  player.tempEffects = Array.isArray(player.tempEffects)
    ? player.tempEffects
      .filter((effect) => effect && typeof effect.id === "string" && effect.id.trim())
      .map((effect) => ({
        ...effect,
        id: effect.id.trim(),
        remaining: Math.max(0, Math.floor(effect.remaining || 0))
      }))
      .filter((effect) => effect.remaining > 0)
      .slice(0, 20)
    : [];
  if (!["gold", "ore", "goldOre", "platinumOre", "redGem", "blueGem", "greenGem", "bomb", "empty", "gold_or_ore", "rusty", "stalactite", "platinumJunk", "junk", "bombItem"].includes(player.forcedNextResult) && player.forcedNextResult !== null) {
    player.forcedNextResult = null;
    addFixed("清除錯誤強制結果");
  }
  if (player.goldBeast && typeof player.goldBeast === "object") {
    repairNumber(player.goldBeast, "amount", "goldBeast.amount", { max: PLAYER_VALUE_CAP });
    repairNumber(player.goldBeast, "returnDepth", "goldBeast.returnDepth", { max: 9999 });
  } else if (player.goldBeast !== null) {
    player.goldBeast = null;
    addFixed("清除錯誤吞金獸資料");
  }
  player.runRewardStats = player.runRewardStats && typeof player.runRewardStats === "object" ? player.runRewardStats : createFunState().runRewardStats;
  Object.keys(createFunState().runRewardStats).forEach((key) => repairNumber(player.runRewardStats, key, `runRewardStats.${key}`, { max: PLAYER_VALUE_CAP }));
  if (!["reward", "safe", "resource"].includes(player.chargeBurst) && player.chargeBurst !== null) {
    player.chargeBurst = null;
    addFixed("清除錯誤蓄力狀態");
  }

  player.collection = player.collection && typeof player.collection === "object" ? player.collection : {};
  Object.keys(player.collection).forEach((key) => repairNumber(player.collection, key, `collection.${key}`, { max: PLAYER_VALUE_CAP }));
  player.undergroundStorage = {
    ...basePlayer.undergroundStorage,
    ...(player.undergroundStorage && typeof player.undergroundStorage === "object" ? player.undergroundStorage : {})
  };
  Object.keys(player.undergroundStorage).forEach((key) => repairNumber(player.undergroundStorage, key, `undergroundStorage.${key}`, { max: PLAYER_VALUE_CAP }));
  player.bestRecordTimestamps = Array.isArray(player.bestRecordTimestamps)
    ? player.bestRecordTimestamps.filter((time) => Number.isFinite(Number(time))).map(Number).slice(-10)
    : [];
  player.chickenBoosterUseLog = Array.isArray(player.chickenBoosterUseLog)
    ? player.chickenBoosterUseLog.filter((time) => Number.isFinite(Number(time))).map(Number).slice(-10)
    : [];
  player.stats = player.stats && typeof player.stats === "object" ? player.stats : basePlayer.stats;
  ["bestDepth", "totalMines", "deaths"].forEach((field) => repairNumber(player.stats, field, `stats.${field}`, { max: PLAYER_VALUE_CAP }));
  if (player.ownedChicken) {
    const repairedChicken = normalizeOwnedChicken(player.ownedChicken);
    if (!repairedChicken) {
      player.ownedChicken = null;
      addFixed("清除錯誤養雞資料");
    } else {
      player.ownedChicken = repairedChicken;
    }
  }
  if (typeof player.activeMinePanelMessageId !== "string") {
    player.activeMinePanelMessageId = "";
    addFixed("清除錯誤礦場面板");
  }
  if (typeof player.activeMinePanelChannelId !== "string") {
    player.activeMinePanelChannelId = "";
    addFixed("清除錯誤礦場頻道");
  }

  return {
    ok: true,
    player,
    fixed,
    message: fixed.length ? `已修復：${fixed.join("、")}。` : "玩家資料看起來正常，沒有需要修復的項目。"
  };
}

function refreshCampRunModeOptions(player, random = Math.random) {
  player.runMode = null;
  player.runModeOptions = refreshRunModeOptions(player, random).runModeOptions;
  return player;
}

function rerollRunModeOptions(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const cost = CONFIG.mining.runModeRerollCostGold;

  if (player.dead) {
    return {
      ok: false,
      player,
      message: "死亡時不能刷新初始詞條。"
    };
  }

  if (player.runMode) {
    return {
      ok: false,
      player,
      message: "已經在礦坑裡了，返回地面後才能刷新初始詞條。"
    };
  }

  if (player.gold < cost) {
    return {
      ok: false,
      player,
      message: `刷新初始詞條需要 ${cost} 金幣，你目前只有 ${player.gold} 金幣。`
    };
  }

  player.gold -= cost;
  player.runModeOptions = refreshRunModeOptions(player, random).runModeOptions;

  return {
    ok: true,
    player,
    message: `花費 ${cost} 金幣刷新初始詞條。`
  };
}

function resetRunState(player, random = Math.random) {
  player.rusty = 0;
  player.ore = 0;
  player.goldOre = 0;
  player.platinumOre = 0;
  player.goldBlock = 0;
  player.oreIngot = 0;
  player.goldOreIngot = 0;
  player.platinumOreIngot = 0;
  player.bombItem = 0;
  player.junk = 0;
  player.redGem = 0;
  player.blueGem = 0;
  player.greenGem = 0;
  player.invertedOre = 0;
  player.invertedGem = 0;
  player.platinumJunk = 0;
  player.bombs = 0;
  player.depth = 0;
  player.runDepthProgress = 0;
  player.zone = "surface";
  player.lavaProgress = 0;
  player.runMode = null;
  player.caveType = null;
  player.minorBuffs = { ...createPlayer().minorBuffs };
  player.minorBuffOptions = [];
  player.minorBuffSelections = [];
  player.minorBuffBreakthroughMode = false;
  player.nextBuffDepth = 5;
  player.nextSupplyDepth = SUPPLY_STATION_INTERVAL;
  player.supplyStation = null;
  player.pendingEvent = null;
  player.eventChallenge = null;
  player.traitSwapEvent = null;
  player.traitMutation = null;
  player.wildChickenEncounter = null;
  player.digPathHistory = [];
  player.memoryChallenge = null;
  player.nextEventDepth = 4;
  player.eventMissCount = 0;
  player.tempEffects = [];
  player.forcedNextResult = null;
  player.goldBeast = null;
  player.returnBlessing = false;
  player.potionCooldown = 0;
  player.lastMigrationMessage = "";
  player.chickenAmuletUsed = false;
  resetFunRunState(player);
  player.tempMaxHp = 0;
  player.traitState = createTraitState();
  player.bagBonusSlots = 0;
  player.digPathOptions = {};
  player.runModeOptions = refreshRunModeOptions(player, random).runModeOptions;
}

function getRunModeLabel(playerInput) {
  const player = getPlayer(playerInput);
  return player.runMode && CONFIG.runModes[player.runMode]
    ? CONFIG.runModes[player.runMode].label
    : "尚未選擇";
}

function setUiMode(playerInput, mode) {
  const player = getPlayer(playerInput);
  const nextMode = mode === "compact" ? "compact" : "full";
  player.uiMode = nextMode;
  return {
    ok: true,
    player,
    message: nextMode === "compact" ? "已切換為精簡 UI。" : "已切換為完整 UI。"
  };
}

function getCaveLabel(playerInput) {
  const player = getPlayer(playerInput);
  if (player.caveType === "gem") return "寶石礦洞";
  if (player.caveType === "raptor") return "猛禽洞窟";
  if (player.zone === "lavaPool") return "岩漿池";
  if (player.zone === "undergroundCamp") return "地底營地";
  if (player.zone === "upward") return "反轉上挖層";
  if (player.zone === "skyCamp") return "天域營地";
  if (player.caveType === "normal") return "普通礦洞";
  return "尚未進洞";
}

const depositBank = (playerInput, amount = null) => economySystem.depositBank(playerInput, isInMine, amount);
const withdrawBank = (playerInput, amount = null) => economySystem.withdrawBank(playerInput, isInMine, amount);
const travelToUndergroundCamp = (playerInput, now = Date.now()) => (
  economySystem.travelToUndergroundCamp(playerInput, isInMine, now)
);

function getInnCycle(now = Date.now()) {
  return Math.floor(now / UNDERGROUND_INN_CYCLE_MS) * UNDERGROUND_INN_CYCLE_MS;
}

function innWave(itemId, cycle) {
  let hash = 0;
  const seed = `${itemId}:${cycle}`;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return hash / 9973;
}

function normalizeUndergroundInnInventory(globalStateInput = null, now = Date.now()) {
  const state = normalizeGlobalState(globalStateInput || {}, now);
  const cycleStartedAt = getInnCycle(now);
  const current = state.undergroundInnInventory || {};
  if (current.cycleStartedAt === cycleStartedAt && current.prices) return state;
  const previousPurchases = current.purchases || {};
  const prices = {};
  for (const [itemId, item] of Object.entries(UNDERGROUND_INN_ITEMS)) {
    const demand = Math.min(18, Math.floor(previousPurchases[itemId] || 0));
    prices[itemId] = item.basePrice + Math.floor(innWave(itemId, cycleStartedAt) * item.priceSpread) + demand * 2;
  }
  state.undergroundInnInventory = {
    cycleStartedAt,
    purchases: {},
    prices
  };
  return state;
}

function getUndergroundInnSnapshot(globalStateInput = null, now = Date.now()) {
  const state = normalizeUndergroundInnInventory(globalStateInput, now);
  return {
    globalState: state,
    items: Object.entries(UNDERGROUND_INN_ITEMS).map(([id, item]) => ({
      id,
      ...item,
      price: state.undergroundInnInventory.prices[id] || item.basePrice
    }))
  };
}

function formatBlessingTime(expiresAt, now = Date.now()) {
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 60000));
  return `${remaining} 分`;
}

function pruneMarketBlessings(player, now = Date.now()) {
  player.activeMarketBlessings = Object.fromEntries(
    Object.entries(player.activeMarketBlessings || {}).filter(([, expiresAt]) => Number(expiresAt) > now)
  );
  return player;
}

function getMarketBlessingMultiplier(player, type, now = Date.now()) {
  pruneMarketBlessings(player, now);
  return player.activeMarketBlessings && player.activeMarketBlessings[type] > now ? 1.25 : 1;
}

function openUndergroundInn(playerInput, globalStateInput = null, now = Date.now()) {
  const player = pruneMarketBlessings(getPlayer(playerInput), now);
  if (player.zone !== "undergroundCamp") {
    return { ok: false, player, globalState: globalStateInput, message: "地底客棧只能在地底營地使用。" };
  }
  const snapshot = getUndergroundInnSnapshot(globalStateInput, now);
  const itemLines = snapshot.items.map((item) => `${item.label}\n價格：${item.price} ${item.resource === "invertedOre" ? "顛倒礦石" : "顛倒寶石"}\n${item.description}`);
  const blessings = Object.entries(player.activeMarketBlessings || {})
    .filter(([, expiresAt]) => expiresAt > now)
    .map(([type, expiresAt]) => `${type}：${formatBlessingTime(expiresAt, now)}`);
  return {
    ok: true,
    player,
    globalState: snapshot.globalState,
    message: [
      "【地下客棧】",
      "",
      `顛倒礦石：${player.invertedOre || 0}`,
      `顛倒寶石：${player.invertedGem || 0}`,
      "",
      "今日商品：",
      ...itemLines,
      "",
      `祝福：${blessings.length ? blessings.join("｜") : "無"}`
    ].join("\n")
  };
}

function buyUndergroundInnItem(playerInput, itemId, globalStateInput = null, now = Date.now()) {
  const player = pruneMarketBlessings(getPlayer(playerInput), now);
  if (player.zone !== "undergroundCamp") {
    return { ok: false, player, globalState: globalStateInput, message: "地底客棧只能在地底營地使用。" };
  }
  const item = UNDERGROUND_INN_ITEMS[itemId];
  const snapshot = getUndergroundInnSnapshot(globalStateInput, now);
  if (!item) return { ok: false, player, globalState: snapshot.globalState, message: "客棧今天沒有這個商品。" };
  const price = snapshot.globalState.undergroundInnInventory.prices[itemId] || item.basePrice;
  if ((player[item.resource] || 0) < price) {
    return {
      ok: false,
      player,
      globalState: snapshot.globalState,
      message: `顛倒資源不足。${item.label} 需要 ${price} ${item.resource === "invertedOre" ? "顛倒礦石" : "顛倒寶石"}。`
    };
  }
  if (itemId === "gemTicket" && player.guaranteedGemCaveTicket > 0) {
    return { ok: false, player, globalState: snapshot.globalState, message: "你已經有寶石洞入場券，不能堆疊攜帶。" };
  }
  if (itemId === "raptorTicket" && ((player.guaranteedRaptorCaveTicket || 0) > 0 || (player.activeRaptorCaveTicket || 0) > 0)) {
    return { ok: false, player, globalState: snapshot.globalState, message: "你已經有猛禽洞窟入場券，不能堆疊攜帶。" };
  }
  if (itemId === "thickSoleShoes" && (player.healingPotion || 0) > 0) {
    return { ok: false, player, globalState: snapshot.globalState, message: "❌ 你無法同時攜帶藥水與厚底鞋。" };
  }
  if (item.blessing && player.activeMarketBlessings[item.blessing] > now) {
    return { ok: false, player, globalState: snapshot.globalState, message: "同類型收購祝福還在生效，不能重複疊加。" };
  }

  player[item.resource] -= price;
  snapshot.globalState.undergroundInnInventory.purchases[itemId] = (snapshot.globalState.undergroundInnInventory.purchases[itemId] || 0) + 1;
  if (itemId === "gemTicket") player.guaranteedGemCaveTicket = 1;
  else if (itemId === "raptorTicket") player.guaranteedRaptorCaveTicket = 1;
  else if (itemId === "thickSoleShoes") player.thickSoleShoes = (player.thickSoleShoes || 0) + 1;
  else if (itemId === "quickChickenBall") player.quickChickenBall = (player.quickChickenBall || 0) + 1;
  else if (item.blessing) player.activeMarketBlessings[item.blessing] = now + 30 * 60 * 1000;

  return {
    ok: true,
    player,
    globalState: snapshot.globalState,
    message: `你用 ${price} ${item.resource === "invertedOre" ? "顛倒礦石" : "顛倒寶石"} 買下 ${item.label}。`
  };
}

const SKY_UNKNOWN_LIFE_PRICES = {
  invertedOre: 120,
  invertedGem: 350
};

function tradeSkyUnknownLife(playerInput, now = Date.now()) {
  const player = pruneMarketBlessings(getPlayer(playerInput), now);
  if (player.zone !== "skyCamp") {
    return { ok: false, player, message: "未知生命只會在天域營地附近現身。" };
  }

  const invertedOre = Math.max(0, Math.floor(player.invertedOre || 0));
  const invertedGem = Math.max(0, Math.floor(player.invertedGem || 0));
  if (invertedOre + invertedGem <= 0) {
    return {
      ok: false,
      player,
      message: "半透明的未知生命靠近你的包包，又安靜地退開。牠只收顛倒礦物與顛倒寶石。"
    };
  }

  const blessingMultiplier = getMarketBlessingMultiplier(player, "inverted", now);
  const oreGold = Math.floor(invertedOre * SKY_UNKNOWN_LIFE_PRICES.invertedOre * blessingMultiplier);
  const gemGold = Math.floor(invertedGem * SKY_UNKNOWN_LIFE_PRICES.invertedGem * blessingMultiplier);
  const totalGold = oreGold + gemGold;
  player.invertedOre = 0;
  player.invertedGem = 0;
  player.gold += totalGold;

  return {
    ok: true,
    player,
    message: [
      "【天界未知生命】",
      "透明的生命體伸出光絲，收走顛倒礦物與寶石。",
      "",
      `顛倒礦石 x${invertedOre}：${oreGold} 金幣`,
      `顛倒寶石 x${invertedGem}：${gemGold} 金幣`,
      "",
      `總獲得：${totalGold} 金幣`
    ].join("\n")
  };
}

const STORAGE_ITEMS = [
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

const DISCARDABLE_ITEMS = [
  ["ore", "普通礦石"],
  ["goldOre", "金礦石"],
  ["platinumOre", "鉑金礦石"],
  ["oreIngot", "礦錠"],
  ["goldOreIngot", "金錠"],
  ["platinumOreIngot", "鉑金錠"],
  ["redGem", "紅寶石"],
  ["blueGem", "藍寶石"],
  ["greenGem", "綠寶石"],
  ["invertedOre", "顛倒礦石"],
  ["invertedGem", "顛倒寶石"],
  ["orichalcum", "奧利哈鋼"],
  ["bombItem", "完整炸彈"],
  ["minerHelmetCount", "礦工帽"],
  ["healingPotion", "治療藥水"],
  ["magicCandy", "神奇糖果"],
  ["quickChickenBall", "先機球"],
  ["rusty", "生鏽紀念幣"]
];

const STICKY_ITEMS = new Set(["junk", "platinumJunk"]);

function canUseStorage(playerInput) {
  const player = getPlayer(playerInput);
  return player.zone === "surface" || player.zone === "undergroundCamp" || player.zone === "skyCamp";
}

function getStorageTitle(playerInput) {
  const player = getPlayer(playerInput);
  if (player.zone === "undergroundCamp") return "【地底倉庫】";
  if (player.zone === "skyCamp") return "【天域倉庫】";
  return "【地表倉庫】";
}

function getDiscardableItems(playerInput) {
  const player = getPlayer(playerInput);
  const carried = DISCARDABLE_ITEMS
    .map(([id, label]) => ({ id, label, count: Math.max(0, Math.floor(player[id] || 0)) }))
    .filter((item) => item.count > 0);
  const collectibles = CONFIG.collectibles
    .filter((item) => (player.collection[item.id] || 0) > 0)
    .map((item) => ({ id: item.id, label: item.name, count: player.collection[item.id], collectible: true }));
  return [...carried, ...collectibles].slice(0, 25);
}

function formatUndergroundStorage(playerInput) {
  const player = getPlayer(playerInput);
  const storage = player.undergroundStorage || {};
  return [
    getStorageTitle(player),
    ...STORAGE_ITEMS.map(([key, label]) => `${label}：${storage[key] || 0}`)
  ].join("\n");
}

function getStorageItem(input) {
  const query = String(input || "").trim();
  if (!query) return null;
  return STORAGE_ITEMS.find(([key, label]) => key === query || label === query) || null;
}

function formatStorageItemHelp() {
  return STORAGE_ITEMS.map(([key, label]) => `${label}(${key})`).join("、");
}

function openUndergroundStorage(playerInput) {
  const player = getPlayer(playerInput);
  if (!canUseStorage(player)) {
    return { ok: false, player, message: "倉庫只能在地表、地底營地或天域營地使用。" };
  }
  return { ok: true, player, message: formatUndergroundStorage(player) };
}

function depositUndergroundStorage(playerInput, itemInput = null, amountInput = null) {
  const player = getPlayer(playerInput);
  if (!canUseStorage(player)) {
    return { ok: false, player, message: "倉庫只能在地表、地底營地或天域營地使用。" };
  }
  const moved = [];
  const targetItems = itemInput ? [getStorageItem(itemInput)].filter(Boolean) : STORAGE_ITEMS;
  if (itemInput && targetItems.length === 0) {
    return {
      ok: false,
      player,
      message: `找不到可存入的物品：${itemInput}\n可用：${formatStorageItemHelp()}`
    };
  }
  for (const [key, label] of targetItems) {
    const amount = Math.max(0, Math.floor(player[key] || 0));
    if (amount <= 0) continue;
    const requestedAmount = amountInput == null
      ? amount
      : Math.max(0, Math.floor(Number(amountInput) || 0));
    const movedAmount = Math.min(amount, requestedAmount);
    if (movedAmount <= 0) continue;
    player[key] -= movedAmount;
    player.undergroundStorage[key] = (player.undergroundStorage[key] || 0) + movedAmount;
    moved.push(`${label} x${movedAmount}`);
  }
  return {
    ok: true,
    player,
    message: moved.length
      ? `已存入：${moved.join("、")}。\n\n${formatUndergroundStorage(player)}`
      : `沒有可存入倉庫的物品。\n\n${formatUndergroundStorage(player)}`
  };
}

function withdrawUndergroundStorage(playerInput, itemInput = null, amountInput = null) {
  const player = getPlayer(playerInput);
  if (!canUseStorage(player)) {
    return { ok: false, player, message: "倉庫只能在地表、地底營地或天域營地使用。" };
  }
  const moved = [];
  const targetItems = itemInput ? [getStorageItem(itemInput)].filter(Boolean) : STORAGE_ITEMS;
  if (itemInput && targetItems.length === 0) {
    return {
      ok: false,
      player,
      message: `找不到可取出的物品：${itemInput}\n可用：${formatStorageItemHelp()}`
    };
  }
  for (const [key, label] of targetItems) {
    const amount = Math.max(0, Math.floor(player.undergroundStorage[key] || 0));
    if (amount <= 0) continue;
    const requestedAmount = amountInput == null
      ? amount
      : Math.max(0, Math.floor(Number(amountInput) || 0));
    const movedAmount = Math.min(amount, requestedAmount);
    if (movedAmount <= 0) continue;
    player.undergroundStorage[key] -= movedAmount;
    player[key] = (player[key] || 0) + movedAmount;
    moved.push(`${label} x${movedAmount}`);
  }
  return {
    ok: true,
    player,
    message: moved.length
      ? `已取出：${moved.join("、")}。\n\n${formatUndergroundStorage(player)}`
      : `倉庫沒有可取出的物品。\n\n${formatUndergroundStorage(player)}`
  };
}

function chooseRunMode(playerInput, mode, random = null) {
  const player = getPlayer(playerInput);
  const config = CONFIG.runModes[mode];
  const choosingFromUndergroundCamp = player.zone === "undergroundCamp";

  if (!config) {
    return {
      ok: false,
      player,
      message: "沒有這個下礦方式。"
    };
  }

  if (isInMine(player) && !choosingFromUndergroundCamp) {
    return {
      ok: false,
      player,
      message: "已經在礦坑裡了，返回地面後才能重新選擇下礦方式。"
    };
  }

  const options = getRunModeOptions(player).map((option) => option.id);
  if (!options.includes(mode)) {
    return {
      ok: false,
      player,
      message: "這個初始詞條這輪沒有出現，請從目前顯示的兩個詞條選一個。"
    };
  }

  player.runMode = mode;
  if (!choosingFromUndergroundCamp) player.runModeOptions = [];
  if (choosingFromUndergroundCamp) {
    player.caveType = null;
    player.zone = "undergroundCamp";
  } else {
    const gemChance = CONFIG.mining.gemCaveChance + (config.gemCaveChanceBonus || 0);
    if (player.activeRaptorCaveTicket > 0) {
      player.activeRaptorCaveTicket = 0;
      player.caveType = "raptor";
    } else if (player.guaranteedGemCaveTicket > 0) {
      player.guaranteedGemCaveTicket -= 1;
      player.caveType = "gem";
    } else {
      player.caveType = random && random() < gemChance ? "gem" : "normal";
    }
    player.zone = "mine";
  }
  player.enteringGold = player.gold;
  player.highTierEligible = getTotalAsset(player) > 0 && player.enteringGold >= getTotalAsset(player) * 0.5;
  player.minorBuffs = { ...createPlayer().minorBuffs };
  player.minorBuffOptions = [];
  player.minorBuffSelections = [];
  player.minorBuffBreakthroughMode = false;
  player.nextBuffDepth = SUPPLY_STATION_INTERVAL;
  player.nextSupplyDepth = SUPPLY_STATION_INTERVAL;
  player.supplyStation = null;
  player.pendingEvent = null;
  player.eventChallenge = null;
  player.traitSwapEvent = null;
  player.nextEventDepth = 4;
  player.eventMissCount = 0;
  player.bagBonusSlots = config.bagBonusSlots || 0;
  player.tempEffects = [];
  player.forcedNextResult = null;
  if (!choosingFromUndergroundCamp) player.goldBeast = null;
  player.returnBlessing = false;
  player.tempMaxHp = 0;
  if (player.chickenRoastHpBonus > 0) {
    player.tempMaxHp += 1;
    player.chickenRoastHpBonus -= 1;
  }
  player.chickenAmuletUsed = false;
  player.traitState = createTraitState();
  if (config.oneTimeChickenTrait) {
    player.chickenTraitTickets = Math.max(0, (player.chickenTraitTickets || 0) - 1);
  }
  if (config.nextRunOnly) {
    player.pendingNextRunTraits = (player.pendingNextRunTraits || []).filter((id) => id !== mode);
  }
  if (player.rescueBonusCount > 0) {
    for (let i = 0; i < player.rescueBonusCount; i += 1) {
      const buff = random && random() < 0.5 ? "gold" : "bomb";
      player.minorBuffs[buff] = (player.minorBuffs[buff] || 0) + 1;
    }
    player.rescueBonusCount = 0;
  }
  player.digPathOptions = refreshDigPathOptions(player, random || Math.random).digPathOptions;

  return {
    ok: true,
    player,
    message: choosingFromUndergroundCamp
      ? `已選擇 ${config.label}。可以從地底營地開始往上挖。`
      : player.caveType === "gem"
      ? `已選擇 ${config.label}。你腳下一空，掉進了寶石礦洞。這裡只會挖到寶石、鐘乳石和白金破爛。`
      : player.caveType === "raptor"
      ? `已選擇 ${config.label}。你推開猛禽洞窟的石門，礦道深處到處都是雞叫聲。越深的野雞越強。`
      : `已選擇 ${config.label}。可以開始深入挖礦。`
  };
}

function useRaptorCaveTicket(playerInput) {
  const player = getPlayer(playerInput);
  if (player.dead) {
    return { ok: false, player, message: "死亡狀態不能使用入場券。" };
  }
  if (player.zone !== "surface" || isInMine(player)) {
    return { ok: false, player, message: "猛禽洞窟入場券只能在地表、下礦前使用。" };
  }
  if ((player.activeRaptorCaveTicket || 0) > 0) {
    return { ok: false, player, message: "猛禽洞窟入場券已啟用。選擇詞條後就會進入猛禽洞窟。" };
  }
  if ((player.guaranteedRaptorCaveTicket || 0) <= 0) {
    return { ok: false, player, message: "你沒有猛禽洞窟入場券。" };
  }

  player.guaranteedRaptorCaveTicket -= 1;
  player.activeRaptorCaveTicket = 1;
  return {
    ok: true,
    player,
    message: "已使用猛禽洞窟入場券。下一次從地表選擇詞條後，會進入猛禽洞窟。"
  };
}

function canChooseMinorBuff(playerInput) {
  const player = getPlayer(playerInput);
  return Array.isArray(player.minorBuffOptions) && player.minorBuffOptions.length > 0;
}

function getSupplyStationRegion(playerInput) {
  const player = getPlayer(playerInput);
  if (player.zone === "skyDown") return "sky";
  if (player.zone === "upward") return player.depth < 0 ? "inverted" : "underground";
  if (player.caveType === "gem") return "gem";
  if (player.caveType === "raptor") return "underground";
  return "normal";
}

function getSupplyStationMeta(region, variant = "normal") {
  const base = {
    normal: { title: "🪵 普通補給站", potionMultiplier: 1, buffMultiplier: 1, sellMultiplier: 1 },
    gem: { title: "💎 寶石補給站", potionMultiplier: 1.15, buffMultiplier: 1.1, sellMultiplier: 1.05 },
    underground: { title: "🌋 地底黑市", potionMultiplier: 1.35, buffMultiplier: 1.2, sellMultiplier: 0.95 },
    inverted: { title: "🌀 顛倒補給點", potionMultiplier: 1.15, buffMultiplier: 1.35, sellMultiplier: 1.15 },
    sky: { title: "☁️ 天域商販", potionMultiplier: 1.25, buffMultiplier: 1.25, sellMultiplier: 1.3 }
  }[region] || { title: "🏪 補給站", potionMultiplier: 1, buffMultiplier: 1, sellMultiplier: 1 };
  if (variant === "blackMarket") return { ...base, title: `💀 黑市${base.title.replace(/^[^\s]+ /, "")}`, potionMultiplier: base.potionMultiplier * 1.7, buffMultiplier: base.buffMultiplier * 1.8, sellMultiplier: base.sellMultiplier * 1.2 };
  if (variant === "gambler") return { ...base, title: `🎲 賭徒${base.title.replace(/^[^\s]+ /, "")}`, potionMultiplier: base.potionMultiplier * 0.85, buffMultiplier: base.buffMultiplier * 0.9, sellMultiplier: base.sellMultiplier * 1.1 };
  if (variant === "mystery") return { ...base, title: `🌌 神秘${base.title.replace(/^[^\s]+ /, "")}`, potionMultiplier: base.potionMultiplier * 1.3, buffMultiplier: base.buffMultiplier * 1.55, sellMultiplier: base.sellMultiplier * 1.35 };
  return base;
}

function getSupplyBuffPool(region) {
  const pools = {
    normal: ["gold", "bomb", "bag", "ore", "sustain", "luck", "event"],
    gem: ["luck", "event", "bag", "sustain", "ore"],
    underground: ["ore", "gold", "event", "luck", "bomb", "reverse"],
    inverted: ["reverse", "bag", "event", "luck", "gold", "bomb"],
    sky: ["luck", "event", "sustain", "bag", "reverse", "gold"]
  };
  return pools[region] || pools.normal;
}

function canOpenSupplyStation(playerInput) {
  const player = getPlayer(playerInput);
  return !player.dead
    && !player.pendingEvent
    && Boolean(player.runMode)
    && !player.supplyStation
    && Math.abs(player.depth || 0) >= (player.nextSupplyDepth || SUPPLY_STATION_INTERVAL)
    && Math.abs(player.depth || 0) % SUPPLY_STATION_INTERVAL === 0;
}

function createSupplyStation(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const depth = Math.abs(player.depth || 0);
  const region = getSupplyStationRegion(player);
  const variantRoll = random();
  const variant = variantRoll < 0.05 ? "mystery" : variantRoll < 0.11 ? "gambler" : variantRoll < 0.18 ? "blackMarket" : "normal";
  const meta = getSupplyStationMeta(region, variant);
  const jitter = (min, max) => min + Math.floor(random() * (max - min + 1));
  const items = [];
  const potionPrice = Math.floor(jitter(120, 450) * meta.potionMultiplier * (1 + Math.min(1.2, depth / 180)));
  items.push({ id: "potion", type: "potion", label: "治療藥水", price: potionPrice, stock: jitter(1, variant === "blackMarket" ? 2 : 5) });

  const pool = getSupplyBuffPool(region).filter((id) => CONFIG.minorBuffs[id]);
  const candidates = [...pool];
  const buffCount = variant === "mystery" ? 3 : 2;
  for (let i = 0; i < buffCount && candidates.length > 0; i += 1) {
    const [buff] = candidates.splice(Math.floor(random() * candidates.length), 1);
    const config = CONFIG.minorBuffs[buff];
    const rarity = config.unique ? 1.45 : buff === "reverse" || buff === "luck" || buff === "event" ? 1.25 : 1;
    items.push({
      id: `buff_${buff}`,
      type: "buff",
      buff,
      label: config.label,
      price: Math.floor(jitter(520, 980) * meta.buffMultiplier * rarity * (1 + Math.min(1.35, depth / 220))),
      stock: jitter(1, variant === "gambler" ? 3 : 2)
    });
  }

  const sellOffers = Object.entries(player.minorBuffs || {})
    .filter(([buff, count]) => count > 0 && CONFIG.minorBuffs[buff])
    .map(([buff, count]) => ({
      buff,
      price: Math.floor((180 + count * 90 + depth * 2) * meta.sellMultiplier * (CONFIG.minorBuffs[buff].unique ? 1.35 : 1))
    }))
    .slice(0, 5);

  player.supplyStation = {
    id: `${Date.now()}-${Math.floor(random() * 100000)}`,
    depth,
    region,
    variant,
    items,
    sellOffers
  };
  return player;
}

function formatSupplyStation(playerInput) {
  const player = getPlayer(playerInput);
  const station = player.supplyStation;
  if (!station) return "目前沒有補給站。";
  const meta = getSupplyStationMeta(station.region, station.variant);
  const itemLines = station.items.map((item, index) => (
    item.type === "potion"
      ? `${index + 1}. 🧪 ${item.label}｜價格 ${item.price}｜庫存 ${item.stock}`
      : `${index + 1}. ✨ ${item.label}｜價格 ${item.price}｜庫存 ${item.stock}`
  ));
  const sellLines = station.sellOffers.length
    ? station.sellOffers.map((offer) => `💰 ${CONFIG.minorBuffs[offer.buff].label}｜收購價 ${offer.price}`)
    : ["無可收購小詞條"];
  return [
    `【${meta.title}】`,
    `深度：${station.depth}｜金幣：${player.gold}`,
    "",
    "販售：",
    ...itemLines,
    "",
    "收購：",
    ...sellLines
  ].join("\n");
}

function getSupplyStationView(playerInput) {
  const player = getPlayer(playerInput);
  const station = player.supplyStation;
  if (!station) return null;
  const meta = getSupplyStationMeta(station.region, station.variant);
  return {
    title: meta.title,
    depth: station.depth,
    region: station.region,
    variant: station.variant,
    items: station.items.map((item) => ({
      ...item,
      emoji: item.type === "potion" ? "🧪" : "✨",
      disabled: item.stock <= 0 || player.gold < item.price
    })),
    sellOffers: station.sellOffers
      .filter((offer) => CONFIG.minorBuffs[offer.buff])
      .map((offer) => ({
        ...offer,
        label: CONFIG.minorBuffs[offer.buff].label,
        disabled: (player.minorBuffs[offer.buff] || 0) <= 0
      }))
  };
}

function buySupplyStationItem(playerInput, itemId) {
  const player = getPlayer(playerInput);
  const station = player.supplyStation;
  if (!station) return { ok: false, player, message: "目前沒有補給站。" };
  const item = station.items.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, player, message: "補給站沒有這個商品。" };
  if (item.stock <= 0) return { ok: false, player, message: "這個商品賣完了。" };
  if (player.gold < item.price) return { ok: false, player, message: `金幣不足，需要 ${item.price} 金幣。` };
  if (item.type === "buff" && !isSelectableMiniTrait(player, item.buff) && !isMiniTraitBreakthroughMode(player)) {
    return { ok: false, player, message: `${item.label} 目前不能再購買。` };
  }
  player.gold -= item.price;
  item.stock -= 1;
  if (item.type === "potion") {
    player.healingPotion += 1;
  } else {
    player.minorBuffs[item.buff] = (player.minorBuffs[item.buff] || 0) + 1;
  }
  return {
    ok: true,
    player,
    message: `${item.type === "potion" ? "買下治療藥水" : `買下 ${item.label}`}，花費 ${item.price} 金幣。\n\n${formatSupplyStation(player)}`
  };
}

function sellSupplyStationBuff(playerInput, buff) {
  const player = getPlayer(playerInput);
  const station = player.supplyStation;
  if (!station) return { ok: false, player, message: "目前沒有補給站。" };
  const offer = station.sellOffers.find((entry) => entry.buff === buff);
  if (!offer) return { ok: false, player, message: "補給站不收這個小詞條。" };
  if ((player.minorBuffs[buff] || 0) <= 0) return { ok: false, player, message: "你沒有這個小詞條可以出售。" };
  player.minorBuffs[buff] -= 1;
  player.gold += offer.price;
  station.sellOffers = station.sellOffers.filter((entry) => entry.buff !== buff || (player.minorBuffs[buff] || 0) > 0);
  return {
    ok: true,
    player,
    message: `出售 ${CONFIG.minorBuffs[buff].label}，獲得 ${offer.price} 金幣。\n\n${formatSupplyStation(player)}`
  };
}

function leaveSupplyStation(playerInput) {
  const player = getPlayer(playerInput);
  if (!player.supplyStation) return { ok: false, player, message: "目前沒有補給站。" };
  player.nextSupplyDepth = Math.abs(player.depth || 0) + SUPPLY_STATION_INTERVAL;
  player.nextBuffDepth = player.nextSupplyDepth;
  player.supplyStation = null;
  return { ok: true, player, message: `離開補給站。下一個補給站預計在第 ${player.nextSupplyDepth} 層。` };
}

function getMinorBuffMaxStacks(buff) {
  const config = CONFIG.minorBuffs[buff];
  return config ? config.maxStacks || 5 : 0;
}

function getMinorBuffBreakthroughScale(buff) {
  const config = CONFIG.minorBuffs[buff];
  return config ? config.breakthroughScale || 0.3 : 0;
}

function getMinorBuffEffectiveStacks(playerInput, buff) {
  const player = getPlayer(playerInput);
  const count = Math.max(0, player.minorBuffs[buff] || 0);
  const maxStacks = getMinorBuffMaxStacks(buff);
  if (count <= maxStacks) return count;
  return maxStacks + (count - maxStacks) * getMinorBuffBreakthroughScale(buff);
}

function isSelectableMiniTrait(playerInput, trait) {
  const player = getPlayer(playerInput);
  const id = typeof trait === "string" ? trait : trait && trait.id;
  const config = CONFIG.minorBuffs[id];
  if (!config) return false;
  if (player.minorBuffSelections.includes(id)) return false;
  if (config.unique && (player.minorBuffs[id] || 0) > 0) return false;
  return (player.minorBuffs[id] || 0) < getMinorBuffMaxStacks(id);
}

function getSelectableMiniTraitIds(playerInput) {
  const player = getPlayer(playerInput);
  return Object.keys(CONFIG.minorBuffs).filter((id) => isSelectableMiniTrait(player, id));
}

function getBreakthroughMiniTraitIds(playerInput) {
  const player = getPlayer(playerInput);
  return Object.keys(CONFIG.minorBuffs).filter((id) => {
    const config = CONFIG.minorBuffs[id];
    if (!config || config.unique || player.minorBuffSelections.includes(id)) return false;
    return (player.minorBuffs[id] || 0) >= getMinorBuffMaxStacks(id);
  });
}

function isMiniTraitBreakthroughMode(playerInput) {
  const player = getPlayer(playerInput);
  return getSelectableMiniTraitIds(player).length === 0 && getBreakthroughMiniTraitIds(player).length > 0;
}

function pickMinorBuffOptions(pool, random = Math.random, breakthrough = false) {
  const options = [];
  const candidates = [...pool];
  while (options.length < 3 && candidates.length > 0) {
    let pickedIndex = 0;
    if (breakthrough) {
      const totalWeight = candidates.reduce((sum, id) => sum + (CONFIG.minorBuffs[id].breakthroughWeight || 0.35), 0);
      let roll = random() * totalWeight;
      pickedIndex = candidates.findIndex((id) => {
        roll -= CONFIG.minorBuffs[id].breakthroughWeight || 0.35;
        return roll <= 0;
      });
      if (pickedIndex < 0) pickedIndex = candidates.length - 1;
    } else {
      pickedIndex = Math.floor(random() * candidates.length);
    }
    const [picked] = candidates.splice(pickedIndex, 1);
    if (picked && !options.includes(picked)) options.push(picked);
  }
  return options;
}

function refreshMinorBuffOptions(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const selectablePool = getSelectableMiniTraitIds(player);
  const breakthrough = selectablePool.length === 0;
  const pool = breakthrough ? getBreakthroughMiniTraitIds(player) : selectablePool;
  const options = pickMinorBuffOptions(pool, random, breakthrough);
  player.minorBuffOptions = options;
  player.minorBuffSelections = [];
  player.minorBuffBreakthroughMode = breakthrough && options.length > 0;
  return player;
}

function getMinorBuffOptions(playerInput) {
  const player = getPlayer(playerInput);
  let ids = player.minorBuffOptions.filter((id) => CONFIG.minorBuffs[id]);
  let breakthrough = player.minorBuffBreakthroughMode;
  if (ids.length === 0 && canChooseMinorBuff(player)) {
    const selectable = getSelectableMiniTraitIds(player);
    breakthrough = selectable.length === 0;
    ids = (breakthrough ? getBreakthroughMiniTraitIds(player) : selectable).slice(0, 3);
  }
  return ids
    .map((id) => ({
      id,
      ...CONFIG.minorBuffs[id],
      breakthrough: breakthrough && (player.minorBuffs[id] || 0) >= getMinorBuffMaxStacks(id),
      currentStacks: player.minorBuffs[id] || 0,
      effectiveStacks: getMinorBuffEffectiveStacks(player, id)
    }))
    .filter((buff) => buff.label);
}

function chooseMinorBuff(playerInput, buff) {
  const player = getPlayer(playerInput);
  const config = CONFIG.minorBuffs[buff];

  if (!config) {
    return {
      ok: false,
      player,
      message: "沒有這個小磁條。"
    };
  }

  if (!canChooseMinorBuff(player)) {
    return {
      ok: false,
      player,
      message: `還不能選小磁條。每 5 層可選一次，下一次在第 ${player.nextBuffDepth} 層。`
    };
  }

  if (player.minorBuffOptions.length === 0) {
    const previewOptions = getMinorBuffOptions(player).map((option) => option.id);
    if (previewOptions.length > 0) {
      player.minorBuffOptions = previewOptions;
      player.minorBuffBreakthroughMode = isMiniTraitBreakthroughMode(player);
    } else {
      Object.assign(player, refreshMinorBuffOptions(player));
    }
  }

  if (!player.minorBuffOptions.includes(buff)) {
    return {
      ok: false,
      player,
      message: "這個小詞條這次沒有出現。"
    };
  }

  if (player.minorBuffSelections.includes(buff)) {
    return {
      ok: false,
      player,
      message: "這個小詞條已經選過了，請選另一個。"
    };
  }

  const maxStacks = getMinorBuffMaxStacks(buff);
  const isBreakthrough = player.minorBuffBreakthroughMode && (player.minorBuffs[buff] || 0) >= maxStacks;
  if ((player.minorBuffs[buff] || 0) >= maxStacks && !isBreakthrough) {
    return {
      ok: false,
      player,
      message: `${config.label} 已達上限。`
    };
  }

  player.minorBuffs[buff] = (player.minorBuffs[buff] || 0) + 1;
  player.minorBuffSelections.push(buff);
  const requiredSelections = 1;
  const done = player.minorBuffSelections.length >= requiredSelections;
  if (done) {
    player.nextBuffDepth = Math.abs(player.depth) + 5;
    player.minorBuffOptions = [];
    player.minorBuffSelections = [];
    player.minorBuffBreakthroughMode = false;
  }

  return {
    ok: true,
    player,
    message: done
      ? `已選擇 ${isBreakthrough ? "✨ " : ""}${config.label}${isBreakthrough ? "（突破）" : ""}。本次小詞條完成，下一次在第 ${player.nextBuffDepth} 層。`
      : `已選擇 ${isBreakthrough ? "✨ " : ""}${config.label}${isBreakthrough ? "（突破）" : ""}。`
  };
}

function getCollectibles() {
  return CONFIG.collectibles;
}

function getAwardCollectibles() {
  return CONFIG.collectibles.filter((item) => !item.shopOnly && !item.rustOnly);
}

function getRustCollectibles() {
  return CONFIG.collectibles.filter((item) => !item.shopOnly);
}

function getCollectible(id) {
  return CONFIG.collectibles.find((item) => item.id === id) || null;
}

function getShopItems() {
  return CONFIG.shop.items
    .map((shopItem) => ({
      ...shopItem,
      collectible: getCollectible(shopItem.id)
    }))
    .filter((shopItem) => shopItem.collectible);
}

function getCommunityProgress(playersInput = {}) {
  const players = Object.entries(playersInput || {})
    .filter(([userId]) => userId !== "__global")
    .map(([, playerInput]) => getPlayer(playerInput));
  const bestDepth = players.reduce((best, player) => Math.max(best, player.stats.bestDepth || 0), 0);
  const deaths = players.reduce((sum, player) => sum + (player.stats.deaths || 0), 0);
  return {
    bestDepth,
    deaths,
    healingPotionUnlocked: bestDepth >= CONFIG.shop.consumables.healingPotion.unlockBestDepth,
    undyingTotemUnlocked: deaths >= CONFIG.shop.consumables.undyingTotem.unlockDeaths
  };
}

function getShopConsumables(progressInput = {}) {
  const progress = {
    healingPotionUnlocked: false,
    undyingTotemUnlocked: false,
    ...progressInput
  };
  return [
    progress.healingPotionUnlocked
      ? { id: "healingPotion", ...CONFIG.shop.consumables.healingPotion }
      : null,
    progress.undyingTotemUnlocked
      ? { id: "undyingTotem", ...CONFIG.shop.consumables.undyingTotem }
      : null,
    { id: "magicCandy", ...CONFIG.shop.consumables.magicCandy },
    { id: "normalFeed", ...CONFIG.shop.consumables.normalFeed },
    { id: "gourmetFeed", ...CONFIG.shop.consumables.gourmetFeed },
    { id: "chickenMedicine", ...CONFIG.shop.consumables.chickenMedicine },
    { id: "autoCleaner", ...CONFIG.shop.consumables.autoCleaner }
  ].filter(Boolean);
}

function getPotionPurchaseDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function getTaiwanPurchaseDay(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(now));
}

function normalizePotionDailyLimit(player, now = Date.now()) {
  const today = getPotionPurchaseDay(now);
  if (player.potionPurchaseDay !== today) {
    player.potionPurchaseDay = today;
    player.potionPurchasesToday = 0;
  }
  return player;
}

function normalizeMagicCandyDailyLimit(player, now = Date.now()) {
  const today = getPotionPurchaseDay(now);
  if (player.magicCandyPurchaseDay !== today) {
    player.magicCandyPurchaseDay = today;
    player.magicCandyPurchasesToday = 0;
  }
  return player;
}

function normalizeTotemDailyLimit(player, now = Date.now()) {
  const today = getTaiwanPurchaseDay(now);
  if (player.lastTotemResetDate !== today) {
    player.lastTotemResetDate = today;
    player.dailyTotemPurchaseCount = 0;
  }
  return player;
}

function getMagicCandyPrice(playerInput) {
  const player = getPlayer(playerInput);
  return Math.max(1, Math.ceil(getTotalAsset(player) * CONFIG.shop.consumables.magicCandy.assetRate));
}

function addPendingNextRunTrait(player, traitId) {
  if (!CONFIG.runModes[traitId]) return false;
  player.pendingNextRunTraits = [...new Set([...(player.pendingNextRunTraits || []), traitId])].slice(0, 10);
  return true;
}

function awardChickenResearchNote(player, random = Math.random) {
  const notes = Object.entries(CHICKEN_RESEARCH_NOTES || {});
  if (notes.length === 0) return null;
  const [id, note] = notes[Math.floor(random() * notes.length)] || notes[0];
  player.chickenResearchNotes = player.chickenResearchNotes && typeof player.chickenResearchNotes === "object"
    ? player.chickenResearchNotes
    : {};
  player.chickenResearchNotes[id] = (player.chickenResearchNotes[id] || 0) + 1;
  if (player.ownedChicken) {
    player.ownedChicken.evolutionPoints = player.ownedChicken.evolutionPoints || {};
    const pointKey = id === "clumsy" ? "clumsy" : id;
    player.ownedChicken.evolutionPoints[pointKey] = (player.ownedChicken.evolutionPoints[pointKey] || 0) + 1;
  }
  return note;
}

function resolveTreasureChest(player, choice, random = Math.random, now = Date.now()) {
  const roll = random();
  const chestType = roll < 0.58 ? "🪵 普通寶箱" : roll < 0.86 ? "✨ 稀有寶箱" : "💀 詛咒寶箱";
  if (choice === "safe") {
    if (random() < 0.25) {
      addTempEffect(player, { id: "chest_scout", remaining: 3, bombWeightMultiplier: 0.95 });
      return { player, message: `${chestType} 安全檢查完成，接下來 3 層稍微安全。` };
    }
    const gold = 25 + getDepthBonus(player.depth) * 5;
    player.gold += gold;
    return { player, message: `${chestType} 你只拿走外層金幣：+${gold}。` };
  }

  const trapChance = choice === "extreme" ? 0.38 : chestType.includes("詛咒") ? 0.32 : 0.18;
  if (random() < trapChance) {
    const trapRoll = random();
    if (trapRoll < 0.34) return { player, message: `${chestType} 炸彈陷阱！${addBombDamage(player, now).message}` };
    if (trapRoll < 0.67) {
      if (getBagFreeSlots(player) >= 3) player.junk += 1;
      return { player, message: `${chestType} 裡面塞滿破爛，包包突然沉了下去。` };
    }
    addTempEffect(player, { id: "chest_curse", remaining: 4, bombWeightMultiplier: 1.25 });
    return { player, message: `${chestType} 詛咒冒出黑煙，接下來 4 層炸彈 +25%。` };
  }

  const outcomeRoll = random();
  if (outcomeRoll < 0.1) {
    const gold = choice === "extreme" ? 220 + player.depth * 4 : 90 + player.depth * 2;
    player.gold += gold;
    return { player, message: `${chestType} 大量金幣！+${gold}` };
  }
  if (outcomeRoll < 0.2) {
    const gems = ["redGem", "blueGem", "greenGem"];
    const key = gems[Math.floor(random() * gems.length)];
    const gained = addItemReward(player, key, choice === "extreme" ? 3 : 1);
    return { player, message: `${chestType} 寶石閃光，獲得 ${gained} 顆寶石。` };
  }
  if (outcomeRoll < 0.3) {
    const selectable = getSelectableMiniTraitIds(player);
    const breakthrough = selectable.length === 0;
    const pool = breakthrough ? getBreakthroughMiniTraitIds(player) : selectable;
    if (pool.length === 0) return { player, message: `${chestType} 磁條碎片失去光芒，什麼也沒發生。` };
    const [buff] = pickMinorBuffOptions(pool, random, breakthrough);
    player.minorBuffs[buff] = (player.minorBuffs[buff] || 0) + 1;
    return { player, message: `${chestType} 裝上一個小詞條：${CONFIG.minorBuffs[buff].label}。` };
  }
  if (outcomeRoll < 0.4) {
    player.minerHelmetCount += 1;
    return { player, message: `${chestType} 獲得 ⛑️ 礦工帽，可抵擋一次鐘乳石。` };
  }
  if (outcomeRoll < 0.5) {
    const traits = ["abyssMiner", "gemMania", "blastManiac", "luckySurvey", "limitBackpack"];
    const trait = traits[Math.floor(random() * traits.length)];
    addPendingNextRunTrait(player, trait);
    return { player, message: `${chestType} 找到下一場限定詞條：${CONFIG.runModes[trait].label}。` };
  }
  if (outcomeRoll < 0.6) {
    addTempEffect(player, { id: "chest_crit", remaining: 5, critChanceBonus: 0.08 });
    return { player, message: `${chestType} 爆擊強化，接下來 5 層更容易爆擊。` };
  }
  if (outcomeRoll < 0.7) {
    player.bagBonusSlots += choice === "extreme" ? 4 : 2;
    return { player, message: `${chestType} 找到折疊袋，本輪包包增加。` };
  }
  if (outcomeRoll < 0.8) {
    player.pendingEvent = "ancient_blessing";
    return { player, message: `${chestType} 暗格打開，露出隱藏事件的入口。` };
  }
  if (outcomeRoll < 0.9) {
    const reward = addOreReward(player, 3 + getDepthBonus(player.depth), player.depth >= 30 ? "platinumOre" : "goldOre");
    return { player, message: `${chestType} 礦物袋：${reward.gained} 塊${getOreName(reward.target)}。` };
  }
  if (outcomeRoll < 0.96) {
    player.magicCandy += 1;
    return { player, message: `${chestType} 甜味補給：神奇糖果 +1。` };
  }
  if (outcomeRoll < 0.985) {
    const note = awardChickenResearchNote(player, random);
    return { player, message: `${chestType} 發現 📜 ${note.title}：${note.hint}` };
  }
  player.healingPotion += 1;
  return { player, message: `${chestType} 稀有補給：治療藥水 +1。` };
}

function getCollectionTotal(playerInput) {
  const player = getPlayer(playerInput);
  return Object.values(player.collection).reduce((sum, count) => sum + count, 0);
}

function getCollectionUniqueCount(playerInput) {
  const player = getPlayer(playerInput);
  return CONFIG.collectibles.filter((item) => (player.collection[item.id] || 0) > 0).length;
}

function getBagUsedSlots(playerInput) {
  const player = getPlayer(playerInput);
  return player.rusty
    + getItemUsedSlots("ore", player.ore)
    + getItemUsedSlots("goldOre", player.goldOre)
    + getItemUsedSlots("platinumOre", player.platinumOre)
    + player.goldBlock
    + getItemUsedSlots("oreIngot", player.oreIngot)
    + getItemUsedSlots("goldOreIngot", player.goldOreIngot)
    + getItemUsedSlots("platinumOreIngot", player.platinumOreIngot)
    + player.bombItem
    + getItemUsedSlots("redGem", player.redGem)
    + getItemUsedSlots("blueGem", player.blueGem)
    + getItemUsedSlots("greenGem", player.greenGem)
    + getItemUsedSlots("invertedOre", player.invertedOre)
    + getItemUsedSlots("invertedGem", player.invertedGem)
    + player.orichalcum
    + player.junk * 3
    + player.platinumJunk * 5;
}

function getItemUsedSlots(itemId, amount) {
  if (STACKABLE_ITEM_KEYS.has(itemId)) {
    return Math.ceil(Math.max(0, amount || 0) / ITEM_STACK_SIZE);
  }
  return Math.max(0, amount || 0);
}

function getBagUsedSlotsWithout(playerInput, itemId) {
  const player = getPlayer(playerInput);
  if (!Object.prototype.hasOwnProperty.call(player, itemId)) return getBagUsedSlots(player);
  return getBagUsedSlots(player) - getItemUsedSlots(itemId, player[itemId]);
}

function getBagCapacity(playerInput) {
  const player = getPlayer(playerInput);
  return BAG_CAPACITY
    + Math.max(0, player.bagBonusSlots || 0)
    + Math.floor(getMinorBuffEffectiveStacks(player, "bag") * CONFIG.minorBuffs.bag.bagBonusSlots)
    + (player.expansionHeart ? 2 : 0);
}

function settleSellableResources(playerInput, globalStateInput = null, now = Date.now()) {
  const player = getPlayer(playerInput);
  const sold = {
    ore: player.ore,
    goldOre: player.goldOre,
    platinumOre: player.platinumOre,
    goldBlock: player.goldBlock,
    oreIngot: player.oreIngot,
    goldOreIngot: player.goldOreIngot,
    platinumOreIngot: player.platinumOreIngot,
    bombItem: player.bombItem,
    redGem: player.redGem,
    blueGem: player.blueGem,
    greenGem: player.greenGem
  };
  const globalState = globalStateInput ? normalizeGlobalState(globalStateInput, now) : null;
  const market = (id) => globalState ? getMarketMultiplier(globalState, id, now) : 1;
  const goldOreBlessing = getMarketBlessingMultiplier(player, "goldOre", now);
  const gemBlessing = getMarketBlessingMultiplier(player, "gem", now);
  const oreGold = Math.floor(sold.ore * CONFIG.ore.goldPerOre * market("ore"))
    + Math.floor(sold.goldOre * CONFIG.ore.goldPerGoldOre * market("goldOre") * goldOreBlessing)
    + Math.floor(sold.platinumOre * CONFIG.ore.goldPerPlatinumOre * market("platinumOre"));
  const ingotGold = Math.floor(sold.oreIngot * CONFIG.ore.goldPerOreIngot * market("oreIngot"))
    + Math.floor(sold.goldOreIngot * CONFIG.ore.goldPerGoldOreIngot * market("goldOreIngot") * goldOreBlessing)
    + Math.floor(sold.platinumOreIngot * CONFIG.ore.goldPerPlatinumOreIngot * market("platinumOreIngot"));
  const gemGold = Math.floor((sold.redGem * CONFIG.ore.redGemGold
    + sold.blueGem * CONFIG.ore.blueGemGold
    + sold.greenGem * CONFIG.ore.greenGemGold) * gemBlessing);
  const specialGold = sold.goldBlock * CONFIG.ore.goldPerGoldBlock
    + sold.bombItem * CONFIG.ore.goldPerBombItem;
  const total = oreGold + ingotGold + gemGold + specialGold;

  player.ore = 0;
  player.goldOre = 0;
  player.platinumOre = 0;
  player.goldBlock = 0;
  player.oreIngot = 0;
  player.goldOreIngot = 0;
  player.platinumOreIngot = 0;
  player.bombItem = 0;
  player.redGem = 0;
  player.blueGem = 0;
  player.greenGem = 0;
  player.gold += total;

  const nextGlobalState = globalState
    ? recordMarketSale(globalState, {
      ore: sold.ore,
      goldOre: sold.goldOre,
      platinumOre: sold.platinumOre,
      oreIngot: sold.oreIngot,
      goldOreIngot: sold.goldOreIngot,
      platinumOreIngot: sold.platinumOreIngot
    }, now)
    : globalStateInput;

  return {
    player,
    globalState: nextGlobalState,
    sold,
    oreGold: oreGold + ingotGold,
    gemGold,
    specialGold,
    total,
    message: total > 0
      ? `\n\n【跨區域結算】\n普通礦洞資源已自動出售。\n獲得：${total} 金幣`
      : ""
  };
}

function getBagFreeSlots(playerInput) {
  return Math.max(0, getBagCapacity(playerInput) - getBagUsedSlots(playerInput));
}

function getItemFreeAmount(playerInput, itemId) {
  const player = getPlayer(playerInput);
  if (!STACKABLE_ITEM_KEYS.has(itemId)) return getBagFreeSlots(player);
  const otherUsedSlots = getBagUsedSlotsWithout(player, itemId);
  const maxSlotsForItem = Math.max(0, getBagCapacity(player) - otherUsedSlots);
  return Math.max(0, maxSlotsForItem * ITEM_STACK_SIZE - (player[itemId] || 0));
}

function awardFromPool(player, pool, random = Math.random) {
  const weights = Object.fromEntries(pool.map((item) => [item.id, item.weight]));
  const id = rollWeighted(weights, random);
  const collectible = getCollectible(id);
  player.collection[id] = (player.collection[id] || 0) + 1;
  return collectible;
}

function awardCollectible(player, random = Math.random) {
  return awardFromPool(player, getAwardCollectibles(), random);
}

function awardRustCollectible(player, random = Math.random) {
  return awardFromPool(player, getRustCollectibles(), random);
}

function setDepthRecord(player) {
  const progress = Math.max(player.depth || 0, player.runDepthProgress || 0);
  if (progress <= player.stats.bestDepth) return "";
  player.stats.bestDepth = progress;
  player.bestRecordTimestamps = [
    ...(player.bestRecordTimestamps || []),
    Date.now()
  ].slice(-10);
  return `突破個人探索紀錄：累積第 ${progress} 層！`;
}

function addRunDepthProgress(player, amount) {
  player.runDepthProgress = Math.max(0, (player.runDepthProgress || 0) + Math.max(0, Math.floor(amount || 0)));
  return setDepthRecord(player);
}

function getWildChickenRegion(player) {
  if (player.caveType === "raptor") return Math.abs(player.depth || 0) >= 55 ? "underground" : "shallow";
  if (player.zone === "skyCamp" || player.zone === "skyDown") return "sky";
  if (player.zone === "upward" && (player.depth || 0) < 0) return "inverted";
  if (player.zone === "upward" || player.zone === "undergroundCamp" || (player.depth || 0) >= 60) return "underground";
  return "shallow";
}

const WILD_CHICKEN_POOLS = {
  shallow: [
    { name: "普通野雞", icon: "🐔", trait: "normal", power: 14 },
    { name: "小黃雞", icon: "🐤", trait: "gem", power: 13 }
  ],
  underground: [
    { name: "污染雞", icon: "🐓", trait: "berserk", power: 20 },
    { name: "深層黑羽雞", icon: "🐓", trait: "thief", power: 23 }
  ],
  inverted: [
    { name: "反轉雞", icon: "🐔", trait: "reverse", power: 24 },
    { name: "異常雞", icon: "🐓", trait: "berserk", power: 26 }
  ],
  sky: [
    { name: "發光雞", icon: "✨", trait: "glow", power: 26 },
    { name: "星羽雞", icon: "🌟", trait: "glow", power: 29 }
  ]
};

const RARE_WILD_CHICKENS = [
  { name: "虹羽雞", icon: "🌌", trait: "glow", region: "sky", power: 36 },
  { name: "深淵炎雞", icon: "🔥", trait: "berserk", region: "underground", power: 38 },
  { name: "雷鳴雞", icon: "⚡", trait: "thunder", region: "inverted", power: 37 }
];

const RAPTOR_PHOENIX = { name: "鳳凰", icon: "🪽🔥", trait: "phoenix", region: "sky", power: 64 };

function pickRaptorWildChickenTemplate(player, random = Math.random) {
  const depth = Math.abs(player.depth || 0);
  const phoenixChance = depth >= 50 ? Math.min(0.28, 0.12 + (depth - 50) * 0.004) : 0;
  if (phoenixChance > 0 && random() < phoenixChance) {
    return { template: RAPTOR_PHOENIX, rare: true };
  }
  const rareChance = Math.min(0.16, 0.04 + depth * 0.0015);
  if (random() < rareChance) {
    return {
      template: RARE_WILD_CHICKENS[Math.floor(random() * RARE_WILD_CHICKENS.length)] || RARE_WILD_CHICKENS[0],
      rare: true
    };
  }
  const regionalPool = Object.entries(WILD_CHICKEN_POOLS).flatMap(([region, list]) => (
    list.map((chicken) => ({ ...chicken, region }))
  ));
  const index = Math.floor(random() * regionalPool.length);
  return {
    template: regionalPool[index] || regionalPool[0] || WILD_CHICKEN_POOLS.shallow[0],
    rare: false
  };
}

function createWildChickenEncounter(player, random = Math.random) {
  if (player.wildChickenEncounter && player.wildChickenEncounter.name) return player.wildChickenEncounter;
  const region = getWildChickenRegion(player);
  const picked = player.caveType === "raptor"
    ? pickRaptorWildChickenTemplate(player, random)
    : (() => {
      const rare = random() < 0.03;
      const pool = WILD_CHICKEN_POOLS[region] || WILD_CHICKEN_POOLS.shallow;
      return {
        rare,
        template: rare
          ? RARE_WILD_CHICKENS[Math.floor(random() * RARE_WILD_CHICKENS.length)] || RARE_WILD_CHICKENS[0]
          : pool[Math.floor(random() * pool.length)]
      };
    })();
  const template = picked.template;
  const rare = Boolean(picked.rare);
  const depthPower = Math.min(player.caveType === "raptor" ? 24 : 12, Math.floor(Math.abs(player.depth || 0) / (player.caveType === "raptor" ? 8 : 12)));
  const encounter = {
    id: `${Date.now()}-${Math.floor(random() * 100000)}`,
    name: template.name,
    icon: template.icon,
    region: template.region || region,
    trait: template.trait,
    rare,
    power: template.power + depthPower + (player.caveType === "raptor" ? 4 : 0)
  };
  player.wildChickenEncounter = encounter;
  return encounter;
}

function addWildChickenInfluence(player, encounter, amount = 1) {
  if (!encounter) return;
  player.wildChickenInfluence = player.wildChickenInfluence || {};
  player.wildChickenInfluence[encounter.region] = (player.wildChickenInfluence[encounter.region] || 0) + amount;
  player.wildChickenInfluence[encounter.trait] = (player.wildChickenInfluence[encounter.trait] || 0) + amount;
  if (player.ownedChicken) {
    player.ownedChicken.evolutionPoints = player.ownedChicken.evolutionPoints || {};
    const pointKey = encounter.trait === "berserk" || encounter.trait === "thunder"
      ? "thunder"
      : encounter.region === "underground"
        ? "mine"
        : encounter.region === "inverted"
          ? "shadow"
          : encounter.trait === "glow"
            ? "crystal"
            : "gale";
    player.ownedChicken.evolutionPoints[pointKey] = (player.ownedChicken.evolutionPoints[pointKey] || 0) + amount;
  }
}

function clampChance(value, min = 0.05, max = 0.9) {
  return Math.max(min, Math.min(max, value));
}

function getWildChickenCaptureLevel(player, encounter) {
  const depthLevel = 1 + Math.floor(Math.abs(player.depth || 1) / 25);
  const powerLevel = Math.floor((encounter.power || 16) / 4);
  return Math.max(encounter.rare ? 8 : 4, powerLevel, depthLevel);
}

function getWildChickenCaptureChance(player, encounter, options = {}) {
  const oldChicken = player.ownedChicken ? normalizeOwnedChicken(player.ownedChicken) : null;
  const wildLevel = getWildChickenCaptureLevel(player, encounter);
  const ownLevel = oldChicken ? Math.max(1, Math.floor(oldChicken.level || 1)) : wildLevel;
  const raceWeakened = Boolean(options.raceWeakened || encounter.raceWeakened);
  if (options.useQuickBall) {
    return {
      chance: encounter.rare ? 0.32 : 0.44,
      wildLevel,
      ownLevel,
      levelGap: wildLevel - ownLevel,
      usesQuickBall: true
    };
  }
  const base = encounter.rare ? 0.28 : 0.36;
  const raceBonus = raceWeakened ? 0.24 : 0;
  const levelGap = wildLevel - ownLevel;
  const levelAdjustment = levelGap > 0
    ? -Math.min(0.36, levelGap * 0.055)
    : Math.min(0.14, Math.abs(levelGap) * 0.02);
  return {
    chance: clampChance(base + raceBonus + levelAdjustment, encounter.rare ? 0.08 : 0.1, encounter.rare ? 0.62 : 0.76),
    wildLevel,
    ownLevel,
    levelGap,
    usesQuickBall: false
  };
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function awardWildChickenDrop(player, encounter, random = Math.random) {
  const lines = [];
  const depthBonus = getDepthBonus(Math.abs(player.depth || 0));
  const gold = encounter.rare ? 240 + depthBonus * 12 : 60 + depthBonus * 7;
  player.gold += gold;
  lines.push(`金幣 +${gold}`);
  if (encounter.trait === "gem" || encounter.trait === "glow") {
    const gemKey = encounter.region === "sky" ? "blueGem" : encounter.region === "underground" ? "redGem" : "greenGem";
    const amount = encounter.rare ? 2 : 1;
    const added = addItemReward(player, gemKey, amount);
    lines.push(`${getOreName(gemKey)} +${added}`);
  } else if (encounter.region === "inverted") {
    const added = addItemReward(player, "invertedOre", encounter.rare ? 3 : 1);
    lines.push(`顛倒礦石 +${added}`);
  } else {
    const reward = addOreReward(player, encounter.rare ? 3 : 1, encounter.region === "underground" ? "goldOre" : "ore");
    lines.push(`${getOreName(reward.target)} +${reward.gained}`);
  }
  if (random() < (encounter.rare ? 0.35 : 0.12)) {
    player.magicCandy = (player.magicCandy || 0) + 1;
    lines.push("神奇糖果 +1");
  }
  if (random() < (encounter.rare ? 0.28 : 0.08)) {
    player.chickenEggs = (player.chickenEggs || 0) + 1;
    lines.push("🥚 雞蛋 +1");
  }
  if (encounter.rare && random() < 0.2) {
    player.rareEvolutionMaterial = (player.rareEvolutionMaterial || 0) + 1;
    lines.push("稀有進化素材 +1");
  }
  if (random() < 0.14) {
    player.chickenResearchNotes = player.chickenResearchNotes || {};
    const noteId = encounter.region === "underground" ? "mineCrystal" : "blaze";
    player.chickenResearchNotes[noteId] = (player.chickenResearchNotes[noteId] || 0) + 1;
    lines.push("養雞小紙條 +1");
  }
  return lines;
}

function attemptCaptureWildChicken(player, encounter, random = Math.random, eventId = "wild_mine_chicken") {
  const oldChicken = player.ownedChicken ? normalizeOwnedChicken(player.ownedChicken) : null;
  const usesQuickBall = (player.quickChickenBall || 0) > 0;
  const captureInfo = getWildChickenCaptureChance(player, encounter, { useQuickBall: usesQuickBall });
  if (oldChicken && !encounter.captureConfirm) {
    encounter.captureConfirm = true;
    player.wildChickenEncounter = encounter;
    player.pendingEvent = eventId;
    return {
      ok: true,
      player,
      title: "野生賽雞",
      message: [
        `⚠️ 你準備烤掉「${oldChicken.name}」，空出位置捕捉 ${encounter.icon} ${encounter.name}。`,
        "這個動作會失去目前的雞，而且捕捉仍有機率失敗。",
        `捕捉率：${formatPercent(captureInfo.chance)}｜野生 Lv.${captureInfo.wildLevel} / 你的雞 Lv.${captureInfo.ownLevel}`,
        usesQuickBall ? "會消耗 1 顆先機球，無視等級差判定。" : (encounter.raceWeakened ? "短跑後牠已經喘了，捕捉率提高。" : "先短跑挑戰成功後再抓，捕捉率會更高。"),
        "",
        "再按一次「確認烤雞捕捉」才會確認。"
      ].join("\n")
    };
  }

  if (oldChicken) {
    player.chickenRoastHpBonus = (player.chickenRoastHpBonus || 0) + 1;
    player.ownedChicken = null;
  }

  if (usesQuickBall) player.quickChickenBall = Math.max(0, (player.quickChickenBall || 0) - 1);
  const success = random() < captureInfo.chance;
  if (!success) {
    addWildChickenInfluence(player, encounter, 1);
    player.wildChickenEncounter = null;
    return {
      ok: true,
      player,
      title: "野生賽雞",
      message: [
        oldChicken ? `🍗 你烤掉了「${oldChicken.name}」，下一場下礦最大生命 +1。` : "",
        usesQuickBall ? "🥎 先機球晃了幾下，最後裂開了。" : "",
        `${encounter.icon} ${encounter.name} 受驚逃走，捕捉失敗。`,
        `捕捉率：${formatPercent(captureInfo.chance)}`
      ].filter(Boolean).join("\n")
    };
  }

  const caught = makeWildMineChicken(Math.abs(player.depth || 1), random);
  const caughtLevel = captureInfo.wildLevel;
  caught.name = encounter.name || caught.name;
  caught.icon = encounter.icon || caught.icon;
  caught.level = caughtLevel;
  caught.exp = 0;
  caught.origin = "mine";
  caught.entryEffect = encounter.rare
    ? "🌌 牠是在礦坑裡捕捉到的稀有野生賽雞。"
    : "⛏️ 牠是在礦洞裡被你抓到的特殊雞。";
  caught.titles = [...new Set([...(caught.titles || []), encounter.rare ? "稀有野生雞" : "礦坑邂逅"])];
  player.ownedChicken = normalizeOwnedChicken(caught);
  addWildChickenInfluence(player, encounter, encounter.rare ? 3 : 2);
  player.wildChickenEncounter = null;
  return {
    ok: true,
    player,
    title: "野生賽雞",
    announcement: encounter.rare ? `🌌 <@PLAYER> 捕捉到了稀有野生賽雞「${encounter.name}」！` : "",
    message: [
      oldChicken ? `🍗 你烤掉了「${oldChicken.name}」，下一場下礦最大生命 +1。` : "",
      usesQuickBall ? "🥎 先機球咔一聲扣住了牠！" : "",
      `🎉 捕捉成功！${encounter.icon} ${encounter.name} 成為你的新雞。`,
      `捕捉率：${formatPercent(captureInfo.chance)}｜Lv.${caughtLevel}`,
      "礦坑雞可能擁有特殊進化方向。"
    ].filter(Boolean).join("\n")
  };
}

function makeWildChickenRaceOpponent(encounter) {
  const power = Math.max(10, Math.floor((encounter.power || 16) * 1.18 + 4));
  const level = Math.max(1, Math.floor(power / 4));
  const traitBias = {
    berserk: { speed: 2, sprint: 4, stability: -2, stamina: 0 },
    thief: { speed: 3, sprint: 1, stability: 0, stamina: 1 },
    reverse: { speed: 1, sprint: 2, stability: 1, stamina: 1 },
    glow: { speed: 1, sprint: 1, stability: 2, stamina: 2 },
    thunder: { speed: 2, sprint: 3, stability: -1, stamina: 1 },
    phoenix: { speed: 4, sprint: 5, stability: 3, stamina: 5 },
    speed: { speed: 3, sprint: 2, stability: 0, stamina: 0 },
    gem: { speed: 0, sprint: 1, stability: 2, stamina: 1 }
  }[encounter.trait] || { speed: 1, sprint: 1, stability: 1, stamina: 1 };
  const base = Math.max(4, Math.floor(power / 5));
  return normalizeOwnedChicken({
    name: encounter.name,
    icon: encounter.icon || "🐓",
    level,
    exp: 0,
    personality: encounter.trait === "berserk" ? "madDog" : encounter.trait === "thief" ? "sneaky" : encounter.trait === "phoenix" ? "chosen" : "chosen",
    speed: Math.max(1, base + traitBias.speed),
    sprint: Math.max(1, base + traitBias.sprint),
    stability: Math.max(1, base + traitBias.stability),
    stamina: Math.max(1, base + traitBias.stamina),
    activeSkill: encounter.trait === "berserk" || encounter.trait === "phoenix" ? "blazeDash" : encounter.trait === "thief" ? "interfereCrow" : "miracleComeback",
    passiveSkill: encounter.trait === "glow" || encounter.trait === "phoenix" ? "winnerAura" : "steadyStep",
    chickenCounterType: encounter.trait === "berserk" || encounter.trait === "phoenix" ? "risk" : encounter.trait === "thief" ? "disrupt" : "balanced",
    skillTriggerTiming: encounter.trait === "berserk" || encounter.trait === "phoenix" ? "finish" : "finish",
    entryEffect: encounter.rare ? `🌌 ${encounter.name} 的羽光照亮整條礦道。` : `${encounter.icon || "🐓"} ${encounter.name} 從礦縫衝上賽道。`,
    races: 0,
    wins: 0,
    evolutionPoints: {}
  });
}

function simulateWildChickenArenaRace(chickenInput, encounter, random = Math.random, now = Date.now()) {
  const challengerId = "mine-player";
  const wildId = "mine-wild";
  const wildChicken = makeWildChickenRaceOpponent(encounter);
  const tempPlayers = {
    [challengerId]: { ...createPlayer(), ownedChicken: normalizeOwnedChicken(chickenInput) },
    [wildId]: { ...createPlayer(), ownedChicken: wildChicken }
  };
  const battle = {
    id: `${now}-mine-wild-chicken`,
    guildId: "mine",
    status: "running",
    challengerId,
    targetId: wildId,
    isBoss: false,
    createdAt: now,
    runners: null,
    frames: [],
    result: null,
    raceTrackModifier: encounter.region === "sky" ? "wind" : encounter.region === "underground" ? "lava" : encounter.region === "inverted" ? "chaos" : "speed"
  };
  const maxFrames = PK_FRAME_COUNT * 3;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    updateBattleFrame(battle, tempPlayers, frame, random);
    if (hasChickenReachedFinish(battle)) break;
  }
  const runners = Array.isArray(battle.runners) ? battle.runners : [];
  const sorted = [...runners].sort((a, b) => b.position - a.position);
  const winner = sorted[0];
  const frames = battle.frames;
  return {
    won: Boolean(winner && winner.userId === challengerId),
    frames,
    wildChicken,
    playerRunner: runners.find((runner) => runner.userId === challengerId),
    wildRunner: runners.find((runner) => runner.userId === wildId)
  };
}

function buildWildChickenRaceHeader(chicken, wildChicken, encounter) {
  return [
    `${encounter.rare ? "🌌" : "🐓"} ${encounter.name} 出現！`,
    "🏁 短距離對決開始！",
    "🏟️ 礦坑臨時賽道展開！",
    `挑戰者數值：Lv.${chicken.level || 1}｜速${chicken.speed || 0} 衝${chicken.sprint || 0} 穩${chicken.stability || 0} 耐${chicken.stamina || 0}`,
    `野生雞數值：Lv.${wildChicken.level || 1}｜速${wildChicken.speed || 0} 衝${wildChicken.sprint || 0} 穩${wildChicken.stability || 0} 耐${wildChicken.stamina || 0}`,
    "",
    "📺【賽況】"
  ].join("\n");
}

function buildWildChickenAnimationFrames(chicken, encounter, race, finalLines) {
  const header = buildWildChickenRaceHeader(chicken, race.wildChicken, encounter);
  const frames = race.frames.length > 0 ? race.frames : ["賽道塵土飛揚，雙方同時起跑。"];
  return frames.map((frame, index) => [
    header,
    frame,
    index === frames.length - 1 ? finalLines.join("\n") : ""
  ].filter(Boolean).join("\n"));
}

function resolveWildChickenRace(player, encounter, random = Math.random, now = Date.now(), eventId = "wild_mine_chicken") {
  if (!player.ownedChicken) {
    if (player.caveType === "raptor") {
      const result = returnToSurface(player, random, null, now);
      return {
        ok: true,
        player: result.player,
        title: "猛禽洞窟敗退",
        message: `${encounter.icon} ${encounter.name} 抬頭看了你一眼。\n你沒有自己的雞可以出賽，被猛禽洞窟的風壓送回地面。\n\n${result.message}`
      };
    }
    player.wildChickenEncounter = null;
    return {
      ok: true,
      player,
      title: "野生賽雞",
      message: `${encounter.icon} ${encounter.name} 抬頭看了你一眼。\n你沒有自己的雞可以出賽，牠鑽進礦縫消失了。`
    };
  }
  const chicken = normalizeOwnedChicken(player.ownedChicken);
  player.ownedChicken = chicken;
  const race = simulateWildChickenArenaRace(chicken, encounter, random, now);
  const won = race.won;
  chicken.races += 1;
  if (won) chicken.wins += 1;
  const gainedExp = won ? 120 : 55;
  const expMessage = addChickenExp(player, gainedExp, random);
  addWildChickenInfluence(player, encounter, won ? 2 : 1);
  if (won) {
    encounter.raceWeakened = true;
    encounter.captureConfirm = false;
    player.wildChickenEncounter = encounter;
    player.pendingEvent = eventId;
    const drops = awardWildChickenDrop(player, encounter, random);
    const captureInfo = getWildChickenCaptureChance(player, encounter);
    const finalLines = [
      `🏆 ${chicken.name} 擊敗了 ${encounter.name}！`,
      `EXP +${gainedExp}`,
      `掉落：${drops.join("｜")}`,
      `牠喘得很厲害，現在捕捉率：${formatPercent(captureInfo.chance)}。`,
      "可以放過，或嘗試捕捉。",
      expMessage
    ].filter(Boolean);
    const animationFrames = buildWildChickenAnimationFrames(chicken, encounter, race, finalLines);
    return {
      ok: true,
      player,
      title: "野生賽雞",
      announcement: encounter.rare ? `🌌 傳說中的「${encounter.name}」被 <@PLAYER> 擊敗了！` : "",
      message: animationFrames[animationFrames.length - 1],
      animationFrames
    };
  }
  player.wildChickenEncounter = null;
  let penalty = "牠甩開你，消失在礦道深處。";
  if (encounter.trait === "thief" && player.gold > 0) {
    const stolen = Math.min(player.gold, 30 + getDepthBonus(player.depth) * 5);
    player.gold -= stolen;
    penalty = `${encounter.name} 叼走 ${stolen} 金幣。`;
  } else if (encounter.trait === "berserk" && random() < 0.45) {
    penalty = `${encounter.name} 暴衝撞碎石壁，${addBombDamage(player, now).message}`;
  }
  const finalLines = [
    `🥈 ${chicken.name} 差一點追上。`,
    `EXP +${gainedExp}`,
    penalty,
    expMessage
  ].filter(Boolean);
  const animationFrames = buildWildChickenAnimationFrames(chicken, encounter, race, finalLines);
  if (player.caveType === "raptor") {
    const result = returnToSurface(player, random, null, now);
    const message = [
      animationFrames[animationFrames.length - 1],
      "",
      "猛禽洞窟只承認勝者。你被送回地面。",
      result.message
    ].join("\n");
    return {
      ok: true,
      player: result.player,
      title: "猛禽洞窟敗退",
      message,
      animationFrames: [...animationFrames.slice(0, -1), message]
    };
  }
  return {
    ok: true,
    player,
    title: "野生賽雞",
    message: animationFrames[animationFrames.length - 1],
    animationFrames
  };
}

function moveNormalMineDepth(player, amount) {
  const beforeDepth = Math.max(1, Math.floor(player.depth || 1));
  const nextDepth = Math.max(1, beforeDepth + Math.floor(amount || 0));
  const cappedDepth = Math.min(CONFIG.mining.lavaDepth, nextDepth);
  player.depth = cappedDepth;
  const progressMessage = cappedDepth > beforeDepth ? addRunDepthProgress(player, cappedDepth - beforeDepth) : setDepthRecord(player);
  if (nextDepth >= CONFIG.mining.lavaDepth) {
    player.zone = "lavaPool";
    player.caveType = null;
    player.lavaProgress = 0;
    return {
      progressMessage,
      transitionMessage: "升降機衝到深層盡頭，前方只剩翻滾的岩漿池。"
    };
  }
  return { progressMessage, transitionMessage: "" };
}

function maybeTriggerRandomEvent(player, random = Math.random) {
  if (
    player.dead
    || player.pendingEvent
    || player.supplyStation
    || player.minorBuffOptions.length > 0
    || player.minorBuffSelections.length > 0
    || !shouldCheckEvent(Math.abs(player.depth), player)
  ) return "";
  const mode = getMode(player);
  player.eventChanceBonus = (mode && mode.eventChanceBonus ? mode.eventChanceBonus : 0)
    + getMinorBuffEffectiveStacks(player, "event") * CONFIG.minorBuffs.event.eventChanceBonus
    + getChickenMiningBonus(player).eventChanceBonus
    + (player.caveType === "raptor" ? 0.35 : 0);
  const triggered = rollEventTrigger(player, random);
  const nextState = updateEventState(triggered, player);
  player.eventMissCount = nextState.eventMissCount;
  player.nextEventDepth = nextState.nextEventDepth;
  if (!triggered) return "";

  let eventId = null;
  if (player.zone === "upward") eventId = pickReverseEvent(player, random);
  else if (player.zone === "skyDown") eventId = pickSkyEvent(player, random);
  else if (player.caveType === "raptor") eventId = pickRaptorEvent(player, random);
  else if (player.caveType === "gem") eventId = pickGemEvent(player, random);
  else if (player.highTierEligible && random() < 0.18) eventId = pickHighTierEvent(player, random);
  else eventId = pickRandomEvent(player, random);
  player.pendingEvent = eventId;
  recordEventTypeEncounter(player, eventId);
  const event = getRandomEvent(eventId);
  const challengeMessage = setupEventChallenge(player, event, eventId, random);
  const memoryMessage = setupMemoryChallenge(player, event, eventId, random);
  const traitSwapMessage = setupTraitSwapEvent(player, event, eventId, random);
  return `\n\n事件出現：${event.title}。\n${event.description}${challengeMessage}${memoryMessage}${traitSwapMessage}`;
}

function setupTraitSwapEvent(player, event, eventId, random = Math.random) {
  player.traitSwapEvent = null;
  if (!event || !event.traitSwapEvent) return "";
  const pool = getRunModeIds(false).filter((id) => id !== player.runMode && CONFIG.runModes[id]);
  if (pool.length === 0) return "";
  const offeredTrait = pool[Math.floor(random() * pool.length)] || pool[0];
  player.traitSwapEvent = {
    eventId,
    offeredTrait,
    mutation: event.mutation || ""
  };
  const current = CONFIG.runModes[player.runMode] || {};
  const offered = CONFIG.runModes[offeredTrait] || {};
  return [
    "",
    `目前：${current.label || current.name || player.runMode || "無詞條"}`,
    `候選：${offered.label || offered.name || offeredTrait}`,
    offered.shortDescription ? `效果：${offered.shortDescription}` : ""
  ].filter(Boolean).join("\n");
}

function setupEventChallenge(player, event, eventId, random = Math.random, now = Date.now()) {
  player.eventChallenge = null;
  if (!event) return "";
  if (event.qte) {
    const choices = event.qte.choices || [];
    const correct = choices[Math.floor(random() * choices.length)] || choices[0];
    const hintPool = event.qte.hints || [];
    const hint = hintPool[Math.floor(random() * hintPool.length)] || "";
    player.eventChallenge = {
      eventId,
      type: event.qte.type || "qte",
      correctChoice: correct ? correct.id : "",
      choices,
      startedAt: now,
      expiresAt: now + Math.max(3, event.qte.seconds || 8) * 1000,
      hint
    };
    return `\n⏱️ 限時 ${Math.max(3, event.qte.seconds || 8)} 秒。${hint ? `\n${hint}` : ""}`;
  }
  if (event.lockpick) {
    player.eventChallenge = {
      eventId,
      type: "lockpick",
      correctChoice: "unlock",
      choices: [
        { id: "left", label: "左轉" },
        { id: "right", label: "右轉" },
        { id: "unlock", label: "嘗試開鎖" }
      ],
      startedAt: now,
      expiresAt: now + Math.max(6, event.lockpick.seconds || 12) * 1000,
      durability: Math.max(1, event.lockpick.durability || 3),
      angle: Math.floor(random() * 360),
      targetAngle: Math.floor(random() * 360),
      tolerance: Math.max(5, event.lockpick.tolerance || 18),
      attempts: 0
    };
    return `\n🪛 鐵絲耐久：${player.eventChallenge.durability}\n⏱️ 限時 ${Math.max(6, event.lockpick.seconds || 12)} 秒。`;
  }
  return "";
}

function angleDistance(a, b) {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(diff, 360 - diff);
}

function getLockpickHint(challenge) {
  const distance = angleDistance(challenge.angle || 0, challenge.targetAngle || 0);
  if (distance <= (challenge.tolerance || 12)) return "🔓 喀…鎖芯快開了。";
  if (distance <= 45) return "⚠️ 鐵絲正在彎曲。";
  if (distance <= 90) return "喀、喀，角度還差一點。";
  return "鎖芯幾乎沒有反應。";
}

function isForceEvacuationEventId(eventId) {
  return eventId === "mine_collapse_evacuation"
    || eventId === "spatial_turbulence_evacuation"
    || eventId === "sky_rift_evacuation"
    || eventId === "deep_pollution_evacuation";
}

function getForceEvacuationTarget(player, eventId) {
  if (eventId === "spatial_turbulence_evacuation" && player.undergroundCampUnlocked) return "undergroundCamp";
  if (eventId === "sky_rift_evacuation" && player.skyCampUnlocked) return "skyCamp";
  return "surface";
}

function resolveForceEvacuation(player, eventId, event, choice = "safe", random = Math.random, now = Date.now()) {
  const bonus = choice === "risk" || choice === "extreme" ? 80 + getDepthBonus(player.depth) * 15 : 0;
  if (bonus > 0) player.gold += bonus;
  const damage = choice === "extreme" && random() < 0.55 ? `\n${addBombDamage(player, now).message}` : "";
  const target = getForceEvacuationTarget(player, eventId);
  if (target === "surface") {
    const result = returnToSurface(player, random, null, now);
    result.title = event.title;
    result.message = `${event.title === "礦坑大崩塌" ? "🌋 礦坑徹底崩塌！" : "⚠️ 危險爆發！"}\n你被迫撤離回營地！\n${bonus ? `撤離前搶到 ${bonus} 金幣。\n` : ""}${result.message}${damage}`;
    return result;
  }
  player.zone = target;
  player.pendingEvent = null;
  player.eventChallenge = null;
  player.depth = target === "skyCamp" ? -100 : 100;
  player.runDepthProgress = 0;
  player.caveType = null;
  return {
    ok: true,
    player,
    title: event.title,
    message: `${event.title === "空間亂流" ? "🌀 空間亂流把你吸走！" : "⚡ 天域裂縫強行拉走你！"}\n${bonus ? `混亂中搶到 ${bonus} 金幣。\n` : ""}你被迫回到${target === "skyCamp" ? "天域營地" : "地底營地"}。${damage}`
  };
}

function applyChallengeSuccess(player, eventId, random = Math.random) {
  if (isForceEvacuationEventId(eventId)) {
    addTempEffect(player, { id: "evacuation_escape_focus", remaining: 2, bombWeightMultiplier: 0.9 });
    return "✨ 抓準空隙！你穩住身體，危機擦身而過。\n接下來 2 層炸彈 -10%，不用撤回營地。";
  }
  if (eventId === "qte_bomb_defuse") {
    player.bombItem += 1;
    const gold = 50 + getDepthBonus(player.depth) * 12;
    player.gold += gold;
    return `✨ CLICK！拆除成功，獲得完整炸彈 x1 和 ${gold} 金幣。`;
  }
  if (eventId === "qte_cave_escape") {
    player.depth += 1;
    addRunDepthProgress(player, 1);
    return `✨ 你衝出崩塌區，順勢深入到第 ${player.depth} 層。`;
  }
  if (eventId === "qte_resonance_strike") {
    const reward = addOreReward(player, 4 + getDepthBonus(player.depth), player.depth >= 30 ? "platinumOre" : "goldOre");
    return `✨ 完美共振！獲得 ${reward.gained} 塊${getOreName(reward.target)}。`;
  }
  if (eventId === "qte_memory_route") {
    addTempEffect(player, { id: "hidden_route", remaining: 3, rewardMultiplier: 1.35, bombWeightMultiplier: 0.85 });
    return "✨ 你記起路線，進入隱藏礦道。接下來 3 層收益 +35%，炸彈 -15%。";
  }
  if (eventId === "puzzle_circuit_repair") {
    const gold = 90 + getDepthBonus(player.depth) * 18;
    player.gold += gold;
    return `✨ 電路接通，寶箱彈開。獲得 ${gold} 金幣。`;
  }
  if (eventId === "puzzle_lava_valve") {
    player.chargeValue = Math.min(100, (player.chargeValue || 0) + 35);
    addTempEffect(player, { id: "lava_valve", remaining: 2, rewardMultiplier: 1.5 });
    return "✨ 岩漿改道，能量 +35，接下來 2 層收益 +50%。";
  }
  if (eventId === "lockpick_ancient_vault") {
    const roll = random();
    if (roll < 0.25) {
      player.rusty += 1;
      return "✨ 金庫打開，你拿到生鏽紀念幣 x1。";
    }
    const reward = addOreReward(player, 3 + getDepthBonus(player.depth), "goldOre");
    return `✨ 金庫打開，獲得 ${reward.gained} 塊${getOreName(reward.target)}。`;
  }
  if (eventId.startsWith("lockpick_lava") || eventId.startsWith("lockpick_inverted") || eventId.startsWith("lockpick_pollution")) {
    const ore = addItemReward(player, "invertedOre", 2 + Math.floor(random() * 3));
    const gem = random() < 0.35 ? addItemReward(player, "invertedGem", 1) : 0;
    return `✨ 地下鎖箱打開，獲得顛倒礦石 x${ore}${gem ? `、顛倒寶石 x${gem}` : ""}。`;
  }
  if (eventId.startsWith("lockpick_thunder") || eventId.startsWith("lockpick_astral") || eventId.startsWith("lockpick_sky")) {
    const steel = random() < 0.45 ? addItemReward(player, "orichalcum", 1) : 0;
    const gem = addItemReward(player, "invertedGem", 1 + Math.floor(random() * 2));
    return `✨ 天域封鎖解除，獲得顛倒寶石 x${gem}${steel ? "、奧利哈鋼 x1" : ""}。`;
  }
  if (eventId.startsWith("qte_lava") || eventId.startsWith("qte_inverted") || eventId.startsWith("qte_chain") || eventId.startsWith("qte_deep") || eventId.startsWith("puzzle_lava") || eventId.startsWith("puzzle_inverted") || eventId.startsWith("puzzle_underground")) {
    const ore = addItemReward(player, "invertedOre", 2 + getDepthBonus(Math.abs(player.depth || 0)));
    addTempEffect(player, { id: "underground_qte_focus", remaining: 2, rewardMultiplier: 1.25 });
    return `✨ 地下機關被你破解，獲得顛倒礦石 x${ore}，接下來 2 層收益 +25%。`;
  }
  if (eventId.startsWith("qte_wind") || eventId.startsWith("qte_lightning") || eventId.startsWith("qte_cloud") || eventId.startsWith("qte_lightwing") || eventId.startsWith("puzzle_light") || eventId.startsWith("puzzle_floating") || eventId.startsWith("puzzle_sky")) {
    const gem = addItemReward(player, "invertedGem", 1 + Math.floor(random() * 2));
    player.chargeValue = Math.min(100, (player.chargeValue || 0) + 30);
    return `✨ 天域節奏對上了，獲得顛倒寶石 x${gem}，能量 +30。`;
  }
  const gold = 60 + getDepthBonus(player.depth) * 10;
  player.gold += gold;
  return `✨ 成功！獲得 ${gold} 金幣。`;
}

function applyChallengeFailure(player, eventId, now = Date.now()) {
  if (isForceEvacuationEventId(eventId)) {
    return "💥 反應慢了一拍。";
  }
  if (eventId === "qte_cave_escape") {
    const damage = addBombDamage(player, now);
    player.depth = Math.max(0, player.depth - 1);
    return `💥 慢了一拍，碎石封路。${damage.message}你被迫退回第 ${player.depth} 層。`;
  }
  if (eventId === "qte_memory_route") {
    addTempEffect(player, { id: "lost_route", remaining: 2, bombWeightMultiplier: 1.35 });
    return "💥 路線記錯，你踏進危險區。接下來 2 層炸彈 +35%。";
  }
  if (eventId === "puzzle_circuit_repair" || eventId === "puzzle_lava_valve") {
    const damage = addBombDamage(player, now);
    return `💥 拼圖失誤，陷阱啟動。${damage.message}`;
  }
  if (
    eventId.startsWith("qte_lava")
    || eventId.startsWith("qte_inverted")
    || eventId.startsWith("qte_chain")
    || eventId.startsWith("qte_deep")
    || eventId.startsWith("puzzle_lava")
    || eventId.startsWith("puzzle_inverted")
    || eventId.startsWith("puzzle_underground")
    || eventId.startsWith("lockpick_lava")
    || eventId.startsWith("lockpick_inverted")
    || eventId.startsWith("lockpick_pollution")
  ) {
    const damage = addBombDamage(player, now, 1.5);
    return `💥 地下壓力爆開。${damage.message}`;
  }
  if (
    eventId.startsWith("qte_wind")
    || eventId.startsWith("qte_lightning")
    || eventId.startsWith("qte_cloud")
    || eventId.startsWith("qte_lightwing")
    || eventId.startsWith("puzzle_light")
    || eventId.startsWith("puzzle_floating")
    || eventId.startsWith("puzzle_sky")
    || eventId.startsWith("lockpick_thunder")
    || eventId.startsWith("lockpick_astral")
    || eventId.startsWith("lockpick_sky")
  ) {
    const damage = addBombDamage(player, now);
    player.depth = Math.min(-1, (player.depth || -1) + 1);
    return `💥 天風把你吹回一段高度。${damage.message}`;
  }
  const damage = addBombDamage(player, now);
  return `💥 BOOM！${damage.message}`;
}

function resolveEventChallenge(playerInput, action, random = Math.random, now = Date.now()) {
  const player = getPlayer(playerInput);
  const challenge = player.eventChallenge;
  const event = challenge ? getRandomEvent(challenge.eventId) : null;
  if (!challenge || !event) {
    return { ok: false, player, title: "沒有互動事件", message: "目前沒有需要操作的事件。" };
  }

  if (now > challenge.expiresAt) {
    if (isForceEvacuationEventId(challenge.eventId)) {
      const result = resolveForceEvacuation(player, challenge.eventId, event, "safe", random, now);
      return { ...result, message: `⏱️ 超時。\n${result.message}` };
    }
    const message = applyChallengeFailure(player, challenge.eventId, now);
    player.pendingEvent = null;
    player.eventChallenge = null;
    return { ok: true, player, title: event.title, message: `⏱️ 超時。\n${message}` };
  }

  if (challenge.type === "lockpick") {
    if (action === "left" || action === "right") {
      const delta = action === "left" ? -18 : 18;
      challenge.angle = (challenge.angle + delta + 360) % 360;
      challenge.attempts = (challenge.attempts || 0) + 1;
      player.eventChallenge = challenge;
      return {
        ok: true,
        player,
        title: event.title,
        message: `${getLockpickHint(challenge)}\n🪛 鐵絲耐久：${challenge.durability}\n角度：${challenge.angle}°`
      };
    }
    if (angleDistance(challenge.angle || 0, challenge.targetAngle || 0) <= (challenge.tolerance || 12)) {
      const message = applyChallengeSuccess(player, challenge.eventId, random);
      player.pendingEvent = null;
      player.eventChallenge = null;
      return { ok: true, player, title: event.title, message };
    }
    challenge.durability -= 1;
    if (challenge.durability <= 0) {
      const message = applyChallengeFailure(player, challenge.eventId, now);
      player.pendingEvent = null;
      player.eventChallenge = null;
      return { ok: true, player, title: event.title, message: `💥 鐵絲斷裂！\n${message}` };
    }
    player.eventChallenge = challenge;
    return {
      ok: true,
      player,
      title: event.title,
      message: `沒開。${getLockpickHint(challenge)}\n🪛 鐵絲耐久：${challenge.durability}`
    };
  }

  const success = action === challenge.correctChoice;
  if (isForceEvacuationEventId(challenge.eventId) && !success) {
    const failed = applyChallengeFailure(player, challenge.eventId, now);
    const result = resolveForceEvacuation(player, challenge.eventId, event, "safe", random, now);
    return { ...result, message: `${failed}\n${result.message}` };
  }
  const message = success
    ? applyChallengeSuccess(player, challenge.eventId, random)
    : applyChallengeFailure(player, challenge.eventId, now);
  player.pendingEvent = null;
  player.eventChallenge = null;
  return { ok: true, player, title: event.title, message };
}

function addBombDamage(player, now = Date.now(), amount = 1) {
  let damageAmount = amount;
  const mode = getMode(player);
  if (mode && mode.firstBombDamageReduction && !player.chickenAmuletUsed) {
    player.chickenAmuletUsed = true;
    damageAmount = Math.max(0, amount - 1);
    if (damageAmount <= 0) {
      return {
        dead: false,
        damage: 0,
        message: "咕咕護符替你擋下第一次爆炸，沒有受到傷害。"
      };
    }
  }
  const actualDamageValue = damageAmount * DAMAGE_PER_HIT;
  if (mode && mode.bombDodgeChance && Math.random() < mode.bombDodgeChance) {
    return {
      dead: false,
      dodged: true,
      message: "防爆外套替你擋下爆炸，沒有受到傷害。"
    };
  }
  const chickenBonus = getChickenMiningBonus(player);
  if (chickenBonus.bombDodgeChance > 0 && Math.random() < chickenBonus.bombDodgeChance) {
    return {
      dead: false,
      dodged: true,
      message: `${player.ownedChicken.icon || "🐔"} ${player.ownedChicken.name || "你的雞"} 提前叫住你，避開了爆炸。`
    };
  }
  onDamageTaken(player);
  player.bombs += actualDamageValue;
  if (mode && mode.blastRecycle && damageAmount > 0) {
    player.gold += 15 + Math.max(0, Math.floor(player.depth / 5)) * 5;
  }
  const maxBombs = getMaxBombs(player);
  if (player.bombs < maxBombs) {
    return {
      dead: false,
      damage: actualDamageValue,
      message: `受到 ${formatHpValue(actualDamageValue)} 點傷害，生命損傷 ${formatHpValue(player.bombs)}/${maxBombs}。`
    };
  }

  if (player.undyingTotem > 0) {
    player.undyingTotem -= 1;
    player.bombs = Math.max(0, maxBombs - 1);
    return {
      dead: false,
      damage: actualDamageValue,
      message: `不死圖騰發光碎裂，替你擋下死亡。你原地復活，生命剩 1/${maxBombs}。`
    };
  }

  if (player.returnBlessing) {
    const lostGold = Math.min(player.gold, Math.ceil(player.gold / 2));
    player.gold -= lostGold;
    player.returnBlessing = false;
    resetRunState(player);
    return {
      dead: false,
      returned: true,
      damage: actualDamageValue,
      message: `歸還祝福啟動，你沒有死亡並被送回地表，但失去 ${lostGold} 枚金幣。`
    };
  }

  const lostGold = applyDeathPenalty(player);
  player.dead = true;
  player.comboCount = 0;
  player.goldBeast = null;
  player.deathAt = now;
  player.lastDeathLostGold = lostGold;
  player.stats.deaths += 1;
  return {
    dead: true,
    damage: actualDamageValue,
    message: `死亡，損失 ${lostGold} 枚金幣。`
  };
}

function blockStalactiteWithHelmet(player) {
  if ((player.minerHelmetCount || 0) <= 0) return null;
  player.minerHelmetCount -= 1;
  return {
    dead: false,
    damage: 0,
    helmet: true,
    message: "⛑️ 礦工帽幫你擋下了鐘乳石！"
  };
}

function buildOutcome(kind, player, title, message, recordMessage = "", random = Math.random) {
  if (kind !== "blocked" && kind !== "full" && !player.dead && player.runMode) {
    advanceEventTypeMissCounters(player, 1);
  }
  const eventMessage = kind === "blocked" || kind === "full" || player.dead
    ? ""
    : maybeTriggerRandomEvent(player, random);
  if (kind !== "blocked" && kind !== "full" && !player.dead && player.runMode) {
    tickTempEffects(player);
    player.digPathOptions = refreshDigPathOptions(player, random).digPathOptions;
    if (canOpenSupplyStation(player)) {
      Object.assign(player, createSupplyStation(player, random));
    }
  }
  const funMessage = applyPostDigFun(player, kind, random);
  const tensionHint = getTensionHint(player);
  return {
    kind,
    player,
    title,
    message: `${message}${tensionHint ? `\n${tensionHint}` : ""}${funMessage ? `\n${funMessage}` : ""}${recordMessage ? `\n${recordMessage}` : ""}${eventMessage}${player.supplyStation ? `\n\n${formatSupplyStation(player)}` : ""}`,
    recordMessage
  };
}

function applyRewardBonus(player, reward, bonusAmount) {
  const amount = Math.max(0, Math.floor(bonusAmount || 0));
  if (!reward || amount <= 0) return 0;
  if (reward.kind === "gold") {
    player.gold += amount;
    return amount;
  }
  const freeAmount = getItemFreeAmount(player, reward.kind);
  const gained = Math.min(amount, freeAmount);
  if (gained > 0 && Object.prototype.hasOwnProperty.call(player, reward.kind)) {
    player[reward.kind] += gained;
  }
  return gained;
}

function upgradeReward(player, reward) {
  if (!reward || reward.amount <= 0) return "";
  const upgrades = {
    ore: "goldOre",
    goldOre: "platinumOre",
    oreIngot: "goldOreIngot",
    goldOreIngot: "platinumOreIngot",
    redGem: "greenGem",
    blueGem: "greenGem"
  };
  const target = upgrades[reward.kind];
  if (!target || !Object.prototype.hasOwnProperty.call(player, target)) return "";
  const amount = Math.min(reward.amount, getItemFreeAmount(player, target));
  if (amount <= 0) return "";
  player[target] += amount;
  player.runRewardStats.critBonus += getRewardGoldValue(target, amount);
  return `✨ 高級資源！+${amount} ${getOreName(target)}`;
}

function applyJackpot(player, random = Math.random) {
  const roll = random();
  player.jackpotCount += 1;
  if (roll < 0.5) {
    const gold = 200 + Math.floor(random() * 301);
    player.gold += gold;
    player.runRewardStats.burstBonus += gold;
    return `💎 JACKPOT！！！+${gold} 金幣`;
  }
  if (roll < 0.8) {
    const target = player.depth >= 30 ? "platinumOre" : "goldOre";
    const amount = Math.min(2, getItemFreeAmount(player, target));
    if (amount > 0) player[target] += amount;
    player.runRewardStats.burstBonus += getRewardGoldValue(target, amount);
    return `💎 JACKPOT！！！+${amount} ${getOreName(target)}`;
  }
  player.depth += 2;
  const recordMessage = setDepthRecord(player);
  return `💎 JACKPOT！！！深度 +2${recordMessage ? `\n${recordMessage}` : ""}`;
}

function applyChickenScavenge(player, random = Math.random) {
  const chicken = player.ownedChicken;
  if (!chicken || player.dead || !player.runMode) return "";
  const roll = random();
  if (roll < 0.41 || roll >= 0.45) return "";
  if (roll < 0.425) {
    const gold = 5 + Math.floor(Math.max(0, player.depth) / 5) * 3;
    player.gold += gold;
    player.runRewardStats.burstBonus += gold;
    return `${chicken.icon || "🐔"} ${chicken.name || "你的雞"} 叼回 ${gold} 金幣。`;
  }
  const target = player.depth >= 30 ? "platinumOre" : player.depth >= 15 ? "goldOre" : "ore";
  const amount = Math.min(1, getItemFreeAmount(player, target));
  if (amount <= 0) return `${chicken.icon || "🐔"} ${chicken.name || "你的雞"} 找到礦石，但包包放不下。`;
  player[target] += amount;
  player.runRewardStats.burstBonus += getRewardGoldValue(target, amount);
  return `${chicken.icon || "🐔"} ${chicken.name || "你的雞"} 叼回 1 塊${getOreName(target)}。`;
}

function applyPostDigFun(player, kind, random = Math.random) {
  if (kind === "blocked" || !player.runMode) return "";
  const messages = [];
  const mode = getMode(player);
  const reward = player.lastReward || null;
  delete player.lastReward;
  addCharge(player, 12);

  const combo = updateCombo(player, kind);
  const positive = POSITIVE_KINDS.has(kind) && reward && reward.amount > 0;
  if (positive) {
    const baseValue = reward.baseValue === null || reward.baseValue === undefined
      ? getRewardGoldValue(reward.kind, reward.amount)
      : reward.baseValue;
    player.runRewardStats.baseReward += baseValue;
    const comboBonusRate = getComboBonusMultiplier(combo);
    const comboBonus = Math.floor(reward.amount * comboBonusRate);
    const comboGained = applyRewardBonus(player, reward, comboBonus);
    if (combo >= 2) {
      messages.push(`🔥 ${combo}連擊！`);
      player.runRewardStats.comboBonus += getRewardGoldValue(reward.kind, comboGained);
    }

    const risk = applyRiskScaling(combo);
    const riskBonus = Math.floor(reward.amount * Math.max(0, risk.rewardMultiplier - 1));
    const riskGained = applyRewardBonus(player, reward, riskBonus);
    if (riskGained > 0 && combo > 0) {
      player.runRewardStats.riskBonus += getRewardGoldValue(reward.kind, riskGained);
      if (combo >= 3) messages.push(`⚠️ ${risk.dangerLabel}`);
    }

    if (player.chargeBurst === "reward") {
      const burstBonus = reward.amount * 2;
      const burstGained = applyRewardBonus(player, reward, burstBonus);
      player.runRewardStats.burstBonus += getRewardGoldValue(reward.kind, burstGained);
      messages.push(`⚡ 收益爆發！x3`);
      player.chargeBurst = null;
    }

    const critBonus = (mode && mode.critChanceBonus ? mode.critChanceBonus : 0)
      + getMinorBuffEffectiveStacks(player, "luck") * CONFIG.minorBuffs.luck.critChanceBonus
      + getChickenMiningBonus(player).critChanceBonus;
    const crit = rollCrit(random, critBonus);
    if (crit.crit) {
      const critGained = applyRewardBonus(player, reward, reward.amount);
      player.critCount += 1;
      player.runRewardStats.critBonus += getRewardGoldValue(reward.kind, critGained);
      messages.push(reward.kind === "gold" ? `💥 爆擊！+${critGained} 金幣` : `💥 爆擊！+${critGained} ${getOreName(reward.kind)}`);
      if (crit.upgrade) {
        const upgraded = upgradeReward(player, reward);
        if (upgraded) messages.push(upgraded);
      }
    }

    if (rollJackpot(random)) messages.push(applyJackpot(player, random));
  }

  if (!positive && player.chargeBurst === "safe" && kind === "bomb") {
    messages.push("⚡ 穩定爆發吸收了爆炸。");
    player.chargeBurst = null;
  }

  if (player.chargeBurst === "resource" && !player.dead) {
    const target = player.depth >= 30 ? "platinumOre" : "goldOre";
    const amount = Math.min(1, getItemFreeAmount(player, target));
    if (amount > 0) {
      player[target] += amount;
      player.runRewardStats.burstBonus += getRewardGoldValue(target, amount);
      messages.push(`⚡ 資源爆發！+${amount} ${getOreName(target)}`);
    }
    player.chargeBurst = null;
  }

  const risk = applyRiskScaling(player.comboCount || 0);
  if (!player.dead && risk.bombMultiplier > 1 && random() < 0.04 * (risk.bombMultiplier - 1)) {
    const damage = addBombDamage(player);
    messages.push(`⚠️ 風險連鎖反噬，${damage.message}`);
  }

  const scavengeMessage = applyChickenScavenge(player, random);
  if (scavengeMessage) messages.push(scavengeMessage);
  if ((player.chargeValue || 0) >= 100) messages.push("⚡ 蓄力已滿，可使用爆發。");
  return messages.join("\n");
}

function resolveGoldBeastReturn(player, random = Math.random, shouldReturn = false) {
  if (player.dead || !player.goldBeast || !shouldReturn) return "";
  const roll = random();
  const multiplier = roll < 0.5 ? 1.5 : roll < 0.85 ? 2 : 3;
  const reward = Math.floor(player.goldBeast.amount * multiplier);
  player.gold += reward;
  player.goldBeast = null;
  return `吞金獸回來了，吐出 ${reward} 金幣。\n你感覺牠不會再回來了…`;
}

function getGemAmount(depth, random = Math.random) {
  const bonus = Math.min(3, Math.floor(depth / 4));
  return 1 + Math.floor(random() * (2 + bonus));
}

function getTensionHint(playerInput) {
  const player = getPlayer(playerInput);
  if (player.zone === "upward" && player.depth <= -90) return "☁️ 天光越來越近，反轉風壓刺得耳朵發疼。";
  if (player.depth >= 99 && player.depth < 100) return "💀 差一層就能抵達岩漿區…";
  if (player.depth >= 90) return "🔥 你感覺空氣開始變熱…";
  if (player.depth >= 70 && player.bombs >= getMaxBombs(player) - 1) return "💔 只差一點就撐不住了。";
  if (player.comboCount >= 4) return "⛏️ 這條礦脈似乎不太對勁…";
  return "";
}

function processLayerStartEffects(player, random = Math.random, now = Date.now()) {
  const messages = [];
  for (const effect of player.tempEffects) {
    if (effect.hurtChance && random() < effect.hurtChance) {
      const damage = addBombDamage(player, now);
      messages.push(`臨時效果反噬，${damage.message}`);
      if (damage.dead) break;
    }
  }

  if (!player.dead && player.runMode === "anomalousBackpack" && random() < 0.2) {
    if (getBagFreeSlots(player) >= 3) {
      player.junk += 1;
      messages.push("異常背包吐出 1 個超級破爛。");
    } else {
      messages.push("異常背包想吐出破爛，但包包塞不下。");
    }
  }

  if (!player.dead && player.potionCooldown > 0) {
    player.potionCooldown = Math.max(0, player.potionCooldown - 1);
  }

  const goldBeastMessage = resolveGoldBeastReturn(
    player,
    random,
    player.depth >= (player.goldBeast && player.goldBeast.returnDepth || Infinity)
  );
  if (goldBeastMessage) messages.push(goldBeastMessage);

  return messages.join("\n");
}

function mineGemCave(player, random = Math.random, now = Date.now(), recordMessage = "", digPath = null) {
  const pathPrefix = getDigPathPrefix(player, digPath);
  const result = rollWeighted(applyDigPathWeights(CONFIG.mining.gemWeights, player, digPath), random);
  const mode = player.runMode ? CONFIG.runModes[player.runMode] : null;
  const gatherMultiplier = mode && mode.gatherMultiplier ? mode.gatherMultiplier : 1;
  const digPathRewardMultiplier = getDigPathRewardMultiplier(player, digPath)
    * getEffectMultiplier(player, "rewardMultiplier")
    * consumeChainBlastReward(player);

  if (result === "redGem" || result === "blueGem" || result === "greenGem") {
    const amount = Math.max(1, Math.floor(getGemAmount(player.depth, random) * gatherMultiplier * digPathRewardMultiplier));
    const freeAmount = getItemFreeAmount(player, result);
    if (freeAmount <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${pathPrefix}你挖到寶石，但包包已滿，放不下。`
      };
    }

    const gained = Math.min(amount, freeAmount);
    player[result] += gained;
    const name = result === "redGem" ? "紅寶石" : result === "blueGem" ? "藍寶石" : "綠寶石";
    player.lastReward = makeReward(result, gained);
    return buildOutcome(
      result,
      player,
      `挖到${name}`,
      `${pathPrefix}你挖到了 ${gained} 顆${name}。返回地面時會換成高價金幣。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`,
      recordMessage,
      random
    );
  }

  if (result === "stalactite") {
    const damage = blockStalactiteWithHelmet(player) || addBombDamage(player, now, 2);
    if (damage.dead) {
      return {
        kind: "dead",
        player,
        title: "鐘乳石砸落",
        message: `${pathPrefix}鐘乳石砸中你，扣 ${formatHpValue(damage.damage || 1)} 滴血。${damage.message}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人救援。${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }

    return buildOutcome(
      "stalactite",
      player,
      "鐘乳石砸落",
      damage.helmet
        ? `${pathPrefix}${damage.message}`
        : `${pathPrefix}鐘乳石砸中你，扣 ${formatHpValue(damage.damage || 1)} 滴血。生命損傷 ${formatHpValue(player.bombs)}/${getMaxBombs(player)}。`,
      recordMessage,
      random
    );
  }

  const amount = gatherMultiplier;
  const requiredSlots = amount * 5;
  if (getBagFreeSlots(player) < requiredSlots) {
    return {
      kind: "full",
      player,
      title: "包包已滿",
      message: `${pathPrefix}你挖到 ${amount} 個白金破爛，但它需要 ${requiredSlots} 格包包，放不下。`
    };
  }

  player.platinumJunk += amount;
  return buildOutcome(
    "platinumJunk",
    player,
    "挖到白金破爛",
    `${pathPrefix}你挖到了 ${amount} 個白金破爛，共佔 ${requiredSlots} 格包包，只能返回地面時清掉。`,
    recordMessage,
    random
  );
}

function crossLavaPool(player, random = Math.random, now = Date.now()) {
  player.zone = "lavaPool";
  player.caveType = null;
  player.lavaProgress = (player.lavaProgress || 0) + 1;
  const damage = addBombDamage(player, now, 2);
  if (damage.dead) {
    return {
      kind: "dead",
      player,
      title: "岩漿池",
      message: `你嘗試穿越岩漿池，第 ${player.lavaProgress}/${CONFIG.mining.lavaRounds} 回合。${damage.message}`
    };
  }
  if (player.lavaProgress >= CONFIG.mining.lavaRounds) {
    player.zone = "undergroundCamp";
    player.undergroundCampUnlocked = true;
    player.depth = CONFIG.mining.lavaDepth;
    const settlement = settleSellableResources(player, null, now);
    Object.assign(player, settlement.player);
    refreshCampRunModeOptions(player, random);
    const goldBeastMessage = resolveGoldBeastReturn(player, random, Boolean(player.goldBeast));
    return {
      kind: "blocked",
      player,
      title: "地底營地",
      message: `你穿過岩漿池抵達地底營地。${damage.message}${settlement.message}${goldBeastMessage ? `\n${goldBeastMessage}` : ""}這裡可以銀行、搭電梯或開始往上挖。`
    };
  }
  return {
    kind: "stalactite",
    player,
    title: "岩漿池",
    message: `你正在穿越岩漿池，第 ${player.lavaProgress}/${CONFIG.mining.lavaRounds} 回合。${damage.message}`
  };
}

function mineUpward(player, random = Math.random, now = Date.now()) {
  const previousDepth = player.depth;
  player.depth -= 1;
  const recordMessage = addRunDepthProgress(player, 1);
  const layerEffectMessage = processLayerStartEffects(player, random, now);
  if (player.dead) {
    return {
      kind: "dead",
      player,
      title: "反轉層反噬",
      message: `${layerEffectMessage}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人救援。`
    };
  }
  if (player.depth <= CONFIG.mining.skyDepth) {
    player.zone = "skyCamp";
    player.skyCampUnlocked = true;
    const settlement = settleSellableResources(player, null, now);
    Object.assign(player, settlement.player);
    refreshCampRunModeOptions(player, random);
    return {
      kind: "blocked",
      player,
      title: "天域營地",
      message: `你抵達了地表之上的未知領域。更多功能敬請期待。${settlement.message}`
    };
  }

  if (player.depth >= 0) {
    const roll = random();
    if (roll < 0.45) {
      const preferredOre = player.depth >= 30 ? "platinumOre" : player.depth >= 15 ? "goldOre" : "ore";
      const reward = addOreReward(player, 1 + Math.floor(random() * 3), preferredOre);
      player.lastReward = makeReward(reward.target, reward.gained);
      return {
        kind: reward.gained > 0 ? reward.target : "full",
        player,
        title: "回升礦道",
        message: `你往地表方向挖出 ${reward.gained} 個礦物。${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }
    if (roll < 0.7) {
      const gained = Math.max(1, Math.floor((20 + player.depth) * getModeRewardMultiplier(player)));
      onGoldGained(player, gained);
      player.lastReward = makeReward("gold", gained);
      return {
        kind: "gold",
        player,
        title: "回升金脈",
        message: `你在回升礦道撿到 ${gained} 金幣。${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }
    if (roll < 0.85) {
      const damage = addBombDamage(player, now, 1);
      return {
        kind: player.dead ? "dead" : "stalactite",
        player,
        title: "鬆動岩層",
        message: `上方碎岩掉落，${damage.message}${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }
    return {
      kind: "empty",
      player,
      title: "回升碎石",
      message: `這一鏟只有往地表滑落的碎石。${recordMessage ? `\n${recordMessage}` : ""}`,
      recordMessage
    };
  }

  const boundarySettlement = previousDepth >= 0 && player.depth < 0
    ? settleSellableResources(player, null, now)
    : null;
  if (boundarySettlement) Object.assign(player, boundarySettlement.player);

  const eventMessage = maybeTriggerRandomEvent(player, random);
  if (eventMessage) {
    return buildOutcome(
      "blocked",
      player,
      "反轉事件",
      `${boundarySettlement ? boundarySettlement.message : ""}\n反轉層出現異常。${eventMessage}`,
      recordMessage,
      random
    );
  }

  const reverseMultiplier = getModeRewardMultiplier(player)
    * (1 + getMinorBuffEffectiveStacks(player, "reverse") * CONFIG.minorBuffs.reverse.reverseRewardBonus);
  const boundaryMessage = boundarySettlement ? `${boundarySettlement.message}\n` : "";
  const roll = random();
  if (player.depth <= -1 && roll < 0.08) {
    const gained = addItemReward(player, "orichalcum", 1);
    if (gained <= 0) {
      return buildOutcome("full", player, "包包滿了", `${boundaryMessage}你挖到奧利哈鋼，但包包已經放不下。`, recordMessage, random);
    }
    return buildOutcome("orichalcum", player, "奧利哈鋼", `${boundaryMessage}你挖到 ${gained} 塊奧利哈鋼。用途：敬請期待。`, recordMessage, random);
  }
  if (roll < 0.45) {
    const gained = addItemReward(player, "invertedOre", Math.max(1, Math.floor((1 + random() * 3) * reverseMultiplier)));
    if (gained <= 0) {
      return buildOutcome("full", player, "包包滿了", `${boundaryMessage}你挖到顛倒礦石，但包包已經放不下。`, recordMessage, random);
    }
    player.lastReward = makeReward("invertedOre", gained);
    return buildOutcome("invertedOre", player, "顛倒礦石", `${boundaryMessage}你往上挖出 ${gained} 塊顛倒礦石。只能在地底客棧兌換，敬請期待。`, recordMessage, random);
  }
  if (roll < 0.75) {
    const gained = addItemReward(player, "invertedGem", Math.max(1, Math.floor((1 + random() * 2) * reverseMultiplier)));
    if (gained <= 0) {
      return buildOutcome("full", player, "包包滿了", `${boundaryMessage}你挖到顛倒寶石，但包包已經放不下。`, recordMessage, random);
    }
    player.lastReward = makeReward("invertedGem", gained);
    return buildOutcome("invertedGem", player, "顛倒寶石", `${boundaryMessage}你往上挖出 ${gained} 顆顛倒寶石。只能在地底客棧兌換，敬請期待。`, recordMessage, random);
  }
  if (roll < 0.88) {
    const damage = addBombDamage(player, now, 1);
    return buildOutcome("stalactite", player, "空間亂流", `${boundaryMessage}反轉亂流割過礦道，${damage.message}`, recordMessage, random);
  }
  return buildOutcome("empty", player, "反轉碎石", `${boundaryMessage}這一鏟只有往上飄的碎石。`, recordMessage, random);
}

function mineSkyDown(player, random = Math.random, now = Date.now()) {
  player.zone = "skyDown";
  const beforeDepth = player.depth || CONFIG.mining.skyDepth;
  player.depth = Math.min(0, (player.depth || CONFIG.mining.skyDepth) + 10);
  const recordMessage = addRunDepthProgress(player, Math.abs(player.depth - beforeDepth));
  const layerEffectMessage = processLayerStartEffects(player, random, now);
  if (player.dead) {
    return {
      kind: "dead",
      player,
      title: "天降失足",
      message: `${layerEffectMessage}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人救援。`
    };
  }
  if (player.depth >= 0) {
    player.zone = "upward";
    const result = returnToSurface(player, random, null, now);
    return {
      kind: "blocked",
      player: result.player,
      title: "回到地上營地",
      message: `【回到地上營地】\n你回到了地表。\n\n${result.message}`
    };
  }

  const roll = random();
  if (roll < 0.25) {
    const gained = addItemReward(player, "invertedGem", 1 + Math.floor(random() * 2));
    return buildOutcome("invertedGem", player, "天光顛倒寶石", `你往下挖回地表，撿到 ${gained} 顆顛倒寶石。`, recordMessage, random);
  }
  if (roll < 0.38) {
    const gained = addItemReward(player, "orichalcum", 1);
    return buildOutcome("orichalcum", player, "天域碎金", `雲層裡掉出 ${gained} 塊奧利哈鋼。`, recordMessage, random);
  }
  if (roll < 0.55) {
    const damage = addBombDamage(player, now, 1);
    return buildOutcome("stalactite", player, "高空亂流", `往下挖時被高空亂流刮傷，${damage.message}`, recordMessage, random);
  }
  return buildOutcome("empty", player, "雲層空洞", "你往下挖了一段，只挖到發亮的空氣。", recordMessage, random);
}

function mine(playerInput, random = Math.random, now = Date.now(), digPath = null) {
  const player = repairPlayerState(playerInput, random).player;
  const pathPrefix = getDigPathPrefix(player, digPath);
  const digPathRewardMultiplier = getDigPathRewardMultiplier(player, digPath);
  if (player.dead) {
    return {
      kind: "blocked",
      player,
      title: "你已經死亡",
      message: "目前不能挖礦。請使用 `/復活`。"
    };
  }

  if (player.pendingEvent) {
    const event = getRandomEvent(player.pendingEvent);
    return {
      kind: "blocked",
      player,
      title: "事件等待選擇",
      message: event
        ? `目前遇到事件：${event.title}。請先選擇事件選項。`
        : "目前遇到事件，請先選擇事件選項。"
    };
  }

  if (player.supplyStation) {
    return {
      kind: "blocked",
      player,
      title: "補給站",
      message: "補給站擋在路口。請先購買、出售或離開。\n\n" + formatSupplyStation(player)
    };
  }

  if (player.zone === "undergroundCamp") {
    if (!player.runMode) {
      return {
        kind: "blocked",
        player,
        title: "選擇上挖詞條",
        message: "往上挖前請先從目前顯示的兩個初始詞條中選一個。"
      };
    }
    player.zone = "upward";
    player.caveType = null;
    player.depth = CONFIG.mining.lavaDepth;
    player.nextEventDepth = 4;
    player.eventMissCount = 0;
    player.nextBuffDepth = 5;
    return mineUpward(player, random, now);
  }

  if (player.zone === "skyCamp" || player.zone === "skyDown") {
    player.mines += 1;
    player.stats.totalMines += 1;
    return mineSkyDown(player, random, now);
  }

  if (!player.runMode) {
    return {
      kind: "blocked",
      player,
      title: "選擇下礦方式",
      message: "下礦前請先從目前顯示的兩個初始詞條中選一個。"
    };
  }

  player.mines += 1;
  player.stats.totalMines += 1;
  if (player.zone === "lavaPool") return crossLavaPool(player, random, now);
  if (player.zone === "upward") return mineUpward(player, random, now);
  if (player.caveType === "raptor" && (player.depth || 0) >= RAPTOR_CAVE_MAX_DEPTH) {
    return {
      kind: "blocked",
      player,
      title: "猛禽洞窟底層",
      message: "你已經抵達猛禽洞窟第 50 層。下面只剩灼熱羽灰與鳳凰爪痕，不能再繼續往下，只能返回地面。"
    };
  }
  recordDigPathVisit(player, digPath);
  const mode = getMode(player);
  const depthStep = mode && mode.depthStep ? mode.depthStep : 1;
  const repeatLayer = player.tempEffects.some((effect) => effect.id === "repeat_layer");
  let recordMessage = "";
  if (!repeatLayer) {
    const beforeDepth = player.depth || 0;
    player.depth += depthStep;
    if (player.caveType === "raptor") player.depth = Math.min(RAPTOR_CAVE_MAX_DEPTH, player.depth);
    recordMessage = addRunDepthProgress(player, Math.max(0, player.depth - beforeDepth));
  }
  if (player.depth >= CONFIG.mining.lavaDepth) {
    player.depth = CONFIG.mining.lavaDepth;
    return crossLavaPool(player, random, now);
  }
  if (!recordMessage) recordMessage = setDepthRecord(player);
  const layerEffectMessage = processLayerStartEffects(player, random, now);
  if (player.dead) {
    return {
      kind: "dead",
      player,
      title: "礦坑反噬",
      message: `${layerEffectMessage}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人救援。${recordMessage ? `\n${recordMessage}` : ""}`,
      recordMessage
    };
  }
  const selectedPath = getDigPath(player, digPath);
  if (selectedPath && selectedPath.special === "pit") {
    const outcome = resolvePitDigPath(player, selectedPath, random, now, recordMessage);
    if (layerEffectMessage) outcome.message = `${layerEffectMessage}\n${outcome.message}`;
    return outcome;
  }
  if (player.caveType === "gem") {
    const outcome = mineGemCave(player, random, now, recordMessage, digPath);
    if (layerEffectMessage) outcome.message = `${layerEffectMessage}\n${outcome.message}`;
    return outcome;
  }
  let result = player.forcedNextResult || rollWeighted(getMiningWeights(player, digPath), random);
  player.forcedNextResult = null;
  if (result === "gold_or_ore") result = random() < 0.5 ? "gold" : "ore";
  const gatherMultiplier = mode && mode.gatherMultiplier ? mode.gatherMultiplier : 1;
  const chickenBonus = getChickenMiningBonus(player);
  const goldMultiplier = 1
    + getMinorBuffEffectiveStacks(player, "gold") * CONFIG.minorBuffs.gold.goldMultiplierBonus
    + (mode && mode.goldMultiplierBonus ? mode.goldMultiplierBonus : 0)
    + chickenBonus.goldMultiplierBonus;
  const oreMultiplier = 1
    + (mode && mode.oreRewardMultiplier ? mode.oreRewardMultiplier - 1 : 0)
    + getMinorBuffEffectiveStacks(player, "ore") * CONFIG.minorBuffs.ore.oreMultiplierBonus
    + chickenBonus.oreMultiplierBonus;
  const rewardMultiplier = getEffectMultiplier(player, "rewardMultiplier") * consumeChainBlastReward(player) * getModeRewardMultiplier(player);

  if (result === "gold") {
    const amount = Math.max(1, Math.floor(getGoldAmount(player.depth, random) * gatherMultiplier * goldMultiplier * getTraitGoldMultiplier(player, CONFIG) * digPathRewardMultiplier * rewardMultiplier));
    if (player.runMode === "fireDragonPickaxe") {
      if (getBagFreeSlots(player) <= 0) {
        return {
          kind: "full",
          player,
          title: "包包已滿",
          message: `${pathPrefix}金幣被火龍十字鎬燒成金塊，但包包已滿，放不下。`
        };
      }
      const gained = Math.min(amount, getBagFreeSlots(player));
      player.goldBlock += gained;
      player.lastReward = makeReward("goldBlock", gained);
      return buildOutcome("goldBlock", player, "燒成金塊", `${pathPrefix}火龍十字鎬把金幣燒成 ${gained} 個金塊，會佔包包格子。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`, recordMessage, random);
    }
    player.gold += amount;
    player.lastReward = makeReward("gold", amount, amount);
    onGoldGained(player);
    return buildOutcome("gold", player, "挖到金幣", `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}你挖到了 ${amount} 枚金幣。`, recordMessage, random);
  }

  if (result === "ore") {
    const amount = Math.max(1, Math.floor(getOreAmount(player.depth, random) * gatherMultiplier * digPathRewardMultiplier * rewardMultiplier * oreMultiplier));
    const target = getOreTargetForMode("ore", player);
    const freeAmount = getItemFreeAmount(player, target);
    if (freeAmount <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}你挖到礦石，但包包已滿，放不下。`
      };
    }

    const gained = Math.min(amount, freeAmount);
    player[target] += gained;
    player.lastReward = makeReward(target, gained);
    return buildOutcome(
      target,
      player,
      target === "ore" ? "挖到礦石" : "燒成礦錠",
      `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}你挖到了 ${gained} 塊${getOreName(target)}。返回地面時會自動換成金幣。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`,
      recordMessage,
      random
    );
  }

  if (result === "goldOre" || result === "platinumOre") {
    const amount = Math.max(1, Math.floor(getOreAmount(player.depth, random) * gatherMultiplier * digPathRewardMultiplier * rewardMultiplier * oreMultiplier));
    const target = getOreTargetForMode(result, player);
    const freeAmount = getItemFreeAmount(player, target);
    const name = getOreName(target);
    if (freeAmount <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${pathPrefix}你挖到${name}，但包包已滿，放不下。`
      };
    }

    const gained = Math.min(amount, freeAmount);
    player[target] += gained;
    player.lastReward = makeReward(target, gained);
    return buildOutcome(
      target,
      player,
      `挖到${name}`,
      `${pathPrefix}你挖到了 ${gained} 塊${name}。返回地面時會自動換成高價金幣。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`,
      recordMessage,
      random
    );
  }

  if (result === "rusty") {
    const amount = 1;
    const freeSlots = getBagFreeSlots(player);
    if (freeSlots <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${pathPrefix}你挖到生鏽紀念幣，但 ${getBagCapacity(player)} 格包包已滿，放不下。`
      };
    }

    const gained = Math.min(amount, freeSlots);
    player.rusty += gained;
    return buildOutcome(
      "rusty",
      player,
      "挖到生鏽紀念幣",
      `${pathPrefix}你挖到了 ${gained} 枚本次生鏽紀念幣。離開礦坑會消失，只能先用 \`/除鏽\` 帶走。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`,
      recordMessage,
      random
    );
  }

  if (result === "bomb") {
    if (player.chargeBurst === "safe") {
      player.chargeBurst = null;
      return buildOutcome("empty", player, "穩定爆發", `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}⚡ 穩定爆發吸收了炸彈，這一層沒有受到傷害。`, recordMessage, random);
    }
    if (canSenseDanger(player, random)) {
      return buildOutcome("empty", player, "危險感知", `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}危險感知讓你提前發現炸彈，你繞開了它。`, recordMessage, random);
    }
    if (player.runMode === "silkTouch" && random() < CONFIG.runModes.silkTouch.bombCaptureChance) {
      if (getBagFreeSlots(player) <= 0) {
        return {
          kind: "full",
          player,
          title: "包包已滿",
          message: `${pathPrefix}你完整挖出一顆炸彈，但包包已滿，放不下。`
        };
      }
      player.bombItem += 1;
      return buildOutcome("bombItem", player, "完整挖出炸彈", `${pathPrefix}絲綢之觸讓炸彈沒有爆炸，變成可帶回地表販售的物品。`, recordMessage, random);
    }
    const damageAmount = player.runMode === "fireDragonPickaxe" && random() < CONFIG.runModes.fireDragonPickaxe.megaBombChance ? 2 : 1;
    const damage = addBombDamage(player, now, damageAmount);
    const maxBombs = getMaxBombs(player);
    if (damage.dead) {
      return {
        kind: "dead",
        player,
        title: damageAmount > 1 ? "大爆炸" : "爆炸",
        message: `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}你挖到炸彈，${damageAmount > 1 ? "火龍十字鎬引發大爆炸，" : ""}${damage.message}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人救援。${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }

    return buildOutcome("bomb", player, damageAmount > 1 ? "大爆炸" : "挖到炸彈", `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}${damage.dodged ? damage.message : `你被炸傷了。${damageAmount > 1 ? `大爆炸扣 ${formatHpValue(damage.damage || 1)} 滴血。` : ""}生命損傷 ${formatHpValue(player.bombs)}/${maxBombs}。`}`, recordMessage, random);
  }

  if (result === "stalactite") {
    const damage = blockStalactiteWithHelmet(player) || addBombDamage(player, now, 2);
    if (damage.dead) {
      return {
        kind: "dead",
        player,
        title: "鐘乳石砸落",
        message: `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}鐘乳石從頭頂砸落，扣 ${formatHpValue(damage.damage || 1)} 滴血。${damage.message}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人救援。${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }

    return buildOutcome(
      "stalactite",
      player,
      "鐘乳石砸落",
      damage.helmet
        ? `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}${damage.message}`
        : `${layerEffectMessage ? `${layerEffectMessage}\n` : ""}${pathPrefix}鐘乳石從頭頂砸落，扣 ${formatHpValue(damage.damage || 1)} 滴血。生命損傷 ${formatHpValue(player.bombs)}/${getMaxBombs(player)}。`,
      recordMessage,
      random
    );
  }

  if (result === "junk") {
    if (mode && mode.junkToGold) {
      const amount = Math.max(1, Math.floor(30 * gatherMultiplier * rewardMultiplier));
      player.gold += amount;
      player.lastReward = makeReward("gold", amount, amount);
      onGoldGained(player);
      return buildOutcome("gold", player, "破爛轉金", `${pathPrefix}烤雞餘香把破爛味變成財運，獲得 ${amount} 金幣。`, recordMessage, random);
    }
    const amount = gatherMultiplier;
    const requiredSlots = amount * 3;
    if (getBagFreeSlots(player) < requiredSlots) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${pathPrefix}你挖到 ${amount} 個超級破爛，但它需要 ${requiredSlots} 格包包，放不下。`
      };
    }

    player.junk += amount;
    return buildOutcome(
      "junk",
      player,
      "挖到超級破爛",
      `${pathPrefix}你挖到了 ${amount} 個超級破爛，共佔 ${requiredSlots} 格包包，只能返回地面時丟掉。`,
      recordMessage,
      random
    );
  }

  return buildOutcome("empty", player, "什麼都沒有", `${pathPrefix}這一鏟只有碎石。`, recordMessage, random);
}

function resolveReverseEvent(player, eventId, event, choice, random = Math.random, now = Date.now()) {
  const title = event.title;
  const gain = (key, amount) => addItemReward(player, key, amount);
  const rise = (amount) => {
    player.depth -= amount;
    return `上升 ${amount} 層`;
  };
  const loseGold = (rate) => {
    const lost = Math.min(player.gold, Math.ceil(player.gold * rate));
    player.gold -= lost;
    return lost;
  };
  const takeDamage = (amount) => addBombDamage(player, now, amount).message;

  if (choice === "safe") {
    if (eventId === "sky_light_crack") {
      addTempEffect(player, { id: "safe_sky_light", remaining: 2, rewardMultiplier: 1.15 });
      return { ok: true, player, title, message: "你記住天光的位置，接下來 2 層收益 +15%。" };
    }
    if (eventId === "inverted_merchant") {
      return { ok: true, player, title, message: "你沒有交易。倒置商人慢慢飄遠。" };
    }
    if (eventId === "rising_turbulence" || eventId === "echo_elevator") {
      return { ok: true, player, title, message: `你穩住方向，${rise(1)}。` };
    }
    if (eventId === "mirror_lake") {
      const key = player.invertedGem > 0 ? "invertedGem" : player.invertedOre > 0 ? "invertedOre" : null;
      if (!key) return { ok: true, player, title, message: "湖面很安靜，但你身上沒有可倒映的反轉資源。" };
      const gained = gain(key, 1);
      return { ok: true, player, title, message: `湖面複製出 ${gained} 個${key === "invertedGem" ? "顛倒寶石" : "顛倒礦石"}。` };
    }
    if (eventId === "upside_down_shrine") {
      const healed = healBombDamage(player, 1);
      return { ok: true, player, title, message: healed > 0 ? "神龕垂下光線，回復 1 點生命。" : "神龕很安靜，你已經沒有傷勢。" };
    }
    if (eventId === "skyfall_debris") {
      player.minerHelmetCount = (player.minerHelmetCount || 0) + 1;
      return { ok: true, player, title, message: "你撿到一頂變形但能用的礦工帽。" };
    }
    if (eventId === "void_pocket") {
      player.bagBonusSlots += 1;
      return { ok: true, player, title, message: `你摸到口袋邊緣，本輪包包 +1。目前 ${getBagCapacity(player)} 格。` };
    }
    const gained = gain(eventId === "broken_sky_stone" ? "invertedGem" : "invertedOre", 1);
    return { ok: true, player, title, message: `你穩定採集，獲得 ${gained} 個反轉資源。` };
  }

  if (choice === "extreme") {
    if (eventId === "reverse_gravity_vein") {
      const gained = gain("invertedGem", 2);
      const damage = random() < 0.35 ? `，${takeDamage(1)}` : "";
      return { ok: true, player, title, message: `你跳進反重力礦脈，${rise(4)}，獲得 ${gained} 顆顛倒寶石${damage}` };
    }
    if (eventId === "sky_light_crack") {
      const gained = gain("orichalcum", 2);
      return { ok: true, player, title, message: `你鑽進天光裂縫，${rise(5)}，獲得 ${gained} 塊奧利哈鋼，${takeDamage(1)}` };
    }
    if (eventId === "inverted_merchant") {
      const cost = Math.min(player.invertedOre || 0, 3);
      player.invertedOre -= cost;
      if (cost <= 0) return { ok: true, player, title, message: `你強行交易失敗，倒置商人收走 ${loseGold(0.2)} 金幣。` };
      const gained = gain("orichalcum", 1);
      return { ok: true, player, title, message: `你硬談成交易，交出 ${cost} 塊顛倒礦石，換到 ${gained} 塊奧利哈鋼。` };
    }
    if (eventId === "broken_sky_stone") {
      const gained = gain("invertedGem", 4);
      player.platinumJunk += 1;
      return { ok: true, player, title, message: `你背起天空石核心，獲得 ${gained} 顆顛倒寶石，但多了一個白金破爛。` };
    }
    if (eventId === "rising_turbulence") {
      return { ok: true, player, title, message: `你衝進反轉亂流，${rise(6)}，失去 ${loseGold(0.15)} 金幣。` };
    }
    if (eventId === "mirror_lake") {
      const oreGain = gain("invertedOre", Math.max(1, player.invertedOre || 1));
      const gemGain = gain("invertedGem", Math.max(1, player.invertedGem || 1));
      addTempEffect(player, { id: "mirror_backlash", remaining: 3, hurtChance: 0.18 });
      return { ok: true, player, title, message: `你跳進倒影，複製 ${oreGain} 礦石與 ${gemGain} 寶石，但 3 層內倒影會反咬。` };
    }
    if (eventId === "upside_down_shrine") {
      player.tempMaxHp = (player.tempMaxHp || 0) + 2;
      player.bombs = Math.min(getMaxBombs(player) - 0.5, player.bombs + 0.5);
      return { ok: true, player, title, message: "你拆下神龕，本輪最大生命 +2，但立刻受到半點反噬。" };
    }
    if (eventId === "skyfall_debris") {
      const gained = gain("orichalcum", 3);
      return { ok: true, player, title, message: `你整塊拔出墜天碎片，獲得 ${gained} 塊奧利哈鋼，${takeDamage(2)}` };
    }
    if (eventId === "echo_elevator") {
      addTempEffect(player, { id: "echo_elevator_sick", remaining: 3, emptyWeightMultiplier: 1.25 });
      return { ok: true, player, title, message: `你跳進空井，${rise(8)}，但接下來 3 層更容易挖空。` };
    }
    if (eventId === "void_pocket") {
      player.bagBonusSlots += 6;
      player.platinumJunk += 1;
      return { ok: true, player, title, message: `你背上虛空口袋，本輪包包 +6，但裡面黏著 1 個白金破爛。` };
    }
  }

  if (eventId === "reverse_gravity_vein") {
    const gained = gain("invertedOre", 3);
    if (random() < 0.45) player.depth -= 1;
    return { ok: true, player, title, message: `你追著礦脈採集，獲得 ${gained} 塊顛倒礦石。` };
  }
  if (eventId === "sky_light_crack") {
    if (random() < 0.55) return { ok: true, player, title, message: `你從光縫摸到 ${gain("orichalcum", 1)} 塊奧利哈鋼。` };
    return { ok: true, player, title, message: `光縫割傷了你，${takeDamage(1)}` };
  }
  if (eventId === "inverted_merchant") {
    if ((player.invertedOre || 0) < 2) return { ok: true, player, title, message: "倒置商人想收 2 塊顛倒礦石，但你不夠。" };
    player.invertedOre -= 2;
    const gained = gain("invertedGem", 1);
    return { ok: true, player, title, message: `你交出 2 塊顛倒礦石，換到 ${gained} 顆顛倒寶石。` };
  }
  if (eventId === "broken_sky_stone") {
    const gained = gain("invertedGem", 2);
    player.bagBonusSlots = Math.max(0, player.bagBonusSlots - 1);
    return { ok: true, player, title, message: `你敲下天空石核心，獲得 ${gained} 顆顛倒寶石，但本輪包包 -1。` };
  }
  if (eventId === "rising_turbulence") {
    return { ok: true, player, title, message: `你乘風上升，${rise(3)}，失去 ${loseGold(0.06)} 金幣。` };
  }
  if (eventId === "mirror_lake") {
    if (random() < 0.5) return { ok: true, player, title, message: `倒影成功凝結，獲得 ${gain("invertedGem", 2)} 顆顛倒寶石。` };
    return { ok: true, player, title, message: `倒影碎裂，${takeDamage(1)}` };
  }
  if (eventId === "upside_down_shrine") {
    const key = player.invertedGem > 0 ? "invertedGem" : player.orichalcum > 0 ? "orichalcum" : null;
    if (!key) return { ok: true, player, title, message: "你沒有能獻上的反轉寶物。" };
    player[key] -= 1;
    player.tempMaxHp = (player.tempMaxHp || 0) + 1;
    return { ok: true, player, title, message: "你獻上一份反轉寶物，本輪最大生命 +1。" };
  }
  if (eventId === "skyfall_debris") {
    const gained = random() < 0.65 ? gain("orichalcum", 1) : 0;
    const damage = random() < 0.35 ? `，${takeDamage(1)}` : "";
    return { ok: true, player, title, message: gained > 0 ? `你撬出 ${gained} 塊奧利哈鋼${damage}` : `碎片崩落${damage || "，什麼都沒留下。"}` };
  }
  if (eventId === "echo_elevator") {
    player.nextEventDepth += 4;
    return { ok: true, player, title, message: `你抓住纜繩，${rise(3)}，下一次事件檢查延後。` };
  }
  if (eventId === "void_pocket") {
    player.bagBonusSlots += 3;
    player.junk += 1;
    return { ok: true, player, title, message: `你把口袋塞進背包，本輪包包 +3，但多了一個超級破爛。` };
  }

  const gained = gain("invertedOre", 2);
  return { ok: true, player, title, message: `你處理反轉事件，獲得 ${gained} 塊顛倒礦石。` };
}

function resolveSkyEvent(player, eventId, event, choice, random = Math.random, now = Date.now()) {
  const title = event.title;
  const gain = (key, amount) => addItemReward(player, key, amount);
  const hurt = (amount = 1) => addBombDamage(player, now, amount).message;
  const addGold = (amount) => {
    const gained = Math.max(0, Math.floor(amount));
    player.gold += gained;
    if (gained > 0) onGoldGained(player);
    return gained;
  };
  const addCharge = (amount) => {
    player.chargeValue = Math.min(100, (player.chargeValue || 0) + amount);
    return amount;
  };
  const drift = (amount) => {
    player.depth = Math.min(-1, Math.max(CONFIG.mining.skyDepth, (player.depth || CONFIG.mining.skyDepth) + amount));
    return `高度變為 ${player.depth}`;
  };
  const isChest = eventId.includes("chest");

  if (isChest) {
    if (choice === "safe") {
      if (eventId === "sky_star_chest") {
        addCharge(25);
        return { ok: true, player, title, message: "你只吸走箱縫星光，能量 +25。" };
      }
      const gained = eventId === "sky_thunder_chest" ? addGold(90 + getDepthBonus(Math.abs(player.depth || 0)) * 8) : gain("invertedGem", 1);
      return { ok: true, player, title, message: eventId === "sky_thunder_chest" ? `你等電停後撿到 ${gained} 金幣。` : `你保守開箱，獲得 ${gained} 顆顛倒寶石。` };
    }
    if (choice === "extreme") {
      if (eventId === "sky_thunder_chest") {
        const gained = gain("orichalcum", 2);
        const damage = random() < 0.55 ? `\n${hurt(1)}` : "";
        return { ok: true, player, title, message: `你引雷劈開寶箱，獲得 ${gained} 塊奧利哈鋼。${damage}` };
      }
      if (eventId === "sky_mirage_chest") {
        if (random() < 0.5) {
          player.magicCandy += 1;
          return { ok: true, player, title, message: "三個影子同時碎開，掉出神奇糖果 x1。" };
        }
        return { ok: true, player, title, message: `你砸中假箱，蜃景反咬。\n${hurt(1)}` };
      }
      if (eventId === "sky_feather_chest") {
        player.bagBonusSlots += 3;
        return { ok: true, player, title, message: `你逆羽撕開封印，本輪包包 +3。目前 ${getBagCapacity(player)} 格。` };
      }
      const gained = gain("orichalcum", eventId === "sky_star_chest" ? 2 : 1);
      const damage = random() < 0.35 ? `\n${hurt(1)}` : "";
      return { ok: true, player, title, message: `你強行破箱，獲得 ${gained} 塊奧利哈鋼。${damage}` };
    }
    const roll = random();
    if (roll < 0.45) return { ok: true, player, title, message: `寶箱開出 ${gain("invertedGem", 2)} 顆顛倒寶石。` };
    if (roll < 0.7) return { ok: true, player, title, message: `寶箱開出 ${gain("orichalcum", 1)} 塊奧利哈鋼。` };
    if (roll < 0.85) {
      player.quickChickenBall = (player.quickChickenBall || 0) + 1;
      return { ok: true, player, title, message: "寶箱裡躺著一顆先機球。" };
    }
    return { ok: true, player, title, message: `寶箱陷阱啟動。\n${hurt(1)}` };
  }

  if (choice === "safe") {
    if (eventId === "sky_blue_spring") {
      const healed = healBombDamage(player, 1);
      return { ok: true, player, title, message: healed > 0 ? "你用藍天泉洗傷口，回復 1 點生命。" : "泉水很清，但你沒有傷勢。" };
    }
    if (eventId === "sky_oracle_bird") {
      addTempEffect(player, { id: "oracle_bird", remaining: 3, bombWeightMultiplier: 0.9 });
      return { ok: true, player, title, message: "你聽懂預言鳥的叫聲，接下來 3 層炸彈略降。" };
    }
    if (eventId === "sky_bell_tower") return { ok: true, player, title, message: `你數清鐘聲，${drift(5)}。` };
    if (eventId === "sky_gravity_knot") {
      player.bagBonusSlots += 1;
      return { ok: true, player, title, message: `你解開一小段重力結，本輪包包 +1。目前 ${getBagCapacity(player)} 格。` };
    }
    if (eventId === "sky_feather_courier") {
      player.chickenResearchNotes = player.chickenResearchNotes || {};
      player.chickenResearchNotes.gale = (player.chickenResearchNotes.gale || 0) + 1;
      return { ok: true, player, title, message: "信裡是一張風系養雞小紙條。" };
    }
    const gained = eventId === "sky_star_anvil" || eventId === "sky_meteor_splinter" ? gain("orichalcum", 1) : gain("invertedGem", 1);
    return { ok: true, player, title, message: `你保守採集，獲得 ${gained} 個天域資源。` };
  }

  if (choice === "extreme") {
    if (eventId === "sky_sun_mirror") {
      const gained = gain("orichalcum", 2);
      addTempEffect(player, { id: "sun_mirror_glare", remaining: 3, rewardMultiplier: 1.25, hurtChance: 0.12 });
      return { ok: true, player, title, message: `你直視日輪核心，獲得 ${gained} 塊奧利哈鋼。3 層內收益 +25%，但光灼會反咬。` };
    }
    if (eventId === "sky_cloud_fisher") {
      if (random() < 0.35) {
        player.magicCandy += 1;
        return { ok: true, player, title, message: "你跳上雲竿拉出一顆神奇糖果。" };
      }
      return { ok: true, player, title, message: `魚線斷裂，你被甩回雲道。\n${hurt(1)}` };
    }
    if (eventId === "sky_wind_hole" || eventId === "sky_rainbow_bridge" || eventId === "sky_cloud_whale") {
      const gained = gain("invertedGem", 3);
      return { ok: true, player, title, message: `你冒險穿越天域亂流，獲得 ${gained} 顆顛倒寶石，${drift(10)}。` };
    }
    if (eventId === "sky_meteor_splinter" || eventId === "sky_aurora_mine") {
      const gained = gain("orichalcum", 3);
      return { ok: true, player, title, message: `你抓住天域核心，獲得 ${gained} 塊奧利哈鋼。\n${hurt(1)}` };
    }
    if (eventId === "sky_silent_choir") {
      addCharge(60);
      addTempEffect(player, { id: "choir_overdrive", remaining: 2, rewardMultiplier: 1.35 });
      return { ok: true, player, title, message: "你搶下主旋律，能量 +60，接下來 2 層收益 +35%。" };
    }
    if (eventId === "sky_angel_ladder") {
      const lost = Math.min(player.gold, Math.ceil(player.gold * 0.15));
      player.gold -= lost;
      return { ok: true, player, title, message: `你踢斷天梯換到捷徑，${drift(15)}，掉了 ${lost} 金幣。` };
    }
    if (eventId === "sky_void_sunflower") {
      player.quickChickenBall = (player.quickChickenBall || 0) + 1;
      addTempEffect(player, { id: "void_seed", remaining: 4, emptyWeightMultiplier: 1.2 });
      return { ok: true, player, title, message: "黑色種子開花，吐出先機球 x1，但 4 層內空挖變多。" };
    }
    const gained = gain("invertedGem", 3);
    const damage = random() < 0.35 ? `\n${hurt(1)}` : "";
    return { ok: true, player, title, message: `你押上風險，獲得 ${gained} 顆顛倒寶石。${damage}` };
  }

  if (eventId === "sky_falling_market") {
    const cost = Math.min(player.gold, 120);
    player.gold -= cost;
    player.healingPotion += 1;
    return { ok: true, player, title, message: `你花 ${cost} 金幣搶到治療藥水 x1。` };
  }
  if (eventId === "sky_blue_spring") {
    player.healingPotion += 1;
    return { ok: true, player, title, message: "你裝下一瓶藍天泉，治療藥水 +1。" };
  }
  if (eventId === "sky_glass_mine") {
    addTempEffect(player, { id: "glass_route", remaining: 3, rewardMultiplier: 1.18 });
    return { ok: true, player, title, message: "你切開玻璃礦脈，看見未來路線。3 層收益 +18%。" };
  }
  if (eventId === "sky_moon_moth") {
    player.minorBuffs = player.minorBuffs || {};
    player.minorBuffs.luck = Math.min(8, (player.minorBuffs.luck || 0) + 1);
    return { ok: true, player, title, message: "月光翅粉黏上工具，小型幸運 +1。" };
  }
  if (eventId === "sky_light_vine") {
    const gained = gain("blueGem", 2);
    return { ok: true, player, title, message: `你拉下光藤，獲得 ${gained} 顆藍寶石。` };
  }
  if (eventId === "sky_gravity_knot") {
    player.bagBonusSlots += 3;
    player.junk += 1;
    return { ok: true, player, title, message: `你拉緊重力結，本輪包包 +3，但多了一個超級破爛。` };
  }
  if (eventId === "sky_bell_tower") {
    player.nextEventDepth = Math.max(player.nextEventDepth || 4, (player.depth || 0) + 8);
    return { ok: true, player, title, message: "你敲回鐘聲，下一次事件檢查延後。" };
  }
  const gained = eventId === "sky_star_anvil" || eventId === "sky_meteor_splinter" || eventId === "sky_aurora_mine"
    ? gain("orichalcum", 1 + Math.floor(random() * 2))
    : gain("invertedGem", 2);
  return { ok: true, player, title, message: `你冒險取得 ${gained} 個天域資源。` };
}

function resolveMemoryEvent(player, eventId, event, choice, random = Math.random, now = Date.now()) {
  const challenge = player.memoryChallenge && player.memoryChallenge.eventId === eventId
    ? player.memoryChallenge
    : null;
  player.memoryChallenge = null;

  if (!challenge || !MEMORY_EVENT_CHOICES.includes(choice)) {
    return {
      ok: true,
      player,
      title: event.title,
      message: "記憶回音散掉了，你沒有得到任何東西。"
    };
  }

  if (choice !== challenge.correctChoice) {
    const lostGold = Math.min(player.gold || 0, Math.max(10, Math.floor((player.gold || 0) * 0.12)));
    player.gold = Math.max(0, (player.gold || 0) - lostGold);
    const damage = addBombDamage(player, now);
    const correctOrder = challenge.options && challenge.options[challenge.correctChoice]
      ? challenge.options[challenge.correctChoice].join(" → ")
      : "未知";
    return {
      ok: true,
      player,
      title: event.title,
      message: `順序錯了，機關啟動。正確順序是：${correctOrder}。\n${damage.message}失去 ${lostGold} 金幣。`
    };
  }

  if (event.memoryReward === "ore") {
    const amount = 3 + getDepthBonus(player.depth);
    const reward = addOreReward(player, amount, "ore");
    return {
      ok: true,
      player,
      title: event.title,
      message: `順序正確，測繪圖打開暗格。獲得 ${reward.gained} 塊${getOreName(reward.target)}。`
    };
  }

  if (event.memoryReward === "buff") {
    addTempEffect(player, { id: "memory_focus", remaining: 3, rewardMultiplier: 1.25 });
    player.chargeValue = Math.min(100, (player.chargeValue || 0) + 20);
    return {
      ok: true,
      player,
      title: event.title,
      message: "順序正確，鐵門後方的礦脈共鳴。接下來 3 層收益 +25%，能量 +20。"
    };
  }

  const gold = 80 + Math.max(0, player.depth || 0) * 4;
  player.gold += gold;
  onGoldGained(player);
  return {
    ok: true,
    player,
    title: event.title,
    message: `順序正確，記憶碑吐出金砂。獲得 ${gold} 金幣。`
  };
}

function applyRunModeSwap(player, nextMode) {
  const config = CONFIG.runModes[nextMode];
  if (!config) return false;
  player.runMode = nextMode;
  player.bagBonusSlots = config.bagBonusSlots || 0;
  if (config.extraHp) {
    player.tempMaxHp = Math.max(player.tempMaxHp || 0, config.extraHp);
  }
  return true;
}

function resolveTraitSwapEvent(player, eventId, event, choice, random = Math.random, now = Date.now()) {
  const swap = player.traitSwapEvent;
  const currentMode = player.runMode;
  let offeredMode = swap && CONFIG.runModes[swap.offeredTrait] ? swap.offeredTrait : null;
  if (!offeredMode) {
    const pool = getRunModeIds(false).filter((id) => id !== currentMode && CONFIG.runModes[id]);
    offeredMode = pool[Math.floor(random() * pool.length)] || pool[0] || null;
  }
  const currentLabel = currentMode && CONFIG.runModes[currentMode] ? CONFIG.runModes[currentMode].label : "無詞條";
  const offeredLabel = offeredMode && CONFIG.runModes[offeredMode] ? CONFIG.runModes[offeredMode].label : "未知詞條";
  player.traitSwapEvent = null;

  if (choice === "safe" || !offeredMode) {
    if (eventId === "trait_swap_deep_mirror" && random() < 0.25) {
      const damage = addBombDamage(player, now);
      return {
        ok: true,
        player,
        title: event.title,
        message: `你拒絕重組 build，但鏡像碎片割到你。\n${damage.message}`
      };
    }
    return {
      ok: true,
      player,
      title: event.title,
      message: "你保留目前詞條，事件的光慢慢散去。"
    };
  }

  applyRunModeSwap(player, offeredMode);
  const mutation = (swap && swap.mutation) || event.mutation || "";
  if (choice === "extreme") {
    if (mutation === "polluted") {
      player.traitMutation = { id: "polluted", label: "污染詞條", remaining: 6 };
      addTempEffect(player, { id: "polluted_trait", remaining: 6, rewardMultiplier: 1.55, bombWeightMultiplier: 1.35 });
      return {
        ok: true,
        player,
        title: event.title,
        message: `💀 ${currentLabel} 被污染重組成 ${offeredLabel}。\n接下來 6 層收益 +55%，炸彈 +35%。`
      };
    }
    if (mutation === "inverted") {
      player.traitMutation = { id: "inverted", label: "顛倒變異", remaining: 5 };
      addTempEffect(player, { id: "inverted_trait", remaining: 5, rewardMultiplier: 1.2 });
      player.invertedOre += 2;
      return {
        ok: true,
        player,
        title: event.title,
        message: `🌀 ${currentLabel} 被顛倒成 ${offeredLabel}。\n獲得顛倒礦石 x2，接下來 5 層收益 +20%。`
      };
    }
    if (mutation === "astral") {
      player.traitMutation = { id: "astral", label: "星光變異", remaining: 5 };
      player.orichalcum += 1;
      player.chargeValue = Math.min(100, (player.chargeValue || 0) + 50);
      return {
        ok: true,
        player,
        title: event.title,
        message: `✨ ${currentLabel} 被星光洗成 ${offeredLabel}。\n獲得奧利哈鋼 x1，能量 +50。`
      };
    }

    player.traitMutation = { id: "fusion", label: "融合詞條", remaining: 4 };
    player.minorBuffs.gold = Math.min(8, (player.minorBuffs.gold || 0) + 1);
    player.minorBuffs.ore = Math.min(8, (player.minorBuffs.ore || 0) + 1);
    return {
      ok: true,
      player,
      title: event.title,
      message: `✨ ${currentLabel} 融合重組成 ${offeredLabel}。\n金幣磁條 +1，礦脈磁條 +1。`
    };
  }

  const penalty = random() < 0.25;
  const penaltyText = penalty ? `\n交換震盪讓你掉了 ${Math.min(80, player.gold)} 金幣。` : "";
  if (penalty) player.gold = Math.max(0, player.gold - Math.min(80, player.gold));
  return {
    ok: true,
    player,
    title: event.title,
    message: `你放棄 ${currentLabel}，換成 ${offeredLabel}。${penaltyText}`
  };
}

function resolveRandomEvent(playerInput, choice, random = Math.random, now = Date.now()) {
  const player = getPlayer(playerInput);
  const eventId = player.pendingEvent;
  const event = getRandomEvent(eventId);

  if (!event) {
    return {
      ok: false,
      player,
      title: "沒有事件",
      message: "目前沒有事件需要處理。"
    };
  }

  player.pendingEvent = null;
  player.eventChallenge = null;
  if (!event.traitSwapEvent) player.traitSwapEvent = null;

  if (event.requiresPathHistory) {
    return resolveMemoryEvent(player, eventId, event, choice, random, now);
  }

  if (event.traitSwapEvent) {
    return resolveTraitSwapEvent(player, eventId, event, choice, random, now);
  }

  if (eventId === "cracked_wall") {
    if (choice === "risk") {
      if (random() < 0.6) {
        const amount = 2 + getDepthBonus(player.depth);
        const reward = addOreReward(player, amount, "ore");
        return {
          ok: true,
          player,
          title: event.title,
          message: `你敲開礦牆，拿到 ${reward.gained} 塊${getOreName(reward.target)}。${reward.gained < amount ? "包包不夠，有些放不下。" : ""}`
        };
      }

      const damage = addBombDamage(player, now);
      return {
        ok: true,
        player,
        title: event.title,
        message: `礦牆炸開了。${damage.message}`
      };
    }

    player.depth += 1;
    const recordMessage = setDepthRecord(player);
    return {
      ok: true,
      player,
      title: event.title,
      message: `你繞路前進到第 ${player.depth} 層，沒有獲得資源。${recordMessage ? `\n${recordMessage}` : ""}`
    };
  }

  if (eventId === "collapse_warning") {
    if (choice === "risk") {
      const gold = 15 + getDepthBonus(player.depth) * 5;
      const oreReward = addOreReward(player, 2, "ore");
      player.gold += gold;
      const damage = random() < 0.45 ? addBombDamage(player, now).message : "這次沒有被砸中。";
      return {
        ok: true,
        player,
        title: event.title,
        message: `你硬挖一波，獲得 ${gold} 金幣和 ${oreReward.gained} 塊${getOreName(oreReward.target)}。${damage}`
      };
    }

    return {
      ...returnToSurface(player),
      title: event.title
    };
  }

  if (eventId === "ancient_rust") {
    if (player.rusty <= 0) {
      return {
        ok: false,
        player,
        title: event.title,
        message: "你沒有生鏽紀念幣可以放進機器。"
      };
    }

    if (choice === "risk") {
      player.rusty -= 1;
      if (random() < 0.3) {
        const award = awardRustCollectible(player, random);
        return {
          ok: true,
          player,
          title: event.title,
          message: `舊機器成功啟動，免費除鏽成功：${award.name}。`
        };
      }
      return {
        ok: true,
        player,
        title: event.title,
        message: "舊機器冒煙，生鏽紀念幣損壞了。"
      };
    }

    const cost = 300;
    if (player.gold < cost) {
      return {
        ok: false,
        player,
        title: event.title,
        message: `穩定除鏽需要 ${cost} 金幣，你目前只有 ${player.gold} 金幣。`
      };
    }
    player.gold -= cost;
    player.rusty -= 1;
    if (random() < 0.7) {
      const award = awardRustCollectible(player, random);
      return {
        ok: true,
        player,
        title: event.title,
        message: `你花 ${cost} 金幣穩定除鏽成功：${award.name}。`
      };
    }
    return {
      ok: true,
      player,
      title: event.title,
      message: `你花 ${cost} 金幣，但除鏽失敗，生鏽紀念幣損壞了。`
    };
  }

  if (eventId === "lost_backpack") {
    if (choice === "risk") {
      const roll = random();
      if (roll < 0.35) {
        player.bagBonusSlots += 4;
        return {
          ok: true,
          player,
          title: event.title,
          message: `你翻到可用背包，本次礦坑包包容量 +4，目前 ${getBagCapacity(player)} 格。`
        };
      }

      if (roll < 0.65) {
        const gold = 20 + getDepthBonus(player.depth) * 5;
        const oreReward = addOreReward(player, 2, "ore");
        player.gold += gold;
        return {
          ok: true,
          player,
          title: event.title,
          message: `你翻到補給，獲得 ${gold} 金幣和 ${oreReward.gained} 塊${getOreName(oreReward.target)}。`
        };
      }

      if (roll < 0.78) {
        player.magicCandy += 1;
        return {
          ok: true,
          player,
          title: event.title,
          message: "你翻到一顆被油紙包起來的神奇糖果。"
        };
      }

      if (getBagFreeSlots(player) < 3) {
        return {
          ok: true,
          player,
          title: event.title,
          message: "你翻出一堆超級破爛，但包包已經塞不下，直接丟回原地。"
        };
      }

      player.junk += 1;
      return {
        ok: true,
        player,
        title: event.title,
        message: "你翻到一包超級破爛，佔用 3 格包包。"
      };
    }

    player.bagBonusSlots += 2;
    return {
      ok: true,
      player,
      title: event.title,
      message: `你只拿走能用的背帶，本次礦坑包包容量 +2，目前 ${getBagCapacity(player)} 格。`
    };
  }

  if (eventId === "goblin_purchase") {
    if (choice !== "risk") {
      return {
        ok: true,
        player,
        title: event.title,
        message: "你拒絕地精的收購，牠嘀咕幾句後離開了。"
      };
    }

    const ore = player.ore;
    const goldOre = player.goldOre;
    const platinumOre = player.platinumOre;
    const goldBlock = player.goldBlock;
    const oreIngot = player.oreIngot;
    const goldOreIngot = player.goldOreIngot;
    const platinumOreIngot = player.platinumOreIngot;
    const totalOre = ore + goldOre + platinumOre + goldBlock + oreIngot + goldOreIngot + platinumOreIngot;
    if (totalOre <= 0) {
      return {
        ok: true,
        player,
        title: event.title,
        message: "地精翻了翻你的包包，發現沒有礦石可以收購。"
      };
    }

    player.ore = 0;
    player.goldOre = 0;
    player.platinumOre = 0;
    player.goldBlock = 0;
    player.oreIngot = 0;
    player.goldOreIngot = 0;
    player.platinumOreIngot = 0;

    if (random() < 0.55) {
      const rawMultiplier = player.runMode === "silkTouch" ? CONFIG.runModes.silkTouch.rawGoblinMultiplier : 1;
      const smeltedMultiplier = player.runMode === "fireDragonPickaxe" ? CONFIG.runModes.fireDragonPickaxe.smeltedGoblinMultiplier : 1;
      const payout = Math.floor(
        ore * CONFIG.ore.goldPerOre * 1.35 * rawMultiplier
        + goldOre * CONFIG.ore.goldPerGoldOre * 1.25 * rawMultiplier
        + platinumOre * CONFIG.ore.goldPerPlatinumOre * 1.2 * rawMultiplier
        + goldBlock * CONFIG.ore.goldPerGoldBlock * smeltedMultiplier
        + oreIngot * CONFIG.ore.goldPerOreIngot * smeltedMultiplier
        + goldOreIngot * CONFIG.ore.goldPerGoldOreIngot * smeltedMultiplier
        + platinumOreIngot * CONFIG.ore.goldPerPlatinumOreIngot * smeltedMultiplier
      );
      player.gold += payout;
      return {
        ok: true,
        player,
        title: event.title,
        message: `這次是好地精。牠收走 ${totalOre} 塊礦石，付給你 ${payout} 金幣。`
      };
    }

    const damageMessage = random() < 0.35 ? addBombDamage(player, now).message : "";
    return {
      ok: true,
      player,
      title: event.title,
      message: `這次是壞地精。牠把 ${totalOre} 塊礦石全拿走，沒有付錢。${damageMessage ? `還順手敲了你一下，${damageMessage}` : ""}`
    };
  }

  if (eventId === "cave_roach") {
    if (choice !== "risk") {
      return {
        ok: true,
        player,
        title: event.title,
        message: "你慢慢退開，超大洞穴蟑螂抬頭看了你一眼，沒有追上來。"
      };
    }

    const eatenJunk = player.junk;
    const eatenPlatinumJunk = player.platinumJunk;
    const freedSlots = eatenJunk * 3 + eatenPlatinumJunk * 5;
    player.junk = 0;
    player.platinumJunk = 0;

    if (freedSlots <= 0) {
      return {
        ok: true,
        player,
        title: event.title,
        message: "你摸了摸超大洞穴蟑螂的頭，但身上沒有破爛可以餵。牠看起來有點失望。"
      };
    }

    return {
      ok: true,
      player,
      title: event.title,
      message: `你先摸了摸超大洞穴蟑螂的頭，再把破爛餵給牠。牠吃掉 ${eatenJunk} 個超級破爛和 ${eatenPlatinumJunk} 個白金破爛，包包空出 ${freedSlots} 格。`
    };
  }

  if (eventId === "wild_mine_chicken" || eventId.startsWith("underground_") && eventId.endsWith("_chicken") || eventId.startsWith("sky_") && eventId.endsWith("_chicken")) {
    const encounter = createWildChickenEncounter(player, random);
    if (eventId.startsWith("underground_")) {
      encounter.name = event.title.replace(/^[^\s]+ /, "");
      encounter.icon = eventId.includes("lava") ? "🌋" : eventId.includes("pollution") ? "💀" : "🌀";
      encounter.region = "underground";
      encounter.trait = eventId.includes("pollution") ? "berserk" : eventId.includes("lava") ? "gem" : "speed";
    } else if (eventId.startsWith("sky_")) {
      encounter.name = event.title.replace(/^[^\s]+ /, "");
      encounter.icon = eventId.includes("thunder") ? "⚡" : eventId.includes("cloud") ? "☁️" : "✨";
      encounter.region = "sky";
      encounter.trait = eventId.includes("starlight") ? "luminous" : "speed";
    }
    if (choice === "safe") {
      addWildChickenInfluence(player, encounter, 1);
      player.wildChickenEncounter = null;
      return {
        ok: true,
        player,
        title: event.title,
        message: `${encounter.icon} ${encounter.name} 從岩縫旁探出頭。\n你放牠離開。牠回頭叫了一聲，像是在記住你的味道。`
      };
    }

    if (choice === "risk") {
      if (encounter.raceWeakened) {
        player.pendingEvent = eventId;
        player.wildChickenEncounter = encounter;
        return {
          ok: true,
          player,
          title: event.title,
          message: `${encounter.icon} ${encounter.name} 已經被你跑到喘了。\n現在只能放過，或趁機嘗試捕捉。`
        };
      }
      return resolveWildChickenRace(player, encounter, random, now, eventId);
    }

    if (choice === "extreme" && (encounter.captureConfirm || encounter.raceWeakened)) {
      return attemptCaptureWildChicken(player, encounter, random, eventId);
    }

    const feedKey = player.gourmetFeed > 0 ? "gourmetFeed" : player.normalFeed > 0 ? "normalFeed" : "";
    if (!feedKey) {
      if (choice === "extreme" && player.ownedChicken) {
        return attemptCaptureWildChicken(player, encounter, random, eventId);
      }
      addWildChickenInfluence(player, encounter, 1);
      player.wildChickenEncounter = null;
      return {
        ok: true,
        player,
        title: event.title,
        message: `${encounter.icon} ${encounter.name} 靠近你的礦袋。\n你伸手嘗試互動，但身上沒有飼料。牠留下幾根羽毛後跑走。`
      };
    }

    player[feedKey] -= 1;
    const roll = random();
    addWildChickenInfluence(player, encounter, feedKey === "gourmetFeed" ? 2 : 1);
    if (roll < (feedKey === "gourmetFeed" ? 0.42 : 0.25)) {
      const drops = awardWildChickenDrop(player, encounter, random);
      player.wildChickenEncounter = null;
      return {
        ok: true,
        player,
        title: event.title,
        announcement: encounter.rare ? `🌌 傳說中的「${encounter.name}」接受了 <@PLAYER> 的餵食！` : "",
        message: `${encounter.icon} ${encounter.name} 吃下飼料，友善地蹭了蹭你的手。\n牠留下：${drops.join("｜")}`
      };
    }

    if (roll < 0.72) {
      return resolveWildChickenRace(player, encounter, random, now);
    }

    const damageText = encounter.trait === "berserk" ? `\n牠反而暴走，${addBombDamage(player, now).message}` : "";
    player.wildChickenEncounter = null;
    return {
      ok: true,
      player,
      title: event.title,
      message: `${encounter.icon} ${encounter.name} 嗅了嗅飼料，突然受驚逃跑。${damageText}`
    };
  }

  if (event.skyOnly && !event.forceEvacuation) return resolveSkyEvent(player, eventId, event, choice, random, now);

  if (isForceEvacuationEventId(eventId)) return resolveForceEvacuation(player, eventId, event, choice, random, now);

  if (eventId === "unstable_powder") {
    if (choice === "safe") {
      addTempEffect(player, { id: "powder_safe", remaining: 3, bombWeightMultiplier: 0.85 });
      return { ok: true, player, title: event.title, message: "你繞開火藥堆，接下來 3 層炸彈權重 -15%。" };
    }
    if (choice === "extreme") {
      const damage = addBombDamage(player, now);
      addTempEffect(player, { id: "powder_extreme", remaining: 3, rewardMultiplier: 1.8, bombWeightMultiplier: 1.4 });
      return { ok: true, player, title: event.title, message: `你點燃火藥衝刺，${damage.message}接下來 3 層收益 +80%，炸彈 +40%。` };
    }
    if (random() < 0.5) {
      const gold = 30 + getDepthBonus(player.depth) * 10;
      const ore = addOreReward(player, 2 + getDepthBonus(player.depth)).gained;
      player.gold += gold;
      return { ok: true, player, title: event.title, message: `你拆出資源，獲得 ${gold} 金幣和 ${ore} 塊礦石。` };
    }
    const damage = addBombDamage(player, now);
    return { ok: true, player, title: event.title, message: `火藥直接炸開，${damage.message}` };
  }

  if (eventId === "underground_stream") {
    if (choice === "safe") {
      addTempEffect(player, { id: "stream_safe", remaining: 3, emptyWeightMultiplier: 1.2 });
      return { ok: true, player, title: event.title, message: "你沿水繞路，接下來 3 層空挖 +20%。" };
    }
    if (choice === "extreme") {
      addTempEffect(player, { id: "stream_extreme", remaining: 3, rewardMultiplier: 1.4, hurtChance: 0.25 });
      return { ok: true, player, title: event.title, message: "你衝進水脈，接下來 3 層收益 +40%，每層 25% 扣血。" };
    }
    player.forcedNextResult = "gold_or_ore";
    return { ok: true, player, title: event.title, message: "你順著水脈開挖，下一層必出金幣或礦石。" };
  }

  if (eventId === "miner_remains") {
    if (choice === "safe") {
      const healed = healBombDamage(player, 1);
      return { ok: true, player, title: event.title, message: healed > 0 ? "你找到急救品，回復 1 點生命。" : "你找到急救品，但生命已滿。" };
    }
    if (choice === "extreme") {
      player.bagBonusSlots += 2;
      addTempEffect(player, { id: "remains_extreme", remaining: 3, junkWeightMultiplier: 1.6 });
      return { ok: true, player, title: event.title, message: `你背上殘骸包，包包 +2，接下來 3 層破爛 +60%。目前 ${getBagCapacity(player)} 格。` };
    }
    const roll = random();
    if (roll < 0.5) {
      const gold = 25 + getDepthBonus(player.depth) * 8;
      player.gold += gold;
      return { ok: true, player, title: event.title, message: `你翻到資源，獲得 ${gold} 金幣。` };
    }
    if (roll < 0.62) {
      player.magicCandy += 1;
      return { ok: true, player, title: event.title, message: "你在礦工口袋裡找到神奇糖果 +1。" };
    }
    if (getBagFreeSlots(player) >= 3) player.junk += 1;
    return { ok: true, player, title: event.title, message: "你翻到一包超級破爛。" };
  }

  if (eventId === "magnetic_anomaly") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你遠離磁場，沒有發生任何事。" };
    if (choice === "extreme") {
      addTempEffect(player, { id: "magnetic_extreme", remaining: 1, rewardMultiplier: 2 });
      player.forcedNextResult = "bomb";
      return { ok: true, player, title: event.title, message: "你衝進磁場中心，下一層收益 x2，但下一次必出炸彈。" };
    }
    addTempEffect(player, { id: "magnetic_risk", remaining: 3, goldWeightMultiplier: 1.4 });
    return { ok: true, player, title: event.title, message: "你追著金光走，接下來 3 層金幣權重 +40%。" };
  }

  if (eventId === "crack_whisper") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你不理會低語，繼續前進。" };
    if (choice === "extreme") {
      player.depth += 2;
      const damage = addBombDamage(player, now);
      addTempEffect(player, { id: "whisper_extreme", remaining: 3, bombWeightMultiplier: 1.25 });
      return { ok: true, player, title: event.title, message: `你跳入裂縫前進到第 ${player.depth} 層，${damage.message}接下來 3 層炸彈 +25%。` };
    }
    player.digPathOptions = refreshDigPathOptions(player, random).digPathOptions;
    const sideLabels = { left: "左", middle: "中", right: "右" };
    const options = getDigPathOptions(player).map((path) => `${sideLabels[path.side] || "路"}:${path.label}`).join("｜");
    return { ok: true, player, title: event.title, message: `低語顯示下一層路線：${options}。` };
  }

  if (eventId === "lost_supply_cache") {
    if (choice === "safe") {
      const healed = healBombDamage(player, 1);
      return { ok: true, player, title: event.title, message: healed > 0 ? "你拿到急救品，回復 1 點生命。" : "你拿到急救品，但生命已滿。" };
    }
    if (choice === "extreme") {
      player.bagBonusSlots += 4;
      if (getBagFreeSlots(player) >= 3) player.junk += 1;
      return { ok: true, player, title: event.title, message: `你整箱扛走，包包 +4，並加入 1 個超級破爛。目前 ${getBagCapacity(player)} 格。` };
    }
    const roll = random();
    if (roll < 0.34) {
      const gold = 30 + getDepthBonus(player.depth) * 10;
      player.gold += gold;
      return { ok: true, player, title: event.title, message: `你找到資源，獲得 ${gold} 金幣。` };
    }
    if (roll < 0.67) {
      player.bagBonusSlots += 2;
      return { ok: true, player, title: event.title, message: `你找到備用袋，包包 +2，目前 ${getBagCapacity(player)} 格。` };
    }
    if (roll < 0.82) {
      player.magicCandy += 1;
      return { ok: true, player, title: event.title, message: "你翻到密封補給：神奇糖果 +1。" };
    }
    if (getBagFreeSlots(player) >= 3) player.junk += 1;
    return { ok: true, player, title: event.title, message: "你撬出一包超級破爛。" };
  }

  if (eventId === "explosive_core") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你標記礦核後離開，沒有觸發爆炸。" };
    if (choice === "extreme") {
      addTempEffect(player, { id: "core_extreme", remaining: 1, rewardMultiplier: 2 });
      addTempEffect(player, { id: "core_bomb", remaining: 2, bombWeightMultiplier: 1.5 });
      return { ok: true, player, title: event.title, message: "你強挖核心，本層收益 x2，接下來 2 層炸彈 +50%。" };
    }
    const oreKind = player.depth >= 30 ? "platinumOre" : "goldOre";
    const reward = addOreReward(player, 1 + getDepthBonus(player.depth), oreKind);
    return { ok: true, player, title: event.title, message: `你小心採集，獲得 ${reward.gained} 塊${getOreName(reward.target)}。` };
  }

  if (eventId === "corrosive_gas") {
    if (choice === "safe") return { ...returnToSurface(player), title: event.title };
    if (choice === "extreme") {
      addTempEffect(player, { id: "gas_extreme", remaining: 4, rewardMultiplier: 1.6, hurtChance: 0.2 });
      return { ok: true, player, title: event.title, message: "你硬闖毒霧，接下來 4 層收益 +60%，每層 20% 扣血。" };
    }
    const message = random() < 0.5 ? "你摀住口鼻通過，這次沒事。" : `你吸入腐蝕氣體，${addBombDamage(player, now).message}`;
    return { ok: true, player, title: event.title, message };
  }

  if (eventId === "goblin_black_market") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你離開黑市，沒有交易。" };
    if (choice === "extreme") {
      if (random() < 0.5) {
        const gold = 120 + player.depth * 8;
        player.gold += gold;
        return { ok: true, player, title: event.title, message: `你豪賭成功，獲得 ${gold} 金幣。` };
      }
      return { ok: true, player, title: event.title, message: `你豪賭失敗，${addBombDamage(player, now, 2).message}` };
    }
    if (random() < 0.6) {
      const gold = 45 + player.depth * 4;
      player.gold += gold;
      return { ok: true, player, title: event.title, message: `黑市交易成功，賺到 ${gold} 金幣。` };
    }
    const stolen = Math.min(player.gold, 40 + getDepthBonus(player.depth) * 10);
    player.gold -= stolen;
    return { ok: true, player, title: event.title, message: `你被地精搶走 ${stolen} 金幣。` };
  }

  if (eventId === "time_dislocation") {
    if (choice === "risk") {
      player.depth += 3;
      const recordMessage = setDepthRecord(player);
      return { ok: true, player, title: event.title, message: `時間快進，你直接抵達第 ${player.depth} 層。${recordMessage}` };
    }
    if (choice === "extreme") {
      addTempEffect(player, { id: "repeat_layer", remaining: 1 });
      return { ok: true, player, title: event.title, message: "時間折返，下一次挖礦會重複當前層。" };
    }
    return { ok: true, player, title: event.title, message: "你穩住時間感，正常繼續挖。" };
  }

  if (eventId === "ancient_curse") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你立刻退開，避開了詛咒。" };
    if (choice === "extreme") {
      const damage = addBombDamage(player, now);
      addTempEffect(player, { id: "ancient_curse", remaining: 4 });
      return { ok: true, player, title: event.title, message: `你破壞遺跡，${damage.message}古代詛咒纏身，4 層內不能返回地表。` };
    }
    addTempEffect(player, { id: "ancient_curse", remaining: 4 });
    return { ok: true, player, title: event.title, message: "古代詛咒纏上你，接下來 4 層內不能主動返回地表。" };
  }

  if (eventId === "ancient_blessing") {
    const roll = random();
    if (roll < 0.4) {
      const gold = 80 + player.depth * 5;
      player.gold += gold;
      return { ok: true, player, title: event.title, message: `古代祝福賜予你 ${gold} 金幣。` };
    }
    const gem = roll < 0.6 ? "redGem" : roll < 0.8 ? "blueGem" : "greenGem";
    player[gem] += 1;
    const name = gem === "redGem" ? "紅寶石" : gem === "blueGem" ? "藍寶石" : "綠寶石";
    return { ok: true, player, title: event.title, message: `古代祝福賜予你 1 顆${name}。` };
  }

  if (eventId === "scrap_recycler") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你沒有出售廢品。" };
    const soldJunk = player.junk;
    const soldPlatinumJunk = player.platinumJunk;
    const payout = soldJunk * 20 + soldPlatinumJunk * 40;
    player.junk = 0;
    player.platinumJunk = 0;
    player.gold += payout;
    return { ok: true, player, title: event.title, message: `回收商收走 ${soldJunk} 個超級破爛和 ${soldPlatinumJunk} 個白金破爛，支付 ${payout} 金幣。` };
  }

  if (eventId === "life_spring") {
    const healed = healBombDamage(player, choice === "extreme" ? 2 : 1);
    return { ok: true, player, title: event.title, message: healed > 0 ? `生命之泉回復 ${healed} 點生命。` : "生命之泉很溫暖，但你生命已滿。" };
  }

  if (eventId === "life_altar") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你離開生命祭壇。" };
    const gem = consumeRandomGem(player, random);
    if (!gem) return { ok: false, player, title: event.title, message: "你沒有寶石可以獻上。" };
    if (random() < 0.5) {
      player.tempMaxHp = (player.tempMaxHp || 0) + 2;
      healBombDamage(player, 2);
      return { ok: true, player, title: event.title, message: `你獻上${gem.name}，獲得生命祝福：本輪最大生命 +2，目前生命也回復 2。` };
    }
    player.returnBlessing = true;
    return { ok: true, player, title: event.title, message: `你獻上${gem.name}，獲得歸還祝福：本輪死亡時會返回地表並損失身上金幣 1/2。` };
  }

  if (eventId === "gambler") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你拒絕賭局。" };
    const wager = Math.min(200, Math.floor(player.gold / 2));
    if (wager <= 0) return { ok: false, player, title: event.title, message: "你沒有足夠金幣下注。" };
    player.gold -= wager;
    if (random() < 0.5) {
      player.gold += wager * 2;
      return { ok: true, player, title: event.title, message: `你下注 ${wager} 金幣並獲勝，拿回 ${wager * 2} 金幣。` };
    }
    return { ok: true, player, title: event.title, message: `你下注 ${wager} 金幣但輸了。` };
  }

  if (eventId === "gold_eater") {
    if (choice === "safe") return { ok: true, player, title: event.title, message: "你沒有餵食吞金獸。" };
    if (player.gold <= 0) return { ok: false, player, title: event.title, message: "你身上沒有金幣可以餵。" };
    player.goldBeast = { amount: player.gold, returnDepth: player.depth + 8 };
    player.hasSeenGoldenBeast = true;
    const fed = player.gold;
    player.gold = 0;
    return { ok: true, player, title: event.title, message: `你餵給吞金獸 ${fed} 金幣。牠會在第 ${player.goldBeast.returnDepth} 層回來。\n你感覺牠不會再回來了…` };
  }

  if (eventId === "treasure_chest") {
    const chest = resolveTreasureChest(player, choice, random, now);
    return { ok: true, player: chest.player, title: event.title, message: chest.message };
  }

  if (event.caveType === "gem") {
    if (choice === "safe") {
      const healed = ["sapphire_spring", "gem_altar"].includes(eventId) ? healBombDamage(player, 1) : 0;
      if (healed > 0) return { ok: true, player, title: event.title, message: "你保守處理，回復 1 點生命。" };
      const gem = eventId.includes("ruby") ? "redGem" : eventId.includes("sapphire") ? "blueGem" : "greenGem";
      addItemReward(player, gem, 1);
      return { ok: true, player, title: event.title, message: `你保守採集，獲得 1 顆${gem === "redGem" ? "紅寶石" : gem === "blueGem" ? "藍寶石" : "綠寶石"}。` };
    }
    if (choice === "extreme") {
      addTempEffect(player, { id: `gem_${eventId}`, remaining: 3, rewardMultiplier: 1.8, hurtChance: 0.25 });
      if (random() < 0.35) addBombDamage(player, now, 1);
      return { ok: true, player, title: event.title, message: "你強行引爆晶核，接下來 3 層寶石收益大幅提高，但每層可能受傷。" };
    }
    const roll = random();
    if (roll < 0.55) {
      const gems = ["redGem", "blueGem", "greenGem"];
      const key = gems[Math.floor(random() * gems.length)];
      const amount = eventId === "rainbow_node" ? 3 : 2;
      const gained = addItemReward(player, key, amount);
      return { ok: true, player, title: event.title, message: `冒險成功，獲得 ${gained} 顆寶石。` };
    }
    if (roll < 0.8) {
      const damage = addBombDamage(player, now, eventId === "stalactite_rain" ? 2 : 1);
      return { ok: true, player, title: event.title, message: `寶石洞窟反噬，${damage.message}` };
    }
    if (getBagFreeSlots(player) >= 5) player.platinumJunk += 1;
    return { ok: true, player, title: event.title, message: "你翻出白金破爛，佔用 5 格包包。" };
  }

  if (event.highTier) {
    const wager = Math.min(player.gold, Math.max(100, Math.floor(player.gold * (choice === "extreme" ? 0.35 : 0.18))));
    if (choice === "safe") {
      addTempEffect(player, { id: `high_safe_${eventId}`, remaining: 2, bombWeightMultiplier: 0.95 });
      return { ok: true, player, title: event.title, message: "你保守離開，地層壓力稍微下降 2 層。" };
    }
    if (wager <= 0) return { ok: false, player, title: event.title, message: "你身上金幣不足，無法簽下上位契約。" };
    player.gold -= wager;
    const successRate = choice === "extreme" ? 0.42 : 0.62;
    if (random() < successRate) {
      const payout = Math.floor(wager * (choice === "extreme" ? 3.2 : 2));
      player.gold += payout;
      addTempEffect(player, { id: `high_${eventId}`, remaining: 4, rewardMultiplier: choice === "extreme" ? 1.7 : 1.35, bombWeightMultiplier: choice === "extreme" ? 1.35 : 1.15 });
      if (eventId === "abyss_insurance") player.returnBlessing = true;
      if (eventId === "astral_invitation") player.orichalcum += 1;
      return { ok: true, player, title: event.title, message: `上位契約成功，押金 ${wager} 換回 ${payout} 金幣，並獲得 4 層高收益高風險效果。` };
    }
    const damage = random() < 0.5 ? addBombDamage(player, now, choice === "extreme" ? 2 : 1).message : "";
    return { ok: true, player, title: event.title, message: `契約失敗，損失 ${wager} 金幣。${damage}` };
  }

  if (event.reverseOnly) {
    return resolveReverseEvent(player, eventId, event, choice, random, now);
  }

  const newNormalEvents = new Set([
    "lost_miner", "broken_lift", "glowing_moss", "black_vein", "underground_echo",
    "blaster_relic", "minecart_wreck", "ancient_mark", "deep_airflow", "rusty_safe",
    "cave_vendor", "dark_fissure", "vein_resonance", "sudden_cavein", "runaway_lamp"
  ]);
  if (newNormalEvents.has(eventId)) {
    if (choice === "safe") {
      if (eventId === "underground_echo") {
        player.digPathOptions = refreshDigPathOptions(player, random).digPathOptions;
        return { ok: true, player, title: event.title, message: "你聽聲辨位，看清了下一層左右路線。" };
      }
      addTempEffect(player, { id: `safe_${eventId}`, remaining: 3, bombWeightMultiplier: 0.92, emptyWeightMultiplier: 1.08 });
      return { ok: true, player, title: event.title, message: "你選擇保守處理，接下來 3 層稍微安全，但空挖變多。" };
    }
    if (choice === "extreme") {
      addTempEffect(player, { id: `extreme_${eventId}`, remaining: 3, rewardMultiplier: 1.65, bombWeightMultiplier: 1.35 });
      const damage = random() < 0.35 ? addBombDamage(player, now).message : "";
      return { ok: true, player, title: event.title, message: `你選擇極端處理，接下來 3 層收益 +65%、炸彈 +35%。${damage}` };
    }
    const roll = random();
    if (eventId === "broken_lift" || eventId === "deep_airflow") {
      const shift = roll < 0.65 ? 2 : -1;
      const moved = moveNormalMineDepth(player, shift);
      const failMessage = shift < 0 ? "升降機突然下墜又卡住，你退回較淺的礦道。" : "升降機搖晃著往深處滑行。";
      return {
        ok: true,
        player,
        title: event.title,
        message: `${failMessage}礦道位移到第 ${player.depth} 層。${moved.transitionMessage}${moved.progressMessage}`
      };
    }
    if (eventId === "rusty_safe" && getBagFreeSlots(player) > 0) {
      player.rusty += 1;
      return { ok: true, player, title: event.title, message: "保險箱裡掉出 1 枚生鏽紀念幣。" };
    }
    if (roll < 0.55) {
      const reward = addOreReward(player, 2 + getDepthBonus(player.depth), player.depth >= 30 ? "platinumOre" : player.depth >= 15 ? "goldOre" : "ore");
      const gold = 20 + getDepthBonus(player.depth) * 8;
      player.gold += gold;
      return { ok: true, player, title: event.title, message: `冒險成功，獲得 ${gold} 金幣和 ${reward.gained} 塊${getOreName(reward.target)}。` };
    }
    const damage = addBombDamage(player, now);
    if (getBagFreeSlots(player) >= 3) player.junk += 1;
    return { ok: true, player, title: event.title, message: `冒險失敗，翻出超級破爛。${damage.message}` };
  }

  return {
    ok: false,
    player,
    title: event.title,
    message: "這個事件還沒有可用選項。"
  };
}

function summarizeCollectibles(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.id, {
      item,
      count: (counts.get(item.id) ? counts.get(item.id).count : 0) + 1
    });
  }

  return [...counts.values()]
    .map(({ item, count }) => `${item.name}（${item.rarity}）x${count}`)
    .join("、");
}

function exchange(playerInput, amount = 1, random = Math.random) {
  const player = getPlayer(playerInput);
  const safeAmount = Math.max(1, Math.floor(amount));
  const cost = safeAmount * CONFIG.exchange.goldPerCommemorative;

  if (player.gold < cost) {
    return {
      ok: false,
      player,
      message: `金幣不足。兌換 ${safeAmount} 枚紀念幣需要 ${cost} 金幣。`
    };
  }

  const awards = [];
  for (let i = 0; i < safeAmount; i += 1) {
    const award = awardCollectible(player, random);
    if (award) awards.push(award);
  }

  const actualCost = awards.length * CONFIG.exchange.goldPerCommemorative;
  player.gold -= actualCost;

  return {
    ok: true,
    player,
    awards,
    message: `成功用 ${actualCost} 金幣鑄造 ${awards.length} 枚紀念幣：${summarizeCollectibles(awards)}。`
  };
}

function buyShopItem(playerInput, itemId, amount = 1, progressInput = {}) {
  const player = getPlayer(playerInput);
  const requestedAmount = Math.max(1, Math.floor(amount));
  const progress = { ...progressInput };
  const now = progress.now || Date.now();
  const globalState = progress.globalState ? normalizeGlobalState(progress.globalState, now) : null;
  const shopItem = getShopItems().find((item) => item.id === itemId);
  const consumable = getShopConsumables(progressInput).find((item) => item.id === itemId);

  if (isInMine(player)) {
    return {
      ok: false,
      player,
      message: "商店只能在地表使用。"
    };
  }

  if (!shopItem && !consumable) {
    return {
      ok: false,
      player,
      message: "商店沒有這個商品，或共同任務尚未解鎖。"
    };
  }

  const oneOnlyItems = new Set(["magicCandy", "normalFeed", "gourmetFeed", "chickenMedicine", "autoCleaner"]);
  const safeAmount = (shopItem || oneOnlyItems.has(itemId)) ? 1 : requestedAmount;
  const label = shopItem ? shopItem.collectible.name : consumable.label;
  const priceGold = itemId === "magicCandy" ? getMagicCandyPrice(player) : (shopItem ? shopItem.priceGold : consumable.priceGold);
  const cost = priceGold * safeAmount;
  if (itemId === "healingPotion") {
    if ((player.thickSoleShoes || 0) > 0) {
      return {
        ok: false,
        player,
        globalState,
        message: "❌ 你無法同時攜帶藥水與厚底鞋。"
      };
    }
    normalizePotionDailyLimit(player, now);
    const dailyLimit = CONFIG.shop.consumables.healingPotion.dailyLimit;
    if ((player.potionPurchasesToday || 0) + safeAmount > dailyLimit) {
      return {
        ok: false,
        player,
        globalState,
        message: `你今天的治療藥水購買上限是 ${dailyLimit} 瓶，目前已買 ${player.potionPurchasesToday || 0} 瓶。`
      };
    }
  }
  if (itemId === "magicCandy") {
    normalizeMagicCandyDailyLimit(player, now);
    const dailyLimit = CONFIG.shop.consumables.magicCandy.dailyLimit;
    if ((player.magicCandyPurchasesToday || 0) + safeAmount > dailyLimit) {
      return {
        ok: false,
        player,
        globalState,
        message: `你今天的神奇糖果購買上限是 ${dailyLimit} 顆，目前已買 ${player.magicCandyPurchasesToday || 0} 顆。`
      };
    }
  }
  if (itemId === "undyingTotem") {
    normalizeTotemDailyLimit(player, now);
    const dailyLimit = CONFIG.shop.consumables.undyingTotem.dailyLimit;
    if ((player.dailyTotemPurchaseCount || 0) + safeAmount > dailyLimit) {
      return {
        ok: false,
        player,
        globalState,
        message: `❌ 今日不死圖騰已達購買上限（${player.dailyTotemPurchaseCount || 0}/${dailyLimit}）`
      };
    }
  }
  if (player.gold < cost) {
    return {
      ok: false,
      player,
      globalState,
      message: `金幣不足。購買 ${safeAmount} 個${label}需要 ${cost} 金幣。`
    };
  }

  player.gold -= cost;
  if (shopItem) player.collection[itemId] = (player.collection[itemId] || 0) + safeAmount;
  else {
    player[itemId] = (player[itemId] || 0) + safeAmount;
    if (itemId === "healingPotion") player.potionPurchasesToday = (player.potionPurchasesToday || 0) + safeAmount;
    if (itemId === "magicCandy") player.magicCandyPurchasesToday = (player.magicCandyPurchasesToday || 0) + safeAmount;
    if (itemId === "undyingTotem") player.dailyTotemPurchaseCount = (player.dailyTotemPurchaseCount || 0) + safeAmount;
  }

  return {
    ok: true,
    player,
    globalState,
    message: `成功花費 ${cost} 金幣購買 ${safeAmount} 個${label}。`
  };
}

function shimmerCollectible(playerInput, firstItemId, secondItemId = null, random = Math.random) {
  const player = getPlayer(playerInput);
  const cost = CONFIG.shop.shimmerPool.costGold;
  if (typeof secondItemId === "function" && random === Math.random) {
    random = secondItemId;
    secondItemId = null;
  }
  const itemIds = Array.isArray(firstItemId) ? firstItemId : [firstItemId, secondItemId].filter(Boolean);
  const [firstId, secondId] = itemIds;
  const firstSource = getCollectible(firstId);
  const secondSource = getCollectible(secondId);

  if (isInMine(player)) {
    return {
      ok: false,
      player,
      award: null,
      message: "微光池只能在地表使用。"
    };
  }

  if (!firstSource || !secondSource) {
    return {
      ok: false,
      player,
      award: null,
      message: "微光池需要選擇兩枚存在的紀念幣。"
    };
  }

  if (firstId === secondId && (player.collection[firstId] || 0) < 2) {
    return {
      ok: false,
      player,
      award: null,
      message: `你只有 1 枚 ${firstSource.name}，不能同一枚投入兩次。`
    };
  }

  if ((player.collection[firstId] || 0) <= 0 || (player.collection[secondId] || 0) <= 0) {
    return {
      ok: false,
      player,
      award: null,
      message: "你沒有足夠的紀念幣可以投入微光池。"
    };
  }

  if (player.gold < cost) {
    return {
      ok: false,
      player,
      award: null,
      message: `微光池需要 ${cost} 金幣，你目前只有 ${player.gold} 金幣。`
    };
  }

  const pool = CONFIG.collectibles.filter((item) => {
    if (item.id === firstId || item.id === secondId) return false;
    if (item.shopOnly) return random() < 0.12;
    if (item.rustOnly) return random() < 0.28;
    return true;
  });
  const fallbackPool = CONFIG.collectibles.filter((item) => item.id !== firstId && item.id !== secondId);
  const awardPool = pool.length > 0 ? pool : fallbackPool;
  const award = awardPool[Math.floor(random() * awardPool.length)] || firstSource;
  player.gold -= cost;
  player.collection[firstId] -= 1;
  if (player.collection[firstId] <= 0) delete player.collection[firstId];
  player.collection[secondId] -= 1;
  if (player.collection[secondId] <= 0) delete player.collection[secondId];
  player.collection[award.id] = (player.collection[award.id] || 0) + 1;

  return {
    ok: true,
    player,
    award,
    message: `【微光池】\n投入：${firstSource.name}、${secondSource.name}\n✨ 微光融合！\n花費 ${cost} 金幣，獲得「${award.name}」。`
  };
}

function drinkHealingPotion(playerInput) {
  const player = getPlayer(playerInput);
  if (!player.runMode || player.dead) {
    return {
      ok: false,
      player,
      message: "治療藥水只能在礦坑內存活時使用。"
    };
  }
  if (player.healingPotion <= 0) {
    return {
      ok: false,
      player,
      message: "你沒有治療藥水。"
    };
  }
  if ((player.potionCooldown || 0) > 0) {
    return {
      ok: false,
      player,
      message: `🧪 藥水還未恢復效果。\n剩餘冷卻：${player.potionCooldown} 層`
    };
  }
  if (player.bombs <= 0) {
    return {
      ok: false,
      player,
      message: "你目前生命值是滿的，先不要浪費藥水。"
    };
  }

  const healed = Math.min(player.bombs, CONFIG.shop.consumables.healingPotion.healBombs);
  player.healingPotion -= 1;
  player.bombs -= healed;
  player.potionCooldown = CONFIG.shop.consumables.healingPotion.cooldownLayers;
  return {
    ok: true,
    player,
    message: `喝下治療藥水，恢復 ${healed} 滴血。`
  };
}

function removeRust(playerInput, amount = 1, random = Math.random) {
  const player = getPlayer(playerInput);
  const safeAmount = Math.max(1, Math.floor(amount));
  const option = CONFIG.rustRemoval.default;
  const cost = safeAmount * option.costGold;

  if (player.rusty < safeAmount) {
    return {
      ok: false,
      player,
      message: `生鏽錢幣不足。你只有 ${player.rusty} 枚。`
    };
  }

  if (player.gold < cost) {
    return {
      ok: false,
      player,
      message: `${option.label} ${safeAmount} 枚需要 ${cost} 金幣。`
    };
  }

  player.rusty -= safeAmount;
  player.gold -= cost;

  let success = 0;
  let broken = 0;
  const awards = [];
  for (let i = 0; i < safeAmount; i += 1) {
    if (random() < option.successRate) {
      const award = awardRustCollectible(player, random);
      if (award) {
        success += 1;
        awards.push(award);
      } else {
        broken += 1;
      }
    } else {
      broken += 1;
    }
  }

  return {
    ok: true,
    player,
    awards,
    message: `${option.label}完成：成功 ${success} 枚，損壞 ${broken} 枚，花費 ${cost} 金幣。${awards.length ? `獲得：${summarizeCollectibles(awards)}。` : ""}`
  };
}

function eatMagicCandy(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  if (player.magicCandy <= 0) {
    return {
      ok: false,
      player,
      message: "你沒有神奇糖果。"
    };
  }
  if (!player.ownedChicken) {
    return {
      ok: false,
      player,
      message: "你目前沒有自己的雞可以吃糖果。"
    };
  }
  player.magicCandy -= 1;
  const needed = getChickenRequiredExp(player.ownedChicken);
  const beforeLevel = player.ownedChicken.level || 1;
  const levelMessage = addChickenExp(player, needed, random);
  return {
    ok: true,
    player,
    message: `神奇糖果被吃掉了，${player.ownedChicken.name} 從 Lv.${beforeLevel} 升到 Lv.${player.ownedChicken.level}。${levelMessage ? `\n${levelMessage}` : ""}`
  };
}

function returnToSurface(playerInput, random = Math.random, globalStateInput = null, now = Date.now()) {
  const player = getPlayer(playerInput);
  if (player.zone === "skyDown") {
    const settlement = settleSellableResources(player, globalStateInput, now);
    Object.assign(player, settlement.player);
    player.zone = "skyCamp";
    player.depth = CONFIG.mining.skyDepth;
    player.runMode = null;
    player.caveType = null;
    player.runDepthProgress = 0;
    player.pendingEvent = null;
    player.nextEventDepth = 4;
    player.eventMissCount = 0;
    player.nextBuffDepth = 5;
    refreshCampRunModeOptions(player, random);
    return {
      ok: true,
      player,
      globalState: settlement.globalState,
      message: `【返回天上營地】\n你回到最近下來的天上營地。${settlement.total > 0 ? `\n\n本次自動結算：\n礦石收益：${settlement.oreGold}\n寶石收益：${settlement.gemGold}\n特殊收益：${settlement.specialGold}\n\n總獲得：${settlement.total} 金幣` : ""}\n\n本趟層數已重新計算。`
    };
  }
  if (player.zone === "undergroundCamp" || player.zone === "skyCamp") {
    const settlement = settleSellableResources(player, globalStateInput, now);
    Object.assign(player, settlement.player);
    const cost = getElevatorCost(player);
    if (cost <= 0) {
      return { ok: false, player, globalState: globalStateInput, message: "付費電梯偵測不到資產，暫時無法啟動。" };
    }
    const keptInvertedOre = player.invertedOre;
    const keptInvertedGem = player.invertedGem;
    const keptOrichalcum = player.orichalcum;
    payFromTotalAsset(player, cost);
    resetRunState(player, random);
    player.invertedOre = keptInvertedOre;
    player.invertedGem = keptInvertedGem;
    player.orichalcum = keptOrichalcum;
    player.lastElevatorAt = now;
    return {
      ok: true,
      player,
      globalState: settlement.globalState,
      message: `【回到地上營地】\n你回到了地表。${settlement.total > 0 ? `\n\n本次自動結算：\n礦石收益：${settlement.oreGold}\n寶石收益：${settlement.gemGold}\n特殊收益：${settlement.specialGold}\n\n總獲得：${settlement.total} 金幣` : ""}\n\n付費電梯啟動，扣除總資產 10%：${cost} 金幣。`
    };
  }
  const curse = player.tempEffects.find((effect) => effect.id === "ancient_curse" && effect.remaining > 0);
  if (curse) {
    return {
      ok: false,
      player,
      message: `古代詛咒尚未解除，你還無法返回地面。剩餘 ${curse.remaining} 層。`
    };
  }
  const lostRusty = player.rusty;
  const soldOre = player.ore;
  const soldGoldOre = player.goldOre;
  const soldPlatinumOre = player.platinumOre;
  const soldGoldBlock = player.goldBlock;
  const soldOreIngot = player.oreIngot;
  const soldGoldOreIngot = player.goldOreIngot;
  const soldPlatinumOreIngot = player.platinumOreIngot;
  const soldBombItem = player.bombItem;
  const globalState = globalStateInput ? normalizeGlobalState(globalStateInput, now) : null;
  const market = (id) => globalState ? getMarketMultiplier(globalState, id, now) : 1;
  const goldOreBlessing = getMarketBlessingMultiplier(player, "goldOre", now);
  const gemBlessing = getMarketBlessingMultiplier(player, "gem", now);
  const oreGold = Math.floor(soldOre * CONFIG.ore.goldPerOre * market("ore"));
  const goldOreGold = Math.floor(soldGoldOre * CONFIG.ore.goldPerGoldOre * market("goldOre") * goldOreBlessing);
  const platinumOreGold = Math.floor(soldPlatinumOre * CONFIG.ore.goldPerPlatinumOre * market("platinumOre"));
  const goldBlockGold = soldGoldBlock * CONFIG.ore.goldPerGoldBlock;
  const oreIngotGold = Math.floor(soldOreIngot * CONFIG.ore.goldPerOreIngot * market("oreIngot"));
  const goldOreIngotGold = Math.floor(soldGoldOreIngot * CONFIG.ore.goldPerGoldOreIngot * market("goldOreIngot") * goldOreBlessing);
  const platinumOreIngotGold = Math.floor(soldPlatinumOreIngot * CONFIG.ore.goldPerPlatinumOreIngot * market("platinumOreIngot"));
  const bombItemGold = soldBombItem * CONFIG.ore.goldPerBombItem;
  const soldRedGem = player.redGem;
  const soldBlueGem = player.blueGem;
  const soldGreenGem = player.greenGem;
  const gemGold = Math.floor((soldRedGem * CONFIG.ore.redGemGold
    + soldBlueGem * CONFIG.ore.blueGemGold
    + soldGreenGem * CONFIG.ore.greenGemGold) * gemBlessing);
  const baseReward = oreGold + goldOreGold + platinumOreGold + goldBlockGold + oreIngotGold + goldOreIngotGold + platinumOreIngotGold + bombItemGold + gemGold;
  const finalReward = calculateFinalReward(player, baseReward);
  const clearedJunk = player.junk;
  const clearedPlatinumJunk = player.platinumJunk;
  const keptInvertedOre = player.invertedOre;
  const keptInvertedGem = player.invertedGem;
  const keptOrichalcum = player.orichalcum;
  const clearedBombs = player.bombs;
  const depth = player.depth;

  player.rusty = 0;
  player.ore = 0;
  player.goldOre = 0;
  player.platinumOre = 0;
  player.goldBlock = 0;
  player.oreIngot = 0;
  player.goldOreIngot = 0;
  player.platinumOreIngot = 0;
  player.bombItem = 0;
  player.redGem = 0;
  player.blueGem = 0;
  player.greenGem = 0;
  player.gold += baseReward;
  const nextGlobalState = globalState
    ? recordMarketSale(globalState, {
      ore: soldOre,
      goldOre: soldGoldOre,
      platinumOre: soldPlatinumOre,
      oreIngot: soldOreIngot,
      goldOreIngot: soldGoldOreIngot,
      platinumOreIngot: soldPlatinumOreIngot
    }, now)
    : globalStateInput;
  resetRunState(player, random);
  player.invertedOre = keptInvertedOre;
  player.invertedGem = keptInvertedGem;
  player.orichalcum = keptOrichalcum;
  const settlementMessage = baseReward + finalReward.critBonus + finalReward.comboBonus + finalReward.riskBonus + finalReward.burstBonus > 0
    ? `\n\n💰 探險結算：\n基礎收益：${baseReward}\n爆擊加成：+${finalReward.critBonus}\n連擊加成：+${finalReward.comboBonus}\n風險加成：+${finalReward.riskBonus}\n爆發加成：+${finalReward.burstBonus}\n\n👉 總收益：${finalReward.total} 金幣！\n最高連擊：${finalReward.maxCombo}｜爆擊次數：${finalReward.critCount}｜Jackpot：${finalReward.jackpotCount}`
    : "";

  return {
    ok: true,
    player,
    globalState: nextGlobalState,
    message: `已返回地面。${soldOre > 0 ? `${soldOre} 塊礦石換成 ${oreGold} 金幣。` : ""}${soldGoldOre > 0 ? `${soldGoldOre} 塊金礦石換成 ${goldOreGold} 金幣。` : ""}${soldPlatinumOre > 0 ? `${soldPlatinumOre} 塊鉑金礦石換成 ${platinumOreGold} 金幣。` : ""}${soldGoldBlock > 0 ? `${soldGoldBlock} 個金塊換成 ${goldBlockGold} 金幣。` : ""}${soldOreIngot + soldGoldOreIngot + soldPlatinumOreIngot > 0 ? `錠換成 ${oreIngotGold + goldOreIngotGold + platinumOreIngotGold} 金幣。` : ""}${soldBombItem > 0 ? `${soldBombItem} 顆完整炸彈換成 ${bombItemGold} 金幣。` : ""}${gemGold > 0 ? `寶石換成 ${gemGold} 金幣。` : ""}深度 ${depth} 歸零，炸彈次數 ${clearedBombs} 歸零。${clearedJunk > 0 ? `${clearedJunk} 個超級破爛已清掉。` : ""}${clearedPlatinumJunk > 0 ? `${clearedPlatinumJunk} 個白金破爛已清掉。` : ""}${lostRusty > 0 ? `未除鏽的 ${lostRusty} 枚生鏽紀念幣已消失。` : ""}${settlementMessage}`
  };
}

function discardItem(playerInput, itemId, amount = 1) {
  const player = getPlayer(playerInput);
  const safeAmount = Math.max(1, Math.floor(amount));

  if (STICKY_ITEMS.has(itemId)) {
    return {
      ok: false,
      player,
      message: "❌ 這東西似乎黏在你包包裡…"
    };
  }

  if (itemId === "rusty") {
    if (player.rusty <= 0) {
      return {
        ok: false,
        player,
        message: "你沒有生鏽紀念幣可以丟棄。"
      };
    }

    const discarded = Math.min(safeAmount, player.rusty);
    player.rusty -= discarded;
    return {
      ok: true,
      player,
      message: `已丟棄 ${discarded} 枚生鏽紀念幣。`
    };
  }

  const carriedItem = DISCARDABLE_ITEMS.find(([id]) => id === itemId);
  if (carriedItem) {
    const current = Math.max(0, Math.floor(player[itemId] || 0));
    if (current <= 0) {
      return {
        ok: false,
        player,
        message: `你沒有${carriedItem[1]}可以丟棄。`
      };
    }
    const discarded = Math.min(safeAmount, current);
    player[itemId] = current - discarded;
    return {
      ok: true,
      player,
      message: `已丟棄 ${discarded} 個${carriedItem[1]}。`
    };
  }

  const collectible = getCollectible(itemId);
  if (!collectible) {
    return {
      ok: false,
      player,
      message: "沒有這個物品。"
    };
  }

  const current = player.collection[itemId] || 0;
  if (current <= 0) {
    return {
      ok: false,
      player,
      message: `你沒有 ${collectible.name} 可以丟棄。`
    };
  }

  const discarded = Math.min(safeAmount, current);
  player.collection[itemId] = current - discarded;
  if (player.collection[itemId] <= 0) delete player.collection[itemId];

  return {
    ok: true,
    player,
    message: `已丟棄 ${discarded} 枚${collectible.name}。`
  };
}

function transferCollectible(fromInput, toInput, itemId, amount = 1, gold = 0) {
  const from = getPlayer(fromInput);
  const to = getPlayer(toInput);
  const safeAmount = Math.max(0, Math.floor(amount || 0));
  const safeGold = Math.max(0, Math.floor(gold || 0));
  const collectible = itemId ? getCollectible(itemId) : null;

  if (safeAmount <= 0 && safeGold <= 0) {
    return {
      ok: false,
      from,
      to,
      message: "交易內容不能是空的，請至少送出 1 枚紀念幣或 1 枚金幣。"
    };
  }

  if (safeAmount > 0 && !collectible) {
    return {
      ok: false,
      from,
      to,
      message: "沒有這個紀念幣。"
    };
  }

  if (from.gold < safeGold) {
    return {
      ok: false,
      from,
      to,
      message: `你的金幣不足，目前只有 ${from.gold} 枚。`
    };
  }

  let current = 0;
  if (safeAmount > 0) {
    current = from.collection[itemId] || 0;
    if (current < safeAmount) {
      return {
        ok: false,
        from,
        to,
        message: `你的${collectible.name}不足，目前只有 ${current} 枚。`
      };
    }

  }

  if (safeAmount > 0) {
    from.collection[itemId] = current - safeAmount;
    if (from.collection[itemId] <= 0) delete from.collection[itemId];
    to.collection[itemId] = (to.collection[itemId] || 0) + safeAmount;
  }

  if (safeGold > 0) {
    from.gold -= safeGold;
    to.gold += safeGold;
  }

  const parts = [];
  if (safeAmount > 0) parts.push(`${safeAmount} 枚${collectible.name}`);
  if (safeGold > 0) parts.push(`${safeGold} 枚金幣`);

  return {
    ok: true,
    from,
    to,
    message: `交易完成：送出 ${parts.join("、")}。`
  };
}

function transferHealingPotion(fromInput, toInput, amount = 1) {
  return transferConsumable(fromInput, toInput, "healingPotion", amount);
}

const TRANSFERABLE_CONSUMABLES = {
  healingPotion: {
    key: "healingPotion",
    label: "治療藥水",
    unit: "瓶"
  },
  magicCandy: {
    key: "magicCandy",
    label: "神奇糖果",
    unit: "顆"
  }
};

function transferConsumable(fromInput, toInput, itemId, amount = 1) {
  const from = getPlayer(fromInput);
  const to = getPlayer(toInput);
  const safeAmount = Math.max(0, Math.floor(amount || 0));
  const item = TRANSFERABLE_CONSUMABLES[itemId];

  if (!item) {
    return {
      ok: false,
      from,
      to,
      message: "這個物品不能交易。"
    };
  }

  if (safeAmount <= 0) {
    return {
      ok: false,
      from,
      to,
      message: "交易數量必須大於 0。"
    };
  }

  if (from[item.key] < safeAmount) {
    return {
      ok: false,
      from,
      to,
      message: `你的${item.label}不足，目前只有 ${from[item.key]} ${item.unit}。`
    };
  }

  from[item.key] -= safeAmount;
  to[item.key] += safeAmount;
  return {
    ok: true,
    from,
    to,
    message: `交易完成：送出${item.label} x${safeAmount}。`
  };
}

function revive(playerInput, now = Date.now(), random = Math.random) {
  const player = getPlayer(playerInput);
  if (!player.dead) {
    return {
      ok: false,
      player,
      message: "你目前還活著，不需要復活。"
    };
  }

  const deathAt = player.deathAt || now;
  const canFreeRevive = now - deathAt >= CONFIG.revive.freeAfterMs;

  if (!canFreeRevive && player.gold < CONFIG.revive.costGold) {
    const remainingMs = CONFIG.revive.freeAfterMs - (now - deathAt);
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return {
      ok: false,
      player,
      message: `金幣不足，花費復活需要 ${CONFIG.revive.costGold} 金幣。也可以再等約 ${remainingMinutes} 分鐘免費復活。`
    };
  }

  if (!canFreeRevive) player.gold -= CONFIG.revive.costGold;
  player.dead = false;
  resetRunState(player, random);
  player.deathAt = null;
  player.lastDeathLostGold = 0;

  return {
    ok: true,
    player,
    message: canFreeRevive ? "你已免費復活，炸彈次數歸零。" : `你花費 ${CONFIG.revive.costGold} 金幣復活，炸彈次數歸零。`
  };
}

function rescuePlayer(rescuerInput, targetInput, now = Date.now(), random = Math.random) {
  const rescuer = getPlayer(rescuerInput);
  const target = getPlayer(targetInput);

  if (!target.dead) {
    return {
      ok: false,
      rescuer,
      target,
      message: "對方目前沒有死亡，不需要救援。"
    };
  }

  const rescueRefund = target.deathAt && now - target.deathAt <= CONFIG.revive.rescueRefundAfterMs
    ? target.lastDeathLostGold || 0
    : 0;

  rescuer.rescueBonusCount = (rescuer.rescueBonusCount || 0) + 1;
  target.gold += rescueRefund;
  target.dead = false;
  resetRunState(target, random);
  target.deathAt = null;
  target.lastDeathLostGold = 0;

  return {
    ok: true,
    rescuer,
    target,
    message: `救援成功。救援者下次下礦會隨機獲得 1 個小詞條。${rescueRefund > 0 ? `3 分鐘內救起，退回 ${rescueRefund} 枚死亡損失金幣。` : ""}`
  };
}

function formatInventory(playerInput) {
  const player = repairPlayerState(playerInput).player;
  const pendingEvent = player.pendingEvent ? getRandomEvent(player.pendingEvent) : null;
  return [
    `身上金幣：${player.gold}`,
    `銀行金幣：${player.bankGold}`,
    `攜帶道具：治療藥水 ${player.healingPotion}｜神奇糖果 ${player.magicCandy}｜先機球 ${player.quickChickenBall}｜不死圖騰 ${player.undyingTotem}`,
    `礦石：普通 ${player.ore}｜金 ${player.goldOre}｜鉑金 ${player.platinumOre}`,
    `加工物：金塊 ${player.goldBlock}｜礦錠 ${player.oreIngot}｜金錠 ${player.goldOreIngot}｜鉑金錠 ${player.platinumOreIngot}｜完整炸彈 ${player.bombItem}`,
    `寶石：紅 ${player.redGem}｜藍 ${player.blueGem}｜綠 ${player.greenGem}`,
    `超級破爛：${player.junk}`,
    `白金破爛：${player.platinumJunk}`,
    `生鏽紀念幣：${player.rusty}`,
    `收藏紀念幣：${getCollectionTotal(player)} 枚`,
    `包包格數：${getBagUsedSlots(player)}/${getBagCapacity(player)}`,
    `深度：${player.depth}（${getDepthLabel(player.depth)}）`,
    `下礦方式：${getRunModeLabel(player)}`,
    `礦洞：${getCaveLabel(player)}`,
    `小磁條：金幣 +${Math.round(getMinorBuffEffectiveStacks(player, "gold") * 5)}%｜防爆 ${getMinorBuffEffectiveStacks(player, "bomb").toFixed(1).replace(/\.0$/, "")}`,
    `事件：${pendingEvent ? pendingEvent.title : "無"}`,
    `炸彈次數：${player.bombs}/${getMaxBombs(player)}`,
    `狀態：${player.dead ? "死亡" : "存活"}`,
    `最深紀錄：${player.stats.bestDepth}`,
    `死亡次數：${player.stats.deaths}`,
    `挖礦次數：${player.mines}`
  ].join("\n");
}

function formatShop(progressInput = {}) {
  const shopLines = getShopItems().map(
    (item) => `${item.collectible.name}｜${item.collectible.rarity}｜${item.priceGold} 金幣｜只能在商店購買`
  );
  const consumableLines = getShopConsumables(progressInput).map(
    (item) => item.id === "magicCandy" ? `${item.label}｜總資產 2%｜每日 2 顆` : `${item.label}｜${item.priceGold} 金幣`
  );
  return [
    `金幣鑄造：${CONFIG.exchange.goldPerCommemorative} 金幣 = 1 枚隨機收藏紀念幣，使用 \`/兌換\`。`,
    `除鏽：每枚 ${CONFIG.rustRemoval.default.costGold} 金幣，成功率 ${Math.round(CONFIG.rustRemoval.default.successRate * 100)}%。`,
    "",
    "商店限定：",
    ...shopLines,
    ...(consumableLines.length ? ["", "共同任務商品：", ...consumableLines] : []),
    "",
    "使用 `/購買` 購買商店商品。"
  ].join("\n");
}

function formatCollection(playerInput) {
  const player = getPlayer(playerInput);
  return CONFIG.collectibles
    .map((item) => {
      const count = player.collection[item.id] || 0;
      const owned = count > 0 ? `已收藏 x${count}` : "未發現";
      return `${item.name}｜${item.rarity}｜${owned}`;
    })
    .join("\n");
}

module.exports = {
  awardCollectible,
  awardRustCollectible,
  buyShopItem,
  buyUndergroundInnItem,
  canChooseMinorBuff,
  chooseMinorBuff,
  chooseRunMode,
  createPlayer,
  depositBank,
  discardItem,
  drinkHealingPotion,
  eatMagicCandy,
  ensureRunModeOptions,
  exchange,
  formatCollection,
  formatInventory,
  formatShop,
  getBagFreeSlots,
  getBagCapacity,
  getBagUsedSlots,
  getAreaLabel,
  getAwardCollectibles,
  getChickenCompanionText,
  getChickenMiningBonus,
  getCollectible,
  getCollectibles,
  getCollectionTotal,
  getCollectionUniqueCount,
  getCommunityProgress,
  getDepthLabel,
  getDigPathOptions,
  getDiscardableItems,
  getCaveLabel,
  getMaxBombs,
  getMagicCandyPrice,
  getUndergroundInnSnapshot,
  getPlayer,
  getRandomEvent,
  getRandomEvents,
  getRustCollectibles,
  getRunModeOptions,
  getRunModeLabel,
  getMinorBuffEffectiveStacks,
  getMinorBuffOptions,
  isSelectableMiniTrait,
  isMiniTraitBreakthroughMode,
  getShopItems,
  getShopConsumables,
  getElevatorCost,
  getTotalAsset,
  mine,
  openUndergroundStorage,
  openUndergroundInn,
  depositUndergroundStorage,
  removeRust,
  repairPlayerState,
  rerollRunModeOptions,
  resolveEventChallenge,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  setUiMode,
  shimmerCollectible,
  triggerCharge,
  travelToUndergroundCamp,
  rollWeighted,
  buySupplyStationItem,
  canOpenSupplyStation,
  createSupplyStation,
  formatSupplyStation,
  getSupplyStationView,
  leaveSupplyStation,
  sellSupplyStationBuff,
  transferConsumable,
  transferCollectible,
  transferHealingPotion,
  tradeSkyUnknownLife,
  useRaptorCaveTicket,
  withdrawUndergroundStorage,
  withdrawBank
};

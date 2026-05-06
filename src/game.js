"use strict";

const {
  getEventTriggerChance,
  rollEventTrigger,
  shouldCheckEvent,
  updateEventState
} = require("./eventPitySystem");
const {
  getRandomEvent,
  getRandomEvents,
  pickGemEvent,
  pickHighTierEvent,
  pickReverseEvent,
  pickRandomEvent
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
  if (player.zone === "upward") return "反轉上挖層";
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

function refreshDigPathOptions(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const pool = getDigPathIds();
  const options = [];
  while (options.length < 2 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    options.push(pool.splice(index, 1)[0]);
  }
  player.digPathOptions = {
    left: options[0] || "steady",
    right: options[1] || "greedy"
  };
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
  const normalized = player.digPathOptions.left && player.digPathOptions.right
    ? player
    : refreshDigPathOptions(player, () => 0);
  return ["left", "right"].map((side) => {
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
  const player = migratePreUpdateDeepPlayer(playerInput);
  if (player.runMode || player.dead || player.runModeOptions.length > 0) return player;
  return refreshRunModeOptions(player, random);
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
  player.zone = "surface";
  player.lavaProgress = 0;
  player.runMode = null;
  player.caveType = null;
  player.minorBuffs = { ...createPlayer().minorBuffs };
  player.minorBuffOptions = [];
  player.minorBuffSelections = [];
  player.minorBuffBreakthroughMode = false;
  player.nextBuffDepth = 5;
  player.pendingEvent = null;
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
  if (player.zone === "lavaPool") return "岩漿池";
  if (player.zone === "undergroundCamp") return "地底營地";
  if (player.zone === "upward") return "反轉上挖層";
  if (player.zone === "skyCamp") return "天域營地";
  if (player.caveType === "normal") return "普通礦洞";
  return "尚未進洞";
}

const depositBank = (playerInput) => economySystem.depositBank(playerInput, isInMine);
const withdrawBank = (playerInput) => economySystem.withdrawBank(playerInput, isInMine);
const travelToUndergroundCamp = (playerInput, now = Date.now()) => (
  economySystem.travelToUndergroundCamp(playerInput, isInMine, now)
);
const openUndergroundInn = economySystem.openUndergroundInn;

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
  player.runModeOptions = [];
  if (choosingFromUndergroundCamp) {
    player.caveType = null;
    player.zone = "undergroundCamp";
  } else {
    const gemChance = CONFIG.mining.gemCaveChance + (config.gemCaveChanceBonus || 0);
    player.caveType = random && random() < gemChance ? "gem" : "normal";
    player.zone = "mine";
  }
  player.enteringGold = player.gold;
  player.highTierEligible = getTotalAsset(player) > 0 && player.enteringGold >= getTotalAsset(player) * 0.5;
  player.minorBuffs = { ...createPlayer().minorBuffs };
  player.minorBuffOptions = [];
  player.minorBuffSelections = [];
  player.minorBuffBreakthroughMode = false;
  player.nextBuffDepth = 5;
  player.pendingEvent = null;
  player.nextEventDepth = 4;
  player.eventMissCount = 0;
  player.bagBonusSlots = config.bagBonusSlots || 0;
  player.tempEffects = [];
  player.forcedNextResult = null;
  player.goldBeast = null;
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
      : `已選擇 ${config.label}。可以開始深入挖礦。`
  };
}

function canChooseMinorBuff(playerInput) {
  const player = getPlayer(playerInput);
  return !player.dead && Boolean(player.runMode) && Math.abs(player.depth) >= player.nextBuffDepth && Math.abs(player.depth) % 5 === 0;
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
  const requiredSelections = Math.min(2, Math.max(1, player.minorBuffOptions.length));
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
      : `已選擇 ${isBreakthrough ? "✨ " : ""}${config.label}${isBreakthrough ? "（突破）" : ""}。還可以再選 1 個小詞條。`
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
      : null
  ].filter(Boolean);
}

function addPendingNextRunTrait(player, traitId) {
  if (!CONFIG.runModes[traitId]) return false;
  player.pendingNextRunTraits = [...new Set([...(player.pendingNextRunTraits || []), traitId])].slice(0, 10);
  return true;
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
  if (player.depth <= player.stats.bestDepth) return "";
  player.stats.bestDepth = player.depth;
  player.bestRecordTimestamps = [
    ...(player.bestRecordTimestamps || []),
    Date.now()
  ].slice(-10);
  return `突破個人最深紀錄：第 ${player.depth} 層！`;
}

function maybeTriggerRandomEvent(player, random = Math.random) {
  if (player.dead || player.pendingEvent || !shouldCheckEvent(Math.abs(player.depth), player)) return "";
  const mode = getMode(player);
  player.eventChanceBonus = (mode && mode.eventChanceBonus ? mode.eventChanceBonus : 0)
    + getMinorBuffEffectiveStacks(player, "event") * CONFIG.minorBuffs.event.eventChanceBonus;
  const triggered = rollEventTrigger(player, random);
  const nextState = updateEventState(triggered, player);
  player.eventMissCount = nextState.eventMissCount;
  player.nextEventDepth = nextState.nextEventDepth;
  if (!triggered) return "";

  let eventId = null;
  if (player.zone === "upward") eventId = pickReverseEvent(player, random);
  else if (player.caveType === "gem") eventId = pickGemEvent(player, random);
  else if (player.highTierEligible && random() < 0.18) eventId = pickHighTierEvent(player, random);
  else eventId = pickRandomEvent(player, random);
  player.pendingEvent = eventId;
  const event = getRandomEvent(eventId);
  return `\n\n事件出現：${event.title}。\n${event.description}`;
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
  const eventMessage = kind === "blocked" || kind === "full" || player.dead
    ? ""
    : maybeTriggerRandomEvent(player, random);
  if (kind !== "blocked" && kind !== "full" && !player.dead && player.runMode) {
    tickTempEffects(player);
    player.digPathOptions = refreshDigPathOptions(player, random).digPathOptions;
    if (canChooseMinorBuff(player) && player.minorBuffOptions.length === 0) {
      Object.assign(player, refreshMinorBuffOptions(player, random));
    }
  }
  const funMessage = applyPostDigFun(player, kind, random);
  const tensionHint = getTensionHint(player);
  return {
    kind,
    player,
    title,
    message: `${message}${tensionHint ? `\n${tensionHint}` : ""}${funMessage ? `\n${funMessage}` : ""}${recordMessage ? `\n${recordMessage}` : ""}${eventMessage}`,
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
      + getMinorBuffEffectiveStacks(player, "luck") * CONFIG.minorBuffs.luck.critChanceBonus;
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

  if ((player.chargeValue || 0) >= 100) messages.push("⚡ 蓄力已滿，可使用爆發。");
  return messages.join("\n");
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

  if (!player.dead && player.goldBeast && player.depth >= player.goldBeast.returnDepth) {
    const roll = random();
    const multiplier = roll < 0.5 ? 1.5 : roll < 0.85 ? 2 : 3;
    const reward = Math.floor(player.goldBeast.amount * multiplier);
    player.gold += reward;
    player.goldBeast = null;
    messages.push(`吞金獸回來了，吐出 ${reward} 金幣。\n你感覺牠不會再回來了…`);
  }

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
  void random;
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
    player.runMode = null;
    player.depth = CONFIG.mining.lavaDepth;
    return {
      kind: "blocked",
      player,
      title: "地底營地",
      message: `你穿過岩漿池抵達地底營地。${damage.message}這裡可以銀行、搭電梯或開始往上挖。`
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
  player.depth -= 1;
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
    player.runMode = null;
    return {
      kind: "blocked",
      player,
      title: "天域營地",
      message: "你抵達了地表之上的未知領域。更多功能敬請期待。"
    };
  }

  const eventMessage = maybeTriggerRandomEvent(player, random);
  if (eventMessage) {
    return buildOutcome("blocked", player, "反轉事件", `反轉層出現異常。${eventMessage}`, "", random);
  }

  const reverseMultiplier = getModeRewardMultiplier(player)
    * (1 + getMinorBuffEffectiveStacks(player, "reverse") * CONFIG.minorBuffs.reverse.reverseRewardBonus);
  const roll = random();
  if (player.depth <= -1 && roll < 0.08) {
    const gained = addItemReward(player, "orichalcum", 1);
    return buildOutcome("orichalcum", player, "奧利哈鋼", `你挖到 ${gained} 塊奧利哈鋼。用途：敬請期待。`, "", random);
  }
  if (roll < 0.45) {
    const gained = addItemReward(player, "invertedOre", Math.max(1, Math.floor((1 + random() * 3) * reverseMultiplier)));
    player.lastReward = makeReward("invertedOre", gained);
    return buildOutcome("invertedOre", player, "顛倒礦石", `你往上挖出 ${gained} 塊顛倒礦石。只能在地底客棧兌換，敬請期待。`, "", random);
  }
  if (roll < 0.75) {
    const gained = addItemReward(player, "invertedGem", Math.max(1, Math.floor((1 + random() * 2) * reverseMultiplier)));
    player.lastReward = makeReward("invertedGem", gained);
    return buildOutcome("invertedGem", player, "顛倒寶石", `你往上挖出 ${gained} 顆顛倒寶石。只能在地底客棧兌換，敬請期待。`, "", random);
  }
  if (roll < 0.88) {
    const damage = addBombDamage(player, now, 1);
    return buildOutcome("stalactite", player, "空間亂流", `反轉亂流割過礦道，${damage.message}`, "", random);
  }
  return buildOutcome("empty", player, "反轉碎石", "這一鏟只有往上飄的碎石。", "", random);
}

function mine(playerInput, random = Math.random, now = Date.now(), digPath = null) {
  const player = getPlayer(playerInput);
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
    player.depth = 0;
    player.nextEventDepth = 4;
    player.eventMissCount = 0;
    player.nextBuffDepth = 5;
    return mineUpward(player, random, now);
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
  const mode = getMode(player);
  const depthStep = mode && mode.depthStep ? mode.depthStep : 1;
  const repeatLayer = player.tempEffects.some((effect) => effect.id === "repeat_layer");
  if (!repeatLayer) player.depth += depthStep;
  if (player.depth >= CONFIG.mining.lavaDepth) {
    player.depth = CONFIG.mining.lavaDepth;
    return crossLavaPool(player, random, now);
  }
  const recordMessage = setDepthRecord(player);
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
  if (player.caveType === "gem") {
    const outcome = mineGemCave(player, random, now, recordMessage, digPath);
    if (layerEffectMessage) outcome.message = `${layerEffectMessage}\n${outcome.message}`;
    return outcome;
  }
  let result = player.forcedNextResult || rollWeighted(getMiningWeights(player, digPath), random);
  player.forcedNextResult = null;
  if (result === "gold_or_ore") result = random() < 0.5 ? "gold" : "ore";
  const gatherMultiplier = mode && mode.gatherMultiplier ? mode.gatherMultiplier : 1;
  const goldMultiplier = 1
    + getMinorBuffEffectiveStacks(player, "gold") * CONFIG.minorBuffs.gold.goldMultiplierBonus
    + (mode && mode.goldMultiplierBonus ? mode.goldMultiplierBonus : 0);
  const oreMultiplier = 1
    + (mode && mode.oreRewardMultiplier ? mode.oreRewardMultiplier - 1 : 0)
    + getMinorBuffEffectiveStacks(player, "ore") * CONFIG.minorBuffs.ore.oreMultiplierBonus;
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
    if (random() < 0.5) {
      const gold = 25 + getDepthBonus(player.depth) * 8;
      player.gold += gold;
      return { ok: true, player, title: event.title, message: `你翻到資源，獲得 ${gold} 金幣。` };
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
    const options = getDigPathOptions(player).map((path) => `${path.side === "left" ? "左" : "右"}:${path.label}`).join("｜");
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
    if (choice === "safe") {
      const gained = addItemReward(player, "invertedOre", 1);
      return { ok: true, player, title: event.title, message: `你穩定處理反轉事件，獲得 ${gained} 塊顛倒礦石。` };
    }
    if (choice === "extreme") {
      player.depth -= 3;
      const lost = Math.min(player.gold, Math.ceil(player.gold * 0.12));
      player.gold -= lost;
      const gained = addItemReward(player, eventId === "sky_light_crack" ? "orichalcum" : "invertedGem", eventId === "sky_light_crack" ? 1 : 2);
      const extremeMessages = {
        reverse_gravity_vein: `你跳進反重力礦脈，上升 3 層，獲得 ${gained} 顆顛倒寶石，但失去 ${lost} 金幣。`,
        sky_light_crack: `你鑽進天光裂縫，上升 3 層，獲得 ${gained} 塊奧利哈鋼，但失去 ${lost} 金幣。`,
        inverted_merchant: `你強行交易失控，上升 3 層，獲得 ${gained} 顆顛倒寶石，但失去 ${lost} 金幣。`,
        broken_sky_stone: `你背起天空石核心，上升 3 層，獲得 ${gained} 顆顛倒寶石，但失去 ${lost} 金幣。`,
        rising_turbulence: `你衝進反轉亂流，上升 3 層，獲得 ${gained} 顆顛倒寶石，但失去 ${lost} 金幣。`
      };
      return { ok: true, player, title: event.title, message: extremeMessages[eventId] || `你選擇極端處理，上升 3 層，獲得 ${gained} 個反轉資源，但失去 ${lost} 金幣。` };
    }
    if (eventId === "inverted_merchant") {
      return { ok: true, player, title: event.title, message: "倒置商人看了看你的顛倒礦石：兌換功能即將開放，敬請期待。" };
    }
    const gained = addItemReward(player, eventId === "broken_sky_stone" ? "invertedGem" : "invertedOre", 2);
    if (random() < 0.35) player.depth -= 1;
    return { ok: true, player, title: event.title, message: `冒險成功，獲得 ${gained} 個反轉資源。` };
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
      player.depth += roll < 0.65 ? 2 : -1;
      const recordMessage = setDepthRecord(player);
      return { ok: true, player, title: event.title, message: `礦道位移到第 ${player.depth} 層。${recordMessage}` };
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
  const safeAmount = Math.max(1, Math.floor(amount));
  const progress = { ...progressInput };
  const globalState = progress.globalState ? normalizeGlobalState(progress.globalState) : null;
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

  const label = shopItem ? shopItem.collectible.name : consumable.label;
  const priceGold = shopItem ? shopItem.priceGold : consumable.priceGold;
  const cost = priceGold * safeAmount;
  if (itemId === "healingPotion" && globalState) {
    if ((globalState.currentPotionStock || 0) < safeAmount) {
      return {
        ok: false,
        player,
        globalState,
        message: "治療藥水已售完，請等待下一個小時補貨。"
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
    if (itemId === "healingPotion" && globalState) {
      globalState.currentPotionStock = Math.max(0, (globalState.currentPotionStock || 0) - safeAmount);
    }
  }

  return {
    ok: true,
    player,
    globalState,
    message: `成功花費 ${cost} 金幣購買 ${safeAmount} 個${label}。`
  };
}

function shimmerCollectible(playerInput, itemId, random = Math.random) {
  const player = getPlayer(playerInput);
  const cost = CONFIG.shop.shimmerPool.costGold;
  const source = getCollectible(itemId);

  if (isInMine(player)) {
    return {
      ok: false,
      player,
      award: null,
      message: "微光池只能在地表使用。"
    };
  }

  if (!source) {
    return {
      ok: false,
      player,
      award: null,
      message: "找不到這枚紀念幣。"
    };
  }

  if ((player.collection[itemId] || 0) <= 0) {
    return {
      ok: false,
      player,
      award: null,
      message: `你沒有 ${source.name} 可以投入微光池。`
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

  const pool = CONFIG.collectibles.filter((item) => item.id !== itemId);
  const award = pool[Math.floor(random() * pool.length)] || source;
  player.gold -= cost;
  player.collection[itemId] -= 1;
  if (player.collection[itemId] <= 0) delete player.collection[itemId];
  player.collection[award.id] = (player.collection[award.id] || 0) + 1;

  return {
    ok: true,
    player,
    award,
    message: `微光池吞下 ${source.name} 和 ${cost} 金幣，轉換出 ${award.name}。`
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

function returnToSurface(playerInput, random = Math.random, globalStateInput = null, now = Date.now()) {
  const player = getPlayer(playerInput);
  if (player.zone === "undergroundCamp" || player.zone === "skyCamp") {
    const cost = getElevatorCost(player);
    if (cost <= 0) {
      return { ok: false, player, globalState: globalStateInput, message: "付費電梯偵測不到資產，暫時無法啟動。" };
    }
    payFromTotalAsset(player, cost);
    resetRunState(player, random);
    player.lastElevatorAt = now;
    return {
      ok: true,
      player,
      globalState: globalStateInput,
      message: `付費電梯啟動，扣除總資產 10%：${cost} 金幣，已返回地表。`
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
  const oreGold = Math.floor(soldOre * CONFIG.ore.goldPerOre * market("ore"));
  const goldOreGold = Math.floor(soldGoldOre * CONFIG.ore.goldPerGoldOre * market("goldOre"));
  const platinumOreGold = Math.floor(soldPlatinumOre * CONFIG.ore.goldPerPlatinumOre * market("platinumOre"));
  const goldBlockGold = soldGoldBlock * CONFIG.ore.goldPerGoldBlock;
  const oreIngotGold = Math.floor(soldOreIngot * CONFIG.ore.goldPerOreIngot * market("oreIngot"));
  const goldOreIngotGold = Math.floor(soldGoldOreIngot * CONFIG.ore.goldPerGoldOreIngot * market("goldOreIngot"));
  const platinumOreIngotGold = Math.floor(soldPlatinumOreIngot * CONFIG.ore.goldPerPlatinumOreIngot * market("platinumOreIngot"));
  const bombItemGold = soldBombItem * CONFIG.ore.goldPerBombItem;
  const soldRedGem = player.redGem;
  const soldBlueGem = player.blueGem;
  const soldGreenGem = player.greenGem;
  const gemGold = soldRedGem * CONFIG.ore.redGemGold
    + soldBlueGem * CONFIG.ore.blueGemGold
    + soldGreenGem * CONFIG.ore.greenGemGold;
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
  const player = getPlayer(playerInput);
  return [
    `身上金幣：${player.gold}`,
    `銀行金幣：${player.bankGold}`,
    `攜帶道具：治療藥水 ${player.healingPotion}｜不死圖騰 ${player.undyingTotem}`,
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
    `事件：${player.pendingEvent ? getRandomEvent(player.pendingEvent).title : "無"}`,
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
    (item) => `${item.label}｜${item.priceGold} 金幣`
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
  canChooseMinorBuff,
  chooseMinorBuff,
  chooseRunMode,
  createPlayer,
  depositBank,
  discardItem,
  drinkHealingPotion,
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
  getCollectible,
  getCollectibles,
  getCollectionTotal,
  getCollectionUniqueCount,
  getCommunityProgress,
  getDepthLabel,
  getDigPathOptions,
  getCaveLabel,
  getMaxBombs,
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
  openUndergroundInn,
  removeRust,
  rerollRunModeOptions,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  setUiMode,
  shimmerCollectible,
  triggerCharge,
  travelToUndergroundCamp,
  rollWeighted,
  transferCollectible,
  withdrawBank
};

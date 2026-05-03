"use strict";

const { CONFIG } = require("./config");

const BAG_CAPACITY = 12;

function createPlayer() {
  return {
    gold: 0,
    bankGold: 0,
    healingPotion: 0,
    undyingTotem: 0,
    rusty: 0,
    collection: {},
    bombs: 0,
    dead: false,
    deathAt: null,
    lastDeathLostGold: 0,
    mines: 0,
    depth: 0,
    ore: 0,
    goldOre: 0,
    platinumOre: 0,
    goldBlock: 0,
    oreIngot: 0,
    goldOreIngot: 0,
    platinumOreIngot: 0,
    bombItem: 0,
    junk: 0,
    redGem: 0,
    blueGem: 0,
    greenGem: 0,
    platinumJunk: 0,
    runMode: null,
    runModeOptions: [],
    digPathOptions: {},
    caveType: null,
    minorBuffs: {
      gold: 0,
      bomb: 0
    },
    nextBuffDepth: 5,
    pendingEvent: null,
    nextEventDepth: 4,
    bagBonusSlots: 0,
    stats: {
      bestDepth: 0,
      totalMines: 0,
      deaths: 0
    }
  };
}

function getPlayer(player) {
  const next = {
    ...createPlayer(),
    ...(player || {})
  };
  next.collection = {
    ...(player && player.collection ? player.collection : {})
  };
  next.minorBuffs = {
    ...createPlayer().minorBuffs,
    ...(player && player.minorBuffs ? player.minorBuffs : {})
  };
  next.runModeOptions = Array.isArray(player && player.runModeOptions)
    ? player.runModeOptions.filter((mode) => CONFIG.runModes[mode]).slice(0, 2)
    : [];
  next.digPathOptions = {
    ...(player && player.digPathOptions ? player.digPathOptions : {})
  };
  next.stats = {
    ...createPlayer().stats,
    ...(player && player.stats ? player.stats : {})
  };
  return next;
}

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
  weights.bomb *= Math.pow(CONFIG.minorBuffs.bomb.bombWeightMultiplier, player.minorBuffs.bomb);
  return applyDigPathWeights(weights, player, digPath);
}

function getMaxBombs(playerInput) {
  const player = getPlayer(playerInput);
  const mode = getMode(player);
  return CONFIG.mining.baseHp + (mode && mode.extraHp ? mode.extraHp : 0);
}

function getDepthLabel(depth) {
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
  if (player.runMode !== "fireDragonPickaxe") return kind;
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
    platinumOreIngot: "鉑金錠"
  };
  return names[kind] || "礦物";
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
    player.depth > 0 ||
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

function getRunModeIds() {
  return Object.keys(CONFIG.runModes);
}

function refreshRunModeOptions(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const pool = getRunModeIds();
  const options = [];
  while (options.length < 2 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    options.push(pool.splice(index, 1)[0]);
  }
  player.runModeOptions = options;
  return player;
}

function getRunModeOptions(playerInput) {
  const player = getPlayer(playerInput);
  const ids = player.runModeOptions.length >= 2 ? player.runModeOptions : getRunModeIds().slice(0, 2);
  return ids
    .map((id) => ({
      id,
      ...CONFIG.runModes[id]
    }))
    .filter((mode) => mode.label);
}

function ensureRunModeOptions(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  if (player.runMode || player.dead || player.runModeOptions.length >= 2) return player;
  return refreshRunModeOptions(player, random);
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
  player.platinumJunk = 0;
  player.bombs = 0;
  player.depth = 0;
  player.runMode = null;
  player.caveType = null;
  player.minorBuffs = { gold: 0, bomb: 0 };
  player.nextBuffDepth = 5;
  player.pendingEvent = null;
  player.nextEventDepth = 4;
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

function getCaveLabel(playerInput) {
  const player = getPlayer(playerInput);
  if (player.caveType === "gem") return "寶石礦洞";
  if (player.caveType === "normal") return "普通礦洞";
  return "尚未進洞";
}

function depositBank(playerInput) {
  const player = getPlayer(playerInput);

  if (isInMine(player)) {
    return {
      ok: false,
      player,
      message: "銀行只能在地面使用。先返回地面再存錢。"
    };
  }

  if (player.gold <= 0) {
    return {
      ok: false,
      player,
      message: "身上沒有金幣可以存入銀行。"
    };
  }

  const amount = player.gold;
  player.gold = 0;
  player.bankGold += amount;

  return {
    ok: true,
    player,
    message: `已存入 ${amount} 金幣。銀行金幣死亡不會噴。`
  };
}

function withdrawBank(playerInput) {
  const player = getPlayer(playerInput);

  if (player.bankGold <= 0) {
    return {
      ok: false,
      player,
      message: "銀行目前沒有金幣可以領出。"
    };
  }

  const amount = player.bankGold;
  player.bankGold = 0;
  player.gold += amount;

  return {
    ok: true,
    player,
    message: `已領出 ${amount} 金幣。領出後如果死亡，身上金幣會照常損失。`
  };
}

function chooseRunMode(playerInput, mode, random = null) {
  const player = getPlayer(playerInput);
  const config = CONFIG.runModes[mode];

  if (!config) {
    return {
      ok: false,
      player,
      message: "沒有這個下礦方式。"
    };
  }

  if (isInMine(player)) {
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
  player.caveType = random && random() < CONFIG.mining.gemCaveChance ? "gem" : "normal";
  player.minorBuffs = { gold: 0, bomb: 0 };
  player.nextBuffDepth = 5;
  player.pendingEvent = null;
  player.nextEventDepth = 4;
  player.bagBonusSlots = config.bagBonusSlots || 0;
  player.digPathOptions = refreshDigPathOptions(player, random || Math.random).digPathOptions;

  return {
    ok: true,
    player,
    message: player.caveType === "gem"
      ? `已選擇 ${config.label}。你腳下一空，掉進了寶石礦洞。這裡只會挖到寶石、鐘乳石和白金破爛。`
      : `已選擇 ${config.label}。可以開始深入挖礦。`
  };
}

function canChooseMinorBuff(playerInput) {
  const player = getPlayer(playerInput);
  return !player.dead && player.depth >= player.nextBuffDepth && player.depth % 5 === 0;
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

  player.minorBuffs[buff] = (player.minorBuffs[buff] || 0) + 1;
  player.nextBuffDepth = player.depth + 5;

  return {
    ok: true,
    player,
    message: `已裝上 ${config.label}。下一次小磁條在第 ${player.nextBuffDepth} 層。`
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
  const players = Object.values(playersInput || {}).map((playerInput) => getPlayer(playerInput));
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
    + player.ore
    + player.goldOre
    + player.platinumOre
    + player.goldBlock
    + player.oreIngot
    + player.goldOreIngot
    + player.platinumOreIngot
    + player.bombItem
    + player.redGem
    + player.blueGem
    + player.greenGem
    + player.junk * 3
    + player.platinumJunk * 5;
}

function getBagCapacity(playerInput) {
  const player = getPlayer(playerInput);
  return BAG_CAPACITY + Math.max(0, player.bagBonusSlots || 0);
}

function getBagFreeSlots(playerInput) {
  return Math.max(0, getBagCapacity(playerInput) - getBagUsedSlots(playerInput));
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

const RANDOM_EVENTS = {
  cracked_wall: {
    title: "裂開的礦牆",
    description: "牆縫後面有亮光，但石層很不穩。"
  },
  collapse_warning: {
    title: "坍塌前兆",
    description: "頭頂開始掉碎石，繼續貪可能賺，也可能出事。"
  },
  ancient_rust: {
    title: "古老除鏽機",
    description: "角落有一台舊機器，似乎可以處理生鏽紀念幣。"
  },
  lost_backpack: {
    title: "遺失的背包",
    description: "地上有一個被丟下的背包，裡面可能有補給，也可能有破爛。"
  },
  goblin_purchase: {
    title: "地精收購",
    description: "一個地精說想收購你的礦石，但你看不出牠是好是壞。"
  },
  cave_roach: {
    title: "超大洞穴蟑螂",
    description: "一隻超大洞穴蟑螂趴在路邊，牠看起來很餓，而且很想被摸頭。"
  }
};

function getRandomEvent(eventId) {
  return RANDOM_EVENTS[eventId] || null;
}

function getRandomEvents() {
  return RANDOM_EVENTS;
}

function setDepthRecord(player) {
  if (player.depth <= player.stats.bestDepth) return "";
  player.stats.bestDepth = player.depth;
  return `突破個人最深紀錄：第 ${player.depth} 層！`;
}

function maybeTriggerRandomEvent(player, random = Math.random) {
  if (player.dead || player.pendingEvent || player.depth < player.nextEventDepth) return "";
  player.nextEventDepth += 4;
  if (random() >= 0.55) return "";

  const eventIds = Object.keys(RANDOM_EVENTS);
  const eventId = eventIds[Math.floor(random() * eventIds.length)] || eventIds[0];
  player.pendingEvent = eventId;
  const event = getRandomEvent(eventId);
  return `\n\n事件出現：${event.title}。\n${event.description}`;
}

function addBombDamage(player, now = Date.now(), amount = 1) {
  player.bombs += amount;
  const maxBombs = getMaxBombs(player);
  if (player.bombs < maxBombs) {
    return {
      dead: false,
      message: `受到傷害，生命損傷 ${player.bombs}/${maxBombs}。`
    };
  }

  if (player.undyingTotem > 0) {
    player.undyingTotem -= 1;
    player.bombs = Math.max(0, maxBombs - 1);
    return {
      dead: false,
      message: `不死圖騰發光碎裂，替你擋下死亡。你原地復活，生命剩 1/${maxBombs}。`
    };
  }

  const lostGold = applyDeathPenalty(player);
  player.dead = true;
  player.deathAt = now;
  player.lastDeathLostGold = lostGold;
  player.stats.deaths += 1;
  return {
    dead: true,
    message: `死亡，損失 ${lostGold} 枚金幣。`
  };
}

function buildOutcome(kind, player, title, message, recordMessage = "", random = Math.random) {
  const eventMessage = kind === "blocked" || kind === "full" || player.dead || player.caveType === "gem"
    ? ""
    : maybeTriggerRandomEvent(player, random);
  if (kind !== "blocked" && kind !== "full" && !player.dead && player.runMode) {
    player.digPathOptions = refreshDigPathOptions(player, random).digPathOptions;
  }
  return {
    kind,
    player,
    title,
    message: `${message}${recordMessage ? `\n${recordMessage}` : ""}${eventMessage}`,
    recordMessage
  };
}

function getGemAmount(depth, random = Math.random) {
  const bonus = Math.min(3, Math.floor(depth / 4));
  return 1 + Math.floor(random() * (2 + bonus));
}

function mineGemCave(player, random = Math.random, now = Date.now(), recordMessage = "", digPath = null) {
  const pathPrefix = getDigPathPrefix(player, digPath);
  const result = rollWeighted(applyDigPathWeights(CONFIG.mining.gemWeights, player, digPath), random);
  const mode = player.runMode ? CONFIG.runModes[player.runMode] : null;
  const gatherMultiplier = mode && mode.gatherMultiplier ? mode.gatherMultiplier : 1;
  const digPathRewardMultiplier = getDigPathRewardMultiplier(player, digPath);

  if (result === "redGem" || result === "blueGem" || result === "greenGem") {
    const amount = Math.max(1, Math.floor(getGemAmount(player.depth, random) * gatherMultiplier * digPathRewardMultiplier));
    const freeSlots = getBagFreeSlots(player);
    if (freeSlots <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${pathPrefix}你挖到寶石，但包包已滿，放不下。`
      };
    }

    const gained = Math.min(amount, freeSlots);
    player[result] += gained;
    const name = result === "redGem" ? "紅寶石" : result === "blueGem" ? "藍寶石" : "綠寶石";
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
    const damage = addBombDamage(player, now, 2);
    if (damage.dead) {
      return {
        kind: "dead",
        player,
        title: "鐘乳石砸落",
        message: `${pathPrefix}鐘乳石砸中你，直接扣 2 滴血。${damage.message}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人花 ${CONFIG.revive.rescueCostGold} 金幣救援。${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }

    return buildOutcome(
      "stalactite",
      player,
      "鐘乳石砸落",
      `${pathPrefix}鐘乳石砸中你，扣 2 滴血。炸彈次數 ${player.bombs}/${getMaxBombs(player)}。`,
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
  const mode = getMode(player);
  const depthStep = mode && mode.depthStep ? mode.depthStep : 1;
  player.depth += depthStep;
  const recordMessage = setDepthRecord(player);
  if (player.caveType === "gem") {
    return mineGemCave(player, random, now, recordMessage, digPath);
  }
  const result = rollWeighted(getMiningWeights(player, digPath), random);
  const gatherMultiplier = mode && mode.gatherMultiplier ? mode.gatherMultiplier : 1;
  const goldMultiplier = 1
    + player.minorBuffs.gold * CONFIG.minorBuffs.gold.goldMultiplierBonus
    + (mode && mode.goldMultiplierBonus ? mode.goldMultiplierBonus : 0);

  if (result === "gold") {
    const amount = Math.max(1, Math.floor(getGoldAmount(player.depth, random) * gatherMultiplier * goldMultiplier * digPathRewardMultiplier));
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
      return buildOutcome("goldBlock", player, "燒成金塊", `${pathPrefix}火龍十字鎬把金幣燒成 ${gained} 個金塊，會佔包包格子。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`, recordMessage, random);
    }
    player.gold += amount;
    return buildOutcome("gold", player, "挖到金幣", `${pathPrefix}你挖到了 ${amount} 枚金幣。`, recordMessage, random);
  }

  if (result === "ore") {
    const amount = Math.max(1, Math.floor(getOreAmount(player.depth, random) * gatherMultiplier * digPathRewardMultiplier));
    const freeSlots = getBagFreeSlots(player);
    if (freeSlots <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${pathPrefix}你挖到礦石，但包包已滿，放不下。`
      };
    }

    const target = getOreTargetForMode("ore", player);
    const gained = Math.min(amount, freeSlots);
    player[target] += gained;
    return buildOutcome(
      target,
      player,
      target === "ore" ? "挖到礦石" : "燒成礦錠",
      `${pathPrefix}你挖到了 ${gained} 塊${getOreName(target)}。返回地面時會自動換成金幣。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`,
      recordMessage,
      random
    );
  }

  if (result === "goldOre" || result === "platinumOre") {
    const amount = Math.max(1, Math.floor(getOreAmount(player.depth, random) * gatherMultiplier * digPathRewardMultiplier));
    const freeSlots = getBagFreeSlots(player);
    const target = getOreTargetForMode(result, player);
    const name = getOreName(target);
    if (freeSlots <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: `${pathPrefix}你挖到${name}，但包包已滿，放不下。`
      };
    }

    const gained = Math.min(amount, freeSlots);
    player[target] += gained;
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
        message: `${pathPrefix}你挖到炸彈，${damageAmount > 1 ? "火龍十字鎬引發大爆炸，" : ""}${damage.message}可以等待 10 分鐘或花 ${CONFIG.revive.costGold} 金幣復活，也可以請別人花 ${CONFIG.revive.rescueCostGold} 金幣救援。${recordMessage ? `\n${recordMessage}` : ""}`,
        recordMessage
      };
    }

    return buildOutcome("bomb", player, damageAmount > 1 ? "大爆炸" : "挖到炸彈", `${pathPrefix}你被炸傷了。${damageAmount > 1 ? "大爆炸扣 2 滴血。" : ""}炸彈次數 ${player.bombs}/${maxBombs}。`, recordMessage, random);
  }

  if (result === "junk") {
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
        const gained = Math.min(amount, getBagFreeSlots(player));
        player.ore += gained;
        return {
          ok: true,
          player,
          title: event.title,
          message: `你敲開礦牆，拿到 ${gained} 塊礦石。${gained < amount ? "包包不夠，有些放不下。" : ""}`
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
      const ore = Math.min(2, getBagFreeSlots(player));
      player.gold += gold;
      player.ore += ore;
      const damage = random() < 0.45 ? addBombDamage(player, now).message : "這次沒有被砸中。";
      return {
        ok: true,
        player,
        title: event.title,
        message: `你硬挖一波，獲得 ${gold} 金幣和 ${ore} 塊礦石。${damage}`
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
        const ore = Math.min(2, getBagFreeSlots(player));
        player.gold += gold;
        player.ore += ore;
        return {
          ok: true,
          player,
          title: event.title,
          message: `你翻到補給，獲得 ${gold} 金幣和 ${ore} 塊礦石。`
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
  if (player.gold < cost) {
    return {
      ok: false,
      player,
      message: `金幣不足。購買 ${safeAmount} 個${label}需要 ${cost} 金幣。`
    };
  }

  player.gold -= cost;
  if (shopItem) player.collection[itemId] = (player.collection[itemId] || 0) + safeAmount;
  else player[itemId] = (player[itemId] || 0) + safeAmount;

  return {
    ok: true,
    player,
    message: `成功花費 ${cost} 金幣購買 ${safeAmount} 個${label}。`
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

function returnToSurface(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const lostRusty = player.rusty;
  const soldOre = player.ore;
  const soldGoldOre = player.goldOre;
  const soldPlatinumOre = player.platinumOre;
  const soldGoldBlock = player.goldBlock;
  const soldOreIngot = player.oreIngot;
  const soldGoldOreIngot = player.goldOreIngot;
  const soldPlatinumOreIngot = player.platinumOreIngot;
  const soldBombItem = player.bombItem;
  const oreGold = soldOre * CONFIG.ore.goldPerOre;
  const goldOreGold = soldGoldOre * CONFIG.ore.goldPerGoldOre;
  const platinumOreGold = soldPlatinumOre * CONFIG.ore.goldPerPlatinumOre;
  const goldBlockGold = soldGoldBlock * CONFIG.ore.goldPerGoldBlock;
  const oreIngotGold = soldOreIngot * CONFIG.ore.goldPerOreIngot;
  const goldOreIngotGold = soldGoldOreIngot * CONFIG.ore.goldPerGoldOreIngot;
  const platinumOreIngotGold = soldPlatinumOreIngot * CONFIG.ore.goldPerPlatinumOreIngot;
  const bombItemGold = soldBombItem * CONFIG.ore.goldPerBombItem;
  const soldRedGem = player.redGem;
  const soldBlueGem = player.blueGem;
  const soldGreenGem = player.greenGem;
  const gemGold = soldRedGem * CONFIG.ore.redGemGold
    + soldBlueGem * CONFIG.ore.blueGemGold
    + soldGreenGem * CONFIG.ore.greenGemGold;
  const clearedJunk = player.junk;
  const clearedPlatinumJunk = player.platinumJunk;
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
  player.gold += oreGold + goldOreGold + platinumOreGold + goldBlockGold + oreIngotGold + goldOreIngotGold + platinumOreIngotGold + bombItemGold + gemGold;
  resetRunState(player, random);

  return {
    ok: true,
    player,
    message: `已返回地面。${soldOre > 0 ? `${soldOre} 塊礦石換成 ${oreGold} 金幣。` : ""}${soldGoldOre > 0 ? `${soldGoldOre} 塊金礦石換成 ${goldOreGold} 金幣。` : ""}${soldPlatinumOre > 0 ? `${soldPlatinumOre} 塊鉑金礦石換成 ${platinumOreGold} 金幣。` : ""}${soldGoldBlock > 0 ? `${soldGoldBlock} 個金塊換成 ${goldBlockGold} 金幣。` : ""}${soldOreIngot + soldGoldOreIngot + soldPlatinumOreIngot > 0 ? `錠換成 ${oreIngotGold + goldOreIngotGold + platinumOreIngotGold} 金幣。` : ""}${soldBombItem > 0 ? `${soldBombItem} 顆完整炸彈換成 ${bombItemGold} 金幣。` : ""}${gemGold > 0 ? `寶石換成 ${gemGold} 金幣。` : ""}深度 ${depth} 歸零，炸彈次數 ${clearedBombs} 歸零。${clearedJunk > 0 ? `${clearedJunk} 個超級破爛已清掉。` : ""}${clearedPlatinumJunk > 0 ? `${clearedPlatinumJunk} 個白金破爛已清掉。` : ""}${lostRusty > 0 ? `未除鏽的 ${lostRusty} 枚生鏽紀念幣已消失。` : ""}`
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

  if (rescuer.gold < CONFIG.revive.rescueCostGold) {
    return {
      ok: false,
      rescuer,
      target,
      message: `救援需要 ${CONFIG.revive.rescueCostGold} 金幣，你目前只有 ${rescuer.gold} 金幣。`
    };
  }

  const rescueRefund = target.deathAt && now - target.deathAt <= CONFIG.revive.rescueRefundAfterMs
    ? target.lastDeathLostGold || 0
    : 0;

  rescuer.gold -= CONFIG.revive.rescueCostGold;
  target.gold += rescueRefund;
  target.dead = false;
  resetRunState(target, random);
  target.deathAt = null;
  target.lastDeathLostGold = 0;

  return {
    ok: true,
    rescuer,
    target,
    message: `救援成功，花費 ${CONFIG.revive.rescueCostGold} 金幣。${rescueRefund > 0 ? `3 分鐘內救起，退回 ${rescueRefund} 枚死亡損失金幣。` : ""}`
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
    `小磁條：金幣 +${player.minorBuffs.gold * 5}%｜防爆 ${player.minorBuffs.bomb}`,
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
  getShopItems,
  getShopConsumables,
  mine,
  removeRust,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  rollWeighted,
  transferCollectible,
  withdrawBank
};

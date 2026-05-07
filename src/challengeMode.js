"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const { CONFIG } = require("./config");
const { getPlayer } = require("./playerState");

const CHALLENGE_PREFIX = "challenge_ui";
const CHALLENGE_ITEM_LABELS = {
  ore: "普通礦石",
  goldOre: "金礦石",
  platinumOre: "鉑金礦石",
  gem: "寶石",
  invertedOre: "顛倒礦石",
  invertedGem: "顛倒寶石",
  orichalcum: "奧利哈鋼",
  bombItem: "完整炸彈",
  minerHelmet: "礦工帽",
  oneTimeItem: "一次性道具"
};
const ROUTE_LABELS = {
  left: "左",
  middle: "中",
  right: "右"
};
const ROUTE_TYPES = {
  normal: { label: "穩礦道", emoji: "⛏️", risk: 0.12, reward: 1 },
  risky: { label: "危險裂縫", emoji: "💀", risk: 0.34, reward: 2.2 },
  gem: { label: "寶石光", emoji: "💎", risk: 0.2, reward: 1.45 },
  deep: { label: "深降洞", emoji: "🕳️", risk: 0.28, reward: 1.7 },
  event: { label: "異聲層", emoji: "🌀", risk: 0.24, reward: 1.5 }
};
const CHALLENGE_AREAS = {
  normal: { label: "普通深層", emoji: "⛏️" },
  sky: { label: "天上區", emoji: "☁️" },
  underground: { label: "地下區", emoji: "🌋" },
  inverted: { label: "顛倒區", emoji: "🌀" }
};
const MODIFIERS = {
  highPressure: {
    label: "高壓模式",
    emoji: "🔥",
    description: "收益+25%｜傷害率+12%",
    rewardMultiplier: 1.25,
    riskBonus: 0.12
  },
  rapidDig: {
    label: "極速挖掘",
    emoji: "⚡",
    description: "常出深降洞｜金幣+15%",
    rewardMultiplier: 1.15,
    deepBias: 0.18
  },
  invertedImbalance: {
    label: "顛倒失衡",
    emoji: "🌀",
    description: "特殊資源+｜路線更亂",
    specialMultiplier: 1.35,
    eventBias: 0.14
  },
  deathChase: {
    label: "死亡追擊",
    emoji: "💀",
    description: "每10層追擊｜收益+35%",
    rewardMultiplier: 1.35,
    chase: true
  },
  treasureFever: {
    label: "寶藏熱",
    emoji: "✨",
    description: "商人價+｜寶石路線+",
    merchantMultiplier: 1.2,
    gemBias: 0.15
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pick(array, random = Math.random) {
  if (!array.length) return null;
  return array[Math.floor(random() * array.length)];
}

function sample(array, count, random = Math.random) {
  const pool = [...array];
  const output = [];
  while (pool.length && output.length < count) {
    output.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return output;
}

function getChallengeTraitPool() {
  return Object.entries(CONFIG.runModes)
    .filter(([, mode]) => !mode.oneTimeChickenTrait)
    .map(([id, mode]) => ({
      id,
      label: mode.label || mode.name || id,
      description: mode.shortDescription || "特殊玩法"
    }))
    .slice(0, 25);
}

function getRandomModifiers(random = Math.random) {
  const ids = Object.keys(MODIFIERS);
  return sample(ids, 1 + Math.floor(random() * 3), random);
}

function normalizeChallengeState(input) {
  if (!input || typeof input !== "object") return null;
  const items = input.items && typeof input.items === "object" ? input.items : {};
  const miniTraits = input.miniTraits && typeof input.miniTraits === "object" ? input.miniTraits : {};
  const state = {
    active: Boolean(input.active),
    pending: Boolean(input.pending),
    depth: Math.max(0, Math.floor(input.depth || 0)),
    challengeGold: Math.max(0, Math.floor(input.challengeGold || 0)),
    hp: clamp(Number(input.hp || 3), 0, 99),
    maxHp: clamp(Number(input.maxHp || 3), 1, 99),
    potions: Math.max(0, Math.floor(input.potions || 0)),
    area: CHALLENGE_AREAS[input.area] ? input.area : "normal",
    trait: CONFIG.runModes[input.trait] ? input.trait : null,
    modifiers: Array.isArray(input.modifiers)
      ? input.modifiers.filter((id) => MODIFIERS[id]).slice(0, 3)
      : [],
    routeOptions: Array.isArray(input.routeOptions)
      ? input.routeOptions.filter((route) => route && ROUTE_LABELS[route.id] && ROUTE_TYPES[route.type]).slice(0, 3)
      : [],
    merchant: input.merchant && typeof input.merchant === "object" ? input.merchant : null,
    items: Object.fromEntries(Object.keys(CHALLENGE_ITEM_LABELS).map((key) => [key, Math.max(0, Math.floor(items[key] || 0))])),
    miniTraits: Object.fromEntries(Object.keys(CONFIG.minorBuffs).map((key) => [key, Math.max(0, Math.floor(miniTraits[key] || 0))])),
    stats: {
      crits: Math.max(0, Math.floor(input.stats && input.stats.crits || 0)),
      events: Math.max(0, Math.floor(input.stats && input.stats.events || 0)),
      merchants: Math.max(0, Math.floor(input.stats && input.stats.merchants || 0))
    },
    lastMessage: typeof input.lastMessage === "string" ? input.lastMessage.slice(0, 300) : ""
  };
  if (!state.modifiers.length) state.modifiers = ["highPressure"];
  if (!state.routeOptions.length && state.active && !state.merchant) {
    state.routeOptions = generateChallengeRoutes(state, Math.random);
  }
  return state;
}

function createChallengeSetup(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  const pool = getChallengeTraitPool();
  player.challenge = {
    active: false,
    pending: true,
    depth: 0,
    challengeGold: 0,
    hp: 3,
    maxHp: 3,
    potions: 15,
    area: "normal",
    trait: null,
    modifiers: getRandomModifiers(random),
    routeOptions: [],
    merchant: null,
    items: Object.fromEntries(Object.keys(CHALLENGE_ITEM_LABELS).map((key) => [key, 0])),
    miniTraits: Object.fromEntries(Object.keys(CONFIG.minorBuffs).map((key) => [key, 0])),
    stats: { crits: 0, events: 0, merchants: 0 },
    lastMessage: "選一個大詞條後開始挑戰。"
  };
  player.challengeTraitOptions = pool.map((trait) => trait.id);
  return player;
}

function getChallenge(playerInput) {
  const player = getPlayer(playerInput);
  player.challenge = normalizeChallengeState(player.challenge);
  return player;
}

function chooseChallengeTrait(playerInput, traitId) {
  const player = getChallenge(playerInput);
  if (!player.challenge || !player.challenge.pending) {
    return { player, message: "目前沒有待開始的挑戰。" };
  }
  if (!CONFIG.runModes[traitId]) {
    return { player, message: "找不到這個詞條。" };
  }
  player.challenge.trait = traitId;
  player.challenge.lastMessage = `已選擇：${CONFIG.runModes[traitId].label}`;
  return { player, message: player.challenge.lastMessage };
}

function startChallenge(playerInput, random = Math.random) {
  const player = getChallenge(playerInput);
  if (!player.challenge || !player.challenge.pending) {
    return { player, message: "請先使用 /挖礦挑戰 開啟挑戰。" };
  }
  if (!player.challenge.trait) {
    return { player, message: "請先選擇一個初始詞條。" };
  }
  player.challenge.active = true;
  player.challenge.pending = false;
  player.challenge.depth = 0;
  player.challenge.challengeGold = 0;
  player.challenge.hp = 3;
  player.challenge.maxHp = 3;
  player.challenge.potions = 15;
  player.challenge.area = "normal";
  player.challenge.merchant = null;
  player.challenge.routeOptions = generateChallengeRoutes(player.challenge, random);
  player.challenge.lastMessage = "挑戰開始。金幣與背包只存在本輪。";
  return { player, message: player.challenge.lastMessage };
}

function getModifierValue(challenge, key, base = 0) {
  return (challenge.modifiers || []).reduce((sum, id) => sum + (MODIFIERS[id][key] || 0), base);
}

function getRewardMultiplier(challenge) {
  const trait = challenge.trait ? CONFIG.runModes[challenge.trait] : null;
  const traitGoldBonus = trait && Number.isFinite(trait.goldMultiplierBonus) ? trait.goldMultiplierBonus : 0;
  const miniGold = (challenge.miniTraits.gold || 0) * CONFIG.minorBuffs.gold.goldMultiplierBonus;
  const deepBonus = trait && trait.deepInstinct ? Math.floor(challenge.depth / 10) * 0.1 : 0;
  return Math.max(0.2, 1 + traitGoldBonus + miniGold + deepBonus) * getModifierValue(challenge, "rewardMultiplier", 1);
}

function getRiskBonus(challenge) {
  const trait = challenge.trait ? CONFIG.runModes[challenge.trait] : null;
  const bombTrait = trait && trait.bombWeightMultiplier ? trait.bombWeightMultiplier - 1 : 0;
  const miniBomb = (challenge.miniTraits.bomb || 0) * -0.05;
  const depthPressure = clamp(challenge.depth / 500, 0, 0.35);
  return getModifierValue(challenge, "riskBonus", 0) + bombTrait + miniBomb + depthPressure;
}

function generateChallengeRoutes(challenge, random = Math.random) {
  const countRoll = random();
  const count = countRoll < 0.28 ? 1 : countRoll < 0.72 ? 2 : 3;
  const ids = sample(["left", "middle", "right"], count, random);
  const typePool = [
    "normal",
    "normal",
    "risky",
    "gem",
    "deep",
    "event"
  ];
  if (getModifierValue(challenge, "deepBias", 0) > 0) typePool.push("deep", "deep");
  if (getModifierValue(challenge, "gemBias", 0) > 0) typePool.push("gem", "gem");
  if (getModifierValue(challenge, "eventBias", 0) > 0) typePool.push("event", "risky");
  if (challenge.area === "sky") typePool.push("gem", "event");
  if (challenge.area === "underground") typePool.push("deep", "risky");
  if (challenge.area === "inverted") typePool.push("event", "deep");

  return ids.map((id) => {
    const type = pick(typePool, random);
    return {
      id,
      type,
      label: ROUTE_TYPES[type].label
    };
  });
}

function rotateChallengeArea(challenge, random = Math.random) {
  if (challenge.depth > 0 && challenge.depth % 100 === 1) {
    challenge.area = pick(["sky", "underground", "inverted"], random);
    return `區域切換：${CHALLENGE_AREAS[challenge.area].emoji} ${CHALLENGE_AREAS[challenge.area].label}`;
  }
  return "";
}

function maybeCrit(challenge, reward, random = Math.random) {
  const chance = 0.1 + (challenge.miniTraits.luck || 0) * CONFIG.minorBuffs.luck.critChanceBonus;
  if (random() >= chance) return { reward, message: "" };
  challenge.stats.crits += 1;
  return {
    reward: Math.floor(reward * 2),
    message: `💥 爆擊！收益 x2`
  };
}

function addChallengeItem(challenge, key, amount) {
  if (!CHALLENGE_ITEM_LABELS[key]) return;
  challenge.items[key] = Math.max(0, Math.floor((challenge.items[key] || 0) + amount));
}

function applyRouteResult(challenge, route, random = Math.random) {
  const type = ROUTE_TYPES[route.type] || ROUTE_TYPES.normal;
  const messages = [];
  const base = Math.floor(18 + challenge.depth * 2.4);
  let reward = Math.floor(base * type.reward * getRewardMultiplier(challenge));
  if (route.type === "gem") {
    addChallengeItem(challenge, challenge.area === "inverted" ? "invertedGem" : "gem", 1 + Math.floor(random() * 2));
    messages.push("💎 撿到寶石資源。");
  } else if (route.type === "deep") {
    const jump = 1 + Math.floor(random() * 3);
    challenge.depth += jump;
    addChallengeItem(challenge, challenge.area === "inverted" ? "invertedOre" : "goldOre", 1);
    messages.push(`🕳️ 跳層 +${jump}。`);
  } else if (route.type === "event") {
    challenge.stats.events += 1;
    reward = Math.floor(reward * 1.25);
    const eventMessage = applyChallengeEvent(challenge, random);
    if (eventMessage) messages.push(eventMessage);
  } else if (route.type === "risky") {
    addChallengeItem(challenge, challenge.depth >= 100 ? "platinumOre" : "ore", 1 + Math.floor(random() * 2));
  } else {
    addChallengeItem(challenge, "ore", 1);
  }

  if (challenge.area === "sky" && random() < 0.18) addChallengeItem(challenge, "orichalcum", 1);
  if (challenge.area === "inverted" && random() < 0.25) addChallengeItem(challenge, "invertedOre", 1);
  if (random() < 0.025) {
    addChallengeItem(challenge, "oneTimeItem", 1);
    messages.push("✨ 撿到一次性道具。");
  }

  const crit = maybeCrit(challenge, reward, random);
  reward = crit.reward;
  if (crit.message) messages.push(crit.message);
  challenge.challengeGold += reward;
  messages.unshift(`${type.emoji} ${ROUTE_LABELS[route.id]}路線：+${reward} 挑戰金幣`);

  const dangerChance = clamp(type.risk + getRiskBonus(challenge), 0.02, 0.82);
  if (random() < dangerChance) {
    challenge.hp -= 1;
    messages.push("💢 受到 1 點傷害。");
  }
  if ((challenge.modifiers || []).includes("deathChase") && challenge.depth > 0 && challenge.depth % 10 === 0 && random() < 0.45) {
    challenge.hp -= 1;
    messages.push("💀 死亡追擊逼近，受到 1 點傷害。");
  }
  return messages.join("\n");
}

function applyChallengeEvent(challenge, random = Math.random) {
  const events = [
    () => {
      const gain = Math.floor(60 + challenge.depth * 3);
      challenge.challengeGold += gain;
      return `✨ 高壓礦脈爆開，額外 +${gain}。`;
    },
    () => {
      challenge.potions += 1;
      return "🧪 撿到治療藥水 x1。";
    },
    () => {
      addChallengeItem(challenge, "bombItem", 1);
      return "💣 拆到完整炸彈 x1。";
    },
    () => {
      const id = pick(Object.keys(CONFIG.minorBuffs), random);
      challenge.miniTraits[id] = (challenge.miniTraits[id] || 0) + 1;
      return `🔧 臨時小詞條：${CONFIG.minorBuffs[id].label} +1。`;
    },
    () => {
      challenge.hp -= 1;
      addChallengeItem(challenge, "platinumOre", 2);
      return "⚠️ 硬挖危險礦心，受傷但得到鉑金礦石 x2。";
    }
  ];
  return pick(events, random)();
}

function createMerchant(challenge, random = Math.random) {
  const sellable = Object.entries(challenge.items)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id);
  const sellOffers = sample(sellable, 3, random).map((id) => ({
    id,
    amount: 1,
    price: Math.floor((45 + challenge.depth * 2 + random() * 80) * getModifierValue(challenge, "merchantMultiplier", 1))
  }));
  const miniTraitOffers = sample(Object.keys(CONFIG.minorBuffs), 2, random).map((id) => ({
    id,
    price: 140 + Math.floor(challenge.depth * 4 + random() * 120)
  }));
  const replacementTraits = random() < 0.45
    ? sample(getChallengeTraitPool().map((trait) => trait.id).filter((id) => id !== challenge.trait), 3, random)
      .map((id) => ({ id, price: 420 + Math.floor(challenge.depth * 8 + random() * 220) }))
    : [];
  return {
    depth: challenge.depth,
    sellOffers,
    potionPrice: 80 + Math.floor(challenge.depth * 2.5),
    miniTraitOffers,
    replacementTraits
  };
}

function maybeOpenMerchant(challenge, random = Math.random) {
  if (challenge.depth > 0 && challenge.depth % 20 === 0) {
    challenge.merchant = createMerchant(challenge, random);
    challenge.stats.merchants += 1;
    return "🧳 流浪商人出現。";
  }
  return "";
}

function mineChallengeRoute(playerInput, routeId, random = Math.random) {
  const player = getChallenge(playerInput);
  const challenge = player.challenge;
  if (!challenge || !challenge.active) return { player, message: "挑戰尚未開始。" };
  if (challenge.merchant) return { player, message: "流浪商人正在等你，先處理交易或略過。" };
  const route = challenge.routeOptions.find((option) => option.id === routeId);
  if (!route) return { player, message: "這條路線已經消失。" };

  challenge.depth += 1;
  const messages = [];
  const areaMessage = rotateChallengeArea(challenge, random);
  if (areaMessage) messages.push(areaMessage);
  messages.push(applyRouteResult(challenge, route, random));
  const merchantMessage = challenge.hp > 0 ? maybeOpenMerchant(challenge, random) : "";
  if (merchantMessage) messages.push(merchantMessage);

  if (challenge.hp <= 0) {
    return endChallenge(player, true, messages.join("\n"));
  }
  if (!challenge.merchant) challenge.routeOptions = generateChallengeRoutes(challenge, random);
  challenge.lastMessage = messages.filter(Boolean).join("\n");
  return { player, message: challenge.lastMessage };
}

function drinkChallengePotion(playerInput) {
  const player = getChallenge(playerInput);
  const challenge = player.challenge;
  if (!challenge || !challenge.active) return { player, message: "挑戰尚未開始。" };
  if (challenge.potions <= 0) return { player, message: "治療藥水用完了。" };
  if (challenge.hp >= challenge.maxHp) return { player, message: "生命已滿。" };
  challenge.potions -= 1;
  challenge.hp = Math.min(challenge.maxHp, challenge.hp + 1);
  challenge.lastMessage = "🧪 喝下治療藥水，回復 1 點生命。";
  return { player, message: challenge.lastMessage };
}

function handleMerchantAction(playerInput, action, value) {
  const player = getChallenge(playerInput);
  const challenge = player.challenge;
  if (!challenge || !challenge.active || !challenge.merchant) {
    return { player, message: "目前沒有流浪商人。" };
  }
  let message = "";
  if (action === "skip") {
    message = "你略過了流浪商人。";
  } else if (action === "sell") {
    const offer = challenge.merchant.sellOffers.find((item) => item.id === value);
    if (!offer || (challenge.items[value] || 0) < offer.amount) {
      return { player, message: "這個收購項目已不可用。" };
    }
    challenge.items[value] -= offer.amount;
    challenge.challengeGold += offer.price;
    message = `賣出 ${CHALLENGE_ITEM_LABELS[value]} x${offer.amount}，獲得 ${offer.price} 挑戰金幣。`;
  } else if (action === "buyPotion") {
    if (challenge.challengeGold < challenge.merchant.potionPrice) {
      return { player, message: "挑戰金幣不足。" };
    }
    challenge.challengeGold -= challenge.merchant.potionPrice;
    challenge.potions += 1;
    message = "購買治療藥水 x1。";
  } else if (action === "buyBuff") {
    const offer = challenge.merchant.miniTraitOffers.find((item) => item.id === value);
    if (!offer || challenge.challengeGold < offer.price) {
      return { player, message: "無法購買這個小詞條。" };
    }
    challenge.challengeGold -= offer.price;
    challenge.miniTraits[value] = (challenge.miniTraits[value] || 0) + 1;
    message = `購買小詞條：${CONFIG.minorBuffs[value].label}。`;
  } else if (action === "replaceTrait") {
    const offer = challenge.merchant.replacementTraits.find((item) => item.id === value);
    if (!offer || challenge.challengeGold < offer.price) {
      return { player, message: "無法替換這個大詞條。" };
    }
    challenge.challengeGold -= offer.price;
    challenge.trait = value;
    message = `大詞條替換為：${CONFIG.runModes[value].label}。`;
  }
  challenge.merchant = null;
  challenge.routeOptions = generateChallengeRoutes(challenge, Math.random);
  challenge.lastMessage = message;
  return { player, message };
}

function endChallenge(playerInput, died = false, extraMessage = "") {
  const player = getChallenge(playerInput);
  const challenge = player.challenge;
  if (!challenge) return { player, message: "沒有挑戰資料。" };
  const best = Math.max(player.challengeBestDepth || 0, challenge.depth || 0);
  const summary = [
    died ? "💀 挑戰結束" : "挑戰已離開",
    extraMessage,
    `最高深度：${challenge.depth}`,
    `區域：${CHALLENGE_AREAS[challenge.area].label}`,
    `爆擊：${challenge.stats.crits} 次`,
    "挑戰金幣已清空，不會帶回普通模式。"
  ].filter(Boolean).join("\n");
  player.challengeBestDepth = best;
  player.challenge = null;
  player.challengeTraitOptions = [];
  return { player, message: summary, ended: true };
}

function buildChallengeEmbed(playerInput, message = "", user = null) {
  const player = getChallenge(playerInput);
  const challenge = player.challenge;
  const embed = new EmbedBuilder().setColor(0xf59e0b);
  if (!challenge) {
    embed
      .setTitle("⛏️【挖礦挑戰】")
      .setDescription("使用 /挖礦挑戰 開啟高強度挑戰。");
    return embed;
  }

  const titleSuffix = challenge.pending ? "準備" : challenge.active ? "進行中" : "結束";
  embed.setTitle(`⛏️【挖礦挑戰｜${titleSuffix}】`);
  if (user) embed.setFooter({ text: `玩家：${user.username}` });

  const traitText = challenge.trait
    ? `${CONFIG.runModes[challenge.trait].label}｜${CONFIG.runModes[challenge.trait].shortDescription || "特殊玩法"}`
    : "尚未選擇";
  const modifierText = challenge.modifiers.map((id) => `${MODIFIERS[id].emoji}${MODIFIERS[id].label}`).join(" ｜ ");
  const area = CHALLENGE_AREAS[challenge.area] || CHALLENGE_AREAS.normal;
  const status = [
    `生命：${"❤️".repeat(Math.max(0, Math.ceil(challenge.hp)))} ${challenge.hp}/${challenge.maxHp}`,
    `深度：${challenge.depth} ｜ 最高${player.challengeBestDepth || 0}`,
    `區域：${area.emoji} ${area.label}`,
    `挑戰金幣：${challenge.challengeGold}`,
    `藥水：🧪${challenge.potions}`,
    `大詞條：${traitText}`,
    `Modifier：${modifierText || "無"}`
  ].join("\n");
  embed.addFields({ name: "狀態", value: status });

  if (challenge.pending) {
    const traitOptions = getChallengeTraitPool().slice(0, 10)
      .map((trait, index) => `${index + 1}. ${trait.label}｜${trait.description}`)
      .join("\n");
    embed.addFields({ name: "選擇大詞條", value: traitOptions || "無" });
  } else if (challenge.merchant) {
    const merchantLines = [
      "🧳 流浪商人",
      challenge.merchant.sellOffers.length
        ? `收購：${challenge.merchant.sellOffers.map((offer) => `${CHALLENGE_ITEM_LABELS[offer.id]} ${offer.price}`).join("｜")}`
        : "收購：沒有可賣物品",
      `藥水：${challenge.merchant.potionPrice}`,
      `小詞條：${challenge.merchant.miniTraitOffers.map((offer) => `${CONFIG.minorBuffs[offer.id].label} ${offer.price}`).join("｜") || "無"}`,
      `大詞條替換：${challenge.merchant.replacementTraits.map((offer) => `${CONFIG.runModes[offer.id].label} ${offer.price}`).join("｜") || "本次無"}`
    ];
    embed.addFields({ name: "商人", value: merchantLines.join("\n").slice(0, 1024) });
  } else {
    const routes = challenge.routeOptions.map((route) => {
      const type = ROUTE_TYPES[route.type];
      return `${ROUTE_LABELS[route.id]}：${type.emoji}${route.label}`;
    }).join(" ｜ ") || "無";
    embed.addFields({ name: "路線", value: routes });
  }

  const itemLines = Object.entries(challenge.items)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${CHALLENGE_ITEM_LABELS[id]} x${amount}`);
  embed.addFields({ name: "資源", value: itemLines.length ? itemLines.join("｜").slice(0, 1024) : "無" });
  embed.addFields({ name: "訊息", value: (message || challenge.lastMessage || "無").slice(0, 1024) });
  return embed;
}

function ownerIdFromCustomId(customId) {
  const parts = String(customId || "").split(":");
  return parts[2] || "";
}

function challengeId(action, userId, value = "") {
  return [CHALLENGE_PREFIX, action, userId, value].filter((part) => part !== "").join(":");
}

function buildChallengeComponents(playerInput, userId) {
  const player = getChallenge(playerInput);
  const challenge = player.challenge;
  if (!challenge) return [];

  if (challenge.pending) {
    const traitOptions = getChallengeTraitPool().map((trait) => ({
      label: trait.label.slice(0, 100),
      value: trait.id,
      description: trait.description.slice(0, 100)
    }));
    return [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(challengeId("trait", userId))
          .setPlaceholder("選擇初始大詞條")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(traitOptions)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(challengeId("start", userId)).setLabel("開始挑戰").setEmoji("⛏️").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(challengeId("leaderboard", userId)).setLabel("排行榜").setEmoji("🏆").setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  if (challenge.merchant) {
    const rows = [];
    const sellButtons = challenge.merchant.sellOffers.slice(0, 3).map((offer) => (
      new ButtonBuilder()
        .setCustomId(challengeId("sell", userId, offer.id))
        .setLabel(`賣${CHALLENGE_ITEM_LABELS[offer.id]} ${offer.price}`)
        .setStyle(ButtonStyle.Success)
    ));
    if (sellButtons.length) rows.push(new ActionRowBuilder().addComponents(sellButtons));
    const buyButtons = [
      new ButtonBuilder().setCustomId(challengeId("buyPotion", userId)).setLabel(`藥水 ${challenge.merchant.potionPrice}`).setEmoji("🧪").setStyle(ButtonStyle.Primary),
      ...challenge.merchant.miniTraitOffers.slice(0, 2).map((offer) => (
        new ButtonBuilder()
          .setCustomId(challengeId("buyBuff", userId, offer.id))
          .setLabel(`${CONFIG.minorBuffs[offer.id].label} ${offer.price}`)
          .setStyle(ButtonStyle.Secondary)
      ))
    ].slice(0, 5);
    rows.push(new ActionRowBuilder().addComponents(buyButtons));
    if (challenge.merchant.replacementTraits.length) {
      rows.push(new ActionRowBuilder().addComponents(challenge.merchant.replacementTraits.slice(0, 3).map((offer) => (
        new ButtonBuilder()
          .setCustomId(challengeId("replaceTrait", userId, offer.id))
          .setLabel(`換${CONFIG.runModes[offer.id].label}`)
          .setStyle(ButtonStyle.Danger)
      ))));
    }
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(challengeId("skip", userId)).setLabel("離開商人").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
    ));
    return rows;
  }

  const routeButtons = challenge.routeOptions.map((route) => {
    const type = ROUTE_TYPES[route.type];
    return new ButtonBuilder()
      .setCustomId(challengeId("route", userId, route.id))
      .setLabel(`${ROUTE_LABELS[route.id]} ${route.label}`)
      .setEmoji(type.emoji)
      .setStyle(route.type === "risky" || route.type === "deep" ? ButtonStyle.Danger : ButtonStyle.Primary);
  });
  return [
    new ActionRowBuilder().addComponents(routeButtons),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(challengeId("potion", userId)).setLabel("喝藥水").setEmoji("🧪").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(challengeId("leaderboard", userId)).setLabel("排行榜").setEmoji("🏆").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(challengeId("leave", userId)).setLabel("離開挑戰").setEmoji("💀").setStyle(ButtonStyle.Danger)
    )
  ];
}

function isChallengeComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${CHALLENGE_PREFIX}:`);
}

function parseChallengeCustomId(customId) {
  const [, action, userId, value] = String(customId || "").split(":");
  return { action, userId, value };
}

function buildChallengeLeaderboardEmbed(players) {
  const rows = Object.entries(players || {})
    .map(([userId, player]) => ({ userId, depth: Math.max(0, Math.floor(player && player.challengeBestDepth || 0)) }))
    .filter((row) => row.depth > 0)
    .sort((a, b) => b.depth - a.depth)
    .slice(0, 10);
  const embed = new EmbedBuilder()
    .setTitle("🏆【層數挑戰排行榜】")
    .setColor(0xfacc15)
    .setDescription(rows.length
      ? rows.map((row, index) => `${index + 1}. <@${row.userId}>：${row.depth} 層`).join("\n")
      : "目前還沒有挑戰紀錄。");
  return embed;
}

module.exports = {
  CHALLENGE_AREAS,
  CHALLENGE_ITEM_LABELS,
  MODIFIERS,
  buildChallengeComponents,
  buildChallengeEmbed,
  buildChallengeLeaderboardEmbed,
  chooseChallengeTrait,
  createChallengeSetup,
  drinkChallengePotion,
  endChallenge,
  generateChallengeRoutes,
  getChallenge,
  handleMerchantAction,
  isChallengeComponent,
  mineChallengeRoute,
  normalizeChallengeState,
  parseChallengeCustomId,
  startChallenge,
  ownerIdFromCustomId
};

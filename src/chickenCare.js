"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getPlayer } = require("./playerState");

const CHICKEN_PK_PREFIX = "chicken_pk";
const CHICKEN_UPGRADE_PREFIX = "chicken_upgrade";
const CHICKEN_PANEL_PREFIX = "chicken_panel";
const PK_FRAME_COUNT = 6;
const PK_TRACK_LENGTH = 14;
const PK_TIMEOUT_MS = 60 * 1000;
const PK_COOLDOWN_MS = 30 * 1000;

const PERSONALITIES = [
  { id: "charger", label: "🔥 暴衝型", speed: 1, sprint: 2, stability: -1, stamina: -1, openBurst: 0.18, latePenalty: 0.25 },
  { id: "veteran", label: "🐢 老油條", speed: -1, sprint: 0, stability: 2, stamina: 2, comeback: 0.18 },
  { id: "gambler", label: "🎲 賭狗型", speed: 0, sprint: 1, stability: -1, stamina: 0, swing: 0.35 },
  { id: "sleepy", label: "😴 睡覺型", speed: -1, sprint: 1, stability: 0, stamina: 2, late: 0.35 },
  { id: "sneaky", label: "😈 陰險型", speed: 0, sprint: 0, stability: 1, stamina: 0, interfere: 0.22 },
  { id: "madDog", label: "💀 瘋狗型", speed: 1, sprint: 3, stability: -2, stamina: -1, failRisk: 0.22 },
  { id: "steady", label: "🛡️ 穩健型", speed: 0, sprint: -1, stability: 3, stamina: 1, resist: 0.28 },
  { id: "chosen", label: "✨ 天選型", speed: 1, sprint: 1, stability: 1, stamina: 1, rare: 0.12 }
];

const BASE_NAMES = ["小咕", "阿雞", "咕咕", "雞腿", "金冠", "小翅"];
const CHICKEN_ICONS = ["🐔", "🐓", "🐤", "🦃", "🦆", "🦚", "🐧", "🪽"];
const EVOLUTION_TYPES = {
  blaze: {
    name: "爆炎雞",
    icon: "🐓🔥",
    activeSkill: "blazeDash",
    passiveSkill: "hotStart",
    title: "爆炎新星",
    entryEffect: "🔥 火羽劃過賽道。",
    pointKey: "blaze",
    mature: { minLevel: 6, minWins: 0, minPoints: 3 },
    complete: { minLevel: 16, minWins: 8, minPoints: 12 }
  },
  iron: {
    name: "鐵壁雞",
    icon: "🐔🛡️",
    activeSkill: "guardStep",
    passiveSkill: "stableSteps",
    title: "鐵壁守門員",
    entryEffect: "🛡️ 牠踏上賽道，腳步穩得嚇人。",
    pointKey: "iron",
    mature: { minLevel: 6, minWins: 0, minPoints: 3 },
    complete: { minLevel: 16, minWins: 8, minPoints: 12 }
  },
  miracle: {
    name: "奇蹟雞",
    icon: "🐤✨",
    activeSkill: "miracleComeback",
    passiveSkill: "lastHope",
    title: "逆轉之星",
    entryEffect: "✨ 觀眾開始期待奇蹟。",
    pointKey: "miracle",
    mature: { minLevel: 6, minWins: 3, minPoints: 4 },
    complete: { minLevel: 16, minWins: 12, minPoints: 14 }
  },
  trickster: {
    name: "惡作劇雞",
    icon: "🐓😈",
    activeSkill: "disruptCrow",
    passiveSkill: "sneakyPeck",
    title: "賽道惡作劇王",
    entryEffect: "😈 牠看起來準備做壞事。",
    pointKey: "trickster",
    mature: { minLevel: 6, minWins: 2, minPoints: 4 },
    complete: { minLevel: 16, minWins: 10, minPoints: 14 }
  },
  gale: {
    name: "疾風雞",
    icon: "🐓💨",
    activeSkill: "galeRush",
    passiveSkill: "lightSteps",
    title: "疾風跑者",
    entryEffect: "💨 羽毛一閃，牠已經衝出去了。",
    pointKey: "gale",
    mature: { minLevel: 6, minWins: 1, minPoints: 4 },
    complete: { minLevel: 16, minWins: 9, minPoints: 13 }
  },
  crown: {
    name: "金冠雞",
    icon: "🐔👑",
    activeSkill: "royalPace",
    passiveSkill: "winnerAura",
    title: "金冠勝者",
    entryEffect: "👑 牠昂首進場，像是早就知道結果。",
    pointKey: "crown",
    mature: { minLevel: 6, minWins: 5, minPoints: 5 },
    complete: { minLevel: 16, minWins: 18, minPoints: 16 }
  },
  thunder: {
    name: "雷鳴雞",
    icon: "🐓⚡",
    activeSkill: "thunderKick",
    passiveSkill: "sparkFeather",
    title: "雷鳴衝線王",
    entryEffect: "⚡ 賽道邊響起細小的電光。",
    pointKey: "thunder",
    mature: { minLevel: 6, minWins: 2, minPoints: 5 },
    complete: { minLevel: 16, minWins: 11, minPoints: 15 }
  },
  shadow: {
    name: "夜影雞",
    icon: "🐔🌑",
    activeSkill: "shadowSlip",
    passiveSkill: "quietStep",
    title: "夜影奇襲者",
    entryEffect: "🌑 牠低著身子，悄悄貼近內線。",
    pointKey: "shadow",
    mature: { minLevel: 6, minWins: 2, minPoints: 4 },
    complete: { minLevel: 16, minWins: 10, minPoints: 14 }
  },
  crystal: {
    name: "水晶雞",
    icon: "🐤💎",
    activeSkill: "crystalFocus",
    passiveSkill: "clearMind",
    title: "水晶預言者",
    entryEffect: "💎 牠的羽毛反射出奇妙光芒。",
    pointKey: "crystal",
    mature: { minLevel: 6, minWins: 3, minPoints: 4 },
    complete: { minLevel: 16, minWins: 12, minPoints: 14 }
  },
  mud: {
    name: "泥巴雞",
    icon: "🐔🟫",
    activeSkill: "mudRoll",
    passiveSkill: "heavyFeather",
    title: "泥地常客",
    entryEffect: "🟫 牠踩著滿腳泥巴進場。",
    pointKey: "clumsy",
    weak: true,
    mature: { minLevel: 6, minWins: 0, minPoints: 5 },
    complete: { minLevel: 16, minWins: 3, minPoints: 18 }
  },
  paper: {
    name: "紙箱雞",
    icon: "🐤📦",
    activeSkill: "boxHide",
    passiveSkill: "paperWing",
    title: "紙箱勇者",
    entryEffect: "📦 牠躲在紙箱裡，只露出一點點眼神。",
    pointKey: "clumsy",
    weak: true,
    mature: { minLevel: 6, minWins: 0, minPoints: 7 },
    complete: { minLevel: 16, minWins: 4, minPoints: 20 }
  },
  lost: {
    name: "迷路雞",
    icon: "🐔❓",
    activeSkill: "wrongWay",
    passiveSkill: "lostAgain",
    title: "迷路傳說",
    entryEffect: "❓ 牠好像不是從正確入口進場的。",
    pointKey: "clumsy",
    weak: true,
    mature: { minLevel: 6, minWins: 0, minPoints: 8 },
    complete: { minLevel: 16, minWins: 5, minPoints: 22 }
  },
  mineCrystal: {
    name: "礦晶雞",
    icon: "🐔💎",
    activeSkill: "crystalPeck",
    passiveSkill: "mineSense",
    title: "礦晶尋路者",
    entryEffect: "💎 牠的羽毛像礦脈一樣閃光。",
    pointKey: "mine",
    special: true,
    mature: { minLevel: 6, minWins: 2, minPoints: 4 },
    complete: { minLevel: 16, minWins: 10, minPoints: 14 }
  },
  rustFeather: {
    name: "鏽羽雞",
    icon: "🐓🟧",
    activeSkill: "rustScratch",
    passiveSkill: "oldMineMemory",
    title: "古礦鏽羽",
    entryEffect: "🟧 鏽色羽毛擦過地面，留下細碎火星。",
    pointKey: "mine",
    special: true,
    mature: { minLevel: 6, minWins: 1, minPoints: 5 },
    complete: { minLevel: 16, minWins: 8, minPoints: 15 }
  },
  abyssEcho: {
    name: "深鳴雞",
    icon: "🐓🌌",
    activeSkill: "abyssCry",
    passiveSkill: "deepEcho",
    title: "深層回音",
    entryEffect: "🌌 牠一叫，賽道像礦坑一樣回音不斷。",
    pointKey: "mine",
    special: true,
    mature: { minLevel: 6, minWins: 3, minPoints: 5 },
    complete: { minLevel: 16, minWins: 12, minPoints: 16 }
  }
};

const CHICKEN_SKILLS = {
  blazeDash: { name: "爆炎衝刺", text: "終點前有機率大加速" },
  hotStart: { name: "火羽開局", text: "前段偶爾爆衝" },
  guardStep: { name: "鐵壁步伐", text: "跌倒時高機率硬扛" },
  stableSteps: { name: "穩定步伐", text: "負面事件更容易抵抗" },
  miracleComeback: { name: "奇蹟逆轉", text: "落後時終盤爆衝" },
  lastHope: { name: "最後希望", text: "最後一名時額外加速" },
  disruptCrow: { name: "干擾鳴叫", text: "干擾時讓對手更慢" },
  sneakyPeck: { name: "偷啄", text: "偶爾偷走對手節奏" },
  galeRush: { name: "疾風衝刺", text: "直線衝刺更強" },
  lightSteps: { name: "輕羽步", text: "跌倒懲罰較小" },
  royalPace: { name: "王者節奏", text: "領先時更穩" },
  winnerAura: { name: "勝者氣場", text: "連勝時表現更好" },
  thunderKick: { name: "雷鳴一蹬", text: "爆衝事件更猛" },
  sparkFeather: { name: "電羽", text: "偶爾突然加速" },
  shadowSlip: { name: "影步", text: "干擾事件更靈活" },
  quietStep: { name: "靜步", text: "被干擾時較穩" },
  crystalFocus: { name: "水晶專注", text: "終盤事件較穩定" },
  clearMind: { name: "澄心", text: "混亂時較不失速" },
  mudRoll: { name: "泥巴翻滾", text: "跌倒後小幅補速" },
  heavyFeather: { name: "沉重羽毛", text: "前段速度下降" },
  boxHide: { name: "紙箱躲避", text: "偶爾躲過干擾" },
  paperWing: { name: "紙翅膀", text: "衝刺不穩定" },
  wrongWay: { name: "跑錯邊", text: "可能爆笑失速" },
  lostAgain: { name: "又迷路", text: "路線波動更大" },
  crystalPeck: { name: "礦晶啄擊", text: "挖到節奏時會爆衝" },
  mineSense: { name: "礦脈感知", text: "賽道事件更容易吃到好結果" },
  rustScratch: { name: "鏽羽刮擊", text: "干擾時有額外拖慢" },
  oldMineMemory: { name: "老礦記憶", text: "中後段更穩" },
  abyssCry: { name: "深鳴", text: "落後時大幅追趕" },
  deepEcho: { name: "深層回音", text: "後段爆發更強" }
};

const BOSS_CHICKENS = [
  {
    id: "ironCrown",
    name: "鐵冠雞",
    icon: "🐓👑",
    title: "鐵冠館主",
    personalityId: "steady",
    level: 10,
    speed: 9,
    sprint: 7,
    stability: 16,
    stamina: 12,
    evolutionType: "iron",
    activeSkill: "guardStep",
    passiveSkill: "stableSteps",
    rewardTitle: "鐵冠挑戰者"
  },
  {
    id: "tyrant",
    name: "暴君雞",
    icon: "🐓🔥",
    title: "暴君館主",
    personalityId: "madDog",
    level: 12,
    speed: 11,
    sprint: 17,
    stability: 7,
    stamina: 10,
    evolutionType: "blaze",
    activeSkill: "blazeDash",
    passiveSkill: "hotStart",
    rewardTitle: "暴君剋星"
  },
  {
    id: "miracle",
    name: "奇蹟雞",
    icon: "🐤✨",
    title: "奇蹟館主",
    personalityId: "chosen",
    level: 12,
    speed: 10,
    sprint: 12,
    stability: 10,
    stamina: 16,
    evolutionType: "miracle",
    activeSkill: "miracleComeback",
    passiveSkill: "lastHope",
    rewardTitle: "深淵賽雞王"
  }
];

const activeChickenBattles = new Map();
const activeBattleByPlayerId = new Map();
const chickenPvpCooldowns = new Map();

function getEvolutionPointKeys() {
  return [...new Set(Object.values(EVOLUTION_TYPES).map((type) => type.pointKey).filter(Boolean))];
}

function clampStat(value) {
  return Math.max(1, Math.min(20, Math.floor(value || 1)));
}

function getPersonality(id) {
  return PERSONALITIES.find((item) => item.id === id) || PERSONALITIES[0];
}

function createEvolutionPoints(input = {}) {
  return Object.fromEntries(getEvolutionPointKeys().map((key) => [
    key,
    Math.max(0, Math.floor(input[key] || 0))
  ]));
}

function normalizeChickenArray(input, limit = 12) {
  return Array.isArray(input)
    ? input.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).slice(0, limit)
    : [];
}

function normalizeChickenMeta(chicken) {
  if (!chicken || typeof chicken !== "object") return chicken;
  chicken.evolutionPoints = createEvolutionPoints(chicken.evolutionPoints);
  chicken.evolutionType = EVOLUTION_TYPES[chicken.evolutionType] ? chicken.evolutionType : null;
  chicken.activeSkill = CHICKEN_SKILLS[chicken.activeSkill] ? chicken.activeSkill : null;
  chicken.passiveSkill = CHICKEN_SKILLS[chicken.passiveSkill] ? chicken.passiveSkill : null;
  chicken.highestComeback = Math.max(0, Math.floor(chicken.highestComeback || 0));
  chicken.currentWinStreak = Math.max(0, Math.floor(chicken.currentWinStreak || 0));
  chicken.longestWinStreak = Math.max(0, Math.floor(chicken.longestWinStreak || 0));
  chicken.bossWins = Math.max(0, Math.floor(chicken.bossWins || 0));
  chicken.titles = normalizeChickenArray(chicken.titles);
  chicken.frame = typeof chicken.frame === "string" ? chicken.frame : "";
  chicken.entryEffect = typeof chicken.entryEffect === "string" ? chicken.entryEffect : "";
  return chicken;
}

function makeOwnedChicken(random = Math.random) {
  const personality = PERSONALITIES[Math.floor(random() * PERSONALITIES.length)] || PERSONALITIES[0];
  const roll = () => 4 + Math.floor(random() * 4);
  return {
    id: `${Date.now()}-${Math.floor(random() * 100000)}`,
    name: BASE_NAMES[Math.floor(random() * BASE_NAMES.length)] || "小咕",
    icon: CHICKEN_ICONS[Math.floor(random() * CHICKEN_ICONS.length)] || "🐔",
    personalityId: personality.id,
    level: 1,
    exp: 0,
    speed: clampStat(roll() + personality.speed),
    sprint: clampStat(roll() + personality.sprint),
    stability: clampStat(roll() + personality.stability),
    stamina: clampStat(roll() + personality.stamina),
    wins: 0,
    races: 0,
    highestComeback: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    bossWins: 0,
    evolutionPoints: createEvolutionPoints(),
    evolutionType: null,
    activeSkill: null,
    passiveSkill: null,
    titles: [],
    frame: "",
    entryEffect: "",
    levelUpOptions: []
  };
}

function makeWildMineChicken(depth = 1, random = Math.random) {
  const specialTypes = Object.entries(EVOLUTION_TYPES)
    .filter(([, type]) => type.special)
    .map(([id]) => id);
  const evolutionType = specialTypes[Math.floor(random() * specialTypes.length)] || "mineCrystal";
  const evolution = EVOLUTION_TYPES[evolutionType];
  const personalityIds = ["steady", "veteran", "chosen", "sneaky", "gambler"];
  const personality = getPersonality(personalityIds[Math.floor(random() * personalityIds.length)] || "steady");
  const depthBonus = Math.min(5, Math.floor(Math.max(0, depth || 0) / 20));
  const rollStat = () => clampStat(7 + depthBonus + Math.floor(random() * 6));
  const chicken = {
    id: `mine-${Date.now()}-${Math.floor(random() * 100000)}`,
    name: ["礦坑小咕", "晶羽", "鏽鏽", "深層咕", "岩壁跑者"][Math.floor(random() * 5)] || "礦坑小咕",
    icon: evolution.icon,
    personalityId: personality.id,
    level: 1,
    exp: 0,
    speed: clampStat(rollStat() + personality.speed),
    sprint: clampStat(rollStat() + personality.sprint),
    stability: clampStat(rollStat() + personality.stability),
    stamina: clampStat(rollStat() + personality.stamina),
    wins: 0,
    races: 0,
    highestComeback: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    bossWins: 0,
    evolutionPoints: createEvolutionPoints({ [evolution.pointKey]: 6 + depthBonus }),
    evolutionType,
    activeSkill: evolution.activeSkill,
    passiveSkill: evolution.passiveSkill,
    titles: ["礦坑邂逅"],
    frame: "",
    entryEffect: "⛏️ 牠是在礦洞裡被你抓到的特殊雞。",
    levelUpOptions: [],
    origin: "mine"
  };
  return normalizeChickenMeta(chicken);
}

function normalizeOwnedChicken(input) {
  if (!input || typeof input !== "object") return null;
  const personality = getPersonality(input.personalityId);
  return normalizeChickenMeta({
    id: input.id || `${Date.now()}-legacy`,
    name: String(input.name || "小咕").slice(0, 12),
    icon: typeof input.icon === "string" && input.icon ? input.icon : "🐔",
    personalityId: personality.id,
    level: Math.max(1, Math.floor(input.level || 1)),
    exp: Math.max(0, Math.floor(input.exp || 0)),
    speed: clampStat(input.speed || 5),
    sprint: clampStat(input.sprint || 5),
    stability: clampStat(input.stability || 5),
    stamina: clampStat(input.stamina || 5),
    wins: Math.max(0, Math.floor(input.wins || 0)),
    races: Math.max(0, Math.floor(input.races || 0)),
    levelUpOptions: Array.isArray(input.levelUpOptions)
      ? input.levelUpOptions.filter((id) => getUpgradePool().some((option) => option.id === id)).slice(0, 3)
      : [],
    highestComeback: Math.max(0, Math.floor(input.highestComeback || 0)),
    currentWinStreak: Math.max(0, Math.floor(input.currentWinStreak || 0)),
    longestWinStreak: Math.max(0, Math.floor(input.longestWinStreak || 0)),
    bossWins: Math.max(0, Math.floor(input.bossWins || 0)),
    evolutionPoints: createEvolutionPoints(input.evolutionPoints),
    evolutionType: EVOLUTION_TYPES[input.evolutionType] ? input.evolutionType : null,
    activeSkill: CHICKEN_SKILLS[input.activeSkill] ? input.activeSkill : null,
    passiveSkill: CHICKEN_SKILLS[input.passiveSkill] ? input.passiveSkill : null,
    titles: normalizeChickenArray(input.titles),
    frame: typeof input.frame === "string" ? input.frame : "",
    entryEffect: typeof input.entryEffect === "string" ? input.entryEffect : "",
    origin: typeof input.origin === "string" ? input.origin : ""
  });
}

function ensureOwnedChicken(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  if (!player.ownedChicken) player.ownedChicken = makeOwnedChicken(random);
  return player;
}

function sanitizeChickenName(name) {
  const cleaned = String(name || "").trim().replace(/[^\p{L}\p{N}_\-\u4e00-\u9fffぁ-んァ-ンㄅ-ㄩ]/gu, "");
  const banned = ["幹", "操", "死"];
  if (cleaned.length < 2 || cleaned.length > 12) return null;
  if (banned.some((word) => cleaned.includes(word))) return null;
  return cleaned;
}

function renameChicken(playerInput, name, random = Math.random) {
  const player = ensureOwnedChicken(playerInput, random);
  const cleaned = sanitizeChickenName(name);
  if (!cleaned) return { ok: false, player, message: "雞名需要 2~12 字，不能空白或包含特殊符號。" };
  player.ownedChicken.name = cleaned;
  return { ok: true, player, message: `🐔 你的雞現在叫做：\n「${cleaned}」` };
}

function getChickenRequiredExp(chickenOrLevel) {
  const level = Math.max(1, Math.floor(typeof chickenOrLevel === "number" ? chickenOrLevel : chickenOrLevel.level || 1));
  const earlyCurve = {
    1: 100,
    2: 180,
    3: 300,
    4: 500,
    5: 800
  };
  if (earlyCurve[level]) return earlyCurve[level];
  return Math.floor(800 * Math.pow(1.28, level - 5) + (level - 5) * 120);
}

function getExpToLevel(chicken) {
  return getChickenRequiredExp(chicken);
}

function getChickenStage(chicken) {
  const level = Math.max(1, Math.floor(chicken && chicken.level ? chicken.level : 1));
  if (level <= 5) return { id: "young", label: "🐤 幼雞期" };
  if (level <= 15) return { id: "mature", label: "🐔 成熟期" };
  return { id: "complete", label: "🐓✨ 完全體" };
}

function determineEvolutionType(chicken) {
  normalizeChickenMeta(chicken);
  const points = chicken.evolutionPoints;
  const losses = Math.max(0, (chicken.races || 0) - (chicken.wins || 0));
  const statBias = {
    blaze: points.blaze + chicken.sprint + Math.floor(chicken.speed / 2),
    iron: points.iron + chicken.stability + Math.floor(chicken.stamina / 2),
    miracle: points.miracle + chicken.stamina + Math.floor(chicken.sprint / 2) + Math.floor((chicken.highestComeback || 0) / 2),
    trickster: points.trickster + Math.floor(chicken.stability / 2) + Math.floor(chicken.sprint / 3),
    gale: points.gale + chicken.speed + Math.floor(chicken.sprint / 2),
    crown: points.crown + (chicken.wins || 0) * 2 + Math.floor((chicken.longestWinStreak || 0) * 1.5),
    thunder: points.thunder + chicken.sprint + Math.floor((points.blaze || 0) / 2),
    shadow: points.shadow + (points.trickster || 0) + Math.floor(chicken.speed / 2),
    crystal: points.crystal + (points.miracle || 0) + Math.floor(chicken.stamina / 2),
    mud: points.clumsy + losses + Math.max(0, 7 - chicken.speed) + Math.max(0, 7 - chicken.stability),
    paper: points.clumsy + Math.floor(losses * 1.2) + Math.max(0, 8 - chicken.stamina) + Math.max(0, 8 - chicken.stability),
    lost: points.clumsy + losses + Math.max(0, 8 - chicken.speed) + Math.max(0, 8 - chicken.stamina)
  };
  const personalityBias = {
    charger: "blaze",
    madDog: "blaze",
    steady: "iron",
    veteran: "iron",
    sleepy: "miracle",
    chosen: "miracle",
    sneaky: "trickster",
    gambler: "miracle"
  }[chicken.personalityId];
  if (personalityBias) statBias[personalityBias] += 3;
  if (chicken.speed >= 11) statBias.gale += 2;
  if (chicken.sprint >= 12) statBias.thunder += 2;
  if ((chicken.wins || 0) >= 5) statBias.crown += 3;
  if (chicken.personalityId === "chosen") statBias.crystal += 2;
  if (chicken.personalityId === "sneaky") statBias.shadow += 2;
  const weakTypes = Object.entries(EVOLUTION_TYPES).filter(([, type]) => type.weak).map(([id]) => id);
  const weakScore = Math.max(...weakTypes.map((id) => statBias[id] || 0));
  const bestNormal = Object.entries(statBias)
    .filter(([id]) => !EVOLUTION_TYPES[id].weak)
    .sort((a, b) => b[1] - a[1])[0];
  if (losses >= 4 && (points.clumsy || 0) >= 5 && weakScore >= (bestNormal ? bestNormal[1] + 2 : 0)) {
    return weakTypes.sort((a, b) => (statBias[b] || 0) - (statBias[a] || 0))[0];
  }
  return bestNormal[0];
}

function getEvolutionRequirement(type, phase = "mature") {
  const evolution = EVOLUTION_TYPES[type];
  if (!evolution) return null;
  return evolution[phase] || null;
}

function getEvolutionMissingRequirements(chicken, type, phase = "mature") {
  normalizeChickenMeta(chicken);
  const evolution = EVOLUTION_TYPES[type];
  const requirement = getEvolutionRequirement(type, phase);
  if (!evolution || !requirement) return ["找不到進化條件"];
  const points = chicken.evolutionPoints[evolution.pointKey] || 0;
  const missing = [];
  if (chicken.level < requirement.minLevel) missing.push(`等級 ${chicken.level}/${requirement.minLevel}`);
  if (chicken.wins < requirement.minWins) missing.push(`勝場 ${chicken.wins}/${requirement.minWins}`);
  if (points < requirement.minPoints) missing.push(`${evolution.name}傾向 ${points}/${requirement.minPoints}`);
  return missing;
}

function canEvolveTo(chicken, type, phase = "mature") {
  return getEvolutionMissingRequirements(chicken, type, phase).length === 0;
}

function buildEvolutionProgress(chicken) {
  normalizeChickenMeta(chicken);
  const targetType = chicken.evolutionType || determineEvolutionType(chicken);
  const evolution = EVOLUTION_TYPES[targetType];
  if (!evolution) return "進化條件：無";
  if (!chicken.evolutionType) {
    const missing = getEvolutionMissingRequirements(chicken, targetType, "mature");
    return missing.length
      ? `進化目標：${evolution.name}\n還差：${missing.join("｜")}`
      : `進化目標：${evolution.name}\n條件已達成，下次獲得經驗或比賽結算時進化`;
  }
  if (!chicken.titles.includes(evolution.title)) {
    const missing = getEvolutionMissingRequirements(chicken, chicken.evolutionType, "complete");
    return missing.length
      ? `完全體：${evolution.title}\n還差：${missing.join("｜")}`
      : `完全體：${evolution.title}\n條件已達成，下次獲得經驗或比賽結算時進化`;
  }
  return `完全體：${evolution.title}｜已完成`;
}

function buildEvolutionCandidateSummary(chicken) {
  normalizeChickenMeta(chicken);
  if (chicken.evolutionType) return "";
  const points = chicken.evolutionPoints;
  const candidates = Object.entries(EVOLUTION_TYPES)
    .map(([id, type]) => {
      const point = points[type.pointKey] || 0;
      const winBonus = id === "crown" ? (chicken.wins || 0) * 2 : 0;
      const weakBonus = type.weak ? Math.max(0, (chicken.races || 0) - (chicken.wins || 0)) : 0;
      return { id, type, score: point + winBonus + weakBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ type }) => `${type.weak ? "⚠️" : "✨"}${type.name}`);
  return `可能進化：${candidates.join("｜")}`;
}

function applyChickenEvolution(chicken) {
  normalizeChickenMeta(chicken);
  const nextType = chicken.evolutionType || determineEvolutionType(chicken);
  const evolution = EVOLUTION_TYPES[nextType];
  if (!evolution) return "";
  if (!chicken.evolutionType && !canEvolveTo(chicken, nextType, "mature")) return "";
  const firstEvolution = chicken.evolutionType !== nextType;
  const wasComplete = chicken.titles.includes(evolution.title);
  chicken.evolutionType = nextType;
  chicken.activeSkill = chicken.activeSkill || evolution.activeSkill;
  chicken.passiveSkill = chicken.passiveSkill || evolution.passiveSkill;
  if (canEvolveTo(chicken, nextType, "complete")) {
    chicken.icon = evolution.icon;
    chicken.frame = chicken.frame || evolution.title;
    chicken.entryEffect = chicken.entryEffect || evolution.entryEffect;
    if (!chicken.titles.includes(evolution.title)) chicken.titles.push(evolution.title);
  }
  if (firstEvolution) return `✨ ${chicken.name} 進化成 ${evolution.name}！`;
  if (chicken.level >= 16 && !wasComplete) return `🐓✨ ${chicken.name} 進入完全體！`;
  return "";
}

function getUpgradePool() {
  return [
    { id: "speed", label: "速度 +1", apply: (chicken) => { chicken.speed = clampStat(chicken.speed + 1); } },
    { id: "sprint", label: "衝刺 +1", apply: (chicken) => { chicken.sprint = clampStat(chicken.sprint + 1); } },
    { id: "stability", label: "穩定 +1", apply: (chicken) => { chicken.stability = clampStat(chicken.stability + 1); } },
    { id: "stamina", label: "耐力 +1", apply: (chicken) => { chicken.stamina = clampStat(chicken.stamina + 1); } },
    { id: "balanced", label: "速度/穩定 +1", apply: (chicken) => {
      chicken.speed = clampStat(chicken.speed + 1);
      chicken.stability = clampStat(chicken.stability + 1);
    } },
    { id: "finisher", label: "衝刺/耐力 +1", apply: (chicken) => {
      chicken.sprint = clampStat(chicken.sprint + 1);
      chicken.stamina = clampStat(chicken.stamina + 1);
    } }
  ];
}

function rollUpgradeOptions(random = Math.random) {
  const pool = getUpgradePool();
  const options = [];
  while (options.length < 3 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    options.push(pool.splice(index, 1)[0].id);
  }
  return options;
}

function addChickenExp(player, amount, random = Math.random) {
  const chicken = player.ownedChicken;
  if (!chicken) return "";
  normalizeChickenMeta(chicken);
  chicken.exp += Math.max(0, Math.floor(amount || 0));
  const messages = [];
  while (chicken.exp >= getExpToLevel(chicken) && chicken.levelUpOptions.length === 0) {
    chicken.exp -= getExpToLevel(chicken);
    chicken.level += 1;
    chicken.levelUpOptions = rollUpgradeOptions(random);
    messages.push(`✨ ${chicken.name} 升到 Lv.${chicken.level}，可選擇成長方向。`);
    const evolutionMessage = applyChickenEvolution(chicken);
    if (evolutionMessage) messages.push(evolutionMessage);
  }
  return messages.join("\n");
}

function chooseChickenUpgrade(playerInput, optionId) {
  const player = getPlayer(playerInput);
  const chicken = player.ownedChicken;
  if (!chicken || !chicken.levelUpOptions.length) return { ok: false, player, message: "目前沒有可選的雞升級。" };
  if (!chicken.levelUpOptions.includes(optionId)) return { ok: false, player, message: "這個升級選項目前沒有出現。" };
  const option = getUpgradePool().find((item) => item.id === optionId);
  if (!option) return { ok: false, player, message: "找不到這個升級。" };
  option.apply(chicken);
  chicken.levelUpOptions = [];
  return { ok: true, player, message: `已選擇：${option.label}。` };
}

function formatOwnedChicken(playerInput) {
  const player = ensureOwnedChicken(playerInput);
  const chicken = player.ownedChicken;
  normalizeChickenMeta(chicken);
  const personality = getPersonality(chicken.personalityId);
  const stage = getChickenStage(chicken);
  const evolution = EVOLUTION_TYPES[chicken.evolutionType];
  const activeSkill = CHICKEN_SKILLS[chicken.activeSkill];
  const passiveSkill = CHICKEN_SKILLS[chicken.passiveSkill];
  const upgradeLine = chicken.levelUpOptions.length
    ? `\n\n✨ 可升級：${chicken.levelUpOptions.map((id) => getUpgradePool().find((item) => item.id === id).label).join("｜")}`
    : "";
  return [
    `${chicken.icon || "🐔"} ${chicken.name}${chicken.frame ? `｜${chicken.frame}` : ""}`,
    "",
    `Lv.${chicken.level}｜${stage.label}`,
    `EXP：${chicken.exp} / ${getExpToLevel(chicken)}`,
    `性格：${personality.label}`,
    `進化：${evolution ? evolution.name : "未定"}`,
    buildEvolutionCandidateSummary(chicken),
    `技能：${activeSkill ? activeSkill.name : "未解鎖"}｜${passiveSkill ? passiveSkill.name : "未解鎖"}`,
    buildEvolutionProgress(chicken),
    "",
    `速度：${chicken.speed}`,
    `衝刺：${chicken.sprint}`,
    `穩定：${chicken.stability}`,
    `耐力：${chicken.stamina}`,
    "",
    `勝場：${chicken.wins}`,
    `出賽：${chicken.races}`,
    `最高逆轉：${chicken.highestComeback}`,
    `最長連勝：${chicken.longestWinStreak}`,
    upgradeLine
  ].join("\n");
}

function buildChickenEmbed(playerInput, title = "我的雞", message = "") {
  const player = ensureOwnedChicken(playerInput);
  return new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle(title)
    .setDescription([message, formatOwnedChicken(player)].filter(Boolean).join("\n\n").slice(0, 4096));
}

function buildChickenUpgradeComponents(playerInput) {
  const player = getPlayer(playerInput);
  const chicken = player.ownedChicken;
  if (!chicken || !chicken.levelUpOptions.length) return [];
  return [
    new ActionRowBuilder().addComponents(...chicken.levelUpOptions.map((id) => {
      const option = getUpgradePool().find((item) => item.id === id);
      return new ButtonBuilder()
        .setCustomId(`${CHICKEN_UPGRADE_PREFIX}:${id}`)
        .setLabel(option ? option.label : id)
        .setEmoji("✨")
        .setStyle(ButtonStyle.Primary);
    }))
  ];
}

function buildChickenPanelComponents(playerInput, ownerId = "none") {
  const player = getPlayer(playerInput);
  const upgradeRows = buildChickenUpgradeComponents(player);
  return [
    ...upgradeRows,
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:rename:${ownerId}`)
        .setLabel("命名")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:roast:${ownerId}`)
        .setLabel("烤雞")
        .setEmoji("🍗")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:refresh:${ownerId}`)
        .setLabel("刷新")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function addBattlePoint(runner, key, amount = 1) {
  if (!runner || !key) return;
  runner.battleStats = {
    burst: 0,
    stable: 0,
    miracle: 0,
    trickster: 0,
    comeback: 0,
    ...(runner.battleStats || {})
  };
  runner.battleStats[key] = (runner.battleStats[key] || 0) + amount;
}

function getChickenPower(chicken, frameIndex, event, random = Math.random) {
  normalizeChickenMeta(chicken);
  const personality = getPersonality(chicken.personalityId);
  const progress = (frameIndex + 1) / PK_FRAME_COUNT;
  let step = 0.55
    + chicken.speed * 0.13
    + chicken.sprint * 0.05
    + chicken.stamina * progress * 0.07
    + (random() - 0.5) * 0.8;
  if (personality.openBurst && progress < 0.35 && random() < personality.openBurst) step += 2.2;
  if (personality.late && progress > 0.55) step += personality.late * 2;
  if (personality.comeback && progress > 0.65) step += personality.comeback * 2;
  if (personality.swing) step += (random() - 0.4) * personality.swing * 5;
  if (personality.rare && random() < personality.rare) step += 2.5;
  if (personality.latePenalty && progress > 0.65) step -= personality.latePenalty * 2;
  if (personality.failRisk && random() < personality.failRisk) step -= 1.8;
  if (chicken.passiveSkill === "hotStart" && progress < 0.35 && random() < 0.22) step += 1.4;
  if (chicken.passiveSkill === "lastHope" && progress > 0.55) step += 0.4;
  if (chicken.passiveSkill === "sneakyPeck" && random() < 0.12) step += 0.7;
  if (chicken.passiveSkill === "heavyFeather" && progress < 0.45) step -= 0.45;
  if (chicken.passiveSkill === "paperWing") step += (random() - 0.58) * 1.6;
  if (chicken.passiveSkill === "lostAgain" && random() < 0.18) step -= 1.1;
  if (chicken.passiveSkill === "sparkFeather" && random() < 0.12) step += 1.6;
  if (chicken.passiveSkill === "winnerAura" && chicken.currentWinStreak >= 2) step += 0.45;
  if (chicken.passiveSkill === "clearMind" && ["體力耗盡", "干擾"].includes(event)) step += 0.55;
  if (chicken.passiveSkill === "mineSense" && ["衝刺", "終點爆衝", "逆轉"].includes(event)) step += 0.7;
  if (chicken.passiveSkill === "oldMineMemory" && progress > 0.45) step += 0.45;
  if (chicken.passiveSkill === "deepEcho" && progress > 0.6) step += 0.75;
  if (event === "衝刺") step += chicken.sprint * 0.18;
  if (event === "體力耗盡") step -= Math.max(0, 2.2 - chicken.stamina * 0.16);
  if (event === "終點爆衝" && progress > 0.65) step += chicken.sprint * 0.25;
  if (event === "終點爆衝" && progress > 0.65 && chicken.activeSkill === "blazeDash" && random() < 0.35) step += 3;
  if (event === "逆轉" && progress > 0.55 && chicken.activeSkill === "miracleComeback" && random() < 0.35) step += 2.6;
  if (event === "衝刺" && chicken.activeSkill === "galeRush") step += 1.5;
  if (event === "衝刺" && chicken.activeSkill === "thunderKick" && random() < 0.4) step += 2.5;
  if (event === "終點爆衝" && progress > 0.65 && chicken.activeSkill === "royalPace") step += 1.2;
  if (event === "終點爆衝" && progress > 0.65 && chicken.activeSkill === "crystalFocus") step += 0.9;
  if (event === "跌倒" && chicken.activeSkill === "mudRoll") step += 0.8;
  if (event === "干擾" && chicken.activeSkill === "shadowSlip") step += 0.8;
  if (event === "衝刺" && chicken.activeSkill === "wrongWay" && random() < 0.25) step -= 2.2;
  if (event === "衝刺" && chicken.activeSkill === "crystalPeck" && random() < 0.28) step += 2;
  if (event === "逆轉" && chicken.activeSkill === "abyssCry") step += 1.8;
  step *= Math.max(0.5, Math.min(1, chicken.pvpPowerMultiplier || 1));
  return Math.max(0, step);
}

function applyPkEvent(left, right, event, random = Math.random) {
  const all = [left, right];
  const target = all[Math.floor(random() * all.length)];
  const other = target === left ? right : left;
  normalizeChickenMeta(target.chicken);
  normalizeChickenMeta(other.chicken);
  const personality = getPersonality(target.chicken.personalityId);
  let message = "";
  if (event === "跌倒") {
    const skillResist = target.chicken.activeSkill === "guardStep" ? 0.25 : 0;
    const passiveResist = target.chicken.passiveSkill === "stableSteps" ? 0.18 : 0;
    const resist = target.chicken.stability * 0.04 + (personality.resist || 0) + skillResist + passiveResist;
    if (random() > resist) {
      target.position -= 2.4;
      addBattlePoint(target, "miracle", 1);
      addBattlePoint(target, "clumsy", 2);
      message = `🍌 ${target.chicken.icon || "🐔"} 踩到香蕉皮！`;
    } else {
      addBattlePoint(target, "stable", 2);
      if (target.chicken.passiveSkill === "lightSteps") target.position += 0.8;
      message = `🛡️ ${target.chicken.icon || "🐔"} 硬扛住了香蕉皮！`;
    }
  }
  if (event === "干擾") {
    const sneakyBonus = (getPersonality(target.chicken.personalityId).interfere || 0)
      + (target.chicken.activeSkill === "disruptCrow" ? 0.24 : 0)
      + (target.chicken.passiveSkill === "sneakyPeck" ? 0.12 : 0);
    if (random() < 0.45 + sneakyBonus) {
      other.position -= target.chicken.activeSkill === "disruptCrow" ? 2.4 : 1.6;
      if (target.chicken.activeSkill === "rustScratch") other.position -= 0.8;
      addBattlePoint(target, "trickster", 2);
      addBattlePoint(target, "shadow", 1);
      message = `😈 ${target.chicken.icon || "🐔"} 干擾了對手！`;
    } else if (other.chicken.activeSkill === "boxHide" && random() < 0.35) {
      addBattlePoint(other, "stable", 1);
      message = `📦 ${other.chicken.icon || "🐔"} 躲進紙箱避開干擾！`;
    }
  }
  if (event === "逆轉") {
    const behind = left.position <= right.position ? left : right;
    behind.position += 2.8 + behind.chicken.stamina * 0.08 + (behind.chicken.activeSkill === "miracleComeback" ? 1.4 : 0);
    addBattlePoint(behind, "miracle", 2);
    addBattlePoint(behind, "comeback", 1);
    message = `🔥 ${behind.chicken.icon || "🐔"} 開始逆轉！`;
  }
  for (const runner of all) runner.position = Math.max(0, Math.min(PK_TRACK_LENGTH, runner.position));
  return message;
}

function buildPkTrack(runner) {
  const position = Math.max(0, Math.min(PK_TRACK_LENGTH, Math.floor(runner.position)));
  return `${"—".repeat(position)}${runner.chicken.icon || "🐔"}${"—".repeat(PK_TRACK_LENGTH - position)}🏁`;
}

function isBossUserId(userId) {
  return typeof userId === "string" && userId.startsWith("boss:");
}

function getBossById(id) {
  return BOSS_CHICKENS.find((boss) => boss.id === id) || BOSS_CHICKENS[0];
}

function getBossRank(playerInput) {
  return Math.max(1, Math.floor(playerInput && playerInput.chickenArenaRank || 1));
}

function scaleBossChicken(bossInput, rank = 1) {
  const boss = { ...bossInput };
  const safeRank = Math.max(1, Math.floor(rank || 1));
  const statBonus = Math.floor((safeRank - 1) * 1.4);
  const highRankBonus = safeRank >= 8 ? 3 : safeRank >= 5 ? 2 : safeRank >= 3 ? 1 : 0;
  boss.level = Math.max(boss.level || 1, 8 + safeRank);
  boss.speed = clampStat((boss.speed || 8) + statBonus + highRankBonus);
  boss.sprint = clampStat((boss.sprint || 8) + statBonus + (safeRank >= 8 ? 4 : highRankBonus));
  boss.stability = clampStat((boss.stability || 8) + statBonus + highRankBonus);
  boss.stamina = clampStat((boss.stamina || 8) + statBonus + highRankBonus);
  if (safeRank >= 3) {
    boss.activeSkill = boss.activeSkill || "royalPace";
    boss.passiveSkill = boss.passiveSkill || "winnerAura";
  }
  if (safeRank >= 5) {
    const evolution = EVOLUTION_TYPES[boss.evolutionType] || EVOLUTION_TYPES.iron;
    boss.icon = evolution.icon || boss.icon;
    boss.entryEffect = boss.entryEffect || evolution.entryEffect;
    boss.frame = boss.frame || evolution.title;
    boss.titles = [...new Set([...(boss.titles || []), evolution.title])];
  }
  if (safeRank >= 8) {
    boss.entryEffect = boss.id === "tyrant"
      ? "🔥 暴君雞進入狂暴！"
      : boss.id === "miracle"
        ? "🐓 奇蹟雞強行逆轉！"
        : "👑 館主氣場壓滿整條賽道。";
  }
  boss.name = `${boss.name} R${safeRank}`;
  boss.arenaRank = safeRank;
  return boss;
}

function calculateBossGoldReward(rank = 1, random = Math.random) {
  const safeRank = Math.max(1, Math.floor(rank || 1));
  const min = safeRank <= 1 ? 500 : Math.floor(500 * Math.pow(1.55, safeRank - 1));
  const max = safeRank <= 1 ? 1000 : Math.floor(min * (safeRank >= 5 ? 2.4 : 2));
  return min + Math.floor(random() * Math.max(1, max - min + 1));
}

function createRunner(userId, players, random = Math.random, bossId = null, bossRank = 1) {
  if (isBossUserId(userId)) {
    const boss = scaleBossChicken(getBossById(bossId || userId.slice(5)), bossRank);
    return { userId, chicken: normalizeChickenMeta({ ...boss, races: 0, wins: 0, exp: 0, levelUpOptions: [] }), position: 0, battleStats: {} };
  }
  const player = ensureOwnedChicken(players[userId], random);
  players[userId] = player;
  return { userId, chicken: { ...player.ownedChicken }, position: 0, battleStats: {} };
}

function applyPvpLevelBalance(runners) {
  if (!Array.isArray(runners) || runners.length < 2) return runners;
  const levels = runners.map((runner) => Math.max(1, Math.floor(runner.chicken && runner.chicken.level || 1)));
  const minLevel = Math.min(...levels);
  for (const runner of runners) {
    const level = Math.max(1, Math.floor(runner.chicken && runner.chicken.level || 1));
    const gap = Math.max(0, level - minLevel);
    const reduction = Math.min(0.35, gap * 0.025);
    runner.chicken.pvpPowerMultiplier = Number((1 - reduction).toFixed(3));
  }
  return runners;
}

function createBattle(challengerId, targetId, players, now = Date.now(), random = Math.random, guildId = "global") {
  if (challengerId === targetId) return { ok: false, message: "不能挑戰自己。" };
  if (activeBattleByPlayerId.has(challengerId) || activeBattleByPlayerId.has(targetId)) {
    return { ok: false, message: "其中一位玩家已經在賽雞 PK 中。" };
  }
  const challengerCooldown = Math.max(0, (chickenPvpCooldowns.get(challengerId) || 0) - now);
  const targetCooldown = Math.max(0, (chickenPvpCooldowns.get(targetId) || 0) - now);
  const cooldown = Math.max(challengerCooldown, targetCooldown);
  if (cooldown > 0) {
    return { ok: false, message: `賽雞 PK 冷卻中，還要 ${Math.ceil(cooldown / 1000)} 秒。` };
  }
  const challenger = ensureOwnedChicken(players[challengerId], random);
  const target = ensureOwnedChicken(players[targetId], random);
  players[challengerId] = challenger;
  players[targetId] = target;
  const battle = {
    id: `${now}-${challengerId}-${targetId}`,
    guildId,
    status: "pending",
    challengerId,
    targetId,
    createdAt: now,
    expiresAt: now + PK_TIMEOUT_MS,
    runners: null,
    frames: [],
    result: null,
    timers: [],
    message: null
  };
  activeChickenBattles.set(battle.id, battle);
  activeBattleByPlayerId.set(challengerId, battle.id);
  activeBattleByPlayerId.set(targetId, battle.id);
  return { ok: true, battle, players };
}

function createBossBattle(challengerId, players, now = Date.now(), random = Math.random, guildId = "global", bossId = null) {
  if (activeBattleByPlayerId.has(challengerId)) return { ok: false, message: "你已經在賽雞 PK 中。" };
  const boss = getBossById(bossId || BOSS_CHICKENS[Math.floor(random() * BOSS_CHICKENS.length)].id);
  const challenger = ensureOwnedChicken(players[challengerId], random);
  const bossRank = getBossRank(challenger);
  const scaledBoss = scaleBossChicken(boss, bossRank);
  players[challengerId] = challenger;
  const battle = {
    id: `${now}-${challengerId}-boss-${boss.id}`,
    guildId,
    status: "pending",
    challengerId,
    targetId: `boss:${boss.id}`,
    bossId: boss.id,
    bossRank,
    isBoss: true,
    createdAt: now,
    expiresAt: now + PK_TIMEOUT_MS,
    runners: null,
    frames: [],
    result: null,
    timers: [],
    message: null
  };
  activeChickenBattles.set(battle.id, battle);
  activeBattleByPlayerId.set(challengerId, battle.id);
  return { ok: true, battle, players, boss: scaledBoss };
}

function clearBattle(battleId) {
  const battle = activeChickenBattles.get(battleId);
  if (battle && Array.isArray(battle.timers)) {
    for (const timer of battle.timers) clearTimeout(timer);
  }
  if (battle) {
    activeBattleByPlayerId.delete(battle.challengerId);
    activeBattleByPlayerId.delete(battle.targetId);
  }
  activeChickenBattles.delete(battleId);
}

function getBattle(battleId) {
  return activeChickenBattles.get(battleId) || null;
}

function buildBattleComponents(battle) {
  if (!battle || battle.status !== "pending") return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PK_PREFIX}:accept:${battle.id}`)
        .setLabel("接受 PK")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PK_PREFIX}:decline:${battle.id}`)
        .setLabel("拒絕")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildBattleEmbed(battle, players, message = "") {
  const challenger = ensureOwnedChicken(players[battle.challengerId]);
  const boss = battle.isBoss ? scaleBossChicken(getBossById(battle.bossId), battle.bossRank || 1) : null;
  const target = boss ? { ownedChicken: boss } : ensureOwnedChicken(players[battle.targetId]);
  const frame = battle.frames[battle.frames.length - 1] || [
    `${challenger.ownedChicken.icon || "🐔"}${"—".repeat(PK_TRACK_LENGTH)}🏁`,
    `${target.ownedChicken.icon || "🐔"}${"—".repeat(PK_TRACK_LENGTH)}🏁`
  ].join("\n");
  const targetLabel = boss ? `${boss.icon} ${boss.name}｜${boss.title}` : `<@${battle.targetId}>：${target.ownedChicken.icon || "🐔"} ${target.ownedChicken.name}`;
  return new EmbedBuilder()
    .setColor(battle.status === "settled" ? 0xfacc15 : 0xef4444)
    .setTitle(battle.isBoss ? "賽雞館挑戰" : "1v1 賽雞 PK")
    .setDescription([
      message,
      `<@${battle.challengerId}>：${challenger.ownedChicken.icon || "🐔"} ${challenger.ownedChicken.name}`,
      targetLabel,
      "",
      frame
    ].filter(Boolean).join("\n").slice(0, 4096));
}

function updateBattleFrame(battle, players, frameIndex, random = Math.random) {
  if (!battle.runners) {
    battle.runners = [
      createRunner(battle.challengerId, players, random),
      createRunner(battle.targetId, players, random, battle.bossId, battle.bossRank)
    ];
    if (!battle.isBoss) applyPvpLevelBalance(battle.runners);
  }
  const events = ["衝刺", "跌倒", "干擾", "逆轉", "體力耗盡", "終點爆衝"];
  const event = events[Math.floor(random() * events.length)] || "衝刺";
  for (const runner of battle.runners) {
    const before = runner.position;
    runner.position += getChickenPower(runner.chicken, frameIndex, event, random);
    if (runner.position - before > 2.2) addBattlePoint(runner, "burst", 1);
  }
  const eventMessage = applyPkEvent(battle.runners[0], battle.runners[1], event, random);
  const hint = {
    衝刺: "💨 衝刺！",
    跌倒: "🍌 跌倒！",
    干擾: "😈 干擾！",
    逆轉: "🔥 逆轉！",
    體力耗盡: "💦 體力耗盡！",
    終點爆衝: "⚡ 終點爆衝！"
  }[event];
  const frame = [
    ...battle.runners
      .filter((runner) => runner.chicken.entryEffect && frameIndex === 0)
      .map((runner) => runner.chicken.entryEffect),
    ...battle.runners.map((runner) => buildPkTrack(runner)),
    eventMessage || hint
  ].join("\n");
  battle.frames.push(frame);
  return frame;
}

function settleBattle(battle, players, random = Math.random, now = Date.now()) {
  if (!battle.runners) updateBattleFrame(battle, players, 0, random);
  battle.status = "settled";
  const sorted = [...battle.runners].sort((a, b) => b.position - a.position);
  const finalWinner = sorted[0];
  const finalLoser = sorted[1];
  const close = finalWinner.position - finalLoser.position < 1.5;
  for (const runner of battle.runners) {
    if (isBossUserId(runner.userId)) continue;
    const player = ensureOwnedChicken(players[runner.userId], random);
    const chicken = player.ownedChicken;
    normalizeChickenMeta(chicken);
    chicken.races += 1;
    const won = runner.userId === finalWinner.userId;
    if (won) {
      chicken.wins += 1;
      chicken.currentWinStreak += 1;
      chicken.longestWinStreak = Math.max(chicken.longestWinStreak, chicken.currentWinStreak);
    } else {
      chicken.currentWinStreak = 0;
    }
    const stats = runner.battleStats || {};
    chicken.evolutionPoints.blaze += (stats.burst || 0) + (chicken.sprint >= 10 ? 1 : 0);
    chicken.evolutionPoints.iron += (stats.stable || 0) + (chicken.stability >= 10 ? 1 : 0);
    chicken.evolutionPoints.miracle += (stats.miracle || 0) + (stats.comeback || 0) + (close ? 1 : 0);
    chicken.evolutionPoints.trickster += stats.trickster || 0;
    chicken.evolutionPoints.gale += (chicken.speed >= 10 ? 1 : 0) + (runner.position > PK_TRACK_LENGTH * 0.75 ? 1 : 0);
    chicken.evolutionPoints.crown += won ? 2 : 0;
    chicken.evolutionPoints.thunder += (stats.burst || 0) + (chicken.sprint >= 12 ? 1 : 0);
    chicken.evolutionPoints.shadow += stats.shadow || 0;
    chicken.evolutionPoints.crystal += (close ? 1 : 0) + (chicken.personalityId === "chosen" ? 1 : 0);
    chicken.evolutionPoints.clumsy += (stats.clumsy || 0) + (won ? 0 : 1);
    chicken.highestComeback = Math.max(chicken.highestComeback, stats.comeback || 0);
    const progressEvolutionMessage = applyChickenEvolution(chicken);
    const exp = 18 + (won ? 32 : 10) + (battle.isBoss ? 18 : 0) + (close ? 8 : 0) + Math.floor(runner.position / 3);
    const levelMessage = addChickenExp(player, exp, random);
    runner.expGained = exp;
    if (battle.isBoss && won) {
      const boss = getBossById(battle.bossId);
      chicken.bossWins += 1;
      if (!chicken.titles.includes(boss.rewardTitle)) chicken.titles.push(boss.rewardTitle);
      chicken.frame = chicken.frame || boss.rewardTitle;
      const rewardGold = calculateBossGoldReward(battle.bossRank || 1, random);
      player.gold = (player.gold || 0) + rewardGold;
      player.chickenArenaRank = Math.max(getBossRank(player), (battle.bossRank || 1) + 1);
      const rareMessages = [];
      if (random() < 0.08) {
        const rareTitle = `${boss.rewardTitle}・高階`;
        if (!chicken.titles.includes(rareTitle)) chicken.titles.push(rareTitle);
        rareMessages.push(`🏅 稀有稱號：${rareTitle}`);
      }
      if (random() < 0.05) {
        chicken.frame = "賽雞館金框";
        rareMessages.push("✨ 雞外觀：賽雞館金框");
      }
      runner.rewardMessage = [
        `🏟️ 賽雞館 Rank ${battle.bossRank || 1} 通關`,
        `💰 獲得 ${rewardGold} 金幣`,
        `下一館：Rank ${player.chickenArenaRank}`,
        ...rareMessages
      ].join("\n");
    }
    players[runner.userId] = player;
    runner.levelMessage = [progressEvolutionMessage, levelMessage].filter(Boolean).join("\n");
  }
  finalWinner.position = PK_TRACK_LENGTH;
  finalLoser.position = Math.max(0, Math.min(PK_TRACK_LENGTH - 2, finalLoser.position));
  const finalFrame = [
    "🏁 終點！",
    buildPkTrack(finalWinner),
    buildPkTrack(finalLoser),
    "",
    `🏆 勝利：${finalWinner.chicken.icon || "🐔"} ${finalWinner.chicken.name}${isBossUserId(finalWinner.userId) ? "" : `（<@${finalWinner.userId}>）`}`,
    ...battle.runners
      .filter((runner) => !isBossUserId(runner.userId))
      .map((runner) => `${runner.userId === finalWinner.userId ? "🏆" : "🥈"} ${runner.chicken.icon || "🐔"} ${runner.chicken.name} +${runner.expGained || 0} EXP`),
    ...battle.runners.map((runner) => runner.levelMessage).filter(Boolean),
    ...battle.runners.map((runner) => runner.rewardMessage).filter(Boolean)
  ].join("\n");
  battle.frames.push(finalFrame);
  battle.result = { winnerId: finalWinner.userId, loserId: finalLoser.userId };
  activeBattleByPlayerId.delete(battle.challengerId);
  activeBattleByPlayerId.delete(battle.targetId);
  if (!battle.isBoss) {
    chickenPvpCooldowns.set(battle.challengerId, now + PK_COOLDOWN_MS);
    if (!isBossUserId(battle.targetId)) chickenPvpCooldowns.set(battle.targetId, now + PK_COOLDOWN_MS);
  }
  return { battle, players, message: finalFrame };
}

function isChickenPkComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${CHICKEN_PK_PREFIX}:`);
}

function isChickenUpgradeComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${CHICKEN_UPGRADE_PREFIX}:`);
}

function isChickenPanelComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${CHICKEN_PANEL_PREFIX}:`);
}

function roastOwnedChicken(playerInput) {
  const player = getPlayer(playerInput);
  if (!player.ownedChicken) return { ok: false, player, message: "你目前沒有自己的雞。" };
  const chicken = player.ownedChicken;
  player.chickenRoastHpBonus = (player.chickenRoastHpBonus || 0) + 1;
  player.ownedChicken = null;
  return {
    ok: true,
    player,
    message: `🍗 你烤掉了「${chicken.name}」。\n牠陪你出賽 ${chicken.races} 場、贏過 ${chicken.wins} 場，最長連勝 ${chicken.longestWinStreak || 0} 場。\n下一場下礦最大生命 +1。`
  };
}

function shareRoastChickenMeal(playerInput) {
  const player = getPlayer(playerInput);
  player.chickenRoastHpBonus = (player.chickenRoastHpBonus || 0) + 1;
  return {
    ok: true,
    player,
    message: "你一起吃了烤雞。下一場下礦最大生命 +1。"
  };
}

module.exports = {
  CHICKEN_PK_PREFIX,
  CHICKEN_PANEL_PREFIX,
  CHICKEN_UPGRADE_PREFIX,
  PK_COOLDOWN_MS,
  PK_FRAME_COUNT,
  BOSS_CHICKENS,
  CHICKEN_SKILLS,
  EVOLUTION_TYPES,
  PERSONALITIES,
  buildBattleComponents,
  buildBattleEmbed,
  buildChickenEmbed,
  buildChickenPanelComponents,
  buildChickenUpgradeComponents,
  addChickenExp,
  applyPvpLevelBalance,
  chooseChickenUpgrade,
  clearBattle,
  createBattle,
  createBossBattle,
  calculateBossGoldReward,
  determineEvolutionType,
  getEvolutionMissingRequirements,
  ensureOwnedChicken,
  formatOwnedChicken,
  getBattle,
  getBossRank,
  getChickenRequiredExp,
  getChickenStage,
  isChickenPkComponent,
  isChickenPanelComponent,
  isChickenUpgradeComponent,
  makeWildMineChicken,
  normalizeOwnedChicken,
  renameChicken,
  roastOwnedChicken,
  settleBattle,
  shareRoastChickenMeal,
  updateBattleFrame
};

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
const CHICKEN_BOOST_AMOUNT = 5;
const CHICKEN_BOOST_MAX_PENDING = 15;
const CHICKEN_BOOST_DANGER_WINDOW_MS = 10 * 60 * 1000;
const CHICKEN_CARE_DAY_MS = 24 * 60 * 60 * 1000;
const CHICKEN_POOP_INTERVAL_MS = 60 * 60 * 1000;
const SKILL_TRIGGER_TIMINGS = ["start", "mid", "finish", "overtaken"];

const SKILL_TRIGGER_LABELS = {
  start: "起跑時",
  mid: "中盤時",
  finish: "最後衝刺時",
  overtaken: "被超車時"
};

const COUNTER_TYPES = {
  stable: { label: "🛡️ 穩定型", counters: ["risk", "burst"] },
  burst: { label: "🔥 爆衝型", counters: ["late"] },
  disrupt: { label: "😈 干擾型", counters: ["fragile"] },
  late: { label: "🐢 慢熱型", counters: ["burst"] },
  risk: { label: "💀 高風險型", counters: ["stable"] },
  fragile: { label: "🐣 低穩定型", counters: ["disrupt"] },
  luck: { label: "🎲 幸運型", counters: ["stable"] },
  balanced: { label: "🐔 均衡型", counters: [] }
};

const PERSONALITY_COUNTER_TYPES = {
  charger: "burst",
  veteran: "late",
  gambler: "luck",
  sleepy: "late",
  sneaky: "disrupt",
  madDog: "risk",
  steady: "stable",
  chosen: "luck"
};

const EVOLUTION_COUNTER_TYPES = {
  blaze: "burst",
  iron: "stable",
  miracle: "late",
  trickster: "disrupt",
  gale: "burst",
  crown: "balanced",
  thunder: "burst",
  shadow: "disrupt",
  crystal: "luck",
  mud: "stable",
  paper: "fragile",
  lost: "fragile",
  mineCrystal: "luck",
  rustFeather: "disrupt",
  abyssEcho: "late"
};

const RACE_TRACK_MODIFIERS = [
  { id: "muddy", label: "🌧️ 泥濘賽道", text: "穩定重要", stabilityWeight: 0.08, speedMultiplier: 0.94, fallRiskBonus: 0.08 },
  { id: "lava", label: "🔥 熔岩賽道", text: "耐力消耗提高", staminaDrain: 0.16, sprintMultiplier: 1.08 },
  { id: "speed", label: "⚡ 高速賽道", text: "速度與衝刺提高", speedMultiplier: 1.1, sprintMultiplier: 1.12 },
  { id: "chaos", label: "🎲 混亂賽道", text: "事件率提高", chaosBonus: 0.22, eventPower: 1.18 },
  { id: "wind", label: "🌪️ 強風賽道", text: "容易被干擾", interfereBonus: 0.14, stabilityWeight: 0.04 }
];

const CHICKEN_STATUS_EFFECTS = {
  excited: { label: "😤 興奮", sprintBonus: 0.16, stabilityPenalty: 0.08 },
  tired: { label: "😴 疲勞", staminaPenalty: 0.16 },
  angry: { label: "😡 暴躁", interfereBonus: 0.14, stabilityPenalty: 0.05 },
  focused: { label: "✨ 專注", skillChanceBonus: 0.14 },
  runaway: { label: "💀 失控", sprintBonus: 0.28, failRiskBonus: 0.12 }
};

const CHICKEN_RESEARCH_NOTES = {
  blaze: {
    title: "爆炎雞育成筆記",
    hint: "多參加爆衝賽道，保持高興奮，少休息。"
  },
  iron: {
    title: "鐵壁雞育成筆記",
    hint: "乾淨雞舍、穩定心情，少讓牠跌倒。"
  },
  miracle: {
    title: "奇蹟雞育成筆記",
    hint: "落後時別放棄，逆轉經驗會留下痕跡。"
  },
  trickster: {
    title: "黑炎雞育成筆記",
    hint: "干擾與暴躁會讓路線變歪，但別讓健康太差。"
  },
  clumsy: {
    title: "爛雞觀察紙條",
    hint: "餵太多、太髒、常生病，會把進化推向奇怪方向。"
  }
};

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

const SECOND_STAGE_EVOLUTIONS = {
  blaze: {
    normal: { id: "blazeWing", title: "炎翼雞", icon: "🐓🔥", branch: "blazeWing", frame: "炎翼完全體" },
    perfect: { id: "blazeKing", title: "爆炎王雞", icon: "🐓🔥👑", branch: "blazeKing", frame: "爆炎王" },
    bad: { id: "fatBlaze", title: "肥宅爆炎雞", icon: "🐔🔥🍖", branch: "overfedBlaze", frame: "肥炎完全體" },
    abnormal: { id: "blackBlaze", title: "黑炎雞", icon: "🐓😈🔥", branch: "blackBlaze", frame: "黑炎完全體" }
  },
  iron: {
    normal: { id: "ironGuard", title: "鋼羽雞", icon: "🐔🛡️", branch: "ironGuard", frame: "鋼羽完全體" },
    perfect: { id: "fortressKing", title: "鐵壁王雞", icon: "🐔🛡️👑", branch: "fortressKing", frame: "鐵壁王" },
    bad: { id: "rustArmor", title: "鏽甲雞", icon: "🐔🟧🛡️", branch: "rustArmor", frame: "鏽甲完全體" },
    abnormal: { id: "sealedIron", title: "封印鐵雞", icon: "🐔🛡️💀", branch: "sealedIron", frame: "封印完全體" }
  },
  miracle: {
    normal: { id: "starMiracle", title: "星光奇蹟雞", icon: "🐤✨", branch: "starMiracle", frame: "星光完全體" },
    perfect: { id: "miracleKing", title: "天命奇蹟雞", icon: "🐤✨👑", branch: "miracleKing", frame: "天命完全體" },
    bad: { id: "nearMiss", title: "差一點雞", icon: "🐤💫", branch: "nearMiss", frame: "差點完全體" },
    abnormal: { id: "voidMiracle", title: "虛空奇蹟雞", icon: "🐤🌌", branch: "voidMiracle", frame: "虛空完全體" }
  },
  trickster: {
    normal: { id: "prankLord", title: "惡作劇王雞", icon: "🐓😈", branch: "prankLord", frame: "惡作劇完全體" },
    perfect: { id: "darkTrickster", title: "黑羽策士雞", icon: "🐓😈👑", branch: "darkTrickster", frame: "黑羽策士" },
    bad: { id: "annoyingChicken", title: "吵鬧爛雞", icon: "🐓📢", branch: "annoyingChicken", frame: "吵鬧完全體" },
    abnormal: { id: "curseTrickster", title: "詛咒惡作劇雞", icon: "🐓😈💀", branch: "curseTrickster", frame: "詛咒完全體" }
  },
  thunder: {
    normal: { id: "thunderRunner", title: "雷羽衝線雞", icon: "🐓⚡", branch: "thunderRunner", frame: "雷羽衝線" },
    perfect: { id: "thunderCrown", title: "雷鳴衝線皇", icon: "🐓⚡👑", branch: "thunderCrown", frame: "雷鳴衝線皇" },
    bad: { id: "shortCircuit", title: "短路雷雞", icon: "🐔⚡💫", branch: "shortCircuit", frame: "短路雷羽" },
    abnormal: { id: "stormBerserker", title: "暴雷失控雞", icon: "🐓⚡💀", branch: "stormBerserker", frame: "暴雷失控" }
  },
  gale: {
    normal: { id: "galeBlade", title: "疾風刃雞", icon: "🐓💨", branch: "galeBlade", frame: "疾風刃" },
    perfect: { id: "skyGale", title: "天翔疾風雞", icon: "🐓💨👑", branch: "skyGale", frame: "天翔疾風" },
    bad: { id: "windTired", title: "喘風雞", icon: "🐔💨💫", branch: "windTired", frame: "喘風完全體" },
    abnormal: { id: "tornadoLost", title: "亂流迷走雞", icon: "🐓🌪️", branch: "tornadoLost", frame: "亂流完全體" }
  },
  crown: {
    normal: { id: "goldFeather", title: "金羽勝者雞", icon: "🐔👑", branch: "goldFeather", frame: "金羽勝者" },
    perfect: { id: "royalCrown", title: "賽雞王冠雞", icon: "🐔👑✨", branch: "royalCrown", frame: "賽雞王冠" },
    bad: { id: "fakeCrown", title: "假冠雞", icon: "🐔👑💫", branch: "fakeCrown", frame: "假冠完全體" },
    abnormal: { id: "greedyCrown", title: "貪冠雞", icon: "🐔👑💀", branch: "greedyCrown", frame: "貪冠完全體" }
  },
  shadow: {
    normal: { id: "nightRunner", title: "夜影疾行雞", icon: "🐔🌑", branch: "nightRunner", frame: "夜影疾行" },
    perfect: { id: "phantomKing", title: "幻影王雞", icon: "🐔🌑👑", branch: "phantomKing", frame: "幻影王" },
    bad: { id: "lostShadow", title: "迷影雞", icon: "🐔🌑❓", branch: "lostShadow", frame: "迷影完全體" },
    abnormal: { id: "voidShadow", title: "虛影雞", icon: "🐔🌑💀", branch: "voidShadow", frame: "虛影完全體" }
  },
  crystal: {
    normal: { id: "gemOracle", title: "寶晶預言雞", icon: "🐤💎", branch: "gemOracle", frame: "寶晶預言" },
    perfect: { id: "rainbowCrystal", title: "虹晶神諭雞", icon: "🐤💎👑", branch: "rainbowCrystal", frame: "虹晶神諭" },
    bad: { id: "crackedGem", title: "裂晶雞", icon: "🐤💎💫", branch: "crackedGem", frame: "裂晶完全體" },
    abnormal: { id: "cursedCrystal", title: "咒晶雞", icon: "🐤💎💀", branch: "cursedCrystal", frame: "咒晶完全體" }
  },
  mud: {
    normal: { id: "mudWall", title: "泥牆雞", icon: "🐔🟫", branch: "mudWall", frame: "泥牆完全體" },
    perfect: { id: "swampKing", title: "沼澤王雞", icon: "🐔🟫👑", branch: "swampKing", frame: "沼澤王" },
    bad: { id: "mudPile", title: "爛泥雞", icon: "🐔🟫💫", branch: "mudPile", frame: "爛泥完全體" },
    abnormal: { id: "mudMonster", title: "泥怪雞", icon: "🐔🟫💀", branch: "mudMonster", frame: "泥怪完全體" }
  },
  paper: {
    normal: { id: "boxHero", title: "紙箱英雄雞", icon: "🐤📦", branch: "boxHero", frame: "紙箱英雄" },
    perfect: { id: "cardboardKing", title: "紙箱王雞", icon: "🐤📦👑", branch: "cardboardKing", frame: "紙箱王" },
    bad: { id: "wetPaper", title: "濕紙雞", icon: "🐤📦💧", branch: "wetPaper", frame: "濕紙完全體" },
    abnormal: { id: "mysteryBox", title: "怪箱雞", icon: "🐤📦💀", branch: "mysteryBox", frame: "怪箱完全體" }
  },
  lost: {
    normal: { id: "routeFinder", title: "尋路雞", icon: "🐔❓", branch: "routeFinder", frame: "尋路完全體" },
    perfect: { id: "mazeLegend", title: "迷宮傳說雞", icon: "🐔❓👑", branch: "mazeLegend", frame: "迷宮傳說" },
    bad: { id: "wrongWayKing", title: "反方向雞", icon: "🐔❓💫", branch: "wrongWayKing", frame: "反方向完全體" },
    abnormal: { id: "spaceLost", title: "異空迷路雞", icon: "🐔❓💀", branch: "spaceLost", frame: "異空迷路" }
  },
  mineCrystal: {
    normal: { id: "mineGem", title: "礦晶羽雞", icon: "🐔💎", branch: "mineGem", frame: "礦晶羽" },
    perfect: { id: "deepGemKing", title: "深礦晶王雞", icon: "🐔💎👑", branch: "deepGemKing", frame: "深礦晶王" },
    bad: { id: "dullGem", title: "暗晶雞", icon: "🐔💎💫", branch: "dullGem", frame: "暗晶完全體" },
    abnormal: { id: "mutantGem", title: "異變礦晶雞", icon: "🐔💎💀", branch: "mutantGem", frame: "異變礦晶" }
  },
  rustFeather: {
    normal: { id: "rustBlade", title: "鏽刃羽雞", icon: "🐓🟧", branch: "rustBlade", frame: "鏽刃羽" },
    perfect: { id: "ancientRust", title: "古鏽王雞", icon: "🐓🟧👑", branch: "ancientRust", frame: "古鏽王" },
    bad: { id: "crumblyRust", title: "脆鏽雞", icon: "🐓🟧💫", branch: "crumblyRust", frame: "脆鏽完全體" },
    abnormal: { id: "toxicRust", title: "毒鏽雞", icon: "🐓🟧💀", branch: "toxicRust", frame: "毒鏽完全體" }
  },
  abyssEcho: {
    normal: { id: "echoWing", title: "回音羽雞", icon: "🐓🌌", branch: "echoWing", frame: "回音羽" },
    perfect: { id: "abyssKing", title: "深淵鳴王雞", icon: "🐓🌌👑", branch: "abyssKing", frame: "深淵鳴王" },
    bad: { id: "hollowEcho", title: "空鳴雞", icon: "🐓🌌💫", branch: "hollowEcho", frame: "空鳴完全體" },
    abnormal: { id: "voidEcho", title: "虛無回音雞", icon: "🐓🌌💀", branch: "voidEcho", frame: "虛無回音" }
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
    bossRule: "ironWall",
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
    bossRule: "tyrantRage",
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
    bossRule: "forcedMiracle",
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

function getCounterTypeForChicken(chicken) {
  if (!chicken || typeof chicken !== "object") return "balanced";
  if (COUNTER_TYPES[chicken.chickenCounterType]) return chicken.chickenCounterType;
  if (EVOLUTION_COUNTER_TYPES[chicken.evolutionType]) return EVOLUTION_COUNTER_TYPES[chicken.evolutionType];
  return PERSONALITY_COUNTER_TYPES[chicken.personalityId] || "balanced";
}

function getDefaultSkillTiming(activeSkill) {
  if (["blazeDash", "galeRush", "thunderKick", "royalPace", "crystalFocus"].includes(activeSkill)) return "finish";
  if (["guardStep", "shadowSlip", "boxHide"].includes(activeSkill)) return "overtaken";
  if (["disruptCrow", "rustScratch"].includes(activeSkill)) return "mid";
  return "finish";
}

function normalizeSkillTiming(input, activeSkill = null) {
  return SKILL_TRIGGER_TIMINGS.includes(input) ? input : getDefaultSkillTiming(activeSkill);
}

function cycleChickenSkillTiming(playerInput) {
  const player = ensureOwnedChicken(playerInput);
  const chicken = player.ownedChicken;
  normalizeChickenMeta(chicken);
  const current = normalizeSkillTiming(chicken.skillTriggerTiming, chicken.activeSkill);
  const index = SKILL_TRIGGER_TIMINGS.indexOf(current);
  const next = SKILL_TRIGGER_TIMINGS[(index + 1) % SKILL_TRIGGER_TIMINGS.length];
  chicken.skillTriggerTiming = next;
  return {
    ok: true,
    player,
    message: `技能時機改為：${SKILL_TRIGGER_LABELS[next]}。`
  };
}

function normalizeStatusEffects(input, limit = 5) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((effect) => effect && CHICKEN_STATUS_EFFECTS[effect.id])
    .map((effect) => ({
      id: effect.id,
      remaining: Math.max(1, Math.min(9, Math.floor(effect.remaining || 1)))
    }))
    .slice(0, limit);
}

function getCareDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function getMoodIcon(value) {
  if (value >= 80) return "😊";
  if (value >= 55) return "🙂";
  if (value >= 30) return "😟";
  return "😠";
}

function getHealthLabel(value, disease = "") {
  if (disease) return "🤒 生病";
  if (value >= 80) return "正常";
  if (value >= 50) return "稍差";
  return "虛弱";
}

function normalizeCareStats(chicken, now = Date.now()) {
  if (!chicken || typeof chicken !== "object") return chicken;
  chicken.chickenHunger = Math.max(0, Math.min(100, Math.floor(chicken.chickenHunger == null ? 70 : chicken.chickenHunger)));
  chicken.chickenMood = Math.max(0, Math.min(100, Math.floor(chicken.chickenMood == null ? 70 : chicken.chickenMood)));
  chicken.chickenHealth = Math.max(0, Math.min(100, Math.floor(chicken.chickenHealth == null ? 90 : chicken.chickenHealth)));
  chicken.chickenPoop = Math.max(0, Math.min(99, Math.floor(chicken.chickenPoop || 0)));
  chicken.chickenDisease = typeof chicken.chickenDisease === "string" ? chicken.chickenDisease : "";
  chicken.lastChickenCareAt = Math.max(0, Number(chicken.lastChickenCareAt || 0));
  chicken.lastChickenFeedDay = typeof chicken.lastChickenFeedDay === "string" ? chicken.lastChickenFeedDay : "";
  chicken.chickenFeedsToday = Math.max(0, Math.floor(chicken.chickenFeedsToday || 0));
  chicken.autoCleanExpireTime = Math.max(0, Number(chicken.autoCleanExpireTime || 0));
  chicken.evolutionBranch = typeof chicken.evolutionBranch === "string" ? chicken.evolutionBranch : "";
  chicken.hiddenEvolutionValue = Math.max(-100, Math.min(100, Math.floor(chicken.hiddenEvolutionValue || 0)));
  chicken.evolutionQuality = typeof chicken.evolutionQuality === "string" ? chicken.evolutionQuality : "";
  if (!chicken.lastChickenCareAt) chicken.lastChickenCareAt = now;
  if (!chicken.lastChickenFeedDay) chicken.lastChickenFeedDay = getCareDay(now);
  return chicken;
}

function updateChickenCareState(playerInput, now = Date.now(), random = Math.random) {
  const player = ensureOwnedChicken(playerInput);
  const chicken = player.ownedChicken;
  normalizeCareStats(chicken, now);
  const elapsed = Math.max(0, now - (chicken.lastChickenCareAt || now));
  const hours = Math.floor(elapsed / CHICKEN_POOP_INTERVAL_MS);
  if (hours > 0) {
    if (chicken.autoCleanExpireTime > now) {
      chicken.chickenPoop = 0;
    } else {
      chicken.chickenPoop = Math.min(99, chicken.chickenPoop + hours);
    }
    chicken.chickenHunger = Math.max(0, chicken.chickenHunger - hours * 5);
    if (chicken.chickenPoop >= 5) chicken.chickenMood = Math.max(0, chicken.chickenMood - hours * 3);
    if (chicken.chickenPoop >= 8 || chicken.chickenHunger <= 20) chicken.chickenHealth = Math.max(0, chicken.chickenHealth - hours * 4);
    chicken.lastChickenCareAt += hours * CHICKEN_POOP_INTERVAL_MS;
  }
  const today = getCareDay(now);
  if (chicken.lastChickenFeedDay !== today) {
    if ((chicken.chickenFeedsToday || 0) < 2) {
      chicken.chickenMood = Math.max(0, chicken.chickenMood - 12);
      chicken.chickenHealth = Math.max(0, chicken.chickenHealth - 8);
      chicken.hiddenEvolutionValue -= 4;
    }
    chicken.lastChickenFeedDay = today;
    chicken.chickenFeedsToday = 0;
  }
  const diseaseRisk = (chicken.chickenPoop >= 8 ? 0.2 : 0)
    + (chicken.chickenHunger <= 20 ? 0.18 : 0)
    + (chicken.chickenHealth <= 35 ? 0.18 : 0)
    + ((chicken.chickenFeedsToday || 0) >= 5 ? 0.12 : 0);
  if (!chicken.chickenDisease && diseaseRisk > 0 && random() < diseaseRisk) {
    chicken.chickenDisease = "sick";
    chicken.chickenStatusEffects = normalizeStatusEffects([...(chicken.chickenStatusEffects || []), { id: "tired", remaining: 3 }]);
  }
  return player;
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

function normalizeSecondEvolution(input) {
  if (!input || typeof input !== "object") return null;
  const id = typeof input.id === "string" ? input.id : "";
  const title = typeof input.title === "string" ? input.title : "";
  if (!id || !title) return null;
  return {
    id,
    title,
    icon: typeof input.icon === "string" ? input.icon : "",
    branch: typeof input.branch === "string" ? input.branch : id,
    quality: typeof input.quality === "string" ? input.quality : "",
    frame: typeof input.frame === "string" ? input.frame : ""
  };
}

function normalizeChickenMeta(chicken) {
  if (!chicken || typeof chicken !== "object") return chicken;
  chicken.evolutionPoints = createEvolutionPoints(chicken.evolutionPoints);
  chicken.evolutionType = EVOLUTION_TYPES[chicken.evolutionType] ? chicken.evolutionType : null;
  chicken.secondEvolution = normalizeSecondEvolution(chicken.secondEvolution);
  chicken.activeSkill = CHICKEN_SKILLS[chicken.activeSkill] ? chicken.activeSkill : null;
  chicken.passiveSkill = CHICKEN_SKILLS[chicken.passiveSkill] ? chicken.passiveSkill : null;
  chicken.chickenCounterType = getCounterTypeForChicken(chicken);
  chicken.skillTriggerTiming = normalizeSkillTiming(chicken.skillTriggerTiming, chicken.activeSkill);
  chicken.chickenStatusEffects = normalizeStatusEffects(chicken.chickenStatusEffects);
  normalizeCareStats(chicken);
  chicken.highestComeback = Math.max(0, Math.floor(chicken.highestComeback || 0));
  chicken.currentWinStreak = Math.max(0, Math.floor(chicken.currentWinStreak || 0));
  chicken.longestWinStreak = Math.max(0, Math.floor(chicken.longestWinStreak || 0));
  chicken.bossWins = Math.max(0, Math.floor(chicken.bossWins || 0));
  chicken.titles = normalizeChickenArray(chicken.titles);
  chicken.frame = typeof chicken.frame === "string" ? chicken.frame : "";
  chicken.entryEffect = typeof chicken.entryEffect === "string" ? chicken.entryEffect : "";
  chicken.raceStatBoost = Math.max(0, Math.min(CHICKEN_BOOST_MAX_PENDING, Math.floor(chicken.raceStatBoost || 0)));
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
    secondEvolution: null,
    activeSkill: null,
    passiveSkill: null,
    chickenCounterType: getCounterTypeForChicken({ personalityId: personality.id }),
    skillTriggerTiming: getDefaultSkillTiming(null),
    chickenStatusEffects: [],
    chickenHunger: 70,
    chickenMood: 70,
    chickenHealth: 90,
    chickenPoop: 0,
    chickenDisease: "",
    lastChickenCareAt: Date.now(),
    lastChickenFeedDay: getCareDay(),
    chickenFeedsToday: 0,
    autoCleanExpireTime: 0,
    evolutionBranch: "",
    hiddenEvolutionValue: 0,
    evolutionQuality: "",
    titles: [],
    frame: "",
    entryEffect: "",
    raceStatBoost: 0,
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
    secondEvolution: null,
    activeSkill: evolution.activeSkill,
    passiveSkill: evolution.passiveSkill,
    chickenCounterType: getCounterTypeForChicken({ personalityId: personality.id, evolutionType }),
    skillTriggerTiming: getDefaultSkillTiming(evolution.activeSkill),
    chickenStatusEffects: [],
    chickenHunger: 75,
    chickenMood: 75,
    chickenHealth: 92,
    chickenPoop: 0,
    chickenDisease: "",
    lastChickenCareAt: Date.now(),
    lastChickenFeedDay: getCareDay(),
    chickenFeedsToday: 0,
    autoCleanExpireTime: 0,
    evolutionBranch: "mine",
    hiddenEvolutionValue: 8,
    evolutionQuality: "",
    titles: ["礦坑邂逅"],
    frame: "",
    entryEffect: "⛏️ 牠是在礦洞裡被你抓到的特殊雞。",
    raceStatBoost: 0,
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
    secondEvolution: normalizeSecondEvolution(input.secondEvolution),
    activeSkill: CHICKEN_SKILLS[input.activeSkill] ? input.activeSkill : null,
    passiveSkill: CHICKEN_SKILLS[input.passiveSkill] ? input.passiveSkill : null,
    chickenCounterType: COUNTER_TYPES[input.chickenCounterType]
      ? input.chickenCounterType
      : getCounterTypeForChicken(input),
    skillTriggerTiming: normalizeSkillTiming(input.skillTriggerTiming, input.activeSkill),
    chickenStatusEffects: normalizeStatusEffects(input.chickenStatusEffects),
    titles: normalizeChickenArray(input.titles),
    frame: typeof input.frame === "string" ? input.frame : "",
    entryEffect: typeof input.entryEffect === "string" ? input.entryEffect : "",
    raceStatBoost: Math.max(0, Math.min(CHICKEN_BOOST_MAX_PENDING, Math.floor(input.raceStatBoost || 0))),
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

function getEvolutionQuality(chicken, evolution) {
  if ((chicken.hiddenEvolutionValue || 0) >= 30 && !chicken.chickenDisease && (chicken.chickenMood || 0) >= 70 && (chicken.chickenHealth || 0) >= 70) {
    return "perfect";
  }
  if ((chicken.hiddenEvolutionValue || 0) <= -25 || evolution.weak || chicken.evolutionBranch === "overfed") {
    return "bad";
  }
  if (chicken.chickenDisease || (chicken.chickenHealth || 0) <= 35) {
    return "abnormal";
  }
  return chicken.evolutionQuality || "normal";
}

function getSecondStageEvolution(chicken, evolution, quality) {
  const table = SECOND_STAGE_EVOLUTIONS[chicken.evolutionType] || {};
  const branch = table[quality] || table.normal;
  if (branch) return { ...branch, quality };
  const qualityLabel = {
    perfect: "王",
    bad: "劣化",
    abnormal: "異變"
  }[quality] || "二階";
  return {
    id: `${chicken.evolutionType || "unknown"}_${quality}`,
    title: `${evolution.name}${qualityLabel}`,
    icon: evolution.icon,
    branch: `${chicken.evolutionType || "unknown"}_${quality}`,
    frame: `${evolution.title}・${qualityLabel}`,
    quality
  };
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
  if (chicken.secondEvolution) return `二階分支：${chicken.secondEvolution.title}｜已完成`;
  return `二階分支：${getSecondStageEvolution(chicken, evolution, getEvolutionQuality(chicken, evolution)).title}\n條件已達成，下次獲得經驗或比賽結算時進化`;
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
  let nextType = chicken.evolutionType || determineEvolutionType(chicken);
  const evolution = EVOLUTION_TYPES[nextType];
  if (!evolution) return "";
  if (!chicken.evolutionType && !canEvolveTo(chicken, nextType, "mature")) return "";
  const firstEvolution = chicken.evolutionType !== nextType;
  const wasComplete = chicken.titles.includes(evolution.title);
  const hadSecondEvolution = Boolean(chicken.secondEvolution);
  chicken.evolutionType = nextType;
  chicken.evolutionQuality = getEvolutionQuality(chicken, evolution);
  chicken.activeSkill = chicken.activeSkill || evolution.activeSkill;
  chicken.passiveSkill = chicken.passiveSkill || evolution.passiveSkill;
  if (canEvolveTo(chicken, nextType, "complete")) {
    const secondEvolution = chicken.secondEvolution || getSecondStageEvolution(chicken, evolution, chicken.evolutionQuality);
    if (!chicken.secondEvolution) chicken.secondEvolution = normalizeSecondEvolution(secondEvolution);
    chicken.icon = secondEvolution.icon || evolution.icon;
    chicken.frame = secondEvolution.frame || evolution.title;
    chicken.entryEffect = chicken.entryEffect || evolution.entryEffect;
    if (!chicken.titles.includes(evolution.title)) chicken.titles.push(evolution.title);
    if (secondEvolution.title && !chicken.titles.includes(secondEvolution.title)) chicken.titles.push(secondEvolution.title);
    chicken.evolutionBranch = secondEvolution.branch || chicken.evolutionBranch;
  }
  if (firstEvolution) return `✨ ${chicken.name} 進化成 ${evolution.name}！`;
  if (chicken.level >= 16 && (!wasComplete || !hadSecondEvolution)) {
    const qualityText = {
      perfect: "✨ 完美進化",
      bad: "💀 劣化進化",
      abnormal: "😵 異常進化"
    }[chicken.evolutionQuality] || "🐓✨ 二階進化";
    const secondTitle = chicken.secondEvolution ? chicken.secondEvolution.title : evolution.title;
    return `${qualityText}：${chicken.name} 進化成 ${secondTitle}！`;
  }
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

function useChickenBooster(playerInput, now = Date.now(), random = Math.random) {
  const player = ensureOwnedChicken(playerInput, random);
  if ((player.chickenBooster || 0) <= 0) {
    return { ok: false, player, message: "你沒有雞用強化藥劑。" };
  }
  const chicken = player.ownedChicken;
  normalizeChickenMeta(chicken);
  player.chickenBoosterUseLog = Array.isArray(player.chickenBoosterUseLog)
    ? player.chickenBoosterUseLog.filter((time) => now - Number(time || 0) <= CHICKEN_BOOST_DANGER_WINDOW_MS)
    : [];
  player.chickenBooster -= 1;
  player.chickenBoosterUseLog.push(now);
  const recentUses = player.chickenBoosterUseLog.length;
  const deathChance = recentUses >= 3 ? Math.min(1, (recentUses - 2) * 0.35) : 0;
  if (deathChance > 0 && random() < deathChance) {
    const chickenName = chicken.name;
    player.ownedChicken = null;
    return {
      ok: true,
      player,
      chickenDied: true,
      message: `💀 ${chickenName} 短時間內吃太多強化藥劑，身體撐不住了。`
    };
  }
  chicken.raceStatBoost = Math.min(CHICKEN_BOOST_MAX_PENDING, (chicken.raceStatBoost || 0) + CHICKEN_BOOST_AMOUNT);
  return {
    ok: true,
    player,
    message: `💉 ${chicken.name} 注射強化藥劑。下一場比賽全數值 +${chicken.raceStatBoost}。${deathChance > 0 ? "\n⚠️ 牠的呼吸變得很急，再用可能會出事。" : ""}`
  };
}

function feedChicken(playerInput, feedType = "normalFeed", now = Date.now(), random = Math.random) {
  const player = updateChickenCareState(playerInput, now, random);
  const chicken = player.ownedChicken;
  const isGourmet = feedType === "gourmetFeed";
  const key = isGourmet ? "gourmetFeed" : "normalFeed";
  const label = isGourmet ? "超好吃飼料" : "普通飼料";
  if ((player[key] || 0) <= 0) {
    return { ok: false, player, message: `你沒有${label}。` };
  }
  player[key] -= 1;
  chicken.chickenFeedsToday += 1;
  chicken.chickenHunger = Math.min(100, chicken.chickenHunger + (isGourmet ? 34 : 24));
  chicken.chickenMood = Math.min(100, chicken.chickenMood + (isGourmet ? 16 : 6));
  chicken.chickenHealth = Math.min(100, chicken.chickenHealth + (isGourmet ? 4 : 2));
  if (isGourmet) {
    chicken.hiddenEvolutionValue += 4;
    chicken.evolutionBranch = chicken.evolutionBranch || "gourmet";
  }
  if (chicken.chickenFeedsToday >= 5) {
    chicken.chickenMood = Math.max(0, chicken.chickenMood - 8);
    chicken.chickenHealth = Math.max(0, chicken.chickenHealth - 6);
    chicken.hiddenEvolutionValue -= 8;
    chicken.evolutionPoints.clumsy = (chicken.evolutionPoints.clumsy || 0) + 1;
    chicken.evolutionBranch = "overfed";
    if (random() < 0.25) chicken.chickenStatusEffects = normalizeStatusEffects([...(chicken.chickenStatusEffects || []), { id: "tired", remaining: 2 }]);
  }
  return {
    ok: true,
    player,
    message: `🍖 已餵食${label}。飢餓 ${chicken.chickenHunger}%｜心情 ${getMoodIcon(chicken.chickenMood)}`
  };
}

function cleanChickenCoop(playerInput, now = Date.now(), random = Math.random) {
  const player = updateChickenCareState(playerInput, now, random);
  const chicken = player.ownedChicken;
  const cleaned = chicken.chickenPoop;
  chicken.chickenPoop = 0;
  chicken.chickenMood = Math.min(100, chicken.chickenMood + Math.min(15, cleaned * 2));
  chicken.chickenHealth = Math.min(100, chicken.chickenHealth + Math.min(8, cleaned));
  chicken.hiddenEvolutionValue += cleaned > 0 ? 2 : 0;
  return {
    ok: true,
    player,
    message: cleaned > 0 ? `🧹 掃掉 ${cleaned} 坨大便。雞舍清爽多了。` : "🧹 雞舍很乾淨，沒有大便。"
  };
}

function useChickenMedicine(playerInput, now = Date.now(), random = Math.random) {
  const player = updateChickenCareState(playerInput, now, random);
  const chicken = player.ownedChicken;
  if ((player.chickenMedicine || 0) <= 0) {
    return { ok: false, player, message: "你沒有特效藥。" };
  }
  player.chickenMedicine -= 1;
  chicken.chickenDisease = "";
  chicken.chickenHealth = Math.min(100, chicken.chickenHealth + 35);
  chicken.chickenMood = Math.min(100, chicken.chickenMood + 8);
  chicken.hiddenEvolutionValue += 3;
  return { ok: true, player, message: `💊 ${chicken.name} 吃下特效藥，健康恢復了。` };
}

function useAutoCleaner(playerInput, now = Date.now(), random = Math.random) {
  const player = updateChickenCareState(playerInput, now, random);
  const chicken = player.ownedChicken;
  if ((player.autoCleaner || 0) <= 0) {
    return { ok: false, player, message: "你沒有自動掃大便機。" };
  }
  player.autoCleaner -= 1;
  chicken.autoCleanExpireTime = Math.max(now, chicken.autoCleanExpireTime || 0) + CHICKEN_CARE_DAY_MS;
  chicken.chickenPoop = 0;
  chicken.chickenMood = Math.min(100, chicken.chickenMood + 6);
  return { ok: true, player, message: "🤖 自動掃大便機啟動 24 小時，雞舍暫時不用擔心。" };
}

function useChickenCareItem(playerInput, itemId = "magicCandy", now = Date.now(), random = Math.random, eatCandyFn = null) {
  if (itemId === "booster") return useChickenBooster(playerInput, now, random);
  if (itemId === "medicine") return useChickenMedicine(playerInput, now, random);
  if (itemId === "autoCleaner") return useAutoCleaner(playerInput, now, random);
  if (itemId === "magicCandy" && typeof eatCandyFn === "function") return eatCandyFn(playerInput, random);
  const player = updateChickenCareState(playerInput, now, random);
  return { ok: false, player, message: "這個道具目前不能在養雞面板使用。" };
}

function formatOwnedChicken(playerInput) {
  const player = updateChickenCareState(playerInput);
  const chicken = player.ownedChicken;
  normalizeChickenMeta(chicken);
  const personality = getPersonality(chicken.personalityId);
  const stage = getChickenStage(chicken);
  const evolution = EVOLUTION_TYPES[chicken.evolutionType];
  const activeSkill = CHICKEN_SKILLS[chicken.activeSkill];
  const passiveSkill = CHICKEN_SKILLS[chicken.passiveSkill];
  const counter = COUNTER_TYPES[getCounterTypeForChicken(chicken)] || COUNTER_TYPES.balanced;
  const timing = normalizeSkillTiming(chicken.skillTriggerTiming, chicken.activeSkill);
  const statusLine = chicken.chickenStatusEffects.length
    ? chicken.chickenStatusEffects.map((effect) => `${CHICKEN_STATUS_EFFECTS[effect.id].label}${effect.remaining}`).join("｜")
    : "無";
  const upgradeLine = chicken.levelUpOptions.length
    ? `\n\n✨ 可升級：${chicken.levelUpOptions.map((id) => getUpgradePool().find((item) => item.id === id).label).join("｜")}`
    : "";
  return [
    `${chicken.icon || "🐔"} ${chicken.name}${chicken.frame ? `｜${chicken.frame}` : ""}`,
    "",
    `Lv.${chicken.level}｜${stage.label}`,
    `EXP：${chicken.exp} / ${getExpToLevel(chicken)}`,
    `性格：${personality.label}`,
    `心情：${getMoodIcon(chicken.chickenMood)} ${chicken.chickenMood}%｜健康：${getHealthLabel(chicken.chickenHealth, chicken.chickenDisease)}｜飢餓：${chicken.chickenHunger}%`,
    `💩 雞舍：${chicken.chickenPoop} 坨${chicken.autoCleanExpireTime > Date.now() ? "｜🤖 清潔中" : ""}`,
    `類型：${counter.label}`,
    `目前型態：${evolution ? evolution.name : "未定"}`,
    `二階分支：${chicken.secondEvolution ? chicken.secondEvolution.title : "未定"}`,
    `進化分歧：${chicken.evolutionBranch || "未定"}｜品質：${{ perfect: "✨完美", bad: "💀劣化", abnormal: "😵異常" }[chicken.evolutionQuality] || "未知"}`,
    buildEvolutionCandidateSummary(chicken),
    `技能：${activeSkill ? activeSkill.name : "未解鎖"}｜${passiveSkill ? passiveSkill.name : "未解鎖"}`,
    `技能時機：${SKILL_TRIGGER_LABELS[timing]}`,
    `狀態：${statusLine}`,
    buildEvolutionProgress(chicken),
    "",
    `速度：${chicken.speed}`,
    `衝刺：${chicken.sprint}`,
    `穩定：${chicken.stability}`,
    `耐力：${chicken.stamina}`,
    `強化藥劑：${player.chickenBooster || 0}｜下場加成：+${chicken.raceStatBoost || 0}`,
    `飼料：普通 ${player.normalFeed || 0}｜超好吃 ${player.gourmetFeed || 0}｜特效藥 ${player.chickenMedicine || 0}`,
    `雞蛋：${player.chickenEggs || 0}｜進化素材：${player.rareEvolutionMaterial || 0}`,
    `研究紙條：${Object.values(player.chickenResearchNotes || {}).reduce((sum, count) => sum + count, 0)}`,
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
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:feed_normal:${ownerId}`)
        .setLabel(`普通飼料 ${player.normalFeed || 0}`)
        .setEmoji("🍖")
        .setStyle(ButtonStyle.Success)
        .setDisabled((player.normalFeed || 0) <= 0),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:feed_gourmet:${ownerId}`)
        .setLabel(`超好吃 ${player.gourmetFeed || 0}`)
        .setEmoji("🐔")
        .setStyle(ButtonStyle.Success)
        .setDisabled((player.gourmetFeed || 0) <= 0),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:clean:${ownerId}`)
        .setLabel("掃大便")
        .setEmoji("🧹")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:items:${ownerId}`)
        .setLabel("使用道具")
        .setEmoji("🎒")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:timing:${ownerId}`)
        .setLabel("技能時機")
        .setEmoji("⏱️")
        .setStyle(ButtonStyle.Secondary),
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

function buildChickenItemComponents(playerInput, ownerId = "none") {
  const player = getPlayer(playerInput);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:candy:${ownerId}`)
        .setLabel(`神奇糖果 ${player.magicCandy || 0}`)
        .setEmoji("🍬")
        .setStyle(ButtonStyle.Success)
        .setDisabled((player.magicCandy || 0) <= 0),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:booster:${ownerId}`)
        .setLabel(`強化藥劑 ${player.chickenBooster || 0}`)
        .setEmoji("💉")
        .setStyle(ButtonStyle.Primary)
        .setDisabled((player.chickenBooster || 0) <= 0),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:medicine:${ownerId}`)
        .setLabel(`特效藥 ${player.chickenMedicine || 0}`)
        .setEmoji("💊")
        .setStyle(ButtonStyle.Primary)
        .setDisabled((player.chickenMedicine || 0) <= 0),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:auto_cleaner:${ownerId}`)
        .setLabel(`掃大便機 ${player.autoCleaner || 0}`)
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled((player.autoCleaner || 0) <= 0)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:refresh:${ownerId}`)
        .setLabel("返回養雞面板")
        .setEmoji("↩️")
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

function getTrackModifier(id) {
  return RACE_TRACK_MODIFIERS.find((modifier) => modifier.id === id) || RACE_TRACK_MODIFIERS[0];
}

function rollTrackModifier(random = Math.random) {
  return RACE_TRACK_MODIFIERS[Math.floor(random() * RACE_TRACK_MODIFIERS.length)] || RACE_TRACK_MODIFIERS[0];
}

function hasCounterAdvantage(attacker, defender) {
  const attackerType = getCounterTypeForChicken(attacker);
  const defenderType = getCounterTypeForChicken(defender);
  return Boolean(COUNTER_TYPES[attackerType] && COUNTER_TYPES[attackerType].counters.includes(defenderType));
}

function getStatusSummary(runner) {
  const effects = normalizeStatusEffects(runner && runner.statusEffects);
  if (!effects.length) return "無";
  return effects.map((effect) => `${CHICKEN_STATUS_EFFECTS[effect.id].label}${effect.remaining}`).join("｜");
}

function addRunnerStatus(runner, id, remaining = 2) {
  if (!runner || !CHICKEN_STATUS_EFFECTS[id]) return;
  runner.statusEffects = normalizeStatusEffects(runner.statusEffects);
  const existing = runner.statusEffects.find((effect) => effect.id === id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, remaining);
  } else {
    runner.statusEffects.push({ id, remaining });
  }
}

function tickRunnerStatuses(runner) {
  if (!runner) return;
  runner.statusEffects = normalizeStatusEffects(runner.statusEffects)
    .map((effect) => ({ ...effect, remaining: effect.remaining - 1 }))
    .filter((effect) => effect.remaining > 0);
}

function getStatusBonus(runner) {
  const bonus = {
    sprintMultiplier: 1,
    stabilityMultiplier: 1,
    staminaMultiplier: 1,
    skillChanceBonus: 0,
    interfereBonus: 0,
    failRiskBonus: 0
  };
  for (const effect of normalizeStatusEffects(runner && runner.statusEffects)) {
    const config = CHICKEN_STATUS_EFFECTS[effect.id];
    bonus.sprintMultiplier += config.sprintBonus || 0;
    bonus.stabilityMultiplier -= config.stabilityPenalty || 0;
    bonus.staminaMultiplier -= config.staminaPenalty || 0;
    bonus.skillChanceBonus += config.skillChanceBonus || 0;
    bonus.interfereBonus += config.interfereBonus || 0;
    bonus.failRiskBonus += config.failRiskBonus || 0;
  }
  bonus.stabilityMultiplier = Math.max(0.5, bonus.stabilityMultiplier);
  bonus.staminaMultiplier = Math.max(0.5, bonus.staminaMultiplier);
  return bonus;
}

function getSkillTimingBonus(chicken, frameIndex, event, context = {}) {
  const timing = normalizeSkillTiming(chicken.skillTriggerTiming, chicken.activeSkill);
  const progress = (frameIndex + 1) / PK_FRAME_COUNT;
  if (timing === "start") return progress < 0.34 ? 1 : 0;
  if (timing === "mid") return progress >= 0.34 && progress < 0.68 ? 1 : 0;
  if (timing === "finish") return progress >= 0.68 || event === "終點爆衝" ? 1 : 0;
  if (timing === "overtaken") return context.overtaken || event === "干擾" ? 1 : 0;
  return 0;
}

function maybeApplyRandomStatus(runner, event, random = Math.random, track = null) {
  const trackConfig = track ? getTrackModifier(track.id || track) : null;
  const chance = 0.08 + (trackConfig && trackConfig.chaosBonus ? 0.08 : 0);
  if (random() >= chance) return "";
  const pool = event === "體力耗盡"
    ? ["tired", "focused"]
    : event === "干擾"
      ? ["angry", "focused"]
      : event === "衝刺" || event === "終點爆衝"
        ? ["excited", "runaway"]
        : ["focused", "excited", "tired"];
  const id = pool[Math.floor(random() * pool.length)] || "focused";
  addRunnerStatus(runner, id, 2);
  return `${CHICKEN_STATUS_EFFECTS[id].label} ${runner.chicken.icon || "🐔"} 狀態改變！`;
}

function applyBossRulePower(runner, opponent, frameIndex, event) {
  const rule = runner.chicken.bossRule;
  if (!rule) return 0;
  const progress = (frameIndex + 1) / PK_FRAME_COUNT;
  const behind = opponent && runner.position < opponent.position;
  if (rule === "tyrantRage" && behind) return 1.1 + progress;
  if (rule === "forcedMiracle" && progress > 0.62) return behind ? 2.8 : 1.2;
  if (rule === "ironWall" && ["跌倒", "干擾", "體力耗盡"].includes(event)) return 0.9;
  if (rule === "phantomHide" && progress > 0.4) return 0.8;
  if (rule === "abyssLowHp" && progress > 0.55) return 1.3;
  return 0;
}

function getBattleStatTotal(chickenInput) {
  const chicken = normalizeChickenMeta(chickenInput || {});
  return (chicken.speed || 0) + (chicken.sprint || 0) + (chicken.stability || 0) + (chicken.stamina || 0);
}

function getChickenPower(runnerOrChicken, frameIndex, event, random = Math.random, context = {}) {
  const runner = runnerOrChicken && runnerOrChicken.chicken ? runnerOrChicken : { chicken: runnerOrChicken, position: 0, statusEffects: [] };
  const chicken = runner.chicken;
  normalizeChickenMeta(chicken);
  const personality = getPersonality(chicken.personalityId);
  const opponent = context.opponent || null;
  const track = context.track ? getTrackModifier(context.track.id || context.track) : null;
  const statusBonus = getStatusBonus(runner);
  const timingBonus = getSkillTimingBonus(chicken, frameIndex, event, context);
  const skillChanceBonus = statusBonus.skillChanceBonus + timingBonus * 0.14 + (opponent && hasCounterAdvantage(chicken, opponent.chicken) ? 0.08 : 0);
  const progress = (frameIndex + 1) / PK_FRAME_COUNT;
  let step = 0.55
    + chicken.speed * 0.2 * (track ? (track.speedMultiplier || 1) : 1)
    + chicken.sprint * 0.08 * statusBonus.sprintMultiplier * (track ? (track.sprintMultiplier || 1) : 1)
    + chicken.stamina * progress * 0.1 * statusBonus.staminaMultiplier
    + chicken.stability * (track ? Math.max(track.stabilityWeight || 0, 0.035) : 0.025)
    + (random() - 0.5) * 0.55;
  if (personality.openBurst && progress < 0.35 && random() < personality.openBurst + skillChanceBonus) step += 2.2;
  if (personality.late && progress > 0.55) step += personality.late * 2;
  if (personality.comeback && progress > 0.65) step += personality.comeback * 2;
  if (personality.swing) step += (random() - 0.4) * personality.swing * 5;
  if (personality.rare && random() < personality.rare + skillChanceBonus) step += 2.5;
  if (personality.latePenalty && progress > 0.65) step -= personality.latePenalty * 2;
  if (personality.failRisk && random() < personality.failRisk + statusBonus.failRiskBonus) step -= 1.8;
  if (chicken.passiveSkill === "hotStart" && progress < 0.35 && random() < 0.22 + skillChanceBonus) step += 1.4;
  if (chicken.passiveSkill === "lastHope" && progress > 0.55) step += 0.4;
  if (chicken.passiveSkill === "sneakyPeck" && random() < 0.12 + skillChanceBonus) step += 0.7;
  if (chicken.passiveSkill === "heavyFeather" && progress < 0.45) step -= 0.45;
  if (chicken.passiveSkill === "paperWing") step += (random() - 0.58) * 1.6;
  if (chicken.passiveSkill === "lostAgain" && random() < 0.18) step -= 1.1;
  if (chicken.passiveSkill === "sparkFeather" && random() < 0.12 + skillChanceBonus) step += 1.6;
  if (chicken.passiveSkill === "winnerAura" && chicken.currentWinStreak >= 2) step += 0.45;
  if (chicken.passiveSkill === "clearMind" && ["體力耗盡", "干擾"].includes(event)) step += 0.55;
  if (chicken.passiveSkill === "mineSense" && ["衝刺", "終點爆衝", "逆轉"].includes(event)) step += 0.7;
  if (chicken.passiveSkill === "oldMineMemory" && progress > 0.45) step += 0.45;
  if (chicken.passiveSkill === "deepEcho" && progress > 0.6) step += 0.75;
  if (event === "衝刺") step += chicken.sprint * 0.18;
  if (event === "體力耗盡") step -= Math.max(0, 2.2 - chicken.stamina * 0.16);
  if (event === "終點爆衝" && progress > 0.65) step += chicken.sprint * 0.25;
  if (event === "終點爆衝" && progress > 0.65 && chicken.activeSkill === "blazeDash" && random() < 0.35 + skillChanceBonus) step += 3 + timingBonus;
  if (event === "逆轉" && progress > 0.55 && chicken.activeSkill === "miracleComeback" && random() < 0.35 + skillChanceBonus) step += 2.6 + timingBonus;
  if (event === "衝刺" && chicken.activeSkill === "galeRush") step += 1.5 + timingBonus * 0.6;
  if (event === "衝刺" && chicken.activeSkill === "thunderKick" && random() < 0.4 + skillChanceBonus) step += 2.5 + timingBonus;
  if (event === "終點爆衝" && progress > 0.65 && chicken.activeSkill === "royalPace") step += 1.2 + timingBonus * 0.5;
  if (event === "終點爆衝" && progress > 0.65 && chicken.activeSkill === "crystalFocus") step += 0.9 + timingBonus * 0.5;
  if (event === "跌倒" && chicken.activeSkill === "mudRoll") step += 0.8;
  if (event === "干擾" && chicken.activeSkill === "shadowSlip") step += 0.8;
  if (event === "衝刺" && chicken.activeSkill === "wrongWay" && random() < 0.25) step -= 2.2;
  if (event === "衝刺" && chicken.activeSkill === "crystalPeck" && random() < 0.28 + skillChanceBonus) step += 2;
  if (event === "逆轉" && chicken.activeSkill === "abyssCry") step += 1.8;
  if (opponent && hasCounterAdvantage(chicken, opponent.chicken)) step *= 1.08;
  if (runner.userId && isBossUserId(runner.userId) && opponent) {
    const statGap = getBattleStatTotal(chicken) - getBattleStatTotal(opponent.chicken);
    if (statGap > 0) step += Math.min(1.4, statGap * 0.045);
  }
  step += applyBossRulePower(runner, opponent, frameIndex, event);
  if (track && track.staminaDrain) step -= Math.max(0, progress * track.staminaDrain * (12 - Math.min(12, chicken.stamina)));
  step *= Math.max(0.5, Math.min(1, chicken.pvpPowerMultiplier || 1));
  step *= Math.max(1, Math.min(3, chicken.pvePowerMultiplier || 1));
  return Math.max(0, step);
}

function applyPkEvent(left, right, event, random = Math.random, battle = null) {
  const all = [left, right];
  const target = all[Math.floor(random() * all.length)];
  const other = target === left ? right : left;
  normalizeChickenMeta(target.chicken);
  normalizeChickenMeta(other.chicken);
  const personality = getPersonality(target.chicken.personalityId);
  const track = battle && battle.raceTrackModifier ? getTrackModifier(battle.raceTrackModifier.id || battle.raceTrackModifier) : null;
  const targetStatus = getStatusBonus(target);
  const counterBonus = hasCounterAdvantage(target.chicken, other.chicken) ? 0.1 : 0;
  let message = "";
  if (event === "跌倒") {
    const skillResist = target.chicken.activeSkill === "guardStep" ? 0.25 : 0;
    const passiveResist = target.chicken.passiveSkill === "stableSteps" ? 0.18 : 0;
    const bossResist = target.chicken.bossRule === "ironWall" ? 0.35 : 0;
    const resist = target.chicken.stability * 0.065 * targetStatus.stabilityMultiplier
      + (personality.resist || 0)
      + skillResist
      + passiveResist
      + bossResist
      + counterBonus
      - (track && track.fallRiskBonus ? track.fallRiskBonus : 0);
    if (random() > resist) {
      target.position -= Math.max(1.2, 3.1 - target.chicken.stability * 0.08) * (track && track.eventPower ? track.eventPower : 1);
      addBattlePoint(target, "miracle", 1);
      addBattlePoint(target, "clumsy", 2);
      addRunnerStatus(target, "tired", 2);
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
    const otherStatus = getStatusBonus(other);
    const otherResist = (other.chicken.bossRule === "ironWall" ? 0.22 : 0)
      + other.chicken.stability * 0.025 * otherStatus.stabilityMultiplier
      + (other.chicken.passiveSkill === "stableSteps" ? 0.1 : 0);
    if (random() < 0.45 + sneakyBonus + targetStatus.interfereBonus + counterBonus + (track && track.interfereBonus || 0) - otherResist) {
      other.position -= (target.chicken.activeSkill === "disruptCrow" ? 2.4 : 1.6) * (track && track.eventPower ? track.eventPower : 1);
      if (target.chicken.activeSkill === "rustScratch") other.position -= 0.8;
      addBattlePoint(target, "trickster", 2);
      addBattlePoint(target, "shadow", 1);
      addRunnerStatus(target, "angry", 2);
      message = `😈 ${target.chicken.icon || "🐔"} 干擾了對手！`;
    } else if (other.chicken.activeSkill === "boxHide" && random() < 0.35) {
      addBattlePoint(other, "stable", 1);
      message = `📦 ${other.chicken.icon || "🐔"} 躲進紙箱避開干擾！`;
    }
  }
  if (event === "逆轉") {
    const behind = left.position <= right.position ? left : right;
    behind.position += 2.8
      + behind.chicken.stamina * 0.11
      + behind.chicken.sprint * 0.035
      + (behind.chicken.activeSkill === "miracleComeback" ? 1.4 : 0)
      + (behind.chicken.bossRule === "forcedMiracle" ? 1.8 : 0);
    addBattlePoint(behind, "miracle", 2);
    addBattlePoint(behind, "comeback", 1);
    addRunnerStatus(behind, "focused", 2);
    message = `🔥 ${behind.chicken.icon || "🐔"} 開始逆轉！`;
  }
  for (const runner of all) runner.position = Math.max(0, Math.min(PK_TRACK_LENGTH, runner.position));
  return message;
}

function buildPkTrack(runner) {
  const position = Math.max(0, Math.min(PK_TRACK_LENGTH, Math.floor(runner.position)));
  return `${"—".repeat(position)}${runner.chicken.icon || "🐔"}${"—".repeat(PK_TRACK_LENGTH - position)}🏁`;
}

function hasChickenReachedFinish(battle) {
  return Boolean(
    battle
    && Array.isArray(battle.runners)
    && battle.runners.some((runner) => (runner.position || 0) >= PK_TRACK_LENGTH)
  );
}

function isBossUserId(userId) {
  return typeof userId === "string" && userId.startsWith("boss:");
}

function getBossById(id) {
  return BOSS_CHICKENS.find((boss) => boss.id === id) || BOSS_CHICKENS[0];
}

function getBossRank(playerInput) {
  const player = getPlayer(playerInput);
  return Math.max(1, Math.floor(player.chickenArenaRank || 1));
}

function scaleBossChicken(bossInput, rank = 1, challengerLevel = 1) {
  const boss = { ...bossInput };
  const safeRank = Math.max(1, Math.floor(rank || 1));
  const archetypeStats = {
    ironCrown: { speed: -1, sprint: -2, stability: 3, stamina: 1 },
    tyrant: { speed: 1, sprint: 4, stability: -2, stamina: 0 },
    miracle: { speed: 0, sprint: 1, stability: 1, stamina: 3 }
  }[boss.id] || { speed: 0, sprint: 0, stability: 0, stamina: 0 };
  const base = 2 + Math.floor(safeRank * 0.75);
  const highRankBonus = safeRank >= 15 ? 4 : safeRank >= 10 ? 3 : safeRank >= 6 ? 2 : safeRank >= 3 ? 1 : 0;
  const scaleStat = (offset = 0) => clampStat(base + offset + highRankBonus);
  boss.level = safeRank;
  boss.speed = scaleStat(archetypeStats.speed);
  boss.sprint = scaleStat(archetypeStats.sprint);
  boss.stability = scaleStat(archetypeStats.stability);
  boss.stamina = scaleStat(archetypeStats.stamina);
  boss.pvePowerMultiplier = Number((0.8 + safeRank * 0.035 + highRankBonus * 0.04).toFixed(3));
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
  boss.bossRule = boss.bossRule || {
    ironCrown: "ironWall",
    tyrant: "tyrantRage",
    miracle: "forcedMiracle"
  }[boss.id] || "ironWall";
  boss.chickenCounterType = getCounterTypeForChicken(boss);
  boss.skillTriggerTiming = normalizeSkillTiming(boss.skillTriggerTiming, boss.activeSkill);
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

function calculateBattleExp(battle, runner, won, close) {
  const base = 18 + (won ? 32 : 10) + (close ? 8 : 0) + Math.floor((runner.position || 0) / 3);
  if (!battle || !battle.isBoss) return base;
  const rank = Math.max(1, Math.floor(battle.bossRank || 1));
  const rankMultiplier = Math.max(0.45, Math.min(3, 0.65 + rank * 0.08));
  const firstClearMultiplier = won && !battle.bossReplayRank ? 2.5 : 1;
  return Math.max(1, Math.floor(base * rankMultiplier * firstClearMultiplier));
}

function createRunner(userId, players, random = Math.random, bossId = null, bossRank = 1, bossChallengerLevel = 1) {
  if (isBossUserId(userId)) {
    const boss = scaleBossChicken(getBossById(bossId || userId.slice(5)), bossRank, bossChallengerLevel);
    return { userId, chicken: normalizeChickenMeta({ ...boss, races: 0, wins: 0, exp: 0, levelUpOptions: [] }), position: 0, battleStats: {}, statusEffects: [] };
  }
  const player = updateChickenCareState(players[userId], Date.now(), random);
  players[userId] = player;
  const chicken = { ...player.ownedChicken };
  const carePenalty = (chicken.chickenDisease ? 0.82 : 1)
    * (chicken.chickenPoop >= 8 ? 0.9 : 1)
    * (chicken.chickenMood <= 25 ? 0.9 : 1)
    * (chicken.chickenHunger <= 15 ? 0.88 : 1);
  if (carePenalty < 1) {
    chicken.speed = clampStat(chicken.speed * carePenalty);
    chicken.sprint = clampStat(chicken.sprint * carePenalty);
    chicken.stability = clampStat(chicken.stability * carePenalty);
    chicken.stamina = clampStat(chicken.stamina * carePenalty);
    chicken.entryEffect = [chicken.entryEffect, `🤒 ${chicken.name} 狀態不佳，今天跑起來有點沉。`].filter(Boolean).join("\n");
  }
  const statBoost = Math.max(0, Math.floor(chicken.raceStatBoost || 0));
  if (statBoost > 0) {
    chicken.speed += statBoost;
    chicken.sprint += statBoost;
    chicken.stability += statBoost;
    chicken.stamina += statBoost;
    chicken.entryEffect = [chicken.entryEffect, `💉 ${chicken.name} 的強化藥劑開始生效！`].filter(Boolean).join("\n");
  }
  return { userId, chicken, position: 0, battleStats: {}, consumedStatBoost: statBoost, statusEffects: normalizeStatusEffects(chicken.chickenStatusEffects) };
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

function createBattle(challengerId, targetId, players, now = Date.now(), random = Math.random, guildId = "global", options = {}) {
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
    deathmatch: Boolean(options.deathmatch),
    challengerId,
    targetId,
    createdAt: now,
    expiresAt: now + PK_TIMEOUT_MS,
    runners: null,
    frames: [],
    result: null,
    raceTrackModifier: rollTrackModifier(random),
    timers: [],
    message: null
  };
  activeChickenBattles.set(battle.id, battle);
  activeBattleByPlayerId.set(challengerId, battle.id);
  activeBattleByPlayerId.set(targetId, battle.id);
  return { ok: true, battle, players };
}

function createBossBattle(challengerId, players, now = Date.now(), random = Math.random, guildId = "global", bossId = null, requestedRank = null) {
  if (activeBattleByPlayerId.has(challengerId)) return { ok: false, message: "你已經在賽雞 PK 中。" };
  const boss = getBossById(bossId || BOSS_CHICKENS[Math.floor(random() * BOSS_CHICKENS.length)].id);
  const challenger = ensureOwnedChicken(players[challengerId], random);
  const currentBossRank = getBossRank(challenger);
  const safeRequestedRank = requestedRank == null ? null : Math.max(1, Math.floor(requestedRank || 1));
  const highestClearedRank = Math.max(0, Math.floor((challenger.chickenArenaRank || 1) - 1));
  const isReplayRank = safeRequestedRank != null && safeRequestedRank <= highestClearedRank;
  if (safeRequestedRank != null && !isReplayRank && safeRequestedRank !== currentBossRank) {
    return { ok: false, message: `只能重打已通關 Rank 1~${highestClearedRank || 0}，或挑戰目前 Rank ${currentBossRank}。` };
  }
  const bossRank = isReplayRank ? safeRequestedRank : currentBossRank;
  const challengerLevel = Math.max(1, Math.floor(challenger.ownedChicken && challenger.ownedChicken.level || 1));
  const scaledBoss = scaleBossChicken(boss, bossRank, challengerLevel);
  players[challengerId] = challenger;
  const battle = {
    id: `${now}-${challengerId}-boss-${boss.id}`,
    guildId,
    status: "pending",
    challengerId,
    targetId: `boss:${boss.id}`,
    bossId: boss.id,
    bossRank,
    bossChallengerLevel: challengerLevel,
    bossReplayRank: isReplayRank,
    isBoss: true,
    createdAt: now,
    expiresAt: now + PK_TIMEOUT_MS,
    runners: null,
    frames: [],
    result: null,
    raceTrackModifier: rollTrackModifier(random),
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

function clearBattlesForPlayer(userId) {
  const battleId = activeBattleByPlayerId.get(userId);
  if (!battleId) return false;
  clearBattle(battleId);
  return true;
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
        .setLabel(battle.deathmatch ? "接受生死鬥" : "接受 PK")
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

function formatBattleChickenStats(label, chicken) {
  return `${label}數值：Lv.${chicken.level || 1}｜速${chicken.speed || 0} 衝${chicken.sprint || 0} 穩${chicken.stability || 0} 耐${chicken.stamina || 0}`;
}

function formatBattleStatusLine(label, runner) {
  if (!runner) return "";
  return `${label}狀態：${getStatusSummary(runner)}`;
}

function getBossRuleText(rule) {
  return {
    ironWall: "特殊規則：幾乎不吃負面事件",
    tyrantRage: "特殊規則：越落後越快",
    forcedMiracle: "特殊規則：終盤必定爆衝一次",
    phantomHide: "特殊規則：隱藏部分狀態",
    abyssLowHp: "特殊規則：越危險越強"
  }[rule] || "特殊規則：館主節奏";
}

function formatBattleParticipantBlock(title, nameLine, statsLine, statusLine = "") {
  return [
    `${title} ${nameLine}`,
    `　${statsLine}`,
    statusLine ? `　${statusLine}` : ""
  ].filter(Boolean).join("\n");
}

function buildBattleEmbed(battle, players, message = "") {
  const challenger = ensureOwnedChicken(players[battle.challengerId]);
  const boss = battle.isBoss ? scaleBossChicken(getBossById(battle.bossId), battle.bossRank || 1, battle.bossChallengerLevel || 1) : null;
  const target = boss ? { ownedChicken: boss } : ensureOwnedChicken(players[battle.targetId]);
  const frame = battle.frames[battle.frames.length - 1] || [
    `${challenger.ownedChicken.icon || "🐔"}${"—".repeat(PK_TRACK_LENGTH)}🏁`,
    `${target.ownedChicken.icon || "🐔"}${"—".repeat(PK_TRACK_LENGTH)}🏁`
  ].join("\n");
  const targetLabel = boss ? `${boss.icon} ${boss.name}｜${boss.title}` : `<@${battle.targetId}>：${target.ownedChicken.icon || "🐔"} ${target.ownedChicken.name}`;
  const challengerRunner = Array.isArray(battle.runners) ? battle.runners.find((runner) => runner.userId === battle.challengerId) : null;
  const targetRunner = Array.isArray(battle.runners) ? battle.runners.find((runner) => runner.userId === battle.targetId) : null;
  const targetStats = boss
    ? formatBattleChickenStats("館主", targetRunner ? targetRunner.chicken : boss)
    : formatBattleChickenStats("對手", targetRunner ? targetRunner.chicken : target.ownedChicken);
  const challengerStats = battle.isBoss
    ? formatBattleChickenStats("挑戰者", challengerRunner ? challengerRunner.chicken : challenger.ownedChicken)
    : formatBattleChickenStats("挑戰者", challengerRunner ? challengerRunner.chicken : challenger.ownedChicken);
  const track = getTrackModifier(battle.raceTrackModifier && (battle.raceTrackModifier.id || battle.raceTrackModifier));
  const trackLines = [
    `🏁 ${track.label}｜${track.text}`,
    boss ? `👑 ${getBossRuleText((targetRunner ? targetRunner.chicken : boss).bossRule)}` : "⚔️ PVP：顯示雙方能力值"
  ].join("\n");
  const participants = [
    formatBattleParticipantBlock(
      "①",
      `<@${battle.challengerId}>｜${challenger.ownedChicken.icon || "🐔"} ${challenger.ownedChicken.name}`,
      challengerStats,
      formatBattleStatusLine("挑戰者", challengerRunner)
    ),
    "VS",
    formatBattleParticipantBlock(
      "②",
      targetLabel,
      targetStats,
      formatBattleStatusLine(boss ? "館主" : "對手", targetRunner)
    )
  ].join("\n");
  return new EmbedBuilder()
    .setColor(battle.status === "settled" ? 0xfacc15 : 0xef4444)
    .setTitle(battle.isBoss ? "賽雞館挑戰" : battle.deathmatch ? "1v1 賽雞生死鬥" : "1v1 賽雞 PK")
    .setDescription([
      message,
      "🏟️【賽道】",
      trackLines,
      "",
      "🐔【出賽】",
      participants,
      "",
      "📺【賽況】",
      frame
    ].filter(Boolean).join("\n").slice(0, 4096));
}

function updateBattleFrame(battle, players, frameIndex, random = Math.random) {
  if (!battle.runners) {
    battle.runners = [
      createRunner(battle.challengerId, players, random),
      createRunner(battle.targetId, players, random, battle.bossId, battle.bossRank, battle.bossChallengerLevel)
    ];
    if (!battle.isBoss) applyPvpLevelBalance(battle.runners);
  }
  const track = getTrackModifier(battle.raceTrackModifier && (battle.raceTrackModifier.id || battle.raceTrackModifier));
  const events = ["衝刺", "跌倒", "干擾", "逆轉", "體力耗盡", "終點爆衝"];
  const event = events[Math.floor(random() * events.length)] || "衝刺";
  const beforeOrder = [...battle.runners].sort((a, b) => b.position - a.position).map((runner) => runner.userId);
  for (const [index, runner] of battle.runners.entries()) {
    const before = runner.position;
    const opponent = battle.runners[index === 0 ? 1 : 0];
    runner.position += getChickenPower(runner, frameIndex, event, random, {
      opponent,
      track,
      overtaken: runner.lastRank != null && runner.lastRank > index
    });
    if (runner.position - before > 2.2) addBattlePoint(runner, "burst", 1);
  }
  const eventMessage = applyPkEvent(battle.runners[0], battle.runners[1], event, random, battle);
  const statusMessage = maybeApplyRandomStatus(battle.runners[Math.floor(random() * battle.runners.length)], event, random, track);
  for (const runner of battle.runners) runner.position = Math.max(0, Math.min(PK_TRACK_LENGTH, runner.position));
  const afterOrder = [...battle.runners].sort((a, b) => b.position - a.position).map((runner) => runner.userId);
  const overtakes = [];
  for (const runner of battle.runners) {
    const beforeRank = beforeOrder.indexOf(runner.userId);
    const afterRank = afterOrder.indexOf(runner.userId);
    runner.lastRank = afterRank;
    if (beforeRank > afterRank) overtakes.push(`💥 ${runner.chicken.icon || "🐔"} 超車了！！`);
  }
  const hint = {
    衝刺: "💨 衝刺！",
    跌倒: "🍌 跌倒！",
    干擾: "😈 干擾！",
    逆轉: "🔥 逆轉！",
    體力耗盡: "💦 體力耗盡！",
    終點爆衝: "⚡ 終點爆衝！"
  }[event];
  const ranked = [...battle.runners].sort((a, b) => b.position - a.position);
  const rankLines = ranked.map((runner, index) => `${["🥇", "🥈", "🥉"][index] || "🏁"} ${runner.chicken.icon || "🐔"} ${getStatusSummary(runner)}`).join("\n");
  const leader = ranked[0];
  const gap = PK_TRACK_LENGTH - (leader.position || 0);
  const finalZone = gap <= 4 ? "🔥 終點爆衝區！聊天室開始沸騰！！\n「J8！！」「不要停！！」" : "";
  const counterLine = battle.runners
    .filter((runner, index) => hasCounterAdvantage(runner.chicken, battle.runners[index === 0 ? 1 : 0].chicken))
    .map((runner) => `⚔️ ${runner.chicken.icon || "🐔"} 對位有利`)
    .join("\n");
  const frame = [
    ...battle.runners
      .filter((runner) => runner.chicken.entryEffect && frameIndex === 0)
      .map((runner) => runner.chicken.entryEffect),
    finalZone,
    ...battle.runners.map((runner) => buildPkTrack(runner)),
    rankLines,
    ...overtakes,
    counterLine,
    statusMessage,
    eventMessage || hint
  ].filter(Boolean).join("\n");
  for (const runner of battle.runners) tickRunnerStatuses(runner);
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
    const consumedStatBoost = Math.max(0, Math.floor(runner.consumedStatBoost || 0));
    if (consumedStatBoost > 0) chicken.raceStatBoost = 0;
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
    const exp = calculateBattleExp(battle, runner, won, close);
    const levelMessage = addChickenExp(player, exp, random);
    runner.expGained = exp;
    const boosterDropChance = battle.isBoss
      ? (battle.bossReplayRank ? 0.04 : 0.14)
      : (battle.deathmatch ? 0.12 : 0.07);
    if (won && random() < boosterDropChance) {
      player.chickenBooster = (player.chickenBooster || 0) + 1;
      runner.rewardMessage = [runner.rewardMessage, "💉 掉落：雞用強化藥劑 x1"].filter(Boolean).join("\n");
    }
    if (battle.isBoss && won) {
      const existingRewardMessage = runner.rewardMessage;
      const boss = getBossById(battle.bossId);
      chicken.bossWins += 1;
      if (!chicken.titles.includes(boss.rewardTitle)) chicken.titles.push(boss.rewardTitle);
      chicken.frame = chicken.frame || boss.rewardTitle;
      const isReplayRank = Boolean(battle.bossReplayRank);
      const rewardGold = isReplayRank ? 0 : calculateBossGoldReward(battle.bossRank || 1, random);
      if (rewardGold > 0) player.gold = (player.gold || 0) + rewardGold;
      if (!isReplayRank) player.chickenArenaRank = Math.max(getBossRank(player), (battle.bossRank || 1) + 1);
      const rareMessages = [];
      if (!isReplayRank && random() < 0.08) {
        const rareTitle = `${boss.rewardTitle}・高階`;
        if (!chicken.titles.includes(rareTitle)) chicken.titles.push(rareTitle);
        rareMessages.push(`🏅 稀有稱號：${rareTitle}`);
      }
      if (!isReplayRank && random() < 0.05) {
        chicken.frame = "賽雞館金框";
        rareMessages.push("✨ 雞外觀：賽雞館金框");
      }
      runner.rewardMessage = [
        `🏟️ 賽雞館 Rank ${battle.bossRank || 1} ${isReplayRank ? "重打勝利" : "通關"}`,
        isReplayRank ? "💰 重打已通關館主，不掉落金幣。" : `💰 獲得 ${rewardGold} 金幣`,
        isReplayRank ? `目前進度：Rank ${player.chickenArenaRank || 1}` : `下一館：Rank ${player.chickenArenaRank}`,
        existingRewardMessage,
        ...rareMessages
      ].join("\n");
    }
    players[runner.userId] = player;
    runner.levelMessage = [progressEvolutionMessage, levelMessage].filter(Boolean).join("\n");
  }
  let deathmatchMessage = "";
  if (battle.deathmatch && !isBossUserId(finalLoser.userId)) {
    const loserPlayer = ensureOwnedChicken(players[finalLoser.userId], random);
    const loserChicken = loserPlayer.ownedChicken;
    if (loserChicken) {
      battle.deathmatchFeast = {
        ownerId: finalLoser.userId,
        chickenName: loserChicken.name
      };
      loserPlayer.ownedChicken = null;
      players[finalLoser.userId] = loserPlayer;
      deathmatchMessage = `🍗 生死鬥結束，「${loserChicken.name}」被烤來吃了。`;
    }
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
    deathmatchMessage,
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
  CHICKEN_RESEARCH_NOTES,
  COUNTER_TYPES,
  EVOLUTION_TYPES,
  PERSONALITIES,
  RACE_TRACK_MODIFIERS,
  SKILL_TRIGGER_LABELS,
  buildBattleComponents,
  buildBattleEmbed,
  buildChickenEmbed,
  buildChickenItemComponents,
  buildChickenPanelComponents,
  buildChickenUpgradeComponents,
  addChickenExp,
  applyPvpLevelBalance,
  chooseChickenUpgrade,
  clearBattle,
  clearBattlesForPlayer,
  createBattle,
  createBossBattle,
  cycleChickenSkillTiming,
  cleanChickenCoop,
  calculateBattleExp,
  calculateBossGoldReward,
  determineEvolutionType,
  getEvolutionMissingRequirements,
  ensureOwnedChicken,
  feedChicken,
  formatOwnedChicken,
  getBattle,
  getBossRank,
  getCounterTypeForChicken,
  getChickenRequiredExp,
  getChickenStage,
  hasChickenReachedFinish,
  isChickenPkComponent,
  isChickenPanelComponent,
  isChickenUpgradeComponent,
  makeWildMineChicken,
  normalizeOwnedChicken,
  renameChicken,
  roastOwnedChicken,
  settleBattle,
  shareRoastChickenMeal,
  updateChickenCareState,
  useAutoCleaner,
  updateBattleFrame,
  useChickenBooster,
  useChickenCareItem,
  useChickenMedicine
};

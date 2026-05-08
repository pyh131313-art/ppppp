"use strict";

const { CONFIG } = require("./config");
const { createFunState, normalizeFunState } = require("./funSystem");
const { createTraitState, normalizeTraitState } = require("./traitSystem");

const BAG_CAPACITY = 12;
const ITEM_STACK_SIZE = 10;
const DAMAGE_PER_HIT = 0.5;
const CHICKEN_TRAIT_IDS = [
  "chickenBlood",
  "goldCrownLuck",
  "cuckooCharm",
  "comebackChickenSoul",
  "roastChickenScent"
];
const CHICKEN_EVOLUTION_POINT_KEYS = [
  "blaze",
  "iron",
  "miracle",
  "trickster",
  "gale",
  "crown",
  "thunder",
  "shadow",
  "crystal",
  "clumsy",
  "mine"
];
const STACKABLE_ITEM_KEYS = new Set([
  "ore",
  "goldOre",
  "platinumOre",
  "oreIngot",
  "goldOreIngot",
  "platinumOreIngot",
  "redGem",
  "blueGem",
  "greenGem",
  "invertedOre",
  "invertedGem"
]);

function createPlayer() {
  return {
    gold: 0,
    bankGold: 0,
    healingPotion: 0,
    magicCandy: 0,
    chickenBooster: 0,
    normalFeed: 0,
    gourmetFeed: 0,
    chickenMedicine: 0,
    autoCleaner: 0,
    chickenBoosterUseLog: [],
    undyingTotem: 0,
    rusty: 0,
    collection: {},
    bombs: 0,
    dead: false,
    deathAt: null,
    lastDeathLostGold: 0,
    mines: 0,
    depth: 0,
    runDepthProgress: 0,
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
    invertedOre: 0,
    invertedGem: 0,
    orichalcum: 0,
    guaranteedGemCaveTicket: 0,
    thickSoleShoes: 0,
    activeMarketBlessings: {},
    platinumJunk: 0,
    uiMode: "full",
    activeMinePanelMessageId: "",
    activeMinePanelChannelId: "",
    runMode: null,
    runModeOptions: [],
    digPathOptions: {},
    caveType: null,
    zone: "surface",
    lavaProgress: 0,
    undergroundCampUnlocked: false,
    skyCampUnlocked: false,
    lastElevatorAt: 0,
    highTierEligible: false,
    enteringGold: 0,
    minorBuffs: {
      gold: 0,
      bomb: 0,
      bag: 0,
      ore: 0,
      sustain: 0,
      luck: 0,
      event: 0,
      reverse: 0
    },
    minorBuffOptions: [],
    minorBuffSelections: [],
    minorBuffBreakthroughMode: false,
    nextBuffDepth: 5,
    pendingEvent: null,
    nextEventDepth: 4,
    eventMissCount: 0,
    eventChallenge: null,
    traitSwapEvent: null,
    traitMutation: null,
    digPathHistory: [],
    memoryChallenge: null,
    tempEffects: [],
    forcedNextResult: null,
    goldBeast: null,
    hasSeenGoldenBeast: false,
    returnBlessing: false,
    rescueBonusCount: 0,
    potionCooldown: 0,
    potionPurchaseDay: "",
    potionPurchasesToday: 0,
    magicCandyPurchaseDay: "",
    magicCandyPurchasesToday: 0,
    lastTotemResetDate: "",
    dailyTotemPurchaseCount: 0,
    minerHelmetCount: 0,
    undergroundStorage: {
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
      invertedOre: 0,
      invertedGem: 0,
      orichalcum: 0,
      platinumJunk: 0,
      minerHelmetCount: 0,
      healingPotion: 0,
      magicCandy: 0,
      undyingTotem: 0,
      chickenTraitTickets: 0
    },
    pendingNextRunTraits: [],
    migratedToUndergroundCamp: false,
    preUpdateDeepPlayer: false,
    lastMigrationMessage: "",
    expansionHeart: false,
    chickenTraitTickets: 0,
    chickenArenaRank: 1,
    chickenRoastHpBonus: 0,
    chickenAmuletUsed: false,
    chickenResearchNotes: {},
    chickenEggs: 0,
    rareEvolutionMaterial: 0,
    wildChickenInfluence: {},
    wildChickenEncounter: null,
    ownedChicken: null,
    challenge: null,
    challengeBestDepth: 0,
    challengeTraitOptions: [],
    ...createFunState(),
    traitState: createTraitState(),
    tempMaxHp: 0,
    bagBonusSlots: 0,
    bestRecordTimestamps: [],
    lastChargeSkillUsed: null,
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
  next.minorBuffOptions = Array.isArray(player && player.minorBuffOptions)
    ? player.minorBuffOptions.filter((buff) => CONFIG.minorBuffs[buff]).slice(0, 3)
    : [];
  next.minorBuffSelections = Array.isArray(player && player.minorBuffSelections)
    ? player.minorBuffSelections.filter((buff) => CONFIG.minorBuffs[buff]).slice(0, 1)
    : [];
  next.minorBuffBreakthroughMode = Boolean(player && player.minorBuffBreakthroughMode);
  next.uiMode = player && player.uiMode === "compact" ? "compact" : "full";
  next.runModeOptions = Array.isArray(player && player.runModeOptions)
    ? player.runModeOptions.filter((mode) => CONFIG.runModes[mode]).slice(0, 2)
    : [];
  next.digPathOptions = {
    ...(player && player.digPathOptions ? player.digPathOptions : {})
  };
  next.tempEffects = Array.isArray(player && player.tempEffects)
    ? player.tempEffects.map((effect) => ({ ...effect }))
    : [];
  next.digPathHistory = Array.isArray(player && player.digPathHistory)
    ? player.digPathHistory
      .filter((entry) => entry && typeof entry.label === "string" && entry.label.trim())
      .map((entry) => ({
        label: entry.label.trim(),
        depth: Number.isFinite(entry.depth) ? entry.depth : 0
      }))
      .slice(-10)
    : [];
  next.memoryChallenge = player && player.memoryChallenge && typeof player.memoryChallenge === "object"
    ? {
      eventId: player.memoryChallenge.eventId || "",
      correctChoice: player.memoryChallenge.correctChoice || "",
      options: player.memoryChallenge.options && typeof player.memoryChallenge.options === "object"
        ? { ...player.memoryChallenge.options }
        : {}
    }
    : null;
  next.eventChallenge = player && player.eventChallenge && typeof player.eventChallenge === "object"
    ? {
      eventId: typeof player.eventChallenge.eventId === "string" ? player.eventChallenge.eventId : "",
      type: typeof player.eventChallenge.type === "string" ? player.eventChallenge.type : "",
      correctChoice: typeof player.eventChallenge.correctChoice === "string" ? player.eventChallenge.correctChoice : "",
      choices: Array.isArray(player.eventChallenge.choices)
        ? player.eventChallenge.choices
          .filter((choice) => choice && typeof choice.id === "string" && typeof choice.label === "string")
          .map((choice) => ({ id: choice.id, label: choice.label }))
          .slice(0, 5)
        : [],
      startedAt: Math.max(0, Number(player.eventChallenge.startedAt || 0)),
      expiresAt: Math.max(0, Number(player.eventChallenge.expiresAt || 0)),
      durability: Math.max(0, Math.min(9, Math.floor(player.eventChallenge.durability || 0))),
      angle: Math.max(0, Math.min(359, Math.floor(player.eventChallenge.angle || 0))),
      targetAngle: Math.max(0, Math.min(359, Math.floor(player.eventChallenge.targetAngle || 0))),
      tolerance: Math.max(1, Math.min(90, Math.floor(player.eventChallenge.tolerance || 12))),
      attempts: Math.max(0, Math.min(9, Math.floor(player.eventChallenge.attempts || 0))),
      hint: typeof player.eventChallenge.hint === "string" ? player.eventChallenge.hint.slice(0, 120) : ""
    }
    : null;
  next.traitSwapEvent = player && player.traitSwapEvent && typeof player.traitSwapEvent === "object"
    ? {
      eventId: typeof player.traitSwapEvent.eventId === "string" ? player.traitSwapEvent.eventId : "",
      offeredTrait: CONFIG.runModes[player.traitSwapEvent.offeredTrait] ? player.traitSwapEvent.offeredTrait : "",
      mutation: typeof player.traitSwapEvent.mutation === "string" ? player.traitSwapEvent.mutation : ""
    }
    : null;
  next.traitMutation = player && player.traitMutation && typeof player.traitMutation === "object"
    ? {
      id: typeof player.traitMutation.id === "string" ? player.traitMutation.id : "",
      label: typeof player.traitMutation.label === "string" ? player.traitMutation.label.slice(0, 20) : "",
      remaining: Math.max(0, Math.min(99, Math.floor(player.traitMutation.remaining || 0)))
    }
    : null;
  next.goldBeast = player && player.goldBeast ? { ...player.goldBeast } : null;
  next.undergroundStorage = {
    ...createPlayer().undergroundStorage,
    ...(player && player.undergroundStorage ? player.undergroundStorage : {})
  };
  next.pendingNextRunTraits = Array.isArray(player && player.pendingNextRunTraits)
    ? player.pendingNextRunTraits.filter((mode) => CONFIG.runModes[mode]).slice(0, 10)
    : [];
  next.ownedChicken = player && player.ownedChicken && typeof player.ownedChicken === "object"
    ? {
      id: player.ownedChicken.id || `${Date.now()}-legacy`,
      name: String(player.ownedChicken.name || "小咕").slice(0, 12),
      icon: typeof player.ownedChicken.icon === "string" && player.ownedChicken.icon ? player.ownedChicken.icon : "🐔",
      personalityId: player.ownedChicken.personalityId || "charger",
      level: Math.max(1, Math.floor(player.ownedChicken.level || 1)),
      exp: Math.max(0, Math.floor(player.ownedChicken.exp || 0)),
      speed: Math.max(1, Math.min(20, Math.floor(player.ownedChicken.speed || 5))),
      sprint: Math.max(1, Math.min(20, Math.floor(player.ownedChicken.sprint || 5))),
      stability: Math.max(1, Math.min(20, Math.floor(player.ownedChicken.stability || 5))),
      stamina: Math.max(1, Math.min(20, Math.floor(player.ownedChicken.stamina || 5))),
      wins: Math.max(0, Math.floor(player.ownedChicken.wins || 0)),
      races: Math.max(0, Math.floor(player.ownedChicken.races || 0)),
      highestComeback: Math.max(0, Math.floor(player.ownedChicken.highestComeback || 0)),
      currentWinStreak: Math.max(0, Math.floor(player.ownedChicken.currentWinStreak || 0)),
      longestWinStreak: Math.max(0, Math.floor(player.ownedChicken.longestWinStreak || 0)),
      bossWins: Math.max(0, Math.floor(player.ownedChicken.bossWins || 0)),
      evolutionPoints: Object.fromEntries(CHICKEN_EVOLUTION_POINT_KEYS.map((key) => [
        key,
        Math.max(0, Math.floor(player.ownedChicken.evolutionPoints && player.ownedChicken.evolutionPoints[key] || 0))
      ])),
      evolutionType: typeof player.ownedChicken.evolutionType === "string" ? player.ownedChicken.evolutionType : null,
      activeSkill: typeof player.ownedChicken.activeSkill === "string" ? player.ownedChicken.activeSkill : null,
      passiveSkill: typeof player.ownedChicken.passiveSkill === "string" ? player.ownedChicken.passiveSkill : null,
      chickenCounterType: typeof player.ownedChicken.chickenCounterType === "string" ? player.ownedChicken.chickenCounterType : "",
      skillTriggerTiming: typeof player.ownedChicken.skillTriggerTiming === "string" ? player.ownedChicken.skillTriggerTiming : "",
      chickenStatusEffects: Array.isArray(player.ownedChicken.chickenStatusEffects)
        ? player.ownedChicken.chickenStatusEffects
          .filter((effect) => effect && typeof effect.id === "string")
          .map((effect) => ({
            id: effect.id,
            remaining: Math.max(1, Math.min(9, Math.floor(effect.remaining || 1)))
          }))
          .slice(0, 5)
        : [],
      chickenHunger: Math.max(0, Math.min(100, Math.floor(player.ownedChicken.chickenHunger == null ? 70 : player.ownedChicken.chickenHunger))),
      chickenMood: Math.max(0, Math.min(100, Math.floor(player.ownedChicken.chickenMood == null ? 70 : player.ownedChicken.chickenMood))),
      chickenHealth: Math.max(0, Math.min(100, Math.floor(player.ownedChicken.chickenHealth == null ? 90 : player.ownedChicken.chickenHealth))),
      chickenPoop: Math.max(0, Math.min(99, Math.floor(player.ownedChicken.chickenPoop || 0))),
      chickenDisease: typeof player.ownedChicken.chickenDisease === "string" ? player.ownedChicken.chickenDisease : "",
      lastChickenCareAt: Math.max(0, Number(player.ownedChicken.lastChickenCareAt || 0)),
      lastChickenFeedDay: typeof player.ownedChicken.lastChickenFeedDay === "string" ? player.ownedChicken.lastChickenFeedDay : "",
      chickenFeedsToday: Math.max(0, Math.floor(player.ownedChicken.chickenFeedsToday || 0)),
      autoCleanExpireTime: Math.max(0, Number(player.ownedChicken.autoCleanExpireTime || 0)),
      evolutionBranch: typeof player.ownedChicken.evolutionBranch === "string" ? player.ownedChicken.evolutionBranch : "",
      hiddenEvolutionValue: Math.max(-100, Math.min(100, Math.floor(player.ownedChicken.hiddenEvolutionValue || 0))),
      evolutionQuality: typeof player.ownedChicken.evolutionQuality === "string" ? player.ownedChicken.evolutionQuality : "",
      secondEvolution: player.ownedChicken.secondEvolution && typeof player.ownedChicken.secondEvolution === "object"
        ? {
          id: typeof player.ownedChicken.secondEvolution.id === "string" ? player.ownedChicken.secondEvolution.id : "",
          title: typeof player.ownedChicken.secondEvolution.title === "string" ? player.ownedChicken.secondEvolution.title : "",
          icon: typeof player.ownedChicken.secondEvolution.icon === "string" ? player.ownedChicken.secondEvolution.icon : "",
          branch: typeof player.ownedChicken.secondEvolution.branch === "string" ? player.ownedChicken.secondEvolution.branch : "",
          quality: typeof player.ownedChicken.secondEvolution.quality === "string" ? player.ownedChicken.secondEvolution.quality : "",
          frame: typeof player.ownedChicken.secondEvolution.frame === "string" ? player.ownedChicken.secondEvolution.frame : ""
        }
        : null,
      titles: Array.isArray(player.ownedChicken.titles)
        ? player.ownedChicken.titles.filter((title) => typeof title === "string").slice(0, 12)
        : [],
      frame: typeof player.ownedChicken.frame === "string" ? player.ownedChicken.frame : "",
      entryEffect: typeof player.ownedChicken.entryEffect === "string" ? player.ownedChicken.entryEffect : "",
      raceStatBoost: Math.max(0, Math.min(15, Math.floor(player.ownedChicken.raceStatBoost || 0))),
      origin: typeof player.ownedChicken.origin === "string" ? player.ownedChicken.origin : "",
      levelUpOptions: Array.isArray(player.ownedChicken.levelUpOptions)
        ? player.ownedChicken.levelUpOptions.filter((id) => typeof id === "string").slice(0, 3)
        : []
    }
    : null;
  next.bestRecordTimestamps = Array.isArray(player && player.bestRecordTimestamps)
    ? player.bestRecordTimestamps.filter((time) => Number.isFinite(time)).slice(-10)
    : [];
  next.chickenArenaRank = Math.max(1, Math.floor(player && player.chickenArenaRank || 1));
  next.chickenBooster = Math.max(0, Math.floor(player && player.chickenBooster || 0));
  next.lastTotemResetDate = typeof (player && player.lastTotemResetDate) === "string" ? player.lastTotemResetDate : "";
  next.dailyTotemPurchaseCount = Math.max(0, Math.floor(player && player.dailyTotemPurchaseCount || 0));
  next.normalFeed = Math.max(0, Math.floor(player && player.normalFeed || 0));
  next.gourmetFeed = Math.max(0, Math.floor(player && player.gourmetFeed || 0));
  next.chickenMedicine = Math.max(0, Math.floor(player && player.chickenMedicine || 0));
  next.autoCleaner = Math.max(0, Math.floor(player && player.autoCleaner || 0));
  next.chickenResearchNotes = player && player.chickenResearchNotes && typeof player.chickenResearchNotes === "object"
    ? Object.fromEntries(Object.entries(player.chickenResearchNotes)
      .filter(([key, value]) => typeof key === "string" && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value)))]))
    : {};
  next.chickenEggs = Math.max(0, Math.floor(player && player.chickenEggs || 0));
  next.rareEvolutionMaterial = Math.max(0, Math.floor(player && player.rareEvolutionMaterial || 0));
  next.guaranteedGemCaveTicket = Math.max(0, Math.min(1, Math.floor(player && player.guaranteedGemCaveTicket || 0)));
  next.thickSoleShoes = Math.max(0, Math.floor(player && player.thickSoleShoes || 0));
  next.activeMarketBlessings = player && player.activeMarketBlessings && typeof player.activeMarketBlessings === "object"
    ? Object.fromEntries(Object.entries(player.activeMarketBlessings)
      .filter(([key, value]) => typeof key === "string" && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Math.max(0, Number(value))]))
    : {};
  next.wildChickenInfluence = player && player.wildChickenInfluence && typeof player.wildChickenInfluence === "object"
    ? Object.fromEntries(Object.entries(player.wildChickenInfluence)
      .filter(([key, value]) => typeof key === "string" && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value)))]))
    : {};
  next.wildChickenEncounter = player && player.wildChickenEncounter && typeof player.wildChickenEncounter === "object"
    ? {
      id: typeof player.wildChickenEncounter.id === "string" ? player.wildChickenEncounter.id : "",
      name: typeof player.wildChickenEncounter.name === "string" ? player.wildChickenEncounter.name : "",
      icon: typeof player.wildChickenEncounter.icon === "string" ? player.wildChickenEncounter.icon : "🐓",
      region: typeof player.wildChickenEncounter.region === "string" ? player.wildChickenEncounter.region : "shallow",
      trait: typeof player.wildChickenEncounter.trait === "string" ? player.wildChickenEncounter.trait : "normal",
      rare: Boolean(player.wildChickenEncounter.rare),
      power: Math.max(1, Math.floor(player.wildChickenEncounter.power || 1)),
      captureConfirm: Boolean(player.wildChickenEncounter.captureConfirm)
    }
    : null;
  next.chickenBoosterUseLog = Array.isArray(player && player.chickenBoosterUseLog)
    ? player.chickenBoosterUseLog.filter((time) => Number.isFinite(time)).slice(-10)
    : [];
  next.challengeBestDepth = Math.max(0, Math.floor(player && player.challengeBestDepth || 0));
  next.challengeTraitOptions = Array.isArray(player && player.challengeTraitOptions)
    ? player.challengeTraitOptions.filter((id) => CONFIG.runModes[id]).slice(0, 25)
    : [];
  next.challenge = player && player.challenge && typeof player.challenge === "object"
    ? {
      ...player.challenge,
      challengeGold: Math.max(0, Math.floor(player.challenge.challengeGold || 0)),
      depth: Math.max(0, Math.floor(player.challenge.depth || 0)),
      hp: Number.isFinite(player.challenge.hp) ? player.challenge.hp : 3,
      maxHp: Math.max(1, Math.floor(player.challenge.maxHp || 3)),
      potions: Math.max(0, Math.floor(player.challenge.potions || 0)),
      trait: CONFIG.runModes[player.challenge.trait] ? player.challenge.trait : null,
      modifiers: Array.isArray(player.challenge.modifiers) ? player.challenge.modifiers.slice(0, 3) : [],
      routeOptions: Array.isArray(player.challenge.routeOptions) ? player.challenge.routeOptions.slice(0, 3) : [],
      merchant: player.challenge.merchant && typeof player.challenge.merchant === "object" ? player.challenge.merchant : null,
      items: player.challenge.items && typeof player.challenge.items === "object" ? { ...player.challenge.items } : {},
      miniTraits: player.challenge.miniTraits && typeof player.challenge.miniTraits === "object" ? { ...player.challenge.miniTraits } : {},
      stats: player.challenge.stats && typeof player.challenge.stats === "object" ? { ...player.challenge.stats } : {}
    }
    : null;
  Object.assign(next, normalizeFunState(player || {}));
  next.traitState = normalizeTraitState(player && player.traitState);
  next.stats = {
    ...createPlayer().stats,
    ...(player && player.stats ? player.stats : {})
  };
  return next;
}

module.exports = {
  BAG_CAPACITY,
  CHICKEN_TRAIT_IDS,
  DAMAGE_PER_HIT,
  ITEM_STACK_SIZE,
  STACKABLE_ITEM_KEYS,
  createPlayer,
  getPlayer
};

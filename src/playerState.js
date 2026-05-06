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
    platinumJunk: 0,
    uiMode: "full",
    activeMinePanelMessageId: "",
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
      undyingTotem: 0,
      chickenTraitTickets: 0
    },
    pendingNextRunTraits: [],
    migratedToUndergroundCamp: false,
    preUpdateDeepPlayer: false,
    lastMigrationMessage: "",
    expansionHeart: false,
    chickenTraitTickets: 0,
    chickenRoastHpBonus: 0,
    chickenAmuletUsed: false,
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
  next.goldBeast = player && player.goldBeast ? { ...player.goldBeast } : null;
  next.undergroundStorage = {
    ...createPlayer().undergroundStorage,
    ...(player && player.undergroundStorage ? player.undergroundStorage : {})
  };
  next.pendingNextRunTraits = Array.isArray(player && player.pendingNextRunTraits)
    ? player.pendingNextRunTraits.filter((mode) => CONFIG.runModes[mode]).slice(0, 10)
    : [];
  next.bestRecordTimestamps = Array.isArray(player && player.bestRecordTimestamps)
    ? player.bestRecordTimestamps.filter((time) => Number.isFinite(time)).slice(-10)
    : [];
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

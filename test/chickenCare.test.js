"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBattleEmbed,
  buildChickenUpgradeComponents,
  buildChickenPanelComponents,
  applyPvpLevelBalance,
  calculateBattleExp,
  calculateBossGoldReward,
  chooseChickenUpgrade,
  clearBattle,
  clearBattlesForPlayer,
  createBattle,
  createBossBattle,
  cycleChickenSkillTiming,
  determineEvolutionType,
  ensureOwnedChicken,
  formatOwnedChicken,
  getCounterTypeForChicken,
  getEvolutionMissingRequirements,
  getChickenRequiredExp,
  getChickenStage,
  hasChickenReachedFinish,
  renameChicken,
  roastOwnedChicken,
  shareRoastChickenMeal,
  settleBattle,
  updateBattleFrame,
  useChickenBooster
} = require("../src/chickenCare");
const { createPlayer } = require("../src/game");

test("玩家第一次使用養雞系統會獲得初始雞並可命名", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  const renamed = renameChicken(player, "阿咕霸王");

  assert.ok(player.ownedChicken);
  assert.match(formatOwnedChicken(renamed.player), /阿咕霸王/);
  assert.equal(renameChicken(player, "!!!").ok, false);
});

test("雞升級會三選一並套用能力", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.levelUpOptions = ["speed", "stability", "finisher"];
  const before = player.ownedChicken.speed;
  const upgraded = chooseChickenUpgrade(player, "speed");

  assert.equal(buildChickenUpgradeComponents(player).length, 1);
  assert.equal(buildChickenPanelComponents(player, "user1").length, 3);
  const panelJson = buildChickenPanelComponents({ ...player, magicCandy: 1 }, "user1")[1].toJSON();
  assert.equal(panelJson.components.some((button) => button.custom_id === "chicken_panel:candy:user1"), true);
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.player.ownedChicken.speed, before + 1);
  assert.deepEqual(upgraded.player.ownedChicken.levelUpOptions, []);
});

test("雞經驗曲線會隨等級非線性增加並顯示階段", () => {
  assert.equal(getChickenRequiredExp(1), 100);
  assert.equal(getChickenRequiredExp(2), 180);
  assert.equal(getChickenRequiredExp(5), 800);
  assert.equal(getChickenRequiredExp(6) > 800, true);
  assert.equal(getChickenStage({ level: 4 }).id, "young");
  assert.equal(getChickenStage({ level: 10 }).id, "mature");
  assert.equal(getChickenStage({ level: 16 }).id, "complete");
});

test("進化方向會依行為點數與能力判定", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.evolutionPoints = { blaze: 1, iron: 20, miracle: 0, trickster: 0 };
  player.ownedChicken.stability = 14;

  assert.equal(determineEvolutionType(player.ownedChicken), "iron");
});

test("稀有進化需要勝場且面板會顯示缺少條件", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.level = 6;
  player.ownedChicken.wins = 1;
  player.ownedChicken.evolutionPoints = { blaze: 0, iron: 0, miracle: 8, trickster: 0 };

  assert.deepEqual(getEvolutionMissingRequirements(player.ownedChicken, "miracle", "mature"), ["勝場 1/3"]);
  assert.match(formatOwnedChicken(player), /進化目標：奇蹟雞/);
  assert.match(formatOwnedChicken(player), /還差：勝場 1\/3/);
});

test("完全體進化需要足夠勝場", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.level = 16;
  player.ownedChicken.wins = 8;
  player.ownedChicken.evolutionType = "miracle";
  player.ownedChicken.evolutionPoints = { blaze: 0, iron: 0, miracle: 20, trickster: 0 };

  assert.deepEqual(getEvolutionMissingRequirements(player.ownedChicken, "miracle", "complete"), ["勝場 8/12"]);
  assert.match(formatOwnedChicken(player), /完全體：逆轉之星/);
  assert.match(formatOwnedChicken(player), /還差：勝場 8\/12/);
});

test("賽雞可以依不同傾向進化成更多路線", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.evolutionPoints = { gale: 12, crown: 0, thunder: 0, shadow: 0, crystal: 0, clumsy: 0 };
  player.ownedChicken.speed = 13;
  player.ownedChicken.sprint = 8;

  assert.equal(determineEvolutionType(player.ownedChicken), "gale");
  assert.match(formatOwnedChicken(player), /可能進化：/);
});

test("失誤和敗場太多時可能進化成爛雞", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.level = 6;
  player.ownedChicken.races = 8;
  player.ownedChicken.wins = 0;
  player.ownedChicken.speed = 4;
  player.ownedChicken.stability = 3;
  player.ownedChicken.evolutionPoints = { clumsy: 10 };

  assert.equal(determineEvolutionType(player.ownedChicken), "paper");
  assert.match(formatOwnedChicken(player), /⚠️紙箱雞/);
});

test("賽雞 PK 會鎖定玩家、逐幀更新並結算經驗", () => {
  const players = {
    a: ensureOwnedChicken(createPlayer(), () => 0),
    b: ensureOwnedChicken(createPlayer(), () => 0.7)
  };
  players.a.ownedChicken.name = "超級無敵長名字";
  players.a.ownedChicken.icon = "🐔";
  players.b.ownedChicken.icon = "🐓";
  const created = createBattle("a", "b", players, 1000, () => 0, "guild");

  assert.equal(created.ok, true);
  assert.equal(createBattle("a", "b", players, 1001, () => 0, "guild").ok, false);

  const battle = created.battle;
  const frame = updateBattleFrame(battle, players, 0, () => 0.5);
  updateBattleFrame(battle, players, 1, () => 0.5);
  const settled = settleBattle(battle, players, () => 0.99, 2000);

  assert.match(frame, /🐔/);
  assert.doesNotMatch(frame, /超級無敵長名字/);
  assert.match(settled.message, /勝利/);
  assert.match(settled.message, /🥈 .* \+\d+ EXP/);
  assert.equal(settled.players.a.ownedChicken.exp > 0, true);
  assert.equal(settled.players.b.ownedChicken.exp > 0, true);
  assert.equal(settled.players.a.ownedChicken.races + settled.players.b.ownedChicken.races, 2);
  clearBattle(battle.id);
  assert.match(createBattle("a", "b", players, 3000, () => 0, "guild").message, /冷卻/);
  const bossAfterPvp = createBossBattle("a", players, 3000, () => 0, "guild", "ironCrown");
  assert.equal(bossAfterPvp.ok, true);
  clearBattle(bossAfterPvp.battle.id);
  const afterCooldown = createBattle("a", "b", players, 33000, () => 0, "guild");
  assert.equal(afterCooldown.ok, true);
  clearBattle(afterCooldown.battle.id);
});

test("可以用玩家 ID 清除卡住的賽雞 PK", () => {
  const players = {
    stuckA: ensureOwnedChicken(createPlayer(), () => 0),
    stuckB: ensureOwnedChicken(createPlayer(), () => 0.5)
  };
  const created = createBattle("stuckA", "stuckB", players, 50000, () => 0, "guild");

  assert.equal(created.ok, true);
  assert.equal(clearBattlesForPlayer("stuckA"), true);
  assert.equal(createBattle("stuckA", "stuckB", players, 51000, () => 0, "guild").ok, true);
  clearBattlesForPlayer("stuckA");
});

test("賽雞 PK 高等級雞會依等級差被削弱", () => {
  const runners = [
    { chicken: { level: 30 } },
    { chicken: { level: 5 } }
  ];
  applyPvpLevelBalance(runners);

  assert.equal(runners[0].chicken.pvpPowerMultiplier < 1, true);
  assert.equal(runners[1].chicken.pvpPowerMultiplier, 1);
  assert.equal(runners[0].chicken.pvpPowerMultiplier >= 0.65, true);
});

test("賽雞 PVP 會使用互剋、賽道、狀態與隱藏資訊", () => {
  const players = {
    counterA: ensureOwnedChicken(createPlayer(), () => 0),
    counterB: ensureOwnedChicken(createPlayer(), () => 0.5)
  };
  players.counterA.ownedChicken.personalityId = "steady";
  players.counterA.ownedChicken.chickenCounterType = "stable";
  players.counterA.ownedChicken.activeSkill = "guardStep";
  players.counterA.ownedChicken.skillTriggerTiming = "overtaken";
  players.counterB.ownedChicken.personalityId = "madDog";
  players.counterB.ownedChicken.chickenCounterType = "risk";
  const created = createBattle("counterA", "counterB", players, 60000, () => 0.99, "guild");

  assert.equal(created.ok, true);
  assert.equal(getCounterTypeForChicken(players.counterA.ownedChicken), "stable");
  assert.equal(created.battle.raceTrackModifier.id.length > 0, true);
  const frame = updateBattleFrame(created.battle, players, 0, () => 0.99);
  const embedText = buildBattleEmbed(created.battle, players).data.description;

  assert.match(frame, /🥇/);
  assert.match(frame, /對位有利/);
  assert.match(embedText, /賽道：/);
  assert.match(embedText, /概略：/);
  assert.doesNotMatch(embedText, /對手數值：/);
  clearBattle(created.battle.id);
});

test("雞面板可以切換技能發動時機", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.activeSkill = "blazeDash";
  player.ownedChicken.skillTriggerTiming = "finish";
  const result = cycleChickenSkillTiming(player);

  assert.equal(result.ok, true);
  assert.equal(result.player.ownedChicken.skillTriggerTiming, "overtaken");
  assert.match(formatOwnedChicken(result.player), /技能時機：被超車時/);
});

test("雞用強化藥劑會讓下一場比賽全數值加五並消耗加成", () => {
  const players = {
    boostA: ensureOwnedChicken({ ...createPlayer(), chickenBooster: 1 }, () => 0),
    boostB: ensureOwnedChicken(createPlayer(), () => 0.5)
  };
  players.boostA.ownedChicken.speed = 6;
  const used = useChickenBooster(players.boostA, 1000, () => 0.99);
  players.boostA = used.player;

  assert.equal(used.ok, true);
  assert.equal(players.boostA.chickenBooster, 0);
  assert.equal(players.boostA.ownedChicken.raceStatBoost, 5);
  const created = createBattle("boostA", "boostB", players, 70000, () => 0, "guild");
  updateBattleFrame(created.battle, players, 0, () => 0.5);

  assert.equal(created.battle.runners[0].chicken.speed, 11);
  const settled = settleBattle(created.battle, players, () => 0.99, 71000);
  assert.equal(settled.players.boostA.ownedChicken.raceStatBoost, 0);
  clearBattle(created.battle.id);
});

test("短時間內連用太多強化藥劑可能讓雞死亡", () => {
  let player = ensureOwnedChicken({ ...createPlayer(), chickenBooster: 3 }, () => 0);
  player = useChickenBooster(player, 1000, () => 0.99).player;
  player = useChickenBooster(player, 2000, () => 0.99).player;
  const result = useChickenBooster(player, 3000, () => 0);

  assert.equal(result.chickenDied, true);
  assert.equal(result.player.ownedChicken, null);
});

test("生死鬥輸家的雞會被烤掉", () => {
  const players = {
    deathA: ensureOwnedChicken(createPlayer(), () => 0),
    deathB: ensureOwnedChicken(createPlayer(), () => 0.5)
  };
  const created = createBattle("deathA", "deathB", players, 80000, () => 0, "guild", { deathmatch: true });
  const battle = created.battle;
  updateBattleFrame(battle, players, 0, () => 0.5);
  battle.runners[0].position = 14;
  battle.runners[1].position = 0;
  const settled = settleBattle(battle, players, () => 0.99, 81000);

  assert.equal(settled.players.deathB.ownedChicken, null);
  assert.equal(settled.battle.deathmatchFeast.ownerId, "deathB");
  assert.match(settled.message, /被烤來吃/);
  clearBattle(battle.id);
});

test("賽雞館挑戰會使用館主並在勝利時給稱號獎勵", () => {
  const players = {
    bossPlayer: ensureOwnedChicken(createPlayer(), () => 0)
  };
  players.bossPlayer.ownedChicken.speed = 20;
  players.bossPlayer.ownedChicken.sprint = 20;
  const created = createBossBattle("bossPlayer", players, 1000, () => 0, "guild", "ironCrown");

  assert.equal(created.ok, true);
  const battle = created.battle;
  updateBattleFrame(battle, players, 0, () => 0.99);
  battle.runners[0].position = 14;
  battle.runners[1].position = 0;
  const settled = settleBattle(battle, players, () => 0.99, 2000);

  assert.equal(settled.players.bossPlayer.ownedChicken.titles.includes("鐵冠挑戰者"), true);
  assert.equal(settled.players.bossPlayer.gold > 0, true);
  assert.equal(settled.players.bossPlayer.chickenArenaRank, 2);
  assert.match(settled.message, /賽雞館 Rank 1/);
  clearBattle(battle.id);
  const bossAgain = createBossBattle("bossPlayer", players, 3000, () => 0, "guild", "ironCrown");
  assert.equal(bossAgain.ok, true);
  clearBattle(bossAgain.battle.id);
  const pvpAfterBoss = createBattle("bossPlayer", "otherPlayer", players, 3000, () => 0, "guild");
  assert.equal(pvpAfterBoss.ok, true);
  clearBattle(pvpAfterBoss.battle.id);
});

test("賽雞館獎勵會隨 Rank 成長", () => {
  assert.equal(calculateBossGoldReward(1, () => 0), 500);
  assert.equal(calculateBossGoldReward(1, () => 0.999), 1000);
  assert.equal(calculateBossGoldReward(5, () => 0) > calculateBossGoldReward(1, () => 0.999), true);
});

test("賽雞館可以重打已通關 Rank 但不掉金幣", () => {
  const players = {
    replayBoss: ensureOwnedChicken(createPlayer(), () => 0)
  };
  players.replayBoss.chickenArenaRank = 4;
  players.replayBoss.gold = 1234;
  const created = createBossBattle("replayBoss", players, 1000, () => 0, "guild", "ironCrown", 2);

  assert.equal(created.ok, true);
  assert.equal(created.battle.bossRank, 2);
  assert.equal(created.battle.bossReplayRank, true);
  const battle = created.battle;
  updateBattleFrame(battle, players, 0, () => 0.99);
  battle.runners[0].position = 14;
  battle.runners[1].position = 0;
  const settled = settleBattle(battle, players, () => 0, 2000);

  assert.equal(settled.players.replayBoss.gold, 1234);
  assert.equal(settled.players.replayBoss.chickenArenaRank, 4);
  assert.match(settled.message, /重打已通關館主，不掉落金幣/);
  clearBattle(battle.id);
});

test("賽雞館不能指定尚未通關的未來 Rank", () => {
  const players = {
    lockedBoss: ensureOwnedChicken(createPlayer(), () => 0)
  };
  players.lockedBoss.chickenArenaRank = 2;
  const created = createBossBattle("lockedBoss", players, 1000, () => 0, "guild", "ironCrown", 5);

  assert.equal(created.ok, false);
  assert.match(created.message, /只能重打已通關 Rank/);
});

test("賽雞館 Rank 幾就是館主幾等", () => {
  const players = {
    strong: ensureOwnedChicken(createPlayer(), () => 0)
  };
  players.strong.ownedChicken.level = 30;
  players.strong.chickenArenaRank = 7;
  const created = createBossBattle("strong", players, 1000, () => 0, "guild", "tyrant");

  assert.equal(created.ok, true);
  assert.equal(created.battle.bossRank, 7);
  assert.equal(created.boss.level, 7);
  assert.equal(created.boss.speed <= 10, true);
  clearBattle(created.battle.id);
});

test("低 Rank 館主數值會像低等雞", () => {
  const players = {
    lowBoss: ensureOwnedChicken(createPlayer(), () => 0)
  };
  players.lowBoss.chickenArenaRank = 1;
  const created = createBossBattle("lowBoss", players, 1000, () => 0, "guild", "ironCrown");

  assert.equal(created.ok, true);
  assert.equal(created.boss.level, 1);
  assert.equal(created.boss.speed <= 4, true);
  assert.equal(created.boss.stability <= 6, true);
  clearBattle(created.battle.id);
});

test("賽雞館經驗會依 Rank 變多或變少", () => {
  const runner = { position: 12 };
  const low = calculateBattleExp({ isBoss: true, bossRank: 1 }, runner, true, false);
  const high = calculateBattleExp({ isBoss: true, bossRank: 10 }, runner, true, false);
  const pvp = calculateBattleExp({ isBoss: false }, runner, true, false);

  assert.equal(low < pvp, true);
  assert.equal(high > pvp, true);
});

test("賽雞館 PVE 有雞到終點即可提早結算", () => {
  const players = {
    bossPlayer: ensureOwnedChicken(createPlayer(), () => 0)
  };
  players.bossPlayer.ownedChicken.level = 40;
  const created = createBossBattle("bossPlayer", players, 1000, () => 0, "guild", "tyrant");
  assert.equal(created.ok, true);
  const battle = created.battle;
  updateBattleFrame(battle, players, 0, () => 0);
  battle.runners[0].position = 14;

  assert.equal(hasChickenReachedFinish(battle), true);
  clearBattle(battle.id);
});

test("賽雞 PK 也會在有雞到終點時可提早結算", () => {
  const players = {
    fastPvpA: ensureOwnedChicken(createPlayer(), () => 0),
    fastPvpB: ensureOwnedChicken(createPlayer(), () => 0.5)
  };
  players.fastPvpA.ownedChicken.speed = 20;
  players.fastPvpA.ownedChicken.sprint = 20;
  const created = createBattle("fastPvpA", "fastPvpB", players, 100000, () => 0, "guild");
  assert.equal(created.ok, true);
  const battle = created.battle;
  updateBattleFrame(battle, players, 0, () => 0);
  battle.runners[0].position = 14;

  assert.equal(hasChickenReachedFinish(battle), true);
  clearBattle(battle.id);
});

test("賽雞館面板會顯示館主數值", () => {
  const players = {
    bossPlayer: ensureOwnedChicken(createPlayer(), () => 0)
  };
  const created = createBossBattle("bossPlayer", players, 1000, () => 0, "guild", "ironCrown");
  assert.equal(created.ok, true);
  const json = buildBattleEmbed(created.battle, players).toJSON();

  assert.match(json.description, /館主數值：Lv\./);
  clearBattle(created.battle.id);
});

test("賽雞 PK 面板會隱藏完整數值改顯示概略資訊", () => {
  const players = {
    statPvpA: ensureOwnedChicken(createPlayer(), () => 0),
    statPvpB: ensureOwnedChicken(createPlayer(), () => 0.5)
  };
  players.statPvpA.ownedChicken.level = 7;
  players.statPvpA.ownedChicken.speed = 11;
  players.statPvpB.ownedChicken.level = 4;
  players.statPvpB.ownedChicken.stability = 9;
  const created = createBattle("statPvpA", "statPvpB", players, 200000, () => 0, "guild");
  const json = buildBattleEmbed(created.battle, players).toJSON();

  assert.match(json.description, /挑戰者概略：Lv\.7/);
  assert.match(json.description, /對手概略：Lv\.4/);
  assert.match(json.description, /PVP：公開資訊只顯示概略/);
  assert.doesNotMatch(json.description, /穩9/);
  clearBattle(created.battle.id);
});

test("烤掉自己的雞會清空 ownedChicken 並給下礦生命加成", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.wins = 12;
  const result = roastOwnedChicken(player);
  const shared = shareRoastChickenMeal(createPlayer());

  assert.equal(result.ok, true);
  assert.equal(result.player.ownedChicken, null);
  assert.equal(result.player.chickenRoastHpBonus, 1);
  assert.equal(shared.player.chickenRoastHpBonus, 1);
  assert.match(result.message, /贏過 12 場/);
});

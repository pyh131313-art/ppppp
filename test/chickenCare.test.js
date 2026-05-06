"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChickenUpgradeComponents,
  buildChickenPanelComponents,
  chooseChickenUpgrade,
  clearBattle,
  createBattle,
  createBossBattle,
  determineEvolutionType,
  ensureOwnedChicken,
  formatOwnedChicken,
  getEvolutionMissingRequirements,
  getChickenRequiredExp,
  getChickenStage,
  renameChicken,
  roastOwnedChicken,
  settleBattle,
  updateBattleFrame
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
  assert.equal(buildChickenPanelComponents(player, "user1").length, 2);
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
  const afterCooldown = createBattle("a", "b", players, 33000, () => 0, "guild");
  assert.equal(afterCooldown.ok, true);
  clearBattle(afterCooldown.battle.id);
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
  assert.equal(settled.players.bossPlayer.chickenTraitTickets, 1);
  clearBattle(battle.id);
});

test("烤掉自己的雞會清空 ownedChicken 並給下礦生命加成", () => {
  const player = ensureOwnedChicken(createPlayer(), () => 0);
  player.ownedChicken.wins = 12;
  const result = roastOwnedChicken(player);

  assert.equal(result.ok, true);
  assert.equal(result.player.ownedChicken, null);
  assert.equal(result.player.chickenRoastHpBonus, 1);
  assert.match(result.message, /贏過 12 場/);
});

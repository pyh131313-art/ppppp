"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChickenUpgradeComponents,
  buildChickenPanelComponents,
  chooseChickenUpgrade,
  clearBattle,
  createBattle,
  ensureOwnedChicken,
  formatOwnedChicken,
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
  assert.equal(settled.players.a.ownedChicken.races + settled.players.b.ownedChicken.races, 2);
  clearBattle(battle.id);
  assert.match(createBattle("a", "b", players, 3000, () => 0, "guild").message, /冷卻/);
  const afterCooldown = createBattle("a", "b", players, 33000, () => 0, "guild");
  assert.equal(afterCooldown.ok, true);
  clearBattle(afterCooldown.battle.id);
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

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyReward,
  beginRace,
  buildRaceComponents,
  buyTicket,
  calculateResult,
  getRaceState,
  resetRaceState,
  roastChicken,
  settleRace,
  startRace,
  updateRaceFrame
} = require("../src/chickenRace");
const { createPlayer } = require("../src/game");

test("賽雞場會抽三隻雞並限制每人一張票", () => {
  resetRaceState();
  const race = startRace(1000, () => 0);
  const chickenId = race.selectedChickens[0].id;
  const first = buyTicket(race, "user1", "normal", chickenId, { ...createPlayer(), gold: 2000 });
  const second = buyTicket(race, "user1", "noble", chickenId, first.player);

  assert.equal(race.selectedChickens.length, 3);
  assert.equal(first.ok, true);
  assert.equal(first.player.gold, 1000);
  assert.equal(second.ok, false);
});

test("賽雞動畫會逐幀推進並產生事件提示", () => {
  resetRaceState();
  const race = beginRace(startRace(2000, () => 0), () => 0);
  const frame = updateRaceFrame(race, 1, () => 0);

  assert.equal(race.raceFrames.length, 2);
  assert.match(frame, /🏁 賽雞開始/);
  assert.match(frame, /起跑失誤|加速|跌倒|爆衝|混亂|🎙️/);
});

test("高貴票中獎會套用高貴加成和多人加成", () => {
  const player = { ...createPlayer(), gold: 0 };
  const result = {
    ticket: { userId: "user1", betType: "noble" },
    rewardType: "gold10000",
    playerCount: 4,
    upset: false
  };
  const applied = applyReward(player, result, () => 0);

  assert.equal(applied.player.gold, 10800);
  assert.equal(applied.lines.some((line) => line.includes("高貴加成：+500")), true);
  assert.equal(applied.lines.some((line) => line.includes("多人加成：+300")), true);
});

test("擴容之心最多一顆，重複會轉成金幣", () => {
  const first = applyReward(createPlayer(), {
    ticket: { userId: "user1", betType: "normal" },
    rewardType: "expansionHeart",
    playerCount: 1,
    upset: false
  });
  const second = applyReward(first.player, {
    ticket: { userId: "user1", betType: "normal" },
    rewardType: "expansionHeart",
    playerCount: 1,
    upset: false
  });

  assert.equal(first.player.expansionHeart, true);
  assert.equal(second.player.gold, 3000);
});

test("烤雞會給下一局下礦生命加成並降低該雞出場", () => {
  resetRaceState();
  const race = startRace(3000, () => 0);
  const chickenId = race.selectedChickens[0].id;
  const result = roastChicken(race, chickenId, { ...createPlayer(), gold: 5000 });

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 0);
  assert.equal(result.player.chickenRoastHpBonus, 1);
});

test("賽雞結果會選出冠軍雞", () => {
  resetRaceState();
  const race = beginRace(startRace(4000, () => 0), () => 0);
  race.runners[0].position = 10;
  race.runners[1].position = 3;
  race.runners[2].position = 2;
  race.playersInMatch.user1 = {
    userId: "user1",
    betType: "normal",
    chickenId: race.runners[0].id
  };
  const result = calculateResult(race, () => 0.99);

  assert.equal(result.winner.id, race.runners[0].id);
  assert.equal(result.ticket.userId, "user1");
});

test("賽雞結算後會保留下一場刷新按鈕", () => {
  resetRaceState();
  const race = beginRace(startRace(5000, () => 0), () => 0);
  race.runners[0].position = 10;
  settleRace(race, {}, () => 0.99);
  const rows = buildRaceComponents(race);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].components[0].data.custom_id, "chicken_race:next");
});

test("不同伺服器的賽雞場狀態會分開保存", () => {
  resetRaceState();
  const guildA = startRace(6000, () => 0, "guild-a");
  const guildB = startRace(7000, () => 0.9, "guild-b");

  assert.notEqual(guildA.id, guildB.id);
  assert.equal(getRaceState("guild-a").id, "6000");
  assert.equal(getRaceState("guild-b").id, "7000");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buyShopItem,
  chooseMinorBuff,
  chooseRunMode,
  createPlayer,
  discardItem,
  exchange,
  getCollectionTotal,
  getBagUsedSlots,
  mine,
  removeRust,
  rescuePlayer,
  returnToSurface,
  revive,
  transferCollectible
} = require("../src/game");

test("挖到兩次炸彈會死亡", () => {
  const start = chooseRunMode(createPlayer(), "double").player;
  const first = mine(start, () => 0.95, 1000).player;
  assert.equal(first.bombs, 1);
  assert.equal(first.dead, false);

  const secondResult = mine(first, () => 0.95, 2000);
  assert.equal(secondResult.player.bombs, 2);
  assert.equal(secondResult.player.dead, true);
});

test("炸彈死亡會損失三分之一金幣", () => {
  const result = mine(
    { ...createPlayer(), gold: 30, bombs: 3, runMode: "safe" },
    () => 0.95,
    1000
  );

  assert.equal(result.player.dead, true);
  assert.equal(result.player.gold, 20);
  assert.match(result.message, /損失 10 枚金幣/);
});

test("可以丟棄生鏽紀念幣和正式紀念幣", () => {
  const first = discardItem(
    { ...createPlayer(), rusty: 2, collection: { nina_hot_water: 2 } },
    "rusty",
    1
  );

  assert.equal(first.ok, true);
  assert.equal(first.player.rusty, 1);

  const second = discardItem(first.player, "nina_hot_water", 2);
  assert.equal(second.ok, true);
  assert.equal(second.player.collection.nina_hot_water, undefined);
});

test("生鏽紀念幣一次只會掉一枚", () => {
  const start = chooseRunMode(createPlayer(), "double").player;
  const result = mine(start, () => 0.66);

  assert.equal(result.kind, "rusty");
  assert.equal(result.player.rusty, 1);
});

test("礦石返回地面會自動換成金幣", () => {
  const rolls = [0.5, 0.5];
  const start = chooseRunMode(createPlayer(), "safe").player;
  const mined = mine(start, () => rolls.shift() ?? 0);
  const result = returnToSurface(mined.player);

  assert.equal(mined.kind, "ore");
  assert.equal(mined.player.ore, 2);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.gold, 16);
});

test("礦石會佔用包包格子", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    ore: 2
  };

  assert.equal(getBagUsedSlots(player), 2);
});

test("正式紀念幣放在集幣冊不佔包包", () => {
  const player = {
    ...createPlayer(),
    collection: {
      nina_hot_water: 1,
      rose_smirk: 1
    }
  };

  assert.equal(getBagUsedSlots(player), 0);
  assert.equal(getCollectionTotal(player), 2);
});

test("超級破爛佔三格且返回地面清除", () => {
  const mined = mine(chooseRunMode(createPlayer(), "safe").player, () => 0.7);
  const result = returnToSurface(mined.player);

  assert.equal(mined.kind, "junk");
  assert.equal(mined.player.junk, 1);
  assert.equal(getBagUsedSlots(mined.player), 3);
  assert.equal(result.player.junk, 0);
});

test("超級破爛需要三格空間", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    ore: 10
  };
  const result = mine(player, () => 0.7);

  assert.equal(result.kind, "full");
  assert.equal(result.player.junk, 0);
});

test("雙倍採集會讓超級破爛也掉雙倍", () => {
  const mined = mine(chooseRunMode(createPlayer(), "double").player, () => 0.7);

  assert.equal(mined.kind, "junk");
  assert.equal(mined.player.junk, 2);
  assert.equal(getBagUsedSlots(mined.player), 6);
});

test("下礦前需要先二選一", () => {
  const result = mine(createPlayer(), () => 0);

  assert.equal(result.kind, "blocked");
  assert.equal(result.player.depth, 0);
});

test("雙倍採集會加倍礦石但死亡損失雙倍金幣", () => {
  const start = chooseRunMode({ ...createPlayer(), gold: 30 }, "double").player;
  const ore = mine(start, () => 0.5).player;
  const dead = mine({ ...ore, bombs: 1 }, () => 0.95, 1000);

  assert.equal(ore.ore, 4);
  assert.equal(dead.player.dead, true);
  assert.equal(dead.player.gold, 10);
});

test("安全血量會讓生命增加二", () => {
  const start = chooseRunMode(createPlayer(), "safe").player;
  const first = mine(start, () => 0.95, 1000).player;
  const second = mine(first, () => 0.95, 2000).player;
  const third = mine(second, () => 0.95, 3000).player;

  assert.equal(third.bombs, 3);
  assert.equal(third.dead, false);
});

test("每五層可以選一個小磁條", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 5
  };
  const result = chooseMinorBuff(player, "gold");

  assert.equal(result.ok, true);
  assert.equal(result.player.minorBuffs.gold, 1);
  assert.equal(result.player.nextBuffDepth, 10);
});

test("金幣可以兌換收藏紀念幣", () => {
  const result = exchange({ ...createPlayer(), gold: 200 }, 2, () => 0);

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 0);
  assert.equal(getCollectionTotal(result.player), 2);
  assert.equal(result.player.collection.nina_hot_water, 2);
});

test("金幣鑄造不會抽到除鏽限定紀念幣", () => {
  const result = exchange({ ...createPlayer(), gold: 200 }, 2, () => 0.99);

  assert.equal(result.ok, true);
  assert.equal(result.player.collection.rose_smirk, 2);
  assert.equal(result.player.collection.rose_rust_scratch, undefined);
});

test("商店限定紀念幣只能用金幣購買", () => {
  const result = buyShopItem({ ...createPlayer(), gold: 800 }, "zhongkui_peace", 1);

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 0);
  assert.equal(result.player.collection.zhongkui_peace, 1);
});

test("除鏽成功會增加收藏紀念幣", () => {
  const result = removeRust(
    { ...createPlayer(), gold: 300, rusty: 2 },
    2,
    () => 0
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.rusty, 0);
  assert.equal(getCollectionTotal(result.player), 2);
});

test("除鏽成功可以抽到除鏽限定紀念幣", () => {
  const rolls = [0, 0.99];
  const result = removeRust(
    { ...createPlayer(), gold: 150, rusty: 1 },
    1,
    () => rolls.shift() ?? 0
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.collection.rose_rust_scratch, 1);
});

test("除鏽失敗會消耗金幣和生鏽紀念幣", () => {
  const result = removeRust(
    { ...createPlayer(), gold: 150, rusty: 1 },
    1,
    () => 0.99
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 0);
  assert.equal(result.player.rusty, 0);
  assert.equal(getCollectionTotal(result.player), 0);
  assert.match(result.message, /損壞 1 枚/);
});

test("可以把正式紀念幣交易給其他玩家", () => {
  const result = transferCollectible(
    { ...createPlayer(), collection: { nina_hot_water: 2 } },
    createPlayer(),
    "nina_hot_water",
    1
  );

  assert.equal(result.ok, true);
  assert.equal(result.from.collection.nina_hot_water, 1);
  assert.equal(result.to.collection.nina_hot_water, 1);
});

test("可以交易金幣給其他玩家", () => {
  const result = transferCollectible(
    { ...createPlayer(), gold: 30 },
    { ...createPlayer(), gold: 5 },
    null,
    0,
    12
  );

  assert.equal(result.ok, true);
  assert.equal(result.from.gold, 18);
  assert.equal(result.to.gold, 17);
});

test("可以同時交易紀念幣和金幣", () => {
  const result = transferCollectible(
    { ...createPlayer(), gold: 30, collection: { nina_hot_water: 2 } },
    createPlayer(),
    "nina_hot_water",
    1,
    12
  );

  assert.equal(result.ok, true);
  assert.equal(result.from.gold, 18);
  assert.equal(result.to.gold, 12);
  assert.equal(result.from.collection.nina_hot_water, 1);
  assert.equal(result.to.collection.nina_hot_water, 1);
});

test("返回地面會清除本次生鏽幣、深度與炸彈", () => {
  const result = returnToSurface({
    ...createPlayer(),
    rusty: 3,
    ore: 2,
    junk: 1,
    bombs: 1,
    depth: 5
  });

  assert.equal(result.player.rusty, 0);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.junk, 0);
  assert.equal(result.player.gold, 16);
  assert.equal(result.player.bombs, 0);
  assert.equal(result.player.depth, 0);
});

test("死亡十分鐘後可以免費復活", () => {
  const result = revive(
    { ...createPlayer(), dead: true, bombs: 2, deathAt: 1000, gold: 0 },
    1000 + 10 * 60 * 1000
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.dead, false);
  assert.equal(result.player.bombs, 0);
  assert.equal(result.player.gold, 0);
});

test("其他玩家可以花金幣救援死亡玩家", () => {
  const result = rescuePlayer(
    { ...createPlayer(), gold: 20 },
    { ...createPlayer(), dead: true, bombs: 2, ore: 3, rusty: 1, runMode: "double" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.rescuer.gold, 0);
  assert.equal(result.target.dead, false);
  assert.equal(result.target.bombs, 0);
  assert.equal(result.target.ore, 0);
  assert.equal(result.target.rusty, 0);
  assert.equal(result.target.runMode, null);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buyShopItem,
  createPlayer,
  discardItem,
  exchange,
  getCollectionTotal,
  mine,
  removeRust,
  returnToSurface,
  revive,
  transferCollectible
} = require("../src/game");

test("挖到兩次炸彈會死亡", () => {
  const first = mine(createPlayer(), () => 0.95, 1000).player;
  assert.equal(first.bombs, 1);
  assert.equal(first.dead, false);

  const secondResult = mine(first, () => 0.95, 2000);
  assert.equal(secondResult.player.bombs, 2);
  assert.equal(secondResult.player.dead, true);
});

test("炸彈死亡會損失三分之一金幣", () => {
  const result = mine(
    { ...createPlayer(), gold: 30, bombs: 1 },
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

test("金幣可以兌換收藏紀念幣", () => {
  const result = exchange({ ...createPlayer(), gold: 20 }, 2, () => 0);

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 0);
  assert.equal(getCollectionTotal(result.player), 2);
  assert.equal(result.player.collection.nina_hot_water, 2);
});

test("商店限定紀念幣只能用金幣購買", () => {
  const result = buyShopItem({ ...createPlayer(), gold: 80 }, "zhongkui_peace", 1);

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 0);
  assert.equal(result.player.collection.zhongkui_peace, 1);
});

test("除鏽成功會增加收藏紀念幣", () => {
  const result = removeRust(
    { ...createPlayer(), gold: 10, rusty: 2 },
    2,
    () => 0
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.rusty, 0);
  assert.equal(getCollectionTotal(result.player), 2);
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
    bombs: 1,
    depth: 5
  });

  assert.equal(result.player.rusty, 0);
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

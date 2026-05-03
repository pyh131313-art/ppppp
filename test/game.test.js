"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buyShopItem,
  canChooseMinorBuff,
  chooseMinorBuff,
  chooseRunMode,
  createPlayer,
  depositBank,
  discardItem,
  ensureRunModeOptions,
  exchange,
  getBagCapacity,
  getCollectionTotal,
  getBagUsedSlots,
  getCommunityProgress,
  getRunModeOptions,
  mine,
  drinkHealingPotion,
  removeRust,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  transferCollectible,
  withdrawBank
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
  assert.equal(result.player.stats.deaths, 1);
  assert.match(result.message, /損失 10 枚金幣/);
});

test("銀行金幣不會被爆炸死亡扣除", () => {
  const result = mine(
    { ...createPlayer(), gold: 30, bankGold: 100, bombs: 3, runMode: "safe" },
    () => 0.95,
    1000
  );

  assert.equal(result.player.dead, true);
  assert.equal(result.player.gold, 20);
  assert.equal(result.player.bankGold, 100);
});

test("銀行只能在地面存入並可以領出", () => {
  const deposited = depositBank({ ...createPlayer(), gold: 45 });
  const blocked = depositBank({ ...createPlayer(), gold: 45, runMode: "safe" });
  const withdrawn = withdrawBank(deposited.player);

  assert.equal(deposited.ok, true);
  assert.equal(deposited.player.gold, 0);
  assert.equal(deposited.player.bankGold, 45);
  assert.equal(blocked.ok, false);
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.player.gold, 45);
  assert.equal(withdrawn.player.bankGold, 0);
});

test("進入礦洞有小機率掉進寶石礦洞", () => {
  const result = chooseRunMode(createPlayer(), "safe", () => 0);

  assert.equal(result.ok, true);
  assert.equal(result.player.caveType, "gem");
  assert.match(result.message, /寶石礦洞/);
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

test("挖礦會更新最深紀錄和總挖掘次數", () => {
  const start = chooseRunMode(createPlayer(), "safe").player;
  const first = mine(start, () => 0);
  const second = mine(first.player, () => 0);

  assert.equal(second.player.depth, 2);
  assert.equal(second.player.stats.bestDepth, 2);
  assert.equal(second.player.stats.totalMines, 2);
  assert.match(second.recordMessage, /第 2 層/);
});

test("隨機事件出現後會阻擋繼續挖礦直到選擇", () => {
  const rolls = [0, 0, 0, 0];
  const start = {
    ...chooseRunMode(createPlayer(), "safe").player,
    nextEventDepth: 1
  };
  const event = mine(start, () => rolls.shift() ?? 0);
  const blocked = mine(event.player, () => 0);

  assert.equal(event.player.pendingEvent, "cracked_wall");
  assert.equal(blocked.kind, "blocked");
  assert.match(blocked.message, /裂開的礦牆/);
});

test("事件選項會清除事件並套用結果", () => {
  const result = resolveRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, pendingEvent: "cracked_wall" },
    "risk",
    () => 0
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.pendingEvent, null);
  assert.equal(result.player.ore, 2);
});

test("遺失的背包可以本次擴大包包容量", () => {
  const result = resolveRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, pendingEvent: "lost_backpack" },
    "safe"
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.pendingEvent, null);
  assert.equal(result.player.bagBonusSlots, 2);
  assert.equal(getBagCapacity(result.player), 14);
});

test("本次包包擴容返回地面後重置", () => {
  const result = returnToSurface({
    ...createPlayer(),
    runMode: "safe",
    depth: 3,
    bagBonusSlots: 4
  });

  assert.equal(result.player.bagBonusSlots, 0);
  assert.equal(getBagCapacity(result.player), 12);
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

test("15 層後會掉金礦石並返回地面換高價金幣", () => {
  const start = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 14
  };
  const mined = mine(start, () => 0.56);
  const amount = mined.player.goldOre;
  const result = returnToSurface(mined.player);

  assert.equal(mined.kind, "goldOre");
  assert.equal(amount, 4);
  assert.equal(result.player.goldOre, 0);
  assert.equal(result.player.gold, amount * 120);
});

test("30 層後會掉鉑金礦石並返回地面換更高價金幣", () => {
  const start = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 29
  };
  const mined = mine(start, () => 0.62);
  const amount = mined.player.platinumOre;
  const result = returnToSurface(mined.player);

  assert.equal(mined.kind, "platinumOre");
  assert.equal(amount, 7);
  assert.equal(result.player.platinumOre, 0);
  assert.equal(result.player.gold, amount * 260);
});

test("寶石礦洞只會挖到寶石並返回地面換高價金幣", () => {
  const start = chooseRunMode(createPlayer(), "safe", () => 0).player;
  const mined = mine(start, () => 0);
  const result = returnToSurface(mined.player);

  assert.equal(mined.kind, "redGem");
  assert.equal(mined.player.redGem, 1);
  assert.equal(mined.player.ore, 0);
  assert.equal(result.player.redGem, 0);
  assert.equal(result.player.gold, 35);
});

test("寶石礦洞的鐘乳石會扣兩滴血", () => {
  const start = chooseRunMode(createPlayer(), "safe", () => 0).player;
  const result = mine(start, () => 0.75, 1000);

  assert.equal(result.kind, "stalactite");
  assert.equal(result.player.bombs, 2);
  assert.equal(result.player.dead, false);
});

test("寶石礦洞的白金破爛佔五格包包", () => {
  const start = chooseRunMode(createPlayer(), "safe", () => 0).player;
  const result = mine(start, () => 0.95);

  assert.equal(result.kind, "platinumJunk");
  assert.equal(result.player.platinumJunk, 1);
  assert.equal(getBagUsedSlots(result.player), 5);
});

test("礦石會佔用包包格子", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    ore: 2,
    goldOre: 1,
    platinumOre: 1
  };

  assert.equal(getBagUsedSlots(player), 4);
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

test("地表會刷新兩個初始詞條並只能選本輪出現的", () => {
  const player = ensureRunModeOptions(createPlayer(), () => 0.99);
  const options = getRunModeOptions(player).map((option) => option.id);
  const blocked = chooseRunMode(player, "double");
  const chosen = chooseRunMode(player, options[0]);

  assert.equal(options.length, 2);
  assert.deepEqual(options, ["silkTouch", "fireDragonPickaxe"]);
  assert.equal(blocked.ok, false);
  assert.equal(chosen.ok, true);
  assert.equal(chosen.player.runMode, "silkTouch");
  assert.deepEqual(chosen.player.runModeOptions, []);
});

test("返回地面會刷新下一輪初始詞條", () => {
  const result = returnToSurface(
    {
      ...chooseRunMode(createPlayer(), "safe").player,
      depth: 3
    },
    () => 0.99
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.player.runModeOptions, ["silkTouch", "fireDragonPickaxe"]);
});

test("火龍十字鎬每次深入會跳兩層並錯過部分小磁條層", () => {
  const start = {
    ...chooseRunMode(
      { ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"], nextEventDepth: 99 },
      "fireDragonPickaxe"
    ).player,
    nextEventDepth: 99
  };
  const first = mine(start, () => 0);
  const second = mine(first.player, () => 0);
  const third = mine(second.player, () => 0);

  assert.equal(first.player.depth, 2);
  assert.equal(second.player.depth, 4);
  assert.equal(third.player.depth, 6);
  assert.equal(canChooseMinorBuff(third.player), false);
});

test("火龍十字鎬會把金幣和礦物燒成更高地表價值的物品", () => {
  const goldRun = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"] },
    "fireDragonPickaxe"
  ).player;
  const goldBlock = mine(goldRun, () => 0);
  const goldReturn = returnToSurface(goldBlock.player);

  const oreRun = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"] },
    "fireDragonPickaxe"
  ).player;
  const oreIngot = mine(oreRun, () => 0.5);
  const oreReturn = returnToSurface(oreIngot.player);

  assert.equal(goldBlock.kind, "goldBlock");
  assert.equal(goldBlock.player.goldBlock, 1);
  assert.equal(goldReturn.player.gold, 2);
  assert.equal(oreIngot.kind, "oreIngot");
  assert.equal(oreIngot.player.oreIngot, 2);
  assert.equal(oreReturn.player.gold, 24);
});

test("火龍十字鎬的大爆炸會扣兩滴血", () => {
  const start = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"] },
    "fireDragonPickaxe"
  ).player;
  const rolls = [0.95, 0];
  const result = mine(start, () => rolls.shift() ?? 0, 1000);

  assert.equal(result.kind, "dead");
  assert.equal(result.player.bombs, 2);
  assert.equal(result.player.dead, true);
  assert.match(result.title, /大爆炸/);
});

test("絲綢之觸可以把炸彈完整挖回地表販售", () => {
  const start = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["silkTouch", "safe"] },
    "silkTouch"
  ).player;
  const rolls = [0.95, 0];
  const result = mine(start, () => rolls.shift() ?? 0, 1000);
  const sold = returnToSurface(result.player);

  assert.equal(result.kind, "bombItem");
  assert.equal(result.player.bombItem, 1);
  assert.equal(result.player.bombs, 0);
  assert.equal(sold.player.gold, 90);
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

test("共同任務達到 70 層後商店解鎖治療藥水", () => {
  const progress = getCommunityProgress({
    a: { ...createPlayer(), stats: { ...createPlayer().stats, bestDepth: 70 } }
  });
  const result = buyShopItem({ ...createPlayer(), gold: 100 }, "healingPotion", 1, progress);

  assert.equal(progress.healingPotionUnlocked, true);
  assert.equal(result.ok, true);
  assert.equal(result.player.healingPotion, 1);
  assert.equal(result.player.gold, 0);
});

test("治療藥水只能下礦後使用並恢復一滴血", () => {
  const player = {
    ...chooseRunMode({ ...createPlayer(), runModeOptions: ["safe", "double"], healingPotion: 1 }, "safe").player,
    bombs: 2
  };
  const result = drinkHealingPotion(player);

  assert.equal(result.ok, true);
  assert.equal(result.player.healingPotion, 0);
  assert.equal(result.player.bombs, 1);
});

test("共同死亡達到 100 次後商店解鎖不死圖騰", () => {
  const progress = getCommunityProgress({
    a: { ...createPlayer(), stats: { ...createPlayer().stats, deaths: 60 } },
    b: { ...createPlayer(), stats: { ...createPlayer().stats, deaths: 40 } }
  });
  const result = buyShopItem({ ...createPlayer(), gold: 500 }, "undyingTotem", 1, progress);

  assert.equal(progress.undyingTotemUnlocked, true);
  assert.equal(result.ok, true);
  assert.equal(result.player.undyingTotem, 1);
  assert.equal(result.player.gold, 0);
});

test("不死圖騰會在死亡時原地復活並繼續挖礦", () => {
  const start = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["safe", "double"], undyingTotem: 1 },
    "safe"
  ).player;
  const result = mine({ ...start, bombs: 3 }, () => 0.95, 1000);

  assert.equal(result.kind, "bomb");
  assert.equal(result.player.dead, false);
  assert.equal(result.player.undyingTotem, 0);
  assert.equal(result.player.depth, 1);
  assert.equal(result.player.bombs, 3);
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

test("好地精會收購身上的所有礦石並給錢", () => {
  const result = resolveRandomEvent(
    {
      ...chooseRunMode(createPlayer(), "safe").player,
      pendingEvent: "goblin_purchase",
      ore: 2,
      goldOre: 1,
      platinumOre: 1
    },
    "risk",
    () => 0
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.goldOre, 0);
  assert.equal(result.player.platinumOre, 0);
  assert.equal(result.player.gold, 483);
  assert.match(result.message, /好地精/);
});

test("壞地精會拿走礦石且可能造成傷害", () => {
  const rolls = [0.9, 0];
  const result = resolveRandomEvent(
    {
      ...chooseRunMode(createPlayer(), "safe").player,
      pendingEvent: "goblin_purchase",
      ore: 2
    },
    "risk",
    () => rolls.shift() ?? 0,
    1000
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.gold, 0);
  assert.equal(result.player.bombs, 1);
  assert.match(result.message, /壞地精/);
});

test("絲綢之觸原礦給地精收購價更高", () => {
  const result = resolveRandomEvent(
    {
      ...chooseRunMode({ ...createPlayer(), runModeOptions: ["silkTouch", "safe"] }, "silkTouch").player,
      pendingEvent: "goblin_purchase",
      ore: 1
    },
    "risk",
    () => 0
  );

  assert.equal(result.player.gold, 18);
});

test("火龍十字鎬加工物給地精收購價更低", () => {
  const result = resolveRandomEvent(
    {
      ...chooseRunMode({ ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"] }, "fireDragonPickaxe").player,
      pendingEvent: "goblin_purchase",
      oreIngot: 1
    },
    "risk",
    () => 0
  );

  assert.equal(result.player.gold, 6);
});

test("超大洞穴蟑螂會吃掉身上的所有破爛", () => {
  const result = resolveRandomEvent(
    {
      ...chooseRunMode(createPlayer(), "safe").player,
      pendingEvent: "cave_roach",
      junk: 2,
      platinumJunk: 1
    },
    "risk"
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.junk, 0);
  assert.equal(result.player.platinumJunk, 0);
  assert.equal(getBagUsedSlots(result.player), 0);
  assert.match(result.message, /摸了摸超大洞穴蟑螂的頭/);
  assert.match(result.message, /空出 11 格/);
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

test("三分鐘內救援會退回死亡損失金幣", () => {
  const dead = mine(
    { ...createPlayer(), gold: 90, bombs: 1, runMode: "double" },
    () => 0.95,
    1000
  ).player;
  const result = rescuePlayer(
    { ...createPlayer(), gold: 20 },
    dead,
    1000 + 2 * 60 * 1000
  );

  assert.equal(dead.gold, 30);
  assert.equal(dead.lastDeathLostGold, 60);
  assert.equal(result.ok, true);
  assert.equal(result.target.gold, 90);
  assert.equal(result.target.lastDeathLostGold, 0);
  assert.match(result.message, /退回 60/);
});

test("超過三分鐘救援不退回死亡損失金幣", () => {
  const dead = mine(
    { ...createPlayer(), gold: 90, bombs: 1, runMode: "double" },
    () => 0.95,
    1000
  ).player;
  const result = rescuePlayer(
    { ...createPlayer(), gold: 20 },
    dead,
    1000 + 4 * 60 * 1000
  );

  assert.equal(result.ok, true);
  assert.equal(result.target.gold, 30);
  assert.equal(result.target.lastDeathLostGold, 0);
  assert.doesNotMatch(result.message, /退回/);
});

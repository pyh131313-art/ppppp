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
  getDigPathOptions,
  getElevatorCost,
  getMinorBuffEffectiveStacks,
  getMinorBuffOptions,
  getRandomEvents,
  getRunModeOptions,
  isMiniTraitBreakthroughMode,
  isSelectableMiniTrait,
  mine,
  openUndergroundInn,
  drinkHealingPotion,
  removeRust,
  rerollRunModeOptions,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  setUiMode,
  shimmerCollectible,
  transferHealingPotion,
  triggerCharge,
  travelToUndergroundCamp,
  transferCollectible,
  openUndergroundStorage,
  depositUndergroundStorage,
  withdrawUndergroundStorage,
  withdrawBank
} = require("../src/game");
const {
  createGlobalState,
  getMarketMultiplier
} = require("../src/globalState");
const {
  getEventTriggerChance,
  updateEventState
} = require("../src/eventPitySystem");
const {
  buildBankComponents,
  buildPanelComponents,
  buildPanelEmbed,
  CUSTOM_IDS
} = require("../src/ui");
const { pickRandomEvent } = require("../src/eventSystem");

test("炸彈每次扣半血，累積到生命上限才死亡", () => {
  const start = chooseRunMode(createPlayer(), "double").player;
  const first = mine(start, () => 0.95, 1000).player;
  assert.equal(first.bombs, 0.5);
  assert.equal(first.dead, false);

  const second = mine(first, () => 0.95, 2000).player;
  assert.equal(second.bombs, 1);
  assert.equal(second.dead, false);

  const third = mine(second, () => 0.95, 3000).player;
  assert.equal(third.bombs, 1.5);
  assert.equal(third.dead, false);

  const fourthResult = mine(third, () => 0.95, 4000);
  assert.equal(fourthResult.player.bombs, 2);
  assert.equal(fourthResult.player.dead, true);
});

test("炸彈死亡會損失三分之一金幣", () => {
  const result = mine(
    { ...createPlayer(), gold: 30, bombs: 3.5, runMode: "safe" },
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
    { ...createPlayer(), gold: 30, bankGold: 100, bombs: 3.5, runMode: "safe" },
    () => 0.95,
    1000
  );

  assert.equal(result.player.dead, true);
  assert.equal(result.player.gold, 20);
  assert.equal(result.player.bankGold, 100);
});

test("礦場分頁主畫面只顯示核心狀態", () => {
  const player = chooseRunMode({ ...createPlayer(), gold: 12, bankGold: 30 }, "safe").player;
  const embed = buildPanelEmbed(player, "礦場面板", "", null, "main").toJSON();
  const value = embed.fields[0].value;

  assert.match(value, /生命：/);
  assert.match(value, /金幣：12 ｜ 銀行：30/);
  assert.match(value, /深度：/);
  assert.match(value, /路線：←/);
  assert.doesNotMatch(value, /📦 資源/);
  assert.doesNotMatch(value, /🎒 包包（/);
});

test("礦場分頁按鈕保留玩家狀態並標示目前頁面", () => {
  const rows = buildPanelComponents("user-1", createPlayer(), {}, "bag").map((row) => row.toJSON());
  const pageRow = rows.find((row) => row.components.some((component) => (
    component.custom_id === `${CUSTOM_IDS.pagePrefix}:bag:user-1`
  )));
  const bagButton = pageRow.components.find((component) => component.custom_id === `${CUSTOM_IDS.pagePrefix}:bag:user-1`);
  const mainButton = pageRow.components.find((component) => component.custom_id === `${CUSTOM_IDS.pagePrefix}:main:user-1`);

  assert.equal(bagButton.style, 1);
  assert.equal(mainButton.style, 2);
});

test("精簡模式按鈕整合在分頁列", () => {
  const rows = buildPanelComponents("user-1", setUiMode(createPlayer(), "compact").player, {}, "main").map((row) => row.toJSON());
  const pageRow = rows[0];
  const compactButton = pageRow.components.find((component) => component.custom_id === `${CUSTOM_IDS.uiModePrefix}:compact:user-1`);
  const activeButtons = pageRow.components.filter((component) => component.style === 1);

  assert.equal(pageRow.components.length, 5);
  assert.equal(compactButton.label, "精簡");
  assert.equal(compactButton.style, 1);
  assert.deepEqual(activeButtons.map((component) => component.label), ["精簡"]);
  assert.equal(rows.every((row) => row.components.every((component) => component.label !== "完整")), true);
});

test("詞條選擇畫面會顯示短說明且選擇後不顯示", () => {
  const choosing = {
    ...createPlayer(),
    runModeOptions: ["double", "safe"]
  };
  const choosingEmbed = buildPanelEmbed(choosing, "礦場面板", "").toJSON();

  assert.match(choosingEmbed.description, /① 雙倍採集\n採集x2｜死亡扣金x2/);
  assert.match(choosingEmbed.description, /② 安全血量\n生命\+2｜鏽幣-50%/);
  assert.match(choosingEmbed.description, /👉 按下方數字選擇/);

  const chosenEmbed = buildPanelEmbed(chooseRunMode(choosing, "double").player, "下礦方式", "").toJSON();
  assert.doesNotMatch(chosenEmbed.description, /採集x2/);
  assert.doesNotMatch(chosenEmbed.description, /按下方數字選擇/);
});

test("精簡 UI 的詞條選擇畫面也會顯示短說明", () => {
  const choosing = setUiMode({
    ...createPlayer(),
    runModeOptions: ["double", "safe"]
  }, "compact").player;
  const choosingEmbed = buildPanelEmbed(choosing, "礦場面板", "").toJSON();

  assert.match(choosingEmbed.description, /① 雙倍採集\n採集x2｜死亡扣金x2/);
  assert.match(choosingEmbed.description, /② 安全血量\n生命\+2｜鏽幣-50%/);
  assert.match(choosingEmbed.description, /👉 按下方數字選擇/);

  const chosenEmbed = buildPanelEmbed(chooseRunMode(choosing, "double").player, "下礦方式", "").toJSON();
  assert.doesNotMatch(chosenEmbed.description, /採集x2/);
});

test("精簡 UI 只顯示生命深度包包和路線", () => {
  const player = setUiMode({
    ...chooseRunMode(createPlayer(), "safe").player,
    gold: 99,
    bankGold: 100,
    ore: 1,
    stats: { bestDepth: 48, totalMines: 0, deaths: 0 },
    depth: 12,
    minorBuffs: { gold: 2, bomb: 1 },
    tempEffects: [{ id: "gas_extreme", remaining: 2 }]
  }, "compact").player;
  const embed = buildPanelEmbed(player, "礦場面板", "", null, "detail").toJSON();
  const value = embed.fields[0].value;

  assert.match(value, /⛏️【礦井探險｜精簡】/);
  assert.match(value, /生命：/);
  assert.match(value, /深度：12｜本趟0｜最深48/);
  assert.match(value, /🎒 包包（1\/12）/);
  assert.match(value, /⛏️ ⬛ ⬛ ⬛/);
  assert.match(value, /蓄力：⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 0\/100/);
  assert.match(value, /路線：\n←/);
  assert.doesNotMatch(value, /金幣：/);
  assert.doesNotMatch(value, /銀行/);
  assert.doesNotMatch(value, /📦 資源/);
  assert.doesNotMatch(value, /磁條/);
  assert.doesNotMatch(value, /狀態效果/);
  assert.doesNotMatch(value, /礦洞/);
});

test("蓄力滿時會顯示可爆發能量條", () => {
  const embed = buildPanelEmbed({
    ...chooseRunMode(createPlayer(), "safe").player,
    chargeValue: 100
  }, "礦場面板", "", null, "detail").toJSON();
  const value = embed.fields[0].value;

  assert.match(value, /蓄力：🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 可爆發/);
});

test("銀行只能在地表或地底營地存入並可以領出", () => {
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

test("左挖右挖會套用安全與貪婪路線差異", () => {
  const leftRolls = [0, 0.99, 0.99];
  const rightRolls = [0, 0.99, 0.99];
  const left = mine(
    { ...createPlayer(), runMode: "safe", caveType: "normal", digPathOptions: { left: "steady", right: "greedy" } },
    () => leftRolls.shift() ?? 0.99,
    1000,
    "left"
  );
  const right = mine(
    { ...createPlayer(), runMode: "safe", caveType: "normal", digPathOptions: { left: "steady", right: "greedy" } },
    () => rightRolls.shift() ?? 0.99,
    1000,
    "right"
  );

  assert.equal(left.kind, "gold");
  assert.equal(right.kind, "gold");
  assert.equal(left.player.gold, 2);
  assert.equal(right.player.gold, 3);
  assert.match(left.message, /穩固石壁。/);
  assert.match(right.message, /貪婪裂隙。/);
  assert.doesNotMatch(left.message, /安全支道/);
});

test("左右路線會在下礦和每次挖完後刷新", () => {
  const startRolls = [0.5, 0, 0];
  const start = chooseRunMode(createPlayer(), "safe", () => startRolls.shift() ?? 0);

  assert.equal(start.ok, true);
  assert.deepEqual(getDigPathOptions(start.player).map((path) => path.id), ["steady", "greedy"]);

  const mineRolls = [0, 0.99, 0.45, 0.5];
  const result = mine(start.player, () => mineRolls.shift() ?? 0.99, 1000, "left");

  assert.equal(result.kind, "gold");
  assert.deepEqual(getDigPathOptions(result.player).map((path) => path.id), ["oreVein", "rustyCrack"]);
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
  const result = mine({ ...start, forcedNextResult: "rusty" }, () => 0.66);

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
  assert.match(second.recordMessage, /累積第 2 層/);
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

test("礦區記憶事件只會在有足夠路線紀錄時出現", () => {
  const player = chooseRunMode(createPlayer(), "safe").player;
  assert.equal(
    pickRandomEvent(player, () => 0, (id) => id === "route_memory_totem"),
    undefined
  );

  player.digPathHistory = [
    { label: "穩固石壁", depth: 1 },
    { label: "貪婪金脈", depth: 2 },
    { label: "炸裂裂縫", depth: 3 }
  ];
  assert.equal(
    pickRandomEvent(player, () => 0, (id) => id === "route_memory_totem"),
    "route_memory_totem"
  );
});

test("礦區記憶事件排對給獎勵，排錯會受罰", () => {
  const base = {
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "route_memory_totem",
    depth: 10,
    gold: 100,
    memoryChallenge: {
      eventId: "route_memory_totem",
      correctChoice: "safe",
      options: {
        risk: ["炸裂裂縫", "貪婪金脈", "穩固石壁"],
        safe: ["穩固石壁", "貪婪金脈", "炸裂裂縫"],
        extreme: ["貪婪金脈", "炸裂裂縫", "穩固石壁"]
      }
    }
  };

  const correct = resolveRandomEvent(base, "safe", () => 0);
  assert.equal(correct.ok, true);
  assert.equal(correct.player.pendingEvent, null);
  assert.equal(correct.player.memoryChallenge, null);
  assert.equal(correct.player.gold, 220);

  const wrong = resolveRandomEvent(base, "risk", () => 0);
  assert.equal(wrong.ok, true);
  assert.equal(wrong.player.gold, 88);
  assert.equal(wrong.player.bombs, 0.5);
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
  const mined = mine(start, () => rolls.shift() ?? 0.99);
  const result = returnToSurface(mined.player);

  assert.equal(mined.kind, "ore");
  assert.equal(mined.player.ore, 2);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.gold, 16);
});

test("供需系統會讓大量賣出的礦石價格下降", () => {
  const globalState = createGlobalState(0);
  const result = returnToSurface({
    ...chooseRunMode(createPlayer(), "safe").player,
    ore: 80
  }, Math.random, globalState, 0);

  assert.equal(result.ok, true);
  assert.equal(getMarketMultiplier(result.globalState, "ore", 0) < 1, true);
});

test("返回地面會顯示拆分結算爆發", () => {
  const result = returnToSurface({
    ...chooseRunMode(createPlayer(), "safe").player,
    ore: 2,
    maxCombo: 5,
    critCount: 3,
    jackpotCount: 1,
    runRewardStats: {
      baseReward: 16,
      critBonus: 80,
      comboBonus: 120,
      riskBonus: 90,
      burstBonus: 200
    }
  });

  assert.match(result.message, /💰 探險結算：/);
  assert.match(result.message, /基礎收益：16/);
  assert.match(result.message, /爆擊加成：\+80/);
  assert.match(result.message, /👉 總收益：506 金幣！/);
  assert.match(result.message, /最高連擊：5｜爆擊次數：3｜Jackpot：1/);
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
  assert.equal(amount, 8);
  assert.equal(result.player.platinumOre, 0);
  assert.equal(result.player.gold, amount * 260);
});

test("寶石礦洞只會挖到寶石並返回地面換高價金幣", () => {
  const start = chooseRunMode(createPlayer(), "safe", () => 0).player;
  const rolls = [0, 0, 0.99, 0.99, 0.99, 0.99];
  const mined = mine(start, () => rolls.shift() ?? 0.99);
  const result = returnToSurface(mined.player);

  assert.equal(mined.kind, "redGem");
  assert.equal(mined.player.redGem, 1);
  assert.equal(mined.player.ore, 0);
  assert.equal(result.player.redGem, 0);
  assert.equal(result.player.gold, 35);
});

test("寶石礦洞的鐘乳石會扣一滴血", () => {
  const start = chooseRunMode(createPlayer(), "safe", () => 0).player;
  const result = mine(start, () => 0.75, 1000);

  assert.equal(result.kind, "stalactite");
  assert.equal(result.player.bombs, 1);
  assert.equal(result.player.dead, false);
});

test("普通礦洞也會出現鐘乳石並扣一滴血", () => {
  const start = chooseRunMode(createPlayer(), "safe").player;
  const result = mine({ ...start, forcedNextResult: "stalactite" }, () => 0.99, 1000);

  assert.equal(result.kind, "stalactite");
  assert.equal(result.player.bombs, 1);
  assert.equal(result.player.dead, false);
  assert.match(result.message, /鐘乳石/);
});

test("礦工帽會優先抵擋一次鐘乳石", () => {
  const start = {
    ...chooseRunMode(createPlayer(), "safe").player,
    minerHelmetCount: 1,
    forcedNextResult: "stalactite"
  };
  const result = mine(start, () => 0.99, 1000);

  assert.equal(result.kind, "stalactite");
  assert.equal(result.player.bombs, 0);
  assert.equal(result.player.minerHelmetCount, 0);
  assert.match(result.message, /礦工帽/);
});

test("寶石礦洞的白金破爛佔五格包包", () => {
  const start = chooseRunMode(createPlayer(), "safe", () => 0).player;
  const result = mine(start, () => 0.95);

  assert.equal(result.kind, "platinumJunk");
  assert.equal(result.player.platinumJunk, 1);
  assert.equal(getBagUsedSlots(result.player), 5);
});

test("100 層後會進入岩漿池並可抵達地底營地", () => {
  let player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 99,
    tempMaxHp: 5
  };
  let result = mine(player, () => 0.99, 1000);
  assert.equal(result.player.zone, "lavaPool");
  result = mine(result.player, () => 0.99, 2000);
  result = mine(result.player, () => 0.99, 3000);
  assert.equal(result.player.zone, "undergroundCamp");
  assert.equal(result.player.undergroundCampUnlocked, true);
});

test("進入地底營地會自動出售普通礦洞資源並保留反轉資源", () => {
  const result = mine({
    ...createPlayer(),
    runMode: "safe",
    zone: "lavaPool",
    lavaProgress: 2,
    tempMaxHp: 5,
    ore: 10,
    goldOre: 2,
    bombItem: 1,
    redGem: 1,
    invertedOre: 3
  }, () => 0.99, 1000);

  assert.equal(result.player.zone, "undergroundCamp");
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.goldOre, 0);
  assert.equal(result.player.bombItem, 0);
  assert.equal(result.player.redGem, 0);
  assert.equal(result.player.invertedOre, 3);
  assert.equal(result.player.runMode, null);
  assert.equal(result.player.runModeOptions.length, 2);
  assert.equal(result.player.gold > 0, true);
  assert.match(result.message, /跨區域結算/);
});

test("地底營地往上挖會先穿過回升礦道", () => {
  const player = {
    ...createPlayer(),
    runMode: "reversePrep",
    zone: "undergroundCamp",
    undergroundCampUnlocked: true,
    depth: 100,
    runDepthProgress: 100
  };
  const result = mine(player, () => 0.2, 1000);

  assert.equal(result.player.zone, "upward");
  assert.equal(result.player.depth, 99);
  assert.equal(result.player.runDepthProgress, 101);
  assert.equal(result.title, "回升礦道");
});

test("上挖跨過地表後才進入反轉層並結算普通資源", () => {
  const player = {
    ...createPlayer(),
    runMode: "reversePrep",
    zone: "upward",
    depth: 0,
    runDepthProgress: 200,
    ore: 10
  };
  const result = mine(player, () => 0.2, 1000);

  assert.equal(result.player.zone, "upward");
  assert.equal(result.player.depth, -1);
  assert.equal(result.player.runDepthProgress, 201);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.gold > 0, true);
  assert.equal(result.player.invertedOre > 0, true);
  assert.match(result.message, /跨區域結算/);
});

test("地底營地往上挖前可以選擇初始詞條", () => {
  const camp = ensureRunModeOptions({
    ...createPlayer(),
    zone: "undergroundCamp",
    undergroundCampUnlocked: true,
    depth: 100
  }, () => 0);
  const options = getRunModeOptions(camp);
  const blocked = mine(camp, () => 0.2, 1000);
  const chosen = chooseRunMode(camp, options[0].id, () => 0.99);
  const result = mine(chosen.player, () => 0.2, 2000);

  assert.equal(blocked.kind, "blocked");
  assert.match(blocked.message, /兩個初始詞條/);
  assert.equal(chosen.ok, true);
  assert.equal(chosen.player.zone, "undergroundCamp");
  assert.equal(chosen.player.depth, 100);
  assert.equal(result.player.zone, "upward");
  assert.equal(result.player.depth, 99);
});

test("地底營地已選詞條後仍可重選", () => {
  const camp = ensureRunModeOptions({
    ...createPlayer(),
    zone: "undergroundCamp",
    depth: 100,
    runModeOptions: ["safe", "double"]
  }, () => 0);
  const first = chooseRunMode(camp, "safe", () => 0.99);
  const second = chooseRunMode(first.player, "double", () => 0.99);
  const rows = buildPanelComponents(null, second.player);
  const customIds = rows.flatMap((row) => row.components.map((component) => component.data.custom_id));

  assert.equal(first.player.runMode, "safe");
  assert.equal(second.player.runMode, "double");
  assert.deepEqual(second.player.runModeOptions, ["safe", "double"]);
  assert.equal(customIds.includes(`${CUSTOM_IDS.modePrefix}:safe`), true);
  assert.equal(customIds.includes(CUSTOM_IDS.mine), true);
});

test("地表地底天域都可以使用無限堆疊倉庫", () => {
  const surface = openUndergroundStorage({
    ...createPlayer(),
    zone: "surface",
    healingPotion: 1
  });
  const sky = openUndergroundStorage({
    ...createPlayer(),
    zone: "skyCamp",
    orichalcum: 2
  });
  const opened = openUndergroundStorage({
    ...createPlayer(),
    zone: "undergroundCamp",
    ore: 99,
    redGem: 8,
    bombItem: 4,
    invertedOre: 3,
    invertedGem: 2,
    orichalcum: 1,
    platinumJunk: 1,
    minerHelmetCount: 1,
    healingPotion: 2,
    chickenTraitTickets: 1
  });
  const deposited = depositUndergroundStorage(opened.player);
  const withdrawn = withdrawUndergroundStorage(deposited.player);

  assert.equal(surface.ok, true);
  assert.equal(sky.ok, true);
  assert.equal(opened.ok, true);
  assert.equal(deposited.player.ore, 0);
  assert.equal(deposited.player.redGem, 0);
  assert.equal(deposited.player.bombItem, 0);
  assert.equal(deposited.player.invertedOre, 0);
  assert.equal(deposited.player.healingPotion, 0);
  assert.equal(deposited.player.chickenTraitTickets, 0);
  assert.equal(deposited.player.undergroundStorage.ore, 99);
  assert.equal(deposited.player.undergroundStorage.redGem, 8);
  assert.equal(deposited.player.undergroundStorage.bombItem, 4);
  assert.equal(deposited.player.undergroundStorage.invertedOre, 3);
  assert.equal(deposited.player.undergroundStorage.healingPotion, 2);
  assert.equal(deposited.player.undergroundStorage.chickenTraitTickets, 1);
  assert.equal(withdrawn.player.ore, 99);
  assert.equal(withdrawn.player.redGem, 8);
  assert.equal(withdrawn.player.bombItem, 4);
  assert.equal(withdrawn.player.invertedOre, 3);
  assert.equal(withdrawn.player.healingPotion, 2);
  assert.equal(withdrawn.player.chickenTraitTickets, 1);
  assert.equal(withdrawn.player.undergroundStorage.invertedOre, 0);
});

test("倉庫可以指定存入與取出的物品數量", () => {
  const deposited = depositUndergroundStorage({
    ...createPlayer(),
    zone: "surface",
    ore: 10,
    healingPotion: 3
  }, "普通礦石", 4);
  const withdrawn = withdrawUndergroundStorage(deposited.player, "ore", 2);

  assert.equal(deposited.ok, true);
  assert.equal(deposited.player.ore, 6);
  assert.equal(deposited.player.healingPotion, 3);
  assert.equal(deposited.player.undergroundStorage.ore, 4);
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.player.ore, 8);
  assert.equal(withdrawn.player.undergroundStorage.ore, 2);
});

test("天上營地可以往下挖回地表並自動結算", () => {
  const result = mine({
    ...createPlayer(),
    zone: "skyCamp",
    depth: -5,
    ore: 10,
    invertedGem: 2
  }, () => 0.99, 1000);

  assert.equal(result.player.zone, "surface");
  assert.equal(result.player.depth, 0);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.invertedGem, 2);
  assert.equal(result.player.gold > 0, true);
  assert.match(result.message, /回到地上營地/);
});

test("天上往下挖途中可以返回最近營地並重置本趟層數", () => {
  const result = returnToSurface({
    ...createPlayer(),
    zone: "skyDown",
    depth: -60,
    runDepthProgress: 40,
    ore: 10,
    invertedGem: 2
  }, () => 0, null, 1000);
  const rows = buildPanelComponents(null, {
    ...createPlayer(),
    zone: "skyDown",
    depth: -60
  });
  const customIds = rows.flatMap((row) => row.components.map((component) => component.data.custom_id));

  assert.equal(result.ok, true);
  assert.equal(result.player.zone, "skyCamp");
  assert.equal(result.player.depth, -100);
  assert.equal(result.player.runDepthProgress, 0);
  assert.equal(result.player.ore, 0);
  assert.equal(result.player.invertedGem, 2);
  assert.equal(result.player.runModeOptions.length, 2);
  assert.match(result.message, /返回天上營地/);
  assert.equal(customIds.includes(CUSTOM_IDS.returnSurface), true);
});

test("地底客棧目前顯示敬請期待", () => {
  const result = openUndergroundInn({
    ...createPlayer(),
    zone: "undergroundCamp"
  });

  assert.equal(result.ok, true);
  assert.match(result.message, /敬請期待/);
});

test("地底營地銀行可存款提款且顯示總資產", () => {
  const camp = {
    ...createPlayer(),
    runMode: "safe",
    zone: "undergroundCamp",
    undergroundCampUnlocked: true,
    depth: 100,
    gold: 75,
    bankGold: 25
  };
  const deposited = depositBank(camp);
  const withdrawn = withdrawBank(deposited.player);
  const rows = buildPanelComponents(null, camp);
  const customIds = rows.flatMap((row) => row.components.map((component) => component.data.custom_id));

  assert.equal(deposited.ok, true);
  assert.equal(deposited.player.gold, 0);
  assert.equal(deposited.player.bankGold, 100);
  assert.match(deposited.message, /【地底營地】/);
  assert.match(deposited.message, /目前餘額：100/);
  assert.match(deposited.message, /總資產：100/);
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.player.gold, 100);
  assert.equal(withdrawn.player.bankGold, 0);
  assert.equal(customIds.includes(CUSTOM_IDS.bankOpen), true);

  const bankRows = buildBankComponents("player-1");
  const bankCustomIds = bankRows.flatMap((row) => row.components.map((component) => component.data.custom_id));
  assert.equal(bankCustomIds.includes(`${CUSTOM_IDS.bankDeposit}:player-1`), true);
  assert.equal(bankCustomIds.includes(`${CUSTOM_IDS.bankWithdraw}:player-1`), true);
});

test("地底營地未選詞條時顯示詞條按鈕與銀行", () => {
  const camp = ensureRunModeOptions({
    ...createPlayer(),
    zone: "undergroundCamp",
    undergroundCampUnlocked: true,
    depth: 100
  }, () => 0);
  const rows = buildPanelComponents(null, camp);
  const customIds = rows.flatMap((row) => row.components.map((component) => component.data.custom_id));

  assert.equal(customIds.some((id) => id.startsWith(`${CUSTOM_IDS.modePrefix}:`)), true);
  assert.equal(customIds.includes(CUSTOM_IDS.bankOpen), true);
  assert.equal(customIds.includes(CUSTOM_IDS.shopOpen), true);
});

test("地表可以花總資產一成回到地底營地", () => {
  const result = travelToUndergroundCamp({
    ...createPlayer(),
    undergroundCampUnlocked: true,
    gold: 90,
    bankGold: 10
  }, 1000);

  assert.equal(result.ok, true);
  assert.equal(getElevatorCost({ ...createPlayer(), gold: 90, bankGold: 10 }), 10);
  assert.equal(result.player.zone, "undergroundCamp");
  assert.equal(result.player.runDepthProgress, 0);
  assert.equal(result.player.gold + result.player.bankGold, 90);
});

test("舊版 100 層以上玩家開礦場會遷移到地底營地且保留狀態", () => {
  const player = ensureRunModeOptions({
    ...createPlayer(),
    runMode: "safe",
    depth: 126,
    ore: 7,
    gold: 123,
    bombs: 1,
    tempEffects: [{ id: "test_buff", remaining: 2 }]
  });

  assert.equal(player.zone, "undergroundCamp");
  assert.equal(player.migratedToUndergroundCamp, true);
  assert.equal(player.preUpdateDeepPlayer, true);
  assert.equal(player.ore, 7);
  assert.equal(player.gold, 123);
  assert.equal(player.bombs, 1);
  assert.equal(player.tempEffects.length, 1);
  assert.match(player.lastMigrationMessage, /地底營地/);
});

test("礦石金屬錠和寶石每十個佔一格", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    ore: 11,
    goldOre: 1,
    platinumOre: 1,
    oreIngot: 10,
    goldOreIngot: 1,
    platinumOreIngot: 1,
    redGem: 10,
    blueGem: 1,
    greenGem: 1
  };

  assert.equal(getBagUsedSlots(player), 10);
});

test("擴容之心會永久增加兩格包包", () => {
  assert.equal(getBagCapacity({ ...createPlayer(), expansionHeart: true }), 14);
});

test("賽雞一次性詞條會在選到後消耗詞條權", () => {
  const chosen = chooseRunMode({
    ...createPlayer(),
    chickenTraitTickets: 1,
    runModeOptions: ["chickenBlood", "safe"]
  }, "chickenBlood").player;

  assert.equal(chosen.runMode, "chickenBlood");
  assert.equal(chosen.chickenTraitTickets, 0);
});

test("烤雞生命加成會套用到下一局下礦並消耗", () => {
  const chosen = chooseRunMode({
    ...createPlayer(),
    chickenRoastHpBonus: 1,
    runModeOptions: ["double", "safe"]
  }, "double").player;

  assert.equal(chosen.tempMaxHp, 1);
  assert.equal(chosen.chickenRoastHpBonus, 0);
});

test("同一組堆疊未滿十個時包包滿仍可放入", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    ore: 9,
    rusty: 11
  };
  const mined = mine({ ...player, forcedNextResult: "ore" }, () => 0.5);

  assert.equal(getBagUsedSlots(player), 12);
  assert.equal(mined.kind, "ore");
  assert.equal(mined.player.ore, 10);
  assert.equal(getBagUsedSlots(mined.player), 12);
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
    ore: 100,
    rusty: 2
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
  assert.deepEqual(options, ["reversePrep", "eventBody"]);
  assert.equal(blocked.ok, false);
  assert.equal(chosen.ok, true);
  assert.equal(chosen.player.runMode, "reversePrep");
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
  assert.deepEqual(result.player.runModeOptions, ["reversePrep", "eventBody"]);
});

test("地表可以花十金幣刷新初始詞條", () => {
  const player = ensureRunModeOptions({ ...createPlayer(), gold: 25 }, () => 0);
  const result = rerollRunModeOptions(player, () => 0.99);

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 15);
  assert.deepEqual(result.player.runModeOptions, ["reversePrep", "eventBody"]);
});

test("下礦後不能刷新初始詞條且金幣不足會被擋下", () => {
  const poor = rerollRunModeOptions({ ...createPlayer(), gold: 9 }, () => 0);
  const inMine = rerollRunModeOptions(chooseRunMode({ ...createPlayer(), gold: 25 }, "safe").player, () => 0);

  assert.equal(poor.ok, false);
  assert.match(poor.message, /需要 10 金幣/);
  assert.equal(inMine.ok, false);
  assert.match(inMine.message, /礦坑/);
});

test("事件保底連續未觸發後第四次必定觸發", () => {
  let state = { eventMissCount: 0, nextEventDepth: 4 };
  assert.equal(getEventTriggerChance(state), 0.45);
  state = updateEventState(false, state);
  assert.equal(getEventTriggerChance(state), 0.65);
  state = updateEventState(false, state);
  assert.equal(Number(getEventTriggerChance(state).toFixed(2)), 0.85);
  state = updateEventState(false, state);
  assert.equal(getEventTriggerChance(state), 1);
});

test("新增事件池包含普通寶石上位與反轉事件", () => {
  const events = getRandomEvents();
  const normalIds = [
    "lost_miner", "broken_lift", "glowing_moss", "black_vein", "underground_echo",
    "blaster_relic", "minecart_wreck", "ancient_mark", "deep_airflow", "rusty_safe",
    "cave_vendor", "dark_fissure", "vein_resonance", "sudden_cavein", "runaway_lamp"
  ];
  const gemCount = Object.values(events).filter((event) => event.caveType === "gem").length;
  const highCount = Object.values(events).filter((event) => event.highTier).length;
  const reverseCount = Object.values(events).filter((event) => event.reverseOnly).length;

  assert.equal(normalIds.every((id) => events[id]), true);
  assert.equal(gemCount, 20);
  assert.equal(highCount, 20);
  assert.equal(reverseCount, 10);
});

test("反轉事件極端選項會顯示各自事件文案", () => {
  const crack = resolveRandomEvent({
    ...createPlayer(),
    runMode: "reversePrep",
    zone: "upward",
    depth: -12,
    pendingEvent: "sky_light_crack"
  }, "extreme", () => 0.5, 1000);
  const turbulence = resolveRandomEvent({
    ...createPlayer(),
    runMode: "reversePrep",
    zone: "upward",
    depth: -12,
    pendingEvent: "rising_turbulence"
  }, "extreme", () => 0.5, 1000);

  assert.match(crack.message, /天光裂縫/);
  assert.doesNotMatch(crack.message, /反轉亂流/);
  assert.match(turbulence.message, /反轉亂流/);
});

test("新增反轉事件有不同效果", () => {
  const lake = resolveRandomEvent({
    ...createPlayer(),
    runMode: "reversePrep",
    zone: "upward",
    depth: -12,
    invertedOre: 2,
    pendingEvent: "mirror_lake"
  }, "safe", () => 0.5, 1000);
  const pocket = resolveRandomEvent({
    ...createPlayer(),
    runMode: "reversePrep",
    zone: "upward",
    depth: -12,
    pendingEvent: "void_pocket"
  }, "risk", () => 0.5, 1000);
  const elevator = resolveRandomEvent({
    ...createPlayer(),
    runMode: "reversePrep",
    zone: "upward",
    depth: -12,
    nextEventDepth: 12,
    pendingEvent: "echo_elevator"
  }, "risk", () => 0.5, 1000);

  assert.equal(lake.player.invertedOre, 3);
  assert.equal(pocket.player.bagBonusSlots, 3);
  assert.equal(pocket.player.junk, 1);
  assert.equal(elevator.player.depth, -15);
  assert.equal(elevator.player.nextEventDepth, 16);
});

test("寶箱可以開出下一場限定詞條與礦工帽", () => {
  const trait = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "treasure_chest"
  }, "risk", () => 0.45, 1000);
  const helmetRolls = [0.1, 0.99, 0.35];
  const helmet = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "treasure_chest"
  }, "risk", () => helmetRolls.shift() ?? 0.99, 1000);

  assert.equal(trait.player.pendingNextRunTraits.length, 1);
  assert.equal(helmet.player.minerHelmetCount, 1);
});

test("下一場限定詞條會進入初始選項並在選擇後消耗", () => {
  const player = ensureRunModeOptions({
    ...createPlayer(),
    pendingNextRunTraits: ["abyssMiner"]
  }, () => 0);
  const chosen = chooseRunMode(player, "abyssMiner");

  assert.equal(getRunModeOptions(player).some((option) => option.id === "abyssMiner"), true);
  assert.equal(chosen.ok, true);
  assert.equal(chosen.player.pendingNextRunTraits.includes("abyssMiner"), false);
});

test("吞金獸高資產或看過後不再出現", () => {
  const rich = pickRandomEvent({ ...createPlayer(), gold: 60000 }, () => 0.99);
  const seen = pickRandomEvent({ ...createPlayer(), hasSeenGoldenBeast: true }, () => 0.99);

  assert.notEqual(rich, "gold_eater");
  assert.notEqual(seen, "gold_eater");
});

test("吞金獸餵食後標記一生只見一次", () => {
  const result = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "gold_eater",
    gold: 100
  }, "risk");

  assert.equal(result.player.hasSeenGoldenBeast, true);
  assert.match(result.message, /不會再回來/);
});

test("吞金獸抵達地底營地時會回來且不被上挖選詞條清除", () => {
  const campArrival = mine({
    ...createPlayer(),
    runMode: "safe",
    zone: "lavaPool",
    lavaProgress: 2,
    tempMaxHp: 5,
    gold: 0,
    goldBeast: { amount: 100, returnDepth: 108 }
  }, () => 0, 1000);
  const camp = ensureRunModeOptions({
    ...createPlayer(),
    zone: "undergroundCamp",
    depth: 100,
    goldBeast: { amount: 100, returnDepth: 108 }
  }, () => 0);
  const chosen = chooseRunMode(camp, getRunModeOptions(camp)[0].id, () => 0);

  assert.equal(campArrival.player.zone, "undergroundCamp");
  assert.equal(campArrival.player.gold, 150);
  assert.equal(campArrival.player.goldBeast, null);
  assert.match(campArrival.message, /吞金獸回來了/);
  assert.deepEqual(chosen.player.goldBeast, { amount: 100, returnDepth: 108 });
});

test("爆擊會在原掉落後額外加成並累積蓄力", () => {
  const start = chooseRunMode(createPlayer(), "safe").player;
  const rolls = [0, 0, 0.99, 0.99, 0.05, 0.99, 0.99];
  const result = mine(start, () => rolls.shift() ?? 0.99);

  assert.equal(result.kind, "gold");
  assert.equal(result.player.critCount, 1);
  assert.equal(result.player.chargeValue, 12);
  assert.match(result.message, /💥 爆擊/);
});

test("連擊會累積並在失敗結果重置", () => {
  const start = chooseRunMode(createPlayer(), "safe").player;
  const firstRolls = [0, 0, 0.99, 0.99, 0.99, 0.99];
  const first = mine(start, () => firstRolls.shift() ?? 0.99);
  const secondRolls = [0, 0, 0.99, 0.99, 0.99, 0.99];
  const second = mine(first.player, () => secondRolls.shift() ?? 0.99);
  const bomb = mine({ ...second.player, forcedNextResult: "bomb" }, () => 0.99);

  assert.equal(first.player.comboCount, 1);
  assert.equal(second.player.comboCount, 2);
  assert.match(second.message, /🔥 2連擊/);
  assert.equal(bomb.player.comboCount, 0);
});

test("蓄力爆發可以主動觸發下一鏟加成", () => {
  const charged = {
    ...chooseRunMode(createPlayer(), "safe").player,
    chargeValue: 100
  };
  const triggered = triggerCharge(charged, "reward");
  const rolls = [0, 0, 0.99, 0.99, 0.99, 0.99];
  const mined = mine(triggered.player, () => rolls.shift() ?? 0.99);

  assert.equal(triggered.ok, true);
  assert.equal(triggered.player.chargeBurst, "reward");
  assert.equal(mined.player.chargeBurst, null);
  assert.match(mined.message, /⚡ 收益爆發！x3/);
});

test("蓄力技能不能連續選同一個", () => {
  const charged = {
    ...chooseRunMode(createPlayer(), "safe").player,
    chargeValue: 100,
    lastChargeSkillUsed: "reward"
  };
  const result = triggerCharge(charged, "reward");

  assert.equal(result.ok, false);
  assert.match(result.message, /不可再次選擇/);
});

test("Jackpot 會以醒目訊息給極端成功", () => {
  const start = chooseRunMode(createPlayer(), "safe").player;
  const rolls = [0, 0, 0.99, 0.99, 0.99, 0, 0, 0];
  const result = mine(start, () => rolls.shift() ?? 0.99);

  assert.equal(result.player.jackpotCount, 1);
  assert.match(result.message, /💎 JACKPOT！！！/);
});

test("新事件極端選項會套用臨時效果", () => {
  const result = resolveRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, pendingEvent: "unstable_powder" },
    "extreme",
    () => 0.99,
    1000
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.tempEffects.some((effect) => effect.id === "powder_extreme"), true);
  assert.equal(result.player.bombs, 0.5);
});

test("連鎖爆破踩炸彈會堆疊並在下一次收益後歸零", () => {
  const bombed = mine(
    { ...createPlayer(), runMode: "chainBlast", caveType: "normal" },
    () => 0.99,
    1000
  );
  const rewarded = mine(
    { ...bombed.player, bombs: 0 },
    () => 0,
    2000
  );

  assert.equal(bombed.player.traitState.chainBlast, 1);
  assert.equal(rewarded.kind, "gold");
  assert.equal(rewarded.player.traitState.chainBlast, 0);
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
  const goldRolls = [0, 0, 0.99, 0.99, 0.99, 0.99];
  const goldBlock = mine(goldRun, () => goldRolls.shift() ?? 0.99);
  const goldReturn = returnToSurface(goldBlock.player);

  const oreRun = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"] },
    "fireDragonPickaxe"
  ).player;
  const oreRolls = [0.5, 0.5, 0.99, 0.99, 0.99, 0.99];
  const oreIngot = mine(oreRun, () => oreRolls.shift() ?? 0.99);
  const oreReturn = returnToSurface(oreIngot.player);

  assert.equal(goldBlock.kind, "goldBlock");
  assert.equal(goldBlock.player.goldBlock, 1);
  assert.equal(goldReturn.player.gold, 2);
  assert.equal(oreIngot.kind, "oreIngot");
  assert.equal(oreIngot.player.oreIngot, 2);
  assert.equal(oreReturn.player.gold, 24);
});

test("火龍十字鎬的大爆炸會扣一滴血", () => {
  const start = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"] },
    "fireDragonPickaxe"
  ).player;
  const rolls = [0.95, 0];
  const result = mine(start, () => rolls.shift() ?? 0, 1000);

  assert.equal(result.kind, "bomb");
  assert.equal(result.player.bombs, 1);
  assert.equal(result.player.dead, false);
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
  const dead = mine({ ...ore, bombs: 1.5 }, () => 0.95, 1000);

  assert.equal(ore.ore, 4);
  assert.equal(dead.player.dead, true);
  assert.equal(dead.player.gold, 10);
});

test("安全血量會讓生命增加二", () => {
  const start = chooseRunMode(createPlayer(), "safe").player;
  const first = mine(start, () => 0.95, 1000).player;
  const second = mine(first, () => 0.95, 2000).player;
  const third = mine(second, () => 0.95, 3000).player;

  assert.equal(third.bombs, 1.5);
  assert.equal(third.dead, false);
});

test("每五層可以三選二小詞條", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 5,
    minorBuffOptions: ["gold", "bomb", "bag"]
  };
  const first = chooseMinorBuff(player, "gold");
  const result = chooseMinorBuff(first.player, "bag");

  assert.equal(result.ok, true);
  assert.equal(result.player.minorBuffs.gold, 1);
  assert.equal(result.player.minorBuffs.bag, 1);
  assert.equal(result.player.nextBuffDepth, 10);
});

test("小詞條選項會先排除已達上限的普通詞條", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 4,
    minorBuffs: {
      ...createPlayer().minorBuffs,
      gold: 5,
      bomb: 5,
      bag: 5,
      ore: 5,
      sustain: 3,
      luck: 5,
      event: 0,
      reverse: 0
    }
  };
  const refreshed = mine({ ...player, forcedNextResult: "empty" }, () => 0.99).player;
  const options = getMinorBuffOptions(refreshed).map((buff) => buff.id);

  assert.equal(isSelectableMiniTrait(refreshed, "gold"), false);
  assert.equal(options.includes("gold"), false);
  assert.equal(options.every((id) => ["event", "reverse"].includes(id)), true);
});

test("所有小詞條達上限後會進入突破模式並套用遞減成長", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 4,
    minorBuffs: {
      gold: 5,
      bomb: 5,
      bag: 5,
      ore: 5,
      sustain: 3,
      luck: 5,
      event: 5,
      reverse: 5
    }
  };
  const refreshed = mine({ ...player, forcedNextResult: "empty" }, () => 0.99).player;
  const options = getMinorBuffOptions(refreshed);
  const first = chooseMinorBuff(refreshed, options[0].id);

  assert.equal(isMiniTraitBreakthroughMode(refreshed), true);
  assert.equal(options.every((buff) => buff.breakthrough), true);
  assert.equal(first.ok, true);
  assert.match(first.message, /突破/);
  assert.equal(first.player.minorBuffs[options[0].id], 6);
  assert.ok(getMinorBuffEffectiveStacks(first.player, options[0].id) < 6);
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

test("微光池會消耗金幣和自選紀念幣並轉換成隨機紀念幣", () => {
  const result = shimmerCollectible(
    { ...createPlayer(), gold: 500, collection: { nina_hot_water: 1 } },
    "nina_hot_water",
    () => 0
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 100);
  assert.equal(result.player.collection.nina_hot_water, undefined);
  assert.equal(result.award.id, "meijiang_done");
  assert.equal(result.player.collection.meijiang_done, 1);
});

test("微光池需要金幣和持有的紀念幣且只能在地表使用", () => {
  const poor = shimmerCollectible(
    { ...createPlayer(), gold: 399, collection: { nina_hot_water: 1 } },
    "nina_hot_water"
  );
  const missing = shimmerCollectible({ ...createPlayer(), gold: 500 }, "nina_hot_water");
  const inMine = shimmerCollectible(
    { ...createPlayer(), gold: 500, runMode: "safe", collection: { nina_hot_water: 1 } },
    "nina_hot_water"
  );

  assert.equal(poor.ok, false);
  assert.match(poor.message, /400 金幣/);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /沒有/);
  assert.equal(inMine.ok, false);
  assert.match(inMine.message, /地表/);
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

test("治療藥水每天每人限購十瓶", () => {
  const now = Date.UTC(2026, 4, 6, 1);
  const first = buyShopItem({ ...createPlayer(), gold: 1000 }, "healingPotion", 10, {
    healingPotionUnlocked: true,
    now
  });
  const second = buyShopItem({ ...first.player, gold: 100 }, "healingPotion", 1, {
    healingPotionUnlocked: true,
    now
  });
  const nextDay = buyShopItem({ ...first.player, gold: 100 }, "healingPotion", 1, {
    healingPotionUnlocked: true,
    now: now + 24 * 60 * 60 * 1000
  });

  assert.equal(first.ok, true);
  assert.equal(first.player.healingPotion, 10);
  assert.equal(first.player.potionPurchasesToday, 10);
  assert.equal(second.ok, false);
  assert.match(second.message, /上限/);
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.player.potionPurchasesToday, 1);
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

test("治療藥水使用後需要等待層數冷卻", () => {
  const player = {
    ...chooseRunMode({ ...createPlayer(), runModeOptions: ["safe", "double"], healingPotion: 2 }, "safe").player,
    bombs: 1
  };
  const first = drinkHealingPotion(player);
  const blocked = drinkHealingPotion({ ...first.player, bombs: 1 });
  const cooled = mine({ ...first.player, forcedNextResult: "empty" }, () => 0.99);

  assert.equal(first.ok, true);
  assert.equal(first.player.potionCooldown, 4);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /剩餘冷卻/);
  assert.equal(cooled.player.potionCooldown, 3);
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
  const result = mine({ ...start, bombs: 3.5 }, () => 0.95, 1000);

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

test("可以交易治療藥水且會檢查數量", () => {
  const result = transferHealingPotion(
    { ...createPlayer(), healingPotion: 3 },
    createPlayer(),
    2
  );
  const fail = transferHealingPotion(
    { ...createPlayer(), healingPotion: 1 },
    createPlayer(),
    2
  );

  assert.equal(result.ok, true);
  assert.equal(result.from.healingPotion, 1);
  assert.equal(result.to.healingPotion, 2);
  assert.equal(fail.ok, false);
  assert.match(fail.message, /不足/);
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
  assert.equal(result.player.bombs, 0.5);
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

test("其他玩家可以免費救援並取得下次下礦小詞條", () => {
  const result = rescuePlayer(
    { ...createPlayer(), gold: 20 },
    { ...createPlayer(), dead: true, bombs: 2, ore: 3, rusty: 1, runMode: "double" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.rescuer.gold, 20);
  assert.equal(result.rescuer.rescueBonusCount, 1);
  assert.equal(result.target.dead, false);
  assert.equal(result.target.bombs, 0);
  assert.equal(result.target.ore, 0);
  assert.equal(result.target.rusty, 0);
  assert.equal(result.target.runMode, null);
});

test("三分鐘內救援會退回死亡損失金幣", () => {
  const dead = mine(
    { ...createPlayer(), gold: 90, bombs: 1.5, runMode: "double" },
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
    { ...createPlayer(), gold: 90, bombs: 1.5, runMode: "double" },
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

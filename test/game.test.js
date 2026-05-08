"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buyShopItem,
  buySupplyStationItem,
  buyUndergroundInnItem,
  canChooseMinorBuff,
  chooseMinorBuff,
  chooseRunMode,
  createPlayer,
  depositBank,
  discardItem,
  eatMagicCandy,
  ensureRunModeOptions,
  exchange,
  getBagCapacity,
  getCollectionTotal,
  getBagUsedSlots,
  getChickenMiningBonus,
  getCommunityProgress,
  getDiscardableItems,
  getDigPathOptions,
  getElevatorCost,
  getMagicCandyPrice,
  getUndergroundInnSnapshot,
  getMinorBuffEffectiveStacks,
  getMinorBuffOptions,
  getRandomEvents,
  getRunModeOptions,
  getSupplyStationView,
  isMiniTraitBreakthroughMode,
  isSelectableMiniTrait,
  leaveSupplyStation,
  mine,
  openUndergroundInn,
  drinkHealingPotion,
  removeRust,
  repairPlayerState,
  rerollRunModeOptions,
  resolveEventChallenge,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  setUiMode,
  sellSupplyStationBuff,
  shimmerCollectible,
  tradeSkyUnknownLife,
  transferHealingPotion,
  transferConsumable,
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
  advanceEventTypeMissCounters,
  getEventTypePityWeight,
  pickRandomEvent,
  recordEventTypeEncounter
} = require("../src/eventSystem");
const {
  buildBankComponents,
  buildPanelComponents,
  buildPanelEmbed,
  buildShopEmbed,
  buildShopComponents,
  CUSTOM_IDS
} = require("../src/ui");
const {
  buildDeveloperPanelEmbed,
  getTaiwanDateKey,
  recordAnalyticsOnPlayers
} = require("../src/analyticsSystem");

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
  assert.match(value, /路線：/);
  assert.doesNotMatch(value, /📦 資源/);
  assert.doesNotMatch(value, /🎒 包包（/);
});

test("養成雞會顯示同行並提供挖礦加成", () => {
  const player = chooseRunMode({
    ...createPlayer(),
    ownedChicken: {
      name: "阿咕霸王",
      icon: "🐓",
      level: 16,
      personalityId: "chosen"
    }
  }, "safe").player;
  const bonus = getChickenMiningBonus(player);
  const embed = buildPanelEmbed(player, "礦場面板", "", null, "main").toJSON();
  const value = embed.fields[0].value;

  assert.equal(bonus.goldMultiplierBonus, 0.08);
  assert.equal(bonus.oreMultiplierBonus, 0.08);
  assert.equal(bonus.critChanceBonus, 0.03);
  assert.equal(bonus.eventChanceBonus, 0.04);
  assert.match(value, /同行雞：🐓 阿咕霸王 Lv\.16｜完全體/);
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

test("事件等待選擇時礦場面板不會塞入過多操作列", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "lost_backpack",
    healingPotion: 3,
    rusty: 2,
    chargeValue: 100,
    ore: 2,
    minorBuffOptions: ["gold", "bomb", "bag"]
  };
  const rows = buildPanelComponents("user-1", player, {}, "main").map((row) => row.toJSON());
  const customIds = rows.flatMap((row) => row.components.map((component) => component.custom_id));

  assert.equal(rows.length <= 5, true);
  assert.equal(customIds.includes(CUSTOM_IDS.eventRisk), true);
  assert.equal(customIds.includes(CUSTOM_IDS.mine), false);
  assert.equal(customIds.includes(CUSTOM_IDS.rustOne), false);
  assert.equal(customIds.includes(CUSTOM_IDS.discardItem), false);
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
  assert.match(value, /路線：\n/);
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
  const startRolls = [0.5, 0.5, 0, 0];
  const start = chooseRunMode(createPlayer(), "safe", () => startRolls.shift() ?? 0);

  assert.equal(start.ok, true);
  assert.deepEqual(getDigPathOptions(start.player).map((path) => path.id), ["steady", "greedy"]);

  const mineRolls = [0, 0.99, 0.45, 0.5];
  const result = mine(start.player, () => mineRolls.shift() ?? 0.99, 1000, "left");

  assert.equal(result.kind, "gold");
  assert.ok(getDigPathOptions(result.player).length >= 1);
  assert.ok(getDigPathOptions(result.player).length <= 3);
});

test("路線每次會隨機出現一到三條", () => {
  const one = chooseRunMode(createPlayer(), "safe", (() => {
    const rolls = [0.5, 0, 0];
    return () => rolls.shift() ?? 0;
  })()).player;
  const three = chooseRunMode(createPlayer(), "safe", (() => {
    const rolls = [0.5, 0.99, 0, 0, 0];
    return () => rolls.shift() ?? 0;
  })()).player;

  assert.equal(getDigPathOptions(one).length, 1);
  assert.equal(getDigPathOptions(three).length, 3);
});

test("坑洞路線會跳層給獎勵並扣血", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    digPathOptions: { middle: "coinPit" }
  };
  const result = mine(player, () => 0, 1000, "middle");

  assert.equal(result.kind, "gold");
  assert.equal(result.player.depth, 2);
  assert.equal(result.player.bombs, 0.5);
  assert.ok(result.player.gold > 0);
  assert.match(result.message, /金光坑洞/);
});

test("厚底鞋會抵擋一次坑洞墜落傷害且不能和藥水共存", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    digPathOptions: { middle: "coinPit" },
    thickSoleShoes: 1
  };
  const result = mine(player, () => 0, 1000, "middle");
  const potionBlocked = buyShopItem(
    { ...createPlayer(), gold: 100, thickSoleShoes: 1 },
    "healingPotion",
    1,
    { healingPotionUnlocked: true }
  );

  assert.equal(result.kind, "gold");
  assert.equal(result.player.bombs, 0);
  assert.equal(result.player.thickSoleShoes, 0);
  assert.match(result.message, /厚底鞋/);
  assert.equal(potionBlocked.ok, false);
  assert.match(potionBlocked.message, /無法同時攜帶/);
});

test("進入礦洞有小機率掉進寶石礦洞", () => {
  const result = chooseRunMode(createPlayer(), "safe", () => 0);

  assert.equal(result.ok, true);
  assert.equal(result.player.caveType, "gem");
  assert.match(result.message, /寶石礦洞/);
});

test("地下客棧寶石洞入場券會讓下次下礦必進寶石洞", () => {
  const now = Date.parse("2026-05-08T04:00:00.000Z");
  const player = {
    ...createPlayer(),
    zone: "undergroundCamp",
    invertedOre: 999,
    runModeOptions: ["safe", "double"]
  };
  const bought = buyUndergroundInnItem(player, "gemTicket", createGlobalState(now), now);
  const next = chooseRunMode({ ...bought.player, zone: "surface" }, "safe", () => 0.99);

  assert.equal(bought.ok, true);
  assert.equal(bought.player.guaranteedGemCaveTicket, 1);
  assert.equal(next.player.caveType, "gem");
  assert.equal(next.player.guaranteedGemCaveTicket, 0);
});

test("可以丟棄多種可攜帶物品並阻擋破爛", () => {
  const first = discardItem(
    { ...createPlayer(), rusty: 2, ore: 5, redGem: 2, junk: 1, collection: { nina_hot_water: 2 } },
    "ore",
    3
  );

  assert.equal(first.ok, true);
  assert.equal(first.player.ore, 2);

  const second = discardItem(first.player, "redGem", 1);
  assert.equal(second.ok, true);
  assert.equal(second.player.redGem, 1);

  const third = discardItem(second.player, "nina_hot_water", 2);
  assert.equal(third.ok, true);
  assert.equal(third.player.collection.nina_hot_water, undefined);

  const sticky = discardItem(third.player, "junk", 1);
  assert.equal(sticky.ok, false);
  assert.match(sticky.message, /黏在/);

  const list = getDiscardableItems({ ...third.player, rusty: 1, bombItem: 1 });
  assert.equal(list.some((item) => item.id === "rusty"), true);
  assert.equal(list.some((item) => item.id === "bombItem"), true);
  assert.equal(list.some((item) => item.id === "junk"), false);
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

test("玩家修復會清除不存在的事件並重建詞條選項", () => {
  const result = repairPlayerState({
    ...createPlayer(),
    pendingEvent: "missing_old_event",
    runModeOptions: [],
    gold: "12",
    digPathOptions: { left: "missing_path", right: "steady" }
  }, () => 0);

  assert.equal(result.player.pendingEvent, null);
  assert.equal(result.player.gold, 12);
  assert.equal(result.player.runModeOptions.length, 2);
  assert.deepEqual(result.player.digPathOptions, { right: "steady" });
  assert.match(result.message, /已修復/);
});

test("管理員修復會清除合法但卡住的事件狀態", () => {
  const stuck = {
    ...createPlayer(),
    pendingEvent: "cracked_wall",
    memoryChallenge: { options: { a: "x" }, correctChoice: "a" }
  };
  const normalRepair = repairPlayerState(stuck, () => 0);
  const adminRepair = repairPlayerState(stuck, () => 0, { clearBlockingState: true });

  assert.equal(normalRepair.player.pendingEvent, "cracked_wall");
  assert.equal(adminRepair.player.pendingEvent, null);
  assert.equal(adminRepair.player.memoryChallenge, null);
  assert.match(adminRepair.message, /清除卡住的事件/);
});

test("管理員修復會清除卡住的小詞條選擇", () => {
  const stuck = {
    ...createPlayer(),
    runMode: "eventBody",
    depth: 20,
    runDepthProgress: 20,
    minorBuffOptions: ["gold", "bomb", "bag"],
    minorBuffSelections: ["gold"]
  };
  const normalRepair = repairPlayerState(stuck, () => 0);
  const adminRepair = repairPlayerState(stuck, () => 0, { clearBlockingState: true });

  assert.equal(normalRepair.player.minorBuffOptions.length, 3);
  assert.deepEqual(adminRepair.player.minorBuffOptions, []);
  assert.deepEqual(adminRepair.player.minorBuffSelections, []);
  assert.match(adminRepair.message, /清除卡住的小詞條選擇/);
});

test("玩家修復會把地表但仍在挖礦的狀態修回礦坑", () => {
  const result = repairPlayerState({
    ...createPlayer(),
    zone: "surface",
    caveType: "normal",
    runMode: "eventBody",
    depth: 20,
    runDepthProgress: 20
  }, () => 0);

  assert.equal(result.player.zone, "mine");
  assert.match(result.message, /修正礦坑區域狀態/);
});

test("事件與小詞條同層出現時會先處理事件避免卡住", () => {
  const player = {
    ...createPlayer(),
    runMode: "eventBody",
    depth: 24,
    nextEventDepth: 25,
    eventMissCount: 3,
    nextSupplyDepth: 25,
    forcedNextResult: "ore"
  };
  const result = mine(player, () => 0);

  assert.ok(result.player.pendingEvent);
  assert.equal(result.player.supplyStation, null);
  assert.equal(canChooseMinorBuff(result.player), false);

  const resolved = resolveRandomEvent({
    ...result.player,
    pendingEvent: "lost_backpack",
    depth: 25,
    nextSupplyDepth: 25
  }, "safe");
  assert.equal(resolved.player.pendingEvent, null);
  assert.equal(resolved.player.supplyStation, null);
});

test("QTE 炸彈拆除會建立限時互動並依答案結算", () => {
  const player = {
    ...createPlayer(),
    pendingEvent: "qte_bomb_defuse",
    eventChallenge: {
      eventId: "qte_bomb_defuse",
      type: "wire",
      correctChoice: "blue",
      choices: [
        { id: "red", label: "紅線" },
        { id: "blue", label: "藍線" },
        { id: "yellow", label: "黃線" }
      ],
      startedAt: 1000,
      expiresAt: 9000
    }
  };

  const success = resolveEventChallenge(player, "blue", () => 0, 2000);
  assert.equal(success.player.pendingEvent, null);
  assert.equal(success.player.eventChallenge, null);
  assert.equal(success.player.bombItem, 1);

  const failed = resolveEventChallenge(player, "red", () => 0, 2000);
  assert.equal(failed.player.pendingEvent, null);
  assert.equal(failed.player.bombs, 0.5);
});

test("QTE 事件面板會顯示專用互動按鈕", () => {
  const player = {
    ...createPlayer(),
    pendingEvent: "qte_bomb_defuse",
    eventChallenge: {
      eventId: "qte_bomb_defuse",
      type: "wire",
      correctChoice: "blue",
      choices: [
        { id: "red", label: "紅線" },
        { id: "blue", label: "藍線" },
        { id: "yellow", label: "黃線" }
      ],
      startedAt: 1000,
      expiresAt: 9000
    }
  };
  const rows = buildPanelComponents("user-1", player, {}, "main").map((row) => row.toJSON());
  const customIds = rows.flatMap((row) => row.components.map((component) => component.custom_id));

  assert.equal(customIds.includes(`${CUSTOM_IDS.eventQtePrefix}:blue`), true);
  assert.equal(customIds.includes(CUSTOM_IDS.eventRisk), false);
});

test("強制撤離 QTE 成功可避免回營地", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    zone: "mine",
    depth: 60,
    runDepthProgress: 60,
    pendingEvent: "mine_collapse_evacuation",
    eventChallenge: {
      eventId: "mine_collapse_evacuation",
      type: "evacuation",
      correctChoice: "brace",
      choices: [
        { id: "brace", label: "抓岩釘" },
        { id: "dash", label: "衝過去" },
        { id: "crawl", label: "貼地爬" }
      ],
      startedAt: 1000,
      expiresAt: 7000
    }
  };

  const result = resolveEventChallenge(player, "brace", () => 0, 2000);

  assert.equal(result.ok, true);
  assert.equal(result.player.zone, "mine");
  assert.equal(result.player.depth, 60);
  assert.equal(result.player.pendingEvent, null);
  assert.equal(result.player.eventChallenge, null);
  assert.match(result.message, /不用撤回營地/);
});

test("強制撤離 QTE 失敗才會送回營地", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    zone: "mine",
    depth: 60,
    runDepthProgress: 60,
    ore: 2,
    pendingEvent: "mine_collapse_evacuation",
    eventChallenge: {
      eventId: "mine_collapse_evacuation",
      type: "evacuation",
      correctChoice: "brace",
      choices: [
        { id: "brace", label: "抓岩釘" },
        { id: "dash", label: "衝過去" },
        { id: "crawl", label: "貼地爬" }
      ],
      startedAt: 1000,
      expiresAt: 7000
    }
  };

  const result = resolveEventChallenge(player, "dash", () => 0, 2000);

  assert.equal(result.ok, true);
  assert.equal(result.player.zone, "surface");
  assert.equal(result.player.depth, 0);
  assert.match(result.message, /反應慢了一拍/);
  assert.match(result.message, /撤離/);
});

test("開鎖事件會依角度與耐久判定", () => {
  const player = {
    ...createPlayer(),
    pendingEvent: "lockpick_ancient_vault",
    eventChallenge: {
      eventId: "lockpick_ancient_vault",
      type: "lockpick",
      correctChoice: "unlock",
      choices: [
        { id: "left", label: "左轉" },
        { id: "right", label: "右轉" },
        { id: "unlock", label: "嘗試開鎖" }
      ],
      startedAt: 1000,
      expiresAt: 13000,
      durability: 2,
      angle: 90,
      targetAngle: 90,
      tolerance: 10
    }
  };

  const opened = resolveEventChallenge(player, "unlock", () => 0.5, 2000);
  assert.equal(opened.player.pendingEvent, null);
  assert.match(opened.message, /金庫打開/);

  const missed = resolveEventChallenge({
    ...player,
    eventChallenge: {
      ...player.eventChallenge,
      angle: 0,
      targetAngle: 180,
      durability: 1
    }
  }, "unlock", () => 0, 2000);
  assert.equal(missed.player.eventChallenge, null);
  assert.equal(missed.player.bombs, 0.5);
});

test("補給站出現時礦場面板只顯示補給站操作避免按鈕列爆量", () => {
  const player = {
    ...createPlayer(),
    zone: "mine",
    caveType: "normal",
    runMode: "eventBody",
    depth: 25,
    nextSupplyDepth: 25,
    ore: 8,
    chargeValue: 100,
    supplyStation: {
      id: "station-test",
      depth: 25,
      region: "normal",
      variant: "normal",
      items: [
        { id: "potion", type: "potion", label: "治療藥水", price: 120, stock: 1 },
        { id: "buff_gold", type: "buff", buff: "gold", label: "小型淘金", price: 600, stock: 1 }
      ],
      sellOffers: []
    }
  };
  const rows = buildPanelComponents("user-1", player, {}, "main").map((row) => row.toJSON());
  const customIds = rows.flatMap((row) => row.components.map((component) => component.custom_id));

  assert.equal(rows.length <= 3, true);
  assert.equal(customIds.some((id) => id && id.startsWith(CUSTOM_IDS.supplyBuyPrefix)), true);
  assert.equal(customIds.includes(CUSTOM_IDS.supplyLeave), true);
  assert.equal(customIds.includes(CUSTOM_IDS.discardItem), false);
  assert.equal(customIds.some((id) => id && id.startsWith(CUSTOM_IDS.chargePrefix)), false);
});

test("玩家修復會封頂天文數字避免下礦計算壞掉", () => {
  const result = repairPlayerState({
    ...createPlayer(),
    gold: Number.MAX_VALUE,
    bankGold: 9e30,
    healingPotion: -10,
    challenge: {
      active: true,
      challengeGold: 9e30
    }
  }, () => 0);

  assert.equal(result.player.gold, 1_000_000_000_000);
  assert.equal(result.player.bankGold, 1_000_000_000_000);
  assert.equal(result.player.healingPotion, 0);
  assert.equal(result.player.challenge.challengeGold, 1_000_000_000_000);
  assert.match(result.message, /封頂異常數值/);
});

test("玩家修復會整理挑戰背包雞與暫時效果資料", () => {
  const result = repairPlayerState({
    ...createPlayer(),
    zone: "???",
    uiMode: "tiny",
    dead: "yes",
    deathAt: "bad",
    forcedNextResult: "broken",
    collection: { coin: "5", bad: -3 },
    undergroundStorage: { ore: "7", healingPotion: -2 },
    tempEffects: [{ id: "ancient_curse", remaining: "2" }, { id: "", remaining: 5 }],
    runRewardStats: { baseReward: "10", critBonus: Number.POSITIVE_INFINITY },
    challenge: {
      active: true,
      challengeGold: "999",
      depth: "12",
      hp: 99,
      maxHp: 3,
      potions: -5,
      trait: "missing_trait",
      items: { orichalcum: "4" },
      miniTraits: { gold: "2" }
    },
    ownedChicken: {
      name: "超級無敵長長長長長名字",
      speed: 999,
      sprint: -5,
      stability: "8",
      stamina: Number.NaN,
      level: "3",
      exp: "40",
      raceStatBoost: 999,
      titles: ["a", "b"]
    }
  });

  assert.equal(result.player.zone, "surface");
  assert.equal(result.player.uiMode, "full");
  assert.equal(Number.isFinite(result.player.deathAt), true);
  assert.equal(result.player.forcedNextResult, null);
  assert.equal(result.player.collection.coin, 5);
  assert.equal(result.player.collection.bad, 0);
  assert.equal(result.player.undergroundStorage.ore, 7);
  assert.equal(result.player.undergroundStorage.healingPotion, 0);
  assert.equal(result.player.tempEffects.length, 1);
  assert.equal(result.player.runRewardStats.baseReward, 10);
  assert.equal(result.player.runRewardStats.critBonus, 0);
  assert.equal(result.player.challenge.hp, 3);
  assert.equal(result.player.challenge.potions, 0);
  assert.equal(result.player.challenge.trait, null);
  assert.equal(result.player.challenge.items.orichalcum, 4);
  assert.equal(result.player.ownedChicken.speed, 20);
  assert.equal(result.player.ownedChicken.raceStatBoost, 15);
  assert.match(result.message, /已修復/);
});

test("挖礦會自動修復不存在的 pendingEvent 不再卡住", () => {
  const result = mine({
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "missing_old_event"
  }, () => 0);

  assert.notEqual(result.kind, "blocked");
  assert.equal(result.player.pendingEvent, null);
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

test("破損升降機不會把深度移到非法狀態", () => {
  const shallow = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 1,
    pendingEvent: "broken_lift"
  }, "risk", () => 0.99, 1000);
  const deep = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 99,
    runDepthProgress: 99,
    pendingEvent: "broken_lift"
  }, "risk", () => 0, 1000);

  assert.equal(shallow.player.depth, 1);
  assert.equal(shallow.player.zone, "mine");
  assert.equal(deep.player.depth, 100);
  assert.equal(deep.player.zone, "lavaPool");
  assert.match(deep.message, /岩漿池/);
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

test("野生賽雞短跑挑戰成功會給掉落並影響進化", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 25,
    pendingEvent: "wild_mine_chicken",
    ownedChicken: {
      name: "阿咕霸王",
      icon: "🐔",
      level: 3,
      exp: 0,
      speed: 5,
      sprint: 20,
      stability: 5,
      stamina: 5,
      wins: 0,
      races: 0,
      evolutionPoints: {}
    }
  };
  const rolls = [0.9, 0.1, 0.1, 0.1, 0.99, 0.99, 0.99];
  const result = resolveRandomEvent(player, "risk", () => rolls.shift() ?? 0);

  assert.equal(result.ok, true);
  assert.equal(result.player.ownedChicken.name, "阿咕霸王");
  assert.equal(result.player.ownedChicken.races, 1);
  assert.equal(result.player.ownedChicken.wins, 1);
  assert.equal(result.player.gold > 0, true);
  assert.equal(result.player.wildChickenInfluence.shallow, 2);
  assert.match(result.message, /短距離對決/);
  assert.match(result.message, /EXP \+120/);
  assert.equal(Array.isArray(result.animationFrames), true);
  assert.equal(result.animationFrames.length > 1, true);
  assert.match(result.animationFrames[0], /礦坑臨時賽道/);
});

test("野生賽雞掉落小機率獎勵是神奇糖果不是飼料", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 25,
    pendingEvent: "wild_mine_chicken",
    ownedChicken: {
      name: "阿咕霸王",
      icon: "🐔",
      level: 3,
      exp: 0,
      speed: 20,
      sprint: 20,
      stability: 20,
      stamina: 20,
      wins: 0,
      races: 0,
      evolutionPoints: {}
    }
  };
  const result = resolveRandomEvent(player, "risk", () => 0.1);

  assert.equal(result.player.magicCandy, 1);
  assert.equal(result.player.gourmetFeed, 0);
  assert.match(result.message, /神奇糖果 \+1/);
});

test("野生賽雞餵食可能留下雞蛋與稀有公告", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: -30,
    zone: "upward",
    pendingEvent: "wild_mine_chicken",
    gourmetFeed: 1
  };
  const rolls = [0.01, 0.1, 0.1, 0.1, 0.99, 0.1, 0.99, 0.99];
  const result = resolveRandomEvent(player, "extreme", () => rolls.shift() ?? 0);

  assert.equal(result.ok, true);
  assert.equal(result.player.gourmetFeed, 0);
  assert.equal(result.player.chickenEggs, 1);
  assert.match(result.message, /雞蛋/);
  assert.match(result.announcement, /傳說中的/);
});

test("礦坑抓雞烤掉自己的雞需要二次確認", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "wild_mine_chicken",
    wildChickenEncounter: {
      id: "wild-1",
      name: "深層黑羽雞",
      icon: "🐓",
      region: "underground",
      trait: "thief",
      rare: false,
      power: 23
    },
    ownedChicken: {
      name: "阿咕霸王",
      icon: "🐔",
      level: 4,
      exp: 0,
      speed: 8,
      sprint: 8,
      stability: 8,
      stamina: 8,
      wins: 3,
      races: 5
    }
  };

  const warning = resolveRandomEvent(player, "extreme", () => 0.99);
  const captured = resolveRandomEvent(warning.player, "extreme", () => 0);

  assert.equal(warning.player.ownedChicken.name, "阿咕霸王");
  assert.equal(warning.player.pendingEvent, "wild_mine_chicken");
  assert.equal(warning.player.wildChickenEncounter.captureConfirm, true);
  assert.match(warning.message, /再按一次/);
  assert.equal(captured.player.ownedChicken.name, "深層黑羽雞");
  assert.equal(captured.player.ownedChicken.level >= 5, true);
  assert.equal(captured.player.chickenRoastHpBonus, 1);
  assert.equal(captured.player.pendingEvent, null);
  assert.match(captured.message, /捕捉成功/);
});

test("野生賽雞有飼料時餵食不會直接烤掉並換雞", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "wild_mine_chicken",
    gourmetFeed: 1,
    wildChickenEncounter: {
      id: "wild-feed-1",
      name: "深層黑羽雞",
      icon: "🐓",
      region: "underground",
      trait: "thief",
      rare: false,
      power: 23
    },
    ownedChicken: {
      name: "阿咕霸王",
      icon: "🐔",
      level: 4,
      exp: 0,
      speed: 8,
      sprint: 8,
      stability: 8,
      stamina: 8,
      wins: 3,
      races: 5
    }
  };

  const rolls = [0.1, 0.5, 0.5, 0.5, 0.5];
  const result = resolveRandomEvent(player, "extreme", () => rolls.shift() ?? 0.5);

  assert.equal(result.player.ownedChicken.name, "阿咕霸王");
  assert.equal(result.player.gourmetFeed, 0);
  assert.equal(result.player.chickenRoastHpBonus, 0);
  assert.match(result.message, /吃下飼料/);
});

test("先跑贏野生雞後捕捉率提高並保留捕捉機會", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "wild_mine_chicken",
    wildChickenEncounter: {
      id: "wild-race-1",
      name: "深層黑羽雞",
      icon: "🐓",
      region: "underground",
      trait: "thief",
      rare: false,
      power: 32
    },
    ownedChicken: {
      name: "阿咕霸王",
      icon: "🐔",
      level: 2,
      exp: 0,
      speed: 20,
      sprint: 20,
      stability: 20,
      stamina: 20,
      wins: 3,
      races: 5
    }
  };

  const race = resolveRandomEvent(player, "risk", () => 0.99);
  const warning = resolveRandomEvent(race.player, "extreme", () => 0.99);
  const captured = resolveRandomEvent(warning.player, "extreme", () => 0.2);

  assert.equal(race.player.pendingEvent, "wild_mine_chicken");
  assert.equal(race.player.wildChickenEncounter.raceWeakened, true);
  assert.match(race.message, /現在捕捉率/);
  assert.match(warning.message, /短跑後/);
  assert.equal(captured.player.ownedChicken.name, "深層黑羽雞");
});

test("地下客棧先機球可無視等級差靠賽捕捉野生雞", () => {
  const now = Date.parse("2026-05-08T04:00:00.000Z");
  const bought = buyUndergroundInnItem({
    ...createPlayer(),
    zone: "undergroundCamp",
    invertedGem: 999
  }, "quickChickenBall", createGlobalState(now), now);
  const player = {
    ...bought.player,
    zone: "mine",
    pendingEvent: "wild_mine_chicken",
    wildChickenEncounter: {
      id: "wild-ball-1",
      name: "雷鳴雞",
      icon: "⚡",
      region: "inverted",
      trait: "thunder",
      rare: true,
      power: 44,
      captureConfirm: true
    },
    ownedChicken: {
      name: "低等咕",
      icon: "🐔",
      level: 1,
      exp: 0,
      speed: 5,
      sprint: 5,
      stability: 5,
      stamina: 5,
      wins: 0,
      races: 1
    }
  };

  const result = resolveRandomEvent(player, "extreme", () => 0.3);

  assert.equal(bought.ok, true);
  assert.equal(bought.player.quickChickenBall, 1);
  assert.equal(result.player.quickChickenBall, 0);
  assert.equal(result.player.ownedChicken.name, "雷鳴雞");
  assert.match(result.message, /先機球/);
});

test("強制撤離事件只在普通挖礦流程中把玩家送回營地", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    zone: "mine",
    depth: 60,
    runDepthProgress: 60,
    ore: 2,
    pendingEvent: "mine_collapse_evacuation"
  };
  const result = resolveRandomEvent(player, "safe", () => 0.99);

  assert.equal(result.ok, true);
  assert.equal(result.player.zone, "surface");
  assert.equal(result.player.depth, 0);
  assert.match(result.message, /撤離/);
});

test("強制撤離事件需要足夠深度才會進事件池", () => {
  const shallow = pickRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, zone: "mine", depth: 10 },
    () => 0,
    (id) => id === "mine_collapse_evacuation"
  );
  const deep = pickRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, zone: "mine", depth: 60 },
    () => 0,
    (id) => id === "mine_collapse_evacuation"
  );

  assert.equal(shallow == null, true);
  assert.equal(deep, "mine_collapse_evacuation");
});

test("詞條交換事件可以重組目前 build", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "trait_swap_merchant",
    traitSwapEvent: {
      eventId: "trait_swap_merchant",
      offeredTrait: "goldRush",
      mutation: "fusion"
    }
  };
  const swapped = resolveRandomEvent(player, "risk", () => 0.99);
  const mutated = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "trait_swap_merchant",
    traitSwapEvent: {
      eventId: "trait_swap_merchant",
      offeredTrait: "oreFocus",
      mutation: "fusion"
    }
  }, "extreme", () => 0.99);

  assert.equal(swapped.player.runMode, "goldRush");
  assert.equal(swapped.player.traitSwapEvent, null);
  assert.match(swapped.message, /換成 淘金熱/);
  assert.equal(mutated.player.runMode, "oreFocus");
  assert.equal(mutated.player.traitMutation.id, "fusion");
  assert.equal(mutated.player.minorBuffs.gold, 1);
});

test("地下與天空事件池會抽各自專屬事件", () => {
  const reverse = pickRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, zone: "upward", depth: -20 },
    () => 0,
    (id, event) => id === "qte_lava_jump" && event.reverseOnly
  );
  const sky = pickRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, zone: "skyDown", depth: -80 },
    () => 0,
    (id, event) => id === "qte_wind_balance" && event.skyOnly
  );
  const normalSkyLeak = pickRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, zone: "skyDown", depth: -80 },
    () => 0,
    (id) => id === "cracked_wall"
  );

  assert.equal(reverse, "qte_lava_jump");
  assert.equal(sky, "qte_wind_balance");
  assert.equal(normalSkyLeak == null, true);
});

test("地下與天空 QTE 成功會給區域獎勵", () => {
  const underground = resolveEventChallenge({
    ...chooseRunMode(createPlayer(), "safe").player,
    zone: "upward",
    depth: -40,
    pendingEvent: "qte_lava_jump",
    eventChallenge: {
      eventId: "qte_lava_jump",
      type: "underground",
      correctChoice: "black",
      choices: [
        { id: "black", label: "黑岩" },
        { id: "red", label: "紅岩" }
      ],
      startedAt: 1000,
      expiresAt: 6000
    }
  }, "black", () => 0, 2000);
  const sky = resolveEventChallenge({
    ...chooseRunMode(createPlayer(), "safe").player,
    zone: "skyDown",
    depth: -60,
    pendingEvent: "qte_wind_balance",
    eventChallenge: {
      eventId: "qte_wind_balance",
      type: "sky",
      correctChoice: "crouch",
      choices: [
        { id: "lean_left", label: "左傾" },
        { id: "crouch", label: "壓低" }
      ],
      startedAt: 1000,
      expiresAt: 5000
    }
  }, "crouch", () => 0, 2000);

  assert.equal(underground.player.invertedOre > 0, true);
  assert.match(underground.message, /地下機關/);
  assert.equal(sky.player.invertedGem > 0, true);
  assert.match(sky.message, /天域節奏/);
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

test("適合的礦洞事件有機率撿到神奇糖果", () => {
  const backpack = resolveRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, pendingEvent: "lost_backpack" },
    "risk",
    () => 0.7
  );
  const remains = resolveRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, pendingEvent: "miner_remains" },
    "risk",
    () => 0.55
  );
  const cache = resolveRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, pendingEvent: "lost_supply_cache" },
    "risk",
    () => 0.75
  );
  const chestRolls = [0.5, 0.99, 0.93];
  const chest = resolveRandomEvent(
    { ...chooseRunMode(createPlayer(), "safe").player, pendingEvent: "treasure_chest" },
    "risk",
    () => chestRolls.shift() ?? 0.99
  );

  assert.equal(backpack.player.magicCandy, 1);
  assert.equal(remains.player.magicCandy, 1);
  assert.equal(cache.player.magicCandy, 1);
  assert.equal(chest.player.magicCandy, 1);
  assert.match(`${backpack.message}${remains.message}${cache.message}${chest.message}`, /神奇糖果/);
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

test("地底客棧會顯示高價顛倒資源交易商品", () => {
  const globalState = createGlobalState(Date.parse("2026-05-08T04:00:00.000Z"));
  const result = openUndergroundInn({
    ...createPlayer(),
    zone: "undergroundCamp",
    invertedOre: 52,
    invertedGem: 18
  }, globalState, Date.parse("2026-05-08T04:00:00.000Z"));
  const snapshot = getUndergroundInnSnapshot(result.globalState, Date.parse("2026-05-08T04:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.match(result.message, /寶石洞入場券/);
  assert.match(result.message, /顛倒礦石：52/);
  assert.equal(snapshot.items.some((item) => item.id === "gemTicket" && item.price >= 34), true);
});

test("天界未知生命會收購顛倒礦物與寶石", () => {
  const result = tradeSkyUnknownLife({
    ...createPlayer(),
    zone: "skyCamp",
    gold: 50,
    invertedOre: 3,
    invertedGem: 2
  }, Date.parse("2026-05-08T04:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.player.invertedOre, 0);
  assert.equal(result.player.invertedGem, 0);
  assert.equal(result.player.gold, 1110);
  assert.match(result.message, /天界未知生命/);
  assert.match(result.message, /總獲得：1060/);
});

test("天域營地面板會顯示未知生命按鈕", () => {
  const rows = buildPanelComponents(null, {
    ...createPlayer(),
    zone: "skyCamp"
  });
  const customIds = rows.flatMap((row) => row.components.map((component) => component.data.custom_id));

  assert.equal(customIds.includes(CUSTOM_IDS.skyUnknownLife), true);
});

test("地下客棧祝福會限時提高收購價且同類不可重複", () => {
  const now = Date.parse("2026-05-08T04:00:00.000Z");
  const player = {
    ...createPlayer(),
    zone: "undergroundCamp",
    invertedGem: 999
  };
  const bought = buyUndergroundInnItem(player, "goldOreBlessing", createGlobalState(now), now);
  const blocked = buyUndergroundInnItem(bought.player, "goldOreBlessing", bought.globalState, now + 1000);
  const settlement = returnToSurface({
    ...bought.player,
    zone: "mine",
    depth: 20,
    runMode: "safe",
    goldOre: 1
  }, Math.random, bought.globalState, now + 1000);

  assert.equal(bought.ok, true);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /不能重複/);
  assert.equal(settlement.player.gold, 150);
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

test("商店介面將挖礦用品與養雞用品分開並限制稀有品單買", () => {
  const rows = buildShopComponents({
    healingPotionUnlocked: true,
    undyingTotemUnlocked: true
  }, createPlayer(), "player-1");
  const customIds = rows.flatMap((row) => row.components.map((component) => component.data.custom_id));

  assert.equal(rows.length <= 5, true);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyPrefix}:zhongkui_peace:1`), true);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyPrefix}:zhongkui_peace:5`), false);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyPrefix}:magicCandy:2`), false);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyCustomPrefix}:zhongkui_peace`), false);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyCustomPrefix}:healingPotion`), true);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyCustomPrefix}:undyingTotem`), true);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyPrefix}:normalFeed:1`), true);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyPrefix}:gourmetFeed:1`), true);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyPrefix}:chickenMedicine:1`), true);
  assert.equal(customIds.includes(`${CUSTOM_IDS.shopBuyPrefix}:autoCleaner:1`), true);
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

test("事件類型保底會提高久未出現類型並降低最近重複類型", () => {
  const basePlayer = {
    ...createPlayer(),
    runMode: "safe",
    eventTypeMissCounter: {
      ...createPlayer().eventTypeMissCounter,
      qte: 40,
      chest: 0
    },
    recentEventTypes: []
  };
  const qteBoosted = getEventTypePityWeight(1, "qte_bomb_defuse", { qte: { type: "wire" } }, basePlayer);
  const qteRecent = getEventTypePityWeight(1, "qte_bomb_defuse", { qte: { type: "wire" } }, {
    ...basePlayer,
    recentEventTypes: ["qte", "qte", "qte"]
  });
  const chestNormal = getEventTypePityWeight(1, "treasure_chest", {}, basePlayer);

  assert.equal(qteBoosted > chestNormal, true);
  assert.equal(qteRecent < qteBoosted, true);
});

test("事件類型保底遇到對應事件後只重置該類型", () => {
  const player = {
    ...createPlayer(),
    eventTypeMissCounter: {
      ...createPlayer().eventTypeMissCounter,
      qte: 12,
      chest: 18,
      wildChicken: 22
    }
  };
  advanceEventTypeMissCounters(player, 3);
  assert.equal(player.eventTypeMissCounter.qte, 15);
  recordEventTypeEncounter(player, "qte_bomb_defuse");

  assert.equal(player.eventTypeMissCounter.qte, 0);
  assert.equal(player.eventTypeMissCounter.chest, 21);
  assert.equal(player.eventTypeMissCounter.wildChicken, 25);
  assert.equal(player.recentEventTypes.includes("qte"), true);
});

test("事件池過大時保底類型有機會被權重拉出來但不是強制", () => {
  const player = {
    ...createPlayer(),
    runMode: "safe",
    depth: 50,
    eventTypeMissCounter: {
      ...createPlayer().eventTypeMissCounter,
      wildChicken: 80
    },
    recentEventTypes: []
  };
  const eventId = pickRandomEvent(player, () => 0.9999, (id) => id === "wild_mine_chicken" || id === "cracked_wall");

  assert.equal(["wild_mine_chicken", "cracked_wall"].includes(eventId), true);
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
  const skyCount = Object.values(events).filter((event) => event.skyOnly).length;

  assert.equal(normalIds.every((id) => events[id]), true);
  assert.equal(gemCount, 20);
  assert.equal(highCount, 20);
  assert.equal(reverseCount >= 24, true);
  assert.equal(skyCount >= 39, true);
  assert.equal(["sky_sun_mirror", "sky_cloud_whale", "sky_void_sunflower"].every((id) => events[id] && events[id].skyOnly), true);
  assert.equal(["sky_silver_chest", "sky_thunder_chest", "sky_mirage_chest", "sky_star_chest", "sky_feather_chest"].every((id) => events[id] && events[id].skyOnly), true);
});

test("天域新增普通事件與寶箱事件有各自獎勵", () => {
  const skyEvent = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    zone: "skyDown",
    depth: -80,
    pendingEvent: "sky_silent_choir"
  }, "extreme", () => 0.5, 1000);
  const chest = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    zone: "skyDown",
    depth: -80,
    pendingEvent: "sky_star_chest"
  }, "safe", () => 0.5, 1000);

  assert.equal(skyEvent.player.chargeValue >= 60, true);
  assert.match(skyEvent.message, /能量 \+60/);
  assert.equal(chest.player.chargeValue >= 25, true);
  assert.match(chest.message, /星光/);
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

test("寶箱可以開出養雞小紙條並記錄研究", () => {
  const rolls = [0.5, 0.99, 0.97, 0];
  const result = resolveRandomEvent({
    ...chooseRunMode(createPlayer(), "safe").player,
    pendingEvent: "treasure_chest"
  }, "risk", () => rolls.shift() ?? 0.99, 1000);

  assert.equal(result.player.chickenResearchNotes.blaze, 1);
  assert.match(result.message, /養雞|育成|紙條|筆記/);
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
  const start = chooseRunMode(createPlayer(), "safe", () => 0.5).player;
  const rolls = [0, 0, 0.99, 0.99, 0.99, 0.99, 0.05, 0.99, 0.99];
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

test("火龍十字鎬會增加包包並提高熔煉採集量", () => {
  const start = chooseRunMode(
    { ...createPlayer(), runModeOptions: ["fireDragonPickaxe", "safe"] },
    "fireDragonPickaxe"
  ).player;
  const rolls = [0.5, 0.5, 0.99, 0.99, 0.99, 0.99];
  const result = mine(start, () => rolls.shift() ?? 0.99);

  assert.equal(getBagCapacity(result.player), 18);
  assert.equal(result.kind, "oreIngot");
  assert.equal(result.player.oreIngot >= 2, true);
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

test("每二十五層會出現補給站並暫停挖礦", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 24,
    nextSupplyDepth: 25,
    nextEventDepth: 99,
    forcedNextResult: "empty"
  };
  const result = mine(player, () => 0.99);
  const blocked = mine(result.player, () => 0.99);
  const station = getSupplyStationView(result.player);

  assert.equal(Boolean(result.player.supplyStation), true);
  assert.equal(station.items.some((item) => item.type === "potion"), true);
  assert.equal(blocked.kind, "blocked");
  assert.match(blocked.message, /補給站/);
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

  assert.equal(isSelectableMiniTrait(player, "gold"), false);
  assert.equal(isSelectableMiniTrait(player, "event"), true);
  assert.equal(isSelectableMiniTrait(player, "reverse"), true);
});

test("補給站可以買藥水、購買突破小詞條並出售既有小詞條", () => {
  const player = {
    ...chooseRunMode(createPlayer(), "safe").player,
    depth: 25,
    gold: 3000,
    minorBuffs: {
      gold: 5,
      bomb: 5,
      bag: 5,
      ore: 5,
      sustain: 3,
      luck: 5,
      event: 5,
      reverse: 5
    },
    supplyStation: {
      id: "station-test",
      depth: 25,
      region: "normal",
      variant: "normal",
      items: [
        { id: "potion", type: "potion", label: "治療藥水", price: 120, stock: 1 },
        { id: "buff_gold", type: "buff", buff: "gold", label: "小型淘金", price: 800, stock: 1 }
      ],
      sellOffers: [
        { buff: "bomb", price: 450 }
      ]
    }
  };
  const potion = buySupplyStationItem(player, "potion");
  const buff = buySupplyStationItem(potion.player, "buff_gold");
  const sold = sellSupplyStationBuff(buff.player, "bomb");
  const left = leaveSupplyStation(sold.player);

  assert.equal(isMiniTraitBreakthroughMode(player), true);
  assert.equal(potion.player.healingPotion, 1);
  assert.equal(buff.player.minorBuffs.gold, 6);
  assert.ok(getMinorBuffEffectiveStacks(buff.player, "gold") < 6);
  assert.equal(sold.player.minorBuffs.bomb, 4);
  assert.equal(left.player.supplyStation, null);
  assert.equal(left.player.nextSupplyDepth, 50);
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

test("微光池會消耗兩枚紀念幣並融合成新紀念幣", () => {
  const result = shimmerCollectible(
    { ...createPlayer(), gold: 500, collection: { nina_hot_water: 1, rose_smirk: 1 } },
    ["nina_hot_water", "rose_smirk"],
    () => 0
  );

  assert.equal(result.ok, true);
  assert.equal(result.player.gold, 100);
  assert.equal(result.player.collection.nina_hot_water, undefined);
  assert.equal(result.player.collection.rose_smirk, undefined);
  assert.equal(result.award.id, "meijiang_done");
  assert.equal(result.player.collection.meijiang_done, 1);
  assert.match(result.message, /微光融合/);
});

test("微光池需要金幣和兩枚持有的紀念幣且只能在地表使用", () => {
  const poor = shimmerCollectible(
    { ...createPlayer(), gold: 399, collection: { nina_hot_water: 1, rose_smirk: 1 } },
    ["nina_hot_water", "rose_smirk"]
  );
  const missing = shimmerCollectible({ ...createPlayer(), gold: 500 }, ["nina_hot_water", "rose_smirk"]);
  const duplicate = shimmerCollectible(
    { ...createPlayer(), gold: 500, collection: { nina_hot_water: 1 } },
    ["nina_hot_water", "nina_hot_water"]
  );
  const inMine = shimmerCollectible(
    { ...createPlayer(), gold: 500, runMode: "safe", collection: { nina_hot_water: 1, rose_smirk: 1 } },
    ["nina_hot_water", "rose_smirk"]
  );

  assert.equal(poor.ok, false);
  assert.match(poor.message, /400 金幣/);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /沒有/);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.message, /不能同一枚/);
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

test("神奇糖果花總資產 2% 且每天每人限購兩顆", () => {
  const now = Date.UTC(2026, 4, 6, 1);
  const player = { ...createPlayer(), gold: 1000, bankGold: 9000 };
  assert.equal(getMagicCandyPrice(player), 200);
  const first = buyShopItem(player, "magicCandy", 2, { now });
  const second = buyShopItem({ ...first.player, gold: 10000 }, "magicCandy", 1, { now });
  const blocked = buyShopItem({ ...second.player, gold: 10000 }, "magicCandy", 1, { now });
  const nextDay = buyShopItem({ ...first.player, gold: 10000 }, "magicCandy", 1, { now: now + 24 * 60 * 60 * 1000 });

  assert.equal(first.ok, true);
  assert.equal(first.player.magicCandy, 1);
  assert.equal(first.player.gold, 800);
  assert.equal(first.player.magicCandyPurchasesToday, 1);
  assert.equal(second.ok, true);
  assert.equal(second.player.magicCandyPurchasesToday, 2);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /上限/);
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.player.magicCandyPurchasesToday, 1);
});

test("神奇糖果可以讓自己的雞升一級", () => {
  const player = {
    ...createPlayer(),
    magicCandy: 1,
    ownedChicken: {
      name: "阿咕霸王",
      icon: "🐔",
      level: 1,
      exp: 0,
      speed: 5,
      sprint: 5,
      stability: 5,
      stamina: 5,
      wins: 0,
      races: 0,
      evolutionPoints: {}
    }
  };
  const result = eatMagicCandy(player, () => 0);

  assert.equal(result.ok, true);
  assert.equal(result.player.magicCandy, 0);
  assert.equal(result.player.ownedChicken.level, 2);
  assert.match(result.message, /升到 Lv.2/);
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

test("不死圖騰每天每人最多購買五個並在台灣日期重置", () => {
  const progress = {
    undyingTotemUnlocked: true,
    now: Date.parse("2026-05-08T04:00:00.000Z")
  };
  const first = buyShopItem({ ...createPlayer(), gold: 3000 }, "undyingTotem", 5, progress);
  const blocked = buyShopItem(first.player, "undyingTotem", 1, progress);
  const nextDay = buyShopItem(first.player, "undyingTotem", 1, {
    ...progress,
    now: Date.parse("2026-05-08T16:05:00.000Z")
  });
  const embed = buildShopEmbed(first.player, "測試", progress);
  const description = embed.toJSON().description;

  assert.equal(first.ok, true);
  assert.equal(first.player.undyingTotem, 5);
  assert.equal(first.player.dailyTotemPurchaseCount, 5);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /5\/5/);
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.player.dailyTotemPurchaseCount, 1);
  assert.match(description, /今日剩餘：0 \/ 5/);
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

test("可以交易神奇糖果且會檢查數量", () => {
  const result = transferConsumable(
    { ...createPlayer(), magicCandy: 3 },
    createPlayer(),
    "magicCandy",
    2
  );
  const fail = transferConsumable(
    { ...createPlayer(), magicCandy: 1 },
    createPlayer(),
    "magicCandy",
    2
  );

  assert.equal(result.ok, true);
  assert.equal(result.from.magicCandy, 1);
  assert.equal(result.to.magicCandy, 2);
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

test("開發者分析會持久記錄每日活躍、經濟與健康度", () => {
  const now = Date.parse("2026-05-08T04:00:00.000Z");
  const players = {
    userA: { ...createPlayer(), gold: 1200, bankGold: 3000 },
    userB: { ...createPlayer(), gold: 50, bankGold: 0 }
  };
  recordAnalyticsOnPlayers(players, "userA", "mine", { depth: 20, route: "坑洞", trait: "safe" }, now);
  recordAnalyticsOnPlayers(players, "userA", "event", { eventId: "qte_bomb_defuse" }, now);
  recordAnalyticsOnPlayers(players, "userA", "goldEarned", { amount: 500 }, now);
  recordAnalyticsOnPlayers(players, "userB", "race", {}, now);
  const dateKey = getTaiwanDateKey(now);
  const day = players.__global.dailyAnalytics.days[dateKey];
  const activeEmbed = buildDeveloperPanelEmbed(players, "active", now).toJSON().description;
  const economyEmbed = buildDeveloperPanelEmbed(players, "economy", now).toJSON().description;

  assert.equal(day.mineRuns, 1);
  assert.equal(day.eventsTriggered, 1);
  assert.equal(day.goldEarned, 500);
  assert.equal(day.races, 1);
  assert.match(activeEmbed, /活躍玩家：2/);
  assert.match(economyEmbed, /全服總金幣：4250/);
});

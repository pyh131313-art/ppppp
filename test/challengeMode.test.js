"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChallengeLeaderboardEmbed,
  chooseChallengeTrait,
  createChallengeSetup,
  drinkChallengePotion,
  endChallenge,
  generateChallengeRoutes,
  handleMerchantAction,
  mineChallengeRoute,
  startChallenge
} = require("../src/challengeMode");
const { createPlayer } = require("../src/playerState");

function randomSeq(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    return value === undefined ? 0.5 : value;
  };
}

test("挑戰模式金幣與藥水獨立初始化，不改普通金幣銀行", () => {
  let player = createChallengeSetup({ ...createPlayer(), gold: 999, bankGold: 5000 }, () => 0);
  player = chooseChallengeTrait(player, "goldRush").player;
  const result = startChallenge(player, () => 0);

  assert.equal(result.player.gold, 999);
  assert.equal(result.player.bankGold, 5000);
  assert.equal(result.player.challenge.challengeGold, 0);
  assert.equal(result.player.challenge.potions, 15);
  assert.equal(result.player.challenge.active, true);
});

test("挑戰路線每層會生成 1 到 3 條", () => {
  const one = generateChallengeRoutes({ depth: 0, area: "normal", modifiers: [], miniTraits: {} }, () => 0.1);
  const two = generateChallengeRoutes({ depth: 0, area: "normal", modifiers: [], miniTraits: {} }, () => 0.5);
  const three = generateChallengeRoutes({ depth: 0, area: "normal", modifiers: [], miniTraits: {} }, () => 0.9);

  assert.equal(one.length, 1);
  assert.equal(two.length, 2);
  assert.equal(three.length, 3);
});

test("挑戰模式每 20 層生成流浪商人", () => {
  let player = createChallengeSetup(createPlayer(), () => 0);
  player = chooseChallengeTrait(player, "goldRush").player;
  player = startChallenge(player, () => 0).player;
  player.challenge.depth = 19;
  player.challenge.routeOptions = [{ id: "left", type: "normal", label: "穩礦道" }];

  const result = mineChallengeRoute(player, "left", randomSeq([0.5, 0.5, 0.99, 0.5]));
  assert.equal(result.player.challenge.depth, 20);
  assert.ok(result.player.challenge.merchant);
  assert.match(result.message, /流浪商人/);
});

test("挑戰模式每 100 層後切換區域", () => {
  let player = createChallengeSetup(createPlayer(), () => 0);
  player = chooseChallengeTrait(player, "goldRush").player;
  player = startChallenge(player, () => 0).player;
  player.challenge.depth = 100;
  player.challenge.routeOptions = [{ id: "left", type: "normal", label: "穩礦道" }];

  const result = mineChallengeRoute(player, "left", randomSeq([0.2, 0.5, 0.99, 0.5]));
  assert.equal(result.player.challenge.depth, 101);
  assert.equal(result.player.challenge.area, "sky");
  assert.match(result.message, /區域切換/);
});

test("挑戰死亡會清空挑戰資產並保存最高層", () => {
  let player = createChallengeSetup(createPlayer(), () => 0);
  player = chooseChallengeTrait(player, "goldRush").player;
  player = startChallenge(player, () => 0).player;
  player.challenge.hp = 1;
  player.challenge.challengeGold = 777;
  player.challenge.depth = 8;
  player.challenge.routeOptions = [{ id: "left", type: "risky", label: "危險裂縫" }];

  const result = mineChallengeRoute(player, "left", randomSeq([0.5, 0.5, 0.99, 0]));
  assert.equal(result.player.challenge, null);
  assert.equal(result.player.challengeBestDepth, 9);
  assert.match(result.message, /挑戰金幣已清空/);
});

test("挑戰藥水沒有冷卻，流浪商人可替換大詞條", () => {
  let player = createChallengeSetup(createPlayer(), () => 0);
  player = chooseChallengeTrait(player, "goldRush").player;
  player = startChallenge(player, () => 0).player;
  player.challenge.hp = 1;
  const healed = drinkChallengePotion(player);
  assert.equal(healed.player.challenge.hp, 2);
  assert.equal(healed.player.challenge.potions, 14);

  healed.player.challenge.challengeGold = 10000;
  healed.player.challenge.merchant = {
    depth: 20,
    sellOffers: [],
    potionPrice: 1,
    miniTraitOffers: [],
    replacementTraits: [{ id: "bigBag", price: 1 }]
  };
  const replaced = handleMerchantAction(healed.player, "replaceTrait", "bigBag");
  assert.equal(replaced.player.challenge.trait, "bigBag");
  assert.equal(replaced.player.challenge.merchant, null);
});

test("挑戰排行榜只看最高層數排序", () => {
  const embed = buildChallengeLeaderboardEmbed({
    a: { challengeBestDepth: 12, gold: 999999 },
    b: { challengeBestDepth: 55, gold: 0 },
    c: { challengeBestDepth: 3, gold: 500 }
  }).toJSON();
  assert.match(embed.description, /<@b>：55 層/);
  assert.ok(embed.description.indexOf("<@b>") < embed.description.indexOf("<@a>"));
});

test("離開挑戰不帶回挑戰金幣", () => {
  let player = createChallengeSetup({ ...createPlayer(), gold: 10 }, () => 0);
  player = chooseChallengeTrait(player, "goldRush").player;
  player = startChallenge(player, () => 0).player;
  player.challenge.challengeGold = 9999;
  player.challenge.depth = 30;
  const result = endChallenge(player, false);

  assert.equal(result.player.gold, 10);
  assert.equal(result.player.challenge, null);
  assert.equal(result.player.challengeBestDepth, 30);
});

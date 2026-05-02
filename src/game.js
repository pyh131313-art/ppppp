"use strict";

const { CONFIG } = require("./config");

const BAG_CAPACITY = 12;

function createPlayer() {
  return {
    gold: 0,
    rusty: 0,
    collection: {},
    bombs: 0,
    dead: false,
    deathAt: null,
    mines: 0,
    depth: 0
  };
}

function getPlayer(player) {
  const next = {
    ...createPlayer(),
    ...(player || {})
  };
  next.collection = {
    ...(player && player.collection ? player.collection : {})
  };
  return next;
}

function rollWeighted(weights, random = Math.random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;

  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }

  return entries[entries.length - 1][0];
}

function getMiningWeights(playerInput) {
  const player = getPlayer(playerInput);
  const dangerTier = Math.min(4, Math.floor(player.depth / 3));
  const weights = { ...CONFIG.mining.weights };
  weights.gold = Math.max(32, weights.gold - dangerTier * 2);
  weights.rusty += dangerTier * 2;
  weights.bomb += dangerTier * 4;
  weights.empty = Math.max(4, weights.empty - dangerTier * 2);
  return weights;
}

function getDepthLabel(depth) {
  if (depth >= 10) return "危險礦層";
  if (depth >= 7) return "古代礦層";
  if (depth >= 4) return "深色礦層";
  return "淺層礦道";
}

function getDepthBonus(depth) {
  return Math.min(8, Math.floor(depth / 3));
}

function getGoldAmount(depth, random = Math.random) {
  const bonus = getDepthBonus(depth);
  return 1 + bonus + Math.floor(random() * (3 + bonus * 2));
}

function applyDeathPenalty(player) {
  const lostGold = Math.ceil(player.gold / 3);
  player.gold = Math.max(0, player.gold - lostGold);
  return lostGold;
}

function getCollectibles() {
  return CONFIG.collectibles;
}

function getAwardCollectibles() {
  return CONFIG.collectibles.filter((item) => !item.shopOnly);
}

function getCollectible(id) {
  return CONFIG.collectibles.find((item) => item.id === id) || null;
}

function getShopItems() {
  return CONFIG.shop.items
    .map((shopItem) => ({
      ...shopItem,
      collectible: getCollectible(shopItem.id)
    }))
    .filter((shopItem) => shopItem.collectible);
}

function getCollectionTotal(playerInput) {
  const player = getPlayer(playerInput);
  return Object.values(player.collection).reduce((sum, count) => sum + count, 0);
}

function getCollectionUniqueCount(playerInput) {
  const player = getPlayer(playerInput);
  return CONFIG.collectibles.filter((item) => (player.collection[item.id] || 0) > 0).length;
}

function getBagUsedSlots(playerInput) {
  const player = getPlayer(playerInput);
  return getCollectionUniqueCount(player) + player.rusty;
}

function getBagFreeSlots(playerInput) {
  return Math.max(0, BAG_CAPACITY - getBagUsedSlots(playerInput));
}

function awardCollectible(player, random = Math.random) {
  const weights = Object.fromEntries(getAwardCollectibles().map((item) => [item.id, item.weight]));
  const id = rollWeighted(weights, random);
  const collectible = getCollectible(id);
  if ((player.collection[id] || 0) === 0 && getBagFreeSlots(player) <= 0) return null;
  player.collection[id] = (player.collection[id] || 0) + 1;
  return collectible;
}

function mine(playerInput, random = Math.random, now = Date.now()) {
  const player = getPlayer(playerInput);
  if (player.dead) {
    return {
      kind: "blocked",
      player,
      title: "你已經死亡",
      message: "目前不能挖礦。請使用 `/復活`。"
    };
  }

  player.mines += 1;
  player.depth += 1;
  const result = rollWeighted(getMiningWeights(player), random);

  if (result === "gold") {
    const amount = getGoldAmount(player.depth, random);
    player.gold += amount;
    return {
      kind: "gold",
      player,
      title: "挖到金幣",
      message: `你挖到了 ${amount} 枚金幣。`
    };
  }

  if (result === "rusty") {
    const bonus = getDepthBonus(player.depth);
    const amount = 1 + Math.floor(random() * (2 + bonus));
    const freeSlots = getBagFreeSlots(player);
    if (freeSlots <= 0) {
      return {
        kind: "full",
        player,
        title: "包包已滿",
        message: "你挖到生鏽紀念幣，但 12 格包包已滿，放不下。"
      };
    }

    const gained = Math.min(amount, freeSlots);
    player.rusty += gained;
    return {
      kind: "rusty",
      player,
      title: "挖到生鏽紀念幣",
      message: `你挖到了 ${gained} 枚本次生鏽紀念幣。離開礦坑會消失，只能先用 \`/除鏽\` 帶走。${gained < amount ? "有一些因為包包滿了放不下。" : ""}`
    };
  }

  if (result === "bomb") {
    player.bombs += 1;
    if (player.bombs >= 2) {
      const lostGold = applyDeathPenalty(player);
      player.dead = true;
      player.deathAt = now;
      return {
        kind: "dead",
        player,
        title: "爆炸",
        message: `你第二次挖到炸彈，死亡了，損失 ${lostGold} 枚金幣。可以等待 10 分鐘或花 20 金幣使用 \`/復活\`。`
      };
    }

    return {
      kind: "bomb",
      player,
      title: "挖到炸彈",
      message: "你被炸傷了。炸彈次數 1/2，再挖到一次炸彈就會死亡。"
    };
  }

  return {
    kind: "empty",
    player,
    title: "什麼都沒有",
    message: "這一鏟只有碎石。"
  };
}

function summarizeCollectibles(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.id, {
      item,
      count: (counts.get(item.id) ? counts.get(item.id).count : 0) + 1
    });
  }

  return [...counts.values()]
    .map(({ item, count }) => `${item.name}（${item.rarity}）x${count}`)
    .join("、");
}

function exchange(playerInput, amount = 1, random = Math.random) {
  const player = getPlayer(playerInput);
  const safeAmount = Math.max(1, Math.floor(amount));
  const cost = safeAmount * CONFIG.exchange.goldPerCommemorative;

  if (player.gold < cost) {
    return {
      ok: false,
      player,
      message: `金幣不足。兌換 ${safeAmount} 枚紀念幣需要 ${cost} 金幣。`
    };
  }

  const awards = [];
  for (let i = 0; i < safeAmount; i += 1) {
    const award = awardCollectible(player, random);
    if (award) awards.push(award);
  }

  if (awards.length === 0) {
    return {
      ok: false,
      player,
      awards,
      message: "包包已滿，沒有空格放新的紀念幣。"
    };
  }

  const actualCost = awards.length * CONFIG.exchange.goldPerCommemorative;
  player.gold -= actualCost;

  return {
    ok: true,
    player,
    awards,
    message: `成功用 ${actualCost} 金幣鑄造 ${awards.length} 枚紀念幣：${summarizeCollectibles(awards)}。`
  };
}

function buyShopItem(playerInput, itemId, amount = 1) {
  const player = getPlayer(playerInput);
  const safeAmount = Math.max(1, Math.floor(amount));
  const shopItem = getShopItems().find((item) => item.id === itemId);

  if (!shopItem) {
    return {
      ok: false,
      player,
      message: "商店沒有這個商品。"
    };
  }

  if ((player.collection[itemId] || 0) === 0 && getBagFreeSlots(player) <= 0) {
    return {
      ok: false,
      player,
      message: "包包已滿，沒有空格放新的紀念幣。"
    };
  }

  const cost = shopItem.priceGold * safeAmount;
  if (player.gold < cost) {
    return {
      ok: false,
      player,
      message: `金幣不足。購買 ${safeAmount} 枚${shopItem.collectible.name}需要 ${cost} 金幣。`
    };
  }

  player.gold -= cost;
  player.collection[itemId] = (player.collection[itemId] || 0) + safeAmount;

  return {
    ok: true,
    player,
    message: `成功花費 ${cost} 金幣購買 ${safeAmount} 枚${shopItem.collectible.name}。`
  };
}

function removeRust(playerInput, amount = 1, random = Math.random) {
  const player = getPlayer(playerInput);
  const safeAmount = Math.max(1, Math.floor(amount));
  const option = CONFIG.rustRemoval.default;
  const cost = safeAmount * option.costGold;

  if (player.rusty < safeAmount) {
    return {
      ok: false,
      player,
      message: `生鏽錢幣不足。你只有 ${player.rusty} 枚。`
    };
  }

  if (player.gold < cost) {
    return {
      ok: false,
      player,
      message: `${option.label} ${safeAmount} 枚需要 ${cost} 金幣。`
    };
  }

  player.rusty -= safeAmount;
  player.gold -= cost;

  let success = 0;
  let broken = 0;
  const awards = [];
  for (let i = 0; i < safeAmount; i += 1) {
    if (random() < option.successRate) {
      const award = awardCollectible(player, random);
      if (award) {
        success += 1;
        awards.push(award);
      } else {
        broken += 1;
      }
    } else {
      broken += 1;
    }
  }

  return {
    ok: true,
    player,
    awards,
    message: `${option.label}完成：成功 ${success} 枚，損壞 ${broken} 枚，花費 ${cost} 金幣。${awards.length ? `獲得：${summarizeCollectibles(awards)}。` : ""}`
  };
}

function returnToSurface(playerInput) {
  const player = getPlayer(playerInput);
  const lostRusty = player.rusty;
  const clearedBombs = player.bombs;
  const depth = player.depth;

  player.rusty = 0;
  player.bombs = 0;
  player.depth = 0;

  return {
    ok: true,
    player,
    message: `已返回地面。深度 ${depth} 歸零，炸彈次數 ${clearedBombs} 歸零。${lostRusty > 0 ? `未除鏽的 ${lostRusty} 枚生鏽紀念幣已消失。` : ""}`
  };
}

function discardItem(playerInput, itemId, amount = 1) {
  const player = getPlayer(playerInput);
  const safeAmount = Math.max(1, Math.floor(amount));

  if (itemId === "rusty") {
    if (player.rusty <= 0) {
      return {
        ok: false,
        player,
        message: "你沒有生鏽紀念幣可以丟棄。"
      };
    }

    const discarded = Math.min(safeAmount, player.rusty);
    player.rusty -= discarded;
    return {
      ok: true,
      player,
      message: `已丟棄 ${discarded} 枚生鏽紀念幣。`
    };
  }

  const collectible = getCollectible(itemId);
  if (!collectible) {
    return {
      ok: false,
      player,
      message: "沒有這個物品。"
    };
  }

  const current = player.collection[itemId] || 0;
  if (current <= 0) {
    return {
      ok: false,
      player,
      message: `你沒有 ${collectible.name} 可以丟棄。`
    };
  }

  const discarded = Math.min(safeAmount, current);
  player.collection[itemId] = current - discarded;
  if (player.collection[itemId] <= 0) delete player.collection[itemId];

  return {
    ok: true,
    player,
    message: `已丟棄 ${discarded} 枚${collectible.name}。`
  };
}

function transferCollectible(fromInput, toInput, itemId, amount = 1) {
  const from = getPlayer(fromInput);
  const to = getPlayer(toInput);
  const safeAmount = Math.max(1, Math.floor(amount));
  const collectible = getCollectible(itemId);

  if (!collectible) {
    return {
      ok: false,
      from,
      to,
      message: "沒有這個紀念幣。"
    };
  }

  const current = from.collection[itemId] || 0;
  if (current < safeAmount) {
    return {
      ok: false,
      from,
      to,
      message: `你的${collectible.name}不足，目前只有 ${current} 枚。`
    };
  }

  if ((to.collection[itemId] || 0) === 0 && getBagFreeSlots(to) <= 0) {
    return {
      ok: false,
      from,
      to,
      message: "對方包包已滿，沒有空格接收新的紀念幣。"
    };
  }

  from.collection[itemId] = current - safeAmount;
  if (from.collection[itemId] <= 0) delete from.collection[itemId];
  to.collection[itemId] = (to.collection[itemId] || 0) + safeAmount;

  return {
    ok: true,
    from,
    to,
    message: `交易完成：送出 ${safeAmount} 枚${collectible.name}。`
  };
}

function revive(playerInput, now = Date.now()) {
  const player = getPlayer(playerInput);
  if (!player.dead) {
    return {
      ok: false,
      player,
      message: "你目前還活著，不需要復活。"
    };
  }

  const deathAt = player.deathAt || now;
  const canFreeRevive = now - deathAt >= CONFIG.revive.freeAfterMs;

  if (!canFreeRevive && player.gold < CONFIG.revive.costGold) {
    const remainingMs = CONFIG.revive.freeAfterMs - (now - deathAt);
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return {
      ok: false,
      player,
      message: `金幣不足，花費復活需要 ${CONFIG.revive.costGold} 金幣。也可以再等約 ${remainingMinutes} 分鐘免費復活。`
    };
  }

  if (!canFreeRevive) player.gold -= CONFIG.revive.costGold;
  player.dead = false;
  player.bombs = 0;
  player.depth = 0;
  player.rusty = 0;
  player.deathAt = null;

  return {
    ok: true,
    player,
    message: canFreeRevive ? "你已免費復活，炸彈次數歸零。" : `你花費 ${CONFIG.revive.costGold} 金幣復活，炸彈次數歸零。`
  };
}

function formatInventory(playerInput) {
  const player = getPlayer(playerInput);
  return [
    `金幣：${player.gold}`,
    `生鏽紀念幣：${player.rusty}`,
    `收藏紀念幣：${getCollectionTotal(player)} 枚`,
    `包包格數：${getBagUsedSlots(player)}/${BAG_CAPACITY}`,
    `深度：${player.depth}（${getDepthLabel(player.depth)}）`,
    `炸彈次數：${player.bombs}/2`,
    `狀態：${player.dead ? "死亡" : "存活"}`,
    `挖礦次數：${player.mines}`
  ].join("\n");
}

function formatShop() {
  const shopLines = getShopItems().map(
    (item) => `${item.collectible.name}｜${item.collectible.rarity}｜${item.priceGold} 金幣｜只能在商店購買`
  );
  return [
    `金幣鑄造：${CONFIG.exchange.goldPerCommemorative} 金幣 = 1 枚隨機收藏紀念幣，使用 \`/兌換\`。`,
    `除鏽：每枚 ${CONFIG.rustRemoval.default.costGold} 金幣，成功率 ${Math.round(CONFIG.rustRemoval.default.successRate * 100)}%。`,
    "",
    "商店限定：",
    ...shopLines,
    "",
    "使用 `/購買` 購買商店限定紀念幣。"
  ].join("\n");
}

function formatCollection(playerInput) {
  const player = getPlayer(playerInput);
  return CONFIG.collectibles
    .map((item) => {
      const count = player.collection[item.id] || 0;
      const owned = count > 0 ? `已收藏 x${count}` : "未發現";
      return `${item.name}｜${item.rarity}｜${owned}`;
    })
    .join("\n");
}

module.exports = {
  awardCollectible,
  buyShopItem,
  createPlayer,
  discardItem,
  exchange,
  formatCollection,
  formatInventory,
  formatShop,
  getBagFreeSlots,
  getBagUsedSlots,
  getAwardCollectibles,
  getCollectible,
  getCollectibles,
  getCollectionTotal,
  getCollectionUniqueCount,
  getDepthLabel,
  getPlayer,
  getShopItems,
  mine,
  removeRust,
  returnToSurface,
  revive,
  rollWeighted,
  transferCollectible
};

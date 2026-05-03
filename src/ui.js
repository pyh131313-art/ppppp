"use strict";

const path = require("node:path");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { buildCoinBookPng } = require("./inventory-image");
const {
  getCollectibles,
  getCollectionTotal,
  getCollectionUniqueCount,
  getCommunityProgress,
  getBagCapacity,
  getBagUsedSlots,
  canChooseMinorBuff,
  getCaveLabel,
  getDepthLabel,
  getDigPathOptions,
  getMaxBombs,
  getPlayer,
  getRandomEvent,
  getRunModeOptions,
  getRunModeLabel,
  getShopConsumables,
  getShopItems
} = require("./game");

const CUSTOM_IDS = {
  mine: "mine_ui:mine",
  mineLeft: "mine_ui:mine_left",
  mineRight: "mine_ui:mine_right",
  rerollModes: "mine_ui:reroll_modes",
  modePrefix: "mine_ui:mode",
  modeDouble: "mine_ui:mode_double",
  modeSafe: "mine_ui:mode_safe",
  buffGold: "mine_ui:buff_gold",
  buffBomb: "mine_ui:buff_bomb",
  bag: "mine_ui:bag",
  leaderboard: "mine_ui:leaderboard",
  bankDeposit: "mine_ui:bank_deposit",
  bankWithdraw: "mine_ui:bank_withdraw",
  eventRisk: "mine_ui:event:risk",
  eventSafe: "mine_ui:event:safe",
  exchangeOne: "mine_ui:exchange_one",
  shopBuyOne: "mine_ui:shop_buy_one",
  shopOpen: "mine_ui:shop_open",
  shopBuyPotion: "mine_ui:shop_buy_potion",
  shopBuyTotem: "mine_ui:shop_buy_totem",
  shopExit: "mine_ui:shop_exit",
  drinkPotion: "mine_ui:drink_potion",
  rustOne: "mine_ui:rust_one",
  discardRustOne: "mine_ui:discard_rust_one",
  returnSurface: "mine_ui:return_surface",
  revive: "mine_ui:revive",
  rescuePrefix: "mine_ui:rescue"
};

function progressBar(value, max, width = 10) {
  const safeValue = Math.max(0, Math.min(value, max));
  const filled = Math.round((safeValue / max) * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

function getMineRank(mines) {
  if (mines >= 100) return "深層遺跡";
  if (mines >= 50) return "古代礦脈";
  if (mines >= 20) return "黑鐵礦坑";
  if (mines >= 5) return "銅石坑道";
  return "新手礦洞";
}

function getDepth(mines) {
  return Math.max(1, mines * 3 + 1);
}

function buildQuickStatus(playerInput) {
  const player = getPlayer(playerInput);
  const maxHp = getMaxBombs(player);
  const hp = player.dead ? 0 : Math.max(0, maxHp - player.bombs);
  const digPaths = player.runMode ? getDigPathOptions(player) : [];
  const digPathText = digPaths.length
    ? `左:${digPaths[0].label}｜右:${digPaths[1].label}`
    : "尚未生成";
  return [
    `金幣 ${player.gold}｜銀行 ${player.bankGold}`,
    `道具 🧪${player.healingPotion} 🗿${player.undyingTotem}`,
    `礦石 ⛏️${player.ore} 🟨${player.goldOre} ◻️${player.platinumOre}`,
    `加工 🧈${player.goldBlock} 🔶${player.oreIngot} 🔷${player.goldOreIngot} 🔳${player.platinumOreIngot} 💣${player.bombItem}`,
    `寶石 🔴${player.redGem} 🔵${player.blueGem} 🟢${player.greenGem}`,
    `破爛 ${player.junk}｜白金 ${player.platinumJunk}`,
    `包包 ${getBagUsedSlots(player)}/${getBagCapacity(player)}`,
    `生命 ${"♥".repeat(hp)}${".".repeat(maxHp - hp)} ${hp}/${maxHp}`,
    `方式 ${getRunModeLabel(player)}`,
    `路線 ${digPathText}`,
    `磁條 金幣+${player.minorBuffs.gold * 5}% 防爆${player.minorBuffs.bomb}`,
    `事件 ${player.pendingEvent ? getRandomEvent(player.pendingEvent).title : "無"}`,
    `礦洞 ${getCaveLabel(player)}`,
    `深度 ${player.depth}｜最深 ${player.stats.bestDepth}｜${getDepthLabel(player.depth)}`
  ];
}

function getBagSlots(playerInput) {
  const player = getPlayer(playerInput);
  const capacity = getBagCapacity(player);
  const rustySlots = Array.from({ length: player.rusty }, () => ({
    icon: "🟤",
    label: "生鏽紀念幣"
  }));
  const oreSlots = Array.from({ length: player.ore }, () => ({
    icon: "⛏️",
    label: "礦石"
  }));
  const goldOreSlots = Array.from({ length: player.goldOre }, () => ({
    icon: "🟨",
    label: "金礦石"
  }));
  const platinumOreSlots = Array.from({ length: player.platinumOre }, () => ({
    icon: "◻️",
    label: "鉑金礦石"
  }));
  const goldBlockSlots = Array.from({ length: player.goldBlock }, () => ({
    icon: "🧈",
    label: "金塊"
  }));
  const oreIngotSlots = Array.from({ length: player.oreIngot }, () => ({
    icon: "🔶",
    label: "礦錠"
  }));
  const goldOreIngotSlots = Array.from({ length: player.goldOreIngot }, () => ({
    icon: "🔷",
    label: "金錠"
  }));
  const platinumOreIngotSlots = Array.from({ length: player.platinumOreIngot }, () => ({
    icon: "🔳",
    label: "鉑金錠"
  }));
  const bombItemSlots = Array.from({ length: player.bombItem }, () => ({
    icon: "💣",
    label: "完整炸彈"
  }));
  const redGemSlots = Array.from({ length: player.redGem }, () => ({
    icon: "🔴",
    label: "紅寶石"
  }));
  const blueGemSlots = Array.from({ length: player.blueGem }, () => ({
    icon: "🔵",
    label: "藍寶石"
  }));
  const greenGemSlots = Array.from({ length: player.greenGem }, () => ({
    icon: "🟢",
    label: "綠寶石"
  }));
  const junkSlots = Array.from({ length: player.junk * 3 }, (_, index) => ({
    icon: "🧱",
    label: `超級破爛 ${Math.floor(index / 3) + 1}/佔3格`
  }));
  const platinumJunkSlots = Array.from({ length: player.platinumJunk * 5 }, (_, index) => ({
    icon: "⬜",
    label: `白金破爛 ${Math.floor(index / 5) + 1}/佔5格`
  }));

  return [
    ...rustySlots,
    ...oreSlots,
    ...goldOreSlots,
    ...platinumOreSlots,
    ...goldBlockSlots,
    ...oreIngotSlots,
    ...goldOreIngotSlots,
    ...platinumOreIngotSlots,
    ...bombItemSlots,
    ...redGemSlots,
    ...blueGemSlots,
    ...greenGemSlots,
    ...junkSlots,
    ...platinumJunkSlots
  ].slice(0, capacity);
}

function buildBagGrid(playerInput) {
  const slots = getBagSlots(playerInput);
  const capacity = getBagCapacity(playerInput);
  const cells = Array.from({ length: capacity }, (_, index) => {
    const slot = slots[index];
    return `${String(index + 1).padStart(2, "0")} ${slot ? slot.icon : "⬛"}`;
  });
  const rows = [];
  for (let index = 0; index < cells.length; index += 4) {
    rows.push(cells.slice(index, index + 4).join("　"));
  }
  return rows.join("\n");
}

function buildBagList(playerInput) {
  const slots = getBagSlots(playerInput);
  if (slots.length === 0) return "目前包包是空的。";
  return slots.map((slot, index) => `${index + 1}. ${slot.icon} ${slot.label}`).join("\n");
}

function buildCoinBookList(playerInput) {
  const player = getPlayer(playerInput);
  const owned = getCollectibles()
    .filter((item) => (player.collection[item.id] || 0) > 0)
    .map((item) => `${item.name}｜${item.rarity}｜x${player.collection[item.id]}`);
  if (owned.length === 0) return "尚未收藏正式紀念幣。";
  return owned.join("\n");
}

function getResultEmoji(kind) {
  const map = {
    gold: "🟡",
    ore: "⛏️",
    goldOre: "🟨",
    platinumOre: "◻️",
    goldBlock: "🧈",
    oreIngot: "🔶",
    goldOreIngot: "🔷",
    platinumOreIngot: "🔳",
    bombItem: "💣",
    junk: "🧱",
    redGem: "🔴",
    blueGem: "🔵",
    greenGem: "🟢",
    stalactite: "🪨",
    platinumJunk: "⬜",
    rusty: "🟤",
    bomb: "💣",
    dead: "💥",
    full: "🎒",
    empty: "🪨",
    blocked: "☠️"
  };
  return map[kind] || "🪨";
}

function getResultLabel(kind) {
  const map = {
    gold: "金幣",
    ore: "礦石",
    goldOre: "金礦石",
    platinumOre: "鉑金礦石",
    goldBlock: "金塊",
    oreIngot: "礦錠",
    goldOreIngot: "金錠",
    platinumOreIngot: "鉑金錠",
    bombItem: "完整炸彈",
    junk: "超級破爛",
    redGem: "紅寶石",
    blueGem: "藍寶石",
    greenGem: "綠寶石",
    stalactite: "鐘乳石",
    platinumJunk: "白金破爛",
    rusty: "生鏽紀念幣",
    bomb: "炸彈",
    dead: "爆炸",
    full: "包包滿了",
    empty: "碎石",
    blocked: "無法挖礦"
  };
  return map[kind] || "碎石";
}

function buildMineEmojiScene(outcome) {
  const result = getResultEmoji(outcome.kind);
  return [
    "🔎 掃描礦脈",
    "⛏️ 揮鎬開採",
    `${result} 掉落：${getResultLabel(outcome.kind)}`
  ];
}

function buildIdleMineScene() {
  return ["🔎 等待掃描", "⛏️ 準備開採", "⬛ 尚未掉落"];
}

function buildHudBlock(playerInput, mineLines) {
  const slots = getBagSlots(playerInput);
  const capacity = getBagCapacity(playerInput);
  const bagCells = Array.from({ length: capacity }, (_, index) => {
    const slot = slots[index];
    return `背包${index + 1}:${slot ? slot.icon : "⬛"}`;
  });
  const bagRows = [];
  for (let index = 0; index < bagCells.length; index += 4) {
    bagRows.push(bagCells.slice(index, index + 4).join("　"));
  }
  return [...mineLines, "", ...buildQuickStatus(playerInput), "", "包包", ...bagRows].join("\n");
}

function getDisplayName(user) {
  return user ? user.displayName || user.globalName || user.username : null;
}

function addActorFooter(embed, user) {
  const name = getDisplayName(user);
  if (!name) return embed;
  return embed.setFooter({ text: `玩家：${name}` });
}

function buildPanelEmbed(playerInput, title = "礦場面板", message = "選擇下方按鈕開始挖礦。", user = null) {
  const player = getPlayer(playerInput);
  const color = player.dead ? 0x7f1d1d : player.bombs > 0 ? 0xf59e0b : 0x16a34a;
  const event = player.pendingEvent ? getRandomEvent(player.pendingEvent) : null;
  const eventText = event ? `\n\n目前事件：${event.title}\n${event.description}` : "";
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`礦井探險 | ${title}`)
    .setDescription(`${message}\n\n生鏽紀念幣離開礦坑會消失，除鏽成功才帶得走。${eventText}`)
    .addFields({ name: "礦場", value: buildHudBlock(player, buildIdleMineScene()) });
  return addActorFooter(embed, user);
}

function buildHudFiles(playerInput, outcome = null) {
  void playerInput;
  void outcome;
  return [];
}

function getCollectionImageCards(playerInput, limit = 9) {
  const player = getPlayer(playerInput);
  return getCollectibles()
    .filter((item) => (player.collection[item.id] || 0) > 0 && item.image)
    .slice(0, limit)
    .map((item, index) => ({
      item,
      count: player.collection[item.id] || 0,
      image: item.image,
      fileName: `coin-${index + 1}${path.extname(item.image) || ".png"}`
    }));
}

function buildMiningEmbed(outcome, user = null) {
  const player = getPlayer(outcome.player);
  const color = player.dead ? 0x7f1d1d : player.bombs > 0 ? 0xf59e0b : 0x16a34a;
  const description = [
    outcome.message,
    outcome.globalRecordMessage ? `\n${outcome.globalRecordMessage}` : ""
  ].join("");
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`礦井探險 | ${outcome.title}`)
    .setDescription(description)
    .addFields({ name: "礦場", value: buildHudBlock(player, buildMineEmojiScene(outcome)) });
  return addActorFooter(embed, user);
}

function buildLeaderboardEmbed(playersInput = {}) {
  const progress = getCommunityProgress(playersInput);
  const rows = Object.entries(playersInput)
    .map(([userId, playerInput]) => {
      const player = getPlayer(playerInput);
      return {
        userId,
        player,
        bestDepth: player.stats.bestDepth || 0,
        totalMines: player.stats.totalMines || player.mines || 0,
        collectionTotal: getCollectionTotal(player)
      };
    })
    .filter((row) => row.bestDepth > 0 || row.totalMines > 0 || row.player.gold > 0 || row.player.bankGold > 0 || row.collectionTotal > 0)
    .sort((a, b) => {
      if (b.bestDepth !== a.bestDepth) return b.bestDepth - a.bestDepth;
      if (b.collectionTotal !== a.collectionTotal) return b.collectionTotal - a.collectionTotal;
      return (b.player.gold + b.player.bankGold) - (a.player.gold + a.player.bankGold);
    })
    .slice(0, 10);

  const lines = rows.map((row, index) => (
    `${index + 1}. <@${row.userId}>｜最深 ${row.bestDepth}｜金幣 ${row.player.gold + row.player.bankGold}｜集幣冊 ${row.collectionTotal}｜死亡 ${row.player.stats.deaths}`
  ));

  const taskLines = [
    `70 層任務：${progress.bestDepth}/70 ${progress.healingPotionUnlocked ? "已解鎖治療藥水" : "未解鎖"}`,
    `死亡任務：${progress.deaths}/100 ${progress.undyingTotemUnlocked ? "已解鎖不死圖騰" : "未解鎖"}`
  ];

  return new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle("礦井排行榜")
    .setDescription(["共同任務", ...taskLines, "", "排行榜", ...(lines.length ? lines : ["目前還沒有排行榜紀錄。"])].join("\n").slice(0, 4096))
    .setFooter({ text: "排序：最深層優先，其次集幣冊數量與金幣。" });
}

function buildCollectionEmbed(playerInput, message = "這是你的收藏紀念幣圖鑑。", hasCoinBookImage = true) {
  const player = getPlayer(playerInput);
  const unique = getCollectionUniqueCount(player);
  const all = getCollectibles().length;
  const total = getCollectionTotal(player);
  const slots = getBagUsedSlots(player);
  const capacity = getBagCapacity(player);
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle("紀念幣包包")
    .setDescription([
      message,
      "",
      `總數：${total}`,
      `包包格數：${slots}/${capacity}`,
      `種類：${unique}/${all} ${progressBar(unique, all, 12)}`
    ].join("\n"))
    .addFields(
      { name: `${capacity} 格物品欄`, value: buildBagGrid(player) },
      { name: "包包內容", value: buildBagList(player).slice(0, 1024) },
      { name: "集幣冊", value: buildCoinBookList(player).slice(0, 1024) }
    )
    .setFooter({ text: `目前開放：${all} 種紀念幣。` });

  if (hasCoinBookImage) embed.setImage("attachment://coin-book.png");

  return embed;
}

async function buildCollectionFileSet(playerInput) {
  try {
    return {
      hasCoinBookImage: true,
      files: [
        new AttachmentBuilder(await buildCoinBookPng(playerInput), {
          name: "coin-book.png"
        })
      ]
    };
  } catch {
    return {
      hasCoinBookImage: false,
      files: getCollectionImageCards(playerInput).map((card) => (
        new AttachmentBuilder(path.join(__dirname, "..", card.image), {
          name: card.fileName
        })
      ))
    };
  }
}

async function buildCollectionFiles(playerInput) {
  const result = await buildCollectionFileSet(playerInput);
  return result.files;
}

async function buildCollectionResponse(playerInput, message = "這是你的收藏紀念幣圖鑑。") {
  const result = await buildCollectionFileSet(playerInput);
  return {
    embeds: [buildCollectionEmbed(playerInput, message, result.hasCoinBookImage)],
    files: result.files
  };
}

function buildShopEmbed(playerInput, message = "商店限定紀念幣只能用金幣購買，挖礦、鑄造、除鏽都不會出。", progressInput = {}) {
  const player = getPlayer(playerInput);
  const lines = getShopItems().map((item) => {
    const owned = player.collection[item.id] || 0;
    return `${item.collectible.name}｜${item.collectible.rarity}｜${item.priceGold} 金幣｜持有 ${owned}`;
  });
  const consumableLines = getShopConsumables(progressInput).map((item) => {
    const owned = player[item.id] || 0;
    return `${item.label}｜${item.priceGold} 金幣｜持有 ${owned}`;
  });

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("商店")
    .setDescription([message, "", `你的金幣：${player.gold}`, "", ...lines, ...(consumableLines.length ? ["", "共同任務商品", ...consumableLines] : [])].join("\n"));
}

function makeButton(customId, label, style = ButtonStyle.Secondary, emoji = null) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
  if (emoji) button.setEmoji(emoji);
  return button;
}

function getEventButtonLabels(eventId) {
  if (eventId === "cracked_wall") {
    return {
      risk: "敲開礦牆",
      safe: "繞路前進"
    };
  }
  if (eventId === "collapse_warning") {
    return {
      risk: "硬挖一波",
      safe: "立刻撤退"
    };
  }
  if (eventId === "ancient_rust") {
    return {
      risk: "免費除鏽",
      safe: "穩定除鏽"
    };
  }
  if (eventId === "lost_backpack") {
    return {
      risk: "翻找背包",
      safe: "只拿背帶"
    };
  }
  if (eventId === "goblin_purchase") {
    return {
      risk: "接受收購",
      safe: "拒絕收購"
    };
  }
  if (eventId === "cave_roach") {
    return {
      risk: "摸頭餵食",
      safe: "慢慢退開"
    };
  }
  return {
    risk: "冒險選項",
    safe: "保守選項"
  };
}

function buildPanelComponents(targetUserId = null, playerInput = null, progressInput = {}) {
  const player = getPlayer(playerInput);
  const progress = {
    healingPotionUnlocked: false,
    undyingTotemUnlocked: false,
    ...progressInput
  };
  const rescueId = targetUserId
    ? `${CUSTOM_IDS.rescuePrefix}:${targetUserId}`
    : `${CUSTOM_IDS.rescuePrefix}:none`;
  const rows = [];
  const addRow = (...buttons) => {
    const filtered = buttons.filter(Boolean);
    if (filtered.length === 0) return;
    rows.push(new ActionRowBuilder().addComponents(...filtered));
  };
  const onSurface = !player.dead && !player.runMode;
  const inMine = !player.dead && Boolean(player.runMode);

  if (player.pendingEvent) {
    const labels = getEventButtonLabels(player.pendingEvent);
    addRow(
      makeButton(CUSTOM_IDS.eventRisk, labels.risk, ButtonStyle.Danger, "🎲"),
      makeButton(CUSTOM_IDS.eventSafe, labels.safe, ButtonStyle.Success, "🧭")
    );
  }

  if (player.dead) {
    addRow(
      makeButton(rescueId, "救援", ButtonStyle.Success, "💚"),
      makeButton(CUSTOM_IDS.revive, "自己復活", ButtonStyle.Success, "💚")
    );
    return rows;
  }

  if (onSurface) {
    addRow(
      ...getRunModeOptions(player).map((mode) => (
        makeButton(`${CUSTOM_IDS.modePrefix}:${mode.id}`, mode.label, ButtonStyle.Secondary, "🎴")
      )),
      makeButton(CUSTOM_IDS.rerollModes, "刷新詞條 10", ButtonStyle.Primary, "🔄")
    );
    addRow(
      makeButton(CUSTOM_IDS.bag, "包包", ButtonStyle.Secondary, "🎒"),
      makeButton(CUSTOM_IDS.exchangeOne, "鑄造紀念幣", ButtonStyle.Success, "🪙"),
      makeButton(CUSTOM_IDS.shopOpen, "商店購買", ButtonStyle.Success, "🏪"),
      makeButton(CUSTOM_IDS.bankDeposit, "存入銀行", ButtonStyle.Success, "🏦"),
      makeButton(CUSTOM_IDS.bankWithdraw, "領出銀行", ButtonStyle.Secondary, "💰")
    );
    addRow(makeButton(CUSTOM_IDS.leaderboard, "排行榜", ButtonStyle.Secondary, "🏆"));
    return rows;
  }

  if (inMine) {
    const digPaths = getDigPathOptions(player);
    const leftPath = digPaths.find((path) => path.side === "left") || { label: "左路" };
    const rightPath = digPaths.find((path) => path.side === "right") || { label: "右路" };
    addRow(
      makeButton(CUSTOM_IDS.mineLeft, `左:${leftPath.label}`, ButtonStyle.Primary, "⬅️"),
      makeButton(CUSTOM_IDS.mineRight, `右:${rightPath.label}`, ButtonStyle.Danger, "➡️"),
      makeButton(CUSTOM_IDS.returnSurface, "返回地面", ButtonStyle.Success, "🏠"),
      player.healingPotion > 0 ? makeButton(CUSTOM_IDS.drinkPotion, "喝治療藥水", ButtonStyle.Success, "🧪") : null
    );
    addRow(
      makeButton(CUSTOM_IDS.rustOne, "除鏽", ButtonStyle.Secondary, "🧽"),
      makeButton(CUSTOM_IDS.discardRustOne, "丟棄生鏽", ButtonStyle.Danger, "🗑️")
    );
    if (canChooseMinorBuff(player)) {
      addRow(
        makeButton(CUSTOM_IDS.buffGold, "金幣磁條", ButtonStyle.Secondary, "🧲"),
        makeButton(CUSTOM_IDS.buffBomb, "防爆磁條", ButtonStyle.Secondary, "🧲")
      );
    }
  }

  return rows;
}

function buildShopComponents(progressInput = {}) {
  const progress = {
    healingPotionUnlocked: false,
    undyingTotemUnlocked: false,
    ...progressInput
  };
  const rows = [];
  const firstRow = [
    makeButton(CUSTOM_IDS.shopBuyOne, "購買商店紀念幣", ButtonStyle.Success, "🪙")
  ];
  if (progress.healingPotionUnlocked) {
    firstRow.push(makeButton(CUSTOM_IDS.shopBuyPotion, "購買治療藥水", ButtonStyle.Success, "🧪"));
  }
  if (progress.undyingTotemUnlocked) {
    firstRow.push(makeButton(CUSTOM_IDS.shopBuyTotem, "購買不死圖騰", ButtonStyle.Success, "🗿"));
  }
  rows.push(new ActionRowBuilder().addComponents(...firstRow));
  rows.push(new ActionRowBuilder().addComponents(
    makeButton(CUSTOM_IDS.shopExit, "返回礦場", ButtonStyle.Secondary, "↩️")
  ));
  return rows;
}

function isMiningUiButton(customId) {
  return customId.startsWith("mine_ui:");
}

module.exports = {
  CUSTOM_IDS,
  buildCollectionEmbed,
  buildCollectionFiles,
  buildCollectionResponse,
  buildMiningEmbed,
  buildLeaderboardEmbed,
  buildHudFiles,
  buildPanelComponents,
  buildShopComponents,
  buildPanelEmbed,
  buildShopEmbed,
  isMiningUiButton
};

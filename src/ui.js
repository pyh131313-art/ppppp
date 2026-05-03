"use strict";

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { buildHudPng } = require("./hud-image");
const { buildInventoryPng } = require("./inventory-image");
const {
  getCollectibles,
  getCollectionTotal,
  getCollectionUniqueCount,
  getBagUsedSlots,
  getDepthLabel,
  getMaxBombs,
  getPlayer,
  getRunModeLabel,
  getShopItems
} = require("./game");

const CUSTOM_IDS = {
  mine: "mine_ui:mine",
  modeDouble: "mine_ui:mode_double",
  modeSafe: "mine_ui:mode_safe",
  buffGold: "mine_ui:buff_gold",
  buffBomb: "mine_ui:buff_bomb",
  bag: "mine_ui:bag",
  exchangeOne: "mine_ui:exchange_one",
  shopBuyOne: "mine_ui:shop_buy_one",
  rustOne: "mine_ui:rust_one",
  discardRustOne: "mine_ui:discard_rust_one",
  returnSurface: "mine_ui:return_surface",
  revive: "mine_ui:revive",
  rescuePrefix: "mine_ui:rescue"
};

const FAST_MODE = process.env.FAST_MODE !== "false";

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
  return [
    `金幣 ${player.gold}`,
    `礦石 ${player.ore}`,
    `生命 ${"♥".repeat(hp)}${".".repeat(maxHp - hp)} ${hp}/${maxHp}`,
    `方式 ${getRunModeLabel(player)}`,
    `磁條 金幣+${player.minorBuffs.gold * 5}% 防爆${player.minorBuffs.bomb}`,
    `深度 ${player.depth}｜${getDepthLabel(player.depth)}`
  ];
}

function getBagSlots(playerInput) {
  const player = getPlayer(playerInput);
  const collectibleSlots = getCollectibles()
    .filter((item) => (player.collection[item.id] || 0) > 0)
    .map((item) => ({
      icon: "🪙",
      label: `${item.name} x${player.collection[item.id]}`
    }));
  const rustySlots = Array.from({ length: player.rusty }, () => ({
    icon: "🟤",
    label: "生鏽紀念幣"
  }));

  return [...collectibleSlots, ...rustySlots].slice(0, 12);
}

function buildBagGrid(playerInput) {
  const slots = getBagSlots(playerInput);
  const cells = Array.from({ length: 12 }, (_, index) => {
    const slot = slots[index];
    return `${String(index + 1).padStart(2, "0")} ${slot ? slot.icon : "⬛"}`;
  });
  return [
    cells.slice(0, 4).join("　"),
    cells.slice(4, 8).join("　"),
    cells.slice(8, 12).join("　")
  ].join("\n");
}

function buildBagList(playerInput) {
  const slots = getBagSlots(playerInput);
  if (slots.length === 0) return "目前包包是空的。";
  return slots.map((slot, index) => `${index + 1}. ${slot.icon} ${slot.label}`).join("\n");
}

function getResultEmoji(kind) {
  const map = {
    gold: "🟡",
    ore: "⛏️",
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
  const bag = Array.from({ length: 12 }, (_, index) => {
    const slot = slots[index];
    return `${String(index + 1).padStart(2, "0")} ${slot ? slot.icon : "⬛"}`;
  });
  return [...mineLines, "", ...buildQuickStatus(playerInput), "", "包包", ...bag].join("\n");
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
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`礦井探險 | ${title}`)
    .setDescription(`${message}\n\n生鏽紀念幣離開礦坑會消失，除鏽成功才帶得走。`)
    .addFields({ name: "礦場", value: buildHudBlock(player, buildIdleMineScene()) });
  return addActorFooter(embed, user);
}

function buildHudFiles(playerInput, outcome = null) {
  if (FAST_MODE) return [];
  return [
    new AttachmentBuilder(buildHudPng(playerInput, outcome), {
      name: "mine-hud.png"
    })
  ];
}

function buildCollectionFiles(playerInput) {
  if (FAST_MODE) return [];
  return [
    new AttachmentBuilder(buildInventoryPng(playerInput), {
      name: "coin-bag.png"
    })
  ];
}

function buildMiningEmbed(outcome, user = null) {
  const player = getPlayer(outcome.player);
  const color = player.dead ? 0x7f1d1d : player.bombs > 0 ? 0xf59e0b : 0x16a34a;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`礦井探險 | ${outcome.title}`)
    .setDescription(outcome.message)
    .addFields({ name: "礦場", value: buildHudBlock(player, buildMineEmojiScene(outcome)) });
  return addActorFooter(embed, user);
}

function buildCollectionEmbed(playerInput, message = "這是你的收藏紀念幣圖鑑。") {
  const player = getPlayer(playerInput);
  const unique = getCollectionUniqueCount(player);
  const all = getCollectibles().length;
  const total = getCollectionTotal(player);
  const slots = getBagUsedSlots(player);
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle("紀念幣包包")
    .setDescription([
      message,
      "",
      `總數：${total}`,
      `格數：${slots}/12`,
      `種類：${unique}/${all} ${progressBar(unique, all, 12)}`
    ].join("\n"))
    .addFields(
      { name: "12 格物品欄", value: buildBagGrid(player) },
      { name: "內容", value: buildBagList(player).slice(0, 1024) }
    )
    .setFooter({ text: `目前開放：${all} 種紀念幣。` });

  if (!FAST_MODE) embed.setImage("attachment://coin-bag.png");

  return embed;
}

function buildShopEmbed(playerInput, message = "商店限定紀念幣只能用金幣購買，挖礦、鑄造、除鏽都不會出。") {
  const player = getPlayer(playerInput);
  const lines = getShopItems().map((item) => {
    const owned = player.collection[item.id] || 0;
    return `${item.collectible.name}｜${item.collectible.rarity}｜${item.priceGold} 金幣｜持有 ${owned}`;
  });

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("商店")
    .setDescription([message, "", `你的金幣：${player.gold}`, "", ...lines].join("\n"));
}

function makeButton(customId, label, style = ButtonStyle.Secondary, emoji = null) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
  if (emoji) button.setEmoji(emoji);
  return button;
}

function buildPanelComponents(targetUserId = null) {
  const rescueId = targetUserId
    ? `${CUSTOM_IDS.rescuePrefix}:${targetUserId}`
    : `${CUSTOM_IDS.rescuePrefix}:none`;
  return [
    new ActionRowBuilder().addComponents(
      makeButton(CUSTOM_IDS.modeDouble, "雙倍採集", ButtonStyle.Secondary, "⚡"),
      makeButton(CUSTOM_IDS.modeSafe, "安全血量", ButtonStyle.Secondary, "🛡️"),
      makeButton(CUSTOM_IDS.mine, "深入挖礦", ButtonStyle.Primary, "⛏️"),
      makeButton(CUSTOM_IDS.returnSurface, "返回地面", ButtonStyle.Success, "🏠")
    ),
    new ActionRowBuilder().addComponents(
      makeButton(CUSTOM_IDS.buffGold, "金幣磁條", ButtonStyle.Secondary, "🧲"),
      makeButton(CUSTOM_IDS.buffBomb, "防爆磁條", ButtonStyle.Secondary, "🧲"),
      makeButton(rescueId, "救援", ButtonStyle.Success, "💚"),
      makeButton(CUSTOM_IDS.revive, "自己復活", ButtonStyle.Success, "💚")
    ),
    new ActionRowBuilder().addComponents(
      makeButton(CUSTOM_IDS.bag, "包包", ButtonStyle.Secondary, "🎒"),
      makeButton(CUSTOM_IDS.exchangeOne, "鑄造紀念幣", ButtonStyle.Success, "🪙"),
      makeButton(CUSTOM_IDS.shopBuyOne, "商店購買", ButtonStyle.Success, "🏪"),
      makeButton(CUSTOM_IDS.rustOne, "除鏽", ButtonStyle.Secondary, "🧽"),
      makeButton(CUSTOM_IDS.discardRustOne, "丟棄生鏽", ButtonStyle.Danger, "🗑️")
    )
  ];
}

function isMiningUiButton(customId) {
  return customId.startsWith("mine_ui:");
}

module.exports = {
  CUSTOM_IDS,
  buildCollectionEmbed,
  buildCollectionFiles,
  buildMiningEmbed,
  buildHudFiles,
  buildPanelComponents,
  buildPanelEmbed,
  buildShopEmbed,
  isMiningUiButton
};

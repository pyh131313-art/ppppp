"use strict";

const path = require("node:path");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
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
  getAreaLabel,
  getDepthLabel,
  getDigPathOptions,
  getElevatorCost,
  getMaxBombs,
  getMinorBuffEffectiveStacks,
  getMinorBuffOptions,
  getPlayer,
  getRandomEvent,
  getRunModeOptions,
  getRunModeLabel,
  getShopConsumables,
  getShopItems
} = require("./game");
const { describeMarket, normalizeGlobalState } = require("./globalState");

const CUSTOM_IDS = {
  mine: "mine_ui:mine",
  mineLeft: "mine_ui:mine_left",
  mineRight: "mine_ui:mine_right",
  minePathPrefix: "mine_ui:path",
  pagePrefix: "mine_ui:page",
  uiModePrefix: "mine_ui:ui",
  chargePrefix: "mine_ui:charge",
  rerollModes: "mine_ui:reroll_modes",
  modePrefix: "mine_ui:mode",
  modeDouble: "mine_ui:mode_double",
  modeSafe: "mine_ui:mode_safe",
  buffGold: "mine_ui:buff_gold",
  buffBomb: "mine_ui:buff_bomb",
  buffPrefix: "mine_ui:buff",
  bag: "mine_ui:bag",
  leaderboard: "mine_ui:leaderboard",
  bankOpen: "mine_ui:bank_open",
  bankDeposit: "mine_ui:bank_deposit",
  bankWithdraw: "mine_ui:bank_withdraw",
  eventRisk: "mine_ui:event:risk",
  eventSafe: "mine_ui:event:safe",
  eventExtreme: "mine_ui:event:extreme",
  exchangeOne: "mine_ui:exchange_one",
  shopBuyOne: "mine_ui:shop_buy_one",
  shopOpen: "mine_ui:shop_open",
  shopBuyPotion: "mine_ui:shop_buy_potion",
  shopBuyTotem: "mine_ui:shop_buy_totem",
  shopShimmer: "mine_ui:shop_shimmer",
  shopExit: "mine_ui:shop_exit",
  drinkPotion: "mine_ui:drink_potion",
  rustOne: "mine_ui:rust_one",
  discardRustOne: "mine_ui:discard_rust_one",
  returnSurface: "mine_ui:return_surface",
  undergroundCamp: "mine_ui:underground_camp",
  undergroundInn: "mine_ui:underground_inn",
  undergroundStorage: "mine_ui:underground_storage",
  storageDeposit: "mine_ui:storage_deposit",
  storageWithdraw: "mine_ui:storage_withdraw",
  revive: "mine_ui:revive",
  rescuePrefix: "mine_ui:rescue"
};

const STACK_SIZE = 10;

const HUD_PAGES = {
  main: "主",
  bag: "背包",
  resources: "資源",
  detail: "詳細"
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

function normalizeHudPage(page) {
  return Object.prototype.hasOwnProperty.call(HUD_PAGES, page) ? page : "main";
}

function buildCoreStatus(playerInput) {
  const player = getPlayer(playerInput);
  const maxHp = getMaxBombs(player);
  const hp = player.dead ? 0 : Math.max(0, maxHp - player.bombs);
  const digPaths = player.runMode ? getDigPathOptions(player) : [];
  const pathName = (path) => {
    if (path.side === "left") return `← ${path.label}`;
    if (path.side === "right") return `${path.label} →`;
    return `↓ ${path.label}`;
  };
  const digPathText = player.zone === "upward"
    ? "往上挖路線"
    : player.zone === "lavaPool"
      ? "穿越岩漿池"
      : (digPaths.length ? digPaths.map(pathName).join(" ｜ ") : "無");
  return { player, maxHp, hp, digPathText };
}

function formatHpValue(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function buildHpIcons(hp, maxHp) {
  const full = Math.floor(hp);
  const half = hp % 1 >= 0.5 ? 1 : 0;
  const empty = Math.max(0, maxHp - full - half);
  return `${"❤️".repeat(full)}${half ? "💔" : ""}${"🤍".repeat(empty)}`;
}

function buildMainPage(playerInput) {
  const { player, maxHp, hp, digPathText } = buildCoreStatus(playerInput);
  return [
    "🎒 狀態",
    `生命：${buildHpIcons(hp, maxHp)} (${formatHpValue(hp)}/${maxHp})`,
    `金幣：${player.gold} ｜ 銀行：${player.bankGold}`,
    `深度：${player.depth}｜本趟${player.runDepthProgress || 0} / 最深${player.stats.bestDepth}（${getDepthLabel(player.depth)}）`,
    `區域：${getAreaLabel(player)}`,
    `路線：${digPathText}`
  ];
}

function buildBagPage(playerInput) {
  const player = getPlayer(playerInput);
  return [
    `🎒 包包（${getBagUsedSlots(player)}/${getBagCapacity(player)}）`,
    buildBagGrid(player)
  ];
}

function buildResourcesPage(playerInput) {
  const player = getPlayer(playerInput);
  return [
    "📦 資源",
    `礦石：${player.ore}｜金礦：${player.goldOre}｜鉑金：${player.platinumOre}`,
    `加工：${player.goldBlock + player.oreIngot}｜金錠：${player.goldOreIngot}｜鉑金錠：${player.platinumOreIngot}`,
    `寶石：🔴${player.redGem} 🔵${player.blueGem} 🟢${player.greenGem}`,
    `反轉：顛礦${player.invertedOre}｜顛寶${player.invertedGem}｜奧利哈鋼${player.orichalcum}`,
    `特殊：💣${player.bombItem}｜鏽${player.rusty}｜破爛${player.junk}｜白金${player.platinumJunk}`
  ];
}

function buildDetailPage(playerInput) {
  const { player, digPathText } = buildCoreStatus(playerInput);
  const curse = player.tempEffects.find((effect) => effect.id === "ancient_curse" && effect.remaining > 0);
  return [
    "⚙️ 配置",
    `詞條：${getRunModeLabel(player)}`,
    `路線：${digPathText}`,
    `磁條：金幣+${Math.round(getMinorBuffEffectiveStacks(player, "gold") * 5)}%｜防爆${getMinorBuffEffectiveStacks(player, "bomb").toFixed(1).replace(/\.0$/, "")}`,
    "",
    "📦 資源",
    `礦石：${player.ore}｜金礦：${player.goldOre}｜鉑金：${player.platinumOre}`,
    `加工：${player.goldBlock + player.oreIngot}｜金錠：${player.goldOreIngot}｜鉑金錠：${player.platinumOreIngot}`,
    `寶石：🔴${player.redGem} 🔵${player.blueGem} 🟢${player.greenGem}`,
    `特殊：💣${player.bombItem}｜鏽${player.rusty}｜破爛${player.junk}｜白金${player.platinumJunk}`,
    "",
    `🎒 包包（${getBagUsedSlots(player)}/${getBagCapacity(player)}）`,
    buildBagGrid(player),
    "",
    "📌 狀態效果",
    buildStatusEffects(player, curse),
    "",
    "🧭 礦洞",
    getAreaLabel(player)
  ].filter((line) => line !== null);
}

function buildHudPage(playerInput, page = "main") {
  const normalizedPage = normalizeHudPage(page);
  if (normalizedPage === "bag") return buildBagPage(playerInput);
  if (normalizedPage === "resources") return buildResourcesPage(playerInput);
  if (normalizedPage === "detail") return buildDetailPage(playerInput);
  return buildMainPage(playerInput);
}

function getBagSlots(playerInput) {
  const player = getPlayer(playerInput);
  const capacity = getBagCapacity(player);
  const makeStackSlots = (amount, icon, label) => (
    Array.from({ length: Math.ceil(Math.max(0, amount || 0) / STACK_SIZE) }, (_, index) => {
      const count = Math.min(STACK_SIZE, amount - index * STACK_SIZE);
      return {
        icon,
        label: `${label} x${count}`
      };
    })
  );
  const rustySlots = Array.from({ length: player.rusty }, () => ({
    icon: "🟤",
    label: "生鏽紀念幣"
  }));
  const oreSlots = makeStackSlots(player.ore, "⛏️", "礦石");
  const goldOreSlots = makeStackSlots(player.goldOre, "🟨", "金礦石");
  const platinumOreSlots = makeStackSlots(player.platinumOre, "◻️", "鉑金礦石");
  const goldBlockSlots = Array.from({ length: player.goldBlock }, () => ({
    icon: "🧈",
    label: "金塊"
  }));
  const oreIngotSlots = makeStackSlots(player.oreIngot, "🔶", "礦錠");
  const goldOreIngotSlots = makeStackSlots(player.goldOreIngot, "🔷", "金錠");
  const platinumOreIngotSlots = makeStackSlots(player.platinumOreIngot, "🔳", "鉑金錠");
  const bombItemSlots = Array.from({ length: player.bombItem }, () => ({
    icon: "💣",
    label: "完整炸彈"
  }));
  const helmetSlots = Array.from({ length: player.minerHelmetCount }, () => ({
    icon: "⛑️",
    label: "礦工帽"
  }));
  const redGemSlots = makeStackSlots(player.redGem, "🔴", "紅寶石");
  const blueGemSlots = makeStackSlots(player.blueGem, "🔵", "藍寶石");
  const greenGemSlots = makeStackSlots(player.greenGem, "🟢", "綠寶石");
  const invertedOreSlots = makeStackSlots(player.invertedOre, "🔻", "顛倒礦石");
  const invertedGemSlots = makeStackSlots(player.invertedGem, "💠", "顛倒寶石");
  const orichalcumSlots = Array.from({ length: player.orichalcum }, () => ({
    icon: "🌟",
    label: "奧利哈鋼"
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
    ...helmetSlots,
    ...redGemSlots,
    ...blueGemSlots,
    ...greenGemSlots,
    ...invertedOreSlots,
    ...invertedGemSlots,
    ...orichalcumSlots,
    ...junkSlots,
    ...platinumJunkSlots
  ].slice(0, capacity);
}

function buildBagGrid(playerInput) {
  const slots = getBagSlots(playerInput);
  const capacity = getBagCapacity(playerInput);
  const cellCount = Math.max(16, Math.ceil(capacity / 4) * 4);
  const cells = Array.from({ length: cellCount }, (_, index) => {
    if (index >= capacity) return "　";
    const slot = slots[index];
    return slot ? slot.icon : "⬛";
  });
  const rows = [];
  for (let index = 0; index < cells.length; index += 4) {
    rows.push(cells.slice(index, index + 4).join(" "));
  }
  return rows.join("\n");
}

function buildChargeBar(playerInput) {
  const player = getPlayer(playerInput);
  const value = Math.max(0, Math.min(100, player.chargeValue || 0));
  const filled = Math.floor(value / 10);
  const bar = `${"🟩".repeat(filled)}${"⬛".repeat(10 - filled)}`;
  return value >= 100 ? `蓄力：${bar} 可爆發` : `蓄力：${bar} ${value}/100`;
}

function buildStatusEffects(playerInput, curse = null) {
  const player = getPlayer(playerInput);
  const effects = [];
  if (player.pendingEvent) effects.push(`事件：${getRandomEvent(player.pendingEvent).title}`);
  if (curse) effects.push(`古代詛咒：${curse.remaining}層`);
  if (player.tempEffects.length > 0) {
    effects.push(...player.tempEffects
      .filter((effect) => effect.id !== "ancient_curse")
      .map((effect) => `${formatEffectName(effect.id)}：${effect.remaining}層`));
  }
  if (player.goldBeast) effects.push(`吞金獸：第${player.goldBeast.returnDepth}層`);
  if (player.potionCooldown > 0) effects.push(`藥水CD：${player.potionCooldown}層`);
  if (player.minerHelmetCount > 0) effects.push(`礦工帽：${player.minerHelmetCount}`);
  if ((player.pendingNextRunTraits || []).length > 0) effects.push(`下場限定詞條：${player.pendingNextRunTraits.length}`);
  if (player.returnBlessing) effects.push("歸還祝福");
  if (player.rescueBonusCount > 0) effects.push(`救援小詞條 x${player.rescueBonusCount}`);
  if (player.comboCount > 0) {
    effects.push(`連擊：${player.comboCount}｜最高 ${player.maxCombo}`);
    if (player.comboCount >= 3) effects.push(player.comboCount >= 5 ? "危險提升 x2" : "危險提升 x1.5");
  }
  effects.push(buildChargeBar(player));
  if (player.lastChargeSkillUsed) {
    const names = { reward: "收益爆發", safe: "穩定爆發", resource: "資源爆發" };
    effects.push(`上次蓄力：${names[player.lastChargeSkillUsed] || player.lastChargeSkillUsed}`);
  }
  return effects.length ? effects.join("\n") : "無";
}

function formatEffectName(effectId) {
  const map = {
    powder_safe: "避開火藥",
    powder_extreme: "火藥衝刺",
    stream_safe: "地下水脈",
    stream_extreme: "水脈衝刺",
    remains_extreme: "殘骸包",
    magnetic_extreme: "磁場中心",
    magnetic_risk: "異常磁場",
    whisper_extreme: "裂縫低語",
    core_extreme: "爆裂礦核",
    core_bomb: "礦核危險",
    gas_extreme: "腐蝕氣體",
    repeat_layer: "時間錯位"
  };
  return map[effectId] || effectId;
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
    invertedOre: "🔻",
    invertedGem: "💠",
    orichalcum: "🌟",
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
    invertedOre: "顛倒礦石",
    invertedGem: "顛倒寶石",
    orichalcum: "奧利哈鋼",
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

function getResultFace(kind) {
  const map = {
    gold: "(ﾉ>ω<)ﾉ",
    ore: "(ง •̀_•́)ง",
    goldOre: "(ง •̀_•́)ง",
    platinumOre: "(ง •̀_•́)ง",
    goldBlock: "(ﾉ>ω<)ﾉ",
    oreIngot: "(ง •̀_•́)ง",
    goldOreIngot: "(ง •̀_•́)ง",
    platinumOreIngot: "(ง •̀_•́)ง",
    bombItem: "(๑•̀ㅂ•́)و",
    junk: "(´･_･`)",
    redGem: "( ✧Д✧)",
    blueGem: "( ✧Д✧)",
    greenGem: "( ✧Д✧)",
    invertedOre: "(↟ω↟)",
    invertedGem: "(↟ω↟)",
    orichalcum: "( ✧Д✧)",
    stalactite: "(；ﾟДﾟ)",
    platinumJunk: "(´･_･`)",
    rusty: "(｡･ω･｡)",
    bomb: "(；ﾟДﾟ)",
    dead: "(×﹏×)",
    full: "(；´д｀)",
    empty: "(´-ω-`)",
    blocked: "(；一_一)"
  };
  return map[kind] || "(´-ω-`)";
}

function getResultAction(kind) {
  const map = {
    gold: "眼前閃了一下",
    ore: "石壁裂開了",
    goldOre: "深處露出金光",
    platinumOre: "冷白色礦脈浮現",
    goldBlock: "火焰把金幣燒成塊",
    oreIngot: "礦石被燒成錠",
    goldOreIngot: "金礦被燒成錠",
    platinumOreIngot: "鉑金礦被燒成錠",
    bombItem: "完整拆下一顆炸彈",
    junk: "挖出一大團破爛",
    redGem: "寶石在黑暗中發光",
    blueGem: "寶石在黑暗中發光",
    greenGem: "寶石在黑暗中發光",
    invertedOre: "礦石往上掉了出來",
    invertedGem: "寶石倒映著天空",
    orichalcum: "未知金屬發出星光",
    stalactite: "頭頂突然崩落",
    platinumJunk: "沉重破爛卡住包包",
    rusty: "泥土裡露出鏽光",
    bomb: "腳邊傳來滴答聲",
    dead: "整個礦道炸開",
    full: "包包塞不下了",
    empty: "只有碎石滾下來",
    blocked: "現在不能繼續挖"
  };
  return map[kind] || "只有碎石滾下來";
}

function buildMineEmojiScene(outcome) {
  const result = getResultEmoji(outcome.kind);
  const face = getResultFace(outcome.kind);
  return [
    `⛏️ ${face}`,
    `⌞ ${getResultAction(outcome.kind)}`,
    `${result} 掉落：${getResultLabel(outcome.kind)}`
  ];
}

function buildIdleMineScene() {
  return ["🔎 等待掃描", "⛏️ 準備開採", "⬛ 尚未掉落"];
}

function buildHudBlock(playerInput, mineLines, page = "main") {
  void mineLines;
  const player = getPlayer(playerInput);
  if (player.uiMode === "compact") return buildCompactHudBlock(player);
  return ["⛏️【礦井探險】", "", ...buildHudPage(playerInput, page)].join("\n");
}

function buildCompactHudBlock(playerInput) {
  const { player, maxHp, hp, digPathText } = buildCoreStatus(playerInput);
  return [
    "⛏️【礦井探險｜精簡】",
    "",
    `生命：${buildHpIcons(hp, maxHp)} ${formatHpValue(hp)}/${maxHp}`,
    `深度：${player.depth}｜本趟${player.runDepthProgress || 0}｜最深${player.stats.bestDepth}`,
    "",
    `🎒 包包（${getBagUsedSlots(player)}/${getBagCapacity(player)}）`,
    buildBagGrid(player),
    "",
    buildChargeBar(player),
    "",
    "路線：",
    digPathText
  ].join("\n");
}

function buildRunModeSelectionText(playerInput) {
  const player = getPlayer(playerInput);
  if (player.dead || player.runMode) return "";
  const options = getRunModeOptions(player);
  if (options.length === 0) return "";
  const numbers = ["①", "②"];
  const lines = options.map((mode, index) => [
    `${numbers[index] || `${index + 1}.`} ${mode.name || mode.label}`,
    mode.shortDescription || "效果未明"
  ].join("\n"));
  return ["", ...lines, "", "👉 按下方數字選擇"].join("\n");
}

function getDisplayName(user) {
  return user ? user.displayName || user.globalName || user.username : null;
}

function addActorFooter(embed, user) {
  const name = getDisplayName(user);
  if (!name) return embed;
  return embed.setFooter({ text: `玩家：${name}` });
}

function buildPanelEmbed(playerInput, title = "礦場面板", message = "選擇下方按鈕開始挖礦。", user = null, page = "main") {
  const player = getPlayer(playerInput);
  const color = player.dead ? 0x7f1d1d : player.bombs > 0 ? 0xf59e0b : 0x16a34a;
  const event = player.pendingEvent ? getRandomEvent(player.pendingEvent) : null;
  const compact = player.uiMode === "compact";
  const eventText = !compact && event ? `\n\n目前事件：${event.title}\n${event.description}` : "";
  const selectionText = buildRunModeSelectionText(player);
  const migrationText = player.lastMigrationMessage ? `${player.lastMigrationMessage}\n\n` : "";
  const description = compact
    ? `${migrationText}${message || ""}${selectionText}` || " "
    : `${migrationText}${message}\n\n生鏽紀念幣離開礦坑會消失，除鏽成功才帶得走。${selectionText}${eventText}`;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`礦井探險 | ${title}`)
    .setDescription(description)
    .addFields({ name: "礦場", value: buildHudBlock(player, buildIdleMineScene(), page) });
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

function buildMiningEmbed(outcome, user = null, page = "main") {
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
    .addFields({ name: "礦場", value: buildHudBlock(player, buildMineEmojiScene(outcome), page) });
  return addActorFooter(embed, user);
}

function buildLeaderboardEmbed(playersInput = {}) {
  const progress = getCommunityProgress(playersInput);
  const rows = Object.entries(playersInput)
    .filter(([userId]) => userId !== "__global")
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
  const globalState = progressInput.globalState ? normalizeGlobalState(progressInput.globalState) : null;
  const lines = getShopItems().map((item) => {
    const owned = player.collection[item.id] || 0;
    return `${item.collectible.name}｜${item.collectible.rarity}｜${item.priceGold} 金幣｜持有 ${owned}`;
  });
  const consumableLines = getShopConsumables(progressInput).map((item) => {
    const owned = player[item.id] || 0;
    if (item.id === "healingPotion") {
      const today = new Date().toISOString().slice(0, 10);
      const bought = player.potionPurchaseDay === today ? player.potionPurchasesToday || 0 : 0;
      return `${item.label}：${item.priceGold} 金幣\n今日限購：${bought} / ${item.dailyLimit}｜持有 ${owned}`;
    }
    return `${item.label}｜${item.priceGold} 金幣｜持有 ${owned}`;
  });

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("商店")
    .setDescription([
      message,
      "",
      `你的金幣：${player.gold}`,
      "",
      ...lines,
      ...(consumableLines.length ? ["", "共同任務商品", ...consumableLines] : []),
      "",
      "微光池",
      "投入 400 金幣和 1 枚自選紀念幣，隨機轉換成另一枚紀念幣。",
      "",
      "供需行情",
      ...(globalState ? describeMarket(globalState) : ["尚未載入"])
    ].join("\n"));
}

function makeButton(customId, label, style = ButtonStyle.Secondary, emoji = null) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
  if (emoji) button.setEmoji(emoji);
  return button;
}

function makePageButton(page, activePage, targetUserId = null) {
  const idTarget = targetUserId || "none";
  const active = activePage !== null && normalizeHudPage(activePage) === page;
  return makeButton(
    `${CUSTOM_IDS.pagePrefix}:${page}:${idTarget}`,
    HUD_PAGES[page],
    active ? ButtonStyle.Primary : ButtonStyle.Secondary
  );
}

function makeUiModeButton(mode, playerInput, targetUserId = null, activeOverride = null) {
  const player = getPlayer(playerInput);
  const active = activeOverride === null ? player.uiMode === mode : activeOverride;
  const idTarget = targetUserId || "none";
  return makeButton(
    `${CUSTOM_IDS.uiModePrefix}:${mode}:${idTarget}`,
    mode === "compact" ? "精簡" : "完整",
    active ? ButtonStyle.Primary : ButtonStyle.Secondary
  );
}

function getEventButtonLabels(eventId) {
  const event = getRandomEvent(eventId);
  if (event && event.buttons) return event.buttons;
  return {
    risk: "冒險選項",
    safe: "保守選項"
  };
}

function buildPanelComponents(targetUserId = null, playerInput = null, progressInput = {}, page = "main") {
  const player = getPlayer(playerInput);
  const hudPage = player.uiMode === "compact" ? null : normalizeHudPage(page);
  const modeNumbers = ["①", "②"];
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
      makeButton(CUSTOM_IDS.eventSafe, labels.safe, ButtonStyle.Success, "🧭"),
      labels.extreme ? makeButton(CUSTOM_IDS.eventExtreme, labels.extreme, ButtonStyle.Danger, "🔥") : null
    );
  }

  addRow(
    makePageButton("main", hudPage, targetUserId),
    makePageButton("bag", hudPage, targetUserId),
    makePageButton("resources", hudPage, targetUserId),
    makePageButton("detail", hudPage, targetUserId),
    makeUiModeButton("compact", player, targetUserId, player.uiMode === "compact")
  );

  if (player.dead) {
    addRow(
      makeButton(rescueId, "救援", ButtonStyle.Success, "💚"),
      makeButton(CUSTOM_IDS.revive, "自己復活", ButtonStyle.Success, "💚")
    );
    return rows;
  }

  if (player.zone === "undergroundCamp") {
    addRow(
      ...getRunModeOptions(player).map((mode, index) => (
        makeButton(`${CUSTOM_IDS.modePrefix}:${mode.id}`, `${modeNumbers[index] || index + 1} ${mode.name || mode.label}`, ButtonStyle.Secondary, "🎴")
      )),
      makeButton(CUSTOM_IDS.rerollModes, "刷新詞條 10", ButtonStyle.Primary, "🔄")
    );
    if (player.runMode) addRow(makeButton(CUSTOM_IDS.mine, "開始往上挖", ButtonStyle.Primary, "⬆️"));
    addRow(
      makeButton(CUSTOM_IDS.undergroundInn, "地底客棧", ButtonStyle.Secondary, "🏨"),
      makeButton(CUSTOM_IDS.undergroundStorage, "倉庫", ButtonStyle.Secondary, "📦"),
      makeButton(CUSTOM_IDS.returnSurface, `付費電梯回地表 (${getElevatorCost(player)})`, ButtonStyle.Success, "🛗")
    );
    addRow(
      makeButton(CUSTOM_IDS.shopOpen, "商店", ButtonStyle.Success, "🏪"),
      makeButton(CUSTOM_IDS.bankOpen, "銀行", ButtonStyle.Success, "🏦")
    );
    return rows;
  }

  if (player.zone === "skyDown") {
    addRow(
      makeButton(CUSTOM_IDS.mine, "繼續往下挖", ButtonStyle.Primary, "⬇️"),
      makeButton(CUSTOM_IDS.returnSurface, "返回天上營地", ButtonStyle.Success, "↩️")
    );
    return rows;
  }

  if (player.zone === "skyCamp") {
    addRow(
      makeButton(CUSTOM_IDS.mine, "往下挖", ButtonStyle.Primary, "⬇️"),
      makeButton(CUSTOM_IDS.undergroundStorage, "倉庫", ButtonStyle.Secondary, "📦"),
      makeButton(CUSTOM_IDS.returnSurface, `付費電梯回地表 (${getElevatorCost(player)})`, ButtonStyle.Success, "🛗")
    );
    return rows;
  }

  if (onSurface) {
    addRow(
      ...getRunModeOptions(player).map((mode, index) => (
        makeButton(`${CUSTOM_IDS.modePrefix}:${mode.id}`, `${modeNumbers[index] || index + 1} ${mode.name || mode.label}`, ButtonStyle.Secondary, "🎴")
      )),
      makeButton(CUSTOM_IDS.rerollModes, "刷新詞條 10", ButtonStyle.Primary, "🔄")
    );
    addRow(
      makeButton(CUSTOM_IDS.bag, "包包", ButtonStyle.Secondary, "🎒"),
      makeButton(CUSTOM_IDS.undergroundStorage, "倉庫", ButtonStyle.Secondary, "📦"),
      makeButton(CUSTOM_IDS.shopOpen, "商店", ButtonStyle.Success, "🏪"),
      makeButton(CUSTOM_IDS.bankOpen, "銀行", ButtonStyle.Success, "🏦")
    );
    if (player.undergroundCampUnlocked) {
      addRow(makeButton(CUSTOM_IDS.undergroundCamp, `搭乘電梯前往地底營地 (${getElevatorCost(player)})`, ButtonStyle.Primary, "🛗"));
    }
    addRow(makeButton(CUSTOM_IDS.leaderboard, "排行榜", ButtonStyle.Secondary, "🏆"));
    return rows;
  }

  if (inMine) {
    if (player.zone === "upward" || player.zone === "lavaPool") {
      addRow(
        makeButton(CUSTOM_IDS.mine, player.zone === "lavaPool" ? "穿越岩漿" : "往上挖", ButtonStyle.Primary, player.zone === "lavaPool" ? "🌋" : "⬆️"),
        makeButton(CUSTOM_IDS.returnSurface, "返回地面", ButtonStyle.Success, "🏠"),
        player.healingPotion > 0 ? makeButton(CUSTOM_IDS.drinkPotion, "喝治療藥水", ButtonStyle.Success, "🧪") : null
      );
    } else {
    const digPaths = getDigPathOptions(player);
    const sideText = {
      left: "左",
      middle: "中",
      right: "右"
    };
    const sideEmoji = {
      left: "⬅️",
      middle: "⬇️",
      right: "➡️"
    };
    addRow(
      ...digPaths.map((path) => (
        makeButton(
          `${CUSTOM_IDS.minePathPrefix}:${path.side}`,
          `${sideText[path.side] || "路"}:${path.label}`,
          path.side === "right" ? ButtonStyle.Danger : ButtonStyle.Primary,
          sideEmoji[path.side] || "⛏️"
        )
      )),
      makeButton(CUSTOM_IDS.returnSurface, "返回地面", ButtonStyle.Success, "🏠"),
      player.healingPotion > 0 ? makeButton(CUSTOM_IDS.drinkPotion, "喝治療藥水", ButtonStyle.Success, "🧪") : null
    );
    }
    addRow(
      makeButton(CUSTOM_IDS.rustOne, "除鏽", ButtonStyle.Secondary, "🧽"),
      makeButton(CUSTOM_IDS.discardRustOne, "丟棄生鏽", ButtonStyle.Danger, "🗑️")
    );
    if (!player.pendingEvent && (player.chargeValue || 0) >= 100) {
      addRow(
        makeButton(`${CUSTOM_IDS.chargePrefix}:reward`, "收益爆發", ButtonStyle.Success, "⚡").setDisabled(player.lastChargeSkillUsed === "reward"),
        makeButton(`${CUSTOM_IDS.chargePrefix}:safe`, "穩定爆發", ButtonStyle.Success, "🛡️").setDisabled(player.lastChargeSkillUsed === "safe"),
        makeButton(`${CUSTOM_IDS.chargePrefix}:resource`, "資源爆發", ButtonStyle.Success, "💎").setDisabled(player.lastChargeSkillUsed === "resource")
      );
    }
    if (canChooseMinorBuff(player)) {
      const buffs = getMinorBuffOptions(player);
      if (buffs.some((buff) => buff.breakthrough)) {
        addRow(makeButton("mine_ui:breakthrough_notice", "✨ 突破詞條出現", ButtonStyle.Secondary, "✨").setDisabled(true));
      }
      addRow(...buffs.map((buff) => (
        makeButton(
          `${CUSTOM_IDS.buffPrefix}:${buff.id}`,
          `${buff.breakthrough ? "✨ " : ""}${buff.label}${buff.breakthrough ? " 突破" : ""}`,
          ButtonStyle.Secondary,
          "🧲"
        )
      )));
    }
  }

  return rows;
}

function buildShopComponents(progressInput = {}, playerInput = null, targetUserId = null) {
  const player = getPlayer(playerInput);
  const progress = {
    healingPotionUnlocked: false,
    undyingTotemUnlocked: false,
    ...progressInput
  };
  const rows = [];
  const firstRow = [
    makeButton(CUSTOM_IDS.shopBuyOne, "購買商店紀念幣", ButtonStyle.Success, "🪙"),
    makeButton(CUSTOM_IDS.exchangeOne, "鑄造紀念幣", ButtonStyle.Success, "🪙")
  ];
  if (progress.healingPotionUnlocked) {
    firstRow.push(makeButton(CUSTOM_IDS.shopBuyPotion, "購買治療藥水", ButtonStyle.Success, "🧪"));
  }
  if (progress.undyingTotemUnlocked) {
    firstRow.push(makeButton(CUSTOM_IDS.shopBuyTotem, "購買不死圖騰", ButtonStyle.Success, "🗿"));
  }
  rows.push(new ActionRowBuilder().addComponents(...firstRow));
  const ownedCollectibles = getCollectibles()
    .filter((item) => (player.collection[item.id] || 0) > 0)
    .slice(0, 25);
  if (ownedCollectibles.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(CUSTOM_IDS.shopShimmer)
        .setPlaceholder("微光池：選 1 枚紀念幣轉換")
        .addOptions(ownedCollectibles.map((item) => ({
          label: item.name.slice(0, 100),
          description: `${item.rarity}｜持有 ${player.collection[item.id] || 0}`.slice(0, 100),
          value: item.id
        })))
    ));
  } else {
    rows.push(new ActionRowBuilder().addComponents(
      makeButton(`${CUSTOM_IDS.shopShimmer}:none`, "微光池需要紀念幣", ButtonStyle.Secondary, "✨").setDisabled(true)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    makeButton(targetUserId ? `${CUSTOM_IDS.shopExit}:${targetUserId}` : CUSTOM_IDS.shopExit, "返回礦場", ButtonStyle.Secondary, "↩️")
  ));
  return rows;
}

function buildBankComponents(targetUserId = null) {
  const idSuffix = targetUserId ? `:${targetUserId}` : "";
  return [
    new ActionRowBuilder().addComponents(
      makeButton(`${CUSTOM_IDS.bankDeposit}${idSuffix}`, "存入金額", ButtonStyle.Success, "🏦"),
      makeButton(`${CUSTOM_IDS.bankWithdraw}${idSuffix}`, "領出金額", ButtonStyle.Primary, "💰"),
      makeButton(CUSTOM_IDS.shopExit, "返回礦場", ButtonStyle.Secondary, "↩️")
    )
  ];
}

function buildStorageComponents() {
  return [
    new ActionRowBuilder().addComponents(
      makeButton(CUSTOM_IDS.storageDeposit, "指定存入", ButtonStyle.Success, "📥"),
      makeButton(CUSTOM_IDS.storageWithdraw, "指定取出", ButtonStyle.Primary, "📤"),
      makeButton(CUSTOM_IDS.shopExit, "返回礦場", ButtonStyle.Secondary, "↩️")
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
  buildCollectionResponse,
  buildMiningEmbed,
  buildLeaderboardEmbed,
  buildHudFiles,
  buildPanelComponents,
  buildBankComponents,
  buildShopComponents,
  buildStorageComponents,
  buildPanelEmbed,
  buildShopEmbed,
  isMiningUiButton
};

"use strict";

require("dotenv").config();

const {
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  Client,
  Events,
  GatewayIntentBits
} = require("discord.js");
const zlib = require("node:zlib");
const { cleanEnvValue } = require("./env");
const { registerApplicationCommands } = require("./register-app-commands");
const {
  buyShopItem,
  buySupplyStationItem,
  buyUndergroundInnItem,
  chooseMinorBuff,
  chooseRunMode,
  createPlayer,
  depositBank,
  discardItem,
  drinkHealingPotion,
  eatMagicCandy,
  exchange,
  formatShop,
  formatInventory,
  ensureRunModeOptions,
  getCommunityProgress,
  getPlayer,
  getShopItems,
  getUndergroundInnSnapshot,
  mine,
  openUndergroundStorage,
  openUndergroundInn,
  depositUndergroundStorage,
  removeRust,
  repairPlayerState,
  rerollRunModeOptions,
  resolveEventChallenge,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  setUiMode,
  shimmerCollectible,
  tradeSkyUnknownLife,
  transferHealingPotion,
  useRaptorCaveTicket,
  triggerCharge,
  travelToUndergroundCamp,
  transferCollectible,
  sellSupplyStationBuff,
  leaveSupplyStation,
  withdrawUndergroundStorage,
  withdrawBank,
  awardCollectible,
  transferConsumable
} = require("./game");
const {
  getGlobalStateFromPlayers,
  setGlobalStateToPlayers
} = require("./globalState");
const { loadPlayers, savePlayers, updatePlayer, updatePlayers } = require("./storage");
const {
  FRAME_COUNT,
  RACE_CUSTOM_IDS,
  RACING_MS,
  beginRace,
  buildRaceComponents,
  buildRaceEmbed,
  buyTicket,
  getPlayerTicket,
  getRaceState,
  isRaceComponent,
  isCurrentRaceComponent,
  parseRaceCustomId,
  roastChicken,
  settleRace,
  startRace,
  updateRaceFrame
} = require("./chickenRace");
const {
  PK_FRAME_COUNT,
  buildBattleComponents,
  buildBattleEmbed,
  buildChickenEmbed,
  buildChickenItemComponents,
  buildChickenPanelComponents,
  chooseChickenUpgrade,
  cleanChickenCoop,
  clearBattle,
  clearBattlesForPlayer,
  createBattle,
  createBossBattle,
  cycleChickenSkillTiming,
  ensureOwnedChicken,
  feedChicken,
  getBattle,
  isChickenPanelComponent,
  isChickenPkComponent,
  isChickenUpgradeComponent,
  hasChickenReachedFinish,
  renameChicken,
  roastOwnedChicken,
  settleBattle,
  shareRoastChickenMeal,
  updateBattleFrame,
  useChickenBooster,
  useChickenMedicine,
  useAutoCleaner
} = require("./chickenCare");
const {
  CUSTOM_IDS,
  buildCollectionResponse,
  buildHudFiles,
  buildLeaderboardEmbed,
  buildMiningEmbed,
  buildBankComponents,
  buildPanelComponents,
  buildPanelEmbed,
  buildShopComponents,
  buildStorageComponents,
  buildUndergroundInnComponents,
  buildShopEmbed,
  isMiningUiButton
} = require("./ui");
const {
  buildChallengeComponents,
  buildChallengeEmbed,
  buildChallengeLeaderboardEmbed,
  chooseChallengeTrait,
  createChallengeSetup,
  drinkChallengePotion,
  endChallenge,
  handleMerchantAction,
  isChallengeComponent,
  mineChallengeRoute,
  parseChallengeCustomId,
  startChallenge
} = require("./challengeMode");
const {
  buildDeveloperPanelComponents,
  buildDeveloperPanelEmbed,
  recordAnalyticsOnPlayers
} = require("./analyticsSystem");
const { startWebServer } = require("./webServer");

const token = cleanEnvValue(process.env.DISCORD_TOKEN);

if (!token) {
  throw new Error("請先在 .env 設定 DISCORD_TOKEN。");
}

function logInteractionError(error, interaction, context = "interaction") {
  const commandName = interaction && interaction.isChatInputCommand && interaction.isChatInputCommand()
    ? interaction.commandName
    : null;
  const customId = interaction && interaction.customId ? interaction.customId : null;
  console.error(`[${context}] user=${interaction && interaction.user ? interaction.user.id : "unknown"} command=${commandName || "-"} customId=${customId || "-"} error=`);
  console.error(error);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const activeTrades = new Map();
const TRADE_CUSTOM_PREFIX = "trade:potion";
const ADMIN_RESET_PREFIX = "admin_reset";
const DEV_PANEL_PREFIX = "devpanel";
const OWNER_USER_ID = "712287814192201790";
const ADMIN_USER_IDS = new Set([
  OWNER_USER_ID,
  ...String(process.env.ADMIN_USER_IDS || process.env.BOT_OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
]);
const BANK_MODAL_PREFIX = "mine_ui:bank_modal";
const STORAGE_MODAL_PREFIX = "mine_ui:storage_modal";
const SHOP_BUY_MODAL_PREFIX = "mine_ui:shop_buy_modal";
const CHICKEN_RENAME_MODAL_PREFIX = "chicken_rename_modal";
const OWNED_CHICKEN_ROAST_PREFIX = "owned_chicken_roast";
const CHICKEN_ROAST_FEAST_PREFIX = "chicken_roast_feast";
const activeChickenRoastFeasts = new Map();

function parseAmountInput(input) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function canUseAdminCommand(userId) {
  return ADMIN_USER_IDS.has(String(userId || ""));
}

function canUseOwnerCommand(userId) {
  return String(userId || "") === OWNER_USER_ID;
}

function validatePlayerExport(players) {
  if (!players || typeof players !== "object" || Array.isArray(players)) {
    return { ok: false, message: "檔案格式錯誤：最外層必須是玩家資料物件。" };
  }
  const entries = Object.entries(players);
  if (entries.length === 0) {
    return { ok: false, message: "檔案裡沒有任何玩家資料，已拒絕匯入。" };
  }
  for (const [userId, player] of entries) {
    if (!/^\d{5,30}$/.test(String(userId))) {
      return { ok: false, message: `玩家 ID 格式錯誤：${userId}` };
    }
    if (!player || typeof player !== "object" || Array.isArray(player)) {
      return { ok: false, message: `玩家 ${userId} 的資料不是物件。` };
    }
  }
  return { ok: true, count: entries.length };
}

function buildPlayerCheckReport(target, rawPlayer) {
  if (!rawPlayer) return `${target}：找不到玩家資料。`;
  const player = getPlayer(rawPlayer);
  const repairPreview = repairPlayerState(rawPlayer, Math.random, { clearBlockingState: false });
  const blocking = [];
  const waitingRunMode = !player.runMode && !player.dead && player.runModeOptions.length > 0;
  const normalRunModeWait = waitingRunMode
    && (player.zone === "surface" || player.zone === "undergroundCamp")
    && player.depth === 0
    && player.runDepthProgress === 0
    && !player.caveType;
  if (player.pendingEvent) blocking.push(`事件：${player.pendingEvent}`);
  if (player.memoryChallenge) blocking.push("記憶事件");
  if (waitingRunMode && !normalRunModeWait) blocking.push("異常等待選詞條");
  if (player.minorBuffOptions.length > 0) blocking.push("等待小詞條");
  if (player.zone === "surface" && player.runMode && (player.depth > 0 || player.runDepthProgress > 0 || player.caveType)) blocking.push("區域狀態矛盾");
  if (player.dead) blocking.push("死亡中");
  const resourceTotal = [
    "ore",
    "goldOre",
    "platinumOre",
    "oreIngot",
    "goldOreIngot",
    "platinumOreIngot",
    "redGem",
    "blueGem",
    "greenGem",
    "invertedOre",
    "invertedGem",
    "orichalcum",
    "bombItem",
    "junk",
    "platinumJunk",
    "rusty"
  ].reduce((sum, key) => sum + (Number(player[key]) || 0), 0);
  const lines = [
    `${target} 玩家檢查`,
    `區域：${player.zone}｜洞窟：${player.caveType || "無"}｜死亡：${player.dead ? "是" : "否"}`,
    `深度：${player.depth}｜本趟：${player.runDepthProgress}｜最深：${player.stats.bestDepth || 0}`,
    `生命損傷：${player.bombs}｜金幣：${player.gold}｜銀行：${player.bankGold}`,
    `詞條：${player.runMode || "未選"}｜候選：${player.runModeOptions.join(", ") || "無"}`,
    `選詞條狀態：${normalRunModeWait ? "正常等待玩家選擇" : waitingRunMode ? "異常等待" : "無"}`,
    `路線：${Object.keys(player.digPathOptions || {}).length}｜資源總數：${resourceTotal}`,
    `面板：${player.activeMinePanelMessageId ? "有" : "無"}｜頻道：${player.activeMinePanelChannelId || "無"}`,
    `卡住點：${blocking.join("、") || "未偵測到"}`,
    `修復預覽：${repairPreview.fixed.length ? repairPreview.fixed.join("、") : "無"}`
  ];
  return lines.join("\n");
}

function makeAdminResetComponents(targetId, issuerId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ADMIN_RESET_PREFIX}:confirm:${targetId}:${issuerId}`)
        .setLabel("確認重置")
        .setEmoji("🧨")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${ADMIN_RESET_PREFIX}:cancel:${targetId}:${issuerId}`)
        .setLabel("取消")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildAmountInputModal(action, targetUserId, issuerId, panelMessageId = "") {
  const [title, label, placeholder] = action === "deposit"
    ? ["存入金幣", "存入多少金幣", "輸入要存入的金幣（不填即視為全部）"]
    : action === "withdraw"
      ? ["領出金幣", "領出多少金幣", "輸入要領出的金幣（不填即視為全部）"]
      : ["鑄造紀念幣", "鑄造數量", "輸入要鑄造的數量"];

  const modal = new ModalBuilder()
    .setCustomId(`${BANK_MODAL_PREFIX}:${action}:${targetUserId}:${issuerId}:${panelMessageId || "none"}`)
    .setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(placeholder)
    .setRequired(false)
    .setMinLength(1)
    .setMaxLength(10);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildStorageInputModal(action, targetUserId, issuerId, panelMessageId = "") {
  const isDeposit = action === "deposit";
  const modal = new ModalBuilder()
    .setCustomId(`${STORAGE_MODAL_PREFIX}:${action}:${targetUserId}:${issuerId}:${panelMessageId || "none"}`)
    .setTitle(isDeposit ? "存入倉庫" : "取出倉庫");
  const itemInput = new TextInputBuilder()
    .setCustomId("item")
    .setLabel("物品名稱或代號")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("例：治療藥水 / healingPotion / 普通礦石 / ore")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(30);
  const amountInput = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("數量")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("不填就是全部")
    .setRequired(false)
    .setMinLength(1)
    .setMaxLength(10);
  modal.addComponents(
    new ActionRowBuilder().addComponents(itemInput),
    new ActionRowBuilder().addComponents(amountInput)
  );
  return modal;
}

function buildShopBuyInputModal(itemId, targetUserId, issuerId, panelMessageId = "") {
  const labels = {
    healingPotion: ["購買治療藥水", "要買幾瓶治療藥水"],
    undyingTotem: ["購買不死圖騰", "要買幾個不死圖騰"],
    zhongkui_peace: ["購買商店紀念幣", "要買幾枚紀念幣"]
  };
  const [title, label] = labels[itemId] || ["購買商品", "要購買的數量"];
  const modal = new ModalBuilder()
    .setCustomId(`${SHOP_BUY_MODAL_PREFIX}:${itemId}:${targetUserId}:${issuerId}:${panelMessageId || "none"}`)
    .setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("輸入正整數，例如 3")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildChickenRenameModal(ownerId) {
  const modal = new ModalBuilder()
    .setCustomId(`${CHICKEN_RENAME_MODAL_PREFIX}:${ownerId}`)
    .setTitle("命名雞");
  const input = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("新的雞名")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("2~12 字，例如：阿咕霸王")
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(12);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function clearRaceTimers(race) {
  if (!race || !Array.isArray(race.timers)) return;
  for (const timer of race.timers) clearTimeout(timer);
  race.timers = [];
}

async function editRaceMessage(race, message = "") {
  if (!race || !race.message) return;
  try {
    await race.message.edit({
      embeds: [buildRaceEmbed(race, message)],
      components: buildRaceComponents(race)
    });
  } catch (error) {
    race.message = null;
    console.error("賽雞面板更新失敗，流程會繼續避免卡住：", error);
  }
}

function scheduleRaceBettingEnd(race) {
  clearRaceTimers(race);
  race.timers.push(setTimeout(() => {
    startRaceAnimation(race).catch((error) => console.error("賽雞自動開賽失敗：", error));
  }, Math.max(1000, race.bettingEndsAt - Date.now())));
}

async function startRaceAnimation(race) {
  if (!race || race.status !== "betting") return;
  clearRaceTimers(race);
  beginRace(race, Math.random);
  await editRaceMessage(race, "🏁 賽雞開始！");
  const interval = Math.floor(RACING_MS / FRAME_COUNT);
  for (let frame = 1; frame < FRAME_COUNT; frame += 1) {
    race.timers.push(setTimeout(() => {
      updateRaceFrame(race, frame, Math.random);
      editRaceMessage(race).catch((error) => console.error("賽雞更新失敗：", error));
    }, interval * frame));
  }
  race.timers.push(setTimeout(() => {
    finishRace(race).catch((error) => console.error("賽雞結算失敗：", error));
  }, RACING_MS));
}

async function finishRace(race) {
  if (!race || race.status === "settled") return;
  clearRaceTimers(race);
  let settled = null;
  await updatePlayers((players) => {
    settled = settleRace(race, players, Math.random);
    for (const ticket of Object.values(race.playersInMatch || {})) {
      recordAnalyticsOnPlayers(players, ticket.userId, "race");
      const chicken = (race.selectedChickens || []).find((item) => item.id === ticket.chickenId);
      if (chicken) recordAnalyticsOnPlayers(players, ticket.userId, "chicken", { chicken: chicken.name });
    }
    return settled.players;
  });
  await editRaceMessage(race, settled.message);
}

function clearBattleTimers(battle) {
  if (!battle || !Array.isArray(battle.timers)) return;
  for (const timer of battle.timers) clearTimeout(timer);
  battle.timers = [];
}

async function editBattleMessage(battle, players, message = "") {
  if (!battle || !battle.message) return;
  try {
    await battle.message.edit({
      embeds: [buildBattleEmbed(battle, players, message)],
      components: buildBattleComponents(battle)
    });
  } catch (error) {
    battle.message = null;
    console.error("賽雞 PK 面板更新失敗：", error);
  }
}

async function startChickenBattleAnimation(battle) {
  if (!battle || battle.status !== "pending") return;
  clearBattleTimers(battle);
  battle.status = "racing";
  let settledAlready = false;
  async function settleNow(message = "🏁 有雞衝到終點！") {
    if (settledAlready) return;
    settledAlready = true;
    clearBattleTimers(battle);
    let settled = null;
    await updatePlayers((currentPlayers) => {
      settled = settleBattle(battle, currentPlayers, Math.random, Date.now());
      recordAnalyticsOnPlayers(currentPlayers, battle.challengerId, "race");
      const challenger = getPlayer(currentPlayers[battle.challengerId]);
      if (challenger.ownedChicken) {
        recordAnalyticsOnPlayers(currentPlayers, battle.challengerId, "chicken", { chicken: challenger.ownedChicken.evolution || challenger.ownedChicken.personality || "養成雞" });
      }
      if (!battle.isBoss && battle.targetId) recordAnalyticsOnPlayers(currentPlayers, battle.targetId, "race");
      return settled.players;
    });
    await editBattleMessage(battle, settled.players, message ? `${message}\n${settled.message}` : settled.message);
    if (battle.deathmatchFeast && battle.message) {
      await publishChickenRoastFeastFromMessage(battle.message, battle.deathmatchFeast.ownerId, battle.deathmatchFeast.chickenName);
    }
    clearBattle(battle.id);
  }

  const players = await loadPlayers();
  updateBattleFrame(battle, players, 0, Math.random);
  await editBattleMessage(battle, players, battle.isBoss ? "🏟️ 挑戰開始！" : battle.deathmatch ? "⚔️ 生死鬥開始！" : "⚔️ PK 開始！");
  if (hasChickenReachedFinish(battle)) {
    await settleNow();
    return;
  }
  const interval = 1400;
  const maxFrames = PK_FRAME_COUNT * 3;
  async function runFrame(frame) {
    try {
      if (settledAlready) return;
      const currentPlayers = await loadPlayers();
      updateBattleFrame(battle, currentPlayers, frame, Math.random);
      await editBattleMessage(battle, currentPlayers);
      if (hasChickenReachedFinish(battle)) {
        await settleNow();
        return;
      }
      if (frame >= maxFrames) {
        await settleNow("🏁 最後衝線！");
        return;
      }
      battle.timers.push(setTimeout(() => {
        runFrame(frame + 1).catch((error) => console.error("賽雞 PK 更新失敗：", error));
      }, interval));
    } catch (error) {
      console.error("賽雞 PK 更新失敗：", error);
      clearBattle(battle.id);
    }
  }
  battle.timers.push(setTimeout(() => {
    runFrame(1).catch((error) => console.error("賽雞 PK 更新失敗：", error));
  }, interval));
}

function makeReply(title, body) {
  return `**${title}**\n${body}`;
}

async function handleBankModalSubmit(interaction) {
  const [, , action, targetUserId, issuerId, panelMessageId] = interaction.customId.split(":");
  if (interaction.user.id !== issuerId) {
    await interaction.reply({ content: "只有發起按鈕的玩家可以送出這筆數值。", ephemeral: true });
    return;
  }

  const beforePlayers = await loadPlayers();
  const beforePlayer = getPlayer(beforePlayers[targetUserId]);
  if (
    beforePlayer.activeMinePanelMessageId
    && panelMessageId
    && panelMessageId !== "none"
    && beforePlayer.activeMinePanelMessageId !== panelMessageId
  ) {
    await interaction.reply({ content: "這是舊的礦場面板，請使用最新的 `/礦場` 面板。", ephemeral: true });
    return;
  }

  const rawAmount = interaction.fields.getTextInputValue("amount");
  const amount = rawAmount ? parseAmountInput(rawAmount) : null;
  if (rawAmount && amount === null && action !== "exchange") {
    await interaction.reply({ content: "請輸入正整數金額。", ephemeral: true });
    return;
  }
  if (rawAmount && amount === null && action === "exchange") {
    await interaction.reply({ content: "請輸入正整數鑄造數量。", ephemeral: true });
    return;
  }
  if (action === "exchange" && amount !== null && amount <= 0) {
    await interaction.reply({ content: "請輸入正整數鑄造數量。", ephemeral: true });
    return;
  }

  let result = null;
  let title = "銀行";
  await updatePlayer(targetUserId, (player) => {
    if (action === "deposit") {
      title = "銀行";
      result = depositBank(player, amount);
      return result.player;
    }
    if (action === "withdraw") {
      title = "銀行";
      result = withdrawBank(player, amount);
      return result.player;
    }
    if (action === "exchange") {
      title = "鑄造紀念幣";
      result = exchange(player, amount || 1, Math.random);
      return result.player;
    }
    return player;
  });

  if (!result) {
    await interaction.reply({ content: "不支援的操作。", ephemeral: true });
    return;
  }

  const currentPage = getCurrentHudPage(interaction);
  const players = await loadPlayers();
  const progress = getProgressWithGlobal(players);
  const player = players[targetUserId];
  const embed = action === "exchange"
    ? buildShopEmbed(player, result.message, progress)
    : buildPanelEmbed(player, title, result.message, interaction.user, currentPage);
  const components = action === "exchange"
    ? buildShopComponents(progress, player, targetUserId)
    : buildBankComponents(targetUserId);
  try {
    if (interaction.message && interaction.message.edit && interaction.message.editable) {
      await interaction.message.edit({
        embeds: [embed],
        files: buildHudFiles(player),
        attachments: [],
        components
      });
    }
  } catch (error) {
    console.error("更新面板失敗：", error);
  }

  await interaction.reply({ content: result.message, ephemeral: true });
}

async function handleStorageModalSubmit(interaction) {
  const [, , action, targetUserId, issuerId, panelMessageId] = interaction.customId.split(":");
  if (interaction.user.id !== issuerId) {
    await interaction.reply({ content: "只有發起按鈕的玩家可以送出這筆倉庫操作。", ephemeral: true });
    return;
  }

  const beforePlayers = await loadPlayers();
  const beforePlayer = getPlayer(beforePlayers[targetUserId]);
  if (
    beforePlayer.activeMinePanelMessageId
    && panelMessageId
    && panelMessageId !== "none"
    && beforePlayer.activeMinePanelMessageId !== panelMessageId
  ) {
    await interaction.reply({ content: "這是舊的礦場面板，請使用最新的 `/礦場` 面板。", ephemeral: true });
    return;
  }

  const item = interaction.fields.getTextInputValue("item");
  const rawAmount = interaction.fields.getTextInputValue("amount");
  const amount = rawAmount ? parseAmountInput(rawAmount) : null;
  if (rawAmount && amount === null) {
    await interaction.reply({ content: "請輸入正整數數量，或留空代表全部。", ephemeral: true });
    return;
  }

  let result = null;
  await updatePlayer(targetUserId, (player) => {
    result = action === "deposit"
      ? depositUndergroundStorage(player, item, amount)
      : withdrawUndergroundStorage(player, item, amount);
    return result.player;
  });

  if (!result) {
    await interaction.reply({ content: "不支援的倉庫操作。", ephemeral: true });
    return;
  }

  const currentPage = getCurrentHudPage(interaction);
  const players = await loadPlayers();
  const player = players[targetUserId];
  const embed = buildPanelEmbed(player, "倉庫", result.message, interaction.user, currentPage);
  try {
    if (interaction.message && interaction.message.edit && interaction.message.editable) {
      await interaction.message.edit({
        embeds: [embed],
        files: buildHudFiles(player),
        attachments: [],
        components: buildStorageComponents()
      });
    }
  } catch (error) {
    console.error("更新倉庫面板失敗：", error);
  }

  await interaction.reply({ content: result.message, ephemeral: true });
}

async function handleShopBuyModalSubmit(interaction) {
  const [, , itemId, targetUserId, issuerId, panelMessageId] = interaction.customId.split(":");
  if (interaction.user.id !== issuerId) {
    await interaction.reply({ content: "只有發起按鈕的玩家可以送出這筆購買。", ephemeral: true });
    return;
  }

  const beforePlayers = await loadPlayers();
  const beforePlayer = getPlayer(beforePlayers[targetUserId]);
  if (
    beforePlayer.activeMinePanelMessageId
    && panelMessageId
    && panelMessageId !== "none"
    && beforePlayer.activeMinePanelMessageId !== panelMessageId
  ) {
    await interaction.reply({ content: "這是舊的礦場面板，請使用最新的 `/礦場` 面板。", ephemeral: true });
    return;
  }

  const amount = parseAmountInput(interaction.fields.getTextInputValue("amount"));
  if (amount === null) {
    await interaction.reply({ content: "請輸入正整數購買數量。", ephemeral: true });
    return;
  }

  let result = null;
  let shopProgress = null;
  await updatePlayers((players) => {
    const progress = getProgressWithGlobal(players);
    const before = getPlayer(players[targetUserId]);
    result = buyShopItem(players[targetUserId], itemId, amount, progress);
    const nextProgress = result.globalState
      ? { ...progress, globalState: result.globalState }
      : progress;
    shopProgress = nextProgress;
    players[targetUserId] = result.player;
    if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
    const spent = Math.max(0, (before.gold || 0) - (result.player.gold || 0));
    if (result.ok && spent > 0) recordAnalyticsOnPlayers(players, targetUserId, "goldSpent", { amount: spent });
    return players;
  });

  const players = await loadPlayers();
  const player = getPlayer(players[targetUserId]);
  try {
    if (interaction.message && interaction.message.edit && interaction.message.editable) {
      await interaction.message.edit({
        embeds: [buildShopEmbed(player, result.message, shopProgress)],
        files: buildHudFiles(player),
        attachments: [],
        components: buildShopComponents(shopProgress, player, targetUserId)
      });
    }
  } catch (error) {
    console.error("更新商店面板失敗：", error);
  }

  await interaction.reply({ content: result.message, ephemeral: true });
}

function makeTradeComponents(tradeId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${TRADE_CUSTOM_PREFIX}:accept:${tradeId}`)
        .setLabel("接受")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${TRADE_CUSTOM_PREFIX}:decline:${tradeId}`)
        .setLabel("拒絕")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function clearTrade(tradeId) {
  const trade = activeTrades.get(tradeId);
  if (trade && trade.timer) clearTimeout(trade.timer);
  activeTrades.delete(tradeId);
}

function cleanupExpiredTrades() {
  for (const trade of [...activeTrades.values()]) {
    if (Date.now() > trade.expiresAt) clearTrade(trade.id);
  }
}

function hasActiveTradeForUsers(...userIds) {
  const ids = new Set(userIds.filter(Boolean));
  return [...activeTrades.values()].some((trade) => (
    ids.has(trade.fromId) || ids.has(trade.toId)
  ));
}

function createPendingTrade(trade) {
  const tradeId = `${Date.now()}_${trade.fromId}_${trade.toId}`;
  const timer = setTimeout(() => clearTrade(tradeId), 60_000);
  const pending = {
    id: tradeId,
    ...trade,
    expiresAt: Date.now() + 60_000,
    timer
  };
  activeTrades.set(tradeId, pending);
  return pending;
}

function describeTradeRequest(trade, fromMention, toMention) {
  if (trade.kind === "healingPotion" || trade.kind === "consumable") {
    return `${fromMention} 想給 ${toMention} ${trade.summary}`;
  }
  const parts = [];
  if (trade.itemId && trade.amount > 0) parts.push(`紀念幣 x${trade.amount}`);
  if (trade.gold > 0) parts.push(`${trade.gold} 金幣`);
  return `${fromMention} 想給 ${toMention} ${parts.join("、")}`;
}

async function handleChickenRenameModalSubmit(interaction) {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "只有雞的主人可以命名。", ephemeral: true });
    return;
  }
  const name = interaction.fields.getTextInputValue("name");
  let result = null;
  await updatePlayer(interaction.user.id, (player) => {
    result = renameChicken(player, name, Math.random);
    return result.player;
  });
  await interaction.deferUpdate();
  await interaction.editReply({
    embeds: [buildChickenEmbed(result.player, "養雞面板", result.message)],
    components: buildChickenPanelComponents(result.player, interaction.user.id)
  });
}

function getGlobalBestDepth(players) {
  return Object.values(players).reduce((best, player) => {
    const normalized = getPlayer(player);
    return Math.max(best, normalized.stats.bestDepth || 0);
  }, 0);
}

function attachGlobalRecordMessage(outcome, previousBestDepth, user) {
  const bestDepth = outcome && outcome.player && outcome.player.stats
    ? outcome.player.stats.bestDepth || 0
    : 0;
  if (bestDepth <= previousBestDepth) return outcome;

  return {
    ...outcome,
    globalRecordMessage: `🏆 全服新紀錄！${user} 挖到第 ${bestDepth} 層，超過原本的第 ${previousBestDepth} 層。`
  };
}

function getProgressWithGlobal(players) {
  return {
    ...getCommunityProgress(players),
    globalState: getGlobalStateFromPlayers(players)
  };
}

function getButtonCustomId(component) {
  return component.customId || (component.data && component.data.custom_id) || "";
}

function getPanelTargetUserId(interaction) {
  const rows = interaction.message && interaction.message.components ? interaction.message.components : [];
  for (const row of rows) {
    const components = row.components || [];
    for (const component of components) {
      const customId = getButtonCustomId(component);
      if (customId.startsWith(`${CUSTOM_IDS.pagePrefix}:`)) {
        const targetUserId = customId.split(":")[3];
        return targetUserId && targetUserId !== "none" ? targetUserId : null;
      }
      if (customId.startsWith(`${CUSTOM_IDS.uiModePrefix}:`)) {
        const targetUserId = customId.split(":")[3];
        return targetUserId && targetUserId !== "none" ? targetUserId : null;
      }
      if (customId.startsWith(`${CUSTOM_IDS.rescuePrefix}:`)) {
        const targetUserId = customId.split(":")[2];
        return targetUserId && targetUserId !== "none" ? targetUserId : null;
      }
      if (customId.startsWith(`${CUSTOM_IDS.bankDeposit}:`) || customId.startsWith(`${CUSTOM_IDS.bankWithdraw}:`)) {
        const targetUserId = customId.split(":")[2];
        return targetUserId && targetUserId !== "none" ? targetUserId : null;
      }
      if (customId.startsWith(`${CUSTOM_IDS.shopExit}:`)) {
        const targetUserId = customId.split(":")[2];
        return targetUserId && targetUserId !== "none" ? targetUserId : null;
      }
    }
  }
  return null;
}

function getCurrentHudPage(interaction) {
  if (interaction.customId && interaction.customId.startsWith(`${CUSTOM_IDS.pagePrefix}:`)) {
    return interaction.customId.split(":")[2] || "main";
  }
  const rows = interaction.message && interaction.message.components ? interaction.message.components : [];
  for (const row of rows) {
    const components = row.components || [];
    for (const component of components) {
      const customId = getButtonCustomId(component);
      if (!customId.startsWith(`${CUSTOM_IDS.pagePrefix}:`)) continue;
      const style = component.style || (component.data && component.data.style);
      if (style === 1) return customId.split(":")[2] || "main";
    }
  }
  return "main";
}

function parseShopBuyButton(customId) {
  if (customId === CUSTOM_IDS.shopBuyOne) {
    const shopItem = getShopItems()[0];
    return shopItem ? { itemId: shopItem.id, amount: 1 } : null;
  }
  if (customId === CUSTOM_IDS.shopBuyPotion) return { itemId: "healingPotion", amount: 1 };
  if (customId === CUSTOM_IDS.shopBuyTotem) return { itemId: "undyingTotem", amount: 1 };
  if (!customId || !customId.startsWith(`${CUSTOM_IDS.shopBuyPrefix}:`)) return null;
  const [, , itemId, amountText] = customId.split(":");
  const amount = Math.max(1, Math.min(99, Math.floor(Number(amountText) || 1)));
  return itemId ? { itemId, amount } : null;
}

function parseShopCustomBuyButton(customId) {
  if (!customId || !customId.startsWith(`${CUSTOM_IDS.shopBuyCustomPrefix}:`)) return null;
  const [, , itemId] = customId.split(":");
  return itemId || null;
}

async function deletePreviousMinePanel(playerInput, fallbackChannel) {
  const player = getPlayer(playerInput);
  if (!player.activeMinePanelMessageId) return false;
  try {
    const channel = player.activeMinePanelChannelId
      ? await client.channels.fetch(player.activeMinePanelChannelId).catch(() => null)
      : fallbackChannel;
    if (!channel || !channel.messages || !channel.messages.fetch) return false;
    const message = await channel.messages.fetch(player.activeMinePanelMessageId).catch(() => null);
    if (!message || !message.deletable) return false;
    await message.delete();
    return true;
  } catch (error) {
    console.error("刪除舊礦場面板失敗：", error);
    return false;
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`已登入：${readyClient.user.tag}`);
  try {
    await registerApplicationCommands();
  } catch (error) {
    console.error("註冊 slash commands 失敗：", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${BANK_MODAL_PREFIX}:`)) {
      await handleBankModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${STORAGE_MODAL_PREFIX}:`)) {
      await handleStorageModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${SHOP_BUY_MODAL_PREFIX}:`)) {
      await handleShopBuyModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${CHICKEN_RENAME_MODAL_PREFIX}:`)) {
      await handleChickenRenameModalSubmit(interaction);
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && isRaceComponent(interaction.customId)) {
      await handleChickenRaceInteraction(interaction);
      return;
    }

    if (interaction.isButton() && isChickenPkComponent(interaction.customId)) {
      await handleChickenPkInteraction(interaction);
      return;
    }

    if (interaction.isButton() && isChickenUpgradeComponent(interaction.customId)) {
      await handleChickenUpgradeInteraction(interaction);
      return;
    }

    if (interaction.isButton() && isChickenPanelComponent(interaction.customId)) {
      await handleChickenPanelInteraction(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(`${CHICKEN_ROAST_FEAST_PREFIX}:`)) {
      await handleChickenRoastFeastInteraction(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(`${OWNED_CHICKEN_ROAST_PREFIX}:`)) {
      await handleOwnedChickenRoastInteraction(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(`${TRADE_CUSTOM_PREFIX}:`)) {
      const [, , action, tradeId] = interaction.customId.split(":");
      const trade = activeTrades.get(tradeId);
      if (!trade || Date.now() > trade.expiresAt) {
        clearTrade(tradeId);
        await interaction.reply({ content: "這筆交易已逾時或不存在。", ephemeral: true });
        return;
      }
      if (interaction.user.id !== trade.toId) {
        await interaction.reply({ content: "只有交易對象可以回應這筆交易。", ephemeral: true });
        return;
      }
      if (action === "decline") {
        clearTrade(tradeId);
        await interaction.update({ content: "交易已拒絕。", components: [] });
        return;
      }
      const result = await updatePlayers((players) => {
        const transfer = trade.kind === "healingPotion" || trade.kind === "consumable"
          ? transferConsumable(players[trade.fromId], players[trade.toId], trade.itemId || "healingPotion", trade.amount)
          : transferCollectible(players[trade.fromId], players[trade.toId], trade.itemId, trade.amount, trade.gold);
        players[trade.fromId] = transfer.from;
        players[trade.toId] = transfer.to;
        return transfer;
      });
      clearTrade(tradeId);
      await interaction.update({
        content: result.ok ? `交易完成：<@${trade.fromId}> 給 <@${trade.toId}> ${trade.summary}。` : `交易失敗：${result.message}`,
        components: []
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(`${ADMIN_RESET_PREFIX}:`)) {
      const [, action, targetId, issuerId] = interaction.customId.split(":");
      if (interaction.user.id !== issuerId || !canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "只有發起重置的管理者可以操作。", ephemeral: true });
        return;
      }
      if (action === "cancel") {
        await interaction.update({ content: "已取消重置玩家資料。", components: [] });
        return;
      }
      if (action === "confirm") {
        await updatePlayer(targetId, () => createPlayer());
        await interaction.update({ content: `已重置 <@${targetId}> 的全部遊戲資料。`, components: [] });
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith(`${DEV_PANEL_PREFIX}:`)) {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "只有開發者或管理員可以使用開發者面板。", ephemeral: true });
        return;
      }
      const page = interaction.customId.split(":")[1] || "active";
      const players = await loadPlayers();
      await interaction.update({
        embeds: [buildDeveloperPanelEmbed(players, page)],
        components: buildDeveloperPanelComponents(page)
      });
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && isChallengeComponent(interaction.customId)) {
      await handleChallengeInteraction(interaction);
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && isMiningUiButton(interaction.customId)) {
      await handleMiningButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const name = interaction.commandName;
    await updatePlayers((players) => recordAnalyticsOnPlayers(players, interaction.user.id, "active"));

    if (name === "開發者面板" || name === "devpanel") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "只有開發者或管理員可以使用開發者面板。", ephemeral: true });
        return;
      }
      const players = await loadPlayers();
      await interaction.reply({
        embeds: [buildDeveloperPanelEmbed(players, "active")],
        components: buildDeveloperPanelComponents("active"),
        ephemeral: true
      });
      return;
    }

    if (name === "礦場") {
      await interaction.deferReply();
      const previousPanelPlayer = getPlayer((await loadPlayers())[interaction.user.id]);
      await deletePreviousMinePanel(previousPanelPlayer, interaction.channel);
      const player = await updatePlayer(interaction.user.id, (current) => ensureRunModeOptions(current, Math.random));
      const progress = getProgressWithGlobal(await loadPlayers());
      await interaction.editReply({
        embeds: [buildPanelEmbed(player, "礦場面板", "公開礦場已開啟，大家都能看到挖礦狀況。", interaction.user)],
        files: buildHudFiles(player),
        components: buildPanelComponents(interaction.user.id, player, progress)
      });
      const reply = await interaction.fetchReply();
      await updatePlayer(interaction.user.id, (current) => {
        const next = getPlayer(current);
        next.activeMinePanelMessageId = reply.id;
        next.activeMinePanelChannelId = reply.channelId || (interaction.channel && interaction.channel.id) || "";
        return next;
      });
      return;
    }

    if (name === "挖礦挑戰" || name === "挑戰模式") {
      await interaction.deferReply();
      const player = await updatePlayer(interaction.user.id, (current) => createChallengeSetup(current, Math.random));
      await interaction.editReply({
        embeds: [buildChallengeEmbed(player, "選擇大詞條後開始挑戰。", interaction.user)],
        components: buildChallengeComponents(player, interaction.user.id)
      });
      return;
    }

    if (name === "清錢") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      let before = null;
      const player = await updatePlayer(target.id, (current) => {
        const next = getPlayer(current);
        before = {
          gold: next.gold || 0,
          bankGold: next.bankGold || 0,
          challengeGold: next.challenge && next.challenge.challengeGold ? next.challenge.challengeGold : 0
        };
        next.gold = 0;
        next.bankGold = 0;
        if (next.challenge) next.challenge.challengeGold = 0;
        return next;
      });
      await interaction.reply({
        content: `已清空 ${target} 的金錢。\n原本：身上 ${before.gold}｜銀行 ${before.bankGold}｜挑戰 ${before.challengeGold}\n現在：身上 ${player.gold}｜銀行 ${player.bankGold}`,
        ephemeral: true
      });
      return;
    }

    if (name === "給錢") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      const amount = interaction.options.getInteger("金額", true);
      let beforeGold = 0;
      const player = await updatePlayer(target.id, (current) => {
        const next = getPlayer(current);
        beforeGold = next.gold || 0;
        next.gold = Math.max(0, beforeGold + amount);
        return next;
      });
      await interaction.reply({
        content: `已給 ${target} ${amount} 金幣。\n身上金幣：${beforeGold} → ${player.gold}`,
        ephemeral: true
      });
      return;
    }

    if (name === "給藥水") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      const amount = interaction.options.getInteger("數量", true);
      let before = 0;
      const player = await updatePlayer(target.id, (current) => {
        const next = getPlayer(current);
        before = next.healingPotion || 0;
        next.healingPotion = before + amount;
        return next;
      });
      await interaction.reply({
        content: `已給 ${target} 治療藥水 x${amount}。\n持有：${before} → ${player.healingPotion}`,
        ephemeral: true
      });
      return;
    }

    if (name === "給隨機紀念幣") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      const amount = interaction.options.getInteger("數量") || 1;
      const awards = [];
      await updatePlayer(target.id, (current) => {
        const next = getPlayer(current);
        for (let index = 0; index < amount; index += 1) {
          const collectible = awardCollectible(next, Math.random);
          if (collectible) awards.push(collectible.name);
        }
        return next;
      });
      const summary = awards.reduce((counts, name) => {
        counts[name] = (counts[name] || 0) + 1;
        return counts;
      }, {});
      await interaction.reply({
        content: `已給 ${target} 隨機紀念幣 x${amount}：${Object.entries(summary).map(([coin, count]) => `${coin} x${count}`).join("、") || "無"}`,
        ephemeral: true
      });
      return;
    }

    if (name === "普發入場券") {
      if (!canUseOwnerCommand(interaction.user.id)) {
        await interaction.reply({ content: "只有機器人擁有者可以使用這個指令。", ephemeral: true });
        return;
      }
      const result = await updatePlayers((players) => {
        let issued = 0;
        let alreadyHad = 0;
        for (const userId of Object.keys(players)) {
          const next = getPlayer(players[userId]);
          if ((next.guaranteedRaptorCaveTicket || 0) > 0 || (next.activeRaptorCaveTicket || 0) > 0) {
            alreadyHad += 1;
          } else {
            next.guaranteedRaptorCaveTicket = 1;
            issued += 1;
          }
          players[userId] = next;
        }
        return { issued, alreadyHad, total: Object.keys(players).length };
      });
      await interaction.reply({
        content: `已普發猛禽洞窟入場券。\n新增：${result.issued} 人｜原本已有：${result.alreadyHad} 人｜玩家資料總數：${result.total}`,
        ephemeral: true
      });
      return;
    }

    if (name === "匯出玩家資料") {
      if (!canUseOwnerCommand(interaction.user.id)) {
        await interaction.reply({ content: "只有機器人擁有者可以使用這個指令。", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const players = await loadPlayers();
      const exportedAt = new Date().toISOString().replace(/[:.]/g, "-");
      const json = `${JSON.stringify(players)}\n`;
      const body = zlib.gzipSync(Buffer.from(json, "utf8"));
      await interaction.editReply({
        content: `已匯出玩家資料，共 ${Object.keys(players).length} 筆。壓縮後 ${(body.length / 1024 / 1024).toFixed(2)} MB。請先保留這個檔案，確認新服務匯入成功前不要刪掉。`,
        files: [{ attachment: body, name: `players-export-${exportedAt}.json.gz` }],
      });
      return;
    }

    if (name === "匯入玩家資料") {
      if (!canUseOwnerCommand(interaction.user.id)) {
        await interaction.reply({ content: "只有機器人擁有者可以使用這個指令。", ephemeral: true });
        return;
      }
      const confirmation = interaction.options.getString("確認", true);
      if (confirmation !== "覆蓋玩家資料") {
        await interaction.reply({ content: "確認文字不正確。請輸入：覆蓋玩家資料", ephemeral: true });
        return;
      }
      const attachment = interaction.options.getAttachment("檔案", true);
      if (!attachment.name.endsWith(".json") && !attachment.name.endsWith(".json.gz")) {
        await interaction.reply({ content: "請上傳 JSON 或 JSON.GZ 檔。", ephemeral: true });
        return;
      }
      if (attachment.size > 20 * 1024 * 1024) {
        await interaction.reply({ content: "檔案太大，請先聯絡我改用 Render Shell 搬移。", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const response = await fetch(attachment.url);
      if (!response.ok) {
        await interaction.editReply(`下載附件失敗：HTTP ${response.status}`);
        return;
      }
      let importedPlayers = null;
      try {
        const rawBuffer = Buffer.from(await response.arrayBuffer());
        const text = attachment.name.endsWith(".gz")
          ? zlib.gunzipSync(rawBuffer).toString("utf8")
          : rawBuffer.toString("utf8");
        importedPlayers = JSON.parse(text);
      } catch {
        await interaction.editReply("JSON 解析失敗，請確認檔案是 /匯出玩家資料 產生的原始檔。");
        return;
      }
      const validation = validatePlayerExport(importedPlayers);
      if (!validation.ok) {
        await interaction.editReply(validation.message);
        return;
      }
      const before = Object.keys(await loadPlayers()).length;
      await savePlayers(importedPlayers);
      await interaction.editReply(`已匯入玩家資料。\n原本：${before} 筆｜現在：${validation.count} 筆\n請立刻用 /檢查玩家 或網頁確認資料。`);
      return;
    }

    if (name === "檢查玩家") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      const players = await loadPlayers();
      await interaction.reply({
        content: buildPlayerCheckReport(target, players[target.id]),
        ephemeral: true
      });
      return;
    }

    if (name === "修復玩家") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      let result = null;
      await updatePlayer(target.id, (current) => {
        result = repairPlayerState(current, Math.random, { clearBlockingState: true });
        return result.player;
      });
      if (clearBattlesForPlayer(target.id)) {
        result.fixed.push("清除卡住的賽雞 PK");
        result.message = `已修復：${result.fixed.join("、")}。`;
      }
      await interaction.reply({
        content: `${target}：${result.message}`,
        ephemeral: true
      });
      return;
    }

    if (name === "開礦場面板") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      await interaction.deferReply({ ephemeral: true });
      const previousPanelPlayer = getPlayer((await loadPlayers())[target.id]);
      await deletePreviousMinePanel(previousPanelPlayer, interaction.channel);
      const player = await updatePlayer(target.id, (current) => ensureRunModeOptions(current, Math.random));
      const progress = getProgressWithGlobal(await loadPlayers());
      await interaction.editReply({
        content: `管理面板：${target}`,
        embeds: [buildPanelEmbed(player, "管理面板", "已開啟指定玩家的礦場面板。", target)],
        files: buildHudFiles(player),
        components: buildPanelComponents(target.id, player, progress)
      });
      const reply = await interaction.fetchReply();
      await updatePlayer(target.id, (current) => {
        const next = getPlayer(current);
        next.activeMinePanelMessageId = reply.id;
        next.activeMinePanelChannelId = reply.channelId || (interaction.channel && interaction.channel.id) || "";
        return next;
      });
      return;
    }

    if (name === "重置玩家") {
      if (!canUseAdminCommand(interaction.user.id)) {
        await interaction.reply({ content: "你沒有權限使用這個指令。", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("玩家", true);
      await interaction.reply({
        content: [
          `確定要重置 ${target} 的全部遊戲資料嗎？`,
          "這會清空金幣、銀行、包包、紀念幣、雞、排行榜進度與所有狀態。"
        ].join("\n"),
        components: makeAdminResetComponents(target.id, interaction.user.id),
        ephemeral: true
      });
      return;
    }

    if (name === "礦場ui") {
      const mode = interaction.options.getString("模式", true);
      await interaction.deferReply({ ephemeral: true });
      let result = null;
      await updatePlayer(interaction.user.id, (player) => {
        result = setUiMode(player, mode);
        return result.player;
      });
      await interaction.editReply(result.message);
      return;
    }

    if (name === "賽雞場") {
      await updatePlayer(interaction.user.id, (player) => ensureOwnedChicken(player, Math.random));
      const race = startRace(Date.now(), Math.random, interaction.guildId, interaction.user.id);
      if (race.message && race.status !== "settled") {
        await interaction.reply({
          content: `目前已有賽雞場正在進行：${race.status === "betting" ? "下注中" : "比賽中"}。請使用原本那個賽雞面板。`,
          ephemeral: true
        });
        return;
      }
      await interaction.deferReply();
      await interaction.editReply({
        embeds: [buildRaceEmbed(race, "歡迎來到賽雞場，下注階段 15 秒。")],
        components: buildRaceComponents(race)
      });
      race.message = await interaction.fetchReply();
      scheduleRaceBettingEnd(race);
      return;
    }

    if (name === "我的雞") {
      await interaction.deferReply({ ephemeral: true });
      const player = await updatePlayer(interaction.user.id, (current) => ensureOwnedChicken(current, Math.random));
      await interaction.editReply({
        embeds: [buildChickenEmbed(player, "養雞面板")],
        components: buildChickenPanelComponents(player, interaction.user.id)
      });
      return;
    }

    if (name === "命名雞") {
      const chickenName = interaction.options.getString("名字", true);
      await interaction.deferReply({ ephemeral: true });
      let result = null;
      await updatePlayer(interaction.user.id, (player) => {
        result = renameChicken(player, chickenName, Math.random);
        return result.player;
      });
      await interaction.editReply({
        embeds: [buildChickenEmbed(result.player, "養雞面板", result.message)],
        components: buildChickenPanelComponents(result.player, interaction.user.id)
      });
      return;
    }

    if (name === "烤掉雞") {
      await interaction.deferReply({ ephemeral: true });
      const player = await updatePlayer(interaction.user.id, (current) => ensureOwnedChicken(current, Math.random));
      const chicken = player.ownedChicken;
      await interaction.editReply({
        content: [
          `🍗 確定要烤掉「${chicken.name}」嗎？`,
          "",
          `牠陪你贏過 ${chicken.wins} 場比賽。`,
          "烤掉後下一場下礦最大生命 +1，並且你之後會重新獲得一隻初始雞。"
        ].join("\n"),
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`${OWNED_CHICKEN_ROAST_PREFIX}:confirm:${interaction.user.id}`)
              .setLabel("確認烤掉")
              .setEmoji("🍗")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`${OWNED_CHICKEN_ROAST_PREFIX}:cancel:${interaction.user.id}`)
              .setLabel("取消")
              .setEmoji("↩️")
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
      return;
    }

    if (name === "賽雞pk") {
      const target = interaction.options.getUser("對象", true);
      const deathmatch = interaction.options.getBoolean("生死鬥") || false;
      if (target.bot) {
        await interaction.reply({ content: "不能挑戰機器人。", ephemeral: true });
        return;
      }
      const activeRace = getRaceState(interaction.guildId);
      if (activeRace && activeRace.status !== "settled" && (getPlayerTicket(activeRace, interaction.user.id) || getPlayerTicket(activeRace, target.id))) {
        await interaction.reply({ content: "其中一位玩家已經參與目前的賽雞場，等這場結束後再 PK。", ephemeral: true });
        return;
      }
      await interaction.deferReply();
      let created = null;
      await updatePlayers((players) => {
        created = createBattle(interaction.user.id, target.id, players, Date.now(), Math.random, interaction.guildId, { deathmatch });
        return created.players || players;
      });
      if (!created.ok) {
        await interaction.editReply(created.message);
        return;
      }
      const intro = deathmatch
        ? `⚔️ <@${interaction.user.id}> 向 <@${target.id}> 發起賽雞生死鬥！\n輸家的雞會被烤掉，需要對方同意。`
        : `⚔️ <@${interaction.user.id}> 向 <@${target.id}> 發起賽雞 PK！直接開跑！`;
      await interaction.editReply({
        embeds: [buildBattleEmbed(created.battle, await loadPlayers(), intro)],
        components: deathmatch ? buildBattleComponents(created.battle) : []
      });
      created.battle.message = await interaction.fetchReply();
      if (deathmatch) return;
      await startChickenBattleAnimation(created.battle);
      return;
    }

    if (name === "賽雞館") {
      const activeRace = getRaceState(interaction.guildId);
      if (activeRace && activeRace.status !== "settled" && getPlayerTicket(activeRace, interaction.user.id)) {
        await interaction.reply({ content: "你已經參與目前的賽雞場，等這場結束後再挑戰館主。", ephemeral: true });
        return;
      }
      await interaction.deferReply();
      let created = null;
      const requestedRank = interaction.options.getInteger("rank");
      await updatePlayers((players) => {
        created = createBossBattle(interaction.user.id, players, Date.now(), Math.random, interaction.guildId, null, requestedRank);
        return created.players || players;
      });
      if (!created.ok) {
        await interaction.editReply(created.message);
        return;
      }
      const replayText = created.battle.bossReplayRank ? ` Rank ${created.battle.bossRank} 重打` : "";
      await interaction.editReply({
        embeds: [buildBattleEmbed(created.battle, await loadPlayers(), `🏟️ <@${interaction.user.id}> 挑戰${replayText} ${created.boss.icon} ${created.boss.name}！`)],
        components: []
      });
      created.battle.message = await interaction.fetchReply();
      await startChickenBattleAnimation(created.battle);
      return;
    }

    if (name === "挖礦") {
      await interaction.deferReply();
      let outcome = null;
      await updatePlayer(interaction.user.id, (player) => {
        outcome = mine(player);
        return outcome.player;
      });
      await interaction.editReply({
        embeds: [buildMiningEmbed(outcome)],
        files: buildHudFiles(outcome.player, outcome)
      });
      return;
    }

    if (name === "狀態") {
      const result = await updatePlayer(interaction.user.id, (player) => getPlayer(player));
      await interaction.reply(makeReply(name, formatInventory(result)));
      return;
    }

    if (name === "商店") {
      const result = await updatePlayer(interaction.user.id, (player) => getPlayer(player));
      const progress = getProgressWithGlobal(await loadPlayers());
      await interaction.reply({
        embeds: [buildShopEmbed(result, formatShop(progress), progress)],
        ephemeral: true
      });
      return;
    }

    if (name === "購買") {
      const itemId = interaction.options.getString("商品", true);
      const amount = interaction.options.getInteger("數量") || 1;
      let message = "";
      await updatePlayers((players) => {
        const currentProgress = getProgressWithGlobal(players);
        const before = getPlayer(players[interaction.user.id]);
        const result = buyShopItem(players[interaction.user.id], itemId, amount, currentProgress);
        message = result.message;
        players[interaction.user.id] = result.player;
        if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
        const spent = Math.max(0, (before.gold || 0) - (result.player.gold || 0));
        if (result.ok && spent > 0) recordAnalyticsOnPlayers(players, interaction.user.id, "goldSpent", { amount: spent });
        return players;
      });
      await interaction.reply(makeReply("購買", message));
      return;
    }

    if (name === "包包") {
      await interaction.deferReply({ ephemeral: true });
      const result = await updatePlayer(interaction.user.id, (player) => getPlayer(player));
      await interaction.editReply(await buildCollectionResponse(result));
      return;
    }

    if (name === "兌換") {
      const amount = interaction.options.getInteger("數量") || 1;
      let message = "";
      await updatePlayer(interaction.user.id, (player) => {
        const result = exchange(player, amount);
        message = result.message;
        return result.player;
      });
      await interaction.reply(makeReply("兌換", message));
      return;
    }

    if (name === "除鏽") {
      const amount = interaction.options.getInteger("數量") || 1;
      let message = "";
      await updatePlayer(interaction.user.id, (player) => {
        const result = removeRust(player, amount);
        message = result.message;
        return result.player;
      });
      await interaction.reply(makeReply("除鏽", message));
      return;
    }

    if (name === "丟棄") {
      const itemId = interaction.options.getString("物品", true);
      const amount = interaction.options.getInteger("數量") || 1;
      let message = "";
      await updatePlayer(interaction.user.id, (player) => {
        const result = discardItem(player, itemId, amount);
        message = result.message;
        return result.player;
      });
      await interaction.reply(makeReply("丟棄", message));
      return;
    }

    if (name === "交易") {
      const target = interaction.options.getUser("對象", true);
      const itemId = interaction.options.getString("物品", false) || interaction.options.getString("紀念幣", false);
      const amount = interaction.options.getInteger("數量") || 1;
      const gold = interaction.options.getInteger("金幣") || 0;

      if (!itemId && gold <= 0) {
        await interaction.reply({ content: "請至少指定交易物品（治療藥水）或金幣數量。", ephemeral: true });
        return;
      }

      if (target.id === interaction.user.id) {
        await interaction.reply({ content: "不能交易給自己。", ephemeral: true });
        return;
      }

      if (target.bot) {
        await interaction.reply({ content: "不能交易給機器人。", ephemeral: true });
        return;
      }

      cleanupExpiredTrades();
      if (hasActiveTradeForUsers(interaction.user.id, target.id)) {
        await interaction.reply({ content: "你或對方已有進行中的交易，請先完成或等待逾時。", ephemeral: true });
        return;
      }

      if (itemId === "healingPotion" || itemId === "magicCandy") {
        if (gold > 0) {
          await interaction.reply({ content: "物品交易請勿同時指定金幣。", ephemeral: true });
          return;
        }
        if (amount <= 0) {
          await interaction.reply({ content: "交易數量必須大於 0。", ephemeral: true });
          return;
        }
        const sender = getPlayer((await loadPlayers())[interaction.user.id]);
        const itemLabel = itemId === "magicCandy" ? "神奇糖果" : "治療藥水";
        const itemUnit = itemId === "magicCandy" ? "顆" : "瓶";
        if (sender[itemId] < amount) {
          await interaction.reply({ content: `你的${itemLabel}不足，目前只有 ${sender[itemId]} ${itemUnit}。`, ephemeral: true });
          return;
        }
        const pending = createPendingTrade({
          kind: "consumable",
          fromId: interaction.user.id,
          toId: target.id,
          amount,
          itemId,
          gold: 0,
          summary: `${itemLabel} x${amount}`
        });
        await interaction.reply({
          content: `**交易請求**\n${describeTradeRequest(pending, interaction.user, target)}\n60 秒內有效。`,
          components: makeTradeComponents(pending.id)
        });
        return;
      }

      const players = await loadPlayers();
      const validation = transferCollectible(
        players[interaction.user.id],
        players[target.id],
        itemId,
        itemId ? amount : 0,
        gold
      );
      if (!validation.ok) {
        await interaction.reply({ content: validation.message, ephemeral: true });
        return;
      }

      if (gold > 0) {
        const summaryParts = [];
        if (itemId && amount > 0) summaryParts.push(`紀念幣 x${amount}`);
        summaryParts.push(`${gold} 金幣`);
        const pending = createPendingTrade({
          kind: "collectible",
          fromId: interaction.user.id,
          toId: target.id,
          itemId,
          amount: itemId ? amount : 0,
          gold,
          summary: summaryParts.join("、")
        });
        await interaction.reply({
          content: `**交易請求**\n${describeTradeRequest(pending, interaction.user, target)}\n對方接受後才會扣除金幣。\n60 秒內有效。`,
          components: makeTradeComponents(pending.id)
        });
        return;
      }

      const result = await updatePlayers((players) => {
        const trade = transferCollectible(
          players[interaction.user.id],
          players[target.id],
          itemId,
          itemId ? amount : 0,
          gold
        );
        players[interaction.user.id] = trade.from;
        players[target.id] = trade.to;
        return trade;
      });

      await interaction.reply(makeReply("交易", `${result.message}${result.ok ? ` 收件人：${target}。` : ""}`));
      return;
    }

    if (name === "復活") {
      let message = "";
      await updatePlayer(interaction.user.id, (player) => {
        const result = revive(player);
        message = result.message;
        return result.player;
      });
      await interaction.reply(makeReply("復活", message));
      return;
    }

    await interaction.reply({ content: "未知指令。", ephemeral: true });
  } catch (error) {
    logInteractionError(error, interaction, "command");
    const payload = {
      content: "指令執行時發生錯誤，請稍後再試。",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
});

async function handleChickenRaceInteraction(interaction) {
  const race = getRaceState(interaction.guildId);
  if (!race) {
    await interaction.reply({ content: "目前沒有賽雞場，請使用 `/賽雞場` 開啟。", ephemeral: true });
    return;
  }
  const parsed = parseRaceCustomId(interaction.customId);
  if (!parsed || !isCurrentRaceComponent(race, interaction.customId)) {
    await interaction.reply({ content: "這是舊的賽雞面板，請使用最新的賽雞場面板。", ephemeral: true });
    return;
  }

  if (parsed.action === "start") {
    await interaction.deferUpdate();
    await startRaceAnimation(race);
    return;
  }

  if (parsed.action === "next") {
    if (race.status !== "settled") {
      await interaction.reply({ content: "這場還沒結算，不能開始下一場。", ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    const nextRace = startRace(Date.now(), Math.random, interaction.guildId, interaction.user.id);
    nextRace.message = interaction.message;
    await interaction.editReply({
      embeds: [buildRaceEmbed(nextRace, "新一場賽雞開始，下注階段 15 秒。")],
      components: buildRaceComponents(nextRace)
    });
    scheduleRaceBettingEnd(nextRace);
    return;
  }

  if (parsed.action === "bet") {
    const { betType, chickenId } = parsed;
    let result = null;
    await updatePlayer(interaction.user.id, (player) => {
      result = buyTicket(race, interaction.user.id, betType, chickenId, getPlayer(player));
      return result.player;
    });
    await interaction.reply({ content: result.message, ephemeral: true });
    await editRaceMessage(race, result.ok ? "票券已更新。" : "");
    return;
  }

  if (parsed.action === "roast") {
    const { chickenId } = parsed;
    let result = null;
    await updatePlayer(interaction.user.id, (player) => {
      result = roastChicken(race, chickenId, getPlayer(player));
      return result.player;
    });
    await interaction.reply({ content: result.message, ephemeral: true });
    await editRaceMessage(race, result.ok ? "🍗 烤雞香味飄過賽道。" : "");
  }
}

async function handleChickenPkInteraction(interaction) {
  const [, action, battleId] = interaction.customId.split(":");
  const battle = getBattle(battleId);
  if (!battle) {
    await interaction.reply({ content: "這場賽雞 PK 已結束或不存在。", ephemeral: true });
    return;
  }
  if (interaction.user.id !== battle.targetId) {
    await interaction.reply({ content: "只有被挑戰者可以回應這場 PK。", ephemeral: true });
    return;
  }
  if (Date.now() > battle.expiresAt) {
    clearBattle(battle.id);
    await interaction.update({ content: "賽雞 PK 挑戰已逾時。", embeds: [], components: [] });
    return;
  }
  if (action === "decline") {
    clearBattle(battle.id);
    await interaction.update({ content: "賽雞 PK 已拒絕。", embeds: [], components: [] });
    return;
  }
  if (action === "accept") {
    await interaction.deferUpdate();
    battle.message = interaction.message;
    await startChickenBattleAnimation(battle);
  }
}

async function handleChickenUpgradeInteraction(interaction) {
  const optionId = interaction.customId.split(":")[1];
  await interaction.deferUpdate();
  let result = null;
  await updatePlayer(interaction.user.id, (player) => {
    result = chooseChickenUpgrade(player, optionId);
    return result.player;
  });
  await interaction.editReply({
    embeds: [buildChickenEmbed(result.player, "養雞面板", result.message)],
    components: buildChickenPanelComponents(result.player, interaction.user.id)
  });
}

function createChickenRoastFeast(ownerId, chickenName) {
  const feastId = `${Date.now()}-${ownerId}`;
  const feast = {
    id: feastId,
    ownerId,
    chickenName,
    eaten: new Set([ownerId]),
    expiresAt: Date.now() + 10 * 60 * 1000
  };
  activeChickenRoastFeasts.set(feastId, feast);
  return feast;
}

function buildChickenRoastFeastComponents(feast) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_ROAST_FEAST_PREFIX}:eat:${feast.id}`)
        .setLabel("一起吃")
        .setEmoji("🍗")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

async function publishChickenRoastFeast(interaction, ownerId, chickenName) {
  const feast = createChickenRoastFeast(ownerId, chickenName);
  const content = [
    `🍗 <@${ownerId}> 烤掉了「${chickenName}」。`,
    "香味飄滿整個頻道，大家可以一起吃。",
    "每人限吃一次：下一場下礦最大生命 +1。"
  ].join("\n");
  return interaction.followUp({
    content,
    components: buildChickenRoastFeastComponents(feast),
    ephemeral: false
  });
}

async function publishChickenRoastFeastFromMessage(message, ownerId, chickenName) {
  const feast = createChickenRoastFeast(ownerId, chickenName);
  const content = [
    `🍗 生死鬥結束，<@${ownerId}> 的「${chickenName}」被烤來吃了。`,
    "香味飄滿整個頻道，大家可以一起吃。",
    "每人限吃一次：下一場下礦最大生命 +1。"
  ].join("\n");
  return message.reply({
    content,
    components: buildChickenRoastFeastComponents(feast)
  });
}

async function handleChickenRoastFeastInteraction(interaction) {
  const [, action, feastId] = interaction.customId.split(":");
  const feast = activeChickenRoastFeasts.get(feastId);
  if (action !== "eat" || !feast || Date.now() > feast.expiresAt) {
    activeChickenRoastFeasts.delete(feastId);
    await interaction.reply({ content: "這盤烤雞已經冷掉了。", ephemeral: true });
    return;
  }
  if (interaction.user.id === feast.ownerId) {
    await interaction.reply({ content: "你是主廚，自己的加成已經拿到了。", ephemeral: true });
    return;
  }
  if (feast.eaten.has(interaction.user.id)) {
    await interaction.reply({ content: "你已經吃過這盤烤雞了。", ephemeral: true });
    return;
  }
  let result = null;
  await updatePlayer(interaction.user.id, (player) => {
    result = shareRoastChickenMeal(player);
    return result.player;
  });
  feast.eaten.add(interaction.user.id);
  await interaction.reply({ content: result.message, ephemeral: true });
}

async function handleChickenPanelInteraction(interaction) {
  const [, action, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "只有雞的主人可以操作這個面板。", ephemeral: true });
    return;
  }
  if (action === "rename") {
    await interaction.showModal(buildChickenRenameModal(ownerId));
    return;
  }
  if (action === "refresh") {
    await interaction.deferUpdate();
    const player = await updatePlayer(interaction.user.id, (current) => ensureOwnedChicken(current, Math.random));
    await interaction.editReply({
      embeds: [buildChickenEmbed(player, "養雞面板", "已刷新。")],
      components: buildChickenPanelComponents(player, interaction.user.id)
    });
    return;
  }
  if (action === "items") {
    await interaction.deferUpdate();
    const player = await updatePlayer(interaction.user.id, (current) => ensureOwnedChicken(current, Math.random));
    await interaction.editReply({
      embeds: [buildChickenEmbed(player, "養雞道具", "選擇要使用的道具。")],
      components: buildChickenItemComponents(player, interaction.user.id)
    });
    return;
  }
  if (action === "feed_normal" || action === "feed_gourmet" || action === "clean") {
    await interaction.deferUpdate();
    let result = null;
    await updatePlayer(interaction.user.id, (player) => {
      result = action === "clean"
        ? cleanChickenCoop(player, Date.now(), Math.random)
        : feedChicken(player, action === "feed_gourmet" ? "gourmetFeed" : "normalFeed", Date.now(), Math.random);
      return result.player;
    });
    await interaction.editReply({
      embeds: [buildChickenEmbed(result.player, "養雞面板", result.message)],
      components: buildChickenPanelComponents(result.player, interaction.user.id)
    });
    return;
  }
  if (action === "candy") {
    await interaction.deferUpdate();
    let result = null;
    await updatePlayer(interaction.user.id, (player) => {
      result = eatMagicCandy(player, Math.random);
      return result.player;
    });
    await interaction.editReply({
      embeds: [buildChickenEmbed(result.player, "養雞道具", result.message)],
      components: buildChickenItemComponents(result.player, interaction.user.id)
    });
    return;
  }
  if (action === "booster") {
    await interaction.deferUpdate();
    let result = null;
    await updatePlayer(interaction.user.id, (player) => {
      result = useChickenBooster(player, Date.now(), Math.random);
      return result.player;
    });
    await interaction.editReply({
      embeds: [buildChickenEmbed(result.player, "養雞道具", result.message)],
      components: buildChickenItemComponents(result.player, interaction.user.id)
    });
    return;
  }
  if (action === "medicine" || action === "auto_cleaner") {
    await interaction.deferUpdate();
    let result = null;
    await updatePlayer(interaction.user.id, (player) => {
      result = action === "medicine"
        ? useChickenMedicine(player, Date.now(), Math.random)
        : useAutoCleaner(player, Date.now(), Math.random);
      return result.player;
    });
    await interaction.editReply({
      embeds: [buildChickenEmbed(result.player, "養雞道具", result.message)],
      components: buildChickenItemComponents(result.player, interaction.user.id)
    });
    return;
  }
  if (action === "timing") {
    await interaction.deferUpdate();
    let result = null;
    await updatePlayer(interaction.user.id, (player) => {
      result = cycleChickenSkillTiming(player);
      return result.player;
    });
    await interaction.editReply({
      embeds: [buildChickenEmbed(result.player, "養雞面板", result.message)],
      components: buildChickenPanelComponents(result.player, interaction.user.id)
    });
    return;
  }
  if (action === "roast") {
    await interaction.deferUpdate();
    const player = await updatePlayer(interaction.user.id, (current) => ensureOwnedChicken(current, Math.random));
    const chicken = player.ownedChicken;
    await interaction.editReply({
      content: [
        `🍗 確定要烤掉「${chicken.name}」嗎？`,
        "",
        `牠陪你贏過 ${chicken.wins} 場比賽。`,
        "烤掉後下一場下礦最大生命 +1，並且你之後會重新獲得一隻初始雞。"
      ].join("\n"),
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${OWNED_CHICKEN_ROAST_PREFIX}:confirm:${interaction.user.id}`)
            .setLabel("確認烤掉")
            .setEmoji("🍗")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`${OWNED_CHICKEN_ROAST_PREFIX}:cancel:${interaction.user.id}`)
            .setLabel("取消")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  }
}

async function handleOwnedChickenRoastInteraction(interaction) {
  const [, action, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "只有雞的主人可以操作。", ephemeral: true });
    return;
  }
  if (action === "cancel") {
    const player = await updatePlayer(interaction.user.id, (current) => ensureOwnedChicken(current, Math.random));
    await interaction.update({
      content: "",
      embeds: [buildChickenEmbed(player, "養雞面板", "已取消烤雞。")],
      components: buildChickenPanelComponents(player, interaction.user.id)
    });
    return;
  }
  let result = null;
  let chickenName = "";
  await updatePlayer(interaction.user.id, (player) => {
    chickenName = player.ownedChicken ? player.ownedChicken.name : "自己的雞";
    result = roastOwnedChicken(player);
    return result.player;
  });
  await interaction.update({ content: result.message, embeds: [], components: [] });
  if (result.ok) await publishChickenRoastFeast(interaction, interaction.user.id, chickenName);
}

async function handleChallengeInteraction(interaction) {
  const parsed = parseChallengeCustomId(interaction.customId);
  if (interaction.user.id !== parsed.userId) {
    await interaction.reply({ content: "這是別人的挑戰面板。", ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  let result = null;
  let showLeaderboard = false;
  await updatePlayers((players) => {
    const player = players[interaction.user.id];
    if (parsed.action === "trait") {
      const selected = interaction.isStringSelectMenu() ? interaction.values[0] : "";
      result = chooseChallengeTrait(player, selected);
      players[interaction.user.id] = result.player;
      return players;
    }
    if (parsed.action === "start") {
      result = startChallenge(player, Math.random);
      players[interaction.user.id] = result.player;
      if (result.player && result.player.challenge && result.player.challenge.active) {
        recordAnalyticsOnPlayers(players, interaction.user.id, "challenge");
      }
      return players;
    }
    if (parsed.action === "route") {
      result = mineChallengeRoute(player, parsed.value, Math.random);
      players[interaction.user.id] = result.player;
      if (result.player && result.player.challenge && result.player.challenge.stats && result.player.challenge.stats.events > ((player && player.challenge && player.challenge.stats && player.challenge.stats.events) || 0)) {
        recordAnalyticsOnPlayers(players, interaction.user.id, "event", { eventId: "challenge" });
      }
      return players;
    }
    if (parsed.action === "potion") {
      result = drinkChallengePotion(player);
      players[interaction.user.id] = result.player;
      if ((result.player.challenge && result.player.challenge.potions) < (player.challenge && player.challenge.potions || 0)) {
        recordAnalyticsOnPlayers(players, interaction.user.id, "potion", { amount: 1 });
      }
      return players;
    }
    if (parsed.action === "leave") {
      result = endChallenge(player, false);
      players[interaction.user.id] = result.player;
      return players;
    }
    if (parsed.action === "sell" || parsed.action === "buyPotion" || parsed.action === "buyBuff" || parsed.action === "replaceTrait" || parsed.action === "skip") {
      result = handleMerchantAction(player, parsed.action, parsed.value);
      players[interaction.user.id] = result.player;
      return players;
    }
    if (parsed.action === "leaderboard") {
      showLeaderboard = true;
      result = { player: getPlayer(player), message: "排行榜" };
      players[interaction.user.id] = result.player;
      return players;
    }
    result = { player: getPlayer(player), message: "未知的挑戰操作。" };
    players[interaction.user.id] = result.player;
    return players;
  });

  if (showLeaderboard) {
    await interaction.editReply({
      embeds: [buildChallengeLeaderboardEmbed(await loadPlayers())],
      components: buildChallengeComponents(result.player, interaction.user.id)
    });
    return;
  }

  await interaction.editReply({
    embeds: [buildChallengeEmbed(result.player, result.message, interaction.user)],
    components: buildChallengeComponents(result.player, interaction.user.id)
  });
}

async function handleMiningButton(interaction) {
  const panelTargetUserId = getPanelTargetUserId(interaction) || interaction.user.id;
  const isRescueButton = interaction.customId.startsWith(`${CUSTOM_IDS.rescuePrefix}:`);
  const isAdminPanelOperator = canUseAdminCommand(interaction.user.id);
  if (panelTargetUserId !== interaction.user.id && !isRescueButton && !isAdminPanelOperator) {
    await interaction.reply({
      content: "這是別人的礦場面板。請使用 `/礦場` 打開自己的面板。",
      ephemeral: true
    });
    return;
  }

  const players = await loadPlayers();
  const panelPlayer = getPlayer(players[panelTargetUserId]);
  const panelMessageId = interaction.message && interaction.message.id ? interaction.message.id : "";
  if (!isRescueButton && panelPlayer.activeMinePanelMessageId && panelMessageId && panelPlayer.activeMinePanelMessageId !== panelMessageId) {
    await interaction.reply({
      content: "這是舊的礦場面板，請使用最新的 `/礦場` 面板。",
      ephemeral: true
    });
    return;
  }

  const openAmountModal = interaction.customId === CUSTOM_IDS.bankDeposit
    || interaction.customId.startsWith(`${CUSTOM_IDS.bankDeposit}:`)
    || interaction.customId === CUSTOM_IDS.bankWithdraw
    || interaction.customId.startsWith(`${CUSTOM_IDS.bankWithdraw}:`)
    || interaction.customId === CUSTOM_IDS.exchangeOne;
  const openStorageModal = interaction.customId === CUSTOM_IDS.storageDeposit
    || interaction.customId === CUSTOM_IDS.storageWithdraw;
  const shopCustomBuyItemId = parseShopCustomBuyButton(interaction.customId);
  if (!openAmountModal && !openStorageModal && !shopCustomBuyItemId) await interaction.deferUpdate();
  if (openAmountModal) {
    await interaction.showModal(buildAmountInputModal(
      interaction.customId === CUSTOM_IDS.bankDeposit || interaction.customId.startsWith(`${CUSTOM_IDS.bankDeposit}:`)
        ? "deposit"
        : interaction.customId === CUSTOM_IDS.bankWithdraw || interaction.customId.startsWith(`${CUSTOM_IDS.bankWithdraw}:`)
          ? "withdraw"
          : "exchange",
      panelTargetUserId,
      interaction.user.id,
      panelMessageId
    ));
    return;
  }
  if (openStorageModal) {
    await interaction.showModal(buildStorageInputModal(
      interaction.customId === CUSTOM_IDS.storageDeposit ? "deposit" : "withdraw",
      panelTargetUserId,
      interaction.user.id,
      panelMessageId
    ));
    return;
  }
  if (shopCustomBuyItemId) {
    await interaction.showModal(buildShopBuyInputModal(
      shopCustomBuyItemId,
      panelTargetUserId,
      interaction.user.id,
      panelMessageId
    ));
    return;
  }
  let embed = null;
  let animationFrames = [];
  let files = [];
  let componentTargetId = panelTargetUserId;
  let componentPlayer = null;
  const hudPage = getCurrentHudPage(interaction);

  if (interaction.customId.startsWith(`${CUSTOM_IDS.pagePrefix}:`)) {
    const progress = getProgressWithGlobal(await loadPlayers());
    const player = await updatePlayer(panelTargetUserId, (current) => setUiMode(current, "full").player);
    componentPlayer = player;
    embed = buildPanelEmbed(player, "礦場面板", "", interaction.user, hudPage);
    files = buildHudFiles(player);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildPanelComponents(componentTargetId, componentPlayer, progress, hudPage)
    });
    return;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.uiModePrefix}:`)) {
    const mode = interaction.customId.split(":")[2];
    const progress = getProgressWithGlobal(await loadPlayers());
    const result = await updatePlayer(panelTargetUserId, (player) => setUiMode(player, mode).player);
    componentPlayer = result;
    embed = buildPanelEmbed(result, "顯示模式", mode === "compact" ? "已切換為精簡 UI。" : "已切換為完整 UI。", interaction.user, hudPage);
    files = buildHudFiles(result);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildPanelComponents(componentTargetId, componentPlayer, progress, hudPage)
    });
    return;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.modePrefix}:`) || interaction.customId === CUSTOM_IDS.modeDouble || interaction.customId === CUSTOM_IDS.modeSafe) {
    const mode = interaction.customId.startsWith(`${CUSTOM_IDS.modePrefix}:`)
      ? interaction.customId.split(":")[2]
      : interaction.customId === CUSTOM_IDS.modeDouble
        ? "double"
        : "safe";
    await updatePlayer(panelTargetUserId, (player) => {
      const result = chooseRunMode(player, mode, Math.random);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "下礦方式", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.rerollModes) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = rerollRunModeOptions(player, Math.random);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "刷新詞條", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.useRaptorTicket) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = useRaptorCaveTicket(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "猛禽洞窟入場券", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (
    [CUSTOM_IDS.mine, CUSTOM_IDS.mineLeft, CUSTOM_IDS.mineRight].includes(interaction.customId)
    || interaction.customId.startsWith(`${CUSTOM_IDS.minePathPrefix}:`)
  ) {
    const digPath = interaction.customId.startsWith(`${CUSTOM_IDS.minePathPrefix}:`)
      ? interaction.customId.split(":")[2]
      : interaction.customId === CUSTOM_IDS.mineLeft
      ? "left"
      : interaction.customId === CUSTOM_IDS.mineRight
        ? "right"
        : null;
    await updatePlayers((players) => {
      const previousBestDepth = getGlobalBestDepth(players);
      const beforePlayer = getPlayer(players[panelTargetUserId]);
      const outcome = attachGlobalRecordMessage(
        mine(beforePlayer, Math.random, Date.now(), digPath),
        previousBestDepth,
        interaction.user
      );
      players[panelTargetUserId] = outcome.player;
      recordAnalyticsOnPlayers(players, panelTargetUserId, "mine", {
        depth: outcome.player.runDepthProgress || outcome.player.depth || 0,
        route: digPath || "dig",
        trait: outcome.player.runMode || ""
      });
      if (!beforePlayer.dead && outcome.player.dead) {
        recordAnalyticsOnPlayers(players, panelTargetUserId, "death", { cause: "挖礦死亡" });
      }
      if (outcome.player.pendingEvent && outcome.player.pendingEvent !== beforePlayer.pendingEvent) {
        recordAnalyticsOnPlayers(players, panelTargetUserId, "event", { eventId: outcome.player.pendingEvent });
      }
      const earnedGold = Math.max(0, (outcome.player.gold || 0) - (beforePlayer.gold || 0));
      if (earnedGold > 0) recordAnalyticsOnPlayers(players, panelTargetUserId, "goldEarned", { amount: earnedGold });
      componentPlayer = outcome.player;
      embed = buildMiningEmbed(outcome, interaction.user, hudPage);
      files = buildHudFiles(outcome.player, outcome);
      return outcome;
    });
  }

  if (interaction.customId === CUSTOM_IDS.buffGold) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = chooseMinorBuff(player, "gold");
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "小磁條", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.buffBomb) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = chooseMinorBuff(player, "bomb");
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "小磁條", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.buffPrefix}:`)) {
    const buff = interaction.customId.split(":")[2];
    await updatePlayer(panelTargetUserId, (player) => {
      const result = chooseMinorBuff(player, buff);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "小詞條", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.supplyBuyPrefix}:`)) {
    const itemId = interaction.customId.split(":")[2];
    await updatePlayer(panelTargetUserId, (player) => {
      const result = buySupplyStationItem(player, itemId);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "補給站", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.supplySellPrefix}:`)) {
    const buff = interaction.customId.split(":")[2];
    await updatePlayer(panelTargetUserId, (player) => {
      const result = sellSupplyStationBuff(player, buff);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "補給站", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.supplyLeave) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = leaveSupplyStation(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "補給站", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.chargePrefix}:`)) {
    const type = interaction.customId.split(":")[2];
    await updatePlayer(panelTargetUserId, (player) => {
      const result = triggerCharge(player, type);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "蓄力爆發", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.bag) {
    await updatePlayer(panelTargetUserId, (player) => {
      const next = getPlayer(player);
      componentPlayer = next;
      embed = null;
      return next;
    });
    const collectionResponse = await buildCollectionResponse(componentPlayer);
    const progress = getProgressWithGlobal(await loadPlayers());
    await interaction.editReply({
      embeds: collectionResponse.embeds,
      files: collectionResponse.files,
      attachments: [],
      components: buildPanelComponents(componentTargetId, componentPlayer, progress, hudPage)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.leaderboard) {
    const players = await loadPlayers();
    embed = buildLeaderboardEmbed(players);
    files = [];
  }

  if (
    interaction.customId === CUSTOM_IDS.eventRisk
    || interaction.customId === CUSTOM_IDS.eventSafe
    || interaction.customId === CUSTOM_IDS.eventExtreme
    || interaction.customId.startsWith(`${CUSTOM_IDS.eventQtePrefix}:`)
  ) {
    const choice = interaction.customId.startsWith(`${CUSTOM_IDS.eventQtePrefix}:`)
      ? interaction.customId.split(":")[2]
      : interaction.customId === CUSTOM_IDS.eventRisk
      ? "risk"
      : interaction.customId === CUSTOM_IDS.eventExtreme
        ? "extreme"
        : "safe";
    await updatePlayers((players) => {
      const previousBestDepth = getGlobalBestDepth(players);
      const player = getPlayer(players[panelTargetUserId]);
      const result = player.eventChallenge
        ? resolveEventChallenge(player, choice, Math.random, Date.now())
        : resolveRandomEvent(player, choice);
      const next = attachGlobalRecordMessage(
        { player: result.player },
        previousBestDepth,
        interaction.user
      );
      const message = next.globalRecordMessage
        ? `${result.message}\n\n${next.globalRecordMessage}`
        : result.announcement
          ? `${result.message}\n\n${result.announcement.replace("<@PLAYER>", `<@${panelTargetUserId}>`)}`
          : result.message;
      const resultFrames = Array.isArray(result.animationFrames) ? result.animationFrames : [];
      players[panelTargetUserId] = result.player;
      if (!player.dead && result.player.dead) {
        recordAnalyticsOnPlayers(players, panelTargetUserId, "death", { cause: "事件" });
      }
      const earnedGold = Math.max(0, (result.player.gold || 0) - (player.gold || 0));
      if (earnedGold > 0) recordAnalyticsOnPlayers(players, panelTargetUserId, "goldEarned", { amount: earnedGold });
      componentPlayer = result.player;
      if (resultFrames.length > 0) {
        animationFrames = resultFrames.map((frame, index) => {
          const frameMessage = index === resultFrames.length - 1 ? message : frame;
          return buildPanelEmbed(result.player, result.title, frameMessage, interaction.user, hudPage);
        });
        embed = animationFrames[0];
      } else {
        embed = buildPanelEmbed(result.player, result.title, message, interaction.user, hudPage);
      }
      files = buildHudFiles(result.player);
      return result;
    });
  }

  if (interaction.customId === CUSTOM_IDS.shopOpen) {
    const progress = getProgressWithGlobal(await loadPlayers());
    const player = await updatePlayer(panelTargetUserId, (current) => getPlayer(current));
    componentPlayer = player;
    embed = buildShopEmbed(player, "選擇下方商品購買。", progress);
    files = buildHudFiles(player);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildShopComponents(progress, player, panelTargetUserId)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.bankOpen) {
    const player = await updatePlayer(panelTargetUserId, (current) => getPlayer(current));
    componentPlayer = player;
    embed = buildPanelEmbed(player, "銀行", "選擇存入或領出，下一步可以指定金額。", interaction.user, hudPage);
    files = buildHudFiles(player);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildBankComponents(panelTargetUserId)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.shopExit || interaction.customId.startsWith(`${CUSTOM_IDS.shopExit}:`)) {
    const progress = getProgressWithGlobal(await loadPlayers());
    const player = await updatePlayer(panelTargetUserId, (current) => getPlayer(current));
    componentPlayer = player;
    embed = buildPanelEmbed(player, "礦場面板", "已返回礦場面板。", interaction.user, hudPage);
    files = buildHudFiles(player);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildPanelComponents(componentTargetId, componentPlayer, progress, hudPage)
    });
    return;
  }

  const shopBuyRequest = parseShopBuyButton(interaction.customId);
  if (shopBuyRequest) {
    let shopProgress = null;
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const before = getPlayer(players[panelTargetUserId]);
      const result = buyShopItem(players[panelTargetUserId], shopBuyRequest.itemId, shopBuyRequest.amount, progress);
      const nextProgress = result.globalState
        ? { ...progress, globalState: result.globalState }
        : progress;
      shopProgress = nextProgress;
      componentPlayer = result.player;
      embed = buildShopEmbed(result.player, result.message, nextProgress);
      files = buildHudFiles(result.player);
      players[panelTargetUserId] = result.player;
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
      const spent = Math.max(0, (before.gold || 0) - (result.player.gold || 0));
      if (result.ok && spent > 0) recordAnalyticsOnPlayers(players, panelTargetUserId, "goldSpent", { amount: spent });
      return players;
    });
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildShopComponents(shopProgress, componentPlayer, panelTargetUserId)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.shopShimmer) {
    const progress = getProgressWithGlobal(await loadPlayers());
    const itemIds = (interaction.values || []).map((value) => String(value).split("#")[0]);
    await updatePlayer(panelTargetUserId, (player) => {
      const result = shimmerCollectible(player, itemIds, Math.random);
      componentPlayer = result.player;
      embed = buildShopEmbed(result.player, result.message, progress);
      files = buildHudFiles(result.player);
      return result.player;
    });
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildShopComponents(progress, componentPlayer, panelTargetUserId)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.discardItem) {
    const itemId = interaction.values && interaction.values[0];
    await updatePlayer(panelTargetUserId, (player) => {
      const result = discardItem(player, itemId, 1);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "丟棄", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.drinkPotion) {
    await updatePlayers((players) => {
      const player = players[panelTargetUserId];
      const result = drinkHealingPotion(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "治療藥水", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      players[panelTargetUserId] = result.player;
      if (result.ok) recordAnalyticsOnPlayers(players, panelTargetUserId, "potion", { amount: 1 });
      return players;
    });
  }

  if (interaction.customId === CUSTOM_IDS.eatCandy) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = eatMagicCandy(player, Math.random);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "神奇糖果", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.rustOne) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = removeRust(player, 1);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "除鏽", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.discardRustOne) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = discardItem(player, "rusty", 1);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "丟棄", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.returnSurface) {
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const result = returnToSurface(players[panelTargetUserId], Math.random, progress.globalState, Date.now());
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "返回地面", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      players[panelTargetUserId] = result.player;
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
      return players;
    });
  }

  if (interaction.customId === CUSTOM_IDS.undergroundCamp) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = travelToUndergroundCamp(player, Date.now());
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "地底營地", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.undergroundInn) {
    let innSnapshot = null;
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const result = openUndergroundInn(players[panelTargetUserId], progress.globalState, Date.now());
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
      players[panelTargetUserId] = result.player;
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "地底客棧", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      innSnapshot = getUndergroundInnSnapshot(result.globalState, Date.now());
      return players;
    });
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildUndergroundInnComponents(innSnapshot)
    });
    return;
  }

  if (interaction.customId && interaction.customId.startsWith(`${CUSTOM_IDS.undergroundInnBuyPrefix}:`)) {
    const itemId = interaction.customId.split(":")[2];
    let innSnapshot = null;
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const result = buyUndergroundInnItem(players[panelTargetUserId], itemId, progress.globalState, Date.now());
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
      players[panelTargetUserId] = result.player;
      const opened = openUndergroundInn(result.player, result.globalState, Date.now());
      componentPlayer = opened.player;
      embed = buildPanelEmbed(opened.player, "地底客棧", `${result.message}\n\n${opened.message}`, interaction.user, hudPage);
      files = buildHudFiles(opened.player);
      innSnapshot = getUndergroundInnSnapshot(opened.globalState, Date.now());
      return players;
    });
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildUndergroundInnComponents(innSnapshot)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.undergroundInnBlessings) {
    const progress = getProgressWithGlobal(await loadPlayers());
    const result = openUndergroundInn(panelPlayer, progress.globalState, Date.now());
    const blessingLines = Object.entries(result.player.activeMarketBlessings || {})
      .filter(([, expiresAt]) => expiresAt > Date.now())
      .map(([type, expiresAt]) => `${type}：剩餘 ${Math.ceil((expiresAt - Date.now()) / 60000)} 分`);
    embed = buildPanelEmbed(result.player, "地底客棧｜祝福", blessingLines.length ? blessingLines.join("\n") : "目前沒有收購祝福。", interaction.user, hudPage);
    files = buildHudFiles(result.player);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildUndergroundInnComponents(getUndergroundInnSnapshot(progress.globalState, Date.now()))
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.skyUnknownLife) {
    await updatePlayers((players) => {
      const before = getPlayer(players[panelTargetUserId]);
      const result = tradeSkyUnknownLife(before, Date.now());
      players[panelTargetUserId] = result.player;
      const earnedGold = Math.max(0, (result.player.gold || 0) - (before.gold || 0));
      if (earnedGold > 0) recordAnalyticsOnPlayers(players, panelTargetUserId, "goldEarned", { amount: earnedGold });
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "天界未知生命", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return players;
    });
  }

  if (interaction.customId === CUSTOM_IDS.undergroundStorage) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = openUndergroundStorage(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "倉庫", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildStorageComponents()
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.revive) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = revive(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "復活", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.rescuePrefix}:`)) {
    const targetUserId = interaction.customId.split(":")[2];
    componentTargetId = targetUserId && targetUserId !== "none" ? targetUserId : interaction.user.id;

    if (!targetUserId || targetUserId === "none" || targetUserId === interaction.user.id) {
      const player = await updatePlayer(interaction.user.id, (current) => getPlayer(current));
      componentPlayer = player;
      embed = buildPanelEmbed(player, "救援", "不能救援自己，請讓其他玩家幫你。", interaction.user, hudPage);
      files = buildHudFiles(player);
    } else {
      const result = await updatePlayers((players) => {
        const rescue = rescuePlayer(players[interaction.user.id], players[targetUserId]);
        players[interaction.user.id] = rescue.rescuer;
        players[targetUserId] = rescue.target;
        return rescue;
      });
      embed = buildPanelEmbed(result.target, "救援", result.message, interaction.user, hudPage);
      componentPlayer = result.target;
      files = buildHudFiles(result.target);
    }
  }

  const progress = getProgressWithGlobal(await loadPlayers());
  const components = buildPanelComponents(componentTargetId, componentPlayer, progress, hudPage);
  if (animationFrames.length > 0) {
    for (let index = 0; index < animationFrames.length; index += 1) {
      if (index > 0) await sleep(850);
      await interaction.editReply({
        embeds: [animationFrames[index]],
        files: index === 0 ? files : [],
        attachments: [],
        components: index === animationFrames.length - 1 ? components : []
      });
    }
    return;
  }
  await interaction.editReply({
    embeds: [embed || buildPanelEmbed(null)],
    files,
    attachments: [],
    components
  });
}

if (process.env.DISABLE_WEB_SERVER !== "true") {
  startWebServer();
}

client.login(token);

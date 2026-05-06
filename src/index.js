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
const { cleanEnvValue } = require("./env");
const { registerApplicationCommands } = require("./register-app-commands");
const {
  buyShopItem,
  chooseMinorBuff,
  chooseRunMode,
  depositBank,
  discardItem,
  drinkHealingPotion,
  exchange,
  formatShop,
  formatInventory,
  ensureRunModeOptions,
  getCommunityProgress,
  getPlayer,
  getShopItems,
  mine,
  openUndergroundStorage,
  openUndergroundInn,
  depositUndergroundStorage,
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
  withdrawUndergroundStorage,
  withdrawBank
} = require("./game");
const {
  getGlobalStateFromPlayers,
  setGlobalStateToPlayers
} = require("./globalState");
const { loadPlayers, updatePlayer, updatePlayers } = require("./storage");
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
  buildChickenUpgradeComponents,
  chooseChickenUpgrade,
  clearBattle,
  createBattle,
  ensureOwnedChicken,
  getBattle,
  isChickenPkComponent,
  isChickenUpgradeComponent,
  renameChicken,
  roastOwnedChicken,
  settleBattle,
  updateBattleFrame
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
  buildShopEmbed,
  isMiningUiButton
} = require("./ui");

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

const activeTrades = new Map();
const TRADE_CUSTOM_PREFIX = "trade:potion";
const BANK_MODAL_PREFIX = "mine_ui:bank_modal";
const STORAGE_MODAL_PREFIX = "mine_ui:storage_modal";
const OWNED_CHICKEN_ROAST_PREFIX = "owned_chicken_roast";

function parseAmountInput(input) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
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
  let players = await loadPlayers();
  updateBattleFrame(battle, players, 0, Math.random);
  await editBattleMessage(battle, players, "⚔️ PK 開始！");
  const interval = 1400;
  for (let frame = 1; frame < PK_FRAME_COUNT; frame += 1) {
    battle.timers.push(setTimeout(async () => {
      try {
        const currentPlayers = await loadPlayers();
        updateBattleFrame(battle, currentPlayers, frame, Math.random);
        await editBattleMessage(battle, currentPlayers);
      } catch (error) {
        console.error("賽雞 PK 更新失敗：", error);
      }
    }, interval * frame));
  }
  battle.timers.push(setTimeout(async () => {
    try {
      let settled = null;
      await updatePlayers((currentPlayers) => {
        settled = settleBattle(battle, currentPlayers, Math.random);
        return settled.players;
      });
      await editBattleMessage(battle, settled.players, settled.message);
      clearBattle(battle.id);
    } catch (error) {
      console.error("賽雞 PK 結算失敗：", error);
      clearBattle(battle.id);
    }
  }, interval * PK_FRAME_COUNT));
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
  if (trade.kind === "healingPotion") {
    return `${fromMention} 想給 ${toMention} 治療藥水 x${trade.amount}`;
  }
  const parts = [];
  if (trade.itemId && trade.amount > 0) parts.push(`紀念幣 x${trade.amount}`);
  if (trade.gold > 0) parts.push(`${trade.gold} 金幣`);
  return `${fromMention} 想給 ${toMention} ${parts.join("、")}`;
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
        const transfer = trade.kind === "healingPotion"
          ? transferHealingPotion(players[trade.fromId], players[trade.toId], trade.amount)
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

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && isMiningUiButton(interaction.customId)) {
      await handleMiningButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const name = interaction.commandName;

    if (name === "礦場") {
      await interaction.deferReply();
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
        return next;
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
        embeds: [buildChickenEmbed(player)],
        components: buildChickenUpgradeComponents(player)
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
        embeds: [buildChickenEmbed(result.player, "命名雞", result.message)],
        components: buildChickenUpgradeComponents(result.player)
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
        created = createBattle(interaction.user.id, target.id, players, Date.now(), Math.random, interaction.guildId);
        return created.players || players;
      });
      if (!created.ok) {
        await interaction.editReply(created.message);
        return;
      }
      await interaction.editReply({
        embeds: [buildBattleEmbed(created.battle, await loadPlayers(), `⚔️ <@${interaction.user.id}> 向 <@${target.id}> 發起賽雞 PK！`)],
        components: buildBattleComponents(created.battle)
      });
      created.battle.message = await interaction.fetchReply();
      created.battle.timers.push(setTimeout(async () => {
        const battle = getBattle(created.battle.id);
        if (!battle || battle.status !== "pending") return;
        clearBattle(battle.id);
        try {
          await interaction.editReply({ content: "賽雞 PK 挑戰已逾時。", embeds: [], components: [] });
        } catch (error) {
          console.error("賽雞 PK 逾時更新失敗：", error);
        }
      }, 60 * 1000));
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
        const result = buyShopItem(players[interaction.user.id], itemId, amount, currentProgress);
        message = result.message;
        players[interaction.user.id] = result.player;
        if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
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

      if (itemId === "healingPotion") {
        if (gold > 0) {
          await interaction.reply({ content: "治療藥水交易請勿同時指定金幣。", ephemeral: true });
          return;
        }
        if (amount <= 0) {
          await interaction.reply({ content: "交易數量必須大於 0。", ephemeral: true });
          return;
        }
        const sender = getPlayer((await loadPlayers())[interaction.user.id]);
        if (sender.healingPotion < amount) {
          await interaction.reply({ content: `你的治療藥水不足，目前只有 ${sender.healingPotion} 瓶。`, ephemeral: true });
          return;
        }
        const pending = createPendingTrade({
          kind: "healingPotion",
          fromId: interaction.user.id,
          toId: target.id,
          amount,
          itemId: null,
          gold: 0,
          summary: `治療藥水 x${amount}`
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
    embeds: [buildChickenEmbed(result.player, "我的雞", result.message)],
    components: buildChickenUpgradeComponents(result.player)
  });
}

async function handleOwnedChickenRoastInteraction(interaction) {
  const [, action, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "只有雞的主人可以操作。", ephemeral: true });
    return;
  }
  if (action === "cancel") {
    await interaction.update({ content: "已取消烤雞。", embeds: [], components: [] });
    return;
  }
  let result = null;
  await updatePlayer(interaction.user.id, (player) => {
    result = roastOwnedChicken(player);
    return result.player;
  });
  await interaction.update({ content: result.message, embeds: [], components: [] });
}

async function handleMiningButton(interaction) {
  const panelTargetUserId = getPanelTargetUserId(interaction) || interaction.user.id;
  const isRescueButton = interaction.customId.startsWith(`${CUSTOM_IDS.rescuePrefix}:`);
  if (panelTargetUserId !== interaction.user.id && !isRescueButton) {
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
  if (!openAmountModal && !openStorageModal) await interaction.deferUpdate();
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
  let embed = null;
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
      const outcome = attachGlobalRecordMessage(
        mine(players[panelTargetUserId], Math.random, Date.now(), digPath),
        previousBestDepth,
        interaction.user
      );
      players[panelTargetUserId] = outcome.player;
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

  if (interaction.customId === CUSTOM_IDS.eventRisk || interaction.customId === CUSTOM_IDS.eventSafe || interaction.customId === CUSTOM_IDS.eventExtreme) {
    const choice = interaction.customId === CUSTOM_IDS.eventRisk
      ? "risk"
      : interaction.customId === CUSTOM_IDS.eventExtreme
        ? "extreme"
        : "safe";
    await updatePlayers((players) => {
      const previousBestDepth = getGlobalBestDepth(players);
      const result = resolveRandomEvent(players[panelTargetUserId], choice);
      const next = attachGlobalRecordMessage(
        { player: result.player },
        previousBestDepth,
        interaction.user
      );
      const message = next.globalRecordMessage
        ? `${result.message}\n\n${next.globalRecordMessage}`
        : result.message;
      players[panelTargetUserId] = result.player;
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, result.title, message, interaction.user, hudPage);
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

  if (interaction.customId === CUSTOM_IDS.shopBuyOne) {
    let shopProgress = null;
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const shopItem = getShopItems()[0];
      const result = shopItem
        ? buyShopItem(players[panelTargetUserId], shopItem.id, 1, progress)
        : { player: getPlayer(players[panelTargetUserId]), message: "商店目前沒有商品。" };
      const nextProgress = result.globalState
        ? { ...progress, globalState: result.globalState }
        : progress;
      shopProgress = nextProgress;
      componentPlayer = result.player;
      embed = buildShopEmbed(result.player, result.message, nextProgress);
      files = buildHudFiles(result.player);
      players[panelTargetUserId] = result.player;
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
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
    const itemId = interaction.values && interaction.values[0];
    await updatePlayer(panelTargetUserId, (player) => {
      const result = shimmerCollectible(player, itemId, Math.random);
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

  if (interaction.customId === CUSTOM_IDS.shopBuyPotion || interaction.customId === CUSTOM_IDS.shopBuyTotem) {
    const itemId = interaction.customId === CUSTOM_IDS.shopBuyPotion ? "healingPotion" : "undyingTotem";
    let shopProgress = null;
    await updatePlayers((players) => {
      const progress = getProgressWithGlobal(players);
      const result = buyShopItem(players[panelTargetUserId], itemId, 1, progress);
      const nextProgress = result.globalState
        ? { ...progress, globalState: result.globalState }
        : progress;
      shopProgress = nextProgress;
      componentPlayer = result.player;
      embed = buildShopEmbed(result.player, result.message, nextProgress);
      files = buildHudFiles(result.player);
      players[panelTargetUserId] = result.player;
      if (result.globalState) setGlobalStateToPlayers(players, result.globalState);
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

  if (interaction.customId === CUSTOM_IDS.drinkPotion) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = drinkHealingPotion(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "治療藥水", result.message, interaction.user, hudPage);
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
    await updatePlayer(panelTargetUserId, (player) => {
      const result = openUndergroundInn(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "地底客棧", result.message, interaction.user, hudPage);
      files = buildHudFiles(result.player);
      return result.player;
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
  await interaction.editReply({
    embeds: [embed || buildPanelEmbed(null)],
    files,
    attachments: [],
    components: buildPanelComponents(componentTargetId, componentPlayer, progress, hudPage)
  });
}

client.login(token);

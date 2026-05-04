"use strict";

require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require("discord.js");
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
  removeRust,
  rerollRunModeOptions,
  resolveRandomEvent,
  rescuePlayer,
  returnToSurface,
  revive,
  shimmerCollectible,
  transferCollectible,
  withdrawBank
} = require("./game");
const { loadPlayers, updatePlayer, updatePlayers } = require("./storage");
const {
  CUSTOM_IDS,
  buildCollectionResponse,
  buildHudFiles,
  buildLeaderboardEmbed,
  buildMiningEmbed,
  buildPanelComponents,
  buildPanelEmbed,
  buildShopComponents,
  buildShopEmbed,
  isMiningUiButton
} = require("./ui");

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("請先在 .env 設定 DISCORD_TOKEN。");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function makeReply(title, body) {
  return `**${title}**\n${body}`;
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

function getButtonCustomId(component) {
  return component.customId || (component.data && component.data.custom_id) || "";
}

function getPanelTargetUserId(interaction) {
  const rows = interaction.message && interaction.message.components ? interaction.message.components : [];
  for (const row of rows) {
    const components = row.components || [];
    for (const component of components) {
      const customId = getButtonCustomId(component);
      if (customId.startsWith(`${CUSTOM_IDS.rescuePrefix}:`)) {
        const targetUserId = customId.split(":")[2];
        return targetUserId && targetUserId !== "none" ? targetUserId : null;
      }
    }
  }
  return null;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`已登入：${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && isMiningUiButton(interaction.customId)) {
      await handleMiningButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const name = interaction.commandName;

    if (name === "礦場") {
      await interaction.deferReply();
      const player = await updatePlayer(interaction.user.id, (current) => ensureRunModeOptions(current, Math.random));
      const progress = getCommunityProgress(await loadPlayers());
      await interaction.editReply({
        embeds: [buildPanelEmbed(player, "礦場面板", "公開礦場已開啟，大家都能看到挖礦狀況。", interaction.user)],
        files: buildHudFiles(player),
        components: buildPanelComponents(interaction.user.id, player, progress)
      });
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
      const progress = getCommunityProgress(await loadPlayers());
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
      const progress = getCommunityProgress(await loadPlayers());
      await updatePlayer(interaction.user.id, (player) => {
        const result = buyShopItem(player, itemId, amount, progress);
        message = result.message;
        return result.player;
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
      const itemId = interaction.options.getString("紀念幣", false);
      const amount = interaction.options.getInteger("數量") || 1;
      const gold = interaction.options.getInteger("金幣") || 0;

      if (target.id === interaction.user.id) {
        await interaction.reply({ content: "不能交易給自己。", ephemeral: true });
        return;
      }

      if (target.bot) {
        await interaction.reply({ content: "不能交易給機器人。", ephemeral: true });
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
    console.error(error);
    const payload = {
      content: "指令執行時發生錯誤，請稍後再試。",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
});

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

  await interaction.deferUpdate();
  let embed = null;
  let files = [];
  let componentTargetId = panelTargetUserId;
  let componentPlayer = null;

  if (interaction.customId.startsWith(`${CUSTOM_IDS.modePrefix}:`) || interaction.customId === CUSTOM_IDS.modeDouble || interaction.customId === CUSTOM_IDS.modeSafe) {
    const mode = interaction.customId.startsWith(`${CUSTOM_IDS.modePrefix}:`)
      ? interaction.customId.split(":")[2]
      : interaction.customId === CUSTOM_IDS.modeDouble
        ? "double"
        : "safe";
    await updatePlayer(panelTargetUserId, (player) => {
      const result = chooseRunMode(player, mode, Math.random);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "下礦方式", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildShopComponents(progress, componentPlayer)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.rerollModes) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = rerollRunModeOptions(player, Math.random);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "刷新詞條", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildShopComponents(progress, componentPlayer)
    });
    return;
  }

  if ([CUSTOM_IDS.mine, CUSTOM_IDS.mineLeft, CUSTOM_IDS.mineRight].includes(interaction.customId)) {
    const digPath = interaction.customId === CUSTOM_IDS.mineLeft
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
      embed = buildMiningEmbed(outcome, interaction.user);
      files = buildHudFiles(outcome.player, outcome);
      return outcome;
    });
  }

  if (interaction.customId === CUSTOM_IDS.buffGold) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = chooseMinorBuff(player, "gold");
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "小磁條", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.buffBomb) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = chooseMinorBuff(player, "bomb");
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "小磁條", result.message, interaction.user);
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
    const progress = getCommunityProgress(await loadPlayers());
    await interaction.editReply({
      embeds: collectionResponse.embeds,
      files: collectionResponse.files,
      attachments: [],
      components: buildPanelComponents(componentTargetId, componentPlayer, progress)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.leaderboard) {
    const players = await loadPlayers();
    embed = buildLeaderboardEmbed(players);
    files = [];
  }

  if (interaction.customId === CUSTOM_IDS.bankDeposit) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = depositBank(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "銀行", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.bankWithdraw) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = withdrawBank(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "銀行", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.eventRisk || interaction.customId === CUSTOM_IDS.eventSafe) {
    const choice = interaction.customId === CUSTOM_IDS.eventRisk ? "risk" : "safe";
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
      embed = buildPanelEmbed(result.player, result.title, message, interaction.user);
      files = buildHudFiles(result.player);
      return result;
    });
  }

  if (interaction.customId === CUSTOM_IDS.exchangeOne) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = exchange(player, 1);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "兌換", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.shopOpen) {
    const progress = getCommunityProgress(await loadPlayers());
    const player = await updatePlayer(panelTargetUserId, (current) => getPlayer(current));
    componentPlayer = player;
    embed = buildShopEmbed(player, "選擇下方商品購買。", progress);
    files = buildHudFiles(player);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildShopComponents(progress, player)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.shopExit) {
    const progress = getCommunityProgress(await loadPlayers());
    const player = await updatePlayer(panelTargetUserId, (current) => getPlayer(current));
    componentPlayer = player;
    embed = buildPanelEmbed(player, "礦場面板", "已返回礦場面板。", interaction.user);
    files = buildHudFiles(player);
    await interaction.editReply({
      embeds: [embed],
      files,
      attachments: [],
      components: buildPanelComponents(componentTargetId, componentPlayer, progress)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.shopBuyOne) {
    const progress = getCommunityProgress(await loadPlayers());
    await updatePlayer(panelTargetUserId, (player) => {
      const shopItem = getShopItems()[0];
      const result = shopItem
        ? buyShopItem(player, shopItem.id, 1, progress)
        : { player: getPlayer(player), message: "商店目前沒有商品。" };
      componentPlayer = result.player;
      embed = buildShopEmbed(result.player, result.message, progress);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.shopShimmer) {
    const progress = getCommunityProgress(await loadPlayers());
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
      components: buildShopComponents(progress, componentPlayer)
    });
    return;
  }

  if (interaction.customId === CUSTOM_IDS.shopBuyPotion || interaction.customId === CUSTOM_IDS.shopBuyTotem) {
    const itemId = interaction.customId === CUSTOM_IDS.shopBuyPotion ? "healingPotion" : "undyingTotem";
    const progress = getCommunityProgress(await loadPlayers());
    await updatePlayer(panelTargetUserId, (player) => {
      const result = buyShopItem(player, itemId, 1, progress);
      componentPlayer = result.player;
      embed = buildShopEmbed(result.player, result.message, progress);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.drinkPotion) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = drinkHealingPotion(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "治療藥水", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.rustOne) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = removeRust(player, 1);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "除鏽", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.discardRustOne) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = discardItem(player, "rusty", 1);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "丟棄", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.returnSurface) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = returnToSurface(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "返回地面", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.revive) {
    await updatePlayer(panelTargetUserId, (player) => {
      const result = revive(player);
      componentPlayer = result.player;
      embed = buildPanelEmbed(result.player, "復活", result.message, interaction.user);
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
      embed = buildPanelEmbed(player, "救援", "不能救援自己，請讓其他玩家幫你。", interaction.user);
      files = buildHudFiles(player);
    } else {
      const result = await updatePlayers((players) => {
        const rescue = rescuePlayer(players[interaction.user.id], players[targetUserId]);
        players[interaction.user.id] = rescue.rescuer;
        players[targetUserId] = rescue.target;
        return rescue;
      });
      embed = buildPanelEmbed(result.target, "救援", result.message, interaction.user);
      componentPlayer = result.target;
      files = buildHudFiles(result.target);
    }
  }

  const progress = getCommunityProgress(await loadPlayers());
  await interaction.editReply({
    embeds: [embed || buildPanelEmbed(null)],
    files,
    attachments: [],
    components: buildPanelComponents(componentTargetId, componentPlayer, progress)
  });
}

client.login(token);

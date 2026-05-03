"use strict";

require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require("discord.js");
const {
  buyShopItem,
  chooseMinorBuff,
  chooseRunMode,
  discardItem,
  exchange,
  formatShop,
  formatInventory,
  getPlayer,
  getShopItems,
  mine,
  removeRust,
  rescuePlayer,
  returnToSurface,
  revive,
  transferCollectible
} = require("./game");
const { updatePlayer, updatePlayers } = require("./storage");
const {
  CUSTOM_IDS,
  buildCollectionEmbed,
  buildCollectionFiles,
  buildHudFiles,
  buildMiningEmbed,
  buildPanelComponents,
  buildPanelEmbed,
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

client.once(Events.ClientReady, (readyClient) => {
  console.log(`已登入：${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && isMiningUiButton(interaction.customId)) {
      await handleMiningButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const name = interaction.commandName;

    if (name === "礦場") {
      await interaction.deferReply();
      const player = await updatePlayer(interaction.user.id, (current) => getPlayer(current));
      await interaction.editReply({
        embeds: [buildPanelEmbed(player, "礦場面板", "公開礦場已開啟，大家都能看到挖礦狀況。", interaction.user)],
        files: buildHudFiles(player),
        components: buildPanelComponents(interaction.user.id)
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
      await interaction.reply({
        embeds: [buildShopEmbed(result, formatShop())],
        ephemeral: true
      });
      return;
    }

    if (name === "購買") {
      const itemId = interaction.options.getString("商品", true);
      const amount = interaction.options.getInteger("數量") || 1;
      let message = "";
      await updatePlayer(interaction.user.id, (player) => {
        const result = buyShopItem(player, itemId, amount);
        message = result.message;
        return result.player;
      });
      await interaction.reply(makeReply("購買", message));
      return;
    }

    if (name === "包包") {
      await interaction.deferReply({ ephemeral: true });
      const result = await updatePlayer(interaction.user.id, (player) => getPlayer(player));
      await interaction.editReply({
        embeds: [buildCollectionEmbed(result)],
        files: buildCollectionFiles(result)
      });
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
  await interaction.deferUpdate();
  let embed = null;
  let files = [];
  let componentTargetId = interaction.user.id;

  if (interaction.customId === CUSTOM_IDS.modeDouble) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = chooseRunMode(player, "double");
      embed = buildPanelEmbed(result.player, "下礦方式", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.modeSafe) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = chooseRunMode(player, "safe");
      embed = buildPanelEmbed(result.player, "下礦方式", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.mine) {
    await updatePlayer(interaction.user.id, (player) => {
      const outcome = mine(player);
      embed = buildMiningEmbed(outcome, interaction.user);
      files = buildHudFiles(outcome.player, outcome);
      return outcome.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.buffGold) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = chooseMinorBuff(player, "gold");
      embed = buildPanelEmbed(result.player, "小磁條", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.buffBomb) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = chooseMinorBuff(player, "bomb");
      embed = buildPanelEmbed(result.player, "小磁條", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.bag) {
    await updatePlayer(interaction.user.id, (player) => {
      const next = getPlayer(player);
      embed = buildCollectionEmbed(next);
      files = buildCollectionFiles(next);
      return next;
    });
  }

  if (interaction.customId === CUSTOM_IDS.exchangeOne) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = exchange(player, 1);
      embed = buildPanelEmbed(result.player, "兌換", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.shopBuyOne) {
    await updatePlayer(interaction.user.id, (player) => {
      const shopItem = getShopItems()[0];
      const result = shopItem
        ? buyShopItem(player, shopItem.id, 1)
        : { player: getPlayer(player), message: "商店目前沒有商品。" };
      embed = buildShopEmbed(result.player, result.message);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.rustOne) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = removeRust(player, 1);
      embed = buildPanelEmbed(result.player, "除鏽", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.discardRustOne) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = discardItem(player, "rusty", 1);
      embed = buildPanelEmbed(result.player, "丟棄", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.returnSurface) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = returnToSurface(player);
      embed = buildPanelEmbed(result.player, "返回地面", result.message, interaction.user);
      files = buildHudFiles(result.player);
      return result.player;
    });
  }

  if (interaction.customId === CUSTOM_IDS.revive) {
    await updatePlayer(interaction.user.id, (player) => {
      const result = revive(player);
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
      files = buildHudFiles(result.target);
    }
  }

  await interaction.editReply({
    embeds: [embed || buildPanelEmbed(null)],
    files,
    attachments: [],
    components: buildPanelComponents(componentTargetId)
  });
}

client.login(token);

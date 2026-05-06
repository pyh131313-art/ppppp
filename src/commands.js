"use strict";

const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("礦場")
    .setDescription("打開挖礦遊戲面板。"),
  new SlashCommandBuilder()
    .setName("礦場ui")
    .setDescription("切換礦場顯示模式。")
    .addStringOption((option) => option
      .setName("模式")
      .setDescription("選擇完整或精簡顯示。")
      .setRequired(true)
      .addChoices(
        { name: "完整", value: "full" },
        { name: "精簡", value: "compact" }
      )),
  new SlashCommandBuilder()
    .setName("賽雞場")
    .setDescription("開啟賽雞場，購票下注看雞衝線。"),
  new SlashCommandBuilder()
    .setName("交易")
    .setDescription("向玩家提出交易請求。")
    .addUserOption((option) => option
      .setName("對象")
      .setDescription("要交易的玩家。")
      .setRequired(true))
    .addStringOption((option) => option
      .setName("物品")
      .setDescription("目前只支援治療藥水。")
      .setRequired(true)
      .addChoices({ name: "治療藥水", value: "healingPotion" }))
    .addIntegerOption((option) => option
      .setName("數量")
      .setDescription("交易數量。")
      .setRequired(true)
      .setMinValue(1))
];

module.exports = {
  commands,
  commandJson: commands.map((command) => command.toJSON())
};

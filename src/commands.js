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
    .setDescription("開啟賽雞場，購票下注看雞衝線。")
];

module.exports = {
  commands,
  commandJson: commands.map((command) => command.toJSON())
};

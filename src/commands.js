"use strict";

const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("礦場")
    .setDescription("打開挖礦遊戲面板。")
];

module.exports = {
  commands,
  commandJson: commands.map((command) => command.toJSON())
};

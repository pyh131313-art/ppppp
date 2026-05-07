"use strict";

const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("礦場")
    .setDescription("打開挖礦遊戲面板。"),
  new SlashCommandBuilder()
    .setName("挖礦挑戰")
    .setDescription("開啟獨立高難度 roguelike 挖礦挑戰。"),
  new SlashCommandBuilder()
    .setName("挑戰模式")
    .setDescription("開啟獨立高難度 roguelike 挖礦挑戰。"),
  new SlashCommandBuilder()
    .setName("清錢")
    .setDescription("管理用：清空指定玩家的金幣與銀行。")
    .addUserOption((option) => option
      .setName("玩家")
      .setDescription("要清空金錢的玩家。")
      .setRequired(true)),
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
    .setName("我的雞")
    .setDescription("查看自己的養成雞。"),
  new SlashCommandBuilder()
    .setName("命名雞")
    .setDescription("替自己的雞命名。")
    .addStringOption((option) => option
      .setName("名字")
      .setDescription("2~12 字，不可空白或特殊符號。")
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("賽雞pk")
    .setDescription("向另一位玩家發起 1v1 養成雞 PK。")
    .addUserOption((option) => option
      .setName("對象")
      .setDescription("要挑戰的玩家。")
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("賽雞館")
    .setDescription("挑戰賽雞館館主，贏取稱號與稀有獎勵。"),
  new SlashCommandBuilder()
    .setName("烤掉雞")
    .setDescription("烤掉自己的養成雞，下一場下礦最大生命 +1。"),
  new SlashCommandBuilder()
    .setName("交易")
    .setDescription("向玩家提出交易請求。")
    .addUserOption((option) => option
      .setName("對象")
      .setDescription("要交易的玩家。")
      .setRequired(true))
    .addStringOption((option) => option
      .setName("物品")
      .setDescription("支援治療藥水，留空可只交易金幣。")
      .setRequired(false)
      .addChoices({ name: "治療藥水", value: "healingPotion" }))
    .addIntegerOption((option) => option
      .setName("金幣")
      .setDescription("要交易的金幣數量。")
      .setRequired(false)
      .setMinValue(1))
    .addIntegerOption((option) => option
      .setName("數量")
      .setDescription("物品交易數量。")
      .setRequired(false)
      .setMinValue(1))
];

module.exports = {
  commands,
  commandJson: commands.map((command) => command.toJSON())
};

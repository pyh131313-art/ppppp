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
    .setName("給錢")
    .setDescription("管理用：給指定玩家金幣。")
    .addUserOption((option) => option
      .setName("玩家")
      .setDescription("要給錢的玩家。")
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("金額")
      .setDescription("要給的金幣數量。")
      .setRequired(true)
      .setMinValue(1)),
  new SlashCommandBuilder()
    .setName("給藥水")
    .setDescription("管理用：給指定玩家治療藥水。")
    .addUserOption((option) => option
      .setName("玩家")
      .setDescription("要給藥水的玩家。")
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("數量")
      .setDescription("要給的治療藥水數量。")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(1000)),
  new SlashCommandBuilder()
    .setName("給隨機紀念幣")
    .setDescription("管理用：給指定玩家隨機紀念幣。")
    .addUserOption((option) => option
      .setName("玩家")
      .setDescription("要給紀念幣的玩家。")
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("數量")
      .setDescription("要給的隨機紀念幣數量。")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(100)),
  new SlashCommandBuilder()
    .setName("修復玩家")
    .setDescription("管理用：修復指定玩家卡住的挖礦狀態。")
    .addUserOption((option) => option
      .setName("玩家")
      .setDescription("要修復的玩家。")
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("重置玩家")
    .setDescription("管理用：重置指定玩家的全部遊戲資料。")
    .addUserOption((option) => option
      .setName("玩家")
      .setDescription("要重置的玩家。")
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
      .setRequired(true))
    .addBooleanOption((option) => option
      .setName("生死鬥")
      .setDescription("需要對方同意，輸家的雞會被烤掉。")
      .setRequired(false)),
  new SlashCommandBuilder()
    .setName("賽雞館")
    .setDescription("挑戰賽雞館館主，贏取稱號與稀有獎勵。")
    .addIntegerOption((option) => option
      .setName("rank")
      .setDescription("可重打已通關 Rank；重打不掉金幣。")
      .setMinValue(1)
      .setRequired(false)),
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
      .setDescription("支援治療藥水、神奇糖果，留空可只交易金幣。")
      .setRequired(false)
      .addChoices(
        { name: "治療藥水", value: "healingPotion" },
        { name: "神奇糖果", value: "magicCandy" }
      ))
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

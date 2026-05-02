"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { CONFIG } = require("./config");

const discardChoices = [
  { name: "生鏽紀念幣", value: "rusty" },
  ...CONFIG.collectibles.map((item) => ({
    name: item.name,
    value: item.id
  }))
];

const collectibleChoices = CONFIG.collectibles.map((item) => ({
  name: item.name,
  value: item.id
}));

const shopChoices = CONFIG.shop.items.map((item) => {
  const collectible = CONFIG.collectibles.find((candidate) => candidate.id === item.id);
  return {
    name: collectible ? collectible.name : item.id,
    value: item.id
  };
});

const commands = [
  new SlashCommandBuilder()
    .setName("礦場")
    .setDescription("打開按鈕式礦場面板。"),
  new SlashCommandBuilder()
    .setName("挖礦")
    .setDescription("挖一次礦，可能獲得金幣、生鏽錢幣，或挖到炸彈。"),
  new SlashCommandBuilder()
    .setName("包包")
    .setDescription("查看 12 格紀念幣包包。"),
  new SlashCommandBuilder()
    .setName("狀態")
    .setDescription("查看你的生死狀態與炸彈次數。"),
  new SlashCommandBuilder()
    .setName("商店")
    .setDescription("查看商店限定紀念幣。"),
  new SlashCommandBuilder()
    .setName("購買")
    .setDescription("用金幣購買商店限定紀念幣。")
    .addStringOption((option) =>
      option
        .setName("商品")
        .setDescription("要購買的商店商品。")
        .setRequired(true)
        .addChoices(...shopChoices)
    )
    .addIntegerOption((option) =>
      option
        .setName("數量")
        .setDescription("要購買幾枚。")
        .setMinValue(1)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("兌換")
    .setDescription("用金幣兌換紀念幣。")
    .addIntegerOption((option) =>
      option
        .setName("數量")
        .setDescription("要兌換幾枚紀念幣。")
        .setMinValue(1)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("除鏽")
    .setDescription("把生鏽紀念幣除鏽，成功後變成正式紀念幣。")
    .addIntegerOption((option) =>
      option
        .setName("數量")
        .setDescription("要除鏽幾枚生鏽紀念幣。")
        .setMinValue(1)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("丟棄")
    .setDescription("丟棄包包裡的物品。")
    .addStringOption((option) =>
      option
        .setName("物品")
        .setDescription("要丟棄的物品。")
        .setRequired(true)
        .addChoices(...discardChoices)
    )
    .addIntegerOption((option) =>
      option
        .setName("數量")
        .setDescription("要丟棄幾個。")
        .setMinValue(1)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("交易")
    .setDescription("把正式紀念幣轉讓給其他用戶。")
    .addUserOption((option) =>
      option
        .setName("對象")
        .setDescription("要交易給誰。")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("紀念幣")
        .setDescription("要送出的正式紀念幣。")
        .setRequired(true)
        .addChoices(...collectibleChoices)
    )
    .addIntegerOption((option) =>
      option
        .setName("數量")
        .setDescription("要送出幾枚。")
        .setMinValue(1)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("復活")
    .setDescription("死亡後復活。可等待 10 分鐘免費復活，或花 20 金幣立刻復活。")
];

module.exports = {
  commands,
  commandJson: commands.map((command) => command.toJSON())
};

"use strict";

const { REST, Routes } = require("discord.js");
const { commandJson } = require("./commands");
const { cleanEnvValue } = require("./env");

async function registerApplicationCommands() {
  const token = cleanEnvValue(process.env.DISCORD_TOKEN);
  const clientId = cleanEnvValue(process.env.DISCORD_CLIENT_ID);
  const guildId = cleanEnvValue(process.env.DISCORD_GUILD_ID);

  if (!token || !clientId) {
    console.log("略過 slash commands 註冊：缺少 DISCORD_TOKEN 或 DISCORD_CLIENT_ID。");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commandJson });

  const scope = guildId ? `伺服器 ${guildId}` : "全域";
  console.log(`已註冊 ${commandJson.length} 個 slash commands 到${scope}。`);
}

module.exports = {
  registerApplicationCommands
};

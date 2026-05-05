"use strict";

const { REST, Routes } = require("discord.js");
const { commandJson } = require("./commands");
const { cleanEnvValue } = require("./env");

function getGuildIds() {
  const raw = cleanEnvValue(process.env.DISCORD_GUILD_IDS || process.env.DISCORD_GUILD_ID);
  return raw
    ? raw.split(",").map((id) => cleanEnvValue(id)).filter(Boolean)
    : [];
}

async function registerApplicationCommands() {
  const token = cleanEnvValue(process.env.DISCORD_TOKEN);
  const clientId = cleanEnvValue(process.env.DISCORD_CLIENT_ID);
  const guildIds = getGuildIds();

  if (!token || !clientId) {
    console.log("略過 slash commands 註冊：缺少 DISCORD_TOKEN 或 DISCORD_CLIENT_ID。");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  if (guildIds.length === 0) {
    await rest.put(Routes.applicationCommands(clientId), { body: commandJson });
    console.log(`已註冊 ${commandJson.length} 個 slash commands 到全域。`);
    return;
  }

  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandJson });
    console.log(`已註冊 ${commandJson.length} 個 slash commands 到伺服器 ${guildId}。`);
  }
}

module.exports = {
  getGuildIds,
  registerApplicationCommands
};

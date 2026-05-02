"use strict";

require("dotenv").config();

const { REST, Routes } = require("discord.js");
const { commandJson } = require("./commands");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  throw new Error("請先在 .env 設定 DISCORD_TOKEN 和 DISCORD_CLIENT_ID。");
}

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commandJson });

  const scope = guildId ? `伺服器 ${guildId}` : "全域";
  console.log(`已註冊 ${commandJson.length} 個 slash commands 到${scope}。`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

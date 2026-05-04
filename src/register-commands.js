"use strict";

require("dotenv").config();

const { cleanEnvValue } = require("./env");
const { registerApplicationCommands } = require("./register-app-commands");

async function main() {
  if (!cleanEnvValue(process.env.DISCORD_TOKEN) || !cleanEnvValue(process.env.DISCORD_CLIENT_ID)) {
    throw new Error("請先在 .env 設定 DISCORD_TOKEN 和 DISCORD_CLIENT_ID。");
  }
  await registerApplicationCommands();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

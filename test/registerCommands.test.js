"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getGuildIds } = require("../src/register-app-commands");

test("slash commands 可以解析多個伺服器 ID", () => {
  const oldGuildId = process.env.DISCORD_GUILD_ID;
  const oldGuildIds = process.env.DISCORD_GUILD_IDS;
  process.env.DISCORD_GUILD_ID = "";
  process.env.DISCORD_GUILD_IDS = " 111 , 222; ";

  assert.deepEqual(getGuildIds(), ["111", "222"]);

  process.env.DISCORD_GUILD_ID = oldGuildId;
  process.env.DISCORD_GUILD_IDS = oldGuildIds;
});

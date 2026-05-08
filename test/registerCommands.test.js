"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getGuildIds } = require("../src/register-app-commands");
const { commandJson } = require("../src/commands");

test("slash commands 可以解析多個伺服器 ID", () => {
  const oldGuildId = process.env.DISCORD_GUILD_ID;
  const oldGuildIds = process.env.DISCORD_GUILD_IDS;
  process.env.DISCORD_GUILD_ID = "";
  process.env.DISCORD_GUILD_IDS = " 111 , 222; ";

  assert.deepEqual(getGuildIds(), ["111", "222"]);

  process.env.DISCORD_GUILD_ID = oldGuildId;
  process.env.DISCORD_GUILD_IDS = oldGuildIds;
});

test("管理員可以註冊開啟指定玩家礦場面板指令", () => {
  const command = commandJson.find((item) => item.name === "開礦場面板");

  assert.ok(command);
  assert.equal(command.options[0].name, "玩家");
  assert.equal(command.options[0].required, true);
});

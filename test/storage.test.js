"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const tempDir = path.join(os.tmpdir(), `mining-storage-test-${process.pid}`);
process.env.DATA_FILE = path.join(tempDir, "players.json");

const {
  BACKUP_FILE,
  DATA_FILE,
  loadPlayers,
  savePlayers
} = require("../src/storage");

test("存檔時會同步建立玩家資料備份", async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  await savePlayers({ user1: { gold: 123 } });

  const backup = JSON.parse(await fs.readFile(BACKUP_FILE, "utf8"));
  assert.equal(DATA_FILE, path.join(tempDir, "players.json"));
  assert.equal(backup.user1.gold, 123);
});

test("正式存檔損壞時會從備份還原", async () => {
  await savePlayers({ user2: { gold: 456 } });
  await fs.writeFile(DATA_FILE, "{\"broken\": true} trailing", "utf8");

  const originalError = console.error;
  console.error = () => {};
  let players = null;
  try {
    players = await loadPlayers();
  } finally {
    console.error = originalError;
  }
  const restored = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));

  assert.equal(players.user2.gold, 456);
  assert.equal(restored.user2.gold, 456);
});

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data", "players.json");
const BACKUP_FILE = `${DATA_FILE}.backup`;
let storageQueue = Promise.resolve();

async function readJsonFile(file) {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw || "{}");
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "{}\n", "utf8");
  }
}

async function loadPlayers() {
  await ensureDataFile();
  try {
    return await readJsonFile(DATA_FILE);
  } catch (error) {
    const corruptFile = `${DATA_FILE}.corrupt-${Date.now()}`;
    await fs.rename(DATA_FILE, corruptFile);

    try {
      const backupPlayers = await readJsonFile(BACKUP_FILE);
      await savePlayers(backupPlayers);
      console.error(`玩家存檔 JSON 損壞，已備份到 ${corruptFile}，並從 ${BACKUP_FILE} 還原。`);
      console.error(error);
      return backupPlayers;
    } catch (backupError) {
      await fs.writeFile(DATA_FILE, "{}\n", "utf8");
      console.error(`玩家存檔 JSON 損壞，已備份到 ${corruptFile}，備份也無法還原，已建立新存檔。`);
      console.error(error);
      console.error(backupError);
      return {};
    }
  }
}

async function savePlayers(players) {
  await ensureDataFile();
  const tempFile = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}`;
  const backupTempFile = `${BACKUP_FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempFile, `${JSON.stringify(players, null, 2)}\n`, "utf8");
  await fs.rename(tempFile, DATA_FILE);
  await fs.writeFile(backupTempFile, `${JSON.stringify(players, null, 2)}\n`, "utf8");
  await fs.rename(backupTempFile, BACKUP_FILE);
}

function runQueued(task) {
  const run = storageQueue.then(task, task);
  storageQueue = run.catch(() => {});
  return run;
}

async function updatePlayer(userId, updater) {
  return runQueued(async () => {
    const players = await loadPlayers();
    const current = players[userId] || null;
    const next = updater(current);
    players[userId] = next;
    await savePlayers(players);
    return next;
  });
}

async function updatePlayers(updater) {
  return runQueued(async () => {
    const players = await loadPlayers();
    const result = updater(players);
    await savePlayers(players);
    return result;
  });
}

module.exports = {
  BACKUP_FILE,
  DATA_FILE,
  loadPlayers,
  savePlayers,
  updatePlayer,
  updatePlayers
};

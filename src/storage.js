"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data", "players.json");
let storageQueue = Promise.resolve();

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
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch (error) {
    const backupFile = `${DATA_FILE}.corrupt-${Date.now()}`;
    await fs.rename(DATA_FILE, backupFile);
    await fs.writeFile(DATA_FILE, "{}\n", "utf8");
    console.error(`玩家存檔 JSON 損壞，已備份到 ${backupFile} 並建立新存檔。`);
    console.error(error);
    return {};
  }
}

async function savePlayers(players) {
  await ensureDataFile();
  const tempFile = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempFile, `${JSON.stringify(players, null, 2)}\n`, "utf8");
  await fs.rename(tempFile, DATA_FILE);
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
  DATA_FILE,
  loadPlayers,
  savePlayers,
  updatePlayer,
  updatePlayers
};

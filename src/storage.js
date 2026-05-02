"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data", "players.json");

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
  return JSON.parse(raw || "{}");
}

async function savePlayers(players) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(players, null, 2)}\n`, "utf8");
}

async function updatePlayer(userId, updater) {
  const players = await loadPlayers();
  const current = players[userId] || null;
  const next = updater(current);
  players[userId] = next;
  await savePlayers(players);
  return next;
}

async function updatePlayers(updater) {
  const players = await loadPlayers();
  const result = updater(players);
  await savePlayers(players);
  return result;
}

module.exports = {
  DATA_FILE,
  loadPlayers,
  savePlayers,
  updatePlayer,
  updatePlayers
};

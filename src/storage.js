"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data", "players.json");
const BACKUP_FILE = `${DATA_FILE}.backup`;
const DATABASE_FILE = process.env.DATABASE_FILE || path.join(path.dirname(DATA_FILE), "players.sqlite");
const STORAGE_BACKEND = process.env.STORAGE_BACKEND || "sqlite";

let storageQueue = Promise.resolve();
let database = null;
let sqliteLoadError = null;

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

async function loadJsonPlayers() {
  await ensureDataFile();
  try {
    return await readJsonFile(DATA_FILE);
  } catch (error) {
    const corruptFile = `${DATA_FILE}.corrupt-${Date.now()}`;
    await fs.rename(DATA_FILE, corruptFile);

    try {
      const backupPlayers = await readJsonFile(BACKUP_FILE);
      await saveJsonPlayers(backupPlayers);
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

async function saveJsonPlayers(players) {
  await ensureDataFile();
  const tempFile = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}`;
  const backupTempFile = `${BACKUP_FILE}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(players, null, 2)}\n`;
  await fs.writeFile(tempFile, body, "utf8");
  await fs.rename(tempFile, DATA_FILE);
  await fs.writeFile(backupTempFile, body, "utf8");
  await fs.rename(backupTempFile, BACKUP_FILE);
}

function getSqliteDatabase() {
  if (STORAGE_BACKEND === "json") return null;
  if (database) return database;
  if (sqliteLoadError) return null;

  try {
    const Database = require("better-sqlite3");
    fsSync.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });
    database = new Database(DATABASE_FILE);
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    database.exec(`
      CREATE TABLE IF NOT EXISTS players (
        user_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    migrateJsonToSqlite(database);
    return database;
  } catch (error) {
    sqliteLoadError = error;
    console.error("SQLite 載入失敗，暫時改用 JSON 儲存。");
    console.error(error);
    return null;
  }
}

function migrateJsonToSqlite(db) {
  const migrated = db.prepare("SELECT value FROM meta WHERE key = ?").get("json_migrated");
  if (migrated) return;

  let players = {};
  try {
    if (fsSync.existsSync(DATA_FILE)) {
      players = JSON.parse(fsSync.readFileSync(DATA_FILE, "utf8") || "{}");
    } else if (fsSync.existsSync(BACKUP_FILE)) {
      players = JSON.parse(fsSync.readFileSync(BACKUP_FILE, "utf8") || "{}");
    }
  } catch (error) {
    console.error("舊 JSON 玩家資料無法匯入 SQLite，會保留原檔並從空資料庫開始。");
    console.error(error);
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO players (user_id, data, updated_at)
    VALUES (?, ?, ?)
  `);
  const now = Date.now();
  const entries = Object.entries(players || {});
  const migrate = db.transaction(() => {
    for (const [userId, player] of entries) {
      insert.run(userId, JSON.stringify(player), now);
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("json_migrated", String(now));
  });
  migrate();
  if (entries.length > 0) console.log(`已從 JSON 匯入 ${entries.length} 筆玩家資料到 SQLite。`);
}

function loadSqlitePlayers(db) {
  const rows = db.prepare("SELECT user_id, data FROM players").all();
  const players = {};
  for (const row of rows) {
    try {
      players[row.user_id] = JSON.parse(row.data);
    } catch (error) {
      console.error(`玩家 ${row.user_id} 的 SQLite 資料損壞，已略過。`);
      console.error(error);
    }
  }
  return players;
}

function saveSqlitePlayers(db, players) {
  const existingRows = db.prepare("SELECT user_id FROM players").all();
  const existing = new Set(existingRows.map((row) => row.user_id));
  const nextIds = new Set(Object.keys(players || {}));
  const upsert = db.prepare(`
    INSERT INTO players (user_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `);
  const remove = db.prepare("DELETE FROM players WHERE user_id = ?");
  const now = Date.now();
  const write = db.transaction(() => {
    for (const [userId, player] of Object.entries(players || {})) {
      upsert.run(userId, JSON.stringify(player), now);
    }
    for (const userId of existing) {
      if (!nextIds.has(userId)) remove.run(userId);
    }
  });
  write();
}

async function loadPlayers() {
  const db = getSqliteDatabase();
  if (db) return loadSqlitePlayers(db);
  return loadJsonPlayers();
}

async function savePlayers(players) {
  const db = getSqliteDatabase();
  if (db) {
    saveSqlitePlayers(db, players);
    return;
  }
  await saveJsonPlayers(players);
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
  DATABASE_FILE,
  loadPlayers,
  savePlayers,
  updatePlayer,
  updatePlayers
};

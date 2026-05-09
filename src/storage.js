"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data", "players.json");
const BACKUP_FILE = `${DATA_FILE}.backup`;
const DATABASE_FILE = process.env.DATABASE_FILE || path.join(path.dirname(DATA_FILE), "players.sqlite");
const FALLBACK_DATA_FILE = path.join(__dirname, "..", "data", "players.json");
const FALLBACK_BACKUP_FILE = `${FALLBACK_DATA_FILE}.backup`;
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const STORAGE_BACKEND = process.env.STORAGE_BACKEND || (DATABASE_URL ? "postgres" : "sqlite");

let storageQueue = Promise.resolve();
let database = null;
let sqliteLoadError = null;
let postgresPool = null;
let postgresReady = false;
let postgresLoadError = null;
let postgresMigrationChecked = false;

const POSTGRES_LEGACY_MERGE_META_KEY = "legacy_data_merged_v3";

async function readJsonFile(file) {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw || "{}");
}

function getFallbackPath(file) {
  if (file === DATA_FILE) return FALLBACK_DATA_FILE;
  if (file === BACKUP_FILE) return FALLBACK_BACKUP_FILE;
  return file;
}

async function ensureDataFile(file = DATA_FILE) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "{}\n", "utf8");
  }
}

async function loadJsonPlayers() {
  let dataFile = DATA_FILE;
  let backupFile = BACKUP_FILE;
  try {
    await ensureDataFile(dataFile);
  } catch (error) {
    dataFile = getFallbackPath(DATA_FILE);
    backupFile = getFallbackPath(BACKUP_FILE);
    console.error(`玩家資料路徑 ${DATA_FILE} 無法使用，暫時改用 ${dataFile}。請確認 Render Disk 是否掛載到 /var/data。`);
    console.error(error);
    await ensureDataFile(dataFile);
  }
  try {
    return await readJsonFile(dataFile);
  } catch (error) {
    const corruptFile = `${dataFile}.corrupt-${Date.now()}`;
    await fs.rename(dataFile, corruptFile);

    try {
      const backupPlayers = await readJsonFile(backupFile);
      await saveJsonPlayers(backupPlayers);
      console.error(`玩家存檔 JSON 損壞，已備份到 ${corruptFile}，並從 ${backupFile} 還原。`);
      console.error(error);
      return backupPlayers;
    } catch (backupError) {
      await fs.writeFile(dataFile, "{}\n", "utf8");
      console.error(`玩家存檔 JSON 損壞，已備份到 ${corruptFile}，備份也無法還原，已建立新存檔。`);
      console.error(error);
      console.error(backupError);
      return {};
    }
  }
}

async function saveJsonPlayers(players) {
  let dataFile = DATA_FILE;
  let backupFile = BACKUP_FILE;
  try {
    await ensureDataFile(dataFile);
  } catch (error) {
    dataFile = getFallbackPath(DATA_FILE);
    backupFile = getFallbackPath(BACKUP_FILE);
    console.error(`玩家資料路徑 ${DATA_FILE} 無法寫入，暫時改用 ${dataFile}。請確認 Render Disk 是否掛載到 /var/data。`);
    console.error(error);
    await ensureDataFile(dataFile);
  }
  const tempFile = `${dataFile}.tmp-${process.pid}-${Date.now()}`;
  const backupTempFile = `${backupFile}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(players, null, 2)}\n`;
  await fs.writeFile(tempFile, body, "utf8");
  await fs.rename(tempFile, dataFile);
  await fs.writeFile(backupTempFile, body, "utf8");
  await fs.rename(backupTempFile, backupFile);
}

function getSqliteDatabase() {
  if (STORAGE_BACKEND !== "sqlite") return null;
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

function getPostgresSslConfig() {
  const value = String(process.env.POSTGRES_SSL || process.env.PGSSLMODE || "").toLowerCase();
  if (value === "false" || value === "disable") return false;
  if (value === "true" || value === "require" || DATABASE_URL.includes("sslmode=require")) {
    return { rejectUnauthorized: false };
  }
  return false;
}

async function getPostgresPool() {
  if (STORAGE_BACKEND !== "postgres") return null;
  if (!DATABASE_URL) {
    if (!postgresLoadError) {
      postgresLoadError = new Error("STORAGE_BACKEND=postgres 但缺少 DATABASE_URL。");
      console.error(postgresLoadError.message);
    }
    return null;
  }
  if (postgresPool) return postgresPool;
  if (postgresLoadError) return null;

  try {
    const { Pool } = require("pg");
    postgresPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: getPostgresSslConfig(),
      max: Number(process.env.POSTGRES_POOL_SIZE || 5),
      connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 10_000),
      idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30_000)
    });
    await ensurePostgresSchema(postgresPool);
    await maybeMigrateSqliteToPostgres(postgresPool);
    return postgresPool;
  } catch (error) {
    postgresLoadError = error;
    postgresPool = null;
    console.error("PostgreSQL 載入失敗。");
    console.error(error);
    return null;
  }
}

async function ensurePostgresSchema(pool) {
  if (postgresReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      user_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  postgresReady = true;
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function isDisabled(value) {
  return ["0", "false", "no", "off"].includes(String(value || "").toLowerCase());
}

function getMigrationScore(player) {
  if (!player || typeof player !== "object") return -1;
  let score = 0;
  const numberKeys = [
    "gold",
    "bankGold",
    "depth",
    "runDepthProgress",
    "rusty",
    "ore",
    "goldOre",
    "platinumOre",
    "oreIngot",
    "goldOreIngot",
    "platinumOreIngot",
    "redGem",
    "blueGem",
    "greenGem",
    "invertedOre",
    "invertedGem",
    "orichalcum",
    "healingPotion",
    "magicCandy",
    "undyingTotem"
  ];
  for (const key of numberKeys) {
    score += Math.max(0, Number(player[key] || 0));
  }
  if (player.stats && typeof player.stats === "object") {
    score += Math.max(0, Number(player.stats.bestDepth || 0)) * 25;
    score += Math.max(0, Number(player.stats.totalMines || 0));
    score += Math.max(0, Number(player.stats.deaths || 0)) * 5;
  }
  if (player.collection && typeof player.collection === "object") {
    score += Object.values(player.collection)
      .reduce((sum, count) => sum + Math.max(0, Number(count || 0)), 0) * 40;
  }
  if (player.ownedChicken && typeof player.ownedChicken === "object") {
    score += 100;
    score += Math.max(0, Number(player.ownedChicken.level || 0)) * 20;
    score += Math.max(0, Number(player.ownedChicken.wins || 0)) * 10;
    score += Math.max(0, Number(player.ownedChicken.races || 0)) * 3;
  }
  return score;
}

function shouldImportLegacyPlayer(existingPlayer, legacyPlayer) {
  if (!existingPlayer) return true;
  return getMigrationScore(legacyPlayer) > getMigrationScore(existingPlayer);
}

function readLegacySqliteRows() {
  if (!fsSync.existsSync(DATABASE_FILE)) return null;
  let sourceDb = null;
  try {
    const Database = require("better-sqlite3");
    sourceDb = new Database(DATABASE_FILE, { readonly: true, fileMustExist: true });
    return {
      source: DATABASE_FILE,
      type: "SQLite",
      rows: sourceDb.prepare("SELECT user_id, data FROM players").all()
    };
  } catch (error) {
    console.error("SQLite 玩家資料無法讀取，會嘗試其他舊資料來源。");
    console.error(error);
    return null;
  } finally {
    if (sourceDb) sourceDb.close();
  }
}

function readLegacyJsonRows() {
  const source = fsSync.existsSync(DATA_FILE)
    ? DATA_FILE
    : fsSync.existsSync(BACKUP_FILE)
      ? BACKUP_FILE
      : null;
  if (!source) return null;
  try {
    const players = JSON.parse(fsSync.readFileSync(source, "utf8") || "{}");
    return {
      source,
      type: "JSON",
      rows: Object.entries(players || {}).map(([user_id, data]) => ({
        user_id,
        data: JSON.stringify(data)
      }))
    };
  } catch (error) {
    console.error("JSON 玩家資料無法讀取，已略過。");
    console.error(error);
    return null;
  }
}

async function maybeMigrateSqliteToPostgres(pool) {
  if (postgresMigrationChecked) return;
  postgresMigrationChecked = true;
  if (isDisabled(process.env.POSTGRES_MIGRATE_FROM_SQLITE)) return;

  const migrated = await pool.query("SELECT value FROM meta WHERE key = $1", [POSTGRES_LEGACY_MERGE_META_KEY]);
  if (migrated.rowCount > 0) return;

  const legacy = readLegacySqliteRows() || readLegacyJsonRows();
  if (!legacy) {
    console.log(`找不到舊玩家資料檔 ${DATABASE_FILE} 或 ${DATA_FILE}，略過 PostgreSQL 自動搬家。`);
    return;
  }

  const rows = legacy.rows;

  if (rows.length === 0) {
    console.log(`${legacy.type} 沒有玩家資料，略過 PostgreSQL 自動搬家。`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = Date.now();
    let imported = 0;
    let replaced = 0;
    let kept = 0;
    for (const row of rows) {
      try {
        const player = JSON.parse(row.data);
        const existing = await client.query("SELECT data FROM players WHERE user_id = $1", [row.user_id]);
        const existingPlayer = existing.rows[0]?.data || null;
        if (!shouldImportLegacyPlayer(existingPlayer, player)) {
          kept += 1;
          continue;
        }
        await client.query(`
          INSERT INTO players (user_id, data, updated_at)
          VALUES ($1, $2::jsonb, $3)
          ON CONFLICT (user_id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `, [row.user_id, JSON.stringify(player), now]);
        if (existingPlayer) replaced += 1;
        imported += 1;
      } catch (error) {
        console.error(`玩家 ${row.user_id} 的舊資料損壞，搬家時已略過。`);
        console.error(error);
      }
    }
    await client.query(`
      INSERT INTO meta (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [POSTGRES_LEGACY_MERGE_META_KEY, JSON.stringify({ at: now, source: legacy.source, type: legacy.type, imported, replaced, kept })]);
    await client.query("COMMIT");
    console.log(`已從 ${legacy.type} 合併 ${imported} 筆玩家資料到 PostgreSQL（覆蓋 ${replaced}，保留 ${kept}）。`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function loadPostgresPlayers(pool) {
  const result = await pool.query("SELECT user_id, data FROM players");
  const players = {};
  for (const row of result.rows) {
    players[row.user_id] = row.data;
  }
  return players;
}

async function savePostgresPlayers(pool, players) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingRows = await client.query("SELECT user_id FROM players");
    const existing = new Set(existingRows.rows.map((row) => row.user_id));
    const nextIds = new Set(Object.keys(players || {}));
    const now = Date.now();
    for (const [userId, player] of Object.entries(players || {})) {
      await client.query(`
        INSERT INTO players (user_id, data, updated_at)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `, [userId, JSON.stringify(player), now]);
    }
    for (const userId of existing) {
      if (!nextIds.has(userId)) {
        await client.query("DELETE FROM players WHERE user_id = $1", [userId]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
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
  const pool = await getPostgresPool();
  if (pool) return loadPostgresPlayers(pool);
  if (STORAGE_BACKEND === "postgres") {
    throw postgresLoadError || new Error("PostgreSQL 尚未連線，已停止讀取玩家資料以避免資料分裂。");
  }
  const db = getSqliteDatabase();
  if (db) return loadSqlitePlayers(db);
  return loadJsonPlayers();
}

async function savePlayers(players) {
  const pool = await getPostgresPool();
  if (pool) {
    await savePostgresPlayers(pool, players);
    return;
  }
  if (STORAGE_BACKEND === "postgres") {
    throw postgresLoadError || new Error("PostgreSQL 尚未連線，已停止寫入玩家資料以避免資料分裂。");
  }
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

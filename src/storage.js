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

async function maybeMigrateSqliteToPostgres(pool) {
  if (postgresMigrationChecked) return;
  postgresMigrationChecked = true;
  if (!isEnabled(process.env.POSTGRES_MIGRATE_FROM_SQLITE)) return;

  const migrated = await pool.query("SELECT value FROM meta WHERE key = $1", ["sqlite_migrated"]);
  if (migrated.rowCount > 0) return;

  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM players");
  const existingCount = Number(existing.rows[0]?.count || 0);
  if (existingCount > 0) {
    console.log(`PostgreSQL 已有 ${existingCount} 筆玩家資料，略過 SQLite 自動搬家。`);
    return;
  }

  if (!fsSync.existsSync(DATABASE_FILE)) {
    console.log(`找不到 SQLite 檔案 ${DATABASE_FILE}，略過 PostgreSQL 自動搬家。`);
    return;
  }

  let rows = [];
  let sourceDb = null;
  try {
    const Database = require("better-sqlite3");
    sourceDb = new Database(DATABASE_FILE, { readonly: true, fileMustExist: true });
    rows = sourceDb.prepare("SELECT user_id, data FROM players").all();
  } catch (error) {
    console.error("SQLite 玩家資料無法搬到 PostgreSQL，已略過自動搬家。");
    console.error(error);
    return;
  } finally {
    if (sourceDb) sourceDb.close();
  }

  if (rows.length === 0) {
    console.log("SQLite 沒有玩家資料，略過 PostgreSQL 自動搬家。");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = Date.now();
    let imported = 0;
    for (const row of rows) {
      try {
        const player = JSON.parse(row.data);
        await client.query(`
          INSERT INTO players (user_id, data, updated_at)
          VALUES ($1, $2::jsonb, $3)
          ON CONFLICT (user_id) DO NOTHING
        `, [row.user_id, JSON.stringify(player), now]);
        imported += 1;
      } catch (error) {
        console.error(`玩家 ${row.user_id} 的 SQLite 資料損壞，搬家時已略過。`);
        console.error(error);
      }
    }
    await client.query(`
      INSERT INTO meta (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, ["sqlite_migrated", JSON.stringify({ at: now, source: DATABASE_FILE, imported })]);
    await client.query("COMMIT");
    console.log(`已從 SQLite 搬家 ${imported} 筆玩家資料到 PostgreSQL。`);
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

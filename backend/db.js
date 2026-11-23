const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'chat.db');

let _db = null;

function ensureReady() {
  if (!_db) throw new Error('DB not initialized');
}

function persist() {
  fs.writeFileSync(DB_FILE, Buffer.from(_db.export()));
}

// Execute one or more statements with no params (schema setup etc.)
function exec(sql) {
  ensureReady();
  _db.exec(sql);
}

// Return all matching rows as an array of plain objects
function all(sql, params = []) {
  ensureReady();
  const stmt = _db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Return first matching row or null
function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

// Execute a write statement; persists to disk and returns { lastInsertRowid, changes }
function run(sql, params = []) {
  ensureReady();
  _db.run(sql, params);
  const lastInsertRowid = _db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] ?? null;
  const changes = _db.getRowsModified();
  persist();
  return { lastInsertRowid, changes };
}

async function initDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs();
  _db = fs.existsSync(DB_FILE)
    ? new SQL.Database(fs.readFileSync(DB_FILE))
    : new SQL.Database();

  _db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL UNIQUE,
      password  TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      content    TEXT,
      type       TEXT NOT NULL DEFAULT 'text',
      photo_url  TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      emoji      TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id, emoji),
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (user_id)    REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name   TEXT NOT NULL,
      file_url      TEXT NOT NULL,
      file_size     INTEGER,
      mime_type     TEXT,
      description   TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  persist();
  // Add file_name column if upgrading from an older schema
  try { _db.exec('ALTER TABLE messages ADD COLUMN file_name TEXT'); persist(); } catch(e) {}
  console.log('Database ready.');
}

module.exports = { initDb, all, get, run, exec };

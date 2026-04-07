const Database = require('better-sqlite3');
const path = require('path');

const fs = require('fs');

const dataDir = process.env.NODE_ENV === 'production' && fs.existsSync('/data')
  ? '/data'
  : __dirname;

const db = new Database(path.join(dataDir, 'attendance.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    clock_in TEXT,
    clock_out TEXT,
    scheduled_in TEXT,
    scheduled_out TEXT,
    break_minutes INTEGER,
    memo TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_records_date ON records(date);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// マイグレーション: 既存テーブルに列がなければ追加
const cols = db.prepare("PRAGMA table_info(records)").all().map(c => c.name);
if (!cols.includes('scheduled_in')) {
  db.exec("ALTER TABLE records ADD COLUMN scheduled_in TEXT");
}
if (!cols.includes('scheduled_out')) {
  db.exec("ALTER TABLE records ADD COLUMN scheduled_out TEXT");
}
if (!cols.includes('break_minutes')) {
  db.exec("ALTER TABLE records ADD COLUMN break_minutes INTEGER");
}

// デフォルト時給を設定（未設定の場合）
const wage = db.prepare("SELECT value FROM settings WHERE key = 'hourly_wage'").get();
if (!wage) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('hourly_wage', '1000')").run();
}

module.exports = db;

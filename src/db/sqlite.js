/**
 * SQLite 데이터베이스 초기화 및 관리
 * 서버 재시작 후에도 데이터 유지
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'dailyfni.db');
const db = new Database(DB_PATH);

// WAL 모드 (성능 최적화)
db.pragma('journal_mode = WAL');

// 스키마 초기화
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    accountName TEXT NOT NULL,
    naverId TEXT NOT NULL,
    naverPassword TEXT DEFAULT '',
    tier INTEGER DEFAULT 1,
    isActive INTEGER DEFAULT 1,
    autoPublish INTEGER DEFAULT 1,
    neighborEngage INTEGER DEFAULT 1,
    proxyId TEXT,
    proxyServer TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS proxies (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT DEFAULT '',
    password TEXT DEFAULT '',
    status TEXT DEFAULT 'normal',
    speed INTEGER,
    assignedAccountId TEXT,
    assignedAccountName TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS contents (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL,
    title TEXT DEFAULT '',
    body TEXT DEFAULT '',
    tone TEXT DEFAULT '친근톤',
    contentType TEXT DEFAULT '일반 정보성',
    productInfo TEXT DEFAULT '',
    grade TEXT,
    status TEXT DEFAULT '대기',
    accountId TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS postings (
    id TEXT PRIMARY KEY,
    keyword TEXT DEFAULT '',
    accountName TEXT DEFAULT '',
    accountId TEXT,
    tone TEXT DEFAULT '친근톤',
    contentId TEXT,
    scheduledTime TEXT DEFAULT '즉시',
    status TEXT DEFAULT '대기중',
    url TEXT,
    error TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS posting_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    accountName TEXT DEFAULT '',
    message TEXT DEFAULT '',
    severity TEXT DEFAULT '정보'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS engagement_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT DEFAULT (datetime('now', 'localtime')),
    accountName TEXT DEFAULT '',
    action TEXT DEFAULT '',
    target TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS buddy_accept_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accountName TEXT DEFAULT '',
    acceptedCount INTEGER DEFAULT 0,
    skippedCount INTEGER DEFAULT 0,
    error TEXT DEFAULT '',
    timestamp TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

module.exports = db;

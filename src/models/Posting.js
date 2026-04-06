const { v4: uuid } = require('uuid');
const db = require('../db/sqlite');

// ── Queue ──
const insertPosting = db.prepare(`INSERT INTO postings (id, keyword, accountName, accountId, tone, contentId, scheduledTime) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const selectAll = db.prepare(`SELECT * FROM postings ORDER BY createdAt ASC`);
const selectById = db.prepare(`SELECT * FROM postings WHERE id = ?`);
const deleteById = db.prepare(`DELETE FROM postings WHERE id = ?`);

function createPosting(data) {
  const id = uuid();
  insertPosting.run(id, data.keyword || '', data.accountName || '', data.accountId || null,
    data.tone || '친근톤', data.contentId || null, data.scheduledTime || '즉시');
  return selectById.get(id);
}

function listPostings() { return selectAll.all(); }
function getPosting(id) { return selectById.get(id) || null; }

function updatePosting(id, data) {
  const item = selectById.get(id);
  if (!item) return null;
  const sets = []; const vals = [];
  for (const k of ['status', 'error', 'url', 'keyword', 'accountName', 'accountId', 'tone', 'contentId', 'scheduledTime']) {
    if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (sets.length) {
    sets.push(`updatedAt = datetime('now')`);
    vals.push(id);
    db.prepare(`UPDATE postings SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  return selectById.get(id);
}

function deletePosting(id) { return deleteById.run(id).changes > 0; }

// ── Settings (key-value in settings table) ──
const defaultSettings = {
  distribution: 'sequential',
  interval: '10분',
  dailyMax: 10,
  accountMax: 3,
  footerLink: 'http://home.dailyfni.co.kr',
  footerText: '',
};

function getSettings() {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'posting'`).get();
  // 기본값에 저장된 값 병합 — 새 필드(footerLink 등) 추가 시 하위 호환
  return row ? { ...defaultSettings, ...JSON.parse(row.value) } : { ...defaultSettings };
}

function updateSettings(data) {
  const current = getSettings();
  const updated = { ...current, ...data };
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('posting', ?)`).run(JSON.stringify(updated));
  return updated;
}

// ── Error log ──
function addError(entry) {
  db.prepare(`INSERT INTO posting_errors (accountName, message, severity) VALUES (?, ?, ?)`)
    .run(entry.accountName || '', entry.message || '', entry.severity || '정보');
}

function listErrors() {
  return db.prepare(`SELECT * FROM posting_errors ORDER BY timestamp DESC LIMIT 50`).all();
}

module.exports = { createPosting, listPostings, getPosting, updatePosting, deletePosting, getSettings, updateSettings, addError, listErrors };

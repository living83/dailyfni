const { v4: uuid } = require('uuid');

/* ── In-memory posting queue ── */
const queue = [];

/* ── Distribution settings ── */
let settings = {
  distribution: 'sequential', // 'sequential' | 'random' | 'tier'
  interval: '10분',
  dailyMax: 10,
  accountMax: 3,
};

/* ── Error log ── */
const errors = [];

/* ── Queue CRUD ── */
function createPosting(data) {
  const item = {
    id: uuid(),
    keyword: data.keyword || '',
    accountName: data.accountName || '',
    accountId: data.accountId || null,
    tone: data.tone || '친근톤',
    contentId: data.contentId || null,
    scheduledTime: data.scheduledTime || '즉시',
    status: '대기중',
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  queue.push(item);
  return item;
}

function listPostings() {
  return [...queue].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getPosting(id) {
  return queue.find((p) => p.id === id) || null;
}

function updatePosting(id, data) {
  const idx = queue.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const allowed = ['status', 'error', 'keyword', 'accountName', 'accountId', 'tone', 'contentId', 'scheduledTime'];
  for (const key of allowed) {
    if (data[key] !== undefined) queue[idx][key] = data[key];
  }
  queue[idx].updatedAt = new Date().toISOString();
  return queue[idx];
}

function deletePosting(id) {
  const idx = queue.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  return true;
}

/* ── Settings ── */
function getSettings() {
  return { ...settings };
}

function updateSettings(data) {
  const allowed = ['distribution', 'interval', 'dailyMax', 'accountMax'];
  for (const key of allowed) {
    if (data[key] !== undefined) settings[key] = data[key];
  }
  return { ...settings };
}

/* ── Error log ── */
function addError(entry) {
  const item = {
    id: uuid(),
    timestamp: entry.timestamp || new Date().toISOString(),
    accountName: entry.accountName || '',
    message: entry.message || '',
    severity: entry.severity || '정보',
  };
  errors.unshift(item);
  return item;
}

function listErrors() {
  return [...errors];
}

module.exports = {
  createPosting,
  listPostings,
  getPosting,
  updatePosting,
  deletePosting,
  getSettings,
  updateSettings,
  addError,
  listErrors,
};

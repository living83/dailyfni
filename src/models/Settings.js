const db = require('../db/sqlite');

const defaultSettings = {
  claudeApiKey: '',
  naverClientId: '',
  naverClientSecret: '',
  engagementBot: false,
  engStartHour: '09',
  engStartMin: '00',
  engEndHour: '18',
  engEndMin: '00',
  visitInterval: 10,
  randomDelay: true,
  maxVisits: 20,
  heartLike: true,
  engagementAccountIds: [],
  logLevel: '정보',
  logRetention: '30일',
  proxyAutoCheck: true,
  proxyCheckInterval: '6시간',
  updatedAt: new Date().toISOString(),
};

function _load() {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'system'`).get();
  return row ? { ...defaultSettings, ...JSON.parse(row.value) } : { ...defaultSettings };
}

function _save(data) {
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system', ?)`).run(JSON.stringify(data));
}

function getSettings() {
  const s = _load();
  return {
    ...s,
    claudeApiKey: s.claudeApiKey ? '••••••' + s.claudeApiKey.slice(-8) : '',
    naverClientSecret: s.naverClientSecret ? '••••••' + s.naverClientSecret.slice(-4) : '',
  };
}

function getSettingsRaw() {
  return _load();
}

function updateSettings(data) {
  const current = _load();
  if (data.claudeApiKey && data.claudeApiKey.startsWith('••')) delete data.claudeApiKey;
  if (data.naverClientSecret && data.naverClientSecret.startsWith('••')) delete data.naverClientSecret;

  const boolFields = ['engagementBot', 'heartLike', 'proxyAutoCheck', 'randomDelay'];
  const strFields = ['claudeApiKey', 'naverClientId', 'naverClientSecret', 'engStartHour', 'engStartMin', 'engEndHour', 'engEndMin', 'logLevel', 'logRetention', 'proxyCheckInterval'];
  const numFields = ['maxVisits', 'visitInterval'];

  for (const k of boolFields) if (data[k] !== undefined) current[k] = !!data[k];
  for (const k of strFields) if (data[k] !== undefined) current[k] = String(data[k]);
  for (const k of numFields) if (data[k] !== undefined) current[k] = Number(data[k]);
  if (Array.isArray(data.engagementAccountIds)) current.engagementAccountIds = data.engagementAccountIds;

  current.updatedAt = new Date().toISOString();
  _save(current);
  return getSettings();
}

function backupSettings() {
  return JSON.parse(JSON.stringify(_load()));
}

function restoreSettings(data) {
  const restored = { ...defaultSettings, ...data, updatedAt: new Date().toISOString() };
  _save(restored);
  return getSettings();
}

module.exports = { getSettings, getSettingsRaw, updateSettings, backupSettings, restoreSettings };

const { v4: uuid } = require('uuid');
const db = require('../db/sqlite');

const insert = db.prepare(`INSERT INTO accounts (id, accountName, naverId, naverPassword, tier, isActive, autoPublish, neighborEngage, proxyId, proxyServer)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const selectAll = db.prepare(`SELECT * FROM accounts ORDER BY createdAt DESC`);
const selectById = db.prepare(`SELECT * FROM accounts WHERE id = ?`);
const deleteById = db.prepare(`DELETE FROM accounts WHERE id = ?`);

function boolToInt(v) { return v ? 1 : 0; }
function row2obj(r) {
  if (!r) return null;
  return { ...r, isActive: !!r.isActive, autoPublish: !!r.autoPublish, neighborEngage: !!r.neighborEngage };
}

function createAccount(data) {
  const id = uuid();
  insert.run(id, data.accountName, data.naverId, data.naverPassword || '',
    data.tier || 1, boolToInt(data.isActive !== false), boolToInt(data.autoPublish !== false),
    boolToInt(data.neighborEngage !== false), data.proxyId || null, data.proxyServer || null);
  return sanitize(row2obj(selectById.get(id)));
}

function listAccounts() {
  return selectAll.all().map(r => sanitize(row2obj(r)));
}

function getAccount(id) {
  const r = row2obj(selectById.get(id));
  return r ? sanitize(r) : null;
}

function getAccountRaw(id) {
  return row2obj(selectById.get(id));
}

function updateAccount(id, data) {
  const a = selectById.get(id);
  if (!a) return null;
  const fields = { accountName: data.accountName, naverId: data.naverId, tier: data.tier,
    isActive: data.isActive !== undefined ? boolToInt(data.isActive) : undefined,
    autoPublish: data.autoPublish !== undefined ? boolToInt(data.autoPublish) : undefined,
    neighborEngage: data.neighborEngage !== undefined ? boolToInt(data.neighborEngage) : undefined,
    proxyId: data.proxyId, proxyServer: data.proxyServer };
  if (data.naverPassword) fields.naverPassword = data.naverPassword;

  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return sanitize(row2obj(a));
  sets.push(`updatedAt = datetime('now')`);
  vals.push(id);
  db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return sanitize(row2obj(selectById.get(id)));
}

function deleteAccount(id) {
  const r = deleteById.run(id);
  return r.changes > 0;
}

function sanitize(a) {
  if (!a) return null;
  const { naverPassword, ...rest } = a;
  return rest;
}

module.exports = { createAccount, listAccounts, getAccount, getAccountRaw, updateAccount, deleteAccount };

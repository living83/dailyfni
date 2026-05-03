const { v4: uuid } = require('uuid');
const db = require('../db/sqlite');

const insert = db.prepare(`INSERT INTO tistory_accounts (id, accountName, blogName, kakaoId, kakaoPassword, tier, isActive, autoPublish)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const selectAll = db.prepare(`SELECT * FROM tistory_accounts ORDER BY createdAt DESC`);
const selectById = db.prepare(`SELECT * FROM tistory_accounts WHERE id = ?`);
const deleteById = db.prepare(`DELETE FROM tistory_accounts WHERE id = ?`);

function boolToInt(v) { return v ? 1 : 0; }
function row2obj(r) {
  if (!r) return null;
  return { ...r, isActive: !!r.isActive, autoPublish: !!r.autoPublish };
}

function createAccount(data) {
  const id = uuid();
  insert.run(id, data.accountName, data.blogName, data.kakaoId, data.kakaoPassword || '',
    data.tier || 1, boolToInt(data.isActive !== false), boolToInt(data.autoPublish !== false));
  return sanitize(row2obj(selectById.get(id)));
}

function listAccounts() {
  return selectAll.all().map(r => sanitize(row2obj(r)));
}

function getAccount(id) {
  return sanitize(row2obj(selectById.get(id)));
}

function getAccountRaw(id) {
  return row2obj(selectById.get(id));
}

function updateAccount(id, data) {
  const a = selectById.get(id);
  if (!a) return null;
  const fields = {
    accountName: data.accountName, blogName: data.blogName,
    kakaoId: data.kakaoId, tier: data.tier,
    isActive: data.isActive !== undefined ? boolToInt(data.isActive) : undefined,
    autoPublish: data.autoPublish !== undefined ? boolToInt(data.autoPublish) : undefined,
  };
  if (data.kakaoPassword) fields.kakaoPassword = data.kakaoPassword;

  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return sanitize(row2obj(a));
  sets.push(`updatedAt = datetime('now', 'localtime')`);
  vals.push(id);
  db.prepare(`UPDATE tistory_accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return sanitize(row2obj(selectById.get(id)));
}

function deleteAccount(id) {
  return deleteById.run(id).changes > 0;
}

function sanitize(a) {
  if (!a) return null;
  const { kakaoPassword, ...rest } = a;
  return rest;
}

module.exports = { createAccount, listAccounts, getAccount, getAccountRaw, updateAccount, deleteAccount };

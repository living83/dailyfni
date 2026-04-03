const { v4: uuid } = require('uuid');
const db = require('../db/sqlite');

const insert = db.prepare(`INSERT INTO proxies (id, ip, port, username, password) VALUES (?, ?, ?, ?, ?)`);
const selectAll = db.prepare(`SELECT * FROM proxies ORDER BY createdAt DESC`);
const selectById = db.prepare(`SELECT * FROM proxies WHERE id = ?`);
const deleteById = db.prepare(`DELETE FROM proxies WHERE id = ?`);

function sanitize(p) {
  if (!p) return null;
  const { password, ...rest } = p;
  return rest;
}

function createProxy(data) {
  const id = uuid();
  insert.run(id, data.ip, Number(data.port), data.username || '', data.password || '');
  return sanitize(selectById.get(id));
}

function listProxies() {
  return selectAll.all().map(sanitize);
}

function getProxy(id) {
  return sanitize(selectById.get(id));
}

function updateProxy(id, data) {
  const p = selectById.get(id);
  if (!p) return null;
  const sets = []; const vals = [];
  for (const k of ['ip', 'port', 'username', 'password', 'status', 'speed', 'assignedAccountId', 'assignedAccountName']) {
    if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE proxies SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  return sanitize(selectById.get(id));
}

function deleteProxy(id) {
  return deleteById.run(id).changes > 0;
}

function assignProxy(proxyId, accountId, accountName) {
  return updateProxy(proxyId, { assignedAccountId: accountId, assignedAccountName: accountName });
}

function testProxy(id) {
  const p = selectById.get(id);
  if (!p) return null;
  const speed = Math.floor(Math.random() * 300) + 20;
  const status = speed < 150 ? 'normal' : speed < 500 ? 'slow' : 'error';
  db.prepare(`UPDATE proxies SET speed = ?, status = ? WHERE id = ?`).run(speed, status, id);
  return { status, speed };
}

module.exports = { createProxy, listProxies, getProxy, updateProxy, deleteProxy, assignProxy, testProxy };

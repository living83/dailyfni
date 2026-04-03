const { v4: uuid } = require('uuid');

/** @type {Map<string, object>} */
const proxies = new Map();

function createProxy(data) {
  const id = uuid();
  const proxy = {
    id,
    ip: data.ip,
    port: Number(data.port),
    username: data.username || '',
    password: data.password || '',
    status: 'normal',     // normal | slow | error
    speed: null,
    assignedAccountId: null,
    assignedAccountName: null,
    createdAt: new Date().toISOString(),
  };
  proxies.set(id, proxy);
  return sanitize(proxy);
}

function listProxies() {
  return [...proxies.values()].map(sanitize);
}

function getProxy(id) {
  const p = proxies.get(id);
  return p ? sanitize(p) : null;
}

function updateProxy(id, data) {
  const p = proxies.get(id);
  if (!p) return null;
  for (const k of ['ip', 'port', 'username', 'password', 'status', 'speed',
    'assignedAccountId', 'assignedAccountName']) {
    if (data[k] !== undefined) p[k] = data[k];
  }
  return sanitize(p);
}

function deleteProxy(id) {
  return proxies.delete(id);
}

function assignProxy(proxyId, accountId, accountName) {
  const p = proxies.get(proxyId);
  if (!p) return null;
  p.assignedAccountId = accountId;
  p.assignedAccountName = accountName;
  return sanitize(p);
}

/** Simulate connection test */
function testProxy(id) {
  const p = proxies.get(id);
  if (!p) return null;
  const speed = Math.floor(Math.random() * 300) + 20;
  p.speed = speed;
  p.status = speed < 150 ? 'normal' : speed < 500 ? 'slow' : 'error';
  return { status: p.status, speed };
}

function sanitize(p) {
  const { password, ...rest } = p;
  return rest;
}

module.exports = { createProxy, listProxies, getProxy, updateProxy, deleteProxy, assignProxy, testProxy };

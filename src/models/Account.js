const { v4: uuid } = require('uuid');

/** @type {Map<string, object>} */
const accounts = new Map();

function createAccount(data) {
  const id = uuid();
  const account = {
    id,
    accountName: data.accountName,
    naverId: data.naverId,
    naverPassword: data.naverPassword || '', // TODO: encrypt
    tier: data.tier || 1,
    isActive: data.isActive !== false,
    autoPublish: data.autoPublish !== false,
    neighborEngage: data.neighborEngage !== false,
    proxyId: data.proxyId || null,
    proxyServer: data.proxyServer || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  accounts.set(id, account);
  return sanitize(account);
}

function listAccounts() {
  return [...accounts.values()].map(sanitize);
}

function getAccount(id) {
  const a = accounts.get(id);
  return a ? sanitize(a) : null;
}

function updateAccount(id, data) {
  const a = accounts.get(id);
  if (!a) return null;

  const fields = ['accountName', 'naverId', 'tier', 'isActive', 'autoPublish',
    'neighborEngage', 'proxyId', 'proxyServer'];
  for (const k of fields) {
    if (data[k] !== undefined) a[k] = data[k];
  }
  if (data.naverPassword) a.naverPassword = data.naverPassword;
  a.updatedAt = new Date().toISOString();
  return sanitize(a);
}

function deleteAccount(id) {
  return accounts.delete(id);
}

/** Hide password from API response */
function sanitize(a) {
  const { naverPassword, ...rest } = a;
  return rest;
}

/** Get account with password (internal use only — for Playwright) */
function getAccountRaw(id) {
  return accounts.get(id) || null;
}

module.exports = { createAccount, listAccounts, getAccount, getAccountRaw, updateAccount, deleteAccount };

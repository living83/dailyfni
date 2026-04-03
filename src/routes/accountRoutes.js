const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Account = require('../models/Account');
const Proxy = require('../models/Proxy');

const router = Router();

// ── Accounts ──

router.post('/accounts', (req, res) => {
  const { accountName, naverId, naverPassword, tier, proxyId } = req.body;
  if (!accountName || !naverId) {
    return res.status(400).json({ success: false, message: '계정명과 네이버 ID는 필수입니다.' });
  }
  const account = Account.createAccount({ accountName, naverId, naverPassword, tier, proxyId });
  res.status(201).json({ success: true, account });
});

router.get('/accounts', (req, res) => {
  res.json({ success: true, accounts: Account.listAccounts() });
});

router.get('/accounts/:id', (req, res) => {
  const account = Account.getAccount(req.params.id);
  if (!account) return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
  res.json({ success: true, account });
});

router.patch('/accounts/:id', (req, res) => {
  const account = Account.updateAccount(req.params.id, req.body);
  if (!account) return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
  res.json({ success: true, account });
});

router.delete('/accounts/:id', (req, res) => {
  const ok = Account.deleteAccount(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
  res.json({ success: true, message: '계정이 삭제되었습니다.' });
});

router.post('/accounts/:id/test', (req, res) => {
  const account = Account.getAccount(req.params.id);
  if (!account) return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
  // Simulate login test
  const success = Math.random() > 0.2;
  res.json({ success: true, result: { loginSuccess: success, message: success ? '로그인 성공' : '로그인 실패 - 캡챠 감지' } });
});

// ── Proxies ──

router.post('/proxies', (req, res) => {
  const { ip, port, username, password } = req.body;
  if (!ip || !port) {
    return res.status(400).json({ success: false, message: 'IP와 포트는 필수입니다.' });
  }
  const proxy = Proxy.createProxy({ ip, port, username, password });
  res.status(201).json({ success: true, proxy });
});

router.get('/proxies', (req, res) => {
  res.json({ success: true, proxies: Proxy.listProxies() });
});

router.patch('/proxies/:id', (req, res) => {
  const proxy = Proxy.updateProxy(req.params.id, req.body);
  if (!proxy) return res.status(404).json({ success: false, message: '프록시를 찾을 수 없습니다.' });
  res.json({ success: true, proxy });
});

router.delete('/proxies/:id', (req, res) => {
  const ok = Proxy.deleteProxy(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '프록시를 찾을 수 없습니다.' });
  res.json({ success: true, message: '프록시가 삭제되었습니다.' });
});

router.post('/proxies/:id/test', (req, res) => {
  const result = Proxy.testProxy(req.params.id);
  if (!result) return res.status(404).json({ success: false, message: '프록시를 찾을 수 없습니다.' });
  res.json({ success: true, result });
});

router.post('/proxies/:id/assign', (req, res) => {
  const { accountId, accountName } = req.body;
  const proxy = Proxy.assignProxy(req.params.id, accountId, accountName);
  if (!proxy) return res.status(404).json({ success: false, message: '프록시를 찾을 수 없습니다.' });
  // Also update account's proxy reference
  if (accountId) Account.updateAccount(accountId, { proxyId: req.params.id, proxyServer: `${proxy.ip}:${proxy.port}` });
  res.json({ success: true, proxy });
});

module.exports = router;

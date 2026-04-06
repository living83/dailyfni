const { Router } = require('express');
const Account = require('../models/Account');
const Content = require('../models/Content');
const Posting = require('../models/Posting');

const router = Router();

const todayStr = () => new Date().toISOString().slice(0, 10);
const isToday = (dateStr) => dateStr && dateStr.slice(0, 10) === todayStr();
const tierLabels = { 1: '신규', 2: '성장', 3: '중급', 4: '고수익', 5: '최상위' };

/* ── GET /stats/dashboard ── */
router.get('/stats/dashboard', (_req, res) => {
  const accounts = Account.listAccounts();
  const contents = Content.listContents();
  const postings = Posting.listPostings();

  const activeAccounts = accounts.filter((a) => a.isActive).length;
  const pendingContent = contents.filter((c) => c.status === '대기').length;
  const todayPostings = postings.filter((p) => isToday(p.createdAt));
  const todaySuccess = todayPostings.filter((p) => p.status === '발행완료').length;
  const todayFailed = todayPostings.filter((p) => p.status === '실패').length;
  const todayPosts = todayPostings.length;
  const total = postings.length;
  const totalSuccess = postings.filter((p) => p.status === '발행완료').length;
  const successRate = total > 0 ? Math.round((totalSuccess / total) * 1000) / 10 : 0;

  res.json({ activeAccounts, todayPosts, todaySuccess, todayFailed, pendingContent, successRate });
});

/* ── GET /stats/posting-live ── */
router.get('/stats/posting-live', (_req, res) => {
  const postings = Posting.listPostings();
  const recent = postings
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20)
    .map((p) => {
      const d = new Date(p.createdAt);
      return {
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        accountName: p.accountName,
        keyword: p.keyword,
        tone: p.tone || '친근톤',
        status: p.status,
      };
    });
  res.json(recent);
});

/* ── GET /stats/account-tiers ── */
router.get('/stats/account-tiers', (_req, res) => {
  const accounts = Account.listAccounts();
  const tierCounts = {};
  for (const a of accounts) {
    const t = a.tier || 1;
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }
  res.json([1, 2, 3, 4, 5].map((t) => ({ tier: t, label: tierLabels[t], count: tierCounts[t] || 0 })));
});

/* ── GET /stats/monitoring ── */
router.get('/stats/monitoring', (_req, res) => {
  const postings = Posting.listPostings();
  const total = postings.length;
  const success = postings.filter((p) => p.status === '발행완료').length;
  const failed = postings.filter((p) => p.status === '실패').length;
  const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : 0;
  res.json({ total, success, failed, successRate });
});

/* ── GET /stats/account-performance ── */
router.get('/stats/account-performance', (_req, res) => {
  const accounts = Account.listAccounts();
  const postings = Posting.listPostings();

  const accountMap = {};
  for (const a of accounts) {
    accountMap[a.accountName] = { accountName: a.accountName, tier: a.tier || 1, totalPosts: 0, success: 0, failed: 0 };
  }
  for (const p of postings) {
    if (!accountMap[p.accountName]) {
      accountMap[p.accountName] = { accountName: p.accountName, tier: 1, totalPosts: 0, success: 0, failed: 0 };
    }
    accountMap[p.accountName].totalPosts++;
    if (p.status === '발행완료') accountMap[p.accountName].success++;
    if (p.status === '실패') accountMap[p.accountName].failed++;
  }

  const result = Object.values(accountMap).map((a) => ({
    ...a,
    successRate: a.totalPosts > 0 ? Math.round((a.success / a.totalPosts) * 1000) / 10 : 0,
  }));
  res.json(result.sort((a, b) => b.successRate - a.successRate));
});

/* ── GET /stats/tier-posting ── */
router.get('/stats/tier-posting', (_req, res) => {
  const accounts = Account.listAccounts();
  const postings = Posting.listPostings();
  const contents = Content.listContents();

  const accountTier = {};
  for (const a of accounts) accountTier[a.accountName] = a.tier || 1;

  const contentType = {};
  for (const c of contents) contentType[c.id] = c.contentType;

  const tierData = {};
  for (let t = 1; t <= 5; t++) tierData[t] = { general: 0, ad: 0 };

  for (const p of postings) {
    const tier = accountTier[p.accountName] || 1;
    const cType = p.contentId ? contentType[p.contentId] : '일반 정보성';
    if (cType && cType.includes('광고')) tierData[tier].ad++;
    else tierData[tier].general++;
  }

  res.json([1, 2, 3, 4, 5].map((t) => ({ tier: t, label: tierLabels[t], ...tierData[t] })));
});

/* ── GET /stats/posting-records ── */
router.get('/stats/posting-records', (req, res) => {
  const postings = Posting.listPostings();
  const contents = Content.listContents();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

  const contentMap = {};
  for (const c of contents) contentMap[c.id] = c;

  const sorted = postings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = sorted.length;
  const start = (page - 1) * limit;

  const records = sorted.slice(start, start + limit).map((p) => {
    const content = p.contentId ? contentMap[p.contentId] : null;
    const d = new Date(p.createdAt);
    return {
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      account: p.accountName,
      keyword: p.keyword,
      title: content?.title || `${p.keyword} 관련 블로그 글`,
      tone: p.tone || '친근톤',
      status: p.status,
      quality: content?.grade || '-',
      link: p.url || null,
    };
  });

  res.json({ records, total });
});

module.exports = router;

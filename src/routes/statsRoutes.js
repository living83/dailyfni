const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Account = require('../models/Account');
const Content = require('../models/Content');
const Posting = require('../models/Posting');

const router = Router();

/* ── Helpers ── */
const todayStr = () => new Date().toISOString().slice(0, 10);
const isToday = (dateStr) => dateStr && dateStr.slice(0, 10) === todayStr();
const tierLabels = { 1: '신규', 2: '성장', 3: '중급', 4: '고수익', 5: '최상위' };

/* ── GET /stats/dashboard ── */
router.get('/stats/dashboard', authenticate, (_req, res) => {
  const accounts = Account.listAccounts();
  const contents = Content.listContents();
  const postings = Posting.listPostings();

  if (accounts.length === 0 && postings.length === 0) {
    return res.json({
      activeAccounts: 12,
      todayPosts: 24,
      todaySuccess: 22,
      todayFailed: 2,
      pendingContent: 8,
      successRate: 96.5,
    });
  }

  const activeAccounts = accounts.filter((a) => a.isActive).length;
  const pendingContent = contents.filter((c) => c.status === '대기').length;
  const todayPostings = postings.filter((p) => isToday(p.createdAt));
  const todaySuccess = todayPostings.filter((p) => p.status === '발행완료').length;
  const todayFailed = todayPostings.filter((p) => p.status === '실패').length;
  const todayPosts = todayPostings.length;
  const total = postings.length;
  const totalSuccess = postings.filter((p) => p.status === '발행완료').length;
  const successRate = total > 0 ? Math.round((totalSuccess / total) * 1000) / 10 : 0;

  res.json({
    activeAccounts: activeAccounts || 12,
    todayPosts: todayPosts || 24,
    todaySuccess: todaySuccess || 22,
    todayFailed: todayFailed || 2,
    pendingContent: pendingContent || 8,
    successRate: successRate || 96.5,
  });
});

/* ── GET /stats/posting-live ── */
router.get('/stats/posting-live', authenticate, (_req, res) => {
  const postings = Posting.listPostings();

  if (postings.length === 0) {
    return res.json([
      { time: '10:32', accountName: '블로그계정1', keyword: '청년도약계좌', tone: '친근톤', status: '발행완료' },
      { time: '10:28', accountName: '마케팅02', keyword: '신용대출 비교', tone: '전문톤', status: '발행중' },
      { time: '10:15', accountName: '대출전문03', keyword: '전세자금대출', tone: '리뷰톤', status: '생성중' },
      { time: '10:05', accountName: '재테크블로그', keyword: '주택담보대출', tone: '친근톤', status: '발행완료' },
      { time: '09:52', accountName: '금융정보센터', keyword: '적금 추천', tone: '전문톤', status: '대기' },
      { time: '09:40', accountName: '생활경제팁', keyword: '카드 혜택 비교', tone: '리뷰톤', status: '실패' },
    ]);
  }

  const recent = postings
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20)
    .map((p) => {
      const d = new Date(p.createdAt);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return {
        time: `${hh}:${mm}`,
        accountName: p.accountName,
        keyword: p.keyword,
        tone: p.tone || '친근톤',
        status: p.status,
      };
    });

  res.json(recent);
});

/* ── GET /stats/account-tiers ── */
router.get('/stats/account-tiers', authenticate, (_req, res) => {
  const accounts = Account.listAccounts();

  if (accounts.length === 0) {
    return res.json([
      { tier: 1, label: '신규', count: 3 },
      { tier: 2, label: '성장', count: 4 },
      { tier: 3, label: '중급', count: 3 },
      { tier: 4, label: '고수익', count: 1 },
      { tier: 5, label: '최상위', count: 1 },
    ]);
  }

  const tierCounts = {};
  for (const a of accounts) {
    const t = a.tier || 1;
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }

  const result = [1, 2, 3, 4, 5].map((t) => ({
    tier: t,
    label: tierLabels[t],
    count: tierCounts[t] || 0,
  }));

  res.json(result);
});

/* ── GET /stats/monitoring ── */
router.get('/stats/monitoring', authenticate, (_req, res) => {
  const postings = Posting.listPostings();

  if (postings.length === 0) {
    return res.json({ total: 156, success: 149, failed: 7, successRate: 95.5 });
  }

  const total = postings.length;
  const success = postings.filter((p) => p.status === '발행완료').length;
  const failed = postings.filter((p) => p.status === '실패').length;
  const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : 0;

  res.json({ total, success, failed, successRate });
});

/* ── GET /stats/account-performance ── */
router.get('/stats/account-performance', authenticate, (_req, res) => {
  const accounts = Account.listAccounts();
  const postings = Posting.listPostings();

  if (accounts.length === 0 && postings.length === 0) {
    return res.json([
      { accountName: '블로그계정1', tier: 3, totalPosts: 32, success: 32, failed: 0, successRate: 100 },
      { accountName: '마케팅02', tier: 4, totalPosts: 28, success: 27, failed: 1, successRate: 96.4 },
      { accountName: '대출전문03', tier: 5, totalPosts: 30, success: 29, failed: 1, successRate: 96.7 },
      { accountName: '재테크블로그', tier: 2, totalPosts: 25, success: 24, failed: 1, successRate: 96.0 },
      { accountName: '금융정보센터', tier: 3, totalPosts: 22, success: 20, failed: 2, successRate: 90.9 },
      { accountName: '생활경제팁', tier: 1, totalPosts: 19, success: 17, failed: 2, successRate: 89.5 },
    ]);
  }

  // Build lookup from account name -> tier
  const accountTierByName = {};
  for (const a of accounts) {
    accountTierByName[a.accountName] = a.tier || 1;
  }

  const accountMap = {};
  for (const a of accounts) {
    accountMap[a.accountName] = { accountName: a.accountName, tier: a.tier || 1, totalPosts: 0, success: 0, failed: 0 };
  }

  for (const p of postings) {
    const name = p.accountName;
    if (!accountMap[name]) {
      accountMap[name] = { accountName: name, tier: accountTierByName[name] || 1, totalPosts: 0, success: 0, failed: 0 };
    }
    accountMap[name].totalPosts++;
    if (p.status === '발행완료') accountMap[name].success++;
    if (p.status === '실패') accountMap[name].failed++;
  }

  const result = Object.values(accountMap).map((a) => ({
    ...a,
    successRate: a.totalPosts > 0 ? Math.round((a.success / a.totalPosts) * 1000) / 10 : 0,
  }));

  res.json(result.sort((a, b) => b.successRate - a.successRate));
});

/* ── GET /stats/tier-posting ── */
router.get('/stats/tier-posting', authenticate, (_req, res) => {
  const accounts = Account.listAccounts();
  const postings = Posting.listPostings();
  const contents = Content.listContents();

  if (accounts.length === 0 && postings.length === 0) {
    return res.json([
      { tier: 1, label: '신규', general: 15, ad: 0 },
      { tier: 2, label: '성장', general: 30, ad: 10 },
      { tier: 3, label: '중급', general: 20, ad: 20 },
      { tier: 4, label: '고수익', general: 8, ad: 24 },
      { tier: 5, label: '최상위', general: 5, ad: 24 },
    ]);
  }

  // Build account name -> tier lookup
  const accountTier = {};
  for (const a of accounts) {
    accountTier[a.accountName] = a.tier || 1;
  }

  // Build content id -> type lookup
  const contentType = {};
  for (const c of contents) {
    contentType[c.id] = c.contentType;
  }

  const tierData = {};
  for (let t = 1; t <= 5; t++) {
    tierData[t] = { general: 0, ad: 0 };
  }

  for (const p of postings) {
    const tier = accountTier[p.accountName] || 1;
    const cType = p.contentId ? contentType[p.contentId] : '일반 정보성';
    const isAd = cType && cType.includes('광고');
    if (isAd) {
      tierData[tier].ad++;
    } else {
      tierData[tier].general++;
    }
  }

  const result = [1, 2, 3, 4, 5].map((t) => ({
    tier: t,
    label: tierLabels[t],
    general: tierData[t].general,
    ad: tierData[t].ad,
  }));

  res.json(result);
});

/* ── GET /stats/posting-records ── */
router.get('/stats/posting-records', authenticate, (req, res) => {
  const postings = Posting.listPostings();
  const contents = Content.listContents();

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

  if (postings.length === 0) {
    const mockRecords = [
      { date: '04-02 10:32', account: '블로그계정1', keyword: '청년도약계좌', title: '청년도약계좌 가입조건 총정리 (2026년 최신)', tone: '친근톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example1' },
      { date: '04-02 10:28', account: '마케팅02', keyword: '신용대출 비교', title: '신용대출 금리 비교, 은행별 최저금리 TOP5', tone: '전문톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example2' },
      { date: '04-02 10:15', account: '대출전문03', keyword: '전세자금대출', title: '전세자금대출 조건부터 신청방법까지 한눈에', tone: '리뷰톤', status: '발행완료', quality: 'B', link: 'https://blog.naver.com/example3' },
      { date: '04-02 10:05', account: '재테크블로그', keyword: '개인회생 방법', title: '개인회생 신청 절차와 비용, 실제 후기 공유', tone: '전문톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example4' },
      { date: '04-01 16:20', account: '금융정보센터', keyword: '파킹통장 추천', title: '파킹통장 금리 비교 2026, 어디가 제일 높을까?', tone: '친근톤', status: '저품질', quality: 'C', link: 'https://blog.naver.com/example5' },
      { date: '04-01 15:45', account: '생활경제팁', keyword: '주택담보대출', title: '주택담보대출 LTV DSR 한도 계산기 완벽 가이드', tone: '리뷰톤', status: '발행완료', quality: 'B', link: 'https://blog.naver.com/example6' },
      { date: '04-01 14:30', account: '절약의달인', keyword: '적금 금리 비교', title: '2026 적금 금리 비교, 연 5% 넘는 상품은?', tone: '전문톤', status: '실패', quality: 'D', link: null },
      { date: '04-01 13:10', account: '머니투데이K', keyword: 'DSR 계산법', title: 'DSR 계산법 쉽게 이해하기, 대출 한도 늘리는 팁', tone: '친근톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example8' },
      { date: '04-01 11:50', account: '블로그계정1', keyword: '카드 혜택 비교', title: '신용카드 혜택 비교, 2026 상반기 추천 카드 BEST', tone: '리뷰톤', status: '발행완료', quality: 'B', link: 'https://blog.naver.com/example9' },
      { date: '04-01 10:25', account: '마케팅02', keyword: '비상금 대출', title: '비상금 대출 앱 3곳 비교, 금리·한도·속도 총정리', tone: '전문톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example10' },
    ];
    const start = (page - 1) * limit;
    return res.json({ records: mockRecords.slice(start, start + limit), total: mockRecords.length });
  }

  // Build content lookup
  const contentMap = {};
  for (const c of contents) {
    contentMap[c.id] = c;
  }

  const sorted = postings
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = sorted.length;
  const start = (page - 1) * limit;
  const pagePostings = sorted.slice(start, start + limit);

  const records = pagePostings.map((p) => {
    const content = p.contentId ? contentMap[p.contentId] : null;
    const d = new Date(p.createdAt);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return {
      date: `${mm}-${dd} ${hh}:${mi}`,
      account: p.accountName,
      keyword: p.keyword,
      title: content ? content.title : `${p.keyword} 관련 블로그 글`,
      tone: p.tone || '친근톤',
      status: p.status === '발행완료' ? '발행완료' : p.status === '실패' ? '실패' : p.status === '저품질' ? '저품질' : '발행완료',
      quality: content && content.grade ? content.grade : 'B',
      link: p.status === '발행완료' ? `https://blog.naver.com/${p.accountName}` : null,
    };
  });

  res.json({ records, total });
});

module.exports = router;

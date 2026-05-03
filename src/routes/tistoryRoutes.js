const { Router } = require('express');
const TistoryAccount = require('../models/TistoryAccount');
const Content = require('../models/Content');
const { requestTistoryPublish } = require('../services/pythonBridge');
const { processBody } = require('../services/postingHelper');
const db = require('../db/sqlite');
const tistoryScheduler = require('../services/tistoryScheduler');
const { v4: uuid } = require('uuid');

const router = Router();

// ── 계정 CRUD ──

// GET /api/tistory/accounts
router.get('/tistory/accounts', (req, res) => {
  res.json({ success: true, accounts: TistoryAccount.listAccounts() });
});

// POST /api/tistory/accounts
router.post('/tistory/accounts', (req, res) => {
  const { accountName, blogName, kakaoId, kakaoPassword, tier } = req.body;
  if (!accountName || !blogName || !kakaoId) {
    return res.status(400).json({ success: false, message: 'accountName, blogName, kakaoId 필수' });
  }
  const account = TistoryAccount.createAccount({ accountName, blogName, kakaoId, kakaoPassword, tier });
  res.json({ success: true, account });
});

// PUT /api/tistory/accounts/:id
router.put('/tistory/accounts/:id', (req, res) => {
  const account = TistoryAccount.updateAccount(req.params.id, req.body);
  if (!account) return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
  res.json({ success: true, account });
});

// DELETE /api/tistory/accounts/:id
router.delete('/tistory/accounts/:id', (req, res) => {
  const ok = TistoryAccount.deleteAccount(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
  res.json({ success: true });
});

// ── 발행 ──

// POST /api/tistory/publish-now — 즉시 발행 (수동)
router.post('/tistory/publish-now', async (req, res) => {
  const { accountId, title, content, keyword, tags, category } = req.body;
  if (!accountId) return res.json({ success: false, message: 'accountId 필수' });

  const raw = TistoryAccount.getAccountRaw(accountId);
  if (!raw) return res.json({ success: false, message: '계정을 찾을 수 없습니다.' });

  res.json({ success: true, message: `${raw.accountName} 티스토리 발행 시작` });

  try {
    const result = await requestTistoryPublish({
      account: {
        id: raw.id,
        account_name: raw.accountName,
        blog_name: raw.blogName,
        kakao_id: raw.kakaoId,
        kakao_password: raw.kakaoPassword || '',
      },
      post_data: {
        title: title || keyword || '테스트',
        content: content || '',
        keyword: keyword || '',
        tags: tags || keyword || '',
        category: category || '',
      },
    });

    // 발행 기록 저장
    const postingId = require('uuid').v4();
    db.prepare(`INSERT INTO tistory_postings (id, keyword, accountName, accountId, status, url, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(postingId, keyword || '', raw.accountName, raw.id,
        result.success ? '발행완료' : '실패', result.url || '', result.error || '');

    console.log(`[Tistory] ${raw.accountName}: ${result.success ? '성공' : '실패'} ${result.url || result.error || ''}`);
  } catch (err) {
    console.error(`[Tistory] ${raw.accountName} 예외:`, err.message);
  }
});

// POST /api/tistory/test-publish — 계정 없이 직접 테스트
router.post('/tistory/test-publish', async (req, res) => {
  const { blogName, kakaoId, kakaoPassword, title, content, keyword, tags } = req.body;
  if (!blogName || !kakaoId || !kakaoPassword) {
    return res.json({ success: false, message: 'blogName, kakaoId, kakaoPassword 필수' });
  }

  try {
    const result = await requestTistoryPublish({
      account: {
        id: 'test-tistory',
        account_name: blogName,
        blog_name: blogName,
        kakao_id: kakaoId,
        kakao_password: kakaoPassword,
      },
      post_data: {
        title: title || '테스트 포스팅',
        content: content || '테스트 본문',
        keyword: keyword || '테스트',
        tags: tags || '테스트',
      },
    });
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/tistory/run-all — 즉시 발행 (검수완료 콘텐츠 + 활성 계정 매칭)
router.post('/tistory/run-all', async (req, res) => {
  const activeAccounts = TistoryAccount.listAccounts().filter(a => a.isActive && a.autoPublish);
  const contents = Content.listContents().filter(c => c.status === '검수완료');

  if (activeAccounts.length === 0) return res.json({ success: true, message: '활성 계정이 없습니다.', count: 0 });
  if (contents.length === 0) return res.json({ success: true, message: '검수완료된 티스토리 콘텐츠가 없습니다.', count: 0 });

  const pairs = [];
  let ci = 0;
  for (const acc of activeAccounts) {
    if (ci >= contents.length) break;
    pairs.push({ account: acc, content: contents[ci++] });
  }

  res.json({ success: true, message: `${pairs.length}건 발행 시작`, count: pairs.length });

  for (const { account, content } of pairs) {
    const raw = TistoryAccount.getAccountRaw(account.id);
    if (!raw) continue;

    const postingId = uuid();
    db.prepare(`INSERT INTO tistory_postings (id, keyword, accountName, accountId, contentId, status) VALUES (?, ?, ?, ?, ?, '발행중')`)
      .run(postingId, content.keyword, account.accountName, account.id, content.id);
    Content.updateContent(content.id, { status: '발행중' });

    try {
      const result = await requestTistoryPublish({
        account: { id: raw.id, account_name: raw.accountName, blog_name: raw.blogName, kakao_id: raw.kakaoId, kakao_password: raw.kakaoPassword || '' },
        post_data: { title: content.title || content.keyword, content: processBody(content.body || '', content.contentType), keyword: content.keyword, tags: content.keyword, post_type: content.contentType === '광고(대출)' ? 'ad' : 'general' },
      });

      if (result.success) {
        db.prepare(`UPDATE tistory_postings SET status='발행완료', url=?, updatedAt=datetime('now','localtime') WHERE id=?`).run(result.url || '', postingId);
        Content.updateContent(content.id, { status: '발행완료' });
      } else {
        db.prepare(`UPDATE tistory_postings SET status='실패', error=?, updatedAt=datetime('now','localtime') WHERE id=?`).run(result.error || '발행 실패', postingId);
        Content.updateContent(content.id, { status: '검수완료' });
      }
    } catch (err) {
      db.prepare(`UPDATE tistory_postings SET status='실패', error=?, updatedAt=datetime('now','localtime') WHERE id=?`).run(err.message, postingId);
      Content.updateContent(content.id, { status: '검수완료' });
    }

    if (pairs.indexOf({ account, content }) < pairs.length - 1) {
      await new Promise(r => setTimeout(r, 5000 + Math.random() * 10000));
    }
  }
});

// ── 발행 기록 ──

// GET /api/tistory/postings
router.get('/tistory/postings', (req, res) => {
  const postings = db.prepare(`SELECT * FROM tistory_postings ORDER BY createdAt DESC LIMIT 50`).all();
  res.json({ success: true, postings });
});

// ── 설정 ──

// GET /api/tistory/settings
router.get('/tistory/settings', (req, res) => {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'tistory'`).get();
  const defaults = {
    autoEngine: false,
    startHour: '09', startMin: '00',
    endHour: '18', endMin: '00',
    selectedDays: [true, true, true, true, true, false, false],
    intervalMin: 5, intervalMax: 15,
    dailyMax: 5,
    distribution: 'sequential',
  };
  const settings = row ? { ...defaults, ...JSON.parse(row.value) } : defaults;
  res.json({ success: true, settings });
});

// PUT /api/tistory/settings
router.put('/tistory/settings', (req, res) => {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'tistory'`).get();
  const current = row ? JSON.parse(row.value) : {};
  const updated = { ...current, ...req.body };
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tistory', ?)`).run(JSON.stringify(updated));
  tistoryScheduler.restartTistoryScheduler();
  res.json({ success: true, settings: updated });
});

// ── 스케줄러 제어 ──

// GET /api/tistory/scheduler/status
router.get('/tistory/scheduler/status', (req, res) => {
  res.json({ success: true, ...tistoryScheduler.getStatus() });
});

// GET /api/tistory/scheduler/logs
router.get('/tistory/scheduler/logs', (req, res) => {
  res.json({ success: true, logs: tistoryScheduler.getLogs() });
});

// POST /api/tistory/scheduler/stop — autoEngine도 끔
router.post('/tistory/scheduler/stop', (req, res) => {
  tistoryScheduler.stopTistoryScheduler();
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'tistory'`).get();
  const current = row ? JSON.parse(row.value) : {};
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tistory', ?)`).run(JSON.stringify({ ...current, autoEngine: false }));
  res.json({ success: true, running: tistoryScheduler.isRunning(), message: '스케줄러가 정지되었습니다.' });
});

// POST /api/tistory/scheduler/start — autoEngine도 켬
router.post('/tistory/scheduler/start', (req, res) => {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'tistory'`).get();
  const current = row ? JSON.parse(row.value) : {};
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tistory', ?)`).run(JSON.stringify({ ...current, autoEngine: true }));
  tistoryScheduler.startTistoryScheduler();
  res.json({ success: true, running: tistoryScheduler.isRunning(), message: '스케줄러가 시작되었습니다.' });
});

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Posting = require('../models/Posting');

const router = Router();

// GET /api/posting/queue — list queue
router.get('/posting/queue', authenticate, (req, res) => {
  res.json({ success: true, queue: Posting.listPostings() });
});

// POST /api/posting/queue — add to queue
router.post('/posting/queue', authenticate, (req, res) => {
  const { keyword, accountName, tone, scheduledTime, contentId } = req.body;
  if (!keyword) {
    return res.status(400).json({ success: false, message: '키워드를 입력하세요.' });
  }
  const item = Posting.createPosting({ keyword, accountName, tone, scheduledTime, contentId });
  res.status(201).json({ success: true, item });
});

// PATCH /api/posting/queue/:id — update item
router.patch('/posting/queue/:id', authenticate, (req, res) => {
  const item = Posting.updatePosting(req.params.id, req.body);
  if (!item) return res.status(404).json({ success: false, message: '항목을 찾을 수 없습니다.' });
  res.json({ success: true, item });
});

// DELETE /api/posting/queue/:id — remove
router.delete('/posting/queue/:id', authenticate, (req, res) => {
  const ok = Posting.deletePosting(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '항목을 찾을 수 없습니다.' });
  res.json({ success: true, message: '삭제되었습니다.' });
});

// POST /api/posting/queue/:id/run — simulate instant publish
router.post('/posting/queue/:id/run', authenticate, (req, res) => {
  const item = Posting.updatePosting(req.params.id, { status: '발행중' });
  if (!item) return res.status(404).json({ success: false, message: '항목을 찾을 수 없습니다.' });

  // Simulate async publish — resolves after 1s
  setTimeout(() => {
    const success = Math.random() > 0.3;
    if (success) {
      Posting.updatePosting(req.params.id, { status: '발행완료' });
    } else {
      const errorMsg = '시뮬레이션 발행 실패';
      Posting.updatePosting(req.params.id, { status: '실패', error: errorMsg });
      Posting.addError({
        accountName: item.accountName,
        message: errorMsg,
        severity: '오류',
      });
    }
  }, 1000);

  res.json({ success: true, item, message: '발행이 시작되었습니다.' });
});

// POST /api/posting/run-all — simulate running all 대기중 items
router.post('/posting/run-all', authenticate, (req, res) => {
  const all = Posting.listPostings();
  const pending = all.filter((p) => p.status === '대기중');

  if (pending.length === 0) {
    return res.json({ success: true, message: '대기 중인 항목이 없습니다.', count: 0 });
  }

  for (const p of pending) {
    Posting.updatePosting(p.id, { status: '발행중' });

    setTimeout(() => {
      const success = Math.random() > 0.3;
      if (success) {
        Posting.updatePosting(p.id, { status: '발행완료' });
      } else {
        const errorMsg = '시뮬레이션 발행 실패';
        Posting.updatePosting(p.id, { status: '실패', error: errorMsg });
        Posting.addError({
          accountName: p.accountName,
          message: errorMsg,
          severity: '오류',
        });
      }
    }, 1000 + Math.random() * 2000);
  }

  res.json({ success: true, message: `${pending.length}건 발행이 시작되었습니다.`, count: pending.length });
});

// GET /api/posting/settings — get distribution settings
router.get('/posting/settings', authenticate, (req, res) => {
  res.json({ success: true, settings: Posting.getSettings() });
});

// PUT /api/posting/settings — save distribution settings
router.put('/posting/settings', authenticate, (req, res) => {
  const settings = Posting.updateSettings(req.body);
  res.json({ success: true, settings });
});

// GET /api/posting/errors — list error log
router.get('/posting/errors', authenticate, (req, res) => {
  res.json({ success: true, errors: Posting.listErrors() });
});

module.exports = router;

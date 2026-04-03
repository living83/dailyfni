const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Content = require('../models/Content');

const router = Router();

// POST /api/contents — 콘텐츠 생성 (큐에 추가)
router.post('/contents', authenticate, (req, res) => {
  const { keywords, tone, contentType, productInfo } = req.body;

  // keywords can be a single string or array
  const kwList = Array.isArray(keywords) ? keywords : [keywords];
  const created = [];

  for (const keyword of kwList) {
    if (!keyword || !keyword.trim()) continue;
    created.push(Content.createContent({
      keyword: keyword.trim(),
      tone,
      contentType,
      productInfo,
    }));
  }

  if (created.length === 0) {
    return res.status(400).json({ success: false, message: '키워드를 입력하세요.' });
  }

  res.status(201).json({ success: true, contents: created, count: created.length });
});

// GET /api/contents — 대기열 조회
router.get('/contents', authenticate, (req, res) => {
  res.json({ success: true, contents: Content.listContents() });
});

// GET /api/contents/:id — 상세 조회
router.get('/contents/:id', authenticate, (req, res) => {
  const item = Content.getContent(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
  res.json({ success: true, content: item });
});

// PATCH /api/contents/:id — 수정 (상태, 등급, 본문 등)
router.patch('/contents/:id', authenticate, (req, res) => {
  const item = Content.updateContent(req.params.id, req.body);
  if (!item) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
  res.json({ success: true, content: item });
});

// DELETE /api/contents/:id — 삭제
router.delete('/contents/:id', authenticate, (req, res) => {
  const ok = Content.deleteContent(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
  res.json({ success: true, message: '삭제되었습니다.' });
});

// POST /api/contents/:id/regenerate — 재생성 (상태를 대기로 리셋)
router.post('/contents/:id/regenerate', authenticate, (req, res) => {
  const item = Content.updateContent(req.params.id, { status: '대기', grade: null, body: '' });
  if (!item) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
  res.json({ success: true, content: item, message: '재생성 요청이 등록되었습니다.' });
});

module.exports = router;

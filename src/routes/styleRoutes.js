const { Router } = require('express');
const { requestBlogAnalyze, requestStyleGuide } = require('../services/pythonBridge');
const db = require('../db/sqlite');

const router = Router();

// GET /api/style/guide — 저장된 스타일 가이드 조회
router.get('/style/guide', async (req, res) => {
  const result = await requestStyleGuide();
  res.json(result);
});

// POST /api/style/analyze — 블로그 URL 크롤링 + 스타일 분석
router.post('/style/analyze', async (req, res) => {
  const { urls, maxPosts } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.json({ success: false, message: 'URL 목록이 필요합니다.' });
  }

  res.json({ success: true, message: `${urls.length}개 URL 분석 시작` });

  // 백그라운드에서 분석 실행
  try {
    const result = await requestBlogAnalyze({ urls, max_posts: maxPosts || 5 });
    if (result.success && result.guide) {
      // 스타일 가이드를 settings에도 저장 (글 생성 시 자동 참조)
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('style_guide', ?)`).run(result.guide);
      console.log('[StyleRoute] 스타일 가이드 저장 완료');
    }
  } catch (err) {
    console.error('[StyleRoute] 분석 오류:', err.message);
  }
});

// GET /api/style/settings — 저장된 스타일 가이드 텍스트 (글 생성 시 주입용)
router.get('/style/settings', (req, res) => {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'style_guide'`).get();
  res.json({
    success: true,
    guide: row?.value || '',
    hasGuide: !!row?.value,
  });
});

// PUT /api/style/settings — 수동으로 스타일 가이드 편집/저장
router.put('/style/settings', (req, res) => {
  const { guide } = req.body;
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('style_guide', ?)`).run(guide || '');
  res.json({ success: true });
});

module.exports = router;

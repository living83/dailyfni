const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Content = require('../models/Content');
const { requestGenerate, checkDuplicate } = require('../services/pythonBridge');
const { getSettingsRaw } = require('../models/Settings');

const router = Router();

// POST /api/contents — 키워드를 큐에 추가 + Python AI 생성 요청
router.post('/contents', async (req, res) => {
  const { keywords, tone, contentType, productInfo } = req.body;

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

  // 즉시 응답 (큐에 추가됨)
  res.status(201).json({ success: true, contents: created, count: created.length });

  // 백그라운드에서 Python AI 생성 요청 (fire-and-forget)
  const settings = getSettingsRaw();
  const apiKey = settings.claudeApiKey || process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';

  for (const item of created) {
    Content.updateContent(item.id, { status: '생성중' });

    // Python 서버에 생성 요청 (non-blocking)
    requestGenerate({
      content_id: item.id,
      keyword: item.keyword,
      tone: item.tone || '친근톤',
      content_type: item.contentType || '일반 정보성',
      product_info: item.productInfo || '',
      api_key: apiKey,
    }).then(result => {
      if (result && result.success !== false && result.title) {
        Content.updateContent(item.id, {
          title: result.title,
          body: result.body || result.content || '',
          grade: result.grade || 'B',
          status: result.grade === 'D' ? '저품질' : '검수완료',
        });
        console.log(`[Content] AI 생성 완료: ${item.keyword} → ${result.title}`);
      } else {
        // API 키 없거나 실패 시 대기 상태 유지
        Content.updateContent(item.id, { status: '대기' });
        console.log(`[Content] AI 생성 실패 (대기 유지): ${item.keyword} — ${result?.error || 'unknown'}`);
      }
    }).catch(err => {
      Content.updateContent(item.id, { status: '대기' });
      console.error(`[Content] AI 생성 에러: ${item.keyword}`, err.message);
    });
  }
});

// POST /api/contents/:id/callback — Python 서버에서 결과 수신 (내부 콜백)
router.post('/contents/:id/callback', (req, res) => {
  const { title, body, grade, tags, review } = req.body;
  const item = Content.updateContent(req.params.id, {
    title: title || undefined,
    body: body || undefined,
    grade: grade || 'B',
    status: grade === 'D' ? '저품질' : '검수완료',
  });
  if (!item) return res.status(404).json({ success: false });
  console.log(`[Callback] 콘텐츠 업데이트: ${item.keyword} → ${grade}`);
  res.json({ success: true });
});

// GET /api/contents — 대기열 조회
router.get('/contents', (req, res) => {
  res.json({ success: true, contents: Content.listContents() });
});

// GET /api/contents/:id — 상세 조회
router.get('/contents/:id', (req, res) => {
  const item = Content.getContent(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
  res.json({ success: true, content: item });
});

// PATCH /api/contents/:id — 수정
router.patch('/contents/:id', (req, res) => {
  const item = Content.updateContent(req.params.id, req.body);
  if (!item) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
  res.json({ success: true, content: item });
});

// DELETE /api/contents/:id — 삭제
router.delete('/contents/:id', (req, res) => {
  const ok = Content.deleteContent(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
  res.json({ success: true, message: '삭제되었습니다.' });
});

// POST /api/contents/generate-all — 대기 콘텐츠 일괄 AI 생성
router.post('/contents/generate-all', async (req, res) => {
  require('dotenv').config();
  const settings = getSettingsRaw();
  const apiKey = settings.claudeApiKey || process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';

  if (!apiKey) {
    return res.status(400).json({ success: false, message: 'API 키가 설정되지 않았습니다.' });
  }

  const pending = Content.listContents().filter(c => c.status === '대기');
  if (pending.length === 0) {
    return res.json({ success: true, message: '대기 중인 콘텐츠가 없습니다.', count: 0 });
  }

  const CONCURRENCY = parseInt(req.body?.concurrency || req.query?.concurrency || '5', 10);

  res.json({
    success: true,
    message: `${pending.length}개 콘텐츠 AI 생성 시작 (동시 ${CONCURRENCY}개 병렬)`,
    count: pending.length,
    concurrency: CONCURRENCY,
  });

  // 단일 아이템 생성 함수
  async function generateOne(item) {
    Content.updateContent(item.id, { status: '생성중' });
    try {
      const result = await requestGenerate({
        content_id: item.id,
        keyword: item.keyword,
        tone: item.tone || '친근톤',
        content_type: item.contentType || '일반 정보성',
        product_info: item.productInfo || '',
        api_key: apiKey,
      });
      if (result && result.title) {
        Content.updateContent(item.id, {
          title: result.title,
          body: result.body || '',
          grade: result.grade || 'B',
          status: result.grade === 'D' ? '저품질' : '검수완료',
        });
        console.log(`[Content] ✓ ${item.keyword} → ${result.title}`);
      } else {
        Content.updateContent(item.id, { status: '대기' });
        console.log(`[Content] ✗ ${item.keyword} — ${result?.error || 'unknown'}`);
      }
    } catch (err) {
      Content.updateContent(item.id, { status: '대기' });
      console.error(`[Content] ✗ ${item.keyword}:`, err.message);
    }
  }

  // 병렬 풀 — CONCURRENCY개씩 동시 실행
  (async () => {
    const queue = [...pending];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await generateOne(item);
      }
    });
    await Promise.all(workers);
    console.log(`[Content] 병렬 일괄 생성 완료 (총 ${pending.length}건)`);
  })();
});

// POST /api/contents/reset-stuck — 발행중 상태 잠긴 콘텐츠를 검수완료로 복원
router.post('/contents/reset-stuck', (req, res) => {
  const stuck = Content.listContents().filter(c => c.status === '발행중');
  let restored = 0;
  for (const item of stuck) {
    // 본문이 있으면 검수완료로, 없으면 대기로
    const newStatus = (item.body && item.body.length > 50) ? '검수완료' : '대기';
    Content.updateContent(item.id, { status: newStatus });
    restored++;
  }
  res.json({ success: true, message: `${restored}건 복원됨`, restored });
});

// POST /api/contents/check-duplicate — 중복 체크
router.post('/contents/check-duplicate', async (req, res) => {
  const { title, keywords } = req.body;
  if (!title) return res.status(400).json({ success: false, message: '제목을 입력하세요.' });
  const result = await checkDuplicate({ title, keywords });
  res.json({ success: true, ...result });
});

// POST /api/contents/:id/regenerate — 재생성
router.post('/contents/:id/regenerate', async (req, res) => {
  const item = Content.getContent(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });

  Content.updateContent(req.params.id, { status: '생성중', grade: null, body: '' });
  res.json({ success: true, message: '재생성이 시작되었습니다.' });

  // 백그라운드 AI 재생성
  const settings = getSettingsRaw();
  const apiKey = settings.claudeApiKey || process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';

  requestGenerate({
    content_id: item.id,
    keyword: item.keyword,
    tone: item.tone || '친근톤',
    content_type: item.contentType || '일반 정보성',
    product_info: item.productInfo || '',
    api_key: apiKey,
  }).then(result => {
    if (result && result.title) {
      Content.updateContent(item.id, {
        title: result.title,
        body: result.body || '',
        grade: result.grade || 'B',
        status: result.grade === 'D' ? '저품질' : '검수완료',
      });
    } else {
      Content.updateContent(item.id, { status: '대기' });
    }
  }).catch(() => {
    Content.updateContent(item.id, { status: '대기' });
  });
});

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const SEOAgent = require('../agents/SEOAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();

// 사용자별 SEO 에이전트 저장소
const agents = new Map();

// POST /api/seo/agents - SEO 에이전트 생성
router.post('/seo/agents', authenticate, (req, res, next) => {
  try {
    const { name, backstory } = req.body;
    const agent = new SEOAgent({ name, backstory });
    const userAgents = agents.get(req.user.id) || [];
    userAgents.push(agent);
    agents.set(req.user.id, userAgents);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/seo/agents - 내 SEO 에이전트 목록
router.get('/seo/agents', authenticate, (req, res) => {
  const list = (agents.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agents: list, count: list.length } });
});

// --- 전체 SEO 파이프라인 ---

// POST /api/seo/agents/:id/optimize - 전체 SEO 최적화 (트렌드 + 제목 + 태그 → 청사진)
router.post('/seo/agents/:id/optimize', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('SEO 에이전트를 찾을 수 없습니다.', 404));

    const { keyword } = req.body;
    if (!keyword) throw new AppError('최적화할 키워드(keyword)는 필수입니다.', 400);

    const task = new Task({
      description: `[${keyword}] SEO 최적화`,
      expectedOutput: 'SEO 최적화 청사진',
      agent,
      priority: 'high',
    });

    const result = await agent.execute(task);
    task.complete(result);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 개별 도구 API ---

// POST /api/seo/agents/:id/trend - 트렌드 분석만
router.post('/seo/agents/:id/trend', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('SEO 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, includeRelated, months } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const result = await agent.analyzeTrend(keyword, { includeRelated, months });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/seo/agents/:id/title - 제목 최적화만
router.post('/seo/agents/:id/title', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('SEO 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, subKeywords, style, count } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const result = await agent.optimizeTitle(keyword, { subKeywords, style, count });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/seo/agents/:id/tags - 태그/카테고리/키워드배치 추천만
router.post('/seo/agents/:id/tags', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('SEO 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, subKeywords, imageCount, contentLength } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const result = await agent.recommendTags(keyword, { subKeywords, imageCount, contentLength });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 헬퍼 ---

function findAgent(userId, agentId) {
  const userAgents = agents.get(userId) || [];
  return userAgents.find(a => a.id === agentId) || null;
}

module.exports = router;

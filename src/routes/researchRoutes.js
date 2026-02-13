const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const ResearchAgent = require('../agents/ResearchAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();

// 사용자별 리서치 에이전트 저장소
const agents = new Map();

// POST /api/research/agents - 리서치 에이전트 생성
router.post('/research/agents', authenticate, (req, res, next) => {
  try {
    const { name, backstory } = req.body;
    const agent = new ResearchAgent({ name, backstory });
    const userAgents = agents.get(req.user.id) || [];
    userAgents.push(agent);
    agents.set(req.user.id, userAgents);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/research/agents - 내 리서치 에이전트 목록
router.get('/research/agents', authenticate, (req, res) => {
  const list = (agents.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agents: list, count: list.length } });
});

// --- 전체 리서치 파이프라인 ---

// POST /api/research/agents/:id/run - 전체 리서치 실행 (크롤링 + 블로그 + 리뷰 → 리포트)
router.post('/research/agents/:id/run', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리서치 에이전트를 찾을 수 없습니다.', 404));

    const { keyword } = req.body;
    if (!keyword) throw new AppError('리서치할 키워드(keyword)는 필수입니다.', 400);

    const task = new Task({
      description: `[${keyword}] 종합 리서치`,
      expectedOutput: '상품 리서치 리포트',
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

// POST /api/research/agents/:id/crawl - 상품 크롤링만
router.post('/research/agents/:id/crawl', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리서치 에이전트를 찾을 수 없습니다.', 404));

    const { query, sources, maxResults } = req.body;
    if (!query) throw new AppError('검색 키워드(query)는 필수입니다.', 400);

    const result = await agent.crawlProducts(query, { sources, maxResults });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/research/agents/:id/blog - 블로그 분석만
router.post('/research/agents/:id/blog', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리서치 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, platform, topN } = req.body;
    if (!keyword) throw new AppError('분석할 키워드(keyword)는 필수입니다.', 400);

    const result = await agent.analyzeBlogs(keyword, { platform, topN });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/research/agents/:id/reviews - 리뷰 요약만
router.post('/research/agents/:id/reviews', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리서치 에이전트를 찾을 수 없습니다.', 404));

    const { productName, source, maxReviews } = req.body;
    if (!productName) throw new AppError('상품명(productName)은 필수입니다.', 400);

    const result = await agent.summarizeReviews(productName, { source, maxReviews });
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

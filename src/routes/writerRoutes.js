const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const WriterAgent = require('../agents/WriterAgent');
const ResearchAgent = require('../agents/ResearchAgent');
const SEOAgent = require('../agents/SEOAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();

// 사용자별 에이전트 저장소
const writerAgents = new Map();

// POST /api/writer/agents - 라이터 에이전트 생성
router.post('/writer/agents', authenticate, (req, res, next) => {
  try {
    const { name, backstory } = req.body;
    const agent = new WriterAgent({ name, backstory });
    const list = writerAgents.get(req.user.id) || [];
    list.push(agent);
    writerAgents.set(req.user.id, list);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/writer/agents - 내 라이터 에이전트 목록
router.get('/writer/agents', authenticate, (req, res) => {
  const list = (writerAgents.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agents: list, count: list.length } });
});

// --- 전체 글 작성 파이프라인 ---

// POST /api/writer/agents/:id/write - 글 작성 (리서치+SEO 데이터를 받아서)
router.post('/writer/agents/:id/write', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('라이터 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, researchData, seoData, tone, platform, partnerId } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const task = new Task({
      description: `[${keyword}] 블로그 글 작성`,
      expectedOutput: '네이버 블로그 최적화 글',
      agent,
      context: { researchData: researchData || {}, seoData: seoData || {}, tone, platform, partnerId },
      priority: 'high',
    });

    const result = await agent.execute(task);
    task.complete(result);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 풀 파이프라인: 리서치 → SEO → 글 작성 한방에 ---

// POST /api/writer/agents/:id/full-pipeline - 리서치+SEO+글작성 자동 실행
router.post('/writer/agents/:id/full-pipeline', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('라이터 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, tone, platform, partnerId } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const pipelinePhases = [];

    // Step 1: 리서치 에이전트 실행
    const researcher = new ResearchAgent();
    const researchTask = new Task({
      description: `[${keyword}] 종합 리서치`,
      expectedOutput: '상품 리서치 리포트',
      agent: researcher,
    });
    const researchResult = await researcher.execute(researchTask);
    pipelinePhases.push({ step: '리서치', status: 'completed', agent: '리서치 에이전트' });

    // Step 2: SEO 에이전트 실행
    const seoAgent = new SEOAgent();
    const seoTask = new Task({
      description: `[${keyword}] SEO 최적화`,
      expectedOutput: 'SEO 청사진',
      agent: seoAgent,
    });
    const seoResult = await seoAgent.execute(seoTask);
    pipelinePhases.push({ step: 'SEO 분석', status: 'completed', agent: 'SEO 에이전트' });

    // Step 3: 라이터 에이전트 실행 (리서치+SEO 결과를 컨텍스트로)
    const writeTask = new Task({
      description: `[${keyword}] 블로그 글 작성`,
      expectedOutput: '네이버 블로그 최적화 글',
      agent,
      context: {
        researchData: researchResult,
        seoData: seoResult.rawData?.trend || {},
        tone: tone || 'friendly',
        platform: platform || 'coupang',
        partnerId: partnerId || 'dailyfni',
      },
      priority: 'high',
    });
    const writeResult = await agent.execute(writeTask);
    pipelinePhases.push({ step: '글 작성', status: 'completed', agent: '라이터 에이전트' });

    res.json({
      success: true,
      data: {
        keyword,
        pipeline: pipelinePhases,
        article: writeResult.article,
        qualityReport: writeResult.qualityReport,
        seoBlueprint: seoResult.blueprint?.sections?.slice(0, 3) || [],
        researchHighlights: {
          productsFound: researchResult.report?.sections?.[0]?.content || {},
          priceRange: researchResult.rawData?.crawl?.analysis?.priceAnalysis || {},
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 개별 도구 API ---

// POST /api/writer/agents/:id/content - 본문 템플릿만 생성
router.post('/writer/agents/:id/content', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('라이터 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, products, seoData, style, tone } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const result = await agent.generateContent(keyword, { products, seoData, style, tone });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/writer/agents/:id/affiliate - 어필리에이트 링크만 생성
router.post('/writer/agents/:id/affiliate', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('라이터 에이전트를 찾을 수 없습니다.', 404));

    const { products, platform, partnerId, content } = req.body;
    const result = await agent.insertAffiliateLinks(products || [], { platform, partnerId, content });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/writer/agents/:id/check - 톤/SEO 점검만
router.post('/writer/agents/:id/check', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('라이터 에이전트를 찾을 수 없습니다.', 404));

    const { content, keyword, targetLength } = req.body;
    if (!content || !keyword) throw new AppError('본문(content)과 키워드(keyword)는 필수입니다.', 400);

    const result = await agent.checkStyle(content, keyword, { targetLength });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 헬퍼 ---

function findAgent(userId, agentId) {
  const list = writerAgents.get(userId) || [];
  return list.find(a => a.id === agentId) || null;
}

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const ImageAgent = require('../agents/ImageAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();

const agents = new Map();

// POST /api/image/agents - 이미지 에이전트 생성
router.post('/image/agents', authenticate, (req, res, next) => {
  try {
    const { name, backstory } = req.body;
    const agent = new ImageAgent({ name, backstory });
    const list = agents.get(req.user.id) || [];
    list.push(agent);
    agents.set(req.user.id, list);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/image/agents - 내 이미지 에이전트 목록
router.get('/image/agents', authenticate, (req, res) => {
  const list = (agents.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agents: list, count: list.length } });
});

// --- 전체 이미지 파이프라인 ---

// POST /api/image/agents/:id/generate - 이미지 패키지 전체 생성
router.post('/image/agents/:id/generate', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('이미지 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, products, title, style, blogName, accentColor } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const task = new Task({
      description: `[${keyword}] 이미지 패키지 생성`,
      expectedOutput: '블로그 이미지 패키지',
      agent,
      context: { products: products || [], title, style, blogName, accentColor },
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

// POST /api/image/agents/:id/collect - 상품 이미지 수집만
router.post('/image/agents/:id/collect', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('이미지 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, products, imagePerProduct, blogName } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const result = await agent.collectImages(keyword, { products, imagePerProduct, blogName });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/image/agents/:id/thumbnails - 썸네일/배너만
router.post('/image/agents/:id/thumbnails', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('이미지 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, title, style, blogName, accentColor } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const result = await agent.generateThumbnails(keyword, { title, style, blogName, accentColor });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/image/agents/:id/infographics - 인포그래픽만
router.post('/image/agents/:id/infographics', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('이미지 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, products, types, accentColor } = req.body;
    if (!keyword) throw new AppError('키워드(keyword)는 필수입니다.', 400);

    const result = await agent.buildInfographics(keyword, { products, types, accentColor });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// GET /api/image/agents/:id/svg/:filename - SVG 파일 직접 렌더링
router.get('/image/agents/:id/svg/:filename', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('이미지 에이전트를 찾을 수 없습니다.', 404));

    // 메모리에서 최근 생성된 SVG 검색
    const svgEntry = agent.memory
      .filter(m => m.type === 'image_complete')
      .pop();

    if (!svgEntry) {
      return next(new AppError('생성된 이미지가 없습니다. 먼저 이미지를 생성하세요.', 404));
    }

    // 데모용: 기본 SVG 반환
    const keyword = svgEntry.keyword || '상품';
    const result = await agent.generateThumbnails(keyword, {});
    const svg = result.images.ogThumbnail?.svg;

    if (svg) {
      res.set('Content-Type', 'image/svg+xml');
      return res.send(svg);
    }

    next(new AppError('SVG 파일을 찾을 수 없습니다.', 404));
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

function findAgent(userId, agentId) {
  const list = agents.get(userId) || [];
  return list.find(a => a.id === agentId) || null;
}

module.exports = router;

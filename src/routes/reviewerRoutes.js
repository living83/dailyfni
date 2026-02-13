const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const ReviewerAgent = require('../agents/ReviewerAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();

const agents = new Map();

// POST /api/reviewer/agents - 리뷰어 에이전트 생성
router.post('/reviewer/agents', authenticate, (req, res, next) => {
  try {
    const { name, backstory } = req.body;
    const agent = new ReviewerAgent({ name, backstory });
    const list = agents.get(req.user.id) || [];
    list.push(agent);
    agents.set(req.user.id, list);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/reviewer/agents - 내 리뷰어 에이전트 목록
router.get('/reviewer/agents', authenticate, (req, res) => {
  const list = (agents.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agents: list, count: list.length } });
});

// --- 전체 검수 파이프라인 ---

// POST /api/reviewer/agents/:id/review - 전체 검수
router.post('/reviewer/agents/:id/review', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리뷰어 에이전트를 찾을 수 없습니다.', 404));

    const { content, keyword, researchData, strictLevel } = req.body;
    if (!content) throw new AppError('검수할 본문(content)은 필수입니다.', 400);

    const task = new Task({
      description: `[${keyword || '글'}] 품질 검수`,
      expectedOutput: '품질 검수 리포트',
      agent,
      context: { content, keyword, researchData, strictLevel },
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

// POST /api/reviewer/agents/:id/spelling - 맞춤법만
router.post('/reviewer/agents/:id/spelling', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리뷰어 에이전트를 찾을 수 없습니다.', 404));

    const { content, strictLevel } = req.body;
    if (!content) throw new AppError('본문(content)은 필수입니다.', 400);

    const result = await agent.checkSpelling(content, { strictLevel });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/reviewer/agents/:id/facts - 사실 확인만
router.post('/reviewer/agents/:id/facts', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리뷰어 에이전트를 찾을 수 없습니다.', 404));

    const { content, researchData, keyword } = req.body;
    if (!content) throw new AppError('본문(content)은 필수입니다.', 400);

    const result = await agent.checkFacts(content, { researchData, keyword });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/reviewer/agents/:id/duplicate - 중복 체크만
router.post('/reviewer/agents/:id/duplicate', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('리뷰어 에이전트를 찾을 수 없습니다.', 404));

    const { content, keyword } = req.body;
    if (!content) throw new AppError('본문(content)은 필수입니다.', 400);

    const result = await agent.checkDuplicate(content, { keyword });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

function findAgent(userId, agentId) {
  const list = agents.get(userId) || [];
  return list.find(a => a.id === agentId) || null;
}

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const PublisherAgent = require('../agents/PublisherAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();

const agents = new Map();

// POST /api/publisher/agents - 퍼블리셔 에이전트 생성
router.post('/publisher/agents', authenticate, (req, res, next) => {
  try {
    const { name, backstory, blogId } = req.body;
    const agent = new PublisherAgent({ name, backstory, blogId });
    const list = agents.get(req.user.id) || [];
    list.push(agent);
    agents.set(req.user.id, list);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/publisher/agents - 내 퍼블리셔 에이전트 목록
router.get('/publisher/agents', authenticate, (req, res) => {
  const list = (agents.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agents: list, count: list.length } });
});

// --- 전체 발행 파이프라인 ---

// POST /api/publisher/agents/:id/publish - 전체 발행
router.post('/publisher/agents/:id/publish', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('퍼블리셔 에이전트를 찾을 수 없습니다.', 404));

    const { title, content, category, tags, thumbnailUrl, publishMode, scheduledAt, blogId, skipVerify } = req.body;
    if (!title) throw new AppError('제목(title)은 필수입니다.', 400);
    if (!content) throw new AppError('본문(content)은 필수입니다.', 400);

    const task = new Task({
      description: `[${title.substring(0, 20)}] 블로그 발행`,
      expectedOutput: '발행 결과 리포트',
      agent,
      context: {
        title, content, category, tags, thumbnailUrl,
        publishMode, scheduledAt, blogId, skipVerify,
        userId: req.user.id,
      },
      priority: 'high',
    });

    const result = await agent.execute(task);
    task.complete(result);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 예약 발행 관리 API ---

// GET /api/publisher/agents/:id/schedule/analyze - 최적 발행 시간 분석
router.get('/publisher/agents/:id/schedule/analyze', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('퍼블리셔 에이전트를 찾을 수 없습니다.', 404));

    const { keyword, category } = req.query;
    const result = await agent.analyzeSchedule(keyword || '', category || '');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// GET /api/publisher/agents/:id/schedule - 예약 목록 조회
router.get('/publisher/agents/:id/schedule', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('퍼블리셔 에이전트를 찾을 수 없습니다.', 404));

    const result = await agent.listSchedules(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/publisher/agents/:id/schedule - 예약 등록
router.post('/publisher/agents/:id/schedule', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('퍼블리셔 에이전트를 찾을 수 없습니다.', 404));

    const { postId, scheduledAt, keyword } = req.body;
    if (!postId) throw new AppError('postId는 필수입니다.', 400);
    if (!scheduledAt) throw new AppError('scheduledAt은 필수입니다.', 400);

    const result = await agent.addSchedule(postId, scheduledAt, keyword || '', req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// DELETE /api/publisher/agents/:id/schedule/:postId - 예약 취소
router.delete('/publisher/agents/:id/schedule/:postId', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('퍼블리셔 에이전트를 찾을 수 없습니다.', 404));

    const result = await agent.cancelSchedule(req.params.postId, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// POST /api/publisher/agents/:id/schedule/optimize - 스케줄 최적화
router.post('/publisher/agents/:id/schedule/optimize', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('퍼블리셔 에이전트를 찾을 수 없습니다.', 404));

    const { category } = req.body;
    const result = await agent.optimizeSchedule(req.user.id, category || '');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 발행 후 검증 API ---

// POST /api/publisher/agents/:id/verify - 게시물 검증
router.post('/publisher/agents/:id/verify', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('퍼블리셔 에이전트를 찾을 수 없습니다.', 404));

    const { postUrl, postId, expectedTitle, expectedTags, expectedCategory } = req.body;
    if (!postUrl && !postId) throw new AppError('postUrl 또는 postId가 필수입니다.', 400);

    const result = await agent.verifyPost({ postUrl, postId, expectedTitle, expectedTags, expectedCategory });
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

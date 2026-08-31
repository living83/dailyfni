const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const LegalComplianceAgent = require('../agents/LegalComplianceAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();
const legalAgents = new Map();

// POST /api/legal/agents - 법적 규정 에이전트 생성
router.post('/legal/agents', authenticate, (req, res, next) => {
  try {
    const { name } = req.body;
    const agent = new LegalComplianceAgent({ name });
    const list = legalAgents.get(req.user.id) || [];
    list.push(agent);
    legalAgents.set(req.user.id, list);
    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) { next(err); }
});

// GET /api/legal/agents - 에이전트 목록
router.get('/legal/agents', authenticate, (req, res) => {
  const list = (legalAgents.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agents: list, count: list.length } });
});

// POST /api/legal/agents/:id/check - 콘텐츠 법적 검사
router.post('/legal/agents/:id/check', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('에이전트를 찾을 수 없습니다.', 404));

    const { content, contentType, areaCode, companyInfo } = req.body;
    if (!content) throw new AppError('content는 필수입니다.', 400);

    const task = new Task({
      description: `법적 규정 검사 (${contentType || 'page'})`,
      expectedOutput: '법적 검증 리포트',
      agent,
      context: { action: 'fullCheck', content, contentType, areaCode, companyInfo },
      priority: 'high',
    });
    const result = await agent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/legal/agents/:id/generate-notice - 법적 고지 문구 생성
router.post('/legal/agents/:id/generate-notice', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('에이전트를 찾을 수 없습니다.', 404));

    const { areaCode, companyInfo } = req.body;
    const task = new Task({
      description: `법적 고지 문구 생성 (${areaCode || 'common'})`,
      expectedOutput: '법적 고지 문구',
      agent,
      context: { action: 'generateNotice', areaCode, companyInfo },
    });
    const result = await agent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/legal/agents/:id/templates - 고지 템플릿 조회
router.get('/legal/agents/:id/templates', authenticate, async (req, res, next) => {
  try {
    const agent = findAgent(req.user.id, req.params.id);
    if (!agent) return next(new AppError('에이전트를 찾을 수 없습니다.', 404));

    const { areaCode } = req.query;
    const task = new Task({
      description: '고지 템플릿 조회',
      agent,
      context: { action: 'getTemplate', areaCode: areaCode || 'all' },
    });
    const result = await agent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

function findAgent(userId, agentId) {
  return (legalAgents.get(userId) || []).find(a => a.id === agentId);
}

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Agent = require('../core/Agent');
const Task = require('../core/Task');
const Agency = require('../core/Agency');
const CalculatorTool = require('../tools/CalculatorTool');
const TextTool = require('../tools/TextTool');
const DateTimeTool = require('../tools/DateTimeTool');
const AppError = require('../utils/AppError');

const router = Router();

// 사용자별 에이전시 저장소
const agencies = new Map();

// 사용 가능한 도구 레지스트리
const toolRegistry = {
  calculator: () => new CalculatorTool(),
  text_processor: () => new TextTool(),
  datetime: () => new DateTimeTool(),
};

// --- 에이전시 CRUD ---

// POST /api/agencies - 에이전시 생성
router.post('/agencies', authenticate, (req, res, next) => {
  try {
    const { name, description, strategy } = req.body;
    if (!name) throw new AppError('에이전시 이름은 필수입니다.', 400);

    const agency = new Agency({ name, description, strategy });
    const userAgencies = agencies.get(req.user.id) || [];
    userAgencies.push(agency);
    agencies.set(req.user.id, userAgencies);

    res.status(201).json({ success: true, data: agency.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/agencies - 내 에이전시 목록
router.get('/agencies', authenticate, (req, res) => {
  const userAgencies = (agencies.get(req.user.id) || []).map(a => a.toJSON());
  res.json({ success: true, data: { agencies: userAgencies, count: userAgencies.length } });
});

// GET /api/agencies/:id - 에이전시 상세
router.get('/agencies/:id', authenticate, (req, res, next) => {
  const agency = findAgency(req.user.id, req.params.id);
  if (!agency) return next(new AppError('에이전시를 찾을 수 없습니다.', 404));
  res.json({ success: true, data: agency.toJSON() });
});

// --- 에이전트 관리 ---

// POST /api/agencies/:id/agents - 에이전시에 에이전트 추가
router.post('/agencies/:id/agents', authenticate, (req, res, next) => {
  try {
    const agency = findAgency(req.user.id, req.params.id);
    if (!agency) return next(new AppError('에이전시를 찾을 수 없습니다.', 404));

    const { name, role, goal, backstory, tools: toolNames = [], model } = req.body;
    if (!name || !role || !goal) {
      throw new AppError('에이전트 이름, 역할, 목표는 필수입니다.', 400);
    }

    const tools = toolNames
      .filter(t => toolRegistry[t])
      .map(t => toolRegistry[t]());

    const agent = new Agent({ name, role, goal, backstory, tools, model });
    agency.addAgent(agent);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// --- 태스크 관리 ---

// POST /api/agencies/:id/tasks - 에이전시에 태스크 추가
router.post('/agencies/:id/tasks', authenticate, (req, res, next) => {
  try {
    const agency = findAgency(req.user.id, req.params.id);
    if (!agency) return next(new AppError('에이전시를 찾을 수 없습니다.', 404));

    const { description, expectedOutput, agentId, priority } = req.body;
    if (!description) throw new AppError('태스크 설명은 필수입니다.', 400);

    const agent = agentId ? agency.agents.find(a => a.id === agentId) : null;
    const task = new Task({ description, expectedOutput, agent, priority });
    agency.addTask(task);

    res.status(201).json({ success: true, data: task.toJSON() });
  } catch (err) {
    next(err);
  }
});

// --- 에이전시 실행 ---

// POST /api/agencies/:id/run - 에이전시 실행
router.post('/agencies/:id/run', authenticate, async (req, res, next) => {
  try {
    const agency = findAgency(req.user.id, req.params.id);
    if (!agency) return next(new AppError('에이전시를 찾을 수 없습니다.', 404));

    if (agency.agents.length === 0) {
      throw new AppError('에이전시에 에이전트가 없습니다.', 400);
    }
    if (agency.tasks.length === 0) {
      throw new AppError('에이전시에 태스크가 없습니다.', 400);
    }

    const results = await agency.run();
    res.json({ success: true, data: { status: agency.status, results } });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// --- 도구 목록 ---

// GET /api/tools - 사용 가능한 도구 목록
router.get('/tools', authenticate, (req, res) => {
  const tools = Object.entries(toolRegistry).map(([key, factory]) => {
    const instance = factory();
    return { key, ...instance.toSchema() };
  });
  res.json({ success: true, data: { tools } });
});

// --- 헬퍼 ---

function findAgency(userId, agencyId) {
  const userAgencies = agencies.get(userId) || [];
  return userAgencies.find(a => a.id === agencyId) || null;
}

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Planner = require('../core/Planner');
const Agent = require('../core/Agent');
const { addProduct, getActiveProducts, getAllProducts, getProduct, removeProduct } = require('../models/Product');
const AppError = require('../utils/AppError');

const router = Router();

// 사용자별 플래너 저장소
const planners = new Map();

// --- 기본 워크플로우 스텝 템플릿 ---
const DEFAULT_WORKFLOW = [
  { name: '리서치', description: '상품 관련 최신 정보 조사', requiredRole: '리서처', estimatedMinutes: 30 },
  { name: '분석', description: '수집된 정보 분석 및 인사이트 도출', requiredRole: '분석가', estimatedMinutes: 25 },
  { name: '콘텐츠 작성', description: '분석 결과 기반 콘텐츠 초안 작성', requiredRole: '라이터', estimatedMinutes: 40, dependsOn: ['리서치', '분석'] },
  { name: '검수', description: '작성된 콘텐츠 품질 검토', requiredRole: '에디터', estimatedMinutes: 20, dependsOn: ['콘텐츠 작성'] },
  { name: '발행', description: '최종 콘텐츠 발행', requiredRole: '퍼블리셔', estimatedMinutes: 10, dependsOn: ['검수'] },
];

// ========== 상품 관리 ==========

// POST /api/products - 상품 등록
router.post('/products', authenticate, (req, res, next) => {
  try {
    const { name, category, description, priority, tags } = req.body;
    if (!name || !category) throw new AppError('상품 이름과 카테고리는 필수입니다.', 400);
    const product = addProduct({ name, category, description, priority, tags });
    res.status(201).json({ success: true, data: product.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/products - 상품 목록
router.get('/products', authenticate, (req, res) => {
  const all = getAllProducts().map(p => p.toJSON());
  res.json({ success: true, data: { products: all, count: all.length } });
});

// DELETE /api/products/:id - 상품 삭제
router.delete('/products/:id', authenticate, (req, res, next) => {
  if (!removeProduct(req.params.id)) return next(new AppError('상품을 찾을 수 없습니다.', 404));
  res.json({ success: true, message: '상품이 삭제되었습니다.' });
});

// ========== 플래너 관리 ==========

// POST /api/planners - 플래너 생성
router.post('/planners', authenticate, (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) throw new AppError('플래너 이름은 필수입니다.', 400);

    const planner = new Planner({ name, description });
    const userPlanners = planners.get(req.user.id) || [];
    userPlanners.push(planner);
    planners.set(req.user.id, userPlanners);

    res.status(201).json({ success: true, data: planner.getSummary() });
  } catch (err) {
    next(err);
  }
});

// GET /api/planners - 내 플래너 목록
router.get('/planners', authenticate, (req, res) => {
  const list = (planners.get(req.user.id) || []).map(p => p.getSummary());
  res.json({ success: true, data: { planners: list, count: list.length } });
});

// GET /api/planners/:id - 플래너 상세
router.get('/planners/:id', authenticate, (req, res, next) => {
  const planner = findPlanner(req.user.id, req.params.id);
  if (!planner) return next(new AppError('플래너를 찾을 수 없습니다.', 404));
  res.json({ success: true, data: planner.toJSON() });
});

// ========== 에이전트 등록 ==========

// POST /api/planners/:id/agents - 플래너에 에이전트 등록
router.post('/planners/:id/agents', authenticate, (req, res, next) => {
  try {
    const planner = findPlanner(req.user.id, req.params.id);
    if (!planner) return next(new AppError('플래너를 찾을 수 없습니다.', 404));

    const { name, role, goal, backstory } = req.body;
    if (!name || !role || !goal) throw new AppError('에이전트 이름, 역할, 목표는 필수입니다.', 400);

    const agent = new Agent({ name, role, goal, backstory });
    planner.registerAgent(agent);

    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) {
    next(err);
  }
});

// ========== 일일 계획 ==========

// POST /api/planners/:id/plan - 일일 계획 수립
router.post('/planners/:id/plan', authenticate, (req, res, next) => {
  try {
    const planner = findPlanner(req.user.id, req.params.id);
    if (!planner) return next(new AppError('플래너를 찾을 수 없습니다.', 404));

    const products = getActiveProducts();
    if (products.length === 0) throw new AppError('등록된 활성 상품이 없습니다.', 400);
    if (planner.agents.length === 0) throw new AppError('등록된 에이전트가 없습니다.', 400);

    const workflowSteps = req.body.workflowSteps || DEFAULT_WORKFLOW;
    const plan = planner.createDailyPlan({ products, workflowSteps });

    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
});

// POST /api/planners/:id/plan/:planId/execute - 계획 실행
router.post('/planners/:id/plan/:planId/execute', authenticate, async (req, res, next) => {
  try {
    const planner = findPlanner(req.user.id, req.params.id);
    if (!planner) return next(new AppError('플래너를 찾을 수 없습니다.', 404));

    const result = await planner.executePlan(req.params.planId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
});

// GET /api/planners/:id/plan/:planId - 계획 조회
router.get('/planners/:id/plan/:planId', authenticate, (req, res, next) => {
  const planner = findPlanner(req.user.id, req.params.id);
  if (!planner) return next(new AppError('플래너를 찾을 수 없습니다.', 404));

  const plan = planner.getPlan(req.params.planId);
  if (!plan) return next(new AppError('계획을 찾을 수 없습니다.', 404));

  res.json({ success: true, data: plan });
});

// GET /api/planners/:id/latest - 최신 계획 조회
router.get('/planners/:id/latest', authenticate, (req, res, next) => {
  const planner = findPlanner(req.user.id, req.params.id);
  if (!planner) return next(new AppError('플래너를 찾을 수 없습니다.', 404));

  const plan = planner.getLatestPlan();
  if (!plan) return next(new AppError('아직 생성된 계획이 없습니다.', 404));

  res.json({ success: true, data: plan });
});

// GET /api/workflow-templates - 워크플로우 템플릿 조회
router.get('/workflow-templates', authenticate, (req, res) => {
  res.json({ success: true, data: { default: DEFAULT_WORKFLOW } });
});

// --- 헬퍼 ---

function findPlanner(userId, plannerId) {
  const userPlanners = planners.get(userId) || [];
  return userPlanners.find(p => p.id === plannerId) || null;
}

module.exports = router;

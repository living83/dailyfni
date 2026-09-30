const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const WebDesignerAgent = require('../agents/WebDesignerAgent');
const Task = require('../core/Task');

const router = Router();
const designerAgent = new WebDesignerAgent();

// GET /api/design/system - 디자인 시스템 조회
router.get('/design/system', authenticate, async (req, res, next) => {
  try {
    const task = new Task({
      description: '디자인 시스템 조회',
      agent: designerAgent,
      context: { action: 'getDesignSystem' },
    });
    const result = await designerAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/design/layout/:pageType - 페이지 레이아웃 조회
router.get('/design/layout/:pageType', authenticate, async (req, res, next) => {
  try {
    const { device } = req.query;
    const task = new Task({
      description: `${req.params.pageType} 레이아웃 조회`,
      agent: designerAgent,
      context: { action: 'getLayout', pageType: req.params.pageType, device },
    });
    const result = await designerAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/design/responsive/:pageType - 반응형 가이드
router.get('/design/responsive/:pageType', authenticate, async (req, res, next) => {
  try {
    const task = new Task({
      description: `${req.params.pageType} 반응형 가이드`,
      agent: designerAgent,
      context: { action: 'getResponsive', pageType: req.params.pageType },
    });
    const result = await designerAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/design/a11y/:pageType - 접근성 검증
router.get('/design/a11y/:pageType', authenticate, async (req, res, next) => {
  try {
    const task = new Task({
      description: `${req.params.pageType} 접근성 검증`,
      agent: designerAgent,
      context: { action: 'checkA11y', pageType: req.params.pageType },
    });
    const result = await designerAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/design/cro/:pageType - CRO 가이드
router.get('/design/cro/:pageType', authenticate, async (req, res, next) => {
  try {
    const task = new Task({
      description: `${req.params.pageType} CRO 가이드`,
      agent: designerAgent,
      context: { action: 'getCROGuide', pageType: req.params.pageType },
    });
    const result = await designerAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// POST /api/design/full-guide - 전체 디자인 가이드
router.post('/design/full-guide', authenticate, async (req, res, next) => {
  try {
    const { pageType = 'main', device = 'all' } = req.body;
    const task = new Task({
      description: `${pageType} 전체 디자인 가이드`,
      agent: designerAgent,
      context: { action: 'fullDesignGuide', pageType, device },
    });
    const result = await designerAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// POST /api/design/review - 디자인 리뷰
router.post('/design/review', authenticate, async (req, res, next) => {
  try {
    const { pageType, designDescription } = req.body;
    const task = new Task({
      description: `${pageType || 'main'} 디자인 리뷰`,
      agent: designerAgent,
      context: { action: 'reviewDesign', pageType, designDescription },
      priority: 'high',
    });
    const result = await designerAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

module.exports = router;

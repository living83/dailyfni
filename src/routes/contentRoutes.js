const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const ContentManagerAgent = require('../agents/ContentManagerAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();

// 싱글턴 에이전트
const contentAgent = new ContentManagerAgent();

// ─── 공개 API ───

// GET /api/content/sections - 메인 섹션 목록 (고객용)
router.get('/content/sections', async (req, res, next) => {
  try {
    const task = new Task({ description: '메인 섹션 조회', agent: contentAgent, context: { action: 'getSections' } });
    const result = await contentAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output.result });
  } catch (err) { next(err); }
});

// ─── 관리자 API ───

// PUT /api/content/sections/reorder - 섹션 순서 변경
router.put('/content/sections/reorder', authenticate, async (req, res, next) => {
  try {
    const { sections } = req.body;
    if (!sections || !Array.isArray(sections)) throw new AppError('sections 배열은 필수입니다.', 400);

    const task = new Task({
      description: '섹션 순서 변경',
      agent: contentAgent,
      context: { action: 'reorder', sections, adminId: req.user.id },
      priority: 'high',
    });
    const result = await contentAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// PATCH /api/content/sections/:code/toggle - 섹션 ON/OFF
router.patch('/content/sections/:code/toggle', authenticate, async (req, res, next) => {
  try {
    const { visible } = req.body;
    if (typeof visible !== 'boolean') throw new AppError('visible(boolean)은 필수입니다.', 400);

    const task = new Task({
      description: `섹션 ${req.params.code} ${visible ? 'ON' : 'OFF'}`,
      agent: contentAgent,
      context: { action: 'toggle', sectionCode: req.params.code, visible, adminId: req.user.id },
      priority: 'high',
    });
    const result = await contentAgent.execute(task);
    task.complete(result);

    if (result.output.blocked) {
      return res.status(403).json({ success: false, message: result.output.result.message });
    }
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// POST /api/content/validate-publish - 게시 전 검증
router.post('/content/validate-publish', authenticate, async (req, res, next) => {
  try {
    const { areaCode, pageContent } = req.body;
    const task = new Task({
      description: `게시 전 검증 (${areaCode || 'common'})`,
      agent: contentAgent,
      context: { action: 'validateForPublish', areaCode, pageContent },
      priority: 'high',
    });
    const result = await contentAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// POST /api/content/generate-notice - 법적 고지 문구 생성
router.post('/content/generate-notice', authenticate, async (req, res, next) => {
  try {
    const { areaCode, companyInfo } = req.body;
    const task = new Task({
      description: `고지 문구 생성 (${areaCode || 'common'})`,
      agent: contentAgent,
      context: { action: 'generateNotice', areaCode, companyInfo },
    });
    const result = await contentAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

module.exports = router;

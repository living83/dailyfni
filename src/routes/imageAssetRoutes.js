const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const ImageAssetAgent = require('../agents/ImageAssetAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');

const router = Router();
const imageAgent = new ImageAssetAgent();

// GET /api/image-asset/guideline - 브랜드 가이드라인 조회
router.get('/image-asset/guideline', authenticate, async (req, res, next) => {
  try {
    const task = new Task({ description: '이미지 가이드라인 조회', agent: imageAgent, context: { action: 'getGuideline' } });
    const result = await imageAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// POST /api/image-asset/check-prompt - AI 프롬프트 금지어 검사
router.post('/image-asset/check-prompt', authenticate, async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) throw new AppError('prompt는 필수입니다.', 400);

    const task = new Task({
      description: 'AI 프롬프트 검사',
      agent: imageAgent,
      context: { action: 'checkPrompt', prompt },
    });
    const result = await imageAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// POST /api/image-asset/validate-upload - 업로드 품질 검증
router.post('/image-asset/validate-upload', authenticate, async (req, res, next) => {
  try {
    const { fileInfo, slot } = req.body;
    if (!fileInfo) throw new AppError('fileInfo는 필수입니다.', 400);

    const task = new Task({
      description: '업로드 품질 검증',
      agent: imageAgent,
      context: { action: 'validateUpload', fileInfo, slot },
    });
    const result = await imageAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// POST /api/image-asset/review - 종합 검수 실행
router.post('/image-asset/review', authenticate, async (req, res, next) => {
  try {
    const { prompt, fileInfo, slot, checklistAnswers } = req.body;
    const task = new Task({
      description: '이미지 종합 검수',
      agent: imageAgent,
      context: { action: 'runReview', prompt, fileInfo, slot, checklistAnswers },
      priority: 'high',
    });
    const result = await imageAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/image-asset/checklist - 체크리스트 조회
router.get('/image-asset/checklist', authenticate, async (req, res, next) => {
  try {
    const task = new Task({ description: '체크리스트 조회', agent: imageAgent, context: { action: 'getChecklist' } });
    const result = await imageAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const CustomerIntakeAgent = require('../agents/CustomerIntakeAgent');
const IntegrationAgent = require('../agents/IntegrationAgent');
const Task = require('../core/Task');
const AppError = require('../utils/AppError');
const { v4: uuidv4 } = require('uuid');

const router = Router();
const intakeAgents = new Map();
const integrationAgents = new Map();

// 싱글턴 에이전트 (공개 API용)
const publicIntakeAgent = new CustomerIntakeAgent();
const publicIntegrationAgent = new IntegrationAgent();

// ─── 공개 API (고객용, 인증 불필요) ───

// POST /api/customer/apply - 온라인 신청 등록
router.post('/customer/apply', async (req, res, next) => {
  try {
    const { formData, currentStep = 1 } = req.body;
    if (!formData) throw new AppError('formData는 필수입니다.', 400);

    // 1. 고객 접수 에이전트: 검증 + 단계 처리
    const intakeTask = new Task({
      description: `온라인 신청 (Step ${currentStep})`,
      expectedOutput: '검증 결과 및 전송 데이터',
      agent: publicIntakeAgent,
      context: { action: 'processSubmission', formData, currentStep },
      priority: 'high',
    });
    const intakeResult = await publicIntakeAgent.execute(intakeTask);
    intakeTask.complete(intakeResult);

    // 2. 검증 실패 시 (동의 미체크/필수항목 누락) → 경고 반환
    if (!intakeResult.output.passed) {
      return res.status(422).json({
        success: false,
        message: '입력 정보를 확인해 주세요.',
        consentWarning: intakeResult.output.consentWarning || null,
        fieldErrors: intakeResult.output.fieldErrors || intakeResult.output.stepResult?.missingFields || [],
        gateResult: intakeResult.output.gateResult || null,
      });
    }

    // 3. 검증 통과 + 전송 시점인 경우 → 전산 연동
    let integrationResult = null;
    if (intakeResult.output.transmissionReady) {
      const requestId = uuidv4();
      const transmissionData = intakeResult.output.transmissionReady;

      const integrationTask = new Task({
        description: `전산 전송 (${transmissionData.type})`,
        expectedOutput: '전송 결과',
        agent: publicIntegrationAgent,
        context: {
          action: 'transmit',
          payload: formData,
          requestId,
          transmissionType: transmissionData.type,
          config: {
            method: process.env.INTEGRATION_METHOD || 'api',
            endpoint: process.env.INTEGRATION_ENDPOINT || '',
            authKey: process.env.INTEGRATION_AUTH_KEY || '',
          },
        },
        priority: 'critical',
      });
      integrationResult = await publicIntegrationAgent.execute(integrationTask);
      integrationTask.complete(integrationResult);
    }

    // 4. 응답
    const transmitStatus = integrationResult?.output?.result?.status || integrationResult?.output?.finalStatus || null;

    res.json({
      success: true,
      message: transmitStatus === 'failed'
        ? '접수에 실패했습니다. 다시 시도해 주세요.'
        : '접수가 완료되었습니다.',
      step: intakeResult.output.step,
      nextStep: intakeResult.output.nextStep,
      isComplete: intakeResult.output.isComplete,
      transmitted: transmitStatus === 'success' || transmitStatus === null,
      transmitFailed: transmitStatus === 'failed',
    });
  } catch (err) { next(err); }
});

// GET /api/customer/form-step/:step - 단계별 폼 필드 조회
router.get('/customer/form-step/:step', async (req, res, next) => {
  try {
    const step = parseInt(req.params.step, 10);
    const { employmentType } = req.query;

    const task = new Task({
      description: `폼 단계 ${step} 조회`,
      agent: publicIntakeAgent,
      context: { action: 'getStep', currentStep: step, formData: { employmentType } },
    });
    const result = await publicIntakeAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output.stepResult });
  } catch (err) { next(err); }
});

// GET /api/customer/requirements - 신청 요구사항 조회
router.get('/customer/requirements', async (req, res, next) => {
  try {
    const task = new Task({
      description: '신청 요구사항 조회',
      agent: publicIntakeAgent,
      context: { action: 'getRequirements' },
    });
    const result = await publicIntakeAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// ─── 관리자 API (인증 필요) ───

// POST /api/customer/agents - 고객 접수 에이전트 생성
router.post('/customer/agents', authenticate, (req, res, next) => {
  try {
    const agent = new CustomerIntakeAgent({ name: req.body.name });
    const list = intakeAgents.get(req.user.id) || [];
    list.push(agent);
    intakeAgents.set(req.user.id, list);
    res.status(201).json({ success: true, data: agent.toJSON() });
  } catch (err) { next(err); }
});

// POST /api/customer/integration/retry - 수동 재전송
router.post('/customer/integration/retry', authenticate, async (req, res, next) => {
  try {
    const { requestId } = req.body;
    if (!requestId) throw new AppError('requestId는 필수입니다.', 400);

    const task = new Task({
      description: `수동 재전송 (${requestId})`,
      agent: publicIntegrationAgent,
      context: {
        action: 'retry',
        requestId,
        config: {
          method: process.env.INTEGRATION_METHOD || 'api',
          endpoint: process.env.INTEGRATION_ENDPOINT || '',
          authKey: process.env.INTEGRATION_AUTH_KEY || '',
        },
      },
      priority: 'high',
    });
    const result = await publicIntegrationAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/customer/integration/logs - 연동 로그 조회
router.get('/customer/integration/logs', authenticate, async (req, res, next) => {
  try {
    const { requestId } = req.query;
    const task = new Task({
      description: '연동 로그 조회',
      agent: publicIntegrationAgent,
      context: { action: 'getLog', requestId },
    });
    const result = await publicIntegrationAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

module.exports = router;

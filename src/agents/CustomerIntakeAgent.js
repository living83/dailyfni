const Agent = require('../core/Agent');
const ConsentGateTool = require('../tools/ConsentGateTool');
const CustomerFormTool = require('../tools/CustomerFormTool');

/**
 * 고객 접수 에이전트 (Customer Intake Agent)
 *
 * 점진적 고객 정보 수집 및 동의 관리를 전담합니다.
 *
 * 핵심 역할:
 * 1. 점진적 폼 단계 관리 (3단계)
 * 2. 개인정보 동의 게이트 (미체크 시 경고 → 재체크 유도)
 * 3. 전송 데이터 분류 (필수/선택, 1차/2차)
 * 4. 입력 데이터 검증
 *
 * 파이프라인:
 * 폼 입력 → 동의 체크 검증 → 필수 항목 검증 → 데이터 분류 → 전송 준비
 */
class CustomerIntakeAgent extends Agent {
  constructor(options = {}) {
    const consentGateTool = new ConsentGateTool();
    const customerFormTool = new CustomerFormTool();

    super({
      name: options.name || '고객 접수 에이전트',
      role: options.role || '고객 정보 수집 전문가',
      goal: options.goal || '고객의 심리적 부담을 최소화하며 점진적으로 정보를 수집하고, 개인정보 동의 절차를 정확히 관리합니다.',
      backstory: options.backstory || 'UX 전문가로서 전환율 최적화 경험을 보유. 최소한의 초기 필드로 고객 이탈을 방지하고, 동의 절차를 명확히 안내하여 법적 요건과 사용성을 동시에 충족합니다.',
      tools: [consentGateTool, customerFormTool],
      model: options.model || 'default',
    });

    this.consentGateTool = consentGateTool;
    this.customerFormTool = customerFormTool;
  }

  async execute(task) {
    this.addMemory({ type: 'intake_start', task: task.description });

    const context = task.context || {};
    const { action = 'processSubmission', formData = {}, currentStep = 1 } = context;

    try {
      switch (action) {
        case 'processSubmission':
          return await this._processSubmission(task, formData, currentStep);
        case 'getStep':
          return await this._getStep(task, currentStep, formData);
        case 'getRequirements':
          return await this._getRequirements(task);
        default:
          return this._error(task, `알 수 없는 액션: ${action}`);
      }
    } catch (error) {
      this.addMemory({ type: 'intake_error', error: error.message });
      return this._error(task, error.message);
    }
  }

  /**
   * 등록 제출 처리
   * 1. 동의 + 필수항목 검증
   * 2. 통과 시 → 전송 데이터 준비 + 다음 단계 결정
   * 3. 실패 시 → 경고 메시지 (동의 미체크/필드 미입력 구분)
   */
  async _processSubmission(task, formData, currentStep) {
    const phases = [];

    // Phase 1: 동의 + 필수항목 검증 (Step 1에서만)
    if (currentStep === 1) {
      const gateResult = await this.consentGateTool.execute({
        action: 'validate',
        formData,
      });
      phases.push({ phase: '동의 & 필수 검증', result: gateResult });

      if (!gateResult.canSubmit) {
        this.addMemory({ type: 'intake_blocked', reason: gateResult.errors });
        return {
          agentId: this.id,
          agentName: this.name,
          taskId: task.id,
          status: 'completed',
          output: {
            action: 'processSubmission',
            step: currentStep,
            passed: false,
            gateResult,
            phases,
            // 핵심: 동의 미체크 경고
            consentWarning: gateResult.consentWarning,
            fieldErrors: gateResult.errors.filter(e => !e.isConsentError),
          },
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Phase 2: 단계 처리 및 다음 단계 결정
    const stepResult = await this.customerFormTool.execute({
      action: 'processStep',
      currentStep,
      formData,
    });
    phases.push({ phase: '단계 처리', result: stepResult });

    if (stepResult.status === 'fail') {
      return {
        agentId: this.id,
        agentName: this.name,
        taskId: task.id,
        status: 'completed',
        output: {
          action: 'processSubmission',
          step: currentStep,
          passed: false,
          stepResult,
          phases,
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Phase 3: 전송 데이터 준비 (전송 시점인 경우)
    let transmissionReady = null;
    if (stepResult.isTransmissionPoint && stepResult.transmissionData) {
      transmissionReady = {
        type: currentStep === 1 ? 'primary' : 'secondary',
        data: stepResult.transmissionData,
        timestamp: new Date().toISOString(),
      };
      phases.push({ phase: '전송 데이터 준비', result: transmissionReady });
    }

    this.addMemory({ type: 'intake_step_complete', step: currentStep });

    return {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      output: {
        action: 'processSubmission',
        step: currentStep,
        passed: true,
        nextStep: stepResult.nextStep,
        isComplete: stepResult.isComplete,
        transmissionReady,
        formData: stepResult.formData,
        phases,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async _getStep(task, currentStep, formData) {
    const stepResult = await this.customerFormTool.execute({
      action: 'getStep',
      currentStep,
      formData,
    });

    return {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      output: {
        action: 'getStep',
        stepResult,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async _getRequirements(task) {
    const requirements = await this.consentGateTool.execute({
      action: 'getRequirements',
    });

    const summary = await this.customerFormTool.execute({
      action: 'getSummary',
      formData: {},
    });

    return {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      output: {
        action: 'getRequirements',
        requirements,
        formSummary: summary,
      },
      timestamp: new Date().toISOString(),
    };
  }

  _error(task, message) {
    return {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'failed',
      output: { error: message },
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = CustomerIntakeAgent;

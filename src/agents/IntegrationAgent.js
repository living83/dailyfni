const Agent = require('../core/Agent');
const IntegrationTransmitTool = require('../tools/IntegrationTransmitTool');

/**
 * 전산 연동 에이전트 (Integration Agent)
 *
 * 대부중개 전산 다이렉트 채널 연동을 전담합니다.
 *
 * 핵심 역할:
 * 1. 고객 정보를 전산 다이렉트 채널에 전송 (1차: 필수, 2차: 선택 포함)
 * 2. 전송 실패 시 자동 재전송 (3회, 지수 백오프)
 * 3. 중복 전송 방지 (요청 ID 기반 멱등성)
 * 4. 전송 로그 기록 (민감정보 마스킹)
 * 5. 관리자 수동 재전송 지원
 *
 * 파이프라인:
 * 전송 데이터 수신 → 중복 확인 → 전송 시도 → 성공/실패 처리 → 로그 기록
 */
class IntegrationAgent extends Agent {
  constructor(options = {}) {
    const integrationTransmitTool = new IntegrationTransmitTool();

    super({
      name: options.name || '전산 연동 에이전트',
      role: options.role || '대부중개 전산 연동 전문가',
      goal: options.goal || '고객 정보를 대부중개 전산 다이렉트 채널에 안정적으로 전송하고, 실패 시 재전송하며, 전송 이력을 관리합니다.',
      backstory: options.backstory || '금융 시스템 연동 전문가. API/파일/수기 등 다양한 연동 방식을 지원하며, 중복 전송 방지와 개인정보 보호를 최우선으로 합니다.',
      tools: [integrationTransmitTool],
      model: options.model || 'default',
    });

    this.integrationTransmitTool = integrationTransmitTool;
  }

  async execute(task) {
    this.addMemory({ type: 'integration_start', task: task.description });

    const context = task.context || {};
    const {
      action = 'transmit',
      payload,
      requestId,
      transmissionType = 'primary',
      config = {},
    } = context;

    try {
      switch (action) {
        case 'transmit':
          return await this._transmit(task, payload, requestId, transmissionType, config);

        case 'retry':
          return await this._retry(task, requestId, config);

        case 'getLog':
          return await this._getLog(task, requestId);

        default:
          return this._result(task, 'failed', { error: `알 수 없는 액션: ${action}` });
      }
    } catch (error) {
      this.addMemory({ type: 'integration_error', error: error.message });
      return this._result(task, 'failed', { error: error.message });
    }
  }

  async _transmit(task, payload, requestId, transmissionType, config) {
    // 1. 중복 확인
    const dupCheck = await this.integrationTransmitTool.execute({
      action: 'checkDuplicate',
      requestId,
    });

    if (dupCheck.isDuplicate) {
      this.addMemory({ type: 'integration_duplicate', requestId });
      return this._result(task, 'completed', {
        action: 'transmit',
        status: 'duplicate',
        message: '이미 전송 완료된 요청입니다.',
        requestId,
      });
    }

    // 2. 전송
    const result = await this.integrationTransmitTool.execute({
      action: 'transmit',
      payload,
      requestId,
      transmissionType,
      config,
    });

    this.addMemory({ type: 'integration_transmit', status: result.status, requestId });

    // 3. 실패 시 자동 재전송 시도
    if (result.status === 'failed' && result.canRetry) {
      const retryResult = await this._autoRetry(requestId, config);
      return this._result(task, 'completed', {
        action: 'transmit',
        initialResult: result,
        retryResult,
        finalStatus: retryResult.status,
      });
    }

    return this._result(task, 'completed', {
      action: 'transmit',
      result,
    });
  }

  async _autoRetry(requestId, config) {
    let lastResult = null;

    for (let i = 0; i < 3; i++) {
      lastResult = await this.integrationTransmitTool.execute({
        action: 'retry',
        requestId,
        config,
      });

      if (lastResult.status === 'success') {
        this.addMemory({ type: 'integration_retry_success', requestId, attempt: i + 1 });
        return lastResult;
      }

      if (lastResult.status === 'max_retry_exceeded') {
        this.addMemory({ type: 'integration_max_retry', requestId });
        return lastResult;
      }
    }

    return lastResult;
  }

  async _retry(task, requestId, config) {
    const result = await this.integrationTransmitTool.execute({
      action: 'retry',
      requestId,
      config,
    });

    return this._result(task, 'completed', {
      action: 'retry',
      result,
    });
  }

  async _getLog(task, requestId) {
    const result = await this.integrationTransmitTool.execute({
      action: 'getLog',
      requestId,
    });

    return this._result(task, 'completed', {
      action: 'getLog',
      result,
    });
  }

  _result(task, status, output) {
    return {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status,
      output,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = IntegrationAgent;

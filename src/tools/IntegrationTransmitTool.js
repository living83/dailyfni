const Tool = require('../core/Tool');

/**
 * 대부중개 전산 다이렉트 채널 전송 도구
 *
 * 역할:
 * 1. 전산 다이렉트 채널에 고객 정보 전송
 * 2. 전송 실패 시 재전송 (자동/수동)
 * 3. 중복 전송 방지 (요청 ID 기반 멱등성)
 * 4. 전송 로그 기록 (민감정보 마스킹)
 */
class IntegrationTransmitTool extends Tool {
  constructor() {
    super({
      name: 'integration_transmit',
      description: '고객 정보를 대부중개 전산 다이렉트 채널에 전송하고, 재전송/로그를 관리합니다.',
      parameters: {
        action: { type: 'string', description: '실행 액션 (transmit, retry, checkDuplicate, getLog)', default: 'transmit' },
        payload: { type: 'object', description: '전송할 데이터' },
        requestId: { type: 'string', description: '요청 고유 ID (중복 방지용)' },
        transmissionType: { type: 'string', description: '전송 유형 (primary, secondary)', default: 'primary' },
        config: { type: 'object', description: '연동 설정 (endpoint, authKey, method)', default: {} },
      },
    });

    // 재전송 정책
    this.retryPolicy = {
      maxRetries: 3,
      intervals: [5000, 30000, 120000], // 5초, 30초, 2분
    };

    // 전송 이력 (실제로는 DB 사용)
    this.transmissionLog = new Map();
  }

  async execute(input) {
    const { action = 'transmit', payload, requestId, transmissionType = 'primary', config = {} } = input;

    switch (action) {
      case 'transmit':
        return this._transmit(payload, requestId, transmissionType, config);
      case 'retry':
        return this._retry(requestId, config);
      case 'checkDuplicate':
        return this._checkDuplicate(requestId);
      case 'getLog':
        return this._getLog(requestId);
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  async _transmit(payload, requestId, transmissionType, config) {
    if (!payload || !requestId) {
      return { status: 'error', message: '전송 데이터와 요청 ID가 필요합니다.' };
    }

    // 중복 전송 확인
    const existing = this.transmissionLog.get(requestId);
    if (existing && existing.status === 'success') {
      return {
        status: 'duplicate',
        message: '이미 성공적으로 전송된 요청입니다.',
        originalTransmission: existing,
      };
    }

    // 전송 데이터 구성
    const transmitPayload = {
      requestId,
      transmissionType,
      timestamp: new Date().toISOString(),
      channel: 'direct',
      data: this._buildTransmitData(payload, transmissionType),
    };

    // 전송 로그 기록 (마스킹)
    const logEntry = {
      requestId,
      transmissionType,
      timestamp: transmitPayload.timestamp,
      payload: this._maskPayload(payload),
      status: 'pending',
      retryCount: 0,
      failReason: null,
    };

    try {
      // 실제 전송 시도
      const result = await this._sendToChannel(transmitPayload, config);

      logEntry.status = result.success ? 'success' : 'failed';
      logEntry.failReason = result.success ? null : result.error;
      this.transmissionLog.set(requestId, logEntry);

      if (result.success) {
        return {
          status: 'success',
          message: '전산 다이렉트 채널에 성공적으로 전송되었습니다.',
          requestId,
          transmissionType,
          log: logEntry,
        };
      } else {
        return {
          status: 'failed',
          message: '전송에 실패했습니다.',
          error: result.error,
          requestId,
          canRetry: true,
          retryPolicy: this.retryPolicy,
          log: logEntry,
        };
      }
    } catch (error) {
      logEntry.status = 'failed';
      logEntry.failReason = error.message;
      this.transmissionLog.set(requestId, logEntry);

      return {
        status: 'failed',
        message: '전송 중 오류가 발생했습니다.',
        error: error.message,
        requestId,
        canRetry: true,
        retryPolicy: this.retryPolicy,
        log: logEntry,
      };
    }
  }

  async _retry(requestId, config) {
    const existing = this.transmissionLog.get(requestId);
    if (!existing) {
      return { status: 'error', message: '해당 요청 ID의 전송 기록을 찾을 수 없습니다.' };
    }

    if (existing.status === 'success') {
      return { status: 'duplicate', message: '이미 성공적으로 전송된 요청입니다.' };
    }

    if (existing.retryCount >= this.retryPolicy.maxRetries) {
      existing.status = 'waiting';
      this.transmissionLog.set(requestId, existing);
      return {
        status: 'max_retry_exceeded',
        message: `최대 재전송 횟수(${this.retryPolicy.maxRetries}회)를 초과했습니다. 관리자가 수동으로 재전송해 주세요.`,
        requestId,
        retryCount: existing.retryCount,
      };
    }

    existing.retryCount++;
    const interval = this.retryPolicy.intervals[existing.retryCount - 1] || this.retryPolicy.intervals[this.retryPolicy.intervals.length - 1];

    // 재전송 시도 (interval은 호출자 측에서 대기)
    try {
      const result = await this._sendToChannel({ requestId, data: existing.payload }, config);
      existing.status = result.success ? 'success' : 'failed';
      existing.failReason = result.success ? null : result.error;
      this.transmissionLog.set(requestId, existing);

      return {
        status: existing.status,
        message: result.success ? '재전송 성공' : '재전송 실패',
        requestId,
        retryCount: existing.retryCount,
        nextRetryIn: result.success ? null : interval,
      };
    } catch (error) {
      existing.failReason = error.message;
      this.transmissionLog.set(requestId, existing);

      return {
        status: 'failed',
        message: '재전송 중 오류 발생',
        error: error.message,
        requestId,
        retryCount: existing.retryCount,
        nextRetryIn: interval,
      };
    }
  }

  _checkDuplicate(requestId) {
    const existing = this.transmissionLog.get(requestId);
    return {
      status: 'success',
      isDuplicate: existing?.status === 'success',
      existingRecord: existing || null,
    };
  }

  _getLog(requestId) {
    if (requestId) {
      const entry = this.transmissionLog.get(requestId);
      return { status: entry ? 'success' : 'not_found', log: entry || null };
    }

    // 전체 로그
    const logs = Array.from(this.transmissionLog.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { status: 'success', logs, total: logs.length };
  }

  _buildTransmitData(payload, transmissionType) {
    if (transmissionType === 'primary') {
      return {
        name: payload.name,
        carrier: payload.carrier,
        phone: payload.phone,
      };
    }
    // secondary: 추가 정보 포함
    return {
      name: payload.name,
      carrier: payload.carrier,
      phone: payload.phone,
      employmentType: payload.employmentType || null,
      has4Insurance: payload.has4Insurance || null,
    };
  }

  _maskPayload(payload) {
    const masked = { ...payload };
    if (masked.phone) {
      const p = masked.phone.replace(/-/g, '');
      masked.phone = p.slice(0, 3) + '****' + p.slice(-4);
    }
    if (masked.name && masked.name.length >= 2) {
      masked.name = masked.name[0] + '*'.repeat(masked.name.length - 1);
    }
    return masked;
  }

  async _sendToChannel(transmitPayload, config) {
    // 실제 연동 구현 (API 호출)
    // config.endpoint, config.authKey 사용
    const { method = 'api', endpoint, authKey } = config;

    if (method === 'api' && endpoint) {
      try {
        // 실제 HTTP 호출 (구현 시 fetch/axios 사용)
        // const response = await fetch(endpoint, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `Bearer ${authKey}`,
        //   },
        //   body: JSON.stringify(transmitPayload),
        // });
        // return { success: response.ok, error: response.ok ? null : response.statusText };

        // 현재는 시뮬레이션
        return { success: true, error: null };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    // manual(수기 대체) 또는 file 방식: 성공으로 처리 (실제 구현 시 확장)
    return { success: true, error: null };
  }
}

module.exports = IntegrationTransmitTool;

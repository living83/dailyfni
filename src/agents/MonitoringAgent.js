const Agent = require('../core/Agent');
const ServerMonitorTool = require('../tools/ServerMonitorTool');

/**
 * 모니터링 에이전트 (Monitoring Agent)
 *
 * 서버 상태, SSL, DNS, 장애 감지를 전담합니다.
 *
 * 핵심 역할:
 * 1. 서버 헬스체크 (HTTP 상태, 응답시간)
 * 2. SSL 인증서 만료일 감지 및 알림
 * 3. 도메인/DNS 연결 상태 확인
 * 4. 종합 상태 대시보드 데이터 제공
 * 5. 알림 이력 관리
 *
 * 파이프라인:
 * 대상 URL → 헬스체크 → SSL 확인 → DNS 확인 → 종합 판정 → 알림
 */
class MonitoringAgent extends Agent {
  constructor(options = {}) {
    const serverMonitorTool = new ServerMonitorTool();

    super({
      name: options.name || '모니터링 에이전트',
      role: options.role || '서버 인프라 모니터링 전문가',
      goal: options.goal || '홈페이지 서버의 가용성, SSL 인증서, DNS 상태를 실시간 감시하고, 이상 발생 시 관리자에게 알림합니다.',
      backstory: options.backstory || 'DevOps 전문가. 금융 서비스 99.9% 가용성을 목표로 서버 상태를 감시하며, SSL 만료/장애를 사전에 감지하여 서비스 중단을 방지합니다.',
      tools: [serverMonitorTool],
      model: options.model || 'default',
    });

    this.serverMonitorTool = serverMonitorTool;
  }

  async execute(task) {
    this.addMemory({ type: 'monitoring_start', task: task.description });

    const context = task.context || {};
    const { action = 'getStatus', url, threshold } = context;

    try {
      switch (action) {
        case 'getStatus':
          return await this._getStatus(task, url, threshold);
        case 'healthCheck':
          return await this._healthCheck(task, url, threshold);
        case 'sslCheck':
          return await this._sslCheck(task, url, threshold);
        case 'dnsCheck':
          return await this._dnsCheck(task, url);
        case 'getAlerts':
          return await this._getAlerts(task);
        default:
          return this._result(task, 'failed', { error: `알 수 없는 액션: ${action}` });
      }
    } catch (error) {
      this.addMemory({ type: 'monitoring_error', error: error.message });
      return this._result(task, 'failed', { error: error.message });
    }
  }

  async _getStatus(task, url, threshold) {
    const result = await this.serverMonitorTool.execute({ action: 'getStatus', url, threshold });
    this.addMemory({ type: 'monitoring_status', overall: result.overall });
    return this._result(task, 'completed', { action: 'getStatus', result });
  }

  async _healthCheck(task, url, threshold) {
    const result = await this.serverMonitorTool.execute({ action: 'healthCheck', url, threshold });
    return this._result(task, 'completed', { action: 'healthCheck', result });
  }

  async _sslCheck(task, url, threshold) {
    const result = await this.serverMonitorTool.execute({ action: 'sslCheck', url, threshold });
    return this._result(task, 'completed', { action: 'sslCheck', result });
  }

  async _dnsCheck(task, url) {
    const result = await this.serverMonitorTool.execute({ action: 'dnsCheck', url });
    return this._result(task, 'completed', { action: 'dnsCheck', result });
  }

  async _getAlerts(task) {
    const result = await this.serverMonitorTool.execute({ action: 'getAlerts' });
    return this._result(task, 'completed', { action: 'getAlerts', result });
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

module.exports = MonitoringAgent;

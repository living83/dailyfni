const Tool = require('../core/Tool');

/**
 * 서버 모니터링 & 알림 도구
 *
 * 역할:
 * 1. 서버 헬스체크 (HTTP 상태, 응답시간)
 * 2. SSL 인증서 만료일 확인
 * 3. 도메인/DNS 연결 상태 확인
 * 4. 에러 로그 분석
 * 5. 알림 트리거 (임계값 초과 시)
 */
class ServerMonitorTool extends Tool {
  constructor() {
    super({
      name: 'server_monitor',
      description: '서버 상태, SSL 인증서, 도메인 연결을 모니터링하고 알림을 제공합니다.',
      parameters: {
        action: { type: 'string', description: '실행 액션 (healthCheck, sslCheck, dnsCheck, getAlerts, getStatus)' },
        url: { type: 'string', description: '대상 URL' },
        threshold: { type: 'object', description: '임계값 설정 (responseTime, sslDaysWarning 등)' },
      },
    });

    this.defaultThreshold = {
      responseTime: 3000, // 3초 이상이면 경고
      sslDaysWarning: 30, // 만료 30일 전 경고
      sslDaysCritical: 7, // 만료 7일 전 위험
      uptimeTarget: 99.9, // 99.9% 가용성 목표
    };

    this.alertHistory = [];
  }

  async execute(input) {
    const { action, url, threshold = {} } = input;
    const thresholds = { ...this.defaultThreshold, ...threshold };

    switch (action) {
      case 'healthCheck':
        return this._healthCheck(url, thresholds);
      case 'sslCheck':
        return this._sslCheck(url, thresholds);
      case 'dnsCheck':
        return this._dnsCheck(url);
      case 'getAlerts':
        return this._getAlerts();
      case 'getStatus':
        return this._getStatus(url, thresholds);
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  async _healthCheck(url, thresholds) {
    if (!url) return { status: 'error', message: 'URL이 필요합니다.' };

    const startTime = Date.now();

    try {
      // 실제 구현 시 fetch 사용
      // const response = await fetch(url, { method: 'HEAD', timeout: 10000 });
      const responseTime = Date.now() - startTime;

      // 시뮬레이션
      const isHealthy = true;
      const statusCode = 200;

      const alert = responseTime > thresholds.responseTime
        ? { level: 'warning', message: `응답 시간 초과: ${responseTime}ms (임계값: ${thresholds.responseTime}ms)` }
        : null;

      if (alert) this.alertHistory.push({ ...alert, url, timestamp: new Date().toISOString() });

      return {
        status: 'success',
        healthy: isHealthy,
        statusCode,
        responseTime,
        thresholdExceeded: responseTime > thresholds.responseTime,
        alert,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      const alert = { level: 'critical', message: `서버 접속 불가: ${error.message}`, url, timestamp: new Date().toISOString() };
      this.alertHistory.push(alert);

      return {
        status: 'down',
        healthy: false,
        error: error.message,
        alert,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async _sslCheck(url, thresholds) {
    if (!url) return { status: 'error', message: 'URL이 필요합니다.' };

    // 실제 구현 시 tls 모듈이나 외부 API 사용
    // 시뮬레이션: SSL 만료일 90일 후
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

    const daysRemaining = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

    let level = 'ok';
    let alert = null;

    if (daysRemaining <= thresholds.sslDaysCritical) {
      level = 'critical';
      alert = { level: 'critical', message: `SSL 인증서 만료 임박: ${daysRemaining}일 남음`, url, timestamp: new Date().toISOString() };
      this.alertHistory.push(alert);
    } else if (daysRemaining <= thresholds.sslDaysWarning) {
      level = 'warning';
      alert = { level: 'warning', message: `SSL 인증서 갱신 필요: ${daysRemaining}일 남음`, url, timestamp: new Date().toISOString() };
      this.alertHistory.push(alert);
    }

    return {
      status: 'success',
      ssl: {
        valid: true,
        issuer: "Let's Encrypt",
        expiryDate: expiryDate.toISOString(),
        daysRemaining,
        level,
        autoRenewal: true,
      },
      alert,
      checkedAt: new Date().toISOString(),
    };
  }

  async _dnsCheck(url) {
    if (!url) return { status: 'error', message: 'URL이 필요합니다.' };

    // 실제 구현 시 dns.resolve 사용
    return {
      status: 'success',
      dns: {
        resolved: true,
        records: [
          { type: 'A', value: '123.456.789.0' },
          { type: 'CNAME', value: 'example.com' },
        ],
        propagated: true,
        ttl: 3600,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  _getAlerts() {
    return {
      status: 'success',
      alerts: this.alertHistory.slice(-50), // 최근 50개
      total: this.alertHistory.length,
      criticalCount: this.alertHistory.filter(a => a.level === 'critical').length,
      warningCount: this.alertHistory.filter(a => a.level === 'warning').length,
    };
  }

  async _getStatus(url, thresholds) {
    const [health, ssl, dns] = await Promise.all([
      this._healthCheck(url, thresholds),
      this._sslCheck(url, thresholds),
      this._dnsCheck(url),
    ]);

    const overallStatus = health.healthy && ssl.ssl?.valid && dns.dns?.resolved
      ? 'operational'
      : 'degraded';

    return {
      status: 'success',
      overall: overallStatus,
      health,
      ssl,
      dns,
      alerts: this.alertHistory.slice(-10),
      checkedAt: new Date().toISOString(),
    };
  }
}

module.exports = ServerMonitorTool;

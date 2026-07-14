const { v4: uuidv4 } = require('uuid');

// 인메모리 감사로그 저장소
const auditLogs = [];

// 유효 이벤트 유형
const VALID_EVENT_TYPES = ['status_change', 'assignee_change', 'settlement_change', 'close_month'];

class AuditLog {
  constructor({ eventType, targetType, targetId, targetName, beforeValue, afterValue, reason, performedBy }) {
    this.id = uuidv4();
    this.eventType = eventType;
    this.targetType = targetType || '';
    this.targetId = targetId || '';
    this.targetName = targetName || '';
    this.beforeValue = beforeValue || null;
    this.afterValue = afterValue || null;
    this.reason = reason || '';
    this.performedBy = performedBy || '';
    this.performedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      eventType: this.eventType,
      targetType: this.targetType,
      targetId: this.targetId,
      targetName: this.targetName,
      beforeValue: this.beforeValue,
      afterValue: this.afterValue,
      reason: this.reason,
      performedBy: this.performedBy,
      performedAt: this.performedAt,
    };
  }
}

// --- 저장소 함수들 ---

function create(data) {
  if (!data.eventType) {
    throw new Error('이벤트 유형은 필수 항목입니다.');
  }
  if (!VALID_EVENT_TYPES.includes(data.eventType)) {
    throw new Error(`유효하지 않은 이벤트 유형입니다. 가능한 값: ${VALID_EVENT_TYPES.join(', ')}`);
  }

  const log = new AuditLog(data);
  auditLogs.push(log);
  return log;
}

/**
 * 감사로그 조회 (필터)
 * @param {Object} options
 * @param {string} options.startDate - 시작 날짜 (ISO)
 * @param {string} options.endDate - 종료 날짜 (ISO)
 * @param {string} options.performedBy - 수행자 필터
 * @param {string} options.eventType - 이벤트 유형 필터
 * @param {string} options.targetId - 대상 ID 필터
 */
function findAll(options = {}) {
  let results = [...auditLogs];

  // 필터: 기간 (시작)
  if (options.startDate) {
    results = results.filter((l) => l.performedAt >= options.startDate);
  }

  // 필터: 기간 (종료)
  if (options.endDate) {
    const endDate = options.endDate.includes('T') ? options.endDate : options.endDate + 'T23:59:59.999Z';
    results = results.filter((l) => l.performedAt <= endDate);
  }

  // 필터: 수행자
  if (options.performedBy) {
    results = results.filter((l) => l.performedBy === options.performedBy);
  }

  // 필터: 이벤트 유형
  if (options.eventType) {
    results = results.filter((l) => l.eventType === options.eventType);
  }

  // 필터: 대상 ID
  if (options.targetId) {
    results = results.filter((l) => l.targetId === options.targetId);
  }

  // 최신순 정렬
  results.sort((a, b) => (a.performedAt > b.performedAt ? -1 : 1));

  return results;
}

module.exports = {
  AuditLog,
  VALID_EVENT_TYPES,
  create,
  findAll,
};

const { v4: uuidv4 } = require('uuid');

// --- 인메모리 저장소 ---
const executions = [];
const adjustments = [];
const policies = [];
const monthlyCloses = new Map(); // key: 'YYYY-MM'
const changeHistory = [];

// --- 유틸 ---
function recordChange(action, entityType, entityId, detail, actor) {
  changeHistory.push({
    id: uuidv4(),
    action,
    entityType,
    entityId,
    detail,
    actor: actor || 'system',
    createdAt: new Date().toISOString(),
  });
}

function formatMonth(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// =====================
// ExecutionRecord (실행 기록)
// =====================

function createExecution({ loanApplicationId, customerName, executedDate, loanAmount, feeRate, dbSource, assignedTo, createdBy }) {
  const feeAmount = Math.round(loanAmount * feeRate * 100) / 100;

  const record = {
    id: uuidv4(),
    loanApplicationId,
    customerName,
    executedDate,
    loanAmount,
    feeRate,
    feeAmount,
    dbSource: dbSource || null,
    assignedTo: assignedTo || null,
    createdAt: new Date().toISOString(),
  };

  executions.push(record);
  recordChange('CREATE', 'ExecutionRecord', record.id, record, createdBy);
  return record;
}

function getExecutions({ month, dbSource, assignedTo } = {}) {
  let result = [...executions];

  if (month) {
    result = result.filter(e => formatMonth(e.executedDate) === month);
  }
  if (dbSource) {
    result = result.filter(e => e.dbSource === dbSource);
  }
  if (assignedTo) {
    result = result.filter(e => e.assignedTo === assignedTo);
  }

  return result;
}

// =====================
// 매출 집계
// =====================

function calculateMonthlySales(month, filters = {}) {
  let records = getExecutions({ month, ...filters });

  const totalLoanAmount = records.reduce((sum, r) => sum + r.loanAmount, 0);
  const totalFeeAmount = records.reduce((sum, r) => sum + r.feeAmount, 0);
  const count = records.length;

  // 해당 월 조정 내역 반영
  const monthAdj = adjustments.filter(a => a.targetMonth === month);
  const rebateTotal = monthAdj
    .filter(a => a.type === '리베이트')
    .reduce((sum, a) => sum + a.amount, 0);
  const clawbackTotal = monthAdj
    .filter(a => a.type === '환수')
    .reduce((sum, a) => sum + a.amount, 0);

  const netFeeAmount = totalFeeAmount + rebateTotal - clawbackTotal;

  return {
    month,
    count,
    totalLoanAmount,
    totalFeeAmount,
    rebateTotal,
    clawbackTotal,
    netFeeAmount,
    records,
    adjustments: monthAdj,
  };
}

// =====================
// 수당 계산
// =====================

function calculateEmployeeAllowance(month, employeeId) {
  const records = getExecutions({ month, assignedTo: employeeId });

  const totalFeeAmount = records.reduce((sum, r) => sum + r.feeAmount, 0);

  // 해당 월 유효 정산 정책 조회 (최신 버전 우선)
  const policy = policies
    .filter(p => p.effectiveMonth <= month)
    .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.version - a.version)[0];

  const payoutRate = policy ? policy.payoutRate : 0.7; // 기본값 70%
  const allowanceAmount = Math.round(totalFeeAmount * payoutRate * 100) / 100;

  // 직원 관련 조정 내역
  const employeeAdj = adjustments.filter(
    a => a.targetMonth === month && a.relatedExecutionId &&
      records.some(r => r.id === a.relatedExecutionId)
  );
  const adjTotal = employeeAdj.reduce((sum, a) => {
    return a.type === '리베이트' ? sum + a.amount : sum - a.amount;
  }, 0);

  return {
    month,
    employeeId,
    executionCount: records.length,
    totalFeeAmount,
    payoutRate,
    allowanceAmount,
    adjustmentTotal: adjTotal,
    netAllowance: Math.round((allowanceAmount + adjTotal) * 100) / 100,
    policy: policy || null,
    records,
  };
}

// =====================
// SettlementAdjustment (조정 내역)
// =====================

function createAdjustment({ type, amount, reason, targetMonth, relatedExecutionId, createdBy }) {
  if (!['리베이트', '환수'].includes(type)) {
    throw new Error('조정 유형은 "리베이트" 또는 "환수"만 가능합니다.');
  }

  const record = {
    id: uuidv4(),
    type,
    amount,
    reason: reason || '',
    targetMonth,
    relatedExecutionId: relatedExecutionId || null,
    createdBy: createdBy || null,
    createdAt: new Date().toISOString(),
  };

  adjustments.push(record);
  recordChange('CREATE', 'SettlementAdjustment', record.id, record, createdBy);
  return record;
}

function getAdjustments({ targetMonth, type } = {}) {
  let result = [...adjustments];

  if (targetMonth) {
    result = result.filter(a => a.targetMonth === targetMonth);
  }
  if (type) {
    result = result.filter(a => a.type === type);
  }

  return result;
}

// =====================
// SettlementPolicy (정산 정책)
// =====================

function createPolicy({ feeRate, payoutRate, effectiveMonth, createdBy }) {
  const existing = policies.filter(p => p.effectiveMonth === effectiveMonth);
  const version = existing.length + 1;

  const record = {
    id: uuidv4(),
    version,
    feeRate,
    payoutRate,
    effectiveMonth,
    createdBy: createdBy || null,
    createdAt: new Date().toISOString(),
  };

  policies.push(record);
  recordChange('CREATE', 'SettlementPolicy', record.id, record, createdBy);
  return record;
}

// =====================
// MonthlyClose (월 마감)
// =====================

function closeMonth(month, closedBy) {
  const existing = monthlyCloses.get(month);
  if (existing && existing.isClosed) {
    throw new Error(`${month}은(는) 이미 마감된 월입니다.`);
  }

  const record = {
    month,
    isClosed: true,
    closedBy: closedBy || null,
    closedAt: new Date().toISOString(),
    reopenedBy: null,
    reopenReason: null,
  };

  monthlyCloses.set(month, record);
  recordChange('CLOSE', 'MonthlyClose', month, record, closedBy);
  return record;
}

function reopenMonth(month, reopenedBy, reopenReason) {
  const existing = monthlyCloses.get(month);
  if (!existing || !existing.isClosed) {
    throw new Error(`${month}은(는) 마감되지 않은 월입니다.`);
  }

  existing.isClosed = false;
  existing.reopenedBy = reopenedBy || null;
  existing.reopenReason = reopenReason || '';

  recordChange('REOPEN', 'MonthlyClose', month, existing, reopenedBy);
  return existing;
}

function getMonthlyClose(month) {
  return monthlyCloses.get(month) || null;
}

// =====================
// 변경 이력
// =====================

function getChangeHistory({ entityType, entityId, limit } = {}) {
  let result = [...changeHistory];

  if (entityType) {
    result = result.filter(h => h.entityType === entityType);
  }
  if (entityId) {
    result = result.filter(h => h.entityId === entityId);
  }

  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (limit) {
    result = result.slice(0, limit);
  }

  return result;
}

module.exports = {
  createExecution,
  getExecutions,
  calculateMonthlySales,
  calculateEmployeeAllowance,
  createAdjustment,
  getAdjustments,
  createPolicy,
  closeMonth,
  reopenMonth,
  getMonthlyClose,
  getChangeHistory,
};

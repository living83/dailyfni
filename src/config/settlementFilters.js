// 매출/수당 정산에서 공통으로 쓰는 제외 규칙.
// settlementApiRoutes.js, dashboardRoutes.js, customerApiRoutes.js 에서 모두 사용.

// 제외 담당자 (대표/본사 심사자 등 — 실적/매출 집계에서 빼야 함)
const EXCLUDED_ASSIGNEES = ['윤장호'];

// 집계에 반영하는 상태 — 오직 '승인' 만. 가승인/부결/진행후부결/접수 등은 제외.
//   * 저장 시점에 '완납' → '승인' 으로 정규화되므로 여기선 '승인' 만 확인.
const INCLUDED_STATUS = ['승인'];

// WHERE 절 조각: status + 제외 담당자. 대출 금액 집계 쿼리 맨 앞에 `WHERE 1=1` 두고 이걸 append.
//   예)
//     const params = [];
//     const sql = `SELECT ... FROM settlement_executions WHERE 1=1 ${buildApprovedAndVisibleClause(params)} ...`;
function buildApprovedAndVisibleClause(params) {
  let clause = ` AND TRIM(status) = '승인'`;
  if (EXCLUDED_ASSIGNEES.length) {
    const placeholders = EXCLUDED_ASSIGNEES.map(() => '?').join(',');
    clause += ` AND (assigned_to IS NULL OR TRIM(assigned_to) NOT IN (${placeholders}))`;
    params.push(...EXCLUDED_ASSIGNEES);
  }
  return clause;
}

// 상관 서브쿼리용 — 외부 쿼리에 params 를 넘기기 어려운 곳은 리터럴 버전 사용.
// 외부 문자열 보간 금지: 상수만 사용하므로 안전 (SQL 인젝션 위험 없음).
function buildApprovedAndVisibleClauseLiteral() {
  let clause = ` AND TRIM(e.status) = '승인'`;
  if (EXCLUDED_ASSIGNEES.length) {
    const quoted = EXCLUDED_ASSIGNEES.map(a => `'${String(a).replace(/'/g, "''")}'`).join(',');
    clause += ` AND (e.assigned_to IS NULL OR TRIM(e.assigned_to) NOT IN (${quoted}))`;
  }
  return clause;
}

module.exports = {
  EXCLUDED_ASSIGNEES,
  INCLUDED_STATUS,
  buildApprovedAndVisibleClause,
  buildApprovedAndVisibleClauseLiteral,
};

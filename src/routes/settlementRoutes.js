const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getExecutionList,
  createExecutionRecord,
  getMonthlySummary,
  getEmployeeAllowance,
  createAdjustmentRecord,
  getAdjustmentList,
  closeMonthHandler,
  reopenMonthHandler,
} = require('../controllers/settlementController');

const router = Router();

// --- 실행 기록 ---
router.get('/settlement/executions', authenticate, getExecutionList);
router.post('/settlement/executions', authenticate, createExecutionRecord);

// --- 매출 집계 ---
router.get('/settlement/monthly-summary', authenticate, getMonthlySummary);

// --- 수당 계산 ---
router.get('/settlement/employee-allowance/:employeeId', authenticate, getEmployeeAllowance);

// --- 조정 내역 (리베이트/환수) ---
router.post('/settlement/adjustments', authenticate, createAdjustmentRecord);
router.get('/settlement/adjustments', authenticate, getAdjustmentList);

// --- 월 마감 ---
router.post('/settlement/close-month', authenticate, closeMonthHandler);
router.post('/settlement/reopen-month', authenticate, reopenMonthHandler);

module.exports = router;

const {
  createExecution,
  getExecutions,
  calculateMonthlySales,
  calculateEmployeeAllowance,
  createAdjustment,
  getAdjustments,
  closeMonth,
  reopenMonth,
  getChangeHistory,
} = require('../models/Settlement');
const AppError = require('../utils/AppError');

// GET /api/settlement/executions - 실행 기록 조회
function getExecutionList(req, res, next) {
  try {
    const { month, dbSource, assignedTo } = req.query;
    const records = getExecutions({ month, dbSource, assignedTo });

    res.json({
      success: true,
      data: { executions: records, count: records.length },
    });
  } catch (err) {
    next(new AppError(err.message, 500));
  }
}

// POST /api/settlement/executions - 실행 기록 생성
function createExecutionRecord(req, res, next) {
  try {
    const { loanApplicationId, customerName, executedDate, loanAmount, feeRate, dbSource, assignedTo } = req.body;

    if (!loanApplicationId || !customerName || !executedDate || !loanAmount || feeRate === undefined) {
      throw new AppError('대출신청ID, 고객명, 실행일, 대출금액, 수수료율은 필수 항목입니다.', 400);
    }

    if (typeof loanAmount !== 'number' || loanAmount <= 0) {
      throw new AppError('대출금액은 0보다 큰 숫자여야 합니다.', 400);
    }

    if (typeof feeRate !== 'number' || feeRate < 0 || feeRate > 1) {
      throw new AppError('수수료율은 0~1 사이의 숫자여야 합니다.', 400);
    }

    const record = createExecution({
      loanApplicationId,
      customerName,
      executedDate,
      loanAmount,
      feeRate,
      dbSource,
      assignedTo,
      createdBy: req.user ? req.user.id : null,
    });

    res.status(201).json({
      success: true,
      data: { execution: record },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// GET /api/settlement/monthly-summary - 월별 매출 집계
function getMonthlySummary(req, res, next) {
  try {
    const { month, dbSource, assignedTo } = req.query;

    if (!month) {
      throw new AppError('월(month) 파라미터는 필수입니다. (예: 2026-03)', 400);
    }

    const summary = calculateMonthlySales(month, { dbSource, assignedTo });

    res.json({
      success: true,
      data: { summary },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
}

// GET /api/settlement/employee-allowance/:employeeId - 직원 수당 계산
function getEmployeeAllowance(req, res, next) {
  try {
    const { employeeId } = req.params;
    const { month } = req.query;

    if (!month) {
      throw new AppError('월(month) 파라미터는 필수입니다. (예: 2026-03)', 400);
    }

    const allowance = calculateEmployeeAllowance(month, employeeId);

    res.json({
      success: true,
      data: { allowance },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
}

// POST /api/settlement/adjustments - 조정 내역 생성 (리베이트/환수)
function createAdjustmentRecord(req, res, next) {
  try {
    const { type, amount, reason, targetMonth, relatedExecutionId } = req.body;

    if (!type || amount === undefined || !targetMonth) {
      throw new AppError('조정유형(type), 금액(amount), 대상월(targetMonth)은 필수 항목입니다.', 400);
    }

    if (typeof amount !== 'number' || amount <= 0) {
      throw new AppError('금액은 0보다 큰 숫자여야 합니다.', 400);
    }

    const record = createAdjustment({
      type,
      amount,
      reason,
      targetMonth,
      relatedExecutionId,
      createdBy: req.user ? req.user.id : null,
    });

    res.status(201).json({
      success: true,
      data: { adjustment: record },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// GET /api/settlement/adjustments - 조정 내역 조회
function getAdjustmentList(req, res, next) {
  try {
    const { targetMonth, type } = req.query;
    const records = getAdjustments({ targetMonth, type });

    res.json({
      success: true,
      data: { adjustments: records, count: records.length },
    });
  } catch (err) {
    next(new AppError(err.message, 500));
  }
}

// POST /api/settlement/close-month - 월 마감
function closeMonthHandler(req, res, next) {
  try {
    const { month } = req.body;

    if (!month) {
      throw new AppError('마감할 월(month)은 필수 항목입니다. (예: 2026-03)', 400);
    }

    const result = closeMonth(month, req.user ? req.user.id : null);

    res.json({
      success: true,
      data: { monthlyClose: result },
      message: `${month} 월이 마감되었습니다.`,
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// POST /api/settlement/reopen-month - 월 마감 해제
function reopenMonthHandler(req, res, next) {
  try {
    const { month, reason } = req.body;

    if (!month) {
      throw new AppError('재개할 월(month)은 필수 항목입니다.', 400);
    }

    if (!reason) {
      throw new AppError('마감 해제 사유(reason)는 필수 항목입니다.', 400);
    }

    const result = reopenMonth(month, req.user ? req.user.id : null, reason);

    res.json({
      success: true,
      data: { monthlyClose: result },
      message: `${month} 월 마감이 해제되었습니다.`,
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

module.exports = {
  getExecutionList,
  createExecutionRecord,
  getMonthlySummary,
  getEmployeeAllowance,
  createAdjustmentRecord,
  getAdjustmentList,
  closeMonthHandler,
  reopenMonthHandler,
};

const LoanApplication = require('../models/LoanApplication');
const AppError = require('../utils/AppError');

// POST /api/loans - 대출 신청 생성
function createLoan(req, res, next) {
  try {
    const { customerId, customerName, loanAmount, loanType, feeRate, agencyName, dbSource, assignedTo, teamId, memo, tags } = req.body;

    if (!customerId || !customerName || !loanAmount) {
      throw new AppError('고객ID, 고객명, 대출금액은 필수 항목입니다.', 400);
    }

    if (loanType && !LoanApplication.LOAN_TYPES.includes(loanType)) {
      throw new AppError(`유효하지 않은 대출 유형입니다. (${LoanApplication.LOAN_TYPES.join(', ')})`, 400);
    }

    if (loanAmount <= 0) {
      throw new AppError('대출금액은 0보다 커야 합니다.', 400);
    }

    const loan = LoanApplication.create({
      customerId,
      customerName,
      loanAmount,
      loanType,
      feeRate,
      agencyName,
      dbSource,
      assignedTo,
      teamId,
      memo,
      tags,
    });

    res.status(201).json({
      success: true,
      data: { loan: loan.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// GET /api/loans - 대출 신청 목록 조회
function getLoans(req, res, next) {
  try {
    const { status, loanType, assignedTo, teamId, agencyName, dbSource, search, sort, order, tab } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (loanType) filter.loanType = loanType;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (teamId) filter.teamId = teamId;
    if (agencyName) filter.agencyName = agencyName;
    if (dbSource) filter.dbSource = dbSource;

    const loans = LoanApplication.findAll({ filter, search, sort, order, tab });

    res.json({
      success: true,
      data: { loans: loans.map(l => l.toJSON()), count: loans.length },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
}

// GET /api/loans/:id - 대출 신청 상세 조회
function getLoan(req, res, next) {
  const loan = LoanApplication.findById(req.params.id);
  if (!loan) {
    return next(new AppError('대출 신청을 찾을 수 없습니다.', 404));
  }
  res.json({
    success: true,
    data: { loan: loan.toJSON() },
  });
}

// PUT /api/loans/:id - 대출 신청 수정
function updateLoan(req, res, next) {
  try {
    const { loanType } = req.body;

    if (loanType && !LoanApplication.LOAN_TYPES.includes(loanType)) {
      throw new AppError(`유효하지 않은 대출 유형입니다. (${LoanApplication.LOAN_TYPES.join(', ')})`, 400);
    }

    const loan = LoanApplication.update(req.params.id, req.body);
    if (!loan) {
      return next(new AppError('대출 신청을 찾을 수 없습니다.', 404));
    }

    res.json({
      success: true,
      data: { loan: loan.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// PUT /api/loans/:id/status - 상태 변경
function changeStatus(req, res, next) {
  try {
    const { status, reason, changedBy } = req.body;

    if (!status) {
      throw new AppError('변경할 상태값은 필수 항목입니다.', 400);
    }

    const loan = LoanApplication.changeStatus(
      req.params.id,
      status,
      reason || '',
      changedBy || (req.user && req.user.name) || 'system'
    );

    if (!loan) {
      return next(new AppError('대출 신청을 찾을 수 없습니다.', 404));
    }

    res.json({
      success: true,
      data: { loan: loan.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// PUT /api/loans/:id/assignee - 담당자 변경
function changeAssignee(req, res, next) {
  try {
    const { assignee, memo, changedBy } = req.body;

    if (!assignee) {
      throw new AppError('변경할 담당자는 필수 항목입니다.', 400);
    }

    const loan = LoanApplication.changeAssignee(
      req.params.id,
      assignee,
      memo || '',
      changedBy || (req.user && req.user.name) || 'system'
    );

    if (!loan) {
      return next(new AppError('대출 신청을 찾을 수 없습니다.', 404));
    }

    res.json({
      success: true,
      data: { loan: loan.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// POST /api/loans/:id/documents - 문서 업로드 (메타 정보만 저장)
function uploadDocument(req, res, next) {
  try {
    const { fileName, fileType, fileSize, category, uploadedBy } = req.body;

    if (!fileName) {
      throw new AppError('파일명은 필수 항목입니다.', 400);
    }

    const doc = LoanApplication.addDocument(req.params.id, {
      fileName,
      fileType,
      fileSize,
      category,
      uploadedBy: uploadedBy || (req.user && req.user.name) || 'system',
    });

    if (!doc) {
      return next(new AppError('대출 신청을 찾을 수 없습니다.', 404));
    }

    res.status(201).json({
      success: true,
      data: { document: doc },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

module.exports = { createLoan, getLoans, getLoan, updateLoan, changeStatus, changeAssignee, uploadDocument };

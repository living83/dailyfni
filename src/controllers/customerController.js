const Customer = require('../models/Customer');
const Consultation = require('../models/Consultation');
const AppError = require('../utils/AppError');

// POST /api/customers - 고객 생성 (중복 감지 포함)
function createCustomer(req, res, next) {
  try {
    const { name, phone, dbSource, assignedTo, teamId, status, memo, tags } = req.body;

    if (!name || !phone) {
      throw new AppError('이름과 전화번호는 필수 항목입니다.', 400);
    }

    // 중복 감지
    const existing = Customer.findByPhone(phone);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: '동일한 전화번호의 고객이 이미 존재합니다.',
        data: { existingCustomer: existing.toJSON() },
      });
    }

    const customer = Customer.create({ name, phone, dbSource, assignedTo, teamId, status, memo, tags });

    res.status(201).json({
      success: true,
      data: { customer: customer.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// GET /api/customers - 고객 목록 조회 (검색/필터/정렬)
function getCustomers(req, res) {
  const { search, status, assignedTo, teamId, tag, sortBy, order } = req.query;
  const customers = Customer.findAll({ search, status, assignedTo, teamId, tag, sortBy, order });

  res.json({
    success: true,
    data: {
      customers: customers.map((c) => c.toJSON()),
      count: customers.length,
    },
  });
}

// GET /api/customers/:id - 고객 상세 조회
function getCustomer(req, res, next) {
  const customer = Customer.findById(req.params.id);
  if (!customer) {
    return next(new AppError('고객을 찾을 수 없습니다.', 404));
  }

  res.json({
    success: true,
    data: { customer: customer.toJSON() },
  });
}

// PUT /api/customers/:id - 고객 정보 수정
function updateCustomer(req, res, next) {
  try {
    const { name, phone, dbSource, assignedTo, teamId, status, memo, tags } = req.body;

    // 전화번호 변경 시 중복 확인
    if (phone) {
      const existing = Customer.findByPhone(phone);
      if (existing && existing.id !== req.params.id) {
        return res.status(409).json({
          success: false,
          message: '동일한 전화번호의 고객이 이미 존재합니다.',
          data: { existingCustomer: existing.toJSON() },
        });
      }
    }

    const customer = Customer.update(req.params.id, {
      name, phone, dbSource, assignedTo, teamId, status, memo, tags,
    });

    if (!customer) {
      return next(new AppError('고객을 찾을 수 없습니다.', 404));
    }

    res.json({
      success: true,
      data: { customer: customer.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// DELETE /api/customers/:id - 고객 삭제
function deleteCustomer(req, res, next) {
  const deleted = Customer.remove(req.params.id);
  if (!deleted) {
    return next(new AppError('고객을 찾을 수 없습니다.', 404));
  }

  res.json({ success: true, message: '고객이 삭제되었습니다.' });
}

// POST /api/customers/merge - 고객 병합
function mergeCustomers(req, res, next) {
  try {
    const { sourceId, targetId } = req.body;

    if (!sourceId || !targetId) {
      throw new AppError('sourceId와 targetId는 필수 항목입니다.', 400);
    }

    // 상담 기록 이관
    Consultation.transferConsultations(sourceId, targetId);

    // 고객 정보 병합
    const merged = Customer.merge(sourceId, targetId);

    res.json({
      success: true,
      message: '고객이 성공적으로 병합되었습니다.',
      data: { customer: merged.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// POST /api/customers/:id/consultations - 상담 기록 생성
function createConsultation(req, res, next) {
  try {
    const customerId = req.params.id;

    // 고객 존재 확인
    const customer = Customer.findById(customerId);
    if (!customer) {
      return next(new AppError('고객을 찾을 수 없습니다.', 404));
    }

    const { channel, content, nextActionDate, nextActionContent, consultedBy } = req.body;

    const consultation = Consultation.create({
      customerId,
      channel,
      content,
      nextActionDate,
      nextActionContent,
      consultedBy,
    });

    res.status(201).json({
      success: true,
      data: { consultation: consultation.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// GET /api/customers/:id/consultations - 상담 기록 조회
function getConsultations(req, res, next) {
  const customerId = req.params.id;

  // 고객 존재 확인
  const customer = Customer.findById(customerId);
  if (!customer) {
    return next(new AppError('고객을 찾을 수 없습니다.', 404));
  }

  const consultations = Consultation.findByCustomerId(customerId);

  res.json({
    success: true,
    data: {
      consultations: consultations.map((c) => c.toJSON()),
      count: consultations.length,
    },
  });
}

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  mergeCustomers,
  createConsultation,
  getConsultations,
};

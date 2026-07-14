const Employee = require('../models/Employee');
const AppError = require('../utils/AppError');

// POST /api/employees - 직원 등록
async function createEmployee(req, res, next) {
  try {
    const employee = await Employee.create(req.body);
    res.status(201).json({
      success: true,
      data: { employee: employee.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// GET /api/employees - 직원 목록 조회
function getEmployees(req, res) {
  const { search, department, role, isActive, sortBy, order } = req.query;
  const employees = Employee.findAll({ search, department, role, isActive, sortBy, order });
  res.json({
    success: true,
    data: { employees: employees.map((e) => e.toJSON()), count: employees.length },
  });
}

// GET /api/employees/:id - 직원 상세 조회
function getEmployee(req, res, next) {
  const employee = Employee.findById(req.params.id);
  if (!employee) {
    return next(new AppError('직원을 찾을 수 없습니다.', 404));
  }
  res.json({
    success: true,
    data: { employee: employee.toJSON() },
  });
}

// PUT /api/employees/:id - 직원 정보 수정
function updateEmployee(req, res, next) {
  try {
    const employee = Employee.update(req.params.id, req.body);
    if (!employee) {
      return next(new AppError('직원을 찾을 수 없습니다.', 404));
    }
    res.json({
      success: true,
      data: { employee: employee.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// DELETE /api/employees/:id - 직원 삭제
function deleteEmployee(req, res, next) {
  const deleted = Employee.remove(req.params.id);
  if (!deleted) {
    return next(new AppError('직원을 찾을 수 없습니다.', 404));
  }
  res.json({ success: true, message: '직원이 삭제되었습니다.' });
}

// PUT /api/employees/:id/reset-password - 비밀번호 초기화
async function resetPassword(req, res, next) {
  try {
    const { tempPassword } = req.body;
    if (!tempPassword) {
      throw new AppError('임시 비밀번호를 입력해주세요.', 400);
    }
    if (tempPassword.length < 6) {
      throw new AppError('비밀번호는 최소 6자 이상이어야 합니다.', 400);
    }
    const employee = await Employee.resetPassword(req.params.id, tempPassword);
    if (!employee) {
      return next(new AppError('직원을 찾을 수 없습니다.', 404));
    }
    res.json({
      success: true,
      message: '비밀번호가 초기화되었습니다.',
      data: { employee: employee.toJSON() },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// PUT /api/employees/:id/activate - 직원 활성화
function activateEmployee(req, res, next) {
  const employee = Employee.activate(req.params.id);
  if (!employee) {
    return next(new AppError('직원을 찾을 수 없습니다.', 404));
  }
  res.json({
    success: true,
    message: '직원이 활성화되었습니다.',
    data: { employee: employee.toJSON() },
  });
}

// PUT /api/employees/:id/deactivate - 직원 비활성화
function deactivateEmployee(req, res, next) {
  const employee = Employee.deactivate(req.params.id);
  if (!employee) {
    return next(new AppError('직원을 찾을 수 없습니다.', 404));
  }
  res.json({
    success: true,
    message: '직원이 비활성화되었습니다.',
    data: { employee: employee.toJSON() },
  });
}

module.exports = {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  resetPassword,
  activateEmployee,
  deactivateEmployee,
};

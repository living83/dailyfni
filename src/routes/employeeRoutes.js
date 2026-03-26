const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  resetPassword,
  activateEmployee,
  deactivateEmployee,
} = require('../controllers/employeeController');

const router = Router();

// --- 직원 관리 엔드포인트 ---
router.post('/employees', authenticate, authorize('admin'), createEmployee);
router.get('/employees', authenticate, getEmployees);
router.get('/employees/:id', authenticate, getEmployee);
router.put('/employees/:id', authenticate, authorize('admin'), updateEmployee);
router.delete('/employees/:id', authenticate, authorize('admin'), deleteEmployee);

// --- 비밀번호 초기화 ---
router.put('/employees/:id/reset-password', authenticate, authorize('admin'), resetPassword);

// --- 활성화/비활성화 ---
router.put('/employees/:id/activate', authenticate, authorize('admin'), activateEmployee);
router.put('/employees/:id/deactivate', authenticate, authorize('admin'), deactivateEmployee);

module.exports = router;

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  mergeCustomers,
  createConsultation,
  getConsultations,
} = require('../controllers/customerController');

const router = Router();

// --- 고객 관리 (인증 필요) ---
router.post('/customers/merge', authenticate, mergeCustomers);  // merge를 :id 위에 배치
router.post('/customers', authenticate, createCustomer);
router.get('/customers', authenticate, getCustomers);
router.get('/customers/:id', authenticate, getCustomer);
router.put('/customers/:id', authenticate, updateCustomer);
router.delete('/customers/:id', authenticate, deleteCustomer);

// --- 상담 기록 ---
router.post('/customers/:id/consultations', authenticate, createConsultation);
router.get('/customers/:id/consultations', authenticate, getConsultations);

module.exports = router;

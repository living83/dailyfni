const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createLoan,
  getLoans,
  getLoan,
  updateLoan,
  changeStatus,
  changeAssignee,
  uploadDocument,
} = require('../controllers/loanController');

const router = Router();

// --- 인증 필요 엔드포인트 ---
router.post('/loans', authenticate, createLoan);
router.get('/loans', authenticate, getLoans);
router.get('/loans/:id', authenticate, getLoan);
router.put('/loans/:id', authenticate, updateLoan);
router.put('/loans/:id/status', authenticate, changeStatus);
router.put('/loans/:id/assignee', authenticate, changeAssignee);
router.post('/loans/:id/documents', authenticate, uploadDocument);

module.exports = router;

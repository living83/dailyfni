const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getAuditLogs } = require('../controllers/auditController');

const router = Router();

// --- 감사로그 엔드포인트 ---
router.get('/audit-logs', authenticate, authorize('admin'), getAuditLogs);

module.exports = router;

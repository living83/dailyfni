const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} = require('../controllers/notificationController');

const router = Router();

// --- 알림 엔드포인트 ---
router.get('/notifications', authenticate, getNotifications);
router.get('/notifications/unread-count', authenticate, getUnreadCount);
router.put('/notifications/read-all', authenticate, markAllAsRead);
router.put('/notifications/:id/read', authenticate, markAsRead);

module.exports = router;

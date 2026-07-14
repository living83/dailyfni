const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');

// GET /api/notifications - 내 알림 목록 조회
function getNotifications(req, res) {
  const { type, isRead } = req.query;
  const userId = req.user ? req.user.id : req.query.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: '사용자 ID가 필요합니다.' });
  }
  const notifications = Notification.findByUser(userId, { type, isRead });
  res.json({
    success: true,
    data: { notifications: notifications.map((n) => n.toJSON()), count: notifications.length },
  });
}

// PUT /api/notifications/:id/read - 알림 읽음 처리
function markAsRead(req, res, next) {
  const notification = Notification.markAsRead(req.params.id);
  if (!notification) {
    return next(new AppError('알림을 찾을 수 없습니다.', 404));
  }
  res.json({
    success: true,
    data: { notification: notification.toJSON() },
  });
}

// PUT /api/notifications/read-all - 전체 알림 읽음 처리
function markAllAsRead(req, res) {
  const userId = req.user ? req.user.id : req.body.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: '사용자 ID가 필요합니다.' });
  }
  const count = Notification.markAllAsRead(userId);
  res.json({
    success: true,
    message: `${count}개의 알림을 읽음 처리했습니다.`,
    data: { updatedCount: count },
  });
}

// GET /api/notifications/unread-count - 읽지 않은 알림 수 조회
function getUnreadCount(req, res) {
  const userId = req.user ? req.user.id : req.query.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: '사용자 ID가 필요합니다.' });
  }
  const count = Notification.getUnreadCount(userId);
  res.json({
    success: true,
    data: { unreadCount: count },
  });
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};

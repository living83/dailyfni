const { v4: uuidv4 } = require('uuid');

// 인메모리 알림 저장소
const notifications = new Map();

// 유효 알림 유형
const VALID_TYPES = ['reminder', 'stagnant', 'document', 'system'];

class Notification {
  constructor({ type, title, content, targetUserId, relatedEntityId }) {
    this.id = uuidv4();
    this.type = type;
    this.title = title;
    this.content = content || '';
    this.targetUserId = targetUserId;
    this.isRead = false;
    this.relatedEntityId = relatedEntityId || null;
    this.createdAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      content: this.content,
      targetUserId: this.targetUserId,
      isRead: this.isRead,
      relatedEntityId: this.relatedEntityId,
      createdAt: this.createdAt,
    };
  }
}

// --- 저장소 함수들 ---

function create(data) {
  if (!data.title || !data.targetUserId) {
    throw new Error('알림 제목과 대상 사용자는 필수 항목입니다.');
  }
  if (data.type && !VALID_TYPES.includes(data.type)) {
    throw new Error(`유효하지 않은 알림 유형입니다. 가능한 값: ${VALID_TYPES.join(', ')}`);
  }

  const notification = new Notification(data);
  notifications.set(notification.id, notification);
  return notification;
}

/**
 * 사용자별 알림 조회 (필터)
 * @param {string} userId - 대상 사용자 ID
 * @param {Object} filter
 * @param {string} filter.type - 알림 유형 필터
 * @param {string} filter.isRead - 읽음 상태 필터
 */
function findByUser(userId, filter = {}) {
  let results = Array.from(notifications.values()).filter(
    (n) => n.targetUserId === userId
  );

  // 필터: 유형
  if (filter.type) {
    results = results.filter((n) => n.type === filter.type);
  }

  // 필터: 읽음 상태
  if (filter.isRead !== undefined) {
    const isRead = filter.isRead === 'true' || filter.isRead === true;
    results = results.filter((n) => n.isRead === isRead);
  }

  // 최신순 정렬
  results.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));

  return results;
}

function markAsRead(id) {
  const notification = notifications.get(id);
  if (!notification) return null;
  notification.isRead = true;
  return notification;
}

function markAllAsRead(userId) {
  let count = 0;
  for (const notification of notifications.values()) {
    if (notification.targetUserId === userId && !notification.isRead) {
      notification.isRead = true;
      count++;
    }
  }
  return count;
}

function getUnreadCount(userId) {
  let count = 0;
  for (const notification of notifications.values()) {
    if (notification.targetUserId === userId && !notification.isRead) {
      count++;
    }
  }
  return count;
}

module.exports = {
  Notification,
  VALID_TYPES,
  create,
  findByUser,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};

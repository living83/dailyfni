const { query } = require('./db');

async function logAudit({ eventType, targetType, targetId, targetName, beforeValue, afterValue, reason, performedBy, performedById }) {
  try {
    await query(
      'INSERT INTO audit_logs (event_type, target_type, target_id, target_name, before_value, after_value, reason, performed_by, performed_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [eventType, targetType || '', targetId || 0, targetName || '', beforeValue || '', afterValue || '', reason || '', performedBy || '', performedById || null]
    );
  } catch (e) {
    console.error('감사로그 기록 실패:', e.message);
  }
}

module.exports = { logAudit };

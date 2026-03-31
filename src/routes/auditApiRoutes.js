const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// 감사로그 조회
router.get('/audit-logs', async (req, res) => {
  try {
    const { startDate, endDate, eventType, performedBy } = req.query;
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (startDate) { sql += ' AND performed_at >= ?'; params.push(startDate + ' 00:00:00'); }
    if (endDate) { sql += ' AND performed_at <= ?'; params.push(endDate + ' 23:59:59'); }
    if (eventType && eventType !== '전체 이벤트') {
      const typeMap = { '로그인': 'login', '상태 변경': 'status_change', '담당자 변경': 'assignee_change', '정산 변경': 'settlement_change', '월 마감': 'close_month', '고객 수정': 'customer_edit', '고객 삭제': 'customer_delete', '직원 관리': 'employee_manage' };
      sql += ' AND event_type = ?';
      params.push(typeMap[eventType] || eventType);
    }
    if (performedBy && performedBy !== '전체 직원') {
      sql += ' AND performed_by = ?';
      params.push(performedBy);
    }

    sql += ' ORDER BY performed_at DESC LIMIT 100';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 감사로그 기록 (내부 호출용)
router.post('/audit-logs', async (req, res) => {
  try {
    const { eventType, targetType, targetId, targetName, beforeValue, afterValue, reason, performedBy, performedById } = req.body;
    await query(
      'INSERT INTO audit_logs (event_type, target_type, target_id, target_name, before_value, after_value, reason, performed_by, performed_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [eventType, targetType || '', targetId || 0, targetName || '', beforeValue || '', afterValue || '', reason || '', performedBy || '', performedById || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

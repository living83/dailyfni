const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// ========================================
// 알림 조회
// ========================================
router.get('/notifications', async (req, res) => {
  try {
    const user = req.query.userId || null;
    const filter = req.query.filter || 'all'; // all, unread
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];

    if (user) { sql += ' AND target_user_id = ?'; params.push(user); }
    if (filter === 'unread') { sql += ' AND is_read = 0'; }

    sql += ' ORDER BY created_at DESC LIMIT 50';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 미확인 건수
router.get('/notifications/unread-count', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    let sql = 'SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0';
    const params = [];
    if (userId) { sql += ' AND target_user_id = ?'; params.push(userId); }
    const rows = await query(sql, params);
    res.json({ success: true, count: rows[0].cnt });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 읽음 처리
router.put('/notifications/:id/read', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 전체 읽음
router.put('/notifications/read-all', async (req, res) => {
  try {
    const userId = req.body.userId || null;
    if (userId) {
      await query('UPDATE notifications SET is_read = 1 WHERE target_user_id = ?', [userId]);
    } else {
      await query('UPDATE notifications SET is_read = 1');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================================
// 알림 생성 (내부 호출용)
// ========================================
router.post('/notifications', async (req, res) => {
  try {
    const { type, title, content, targetUserId } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '제목 필수' });

    await query(
      'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
      [type || 'system', title, content || '', targetUserId || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================================
// 알림 트리거 (이벤트 발생 시 호출)
// ========================================

// 1. 고객 접수 알림 (홈페이지/DB유입)
router.post('/notifications/trigger/customer-received', async (req, res) => {
  try {
    const { customerName, dbSource, assignedTo, assignedToId } = req.body;
    await query(
      'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
      ['system', `[고객 접수] ${customerName} 고객이 접수되었습니다.`,
       `DB출처: ${dbSource || '미지정'} | 담당자: ${assignedTo || '미배정'}`,
       assignedToId || 0]
    );
    // 관리자에게도 알림
    const admins = await query('SELECT id FROM employees WHERE role = "admin"');
    for (const admin of admins) {
      if (admin.id !== assignedToId) {
        await query(
          'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
          ['system', `[신규 고객] ${customerName} 고객이 ${dbSource || 'DB'}에서 접수되었습니다.`,
           `담당자: ${assignedTo || '미배정'}`, admin.id]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. 상담 리마인더 (다음 액션 등록 시)
router.post('/notifications/trigger/consultation-reminder', async (req, res) => {
  try {
    const { customerName, nextActionDate, nextActionContent, assignedToId } = req.body;
    await query(
      'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
      ['reminder', `[상담 리마인더] ${customerName} 고객 - ${nextActionContent}`,
       `예정일: ${nextActionDate}`, assignedToId || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. 상태 변경 알림
router.post('/notifications/trigger/status-change', async (req, res) => {
  try {
    const { customerName, beforeStatus, afterStatus, changedBy, assignedToId } = req.body;
    await query(
      'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
      ['system', `[상태 변경] ${customerName} 고객 - ${beforeStatus} → ${afterStatus}`,
       `처리자: ${changedBy}`, assignedToId || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. 대출 승인/부결 알림
router.post('/notifications/trigger/loan-result', async (req, res) => {
  try {
    const { customerName, productName, result, amount, assignedToId } = req.body;
    const icon = result === '승인' ? '승인' : '부결';
    await query(
      'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
      ['system', `[대출 ${icon}] ${customerName} 고객 - ${productName}`,
       `결과: ${result}${amount ? ' | 금액: ' + amount + '만' : ''}`,
       assignedToId || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. 월 마감 알림
router.post('/notifications/trigger/monthly-close', async (req, res) => {
  try {
    const { targetMonth, daysLeft } = req.body;
    // 모든 직원에게 알림
    const employees = await query('SELECT id FROM employees WHERE is_active = 1');
    for (const emp of employees) {
      await query(
        'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
        ['system', `[월 마감 안내] ${targetMonth} 정산 마감 D-${daysLeft}`,
         '정산 내역을 확인하고 마감 전 수정사항을 처리하세요.', emp.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

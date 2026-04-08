const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { notifyNewCustomer } = require('../utils/telegram');

// ========================================
// 홈페이지 상담 신청 접수 (외부 호출용)
// ========================================
router.post('/intake/homepage', async (req, res) => {
  try {
    const { name, phone, content, source } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: '이름과 연락처는 필수입니다.' });
    }

    // 동일 전화번호 + pending 상태 기존 데이터 확인
    const existing = await query(
      'SELECT id FROM intake_customers WHERE phone = ? AND status = "pending" ORDER BY created_at DESC LIMIT 1',
      [phone]
    );

    let resultId;
    if (existing.length > 0) {
      // 기존 데이터 업데이트 (상담내용 추가)
      await query(
        'UPDATE intake_customers SET name = ?, content = ?, source = ?, created_at = NOW() WHERE id = ?',
        [name, content || '', source || '홈페이지', existing[0].id]
      );
      resultId = existing[0].id;
    } else {
      // 신규 저장
      const result = await query(
        'INSERT INTO intake_customers (name, phone, content, source, status) VALUES (?, ?, ?, ?, ?)',
        [name, phone, content || '', source || '홈페이지', 'pending']
      );
      resultId = result.insertId;

      // 알림은 신규일 때만 발송
      const admins = await query('SELECT id, name FROM employees WHERE role = "admin" AND is_active = 1');
      for (const admin of admins) {
        await query(
          'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
          ['system', `[신규 유입] ${name} 고객이 홈페이지에서 상담 신청했습니다.`,
           `연락처: ${phone} | 내용: ${content || '없음'}`, admin.id]
        );
      }
      const sales = await query('SELECT id FROM employees WHERE role = "sales" AND is_active = 1');
      for (const s of sales) {
        await query(
          'INSERT INTO notifications (type, title, content, target_user_id) VALUES (?, ?, ?, ?)',
          ['system', `[신규 유입] ${name} 고객 상담 신청 (홈페이지)`,
           `연락처: ${phone}`, s.id]
        );
      }

      // 텔레그램 알림 전송
      notifyNewCustomer({ name, phone, content, source });
    }

    res.json({ success: true, message: '접수 완료', id: resultId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================================
// 신규 유입 목록 조회
// ========================================
router.get('/intake/list', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM intake_customers WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT 50';

    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 미처리 건수
router.get('/intake/pending-count', async (req, res) => {
  try {
    const rows = await query('SELECT COUNT(*) as cnt FROM intake_customers WHERE status = "pending"');
    res.json({ success: true, count: rows[0].cnt });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 접수 처리 (담당자 배정 후 고객등록으로 전환)
router.put('/intake/:id/process', async (req, res) => {
  try {
    const { assignedTo, assignedToId } = req.body;
    await query(
      'UPDATE intake_customers SET status = "processed", assigned_to = ?, processed_at = NOW() WHERE id = ?',
      [assignedTo || '', req.params.id]
    );
    res.json({ success: true, message: '접수 처리 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 반려 처리
router.put('/intake/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    await query(
      'UPDATE intake_customers SET status = "rejected", reject_reason = ?, processed_at = NOW() WHERE id = ?',
      [reason || '', req.params.id]
    );
    res.json({ success: true, message: '반려 처리 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

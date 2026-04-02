const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// 대시보드 요약 데이터
router.get('/dashboard/summary', async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const firstDay = thisMonth + '-01';

    // 이번 달 신규 고객
    const [newCustomers] = await query(
      'SELECT COUNT(*) as cnt FROM customers WHERE created_at >= ?', [firstDay]
    );

    // 전체 고객 수
    const [totalCustomers] = await query('SELECT COUNT(*) as cnt FROM customers');

    // 상태별 고객 현황
    const statusCounts = await query(
      'SELECT status, COUNT(*) as cnt FROM customers GROUP BY status'
    );

    // DB 출처별 유입 현황
    const dbSourceCounts = await query(
      'SELECT db_source, COUNT(*) as cnt FROM customers WHERE db_source != "" GROUP BY db_source ORDER BY cnt DESC'
    );

    // 신규 유입 대기 건수
    const [pendingIntake] = await query(
      'SELECT COUNT(*) as cnt FROM intake_customers WHERE status = "pending"'
    );

    // 최근 등록 고객 5명
    const recentCustomers = await query(
      'SELECT id, name, phone, db_source, assigned_to, status, credit_status, created_at FROM customers ORDER BY created_at DESC LIMIT 5'
    );

    // 미확인 알림 수
    const [unreadNotis] = await query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0'
    );

    // 오늘 상담 기록 수
    const today = now.toISOString().split('T')[0];
    const [todayConsults] = await query(
      'SELECT COUNT(*) as cnt FROM consultations WHERE DATE(consulted_at) = ?', [today]
    );

    res.json({
      success: true,
      data: {
        newCustomers: newCustomers.cnt,
        totalCustomers: totalCustomers.cnt,
        pendingIntake: pendingIntake.cnt,
        unreadNotis: unreadNotis.cnt,
        todayConsults: todayConsults.cnt,
        statusCounts: statusCounts,
        dbSourceCounts: dbSourceCounts,
        recentCustomers: recentCustomers
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

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

    // 미확인 알림 수 (로그인 사용자 기준)
    const userId = req.user?.id || req.query.userId || 0;
    const [unreadNotis] = await query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0 AND user_id = ?', [userId]
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

// 성과 분석 데이터
router.get('/dashboard/performance', async (req, res) => {
  try {
    const { month } = req.query;
    let monthFilter = '';
    let custMonthFilter = '';
    const params = [];
    const custParams = [];

    if (month) {
      monthFilter = ' AND DATE_FORMAT(executed_date, "%Y-%m") = ?';
      custMonthFilter = ' AND DATE_FORMAT(created_at, "%Y-%m") = ?';
      params.push(month);
      custParams.push(month);
    }

    // 출처별 성과: 유입(고객수), 실행건수, 매출
    const bySource = await query(`
      SELECT c.db_source,
        COUNT(DISTINCT c.id) as intake_count,
        (SELECT COUNT(*) FROM settlement_executions e WHERE e.db_source = c.db_source ${monthFilter}) as exec_count,
        (SELECT COALESCE(SUM(e.loan_amount),0) FROM settlement_executions e WHERE e.db_source = c.db_source ${monthFilter}) as total_amount,
        (SELECT COALESCE(SUM(e.fee_amount),0) FROM settlement_executions e WHERE e.db_source = c.db_source ${monthFilter}) as total_fee
      FROM customers c
      WHERE c.db_source != '' ${custMonthFilter}
      GROUP BY c.db_source
      ORDER BY intake_count DESC
    `, [...params, ...custParams]);

    // 담당자별 성과
    const byAssigned = await query(`
      SELECT c.assigned_to,
        COUNT(DISTINCT c.id) as customer_count,
        (SELECT COUNT(*) FROM settlement_executions e WHERE e.assigned_to = c.assigned_to ${monthFilter}) as exec_count,
        (SELECT COALESCE(SUM(e.loan_amount),0) FROM settlement_executions e WHERE e.assigned_to = c.assigned_to ${monthFilter}) as total_amount,
        (SELECT COALESCE(SUM(e.fee_amount),0) FROM settlement_executions e WHERE e.assigned_to = c.assigned_to ${monthFilter}) as total_fee
      FROM customers c
      WHERE c.assigned_to != '' ${custMonthFilter}
      GROUP BY c.assigned_to
      ORDER BY customer_count DESC
    `, [...params, ...custParams]);

    // 전체 요약
    const [totalExec] = await query(`SELECT COUNT(*) as cnt, COALESCE(SUM(loan_amount),0) as amount, COALESCE(SUM(fee_amount),0) as fee FROM settlement_executions WHERE 1=1 ${monthFilter}`, params);
    const [totalCust] = await query(`SELECT COUNT(*) as cnt FROM customers WHERE 1=1 ${custMonthFilter}`, custParams);

    res.json({
      success: true,
      data: { bySource, byAssigned, totalExec, totalCust: totalCust.cnt }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { logAudit } = require('../database/auditHelper');

// === 정산 정책 ===

// 정산 정책 조회 (월별)
router.get('/settlement/policies', async (req, res) => {
  try {
    const { month } = req.query;
    let sql = 'SELECT * FROM settlement_policies';
    const params = [];
    if (month) { sql += ' WHERE target_month = ?'; params.push(month); }
    sql += ' ORDER BY id';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 적용 가능한 월 목록 조회
router.get('/settlement/policies/months', async (req, res) => {
  try {
    const rows = await query('SELECT DISTINCT target_month FROM settlement_policies ORDER BY target_month DESC');
    res.json({ success: true, data: rows.map(r => r.target_month) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 정산 정책 월별 저장 (해당 월만 삭제 후 재삽입)
router.post('/settlement/policies/upload', async (req, res) => {
  try {
    const { policies, month } = req.body;
    if (!policies || !Array.isArray(policies)) {
      return res.status(400).json({ success: false, message: 'policies 배열이 필요합니다.' });
    }
    if (!month) {
      return res.status(400).json({ success: false, message: '적용월을 선택하세요.' });
    }

    // 마감 여부 확인
    const closed = await query('SELECT is_closed FROM monthly_closes WHERE target_month = ?', [month]);
    if (closed.length > 0 && closed[0].is_closed) {
      return res.status(400).json({ success: false, message: `${month}은 마감 완료되어 수정할 수 없습니다.` });
    }

    // 해당 월 데이터만 삭제
    await query('DELETE FROM settlement_policies WHERE target_month = ?', [month]);

    // 새 데이터 삽입
    for (const p of policies) {
      await query(
        'INSERT INTO settlement_policies (category, product, rate_under, rate_over, auth, target_month) VALUES (?, ?, ?, ?, ?, ?)',
        [p.category || '', p.product || '', p.rateUnder || '', p.rateOver || '', p.auth || '', month]
      );
    }

    await logAudit({ eventType: 'settlement_change', targetType: 'policy', afterValue: `${month} 정산 정책 ${policies.length}건 업로드`, performedBy: 'admin' });
    res.json({ success: true, message: `${month} 정산 정책 ${policies.length}건 저장 완료` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 리베이트/환수 ===

// 리베이트/환수 조회 (월별)
router.get('/settlement/adjustments', async (req, res) => {
  try {
    const { month } = req.query;
    let sql = 'SELECT * FROM settlement_adjustments';
    const params = [];
    if (month) { sql += ' WHERE target_month = ?'; params.push(month); }
    sql += ' ORDER BY id DESC';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 리베이트/환수 일괄 저장
// 리베이트/환수 월별 저장 (해당 월만 삭제 후 재삽입)
router.post('/settlement/adjustments/upload', async (req, res) => {
  try {
    const { adjustments, month } = req.body;
    if (!adjustments || !Array.isArray(adjustments)) {
      return res.status(400).json({ success: false, message: 'adjustments 배열이 필요합니다.' });
    }
    if (!month) {
      return res.status(400).json({ success: false, message: '적용월을 선택하세요.' });
    }

    // 마감 여부 확인
    const closed = await query('SELECT is_closed FROM monthly_closes WHERE target_month = ?', [month]);
    if (closed.length > 0 && closed[0].is_closed) {
      return res.status(400).json({ success: false, message: `${month}은 마감 완료되어 수정할 수 없습니다.` });
    }

    // 해당 월 데이터만 삭제
    await query('DELETE FROM settlement_adjustments WHERE target_month = ?', [month]);

    for (const a of adjustments) {
      await query(
        'INSERT INTO settlement_adjustments (type, amount, reason, target_month, manager) VALUES (?, ?, ?, ?, ?)',
        [a.type || '리베이트', a.amount || 0, a.reason || '', month, a.manager || '']
      );
    }

    await logAudit({ eventType: 'settlement_change', targetType: 'adjustment', afterValue: `${month} 리베이트/환수 ${adjustments.length}건 업로드`, performedBy: 'admin' });
    res.json({ success: true, message: `${month} 리베이트/환수 ${adjustments.length}건 저장 완료` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 월 마감 ===

// 마감 이력 조회
router.get('/settlement/monthly-closes', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM monthly_closes ORDER BY target_month DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 월 마감 처리
router.post('/settlement/close-month', async (req, res) => {
  try {
    const { month, closedBy } = req.body;
    if (!month) return res.status(400).json({ success: false, message: '대상월 필수' });

    // 이미 마감 여부
    const existing = await query('SELECT * FROM monthly_closes WHERE target_month = ?', [month]);
    if (existing.length > 0 && existing[0].is_closed) {
      return res.status(400).json({ success: false, message: `${month}은 이미 마감되었습니다.` });
    }

    // 실행 건수/매출 집계
    const [stats] = await query('SELECT COUNT(*) as cnt, COALESCE(SUM(loan_amount),0) as total FROM settlement_executions WHERE DATE_FORMAT(executed_date, "%Y-%m") = ?', [month]);

    if (existing.length > 0) {
      await query('UPDATE monthly_closes SET is_closed=1, closed_by=?, closed_at=NOW(), execution_count=?, total_sales=? WHERE target_month=?',
        [closedBy||'', stats.cnt, stats.total, month]);
    } else {
      await query('INSERT INTO monthly_closes (target_month, is_closed, closed_by, closed_at, execution_count, total_sales) VALUES (?, 1, ?, NOW(), ?, ?)',
        [month, closedBy||'', stats.cnt, stats.total]);
    }

    await logAudit({ eventType: 'close_month', targetType: 'settlement', targetName: month, afterValue: `${month} 마감 (${stats.cnt}건/${stats.total}만)`, performedBy: closedBy });
    res.json({ success: true, message: `${month} 마감 완료` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 마감 해제
router.post('/settlement/reopen-month', async (req, res) => {
  try {
    const { month, reopenedBy, reason } = req.body;
    await query('UPDATE monthly_closes SET is_closed=0, reopened_by=?, reopen_reason=? WHERE target_month=?',
      [reopenedBy||'', reason||'', month]);
    await logAudit({ eventType: 'close_month', targetType: 'settlement', targetName: month, afterValue: `${month} 마감 해제: ${reason}`, performedBy: reopenedBy });
    res.json({ success: true, message: `${month} 마감 해제` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 론앤마스터 승인 건 → 실행 건 자동 등록 ===
router.post('/settlement/sync-from-loans', async (req, res) => {
  try {
    const { loanData } = req.body;
    if (!loanData || !Array.isArray(loanData)) {
      return res.status(400).json({ success: false, message: 'loanData 배열 필요' });
    }

    // 승인 건만 필터 (상태에 '승인' 포함)
    const approved = loanData.filter(r => r.status && r.status.includes('승인') && r.approvedAmount);

    // 정산 정책 조회 (최신 월)
    const policies = await query('SELECT * FROM settlement_policies ORDER BY id');

    // 기존 실행 건 조회 (중복 방지)
    const existing = await query('SELECT customer_name, product_name, executed_date FROM settlement_executions');
    const existKey = new Set(existing.map(e => `${e.customer_name}_${e.product_name}_${e.executed_date ? new Date(e.executed_date).toISOString().split('T')[0] : ''}`));

    let added = 0;
    let skipped = 0;

    for (const loan of approved) {
      const amount = parseInt(String(loan.approvedAmount).replace(/[^0-9]/g, '')) || 0;
      if (amount <= 0) { skipped++; continue; }

      // 실행일: 처리일시에서 날짜 추출
      const dateMatch = (loan.processDate || loan.applyDate || '').match(/(\d{4}-\d{2}-\d{2})/);
      const execDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

      // 중복 체크
      const key = `${loan.customerName}_${loan.productName}_${execDate}`;
      if (existKey.has(key)) { skipped++; continue; }

      // 정산 정책에서 수수료율 찾기 (상품명 부분 매칭)
      let rateUnder = 0, rateOver = 0;
      const productClean = (loan.productName || '').replace(/\(.*\)/, '').trim();
      for (const p of policies) {
        if (loan.productName.includes(p.product) || p.product.includes(productClean)) {
          rateUnder = parseFloat(p.rate_under) || 0;
          rateOver = parseFloat(p.rate_over) || 0;
          break;
        }
      }

      // 수수료 계산 (500만 기준)
      let feeAmount = 0;
      if (amount <= 500) {
        feeAmount = amount * (rateUnder || rateOver) / 100;
      } else {
        feeAmount = amount * (rateOver || rateUnder) / 100;
      }
      feeAmount = Math.round(feeAmount * 10) / 10;

      await query(
        `INSERT INTO settlement_executions (customer_name, executed_date, loan_amount, product_name, fee_rate_under, fee_rate_over, fee_amount, db_source, assigned_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [loan.customerName || '', execDate, amount, loan.productName || '', rateUnder, rateOver, feeAmount, '', loan.recruiter || '']
      );
      existKey.add(key);
      added++;
    }

    await logAudit({ eventType: 'settlement_change', targetType: 'execution', afterValue: `론앤마스터 동기화: ${added}건 등록, ${skipped}건 스킵`, performedBy: 'system' });
    res.json({ success: true, data: { added, skipped, totalApproved: approved.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 매출 집계 ===

// 실행 건 등록
router.post('/settlement/executions', async (req, res) => {
  try {
    const { customerName, executedDate, loanAmount, productName, feeRateUnder, feeRateOver, feeAmount, dbSource, assignedTo } = req.body;
    const result = await query(
      `INSERT INTO settlement_executions (customer_name, executed_date, loan_amount, product_name, fee_rate_under, fee_rate_over, fee_amount, db_source, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerName||'', executedDate, loanAmount||0, productName||'', feeRateUnder||0, feeRateOver||0, feeAmount||0, dbSource||'', assignedTo||'']
    );
    await logAudit({ eventType: 'settlement_change', targetType: 'execution', targetId: result.insertId, afterValue: `실행 건 등록: ${customerName} ${loanAmount}만`, performedBy: assignedTo });
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 실행 건 목록 조회
router.get('/settlement/executions', async (req, res) => {
  try {
    const { month, dbSource, assignedTo } = req.query;
    let sql = 'SELECT * FROM settlement_executions WHERE 1=1';
    const params = [];
    if (month) { sql += ' AND DATE_FORMAT(executed_date, "%Y-%m") = ?'; params.push(month); }
    if (dbSource && dbSource !== '전체 출처') { sql += ' AND db_source = ?'; params.push(dbSource); }
    if (assignedTo && assignedTo !== '전체 담당자') { sql += ' AND assigned_to = ?'; params.push(assignedTo); }
    sql += ' ORDER BY executed_date DESC';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 매출 요약 (월별)
router.get('/settlement/summary', async (req, res) => {
  try {
    const { month } = req.query;
    let monthFilter = '';
    const params = [];
    if (month) {
      monthFilter = ' WHERE DATE_FORMAT(executed_date, "%Y-%m") = ?';
      params.push(month);
    }

    // 총 매출 (대출금액 합계)
    const [totalSales] = await query(`SELECT COALESCE(SUM(loan_amount),0) as total FROM settlement_executions${monthFilter}`, params);

    // 총 수수료
    const [totalFee] = await query(`SELECT COALESCE(SUM(fee_amount),0) as total FROM settlement_executions${monthFilter}`, params);

    // 실행 건수
    const [execCount] = await query(`SELECT COUNT(*) as cnt FROM settlement_executions${monthFilter}`, params);

    // 리베이트 합계
    let rebateFilter = '';
    const rebateParams = [];
    if (month) { rebateFilter = ' AND target_month = ?'; rebateParams.push(month); }
    const [rebateTotal] = await query(`SELECT COALESCE(SUM(amount),0) as total FROM settlement_adjustments WHERE type='리베이트'${rebateFilter}`, rebateParams);

    // 환수 합계
    const [clawbackTotal] = await query(`SELECT COALESCE(SUM(amount),0) as total FROM settlement_adjustments WHERE type='환수'${rebateFilter}`, rebateParams);

    // 출처별 매출
    const bySource = await query(`SELECT db_source, COUNT(*) as cnt, COALESCE(SUM(loan_amount),0) as total_amount, COALESCE(SUM(fee_amount),0) as total_fee FROM settlement_executions${monthFilter} GROUP BY db_source ORDER BY total_amount DESC`, params);

    // 담당자별 매출
    const byAssigned = await query(`SELECT assigned_to, COUNT(*) as cnt, COALESCE(SUM(loan_amount),0) as total_amount, COALESCE(SUM(fee_amount),0) as total_fee FROM settlement_executions${monthFilter} GROUP BY assigned_to ORDER BY total_amount DESC`, params);

    res.json({
      success: true,
      data: {
        totalSales: totalSales.total,
        totalFee: totalFee.total,
        execCount: execCount.cnt,
        rebateTotal: rebateTotal.total,
        clawbackTotal: clawbackTotal.total,
        bySource,
        byAssigned
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

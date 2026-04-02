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
router.post('/settlement/adjustments/upload', async (req, res) => {
  try {
    const { adjustments } = req.body;
    if (!adjustments || !Array.isArray(adjustments)) {
      return res.status(400).json({ success: false, message: 'adjustments 배열이 필요합니다.' });
    }

    for (const a of adjustments) {
      await query(
        'INSERT INTO settlement_adjustments (type, amount, reason, target_month, manager) VALUES (?, ?, ?, ?, ?)',
        [a.type || '리베이트', a.amount || 0, a.reason || '', a.month || '', a.manager || '']
      );
    }

    await logAudit({ eventType: 'settlement_change', targetType: 'adjustment', afterValue: `리베이트/환수 ${adjustments.length}건 업로드`, performedBy: 'admin' });
    res.json({ success: true, message: `${adjustments.length}건 저장 완료` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// === 정산 정책 ===

// 정산 정책 전체 조회
router.get('/settlement/policies', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM settlement_policies ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 정산 정책 일괄 저장 (기존 삭제 후 재삽입)
router.post('/settlement/policies/upload', async (req, res) => {
  try {
    const { policies } = req.body;
    if (!policies || !Array.isArray(policies)) {
      return res.status(400).json({ success: false, message: 'policies 배열이 필요합니다.' });
    }

    // 기존 데이터 삭제
    await query('DELETE FROM settlement_policies');

    // 새 데이터 삽입
    for (const p of policies) {
      await query(
        'INSERT INTO settlement_policies (category, product, rate_under, rate_over, auth) VALUES (?, ?, ?, ?, ?)',
        [p.category || '', p.product || '', p.rateUnder || '', p.rateOver || '', p.auth || '']
      );
    }

    res.json({ success: true, message: `${policies.length}건 저장 완료` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 리베이트/환수 ===

// 리베이트/환수 전체 조회
router.get('/settlement/adjustments', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM settlement_adjustments ORDER BY id DESC');
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

    res.json({ success: true, message: `${adjustments.length}건 저장 완료` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

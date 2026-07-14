const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// 상담 기록 저장
router.post('/consultations', async (req, res) => {
  try {
    const { customerId, channel, content, consultedBy } = req.body;
    if (!customerId || !content) {
      return res.status(400).json({ success: false, message: '고객ID와 내용은 필수입니다.' });
    }
    await query(
      'INSERT INTO consultations (customer_id, channel, content, consulted_by) VALUES (?, ?, ?, ?)',
      [customerId, channel || '메모', content, consultedBy || '']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 상담 기록 조회
router.get('/consultations', async (req, res) => {
  try {
    const { customerId } = req.query;
    let sql = 'SELECT * FROM consultations';
    const params = [];
    if (customerId) { sql += ' WHERE customer_id = ?'; params.push(customerId); }
    sql += ' ORDER BY consulted_at DESC LIMIT 50';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

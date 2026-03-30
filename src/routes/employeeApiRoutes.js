const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../database/db');

// 직원 목록 조회
router.get('/employees', async (req, res) => {
  try {
    const { search, role, status } = req.query;
    let sql = 'SELECT id, login_id, name, department, position_title, role, data_scope, is_active, join_date, created_at FROM employees WHERE 1=1';
    const params = [];

    if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`); }
    if (role && role !== '전체 역할') { sql += ' AND role = ?'; params.push(role === '관리자' ? 'admin' : 'sales'); }
    if (status === '활성') { sql += ' AND is_active = 1'; }
    if (status === '비활성') { sql += ' AND is_active = 0'; }

    sql += ' ORDER BY id';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 직원 등록
router.post('/employees', async (req, res) => {
  try {
    const { loginId, name, department, position, role, dataScope, password, joinDate } = req.body;
    if (!loginId || !name || !password) {
      return res.status(400).json({ success: false, message: '아이디, 이름, 비밀번호는 필수입니다.' });
    }

    const existing = await query('SELECT id FROM employees WHERE login_id = ?', [loginId]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '이미 존재하는 아이디입니다.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO employees (login_id, name, department, position_title, role, data_scope, password_hash, join_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [loginId, name, department || '', position || '', role || 'sales', dataScope || 'self', hash, joinDate || null]
    );

    res.json({ success: true, data: { id: result.insertId }, message: '직원 등록 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 직원 수정
router.put('/employees/:id', async (req, res) => {
  try {
    const { name, department, position, role, dataScope, isActive, joinDate } = req.body;
    await query(
      'UPDATE employees SET name=?, department=?, position_title=?, role=?, data_scope=?, is_active=?, join_date=? WHERE id=?',
      [name, department || '', position || '', role || 'sales', dataScope || 'self', isActive !== false ? 1 : 0, joinDate || null, req.params.id]
    );
    res.json({ success: true, message: '수정 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 비밀번호 재설정
router.put('/employees/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: '새 비밀번호를 입력하세요.' });

    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE employees SET password_hash=? WHERE id=?', [hash, req.params.id]);
    res.json({ success: true, message: '비밀번호 변경 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../database/db');
const { createSession, deleteSession } = require('../middleware/apiAuth');

// 로그인
router.post('/system/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력하세요.' });
    }

    const rows = await query('SELECT * FROM employees WHERE login_id = ?', [loginId]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '아이디가 존재하지 않습니다.' });
    }

    const employee = rows[0];

    if (!employee.is_active) {
      return res.status(401).json({ success: false, message: '비활성화된 계정입니다. 관리자에게 문의하세요.' });
    }

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }

    // 감사로그 기록
    await query(
      'INSERT INTO audit_logs (event_type, target_type, target_id, target_name, performed_by, performed_by_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['login', 'employee', employee.id, employee.name, employee.name, employee.id]
    );

    const userData = {
      id: employee.id,
      loginId: employee.login_id,
      name: employee.name,
      department: employee.department,
      position: employee.position_title,
      role: employee.role,
      dataScope: employee.data_scope
    };
    const token = createSession(employee.id, userData);

    res.json({
      success: true,
      data: { ...userData, token }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');

// 로그인
router.post('/system/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력하세요.' });
    }

    const employee = Employee.findByLoginId(loginId);
    if (!employee) {
      return res.status(401).json({ success: false, message: '아이디가 존재하지 않습니다.' });
    }

    if (!employee.isActive) {
      return res.status(401).json({ success: false, message: '비활성화된 계정입니다. 관리자에게 문의하세요.' });
    }

    const valid = await employee.verifyPassword(password);
    if (!valid) {
      return res.status(401).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }

    res.json({
      success: true,
      data: {
        id: employee.id,
        loginId: employee.loginId,
        name: employee.name,
        department: employee.department,
        position: employee.position,
        role: employee.role,
        dataScope: employee.dataScope
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

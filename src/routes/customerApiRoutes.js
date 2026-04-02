const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { logAudit } = require('../database/auditHelper');
const { maskCustomerList, maskCustomer } = require('../middleware/maskData');

// 고객 등록
router.post('/customers', async (req, res) => {
  try {
    const { name, ssn, phone, phone2, email, address, residenceAddress, company, companyAddr, companyPhone,
      salary, employmentType, workYears, courtName, caseNo, refundBank, refundAccount, refundHolder,
      creditScore, creditStatus, totalDebt, existingLoans, dbSource, assignedTo, status, memo, loanDate, loanAmount } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: '고객명과 연락처는 필수입니다.' });
    }

    // 주민번호로 나이/성별 자동 계산
    let age = 0;
    if (ssn && ssn.length >= 6) {
      const birthYear = parseInt(ssn.substring(0, 2));
      const century = (ssn.length > 7 && (ssn.charAt(7) === '3' || ssn.charAt(7) === '4')) ? 2000 : 1900;
      age = new Date().getFullYear() - (century + birthYear);
    }

    const result = await query(
      `INSERT INTO customers (name, ssn, age, phone, phone2, email, address, residence_address,
        company, company_addr, company_phone, salary, employment_type, work_years,
        court_name, case_no, refund_bank, refund_account, refund_holder,
        credit_score, credit_status, total_debt, existing_loans, db_source,
        assigned_to, status, memo, loan_date, loan_amount, reg_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [name, ssn||'', age, phone, phone2||'', email||'', address||'', residenceAddress||'',
       company||'', companyAddr||'', companyPhone||'', salary||0, employmentType||'', workYears||'',
       courtName||'', caseNo||'', refundBank||'', refundAccount||'', refundHolder||'',
       creditScore||0, creditStatus||'정상', totalDebt||'0', existingLoans||'', dbSource||'',
       assignedTo||'', status||'리드', memo||'', loanDate||null, loanAmount||'']
    );

    await logAudit({ eventType: 'customer_edit', targetType: 'customer', targetId: result.insertId, targetName: name, afterValue: '고객 등록', performedBy: assignedTo || 'admin' });

    res.json({ success: true, data: { id: result.insertId }, message: '고객 등록 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 고객 목록 조회
router.get('/customers', async (req, res) => {
  try {
    const { search, creditStatus, status, assignedTo } = req.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (creditStatus && creditStatus !== '전체 신용상태') { sql += ' AND credit_status = ?'; params.push(creditStatus); }
    if (status && status !== '전체 진행상태') { sql += ' AND status = ?'; params.push(status); }
    if (assignedTo && assignedTo !== '전체 담당자') { sql += ' AND assigned_to = ?'; params.push(assignedTo); }

    sql += ' ORDER BY id DESC LIMIT 100';
    const rows = await query(sql, params);
    res.json({ success: true, data: maskCustomerList(rows) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 고객 상세
router.get('/customers/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: '고객을 찾을 수 없습니다.' });
    res.json({ success: true, data: maskCustomer(rows[0]) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 고객 수정
router.put('/customers/:id', async (req, res) => {
  try {
    const { name, ssn, phone, phone2, email, address, residenceAddress, company, companyAddr, companyPhone,
      salary, employmentType, workYears, courtName, caseNo, refundBank, refundAccount, refundHolder,
      creditScore, creditStatus, totalDebt, existingLoans, dbSource, assignedTo, status, memo } = req.body;

    await query(
      `UPDATE customers SET name=?, ssn=?, phone=?, phone2=?, email=?, address=?, residence_address=?,
        company=?, company_addr=?, company_phone=?, salary=?, employment_type=?, work_years=?,
        court_name=?, case_no=?, refund_bank=?, refund_account=?, refund_holder=?,
        credit_score=?, credit_status=?, total_debt=?, existing_loans=?, db_source=?,
        assigned_to=?, status=?, memo=? WHERE id=?`,
      [name, ssn||'', phone, phone2||'', email||'', address||'', residenceAddress||'',
       company||'', companyAddr||'', companyPhone||'', salary||0, employmentType||'', workYears||'',
       courtName||'', caseNo||'', refundBank||'', refundAccount||'', refundHolder||'',
       creditScore||0, creditStatus||'정상', totalDebt||'0', existingLoans||'', dbSource||'',
       assignedTo||'', status||'리드', memo||'', req.params.id]
    );

    await logAudit({ eventType: 'customer_edit', targetType: 'customer', targetId: req.params.id, targetName: name, afterValue: '고객 정보 수정', performedBy: 'admin' });

    res.json({ success: true, message: '수정 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 고객 삭제
router.delete('/customers/:id', async (req, res) => {
  try {
    const rows = await query('SELECT name FROM customers WHERE id = ?', [req.params.id]);
    await query('DELETE FROM customers WHERE id = ?', [req.params.id]);
    await logAudit({ eventType: 'customer_delete', targetType: 'customer', targetId: req.params.id, targetName: rows[0]?.name || '', afterValue: '고객 삭제', performedBy: 'admin' });
    res.json({ success: true, message: '삭제 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { logAudit } = require('../database/auditHelper');
const { maskCustomerList, maskCustomer } = require('../middleware/maskData');

// 주민번호 → 만 나이 (생일 미경과 시 -1)
function ageFromSsn(rawSsn) {
  const ssn = (rawSsn || '').replace(/-/g, '');
  if (ssn.length < 7) return 0;
  const g = ssn.charAt(6);
  let century;
  if (g === '1' || g === '2' || g === '5' || g === '6') century = 1900;
  else if (g === '3' || g === '4' || g === '7' || g === '8') century = 2000;
  else if (g === '9' || g === '0') century = 1800;
  else return 0;
  const birthYear = century + parseInt(ssn.substring(0, 2));
  const birthMonth = parseInt(ssn.substring(2, 4));
  const birthDay = parseInt(ssn.substring(4, 6));
  if (!birthMonth || !birthDay) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  if (today.getMonth() + 1 < birthMonth ||
      (today.getMonth() + 1 === birthMonth && today.getDate() < birthDay)) age--;
  return age < 0 ? 0 : age;
}

// 고객 등록
router.post('/customers', async (req, res) => {
  try {
    const { name, ssn, phone, carrier, phone2, email, address, residenceAddress, housingType, housingOwnership,
      company, companyAddr, companyPhone, salary, employmentType, has4Insurance, joinDate, workYears,
      vehicleNo, vehicleName, vehicleYear, vehicleKm, vehicleOwnership, vehicleCoOwner,
      recoveryType, recoveryPaidCount, recoveryTotalCount, courtName, caseNo, refundBank, refundAccount, refundHolder, monthlyPayment,
      creditScore, creditStatus, totalDebt, existingLoans, dbSource, assignedTo, status, memo, loanDate, loanAmount } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: '고객명과 연락처는 필수입니다.' });
    }

    // 이름 + 주민번호 중복 체크
    if (ssn) {
      const existing = await query('SELECT id, name FROM customers WHERE name = ? AND ssn = ?', [name, ssn]);
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: `이미 등록된 고객입니다. (${name}, 주민번호 일치)` });
      }
    }

    // 주민번호로 만 나이 자동 계산
    const age = ageFromSsn(ssn);

    const result = await query(
      `INSERT INTO customers (name, ssn, age, phone, carrier, phone2, email, address, residence_address,
        housing_type, housing_ownership, company, company_addr, company_phone,
        salary, employment_type, has_4_insurance, join_date, work_years,
        vehicle_no, vehicle_name, vehicle_year, vehicle_km, vehicle_ownership, vehicle_co_owner,
        recovery_type, recovery_paid_count, recovery_total_count, court_name, case_no, refund_bank, refund_account, refund_holder, monthly_payment,
        credit_score, credit_status, total_debt, existing_loans, db_source,
        assigned_to, status, memo, loan_date, loan_amount, reg_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [name, ssn||'', age, phone, carrier||'', phone2||'', email||'', address||'', residenceAddress||'',
       housingType||'', housingOwnership||'', company||'', companyAddr||'', companyPhone||'',
       salary||0, employmentType||'', has4Insurance||'', joinDate||null, workYears||'',
       vehicleNo||'', vehicleName||'', vehicleYear||'', vehicleKm||'', vehicleOwnership||'', vehicleCoOwner||'',
       recoveryType||'', recoveryPaidCount||'', recoveryTotalCount||'', courtName||'', caseNo||'', refundBank||'', refundAccount||'', refundHolder||'', monthlyPayment||'',
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
    let sql = `SELECT c.*,
      (SELECT GROUP_CONCAT(
         CONCAT(DATE_FORMAT(se2.executed_date, '%Y-%m-%d'), ' ', se2.product_name, ' ', se2.loan_amount, '만 ', IFNULL(se2.status,'승인'))
         ORDER BY se2.executed_date DESC SEPARATOR ' / '
       )
       FROM settlement_executions se2 WHERE se2.customer_name = c.name) as loan_list,
      (SELECT MAX(se3.executed_date) FROM settlement_executions se3 WHERE se3.customer_name = c.name AND se3.status = '승인') as last_loan_date,
      (SELECT SUM(se4.loan_amount) FROM settlement_executions se4 WHERE se4.customer_name = c.name AND se4.status = '승인') as total_loan_amount
      FROM customers c
      WHERE 1=1`;
    const params = [];

    if (search) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (creditStatus && creditStatus !== '전체 신용상태') { sql += ' AND c.credit_status = ?'; params.push(creditStatus); }
    if (status && status !== '전체 진행상태') { sql += ' AND c.status = ?'; params.push(status); }
    if (assignedTo && assignedTo !== '전체 담당자') { sql += ' AND c.assigned_to = ?'; params.push(assignedTo); }

    sql += ' ORDER BY c.id DESC LIMIT 100';
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
    const raw = req.query.raw === '1';
    res.json({ success: true, data: raw ? rows[0] : maskCustomer(rows[0]) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 고객 수정
router.put('/customers/:id', async (req, res) => {
  try {
    const { name, ssn, phone, carrier, phone2, email, address, residenceAddress, housingType, housingOwnership,
      company, companyAddr, companyPhone, salary, employmentType, has4Insurance, joinDate, workYears,
      vehicleNo, vehicleName, vehicleYear, vehicleKm, vehicleOwnership, vehicleCoOwner,
      recoveryType, recoveryPaidCount, recoveryTotalCount, courtName, caseNo,
      refundBank, refundAccount, refundHolder, monthlyPayment,
      creditScore, creditStatus, existingLoans, dbSource, assignedTo, status, memo } = req.body;

    const age = ageFromSsn(ssn);

    await query(
      `UPDATE customers SET name=?, ssn=?, age=?, phone=?, carrier=?, phone2=?, email=?, address=?, residence_address=?,
        housing_type=?, housing_ownership=?,
        company=?, company_addr=?, company_phone=?, salary=?, employment_type=?, has_4_insurance=?, join_date=?, work_years=?,
        vehicle_no=?, vehicle_name=?, vehicle_year=?, vehicle_km=?, vehicle_ownership=?, vehicle_co_owner=?,
        recovery_type=?, recovery_paid_count=?, recovery_total_count=?,
        court_name=?, case_no=?, refund_bank=?, refund_account=?, refund_holder=?, monthly_payment=?,
        credit_score=?, credit_status=?, existing_loans=?, db_source=?,
        assigned_to=? WHERE id=?`,
      [name, ssn||'', age, phone, carrier||'', phone2||'', email||'', address||'', residenceAddress||'',
       housingType||'', housingOwnership||'',
       company||'', companyAddr||'', companyPhone||'', salary||0, employmentType||'', has4Insurance||'', joinDate||null, workYears||'',
       vehicleNo||'', vehicleName||'', vehicleYear||'', vehicleKm||'', vehicleOwnership||'', vehicleCoOwner||'',
       recoveryType||'', recoveryPaidCount||'', recoveryTotalCount||'',
       courtName||'', caseNo||'', refundBank||'', refundAccount||'', refundHolder||'', monthlyPayment||'',
       creditScore||0, creditStatus||'', existingLoans||'', dbSource||'',
       assignedTo||'', req.params.id]
    );

    await logAudit({ eventType: 'customer_edit', targetType: 'customer', targetId: req.params.id, targetName: name, afterValue: '고객 정보 수정', performedBy: req.user?.name || 'admin' });

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
    await logAudit({ eventType: 'customer_delete', targetType: 'customer', targetId: req.params.id, targetName: rows[0]?.name || '', afterValue: '고객 삭제', performedBy: req.user?.name || 'admin' });
    res.json({ success: true, message: '삭제 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

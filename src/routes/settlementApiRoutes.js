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
// 상품명 정규화: '유노스(회생/파산).' vs '유노스(회생/파산)' 같이 꼬리에 문장부호가 달라서
// 중복으로 쌓이던 버그 대응. 크롤러/sync/dedup 에서 동일 규칙 사용.
function normalizeProductName(name) {
  if (!name) return '';
  return String(name).trim().replace(/[\s.,·…ㆍ]+$/u, '').trim();
}

router.post('/settlement/sync-from-loans', async (req, res) => {
  try {
    const { loanData, performedBy } = req.body;
    if (!loanData || !Array.isArray(loanData)) {
      return res.status(400).json({ success: false, message: 'loanData 배열 필요' });
    }

    // 승인 + 부결 건 필터 (접수/심사 제외) + 상품명 정규화
    const targetLoans = loanData
      .filter(r => r.status && (r.status.includes('승인') || r.status.includes('부결')))
      .map(r => ({ ...r, productName: normalizeProductName(r.productName) }));

    // 정산 정책 조회 (최신 월)
    const policies = await query('SELECT * FROM settlement_policies ORDER BY id');

    // 기존 실행 건 조회 (중복 방지) - status 포함
    // 주의: Node Date() 를 경유하면 서버 타임존(KST) ↔ UTC 변환 때문에 날짜가 하루 밀려
    //       동일 건인데도 키가 달라져 중복이 계속 쌓였음. MySQL 에서 직접 YYYY-MM-DD 포맷으로 받아 비교.
    const existing = await query("SELECT customer_name, product_name, DATE_FORMAT(executed_date, '%Y-%m-%d') AS executed_date_str, status FROM settlement_executions");
    const existKey = new Set(existing.map(e => `${e.customer_name}_${e.product_name}_${e.executed_date_str || ''}_${e.status || '승인'}`));

    // 담당자: 로그인 사용자 (req.user 또는 performedBy)
    const assignedTo = req.user?.name || performedBy || '';

    let added = 0;
    let skipped = 0;

    for (const loan of targetLoans) {
      const amount = parseInt(String(loan.approvedAmount).replace(/[^0-9]/g, '')) || 0;
      const loanStatus = loan.status.includes('승인') ? '승인' : '부결';

      // 실행일: 처리일시에서 날짜 추출
      const dateMatch = (loan.processDate || loan.applyDate || '').match(/(\d{4}-\d{2}-\d{2})/);
      const execDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

      // 중복 체크
      const key = `${loan.customerName}_${loan.productName}_${execDate}_${loanStatus}`;
      if (existKey.has(key)) { skipped++; continue; }

      // 고객원장에서 DB출처 조회
      let dbSource = '';
      const custRows = await query('SELECT id, db_source FROM customers WHERE name = ? LIMIT 1', [loan.customerName]);
      if (custRows.length > 0) dbSource = custRows[0].db_source || '';

      let rateUnder = 0, rateOver = 0, feeAmount = 0;
      if (loanStatus === '승인' && amount > 0) {
        // 정산 정책에서 수수료율 찾기
        const productClean = (loan.productName || '').replace(/\(.*\)/, '').trim();
        for (const p of policies) {
          if (loan.productName.includes(p.product) || p.product.includes(productClean)) {
            rateUnder = parseFloat(p.rate_under) || 0;
            rateOver = parseFloat(p.rate_over) || 0;
            break;
          }
        }
        // 수수료 계산 (500만 기준)
        if (amount <= 500) {
          feeAmount = amount * (rateUnder || rateOver) / 100;
        } else {
          feeAmount = amount * (rateOver || rateUnder) / 100;
        }
        feeAmount = Math.round(feeAmount * 10) / 10;
      }

      await query(
        `INSERT INTO settlement_executions (customer_name, executed_date, loan_amount, product_name, fee_rate_under, fee_rate_over, fee_amount, db_source, assigned_to, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [loan.customerName || '', execDate, amount, loan.productName || '', rateUnder, rateOver, feeAmount, dbSource, assignedTo, loanStatus]
      );

      // 고객 상태 자동 변경 (승인/부결)
      if (custRows.length > 0) {
        await query('UPDATE customers SET status = ? WHERE id = ?', [loanStatus, custRows[0].id]);
      }

      existKey.add(key);
      added++;
    }

    await logAudit({ eventType: 'settlement_change', targetType: 'execution', afterValue: `론앤마스터 동기화: ${added}건 등록, ${skipped}건 스킵`, performedBy: 'system' });
    res.json({ success: true, data: { added, skipped, total: targetLoans.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 실행 건 중복 정리 (관리자용) ===
// 동일 (customer_name, product_name, executed_date, status) 그룹에서 MAX(id) 1건만 남기고 삭제.
// 대량 데이터에서도 안전하도록 SQL 레벨에서 직접 삭제 (GROUP_CONCAT truncation 위험 없음).
router.post('/settlement/dedupe-executions', async (req, res) => {
  try {
    const { apply = false } = req.body || {};

    // 0) 상품명 정규화 — 뒤에 '.' , ',' , 공백, 중점, 말줄임표가 붙어서 같은 상품이 다른 이름으로
    //    쌓여있던 케이스를 먼저 합친다. MySQL 정규식 버전에 관계없이 안전하게 반복 TRIM.
    //    예: '유노스(회생/파산).' → '유노스(회생/파산)'
    let normalizedRows = 0;
    if (apply) {
      const norm = await query(`
        UPDATE settlement_executions
        SET product_name = TRIM(
          TRAILING '.' FROM TRIM(
            TRAILING ',' FROM TRIM(
              TRAILING '·' FROM TRIM(
                TRAILING 'ㆍ' FROM TRIM(product_name)
              )
            )
          )
        )
        WHERE product_name REGEXP '[ .,·ㆍ]+$'
      `);
      normalizedRows = (norm && norm.affectedRows) || 0;
    }

    // 1) 통계: 중복 그룹 수 + 총 삭제 예정 건수
    const [stats] = await query(`
      SELECT
        COUNT(*) AS total_rows,
        COUNT(DISTINCT customer_name, product_name,
          DATE_FORMAT(executed_date, '%Y-%m-%d'), IFNULL(status, '승인')) AS distinct_groups
      FROM settlement_executions
    `);
    const totalToDelete = Math.max(0, (stats.total_rows || 0) - (stats.distinct_groups || 0));

    const [grpStats] = await query(`
      SELECT COUNT(*) AS dupe_groups FROM (
        SELECT 1
        FROM settlement_executions
        GROUP BY customer_name, product_name,
                 DATE_FORMAT(executed_date, '%Y-%m-%d'),
                 IFNULL(status, '승인')
        HAVING COUNT(*) > 1
      ) t
    `);
    const totalDupeGroups = grpStats.dupe_groups || 0;

    // 2) 샘플(상위 20개 중복 그룹) - preview 용. GROUP_CONCAT 제한을 3만자까지 열어둠.
    await query(`SET SESSION group_concat_max_len = 30000`).catch(() => {});
    const sample = await query(`
      SELECT customer_name, product_name,
             DATE_FORMAT(executed_date, '%Y-%m-%d') AS executed_date,
             IFNULL(status, '승인') AS status,
             COUNT(*) AS cnt,
             MAX(id) AS keep_id,
             SUBSTRING_INDEX(GROUP_CONCAT(id ORDER BY id), ',', 20) AS ids_preview
      FROM settlement_executions
      GROUP BY customer_name, product_name,
               DATE_FORMAT(executed_date, '%Y-%m-%d'),
               IFNULL(status, '승인')
      HAVING cnt > 1
      ORDER BY cnt DESC
      LIMIT 20
    `);

    if (!apply) {
      return res.json({
        success: true,
        dryRun: true,
        totalRows: stats.total_rows || 0,
        totalDupeGroups,
        totalToDelete,
        sampleGroups: sample
      });
    }

    // 3) 실제 삭제 — 각 그룹에서 MAX(id)가 아닌 행 일괄 삭제
    //    JOIN 방식으로 DB 가 직접 처리 (app 쪽 id 리스트 불필요)
    const result = await query(`
      DELETE e FROM settlement_executions e
      JOIN (
        SELECT customer_name, product_name,
               DATE_FORMAT(executed_date, '%Y-%m-%d') AS d,
               IFNULL(status, '승인') AS st,
               MAX(id) AS keep_id
        FROM settlement_executions
        GROUP BY customer_name, product_name,
                 DATE_FORMAT(executed_date, '%Y-%m-%d'),
                 IFNULL(status, '승인')
        HAVING COUNT(*) > 1
      ) k
        ON k.customer_name = e.customer_name
       AND k.product_name  = e.product_name
       AND k.d             = DATE_FORMAT(e.executed_date, '%Y-%m-%d')
       AND k.st            = IFNULL(e.status, '승인')
       AND e.id <> k.keep_id
    `);
    const deleted = (result && result.affectedRows) || 0;

    await logAudit({
      eventType: 'settlement_change',
      targetType: 'execution',
      afterValue: `실행 건 중복 정리: 이름정규화 ${normalizedRows}건, ${totalDupeGroups}그룹, ${deleted}건 삭제`,
      performedBy: req.user?.name || 'admin'
    });

    res.json({ success: true, applied: true, normalizedRows, totalDupeGroups, deleted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 실행 건 일괄 삭제 (관리자용, 매우 주의) ===
// keep 필터와 **정확히 일치하는 행** 중 MIN(id) 1건만 남기고,
// 해당 필터와 일치하지 않는 행 + 일치하는 행 중 MIN(id) 이외 행을 모두 삭제.
// apply=false 는 건수만, apply=true + confirmText='PURGE' 일 때만 실제 삭제.
router.post('/settlement/purge-executions', async (req, res) => {
  try {
    const { keep = {}, apply = false, confirmText } = req.body || {};

    if (!keep.customerName || !keep.productName) {
      return res.status(400).json({
        success: false,
        message: 'keep.customerName + keep.productName 최소 2개는 필수입니다.'
      });
    }

    const conds = [];
    const params = [];
    if (keep.customerName)  { conds.push('customer_name = ?'); params.push(keep.customerName); }
    // 상품명은 뒤에 '.' 등이 붙어있어도 매칭되도록 기본이 prefix 매칭
    // exactProduct=true 로 명시하면 완전 일치
    if (keep.productName) {
      if (keep.exactProduct) {
        conds.push('product_name = ?'); params.push(keep.productName);
      } else {
        // 입력한 productName 에서 trailing 문장부호 제거 후 prefix 로 매칭
        const base = String(keep.productName).trim().replace(/[\s.,·…ㆍ]+$/u, '');
        conds.push("REPLACE(REPLACE(REPLACE(product_name, '.', ''), ',', ''), ' ', '') LIKE ?");
        const stripped = base.replace(/[\s.,]/g, '');
        params.push(stripped + '%');
      }
    }
    if (keep.executedDate)  { conds.push("DATE_FORMAT(executed_date, '%Y-%m-%d') = ?"); params.push(keep.executedDate); }
    if (keep.loanAmount !== undefined && keep.loanAmount !== null && keep.loanAmount !== '') {
      conds.push('loan_amount = ?'); params.push(Number(keep.loanAmount));
    }
    if (keep.status)        { conds.push("IFNULL(status, '승인') = ?"); params.push(keep.status); }
    if (keep.dbSource)      { conds.push('db_source = ?'); params.push(keep.dbSource); }
    if (keep.assignedTo)    { conds.push('assigned_to = ?'); params.push(keep.assignedTo); }

    const whereKeep = conds.join(' AND ');

    // 통계 + 고객 관련 실제 존재값 샘플 (진단용)
    const [totals] = await query('SELECT COUNT(*) AS cnt FROM settlement_executions');
    const matches = await query(`SELECT id, customer_name, product_name, DATE_FORMAT(executed_date, '%Y-%m-%d') AS d, loan_amount, status, db_source, assigned_to FROM settlement_executions WHERE ${whereKeep} ORDER BY id`, params);

    if (matches.length === 0) {
      // 고객명만 같은 행들을 보여줘서 사용자가 실제 값 확인할 수 있게
      const customerRows = keep.customerName
        ? await query(`SELECT id, customer_name, product_name, DATE_FORMAT(executed_date, '%Y-%m-%d') AS d, loan_amount, status, db_source, assigned_to FROM settlement_executions WHERE customer_name = ? ORDER BY id LIMIT 20`, [keep.customerName])
        : [];
      return res.status(400).json({
        success: false,
        message: 'keep 필터와 일치하는 행이 없습니다. 삭제를 중단했습니다. customerRows 확인 후 조건을 조정하세요.',
        keep, matchedCount: 0,
        customerRows
      });
    }

    const keepId = matches[0].id; // 일치하는 것 중 가장 작은 id 만 유지
    const willDelete = (totals.cnt || 0) - 1;

    if (!apply) {
      return res.json({
        success: true,
        dryRun: true,
        totalRows: totals.cnt,
        matchedCount: matches.length,
        keepId,
        keepRow: matches[0],
        willDelete,
        otherMatches: matches.slice(1, 10)  // 일치하지만 중복으로 삭제될 것들 미리보기
      });
    }

    if (confirmText !== 'PURGE') {
      return res.status(400).json({
        success: false,
        message: "실제 삭제하려면 body.confirmText 에 정확히 'PURGE' 문자열을 넣어주세요."
      });
    }

    const result = await query('DELETE FROM settlement_executions WHERE id <> ?', [keepId]);
    const deleted = (result && result.affectedRows) || 0;

    await logAudit({
      eventType: 'settlement_change',
      targetType: 'execution',
      afterValue: `실행 건 일괄삭제: keep={${JSON.stringify(keep)}}, keepId=${keepId}, 삭제 ${deleted}건`,
      performedBy: req.user?.name || 'admin'
    });

    res.json({ success: true, applied: true, keepId, deleted });
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
    const { month, dbSource, assignedTo, customerName } = req.query;
    let sql = 'SELECT * FROM settlement_executions WHERE 1=1';
    const params = [];
    if (customerName) { sql += ' AND customer_name = ?'; params.push(customerName); }
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

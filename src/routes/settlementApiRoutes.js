const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { logAudit } = require('../database/auditHelper');
const {
  EXCLUDED_ASSIGNEES: SETTLEMENT_EXCLUDED_ASSIGNEES,
  buildApprovedAndVisibleClause,
} = require('../config/settlementFilters');

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
    if (policies.length === 0) {
      // 0 건으로 올리면 DELETE 만 돌아 해당 월 데이터가 전부 날아감 — 사고 방지
      return res.status(400).json({ success: false, message: '업로드할 정책이 0건입니다. 기존 데이터를 보호하려면 빈 업로드를 거부합니다.' });
    }
    if (!month) {
      return res.status(400).json({ success: false, message: '적용월을 선택하세요.' });
    }

    // 마감 여부 확인
    const closed = await query('SELECT is_closed FROM monthly_closes WHERE target_month = ?', [month]);
    if (closed.length > 0 && closed[0].is_closed) {
      return res.status(400).json({ success: false, message: `${month}은 마감 완료되어 수정할 수 없습니다.` });
    }

    // 해당 월 데이터만 삭제 + 재삽입 (동일 커넥션에서 수행하면 더 안전하지만
    //   현재 query() 풀 구조에서는 커넥션 별도 획득이 어려워 순차 실행만 보장.
    //   실패 시 sum 이 어긋나면 클라이언트가 감지해 경고 모달로 표시.)
    await query('DELETE FROM settlement_policies WHERE target_month = ?', [month]);

    let inserted = 0;
    for (const p of policies) {
      const r = await query(
        'INSERT INTO settlement_policies (category, product, rate_under, rate_over, auth, target_month) VALUES (?, ?, ?, ?, ?, ?)',
        [p.category || '', p.product || '', p.rateUnder || '', p.rateOver || '', p.auth || '', month]
      );
      if (r && r.affectedRows) inserted += r.affectedRows;
    }

    // 사후 확인 — 실제로 DB 에 저장된 건수를 조회해 클라이언트에 돌려준다
    const [{ cnt: dbCount }] = await query(
      'SELECT COUNT(*) AS cnt FROM settlement_policies WHERE target_month = ?', [month]
    );

    await logAudit({
      eventType: 'settlement_change',
      targetType: 'policy',
      afterValue: `${month} 정산 정책 ${inserted}건 저장 (DB 확인 ${dbCount}건)`,
      performedBy: 'admin',
    });

    res.json({
      success: true,
      message: `${month} 정산 정책 ${inserted}건 저장 완료 (DB 확인 ${dbCount}건)`,
      data: { uploaded: policies.length, inserted, dbCount, month },
    });
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
    if (adjustments.length === 0) {
      return res.status(400).json({ success: false, message: '업로드할 항목이 0건입니다. 기존 데이터를 보호하려면 빈 업로드를 거부합니다.' });
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

    let inserted = 0;
    for (const a of adjustments) {
      const r = await query(
        'INSERT INTO settlement_adjustments (type, amount, reason, target_month, manager) VALUES (?, ?, ?, ?, ?)',
        [a.type || '리베이트', a.amount || 0, a.reason || '', month, a.manager || '']
      );
      if (r && r.affectedRows) inserted += r.affectedRows;
    }

    const [{ cnt: dbCount }] = await query(
      'SELECT COUNT(*) AS cnt FROM settlement_adjustments WHERE target_month = ?', [month]
    );

    await logAudit({
      eventType: 'settlement_change',
      targetType: 'adjustment',
      afterValue: `${month} 리베이트/환수 ${inserted}건 저장 (DB 확인 ${dbCount}건)`,
      performedBy: 'admin',
    });

    res.json({
      success: true,
      message: `${month} 리베이트/환수 ${inserted}건 저장 완료 (DB 확인 ${dbCount}건)`,
      data: { uploaded: adjustments.length, inserted, dbCount, month },
    });
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

    // 실행 건수/매출 집계 — 월 마감도 "승인 + 제외담당자 제외" 기준으로 계산
    const closeParams = [];
    const closeClause = buildApprovedAndVisibleClause(closeParams);
    closeParams.push(month);
    const [stats] = await query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(loan_amount),0) as total
       FROM settlement_executions
       WHERE 1=1 ${closeClause} AND DATE_FORMAT(executed_date, "%Y-%m") = ?`,
      closeParams
    );

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

// 매칭용 키 정규화: 괄호/공백/특수기호 제거 후 소문자화.
//   '유노스(회생/파산)' ↔ '유노스 회생'  양방향 substring 매칭이 되도록.
function matchKey(name) {
  return String(name || '')
    .replace(/[()（）\[\]【】]/g, ' ')
    .replace(/[\s.,·…ㆍ\-_/\\]+/g, '')
    .toLowerCase();
}

// 상품명 ↔ 정책의 금융사명 매칭 (양방향 substring + 최장일치)
//   예) 론앤마스터 "A1차량(마이카론)" ↔ 정책 "A1차량"  → 매칭
//       론앤마스터 "유노스" ↔ 정책 "유노스(회생/파산)" → 매칭
function findMatchingPolicy(productName, policies) {
  const key = matchKey(productName);
  if (!key) return null;
  let best = null;
  let bestLen = 0;
  for (const p of policies) {
    const pKey = matchKey(p.product);
    if (!pKey) continue;
    const matched = key.includes(pKey) || pKey.includes(key);
    if (matched && pKey.length > bestLen) {
      best = p;
      bestLen = pKey.length;
    }
  }
  return best;
}

// 수수료 계산 (500만 기준)
function calcFee(amount, rateUnder, rateOver) {
  const u = parseFloat(rateUnder) || 0;
  const o = parseFloat(rateOver) || 0;
  if (!amount || amount <= 0) return 0;
  const fee = amount <= 500 ? amount * (u || o) / 100 : amount * (o || u) / 100;
  return Math.round(fee * 10) / 10;
}

router.post('/settlement/sync-from-loans', async (req, res) => {
  try {
    const { loanData, performedBy } = req.body;
    if (!loanData || !Array.isArray(loanData)) {
      return res.status(400).json({ success: false, message: 'loanData 배열 필요' });
    }

    // 매출집계는 오직 '승인' 또는 '완납' 상태만. 그 외(가승인/접수/심사/부결/조회중…)는
    // 아예 settlement_executions 에 INSERT 조차 하지 않는다.
    //   - 예전 버그: loan.status.includes('승인') 이 '가승인' 도 매칭시켜 '승인' 으로 저장
    //   - 현재 규칙: exact match 로 '승인' 또는 '완납' 만 허용, '완납' 은 '승인' 으로 정규화
    const APPROVED_STATUSES = ['승인', '완납'];
    const targetLoans = loanData
      .filter(r => r.status && APPROVED_STATUSES.includes(r.status.trim()))
      .map(r => ({ ...r, productName: normalizeProductName(r.productName) }));

    // 정산 정책 조회 (최신 월)
    const policies = await query('SELECT * FROM settlement_policies ORDER BY id');

    // 기존 실행 건 조회 (중복 방지) - status 포함
    // 주의: Node Date() 를 경유하면 서버 타임존(KST) ↔ UTC 변환 때문에 날짜가 하루 밀려
    //       동일 건인데도 키가 달라져 중복이 계속 쌓였음. MySQL 에서 직접 YYYY-MM-DD 포맷으로 받아 비교.
    const existing = await query("SELECT customer_name, product_name, DATE_FORMAT(executed_date, '%Y-%m-%d') AS executed_date_str, status FROM settlement_executions");
    const existKey = new Set(existing.map(e => `${e.customer_name}_${e.product_name}_${e.executed_date_str || ''}_${e.status || '승인'}`));

    // 담당자: 로그인 사용자 (req.user 또는 performedBy).
    // 제외 담당자(윤장호 등) 본인이 로그인해서 동기화한 건은 매출집계 의미가 없으므로
    //   아예 settlement_executions 에 INSERT 자체를 건너뛴다.
    const assignedTo = req.user?.name || performedBy || '';
    if (SETTLEMENT_EXCLUDED_ASSIGNEES.includes(String(assignedTo).trim())) {
      return res.json({ success: true, data: { added: 0, skipped: loanData.length, total: loanData.length, message: '제외 담당자 세션이라 매출/수당 정산에 반영하지 않습니다.' } });
    }

    let added = 0;
    let skipped = 0;

    for (const loan of targetLoans) {
      const amount = parseInt(String(loan.approvedAmount).replace(/[^0-9]/g, '')) || 0;
      // APPROVED_STATUSES 를 통과했으므로 rawStatus 는 '승인' 또는 '완납'.
      // 모두 '승인' 으로 정규화해서 저장. DB 에 가승인/부결 등 다른 값은 절대 들어가지 않음.
      const loanStatus = '승인';

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
        // 정산 정책에서 수수료율 찾기 (정규화 + 양방향 substring 매칭)
        const matched = findMatchingPolicy(loan.productName, policies);
        if (matched) {
          rateUnder = parseFloat(matched.rate_under) || 0;
          rateOver = parseFloat(matched.rate_over) || 0;
        }
        feeAmount = calcFee(amount, rateUnder, rateOver);
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

// === 실행 건 id 호이트리스트 기반 삭제 (관리자용, 단순 버전) ===
// body.keepIds: number[] — 이 id 들만 남기고 나머지 모두 삭제
// apply=true + confirmText='PURGE' 필요
router.post('/settlement/purge-executions-by-ids', async (req, res) => {
  try {
    const { keepIds, apply = false, confirmText } = req.body || {};
    if (!Array.isArray(keepIds) || keepIds.length === 0) {
      return res.status(400).json({ success: false, message: 'keepIds 배열이 필요합니다.' });
    }
    const ids = keepIds.map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: '유효한 id 가 없습니다.' });
    }

    const placeholders = ids.map(() => '?').join(',');

    // 유지 대상 실재 확인
    const keepRows = await query(
      `SELECT id, customer_name, product_name, DATE_FORMAT(executed_date, '%Y-%m-%d') AS d, loan_amount, status, db_source, assigned_to FROM settlement_executions WHERE id IN (${placeholders}) ORDER BY id`,
      ids
    );
    const foundIds = new Set(keepRows.map(r => r.id));
    const missingIds = ids.filter(id => !foundIds.has(id));

    const [{ cnt: totalRows }] = await query('SELECT COUNT(*) AS cnt FROM settlement_executions');
    const willDelete = Math.max(0, totalRows - keepRows.length);

    if (!apply) {
      return res.json({
        success: true,
        dryRun: true,
        totalRows,
        keepIds: ids,
        foundKeepRows: keepRows,
        missingIds,
        willDelete
      });
    }

    if (confirmText !== 'PURGE') {
      return res.status(400).json({
        success: false,
        message: "실제 삭제하려면 body.confirmText 에 정확히 'PURGE' 문자열을 넣어주세요."
      });
    }
    if (missingIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `keepIds 중 DB 에 없는 id 가 있습니다: [${missingIds.join(', ')}]. 확인 후 다시 시도하세요.`
      });
    }

    const result = await query(
      `DELETE FROM settlement_executions WHERE id NOT IN (${placeholders})`,
      ids
    );
    const deleted = (result && result.affectedRows) || 0;

    await logAudit({
      eventType: 'settlement_change',
      targetType: 'execution',
      afterValue: `실행 건 id 기반 일괄삭제: keepIds=[${ids.join(',')}], 삭제 ${deleted}건`,
      performedBy: req.user?.name || 'admin'
    });

    res.json({ success: true, applied: true, keptIds: ids, deleted });
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

// 실행 건 목록 조회 — 기본 '승인' + 제외 담당자 필터. 제외 담당자 상수는 config/settlementFilters.js.
router.get('/settlement/executions', async (req, res) => {
  try {
    const { month, dbSource, assignedTo, customerName, includeAll } = req.query;
    let sql = 'SELECT * FROM settlement_executions WHERE 1=1';
    const params = [];
    if (!includeAll || includeAll === '0') {
      sql += buildApprovedAndVisibleClause(params);
    }
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

// 매출 요약 (월별) — '승인' 건만 집계, 제외 담당자(윤장호) 제외
router.get('/settlement/summary', async (req, res) => {
  try {
    const { month } = req.query;
    const params = [];
    let whereClause = ' WHERE 1=1' + buildApprovedAndVisibleClause(params);
    if (month) {
      whereClause += ' AND DATE_FORMAT(executed_date, "%Y-%m") = ?';
      params.push(month);
    }
    const monthFilter = whereClause; // "승인 + 제외담당자 + (옵션)월" 필터

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

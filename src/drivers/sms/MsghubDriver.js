// LGU+ 메시지허브 SNAP Agent 연동 SMS 드라이버.
//   - 발송: hub_client.UMS_MSG 에 INSERT (MSG_STATUS='ready') → 에이전트가 자동 발송
//   - 결과: UMS_LOG_YYYYMM 에서 DONE_CODE 조회 (에이전트가 complete 후 이관)
//   - dailyfni.sms_logs 에 우리 관리용 이력 저장
const { v4: uuid } = require('uuid');
const { query, hubQuery } = require('../../database/db');

const CALLBACK_NUMBER = process.env.SMS_CALLBACK || '0221380749';
const API_KEY = process.env.MSG_HUB_API_KEY || 'APIHLVmV';

// 단건 발송
async function sendSms({
  customerId,
  customerName,
  phone,
  templateCode,
  templateName = '',
  kvJson = '{}',
  content = '',
  sentBy = '',
}) {
  const clientKey = uuid();

  // 1) UMS_MSG 에 INSERT (에이전트가 폴링해서 발송)
  await hubQuery(
    `INSERT INTO UMS_MSG
       (CLIENT_KEY, TRAFFIC_TYPE, MSG_STATUS, REQ_DATE, TEMPLATE_CODE, CALLBACK_NUMBER, PHONE, KV_JSON)
     VALUES (?, 'normal', 'ready', NOW(), ?, ?, ?, ?)`,
    [clientKey, templateCode, CALLBACK_NUMBER, phone, kvJson]
  );

  // 2) 우리 DB 에 이력 저장
  const result = await query(
    `INSERT INTO sms_logs
       (customer_id, customer_name, phone, msg_type, content, template_name, template_code, client_key, sent_by, status)
     VALUES (?, ?, ?, 'SMS', ?, ?, ?, ?, ?, 'pending')`,
    [customerId || null, customerName || '', phone, content, templateName, templateCode, clientKey, sentBy]
  );

  return { success: true, clientKey, logId: result?.insertId };
}

// 일괄 발송
async function sendSmsBulk({
  recipients,   // [{ customerId, customerName, phone, kvJson }]
  templateCode,
  templateName = '',
  content = '',
  sentBy = '',
}) {
  // 배치 생성
  const batchResult = await query(
    `INSERT INTO sms_batches (template_name, template_code, content, msg_type, total_count, sent_by)
     VALUES (?, ?, ?, 'SMS', ?, ?)`,
    [templateName, templateCode, content, recipients.length, sentBy]
  );
  const batchId = batchResult?.insertId;

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (const r of recipients) {
    try {
      const clientKey = uuid();
      await hubQuery(
        `INSERT INTO UMS_MSG
           (CLIENT_KEY, TRAFFIC_TYPE, MSG_STATUS, REQ_DATE, TEMPLATE_CODE, CALLBACK_NUMBER, PHONE, KV_JSON)
         VALUES (?, 'normal', 'ready', NOW(), ?, ?, ?, ?)`,
        [clientKey, templateCode, CALLBACK_NUMBER, r.phone, r.kvJson || '{}']
      );

      await query(
        `INSERT INTO sms_logs
           (batch_id, customer_id, customer_name, phone, msg_type, content, template_name, template_code, client_key, sent_by, status)
         VALUES (?, ?, ?, ?, 'SMS', ?, ?, ?, ?, ?, 'pending')`,
        [batchId, r.customerId || null, r.customerName || '', r.phone, content, templateName, templateCode, clientKey, sentBy]
      );

      successCount++;
      results.push({ phone: r.phone, success: true, clientKey });
    } catch (e) {
      failCount++;
      results.push({ phone: r.phone, success: false, error: e.message });
    }
  }

  // 배치 카운트 업데이트
  await query(
    'UPDATE sms_batches SET success_count = ?, fail_count = ? WHERE id = ?',
    [successCount, failCount, batchId]
  );

  return { success: true, batchId, total: recipients.length, successCount, failCount, results };
}

// 결과 동기화: pending 상태인 sms_logs 를 UMS_MSG / UMS_LOG 에서 조회해 업데이트
async function syncSmsResults(customerId) {
  const pending = await query(
    "SELECT id, client_key FROM sms_logs WHERE status IN ('pending','sent') " +
    (customerId ? 'AND customer_id = ?' : '') +
    ' ORDER BY sent_at DESC LIMIT 50',
    customerId ? [customerId] : []
  );

  if (pending.length === 0) return { updated: 0 };

  // 현재 월 + 전월 로그 테이블 탐색
  const now = new Date();
  const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}12`
    : `${now.getFullYear()}${String(now.getMonth()).padStart(2, '0')}`;
  const logTables = [`UMS_LOG_${thisMonth}`, `UMS_LOG_${prevMonth}`];

  let updated = 0;
  for (const r of pending) {
    // 먼저 UMS_MSG (아직 이관 안 된 건)
    try {
      const rows = await hubQuery(
        'SELECT MSG_STATUS, DONE_CODE, DONE_CODE_DESC, DONE_DATE FROM UMS_MSG WHERE CLIENT_KEY = ?',
        [r.client_key]
      );
      if (rows.length > 0 && rows[0].MSG_STATUS === 'complete') {
        const ok = rows[0].DONE_CODE === '10000';
        await query(
          'UPDATE sms_logs SET status = ?, done_code = ?, done_desc = ?, done_at = ? WHERE id = ?',
          [ok ? 'done' : 'failed', rows[0].DONE_CODE, rows[0].DONE_CODE_DESC, rows[0].DONE_DATE, r.id]
        );
        updated++;
        continue;
      }
      if (rows.length > 0 && rows[0].MSG_STATUS !== 'ready') {
        await query("UPDATE sms_logs SET status = 'sent' WHERE id = ? AND status = 'pending'", [r.id]);
      }
    } catch (e) {}

    // UMS_LOG 테이블 (이관된 건)
    for (const lt of logTables) {
      try {
        const rows = await hubQuery(
          `SELECT MSG_STATUS, DONE_CODE, DONE_CODE_DESC, DONE_DATE FROM ${lt} WHERE CLIENT_KEY = ?`,
          [r.client_key]
        );
        if (rows.length > 0) {
          const ok = rows[0].DONE_CODE === '10000';
          await query(
            'UPDATE sms_logs SET status = ?, done_code = ?, done_desc = ?, done_at = ? WHERE id = ?',
            [ok ? 'done' : 'failed', rows[0].DONE_CODE, rows[0].DONE_CODE_DESC, rows[0].DONE_DATE, r.id]
          );
          updated++;
          break;
        }
      } catch (e) { /* 로그 테이블 없으면 skip */ }
    }
  }

  // 배치 카운트 업데이트
  const batches = [...new Set(pending.filter(r => r.batch_id).map(r => r.batch_id))];
  for (const batchId of batches) {
    try {
      const rows = await query(
        "SELECT SUM(status='done') AS ok, SUM(status='failed') AS fail FROM sms_logs WHERE batch_id = ?",
        [batchId]
      );
      const s = rows[0];
      await query(
        'UPDATE sms_batches SET success_count = ?, fail_count = ? WHERE id = ?',
        [s.ok || 0, s.fail || 0, batchId]
      );
    } catch (e) {}
  }

  return { updated };
}

module.exports = { sendSms, sendSmsBulk, syncSmsResults };

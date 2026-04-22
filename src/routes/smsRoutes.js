const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { sendSms, sendSmsBulk, syncSmsResults } = require('../drivers/sms/MsghubDriver');

// ========== 템플릿 CRUD ==========

// 템플릿 목록 조회
router.get('/sms/templates', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM sms_templates WHERE is_active = 1 ORDER BY category, name'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 템플릿 단건 조회
router.get('/sms/templates/:id', async (req, res) => {
  try {
    const [row] = await query('SELECT * FROM sms_templates WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: '템플릿을 찾을 수 없습니다.' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 템플릿 생성
router.post('/sms/templates', async (req, res) => {
  try {
    const { name, category, template_code, content, msg_type, variables } = req.body;
    if (!name || !template_code) {
      return res.status(400).json({ success: false, message: 'name, template_code 는 필수입니다.' });
    }
    const result = await query(
      `INSERT INTO sms_templates (name, category, template_code, content, msg_type, variables)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, category || '상담', template_code, content || '', msg_type || 'SMS', variables || null]
    );
    res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 템플릿 수정
router.put('/sms/templates/:id', async (req, res) => {
  try {
    const { name, category, template_code, content, msg_type, variables, is_active } = req.body;
    await query(
      `UPDATE sms_templates
       SET name = ?, category = ?, template_code = ?, content = ?, msg_type = ?, variables = ?, is_active = ?
       WHERE id = ?`,
      [name, category, template_code, content, msg_type, variables, is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 템플릿 삭제 (soft)
router.delete('/sms/templates/:id', async (req, res) => {
  try {
    await query('UPDATE sms_templates SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== 단건 발송 (고객원장 타임라인) ==========

// POST /api/customers/:id/sms
// body: { templateId or templateCode, content, kvJson, msgType }
router.post('/customers/:id/sms', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const { templateId, templateCode: reqTemplateCode, content, kvJson, msgType } = req.body;
    const sentBy = req.user?.name || req.body.sentBy || '';

    // 고객 정보 조회
    const [customer] = await query(
      'SELECT id, name, phone FROM customers WHERE id = ?',
      [customerId]
    );
    if (!customer) {
      return res.status(404).json({ success: false, message: '고객을 찾을 수 없습니다.' });
    }

    // 템플릿 코드 결정 (templateId 우선)
    let templateCode = reqTemplateCode;
    let templateName = '';
    if (templateId) {
      const [t] = await query('SELECT name, template_code FROM sms_templates WHERE id = ?', [templateId]);
      if (!t) return res.status(404).json({ success: false, message: '템플릿을 찾을 수 없습니다.' });
      templateCode = t.template_code;
      templateName = t.name;
    }
    if (!templateCode) {
      return res.status(400).json({ success: false, message: 'templateId 또는 templateCode 필요' });
    }

    const result = await sendSms({
      customerId,
      customerName: customer.name,
      phone: String(customer.phone || '').replace(/[^0-9]/g, ''),
      templateCode,
      templateName,
      kvJson: kvJson || '{}',
      content: content || '',
      sentBy,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== 일괄 발송 (현황관리) ==========

// POST /api/sms/send-bulk
// body: { customerIds: [..], templateId or templateCode, content, kvJsonByCustomerId? }
router.post('/sms/send-bulk', async (req, res) => {
  try {
    const { customerIds, templateId, templateCode: reqTemplateCode, content, kvJsonByCustomerId } = req.body;
    const sentBy = req.user?.name || req.body.sentBy || '';

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'customerIds 배열 필요' });
    }

    // 템플릿 코드 결정
    let templateCode = reqTemplateCode;
    let templateName = '';
    if (templateId) {
      const [t] = await query('SELECT name, template_code FROM sms_templates WHERE id = ?', [templateId]);
      if (!t) return res.status(404).json({ success: false, message: '템플릿을 찾을 수 없습니다.' });
      templateCode = t.template_code;
      templateName = t.name;
    }
    if (!templateCode) {
      return res.status(400).json({ success: false, message: 'templateId 또는 templateCode 필요' });
    }

    // 고객 정보 조회
    const placeholders = customerIds.map(() => '?').join(',');
    const customers = await query(
      `SELECT id, name, phone FROM customers WHERE id IN (${placeholders})`,
      customerIds
    );

    if (customers.length === 0) {
      return res.status(400).json({ success: false, message: '고객을 찾을 수 없습니다.' });
    }

    const recipients = customers.map(c => ({
      customerId: c.id,
      customerName: c.name,
      phone: String(c.phone || '').replace(/[^0-9]/g, ''),
      kvJson: (kvJsonByCustomerId && kvJsonByCustomerId[c.id]) || '{}',
    }));

    const result = await sendSmsBulk({
      recipients,
      templateCode,
      templateName,
      content: content || '',
      sentBy,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== 이력 조회 ==========

// 고객별 발송 이력 (타임라인 합류용)
router.get('/sms/logs', async (req, res) => {
  try {
    const { customerId, limit } = req.query;
    let sql = 'SELECT * FROM sms_logs WHERE 1=1';
    const params = [];
    if (customerId) { sql += ' AND customer_id = ?'; params.push(customerId); }
    sql += ' ORDER BY sent_at DESC LIMIT ?';
    params.push(parseInt(limit) || 50);
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 일괄 발송 배치 목록
router.get('/sms/batches', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM sms_batches ORDER BY sent_at DESC LIMIT 100'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 배치 상세 (개별 발송건)
router.get('/sms/batches/:id', async (req, res) => {
  try {
    const [batch] = await query('SELECT * FROM sms_batches WHERE id = ?', [req.params.id]);
    if (!batch) return res.status(404).json({ success: false, message: '배치를 찾을 수 없습니다.' });
    const logs = await query(
      'SELECT * FROM sms_logs WHERE batch_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json({ success: true, data: { batch, logs } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 결과 동기화 (pending 건들의 최신 상태 가져오기)
router.post('/sms/sync-results', async (req, res) => {
  try {
    const { customerId } = req.body;
    const result = await syncSmsResults(customerId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== 통합 타임라인 (고객원장) ==========
// 메모/상담 + 문자를 합쳐서 시간순 반환
router.get('/customers/:id/timeline', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const rows = await query(
      `
      SELECT 'consultation' AS event_type, id, customer_id,
             channel AS sub_type, content,
             consulted_by AS actor, consulted_at AS occurred_at,
             NULL AS status, NULL AS done_code, NULL AS phone, NULL AS template_name
        FROM consultations
        WHERE customer_id = ?
      UNION ALL
      SELECT 'sms' AS event_type, id, customer_id,
             msg_type AS sub_type, content,
             sent_by AS actor, sent_at AS occurred_at,
             status, done_code, phone, template_name
        FROM sms_logs
        WHERE customer_id = ?
      ORDER BY occurred_at DESC
      LIMIT 100
      `,
      [customerId, customerId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

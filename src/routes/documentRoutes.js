const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const { query } = require('../database/db');
const crawler = require('../crawler/lmasterCrawler');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// DB row 를 프론트용 표준 포맷으로 변환
function normalizeRequirementRow(row) {
  const slot_count = Number(row.slot_count || 0);
  const hasCheckbox = !!(row.checkbox_name || row.checkbox_label);
  let caseType = row.case_type;
  if (!caseType) {
    // 기존 레코드(신규 컬럼 NULL)는 슬롯 수로 추론
    if (slot_count > 0 && hasCheckbox) caseType = 'both';
    else if (slot_count > 0) caseType = 'file';
    else if (hasCheckbox) caseType = 'checkbox';
    else caseType = 'none';
  }
  return {
    fidx: row.fidx,
    caseType,
    slot_count,
    slot1_label: row.slot1_label || null,
    slot2_label: row.slot2_label || null,
    checkbox_name: row.checkbox_name || null,
    checkbox_label: row.checkbox_label || null,
  };
}

// 스캔 결과를 DB 에 upsert
async function upsertRequirement(req) {
  await query(
    `INSERT INTO product_file_slots
       (fidx, slot_count, case_type, slot1_label, slot2_label, checkbox_name, checkbox_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slot_count=VALUES(slot_count),
       case_type=VALUES(case_type),
       slot1_label=VALUES(slot1_label),
       slot2_label=VALUES(slot2_label),
       checkbox_name=VALUES(checkbox_name),
       checkbox_label=VALUES(checkbox_label)`,
    [
      req.fidx,
      req.fileSlots.length,
      req.caseType,
      req.fileSlots[0]?.label || null,
      req.fileSlots[1]?.label || null,
      req.checkbox?.name || null,
      req.checkbox?.label || null,
    ]
  );
}

// 상품 요건 조회 (DB 캐시 → 없거나 rescan=1 이면 스캔)
router.get('/documents/slots/:fidx', async (req, res) => {
  try {
    const fidx = parseInt(req.params.fidx);
    const rescan = req.query.rescan === '1';
    const productNameHint = (req.query.productName || '').toString();

    if (!rescan) {
      const rows = await query('SELECT * FROM product_file_slots WHERE fidx = ?', [fidx]);
      if (rows.length > 0) {
        return res.json({ success: true, data: normalizeRequirementRow(rows[0]), cached: true });
      }
    }

    // 캐시 없음 (또는 rescan) → 크롤러로 스캔
    const scanned = await crawler.scanProductRequirements('12', '1', fidx, { productNameHint });
    if (scanned.fileSlots.length > 0 || scanned.checkbox) {
      await upsertRequirement(scanned);
    }
    res.json({
      success: true,
      data: {
        fidx,
        caseType: scanned.caseType,
        slot_count: scanned.fileSlots.length,
        slot1_label: scanned.fileSlots[0]?.label || null,
        slot2_label: scanned.fileSlots[1]?.label || null,
        checkbox_name: scanned.checkbox?.name || null,
        checkbox_label: scanned.checkbox?.label || null,
      },
      cached: false,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 관리자: 특정 상품의 요건을 강제로 재스캔 (POST 로 별도 엔드포인트 제공)
router.post('/documents/slots/:fidx/rescan', async (req, res) => {
  try {
    const fidx = parseInt(req.params.fidx);
    const productNameHint = (req.body?.productName || '').toString();
    const scanned = await crawler.scanProductRequirements('12', '1', fidx, { productNameHint });
    await upsertRequirement(scanned);
    res.json({ success: true, data: scanned });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 서류 업로드 (최대 2개 파일)
router.post('/documents/upload', upload.fields([
  { name: 'file1', maxCount: 1 },
  { name: 'file2', maxCount: 1 }
]), async (req, res) => {
  const tempPaths = [];
  try {
    const { customerName, productName, fidx, uploadedBy } = req.body;
    const files = [];

    if (req.files?.file1?.[0]) {
      files.push({ slot: 1, path: req.files.file1[0].path, originalName: req.files.file1[0].originalname, size: req.files.file1[0].size, type: req.files.file1[0].mimetype });
      tempPaths.push(req.files.file1[0].path);
    }
    if (req.files?.file2?.[0]) {
      files.push({ slot: 2, path: req.files.file2[0].path, originalName: req.files.file2[0].originalname, size: req.files.file2[0].size, type: req.files.file2[0].mimetype });
      tempPaths.push(req.files.file2[0].path);
    }

    if (files.length === 0) {
      return res.status(400).json({ success: false, message: '파일이 없습니다.' });
    }

    // 론앤마스터 업로드
    const result = await crawler.uploadDocuments('12', '1', fidx, files);

    // DB에 메타데이터 저장 (파일 자체는 저장 안 함)
    for (const f of files) {
      const success = result.uploadResults.find(r => r.slot === f.slot)?.success || false;
      await query(
        `INSERT INTO document_uploads (customer_name, product_name, slot_num, file_name, file_size, file_type, uploaded_by, upload_status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customerName || '', productName || '', f.slot, f.originalName, f.size, f.type, uploadedBy || '', success ? 'success' : 'failed', success ? null : JSON.stringify(result.uploadResults)]
      );
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    // 임시 파일 삭제
    for (const p of tempPaths) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
});

// 고객별 업로드 이력 조회
router.get('/documents/history', async (req, res) => {
  try {
    const { customerName } = req.query;
    let sql = 'SELECT * FROM document_uploads WHERE 1=1';
    const params = [];
    if (customerName) { sql += ' AND customer_name = ?'; params.push(customerName); }
    sql += ' ORDER BY uploaded_at DESC LIMIT 100';
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const { query } = require('../database/db');
const crawler = require('../crawler/lmasterCrawler');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// --- product_file_slots 스키마 자동 감지/복구 ---
// 서비스 첫 호출 시 case_type / checkbox_* 컬럼 유무를 검사해서:
//   - 없으면 ALTER TABLE 로 자동 추가 시도
//   - 권한 등으로 ALTER 가 실패해도 에러 던지지 않고 "구 스키마 모드" 로 동작
// (add_product_requirements.sql 마이그레이션을 못 돌린 환경에서도
//  '요건 조회 실패: Unknown column case_type' 에러가 나지 않도록 하는 안전장치)
let schemaReady = false;            // 한 번 체크 끝났나
let hasExtendedColumns = false;     // case_type 등 확장 컬럼 있나
async function ensureProductSlotsSchema() {
  if (schemaReady) return hasExtendedColumns;
  try {
    const cols = await query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'product_file_slots'"
    );
    const names = new Set((cols || []).map(c => c.COLUMN_NAME));
    if (names.size === 0) {
      // 테이블 자체가 없으면 생성
      await query(
        `CREATE TABLE IF NOT EXISTS product_file_slots (
          fidx INT PRIMARY KEY,
          slot_count INT DEFAULT 0,
          case_type VARCHAR(20) DEFAULT 'file',
          slot1_label VARCHAR(200) DEFAULT NULL,
          slot2_label VARCHAR(200) DEFAULT NULL,
          checkbox_name VARCHAR(200) DEFAULT NULL,
          checkbox_label VARCHAR(300) DEFAULT NULL,
          scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      hasExtendedColumns = true;
    } else {
      // 없는 컬럼만 추가
      if (!names.has('case_type')) {
        try { await query("ALTER TABLE product_file_slots ADD COLUMN case_type VARCHAR(20) DEFAULT 'file' AFTER slot_count"); } catch (e) { /* 무시 */ }
      }
      if (!names.has('checkbox_name')) {
        try { await query("ALTER TABLE product_file_slots ADD COLUMN checkbox_name VARCHAR(200) DEFAULT NULL AFTER slot2_label"); } catch (e) {}
      }
      if (!names.has('checkbox_label')) {
        try { await query("ALTER TABLE product_file_slots ADD COLUMN checkbox_label VARCHAR(300) DEFAULT NULL AFTER checkbox_name"); } catch (e) {}
      }
      // 재확인
      const cols2 = await query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'product_file_slots'"
      );
      const names2 = new Set((cols2 || []).map(c => c.COLUMN_NAME));
      hasExtendedColumns = names2.has('case_type') && names2.has('checkbox_name') && names2.has('checkbox_label');
    }
  } catch (e) {
    console.warn('[documents] product_file_slots 스키마 점검 실패 — 구 스키마 모드로 동작:', e.message);
    hasExtendedColumns = false;
  }
  schemaReady = true;
  return hasExtendedColumns;
}

// DB row 를 프론트용 표준 포맷으로 변환
function normalizeRequirementRow(row) {
  const slot_count = Number(row.slot_count || 0);
  const hasCheckbox = !!(row.checkbox_name || row.checkbox_label);
  let caseType = row.case_type;
  if (!caseType) {
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

// 스캔 결과를 DB 에 upsert — 확장 컬럼 유무에 따라 INSERT 형태 자동 선택
async function upsertRequirement(req) {
  const extended = await ensureProductSlotsSchema();
  if (extended) {
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
  } else {
    // 구 스키마 (case_type / checkbox_* 없음) — 파일 슬롯만 저장
    await query(
      `INSERT INTO product_file_slots (fidx, slot_count, slot1_label, slot2_label)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         slot_count=VALUES(slot_count),
         slot1_label=VALUES(slot1_label),
         slot2_label=VALUES(slot2_label)`,
      [
        req.fidx,
        req.fileSlots.length,
        req.fileSlots[0]?.label || null,
        req.fileSlots[1]?.label || null,
      ]
    );
  }
}

// 상품 요건 조회 (DB 캐시 → 없거나 rescan=1 이면 스캔)
router.get('/documents/slots/:fidx', async (req, res) => {
  try {
    await ensureProductSlotsSchema(); // 첫 호출 시 자동 마이그레이션 시도
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
  // multer 가 originalname 을 latin1 로 디코드 → 한글 깨짐. UTF-8 로 복원.
  const fixFileName = (name) => {
    if (!name) return '';
    try { return Buffer.from(name, 'latin1').toString('utf8'); } catch { return name; }
  };
  try {
    const { customerName, productName, fidx, uploadedBy } = req.body;
    const files = [];

    if (req.files?.file1?.[0]) {
      files.push({ slot: 1, path: req.files.file1[0].path, originalName: fixFileName(req.files.file1[0].originalname), size: req.files.file1[0].size, type: req.files.file1[0].mimetype });
      tempPaths.push(req.files.file1[0].path);
    }
    if (req.files?.file2?.[0]) {
      files.push({ slot: 2, path: req.files.file2[0].path, originalName: fixFileName(req.files.file2[0].originalname), size: req.files.file2[0].size, type: req.files.file2[0].mimetype });
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

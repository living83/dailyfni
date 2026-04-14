const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const { query } = require('../database/db');
const crawler = require('../crawler/lmasterCrawler');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// 상품 파일 슬롯 조회 (DB 캐시 → 없으면 스캔)
router.get('/documents/slots/:fidx', async (req, res) => {
  try {
    const fidx = parseInt(req.params.fidx);
    const rows = await query('SELECT * FROM product_file_slots WHERE fidx = ?', [fidx]);
    if (rows.length > 0) {
      return res.json({ success: true, data: rows[0], cached: true });
    }
    // 캐시 없음 → 크롤러로 스캔
    const slots = await crawler.scanProductFileSlots('12', '1', fidx);
    const slotCount = slots.length;
    if (slotCount > 0) {
      await query(
        'INSERT INTO product_file_slots (fidx, slot_count, slot1_label, slot2_label) VALUES (?, ?, ?, ?)',
        [fidx, slotCount, slots[0]?.label || '파일1', slots[1]?.label || null]
      );
    }
    res.json({ success: true, data: { fidx, slot_count: slotCount, slot1_label: slots[0]?.label, slot2_label: slots[1]?.label }, cached: false });
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

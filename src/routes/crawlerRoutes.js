const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const crawler = require('../crawler/lmasterCrawler');

// 대출접수 파일 첨부용 multer (최대 20MB × 2 슬롯)
const submitUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024 } });

// 실제 제출 중복 방지 락 (name+fidx, 10초 윈도우)
// key: `${name}_${fidx}` → value: timestamp(ms)
const _submitLocks = new Map();
const SUBMIT_LOCK_WINDOW_MS = 10 * 1000;

function _pruneSubmitLocks() {
  const now = Date.now();
  for (const [k, t] of _submitLocks) {
    if (now - t > SUBMIT_LOCK_WINDOW_MS) _submitLocks.delete(k);
  }
}

// 크롤러 상태 확인
router.get('/crawler/status', (req, res) => {
  res.json({ success: true, data: crawler.getStatus() });
});

// 현재 페이지 HTML 구조 디버그
router.get('/crawler/debug-html', async (req, res) => {
  try {
    const html = await crawler.getPageHtml();
    res.json({ success: true, data: html });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 론앤마스터 로그인
router.post('/crawler/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ success: false, message: 'userId, password 필요' });
    }
    const result = await crawler.login(userId, password);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 상품 가이드 1건 가져오기
router.get('/crawler/product-guide/:fidx', async (req, res) => {
  try {
    const fidx = parseInt(req.params.fidx);
    const data = await crawler.getProductGuide(fidx);
    res.json({ success: true, data });
  } catch (err) {
    if (err && err.code === 'LMASTER_SESSION_EXPIRED') {
      return res.status(401).json({
        success: false,
        code: 'LMASTER_SESSION_EXPIRED',
        message: err.message,
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 상품 fidx 매핑 수집
router.post('/crawler/product-map', async (req, res) => {
  try {
    const { agentNo, upw } = req.body;
    const data = await crawler.getProductFidxMap(agentNo, upw);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 심사메모 전체 내용 조회 (statuswin.asp)
// 목록 페이지는 첫 줄만 내려오기 때문에 상세 팝업 URL 을 서버 사이드에서 긁어온다.
router.get('/crawler/loan-memo', async (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ success: false, message: '조회 시간 초과 (20초)' });
  }, 20000);
  try {
    const { idx, upw } = req.query;
    if (!idx) {
      clearTimeout(timeout);
      return res.status(400).json({ success: false, message: 'idx 파라미터가 필요합니다.' });
    }
    const data = await crawler.getLoanReviewMemo(String(idx), upw || '1');
    clearTimeout(timeout);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    clearTimeout(timeout);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

// 대출신청내역 목록 조회
router.get('/crawler/loan-list', async (req, res) => {
  // 30초 타임아웃
  const timeout = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ success: false, message: '조회 시간 초과 (30초)' });
  }, 30000);
  try {
    const { agentNo, upw, status, dateType, dateRange, product } = req.query;
    const data = await crawler.getLoanList(agentNo || '12', upw || '1', { status, dateType, dateRange, product });
    clearTimeout(timeout);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    clearTimeout(timeout);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

// 접수 폼 필드 스캔 (론앤마스터 폼 구조 파악)
router.post('/crawler/scan-form', async (req, res) => {
  try {
    const { agentNo, upw } = req.body;
    const data = await crawler.scanFormFields(agentNo || '12', upw || '1');
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 대출 접수 폼 자동 입력
// body.dryRun=true  → 폼 채우기만 + 스크린샷 반환 (미리보기)
// body.dryRun=false → 실제 제출 (중복 방지 락 적용)
//
// 요청 포맷 (2가지 모두 지원):
//   A) application/json:
//      { formData: {...}, dryRun: bool, checkboxConfirmed: bool, checkboxName: '...' }
//   B) multipart/form-data:
//      - formData (JSON stringified), dryRun, checkboxConfirmed, checkboxName (text fields)
//      - file1, file2 (파일)
//      론앤마스터가 서류 미첨부 시 자동 거절하는 상품에 대응.
router.post(
  '/crawler/submit-loan',
  // Content-Type 이 multipart/form-data 일 때만 multer 가 파싱. JSON 은 통과.
  submitUpload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]),
  async (req, res) => {
  const tempPaths = [];
  try {
    // multipart 에서는 formData 가 JSON 문자열로 옴. JSON 요청은 object 그대로.
    let formData = req.body.formData;
    if (typeof formData === 'string') {
      try { formData = JSON.parse(formData); } catch { formData = null; }
    }
    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({ success: false, message: 'formData가 필요합니다.' });
    }

    const agentNo = req.body.agentNo;
    const upw = req.body.upw;
    // boolean 값이 문자열로 올 수 있음 (multipart)
    const dryRun = req.body.dryRun === true || req.body.dryRun === 'true' || req.body.dryRun === '1';
    const checkboxConfirmed = req.body.checkboxConfirmed === true || req.body.checkboxConfirmed === 'true' || req.body.checkboxConfirmed === '1';
    const checkboxName = req.body.checkboxName || null;

    // 업로드된 파일 수집
    const files = [];
    if (req.files?.file1?.[0]) {
      files.push({ slot: 1, path: req.files.file1[0].path, originalName: req.files.file1[0].originalname });
      tempPaths.push(req.files.file1[0].path);
    }
    if (req.files?.file2?.[0]) {
      files.push({ slot: 2, path: req.files.file2[0].path, originalName: req.files.file2[0].originalname });
      tempPaths.push(req.files.file2[0].path);
    }

    const isDryRun = !!dryRun;

    // 실제 제출만 필수 필드 검증 + 중복 방지 락 적용
    let lockKey = null;
    if (!isDryRun) {
      // 필수 필드 검증 (고객명/생년월일/전화1/대출요청액/상품fidx)
      const required = {
        name: '고객명',
        birth: '생년월일',
        phone1: '전화번호',
        loanAmount: '대출요청액',
        fidx: '상품(fidx)'
      };
      const missing = [];
      for (const [key, label] of Object.entries(required)) {
        const val = formData[key];
        if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '0') {
          missing.push(label);
        }
      }
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `실제 제출에는 필수 필드가 모두 입력되어야 합니다: ${missing.join(', ')}`
        });
      }

      _pruneSubmitLocks();
      const name = String(formData.name).trim();
      const fidx = String(formData.fidx).trim();
      lockKey = `${name}_${fidx}`;
      const lastAt = _submitLocks.get(lockKey);
      if (lastAt && Date.now() - lastAt < SUBMIT_LOCK_WINDOW_MS) {
        const remainSec = Math.ceil((SUBMIT_LOCK_WINDOW_MS - (Date.now() - lastAt)) / 1000);
        return res.status(429).json({
          success: false,
          message: `동일 접수가 이미 진행 중입니다. ${remainSec}초 후 다시 시도하세요.`
        });
      }
      _submitLocks.set(lockKey, Date.now());
    }

    try {
      const result = await crawler.submitLoanApplication(
        agentNo || '12',
        upw || '1',
        formData,
        {
          dryRun: isDryRun,
          files,
          checkboxName: checkboxConfirmed ? checkboxName : null,
        }
      );
      res.json({ success: true, data: result });
    } finally {
      // 제출 완료 후에도 10초는 유지 (추가 중복 방지)
      if (lockKey) _submitLocks.set(lockKey, Date.now());
    }
  } catch (err) {
    // 세션 만료는 프론트가 재로그인 유도할 수 있게 401 로 반환
    if (err && err.code === 'LMASTER_SESSION_EXPIRED') {
      return res.status(401).json({
        success: false,
        code: 'LMASTER_SESSION_EXPIRED',
        message: err.message
      });
    }
    res.status(500).json({ success: false, message: err.message });
  } finally {
    // 업로드된 임시 파일 정리 (크롤러가 이미 읽어서 브라우저에 주입했으므로 즉시 삭제 가능)
    for (const p of tempPaths) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
});

// 론앤마스터 공지 (당일분 + 본문) — 1시간 캐시 + 오늘 공지는 DB 저장
router.get('/crawler/notices', async (req, res) => {
  try {
    const { agentNo, upw, force } = req.query;
    const data = await crawler.getCachedNotices(agentNo || '12', upw || '1', { force: force === '1' });

    // 오늘 공지만 DB 에 upsert (중복은 title/body 만 갱신)
    try {
      const { query } = require('../database/db');
      for (const n of (data.notices || [])) {
        if (!n.idx || !n.date) continue;
        await query(
          `INSERT INTO lmaster_notices (idx, notice_date, title, body, author)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title=VALUES(title), body=VALUES(body), author=VALUES(author)`,
          [n.idx, n.date, (n.title || '').substring(0, 500), n.body || '', n.author || '관리자']
        );
      }
    } catch (e) { console.error('[공지] DB 저장 실패:', e.message); }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DB 저장된 공지 조회 (날짜별, 기본 최근 30일)
router.get('/crawler/notices/history', async (req, res) => {
  try {
    const { query } = require('../database/db');
    const { days = 30 } = req.query;
    const rows = await query(
      `SELECT idx, DATE_FORMAT(notice_date, '%Y-%m-%d') AS date, title, body, author, fetched_at
       FROM lmaster_notices
       WHERE notice_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY notice_date DESC, idx DESC
       LIMIT 200`, [parseInt(days) || 30]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 브라우저 종료
router.post('/crawler/close', async (req, res) => {
  try {
    await crawler.closeBrowser();
    res.json({ success: true, message: '브라우저 종료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

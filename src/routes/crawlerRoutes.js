const express = require('express');
const router = express.Router();
const crawler = require('../crawler/lmasterCrawler');

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
router.post('/crawler/submit-loan', async (req, res) => {
  try {
    const { agentNo, upw, formData, dryRun } = req.body;
    if (!formData) {
      return res.status(400).json({ success: false, message: 'formData가 필요합니다.' });
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
        { dryRun: isDryRun }
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

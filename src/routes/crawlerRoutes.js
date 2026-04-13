const express = require('express');
const router = express.Router();
const crawler = require('../crawler/lmasterCrawler');

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

// 대출 접수 폼 자동 입력 (제출 전까지)
router.post('/crawler/submit-loan', async (req, res) => {
  try {
    const { agentNo, upw, formData } = req.body;
    if (!formData) {
      return res.status(400).json({ success: false, message: 'formData가 필요합니다.' });
    }
    const result = await crawler.submitLoanApplication(agentNo || '12', upw || '1', formData);
    res.json({ success: true, data: result });
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

const express = require('express');
const router = express.Router();
const crawler = require('../crawler/lmasterCrawler');

// 크롤러 상태 확인
router.get('/crawler/status', (req, res) => {
  res.json({ success: true, data: crawler.getStatus() });
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

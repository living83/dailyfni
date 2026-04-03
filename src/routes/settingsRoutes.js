const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getSettings,
  updateSettings,
  backupSettings,
  restoreSettings,
} = require('../models/Settings');

const router = Router();

// GET /api/settings — 설정 조회
router.get('/settings', (req, res) => {
  res.json({ success: true, settings: getSettings() });
});

// PUT /api/settings — 설정 저장
router.put('/settings', (req, res) => {
  const updated = updateSettings(req.body);
  res.json({ success: true, message: '설정이 저장되었습니다.', settings: updated });
});

// POST /api/settings/backup — 설정 백업 (JSON 다운로드)
router.post('/settings/backup', (req, res) => {
  const data = backupSettings();
  res.json({ success: true, backup: data });
});

// POST /api/settings/restore — 설정 복원
router.post('/settings/restore', (req, res) => {
  if (!req.body || !req.body.backup) {
    return res.status(400).json({ success: false, message: '백업 데이터가 필요합니다.' });
  }
  const restored = restoreSettings(req.body.backup);
  res.json({ success: true, message: '설정이 복원되었습니다.', settings: restored });
});

module.exports = router;

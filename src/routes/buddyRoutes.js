const { Router } = require('express');
const { listAccounts, getAccountRaw } = require('../models/Account');
const { requestBuddyAccept, requestBuddyPending } = require('../services/pythonBridge');
const buddy = require('../services/buddyAcceptScheduler');

const router = Router();

// GET /api/buddy/settings
router.get('/buddy/settings', (req, res) => {
  res.json({ success: true, settings: buddy.getSettings() });
});

// PUT /api/buddy/settings
router.put('/buddy/settings', (req, res) => {
  const settings = buddy.updateSettings(req.body);
  buddy.restartBuddyScheduler();
  res.json({ success: true, settings });
});

// GET /api/buddy/logs
router.get('/buddy/logs', (req, res) => {
  res.json({ success: true, logs: buddy.getLogs(50) });
});

// GET /api/buddy/status
router.get('/buddy/status', (req, res) => {
  res.json({ success: true, ...buddy.getStatus() });
});

// POST /api/buddy/accept-now — 즉시 수락 실행 (수동 트리거)
router.post('/buddy/accept-now', async (req, res) => {
  const accounts = listAccounts().filter(a => a.isActive);
  if (accounts.length === 0) {
    return res.json({ success: false, message: '활성 계정이 없습니다.' });
  }

  const settings = buddy.getSettings();

  res.json({
    success: true,
    message: `${accounts.length}개 계정으로 서로이웃 수락 시작`,
    accounts: accounts.length,
  });

  // 백그라운드 실행
  let totalAccepted = 0;
  for (const acc of accounts) {
    const raw = getAccountRaw(acc.id);
    if (!raw) continue;

    try {
      const result = await requestBuddyAccept({
        account: {
          id: raw.id,
          account_name: raw.accountName,
          naver_id: raw.naverId,
          naver_password: raw.naverPassword || '',
        },
        config: {
          max_accept: settings.dailyMaxAccept || 50,
          accept_mode: settings.acceptMode || 'all',
        },
      });

      const accepted = result.accepted_count || 0;
      totalAccepted += accepted;
      buddy.addLog(raw.accountName, accepted, result.skipped_count || 0, result.error || '');
      console.log(`[BuddyRoute] ${raw.accountName}: ${accepted}건 수락`);
    } catch (err) {
      buddy.addLog(raw.accountName, 0, 0, err.message);
      console.error(`[BuddyRoute] ${raw.accountName} 오류:`, err.message);
    }

    // 계정 간 30초 대기
    if (accounts.indexOf(acc) < accounts.length - 1) {
      await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000));
    }
  }

  console.log(`[BuddyRoute] 즉시 수락 완료 — 총 ${totalAccepted}건`);
});

module.exports = router;

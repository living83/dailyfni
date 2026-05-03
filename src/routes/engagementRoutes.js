const { Router } = require('express');
const Engagement = require('../models/Engagement');
const { listAccounts, getAccountRaw } = require('../models/Account');
const { requestFeed, requestEngageBatch } = require('../services/pythonBridge');
const { getSettingsRaw } = require('../models/Settings');

const router = Router();

// GET /engagement/feed
router.get('/engagement/feed', async (req, res) => {
  res.json({ success: true, feed: Engagement.listFeed() });
});

// POST /engagement/feed/refresh
router.post('/engagement/feed/refresh', async (req, res) => {
  const accounts = listAccounts().filter(a => a.isActive && a.neighborEngage);
  if (accounts.length === 0) {
    return res.json({ success: false, message: '참여 활성 계정이 없습니다.' });
  }

  const account = getAccountRaw(accounts[0].id);
  if (!account) {
    return res.json({ success: false, message: '계정 정보를 찾을 수 없습니다.' });
  }

  const result = await requestFeed({
    account: { id: account.id, naver_id: account.naverId, naver_password: account.naverPassword, account_name: account.accountName },
    max_posts: 20,
  });

  if (result.success && result.feed) {
    res.json({ success: true, feed: result.feed, count: result.feed.length });
  } else {
    res.json({ success: false, message: result.error || '피드 크롤링 실패', feed: Engagement.listFeed() });
  }
});

// POST /engagement/run — 배치 이웃참여 실행 (공감만)
router.post('/engagement/run', async (req, res) => {
  const accounts = listAccounts().filter(a => a.isActive && a.neighborEngage);

  if (accounts.length === 0) {
    return res.json({ success: false, message: '이웃참여 활성 계정이 없습니다.', liked: 0 });
  }

  const settings = getSettingsRaw();
  const maxPosts = settings.maxVisits || 10;

  res.json({
    success: true,
    message: `${accounts.length}개 계정으로 공감 실행 시작 (계정당 최대 ${maxPosts}개 포스트)`,
    accounts: accounts.length,
    maxPosts,
  });

  // 백그라운드: 계정별 순차 배치 실행
  let totalLikes = 0;
  for (const acc of accounts) {
    const raw = getAccountRaw(acc.id);
    if (!raw) continue;

    try {
      console.log(`[Engagement] ${raw.accountName} 공감 시작 (최대 ${maxPosts}건)`);
      const result = await requestEngageBatch({
        account: {
          id: raw.id,
          account_name: raw.accountName,
          naver_id: raw.naverId,
          naver_password: raw.naverPassword || '',
        },
        config: {
          engagement_max_posts: maxPosts,
          engagement_do_like: settings.heartLike !== false,
        },
      });

      const likes = result.like_count || 0;
      totalLikes += likes;

      // 활동 기록 저장
      for (const r of result.results || []) {
        if (r.like_success) {
          Engagement.addActivity({
            accountName: raw.accountName,
            action: '♥ 공감',
            target: (r.post_title || '').substring(0, 30),
          });
        }
      }

      console.log(`[Engagement] ${raw.accountName} 완료 — 공감 ${likes}건`);
      if (result.error) {
        console.error(`[Engagement] ${raw.accountName} 오류: ${result.error}`);
      }
    } catch (err) {
      console.error(`[Engagement] ${raw.accountName} 예외:`, err.message);
    }

    // 다음 계정까지 30~60초 대기
    if (accounts.indexOf(acc) < accounts.length - 1) {
      await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000));
    }
  }

  console.log(`[Engagement] 전체 완료 — 총 공감 ${totalLikes}건`);
});

// GET /engagement/stats
router.get('/engagement/stats', (req, res) => {
  res.json({ success: true, stats: Engagement.getStats() });
});

// GET /engagement/activity
router.get('/engagement/activity', (req, res) => {
  res.json({ success: true, activities: Engagement.listActivities() });
});

module.exports = router;

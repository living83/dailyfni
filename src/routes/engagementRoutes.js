const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Engagement = require('../models/Engagement');
const { listAccounts, getAccountRaw } = require('../models/Account');
const { requestEngage, requestCommentPreview, requestFeed, requestEngageBatch } = require('../services/pythonBridge');
const { getSettingsRaw } = require('../models/Settings');

const router = Router();

// GET /engagement/feed — 이웃 피드 (mock + Python 크롤링)
router.get('/engagement/feed', async (req, res) => {
  // 인메모리 mock 피드 반환 (Python 크롤러는 백그라운드 갱신용)
  res.json({ success: true, feed: Engagement.listFeed() });
});

// POST /engagement/feed/refresh — Python으로 실제 피드 크롤링
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
    // TODO: merge into Engagement model
    res.json({ success: true, feed: result.feed, count: result.feed.length });
  } else {
    res.json({ success: false, message: result.error || '피드 크롤링 실패', feed: Engagement.listFeed() });
  }
});

// POST /engagement/like/:postId — 공감 (인메모리 + Python Playwright)
router.post('/engagement/like/:postId', async (req, res) => {
  const post = Engagement.likePost(req.params.postId);
  if (!post) return res.status(404).json({ success: false, message: '포스트를 찾을 수 없습니다.' });
  res.json({ success: true, post });

  // 백그라운드: 실제 Playwright 공감 (계정이 있으면)
  const accounts = listAccounts().filter(a => a.isActive && a.neighborEngage);
  if (accounts.length > 0 && post.url) {
    const account = getAccountRaw(accounts[0].id);
    if (account) {
      requestEngage({
        account: { id: account.id, naver_id: account.naverId, naver_password: account.naverPassword, account_name: account.accountName },
        blog_url: post.url || '',
        actions: { like: true, comment: null },
      }).catch(err => console.error('[Engagement] 공감 실패:', err.message));
    }
  }
});

// POST /engagement/comment/preview — AI 댓글 미리보기 (Python Claude)
router.post('/engagement/comment/preview', async (req, res) => {
  const { postTitle, postSummary } = req.body;
  if (!postTitle) return res.status(400).json({ success: false, message: '포스트 제목이 필요합니다.' });

  // Python Claude API로 실제 AI 댓글 생성 시도
  const result = await requestCommentPreview({ post_title: postTitle, post_summary: postSummary || '' });

  if (result.success && result.comment) {
    res.json({ success: true, comment: result.comment });
  } else {
    // 실패 시 로컬 mock 댓글
    const comment = Engagement.generateComment(postTitle);
    res.json({ success: true, comment, source: 'local' });
  }
});

// POST /engagement/comment/:postId — 댓글 작성
router.post('/engagement/comment/:postId', async (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ success: false, message: '댓글 내용이 필요합니다.' });

  const result = Engagement.commentPost(req.params.postId, comment);
  if (!result) return res.status(404).json({ success: false, message: '포스트를 찾을 수 없습니다.' });
  res.json({ success: true, ...result });

  // 백그라운드: 실제 Playwright 댓글 작성
  const post = Engagement.listFeed().find(p => p.id === req.params.postId);
  const accounts = listAccounts().filter(a => a.isActive && a.neighborEngage);
  if (accounts.length > 0 && post?.url) {
    const account = getAccountRaw(accounts[0].id);
    if (account) {
      requestEngage({
        account: { id: account.id, naver_id: account.naverId, naver_password: account.naverPassword, account_name: account.accountName },
        blog_url: post.url,
        actions: { like: false, comment },
      }).catch(err => console.error('[Engagement] 댓글 실패:', err.message));
    }
  }
});

// POST /engagement/run — 배치 이웃참여 실행 (Python engager.run_engagement)
router.post('/engagement/run', async (req, res) => {
  const accounts = listAccounts().filter(a => a.isActive && a.neighborEngage);

  if (accounts.length === 0) {
    return res.json({ success: false, message: '이웃참여 활성 계정이 없습니다.', liked: 0, commented: 0 });
  }

  const settings = getSettingsRaw();
  const maxPosts = settings.maxVisits || 10;

  res.json({
    success: true,
    message: `${accounts.length}개 계정으로 참여 실행 시작 (계정당 최대 ${maxPosts}개 포스트)`,
    accounts: accounts.length,
    maxPosts,
  });

  // 백그라운드: 계정별 순차 배치 실행
  let totalLikes = 0, totalComments = 0;
  for (const acc of accounts) {
    const raw = getAccountRaw(acc.id);
    if (!raw) continue;

    try {
      console.log(`[Engagement] ${raw.accountName} 참여 시작 (최대 ${maxPosts}건)`);
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
          engagement_do_comment: settings.aiComment !== false,
        },
      });

      const likes = result.like_count || 0;
      const comments = result.comment_count || 0;
      totalLikes += likes;
      totalComments += comments;

      // 활동 기록 저장
      for (const r of result.results || []) {
        if (r.like_success) {
          Engagement.addActivity({
            accountName: raw.accountName,
            action: '♥ 공감',
            target: (r.post_title || '').substring(0, 30),
          });
        }
        if (r.comment_success) {
          Engagement.addActivity({
            accountName: raw.accountName,
            action: '💬 댓글',
            target: (r.post_title || '').substring(0, 30),
          });
        }
      }

      console.log(`[Engagement] ${raw.accountName} 완료 — 공감 ${likes}, 댓글 ${comments}`);
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

  console.log(`[Engagement] 전체 완료 — 총 공감 ${totalLikes}, 총 댓글 ${totalComments}`);
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

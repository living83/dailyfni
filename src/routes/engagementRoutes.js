const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Engagement = require('../models/Engagement');
const { listAccounts, getAccountRaw } = require('../models/Account');
const { requestEngage, requestCommentPreview, requestFeed } = require('../services/pythonBridge');

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

// POST /engagement/run — 일괄 참여 (Python Playwright)
router.post('/engagement/run', async (req, res) => {
  const feed = Engagement.listFeed();
  const accounts = listAccounts().filter(a => a.isActive && a.neighborEngage);

  // 인메모리 즉시 업데이트 (UI 반영용)
  let liked = 0, commented = 0;
  for (const post of feed) {
    if (!post.liked) { Engagement.likePost(post.id); liked++; }
    if (!post.commented) {
      const commentText = Engagement.generateComment(post.title);
      Engagement.commentPost(post.id, commentText);
      commented++;
    }
  }

  res.json({
    success: true,
    message: `공감 ${liked}건, 댓글 ${commented}건 처리 시작`,
    liked, commented,
    stats: Engagement.getStats(),
  });

  // 백그라운드: 실제 Playwright 참여 (순차 실행)
  if (accounts.length > 0) {
    const account = getAccountRaw(accounts[0].id);
    if (account) {
      for (const post of feed) {
        if (post.url) {
          try {
            await requestEngage({
              account: { id: account.id, naver_id: account.naverId, naver_password: account.naverPassword, account_name: account.accountName },
              blog_url: post.url,
              actions: { like: true, comment: Engagement.generateComment(post.title) },
            });
            console.log(`[Engagement] 참여 완료: ${post.blogName}`);
          } catch (err) {
            console.error(`[Engagement] 참여 실패: ${post.blogName}`, err.message);
          }
          // 다음 참여까지 3-8초 간격
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
        }
      }
    }
  }
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

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Engagement = require('../models/Engagement');

const router = Router();

// List neighbor posts feed
router.get('/engagement/feed', authenticate, (req, res) => {
  res.json({ success: true, feed: Engagement.listFeed() });
});

// Toggle like on a post
router.post('/engagement/like/:postId', authenticate, (req, res) => {
  const post = Engagement.likePost(req.params.postId);
  if (!post) return res.status(404).json({ success: false, message: '포스트를 찾을 수 없습니다.' });
  res.json({ success: true, post });
});

// Generate AI comment preview (must be before :postId route)
router.post('/engagement/comment/preview', authenticate, (req, res) => {
  const { postTitle } = req.body;
  if (!postTitle) return res.status(400).json({ success: false, message: '포스트 제목이 필요합니다.' });
  const comment = Engagement.generateComment(postTitle);
  res.json({ success: true, comment });
});

// Post a comment on a post
router.post('/engagement/comment/:postId', authenticate, (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ success: false, message: '댓글 내용이 필요합니다.' });
  const result = Engagement.commentPost(req.params.postId, comment);
  if (!result) return res.status(404).json({ success: false, message: '포스트를 찾을 수 없습니다.' });
  res.json({ success: true, ...result });
});

// Batch run: like + comment on all uninteracted posts
router.post('/engagement/run', authenticate, (req, res) => {
  const feed = Engagement.listFeed();
  let liked = 0;
  let commented = 0;

  for (const post of feed) {
    if (!post.liked) {
      Engagement.likePost(post.id);
      liked++;
    }
    if (!post.commented) {
      const commentText = Engagement.generateComment(post.title);
      Engagement.commentPost(post.id, commentText);
      commented++;
    }
  }

  res.json({
    success: true,
    message: `공감 ${liked}건, 댓글 ${commented}건 완료`,
    liked,
    commented,
    stats: Engagement.getStats(),
  });
});

// Today's engagement stats
router.get('/engagement/stats', authenticate, (req, res) => {
  res.json({ success: true, stats: Engagement.getStats() });
});

// Activity log
router.get('/engagement/activity', authenticate, (req, res) => {
  res.json({ success: true, activities: Engagement.listActivities() });
});

module.exports = router;

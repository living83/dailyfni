const { v4: uuid } = require('uuid');
const db = require('../db/sqlite');
const Account = require('./Account');

/** Feed: in-memory (세션마다 갱신, Playwright 크롤링으로 교체 예정) */
const neighborPosts = new Map();

const stats = {
  todayLikes: 0,
  todayComments: 0,
};

/* ── AI comment templates ── */
const commentTemplates = [
  (title) => `와 정말 알찬 내용이네요! "${title}" 관련해서 저도 관심이 많았는데, 덕분에 좋은 정보 얻어갑니다 😊`,
  (title) => `좋은 글 감사합니다! ${title} 주제로 이렇게 상세하게 정리해주시다니 대단하세요. 다음 글도 기대할게요!`,
  (title) => `오 이런 정보를 찾고 있었는데 딱이네요! 특히 ${title} 부분이 정말 도움이 됐어요. 북마크 해둘게요 ❤️`,
  (title) => `항상 좋은 글 감사합니다~ ${title} 관련 꿀팁이 가득하네요. 주변에도 공유할게요!`,
  (title) => `정말 유익한 포스팅이에요! ${title}에 대해 궁금했던 부분이 해소됐어요. 감사합니다 :)`,
  (title) => `와 대박! ${title} 이렇게 깔끔하게 정리된 글은 처음이에요. 앞으로도 좋은 글 부탁드려요~`,
];

function listFeed() {
  return [...neighborPosts.values()];
}

function likePost(postId) {
  const post = neighborPosts.get(postId);
  if (!post) return null;
  post.liked = !post.liked;
  if (post.liked) {
    stats.todayLikes++;
    addActivity({
      accountName: '시스템',
      action: '♥ 공감',
      target: post.title.length > 20 ? post.title.slice(0, 20) + '...' : post.title,
    });
  } else {
    stats.todayLikes = Math.max(0, stats.todayLikes - 1);
  }
  return post;
}

function commentPost(postId, commentText) {
  const post = neighborPosts.get(postId);
  if (!post) return null;
  post.commented = true;
  stats.todayComments++;
  addActivity({
    accountName: '시스템',
    action: '💬 댓글',
    target: post.title.length > 20 ? post.title.slice(0, 20) + '...' : post.title,
  });
  return { post, commentText };
}

function getStats() {
  const accounts = Account.listAccounts();
  const activeAccounts = accounts.filter(a => a.isActive && a.neighborEngage).length;
  const totalAccounts = accounts.length;
  return { ...stats, activeAccounts, totalAccounts };
}

function listActivities() {
  return db.prepare(`SELECT * FROM engagement_activities ORDER BY id DESC LIMIT 20`).all();
}

function generateComment(postTitle) {
  const template = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];
  return template(postTitle);
}

function addActivity(entry) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  db.prepare(`INSERT INTO engagement_activities (time, accountName, action, target) VALUES (?, ?, ?, ?)`)
    .run(time, entry.accountName || '시스템', entry.action, entry.target);
}

module.exports = {
  listFeed,
  likePost,
  commentPost,
  getStats,
  listActivities,
  generateComment,
  addActivity,
};

const db = require('../db/sqlite');
const Account = require('./Account');

/** Feed: in-memory (세션마다 갱신, Playwright 크롤링으로 교체 예정) */
const neighborPosts = new Map();

const stats = {
  todayLikes: 0,
};

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

function getStats() {
  const accounts = Account.listAccounts();
  const activeAccounts = accounts.filter(a => a.isActive && a.neighborEngage).length;
  const totalAccounts = accounts.length;
  return { ...stats, activeAccounts, totalAccounts };
}

function listActivities() {
  return db.prepare(`SELECT * FROM engagement_activities ORDER BY id DESC LIMIT 20`).all();
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
  getStats,
  listActivities,
  addActivity,
};

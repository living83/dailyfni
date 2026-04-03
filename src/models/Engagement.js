const { v4: uuid } = require('uuid');

/** @type {Map<string, object>} */
const neighborPosts = new Map();

/** @type {Array<object>} */
const activities = [];

const stats = {
  todayLikes: 0,
  todayComments: 0,
  activeAccounts: 8,
  totalAccounts: 12,
};

/* ── Mock neighbor posts seed data ── */
const mockPosts = [
  { blogName: '여행매니아', title: '제주도 3박4일 가성비 여행 코스 추천', timeAgo: '32분 전', liked: false, commented: false },
  { blogName: '맛집탐험가', title: '강남역 숨은 맛집 TOP 5', timeAgo: '1시간 전', liked: false, commented: false },
  { blogName: 'IT트렌드', title: '2026년 AI 트렌드 총정리', timeAgo: '2시간 전', liked: false, commented: false },
  { blogName: '재테크초보', title: '월 100만원 저축하는 방법', timeAgo: '3시간 전', liked: false, commented: false },
  { blogName: '인테리어팁', title: '10평 원룸 넓어 보이는 인테리어', timeAgo: '4시간 전', liked: false, commented: false },
  { blogName: '건강생활', title: '아침 루틴으로 하루를 바꾸는 법', timeAgo: '5시간 전', liked: false, commented: false },
];

/* ── AI comment templates ── */
const commentTemplates = [
  (title) => `와 정말 알찬 내용이네요! "${title}" 관련해서 저도 관심이 많았는데, 덕분에 좋은 정보 얻어갑니다 😊`,
  (title) => `좋은 글 감사합니다! ${title} 주제로 이렇게 상세하게 정리해주시다니 대단하세요. 다음 글도 기대할게요!`,
  (title) => `오 이런 정보를 찾고 있었는데 딱이네요! 특히 ${title} 부분이 정말 도움이 됐어요. 북마크 해둘게요 ❤️`,
  (title) => `항상 좋은 글 감사합니다~ ${title} 관련 꿀팁이 가득하네요. 주변에도 공유할게요!`,
  (title) => `정말 유익한 포스팅이에요! ${title}에 대해 궁금했던 부분이 해소됐어요. 감사합니다 :)`,
  (title) => `와 대박! ${title} 이렇게 깔끔하게 정리된 글은 처음이에요. 앞으로도 좋은 글 부탁드려요~`,
];

function ensureMockPosts() {
  if (neighborPosts.size === 0) {
    for (const mock of mockPosts) {
      const id = uuid();
      neighborPosts.set(id, { id, ...mock });
    }
  }
}

function listFeed() {
  ensureMockPosts();
  return [...neighborPosts.values()];
}

function likePost(postId) {
  ensureMockPosts();
  const post = neighborPosts.get(postId);
  if (!post) return null;
  post.liked = !post.liked;
  if (post.liked) {
    stats.todayLikes++;
    addActivity({
      accountName: '블로그마스터',
      action: '♥ 공감',
      target: post.title.length > 20 ? post.title.slice(0, 20) + '...' : post.title,
    });
  } else {
    stats.todayLikes = Math.max(0, stats.todayLikes - 1);
  }
  return post;
}

function commentPost(postId, commentText) {
  ensureMockPosts();
  const post = neighborPosts.get(postId);
  if (!post) return null;
  post.commented = true;
  stats.todayComments++;
  addActivity({
    accountName: '블로그마스터',
    action: '💬 댓글',
    target: post.title.length > 20 ? post.title.slice(0, 20) + '...' : post.title,
  });
  return { post, commentText };
}

function getStats() {
  return { ...stats };
}

function listActivities() {
  return activities.slice(-20).reverse();
}

function generateComment(postTitle) {
  const template = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];
  return template(postTitle);
}

function addActivity(entry) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  activities.push({
    time,
    accountName: entry.accountName || '블로그마스터',
    action: entry.action,
    target: entry.target,
  });
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

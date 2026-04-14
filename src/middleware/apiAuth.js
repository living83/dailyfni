// 간단한 세션 기반 API 인증 미들웨어
// 로그인 시 토큰 발급, API 호출 시 토큰 검증

const crypto = require('crypto');

// 활성 세션 저장소
const sessions = new Map();

// 세션 생성
function createSession(userId, userData) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId,
    userData,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24시간
  });
  return token;
}

// 세션 검증
function validateSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

// 세션 삭제
function deleteSession(token) {
  sessions.delete(token);
}

// API 인증 미들웨어
function apiAuth(req, res, next) {
  // 인증 불필요 경로 (로그인/홈페이지 신규유입/헬스체크만 공개)
  const publicPaths = [
    '/system/login',
    '/intake/homepage',
    '/health',
    '/api/system/login',
    '/api/intake/homepage',
    '/api/health'
  ];

  if (publicPaths.some(p => req.path === p || req.path.startsWith(p))) {
    return next();
  }

  // 토큰 확인 (헤더 또는 쿼리)
  const token = req.headers['x-auth-token'] || req.query._token;
  const session = validateSession(token);

  if (!session) {
    return res.status(401).json({ success: false, message: '인증이 필요합니다. 다시 로그인하세요.' });
  }

  req.user = session.userData;
  next();
}

// 만료된 세션 정리 (1시간마다)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}, 60 * 60 * 1000);

module.exports = { createSession, validateSession, deleteSession, apiAuth };

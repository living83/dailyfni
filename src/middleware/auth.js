const { verifyToken } = require('../utils/jwt');
const { findUserById } = require('../models/User');
const AppError = require('../utils/AppError');

// JWT 토큰 인증 미들웨어
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('인증 토큰이 필요합니다.', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    const user = findUserById(decoded.id);
    if (!user) {
      return next(new AppError('해당 사용자를 찾을 수 없습니다.', 401));
    }
    req.user = user;
    next();
  } catch (err) {
    return next(new AppError('유효하지 않은 토큰입니다.', 401));
  }
}

// 역할 기반 접근 제어 미들웨어
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('인증이 필요합니다.', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('접근 권한이 없습니다.', 403));
    }
    next();
  };
}

module.exports = { authenticate, authorize };

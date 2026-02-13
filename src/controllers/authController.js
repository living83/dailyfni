const { createUser, findUserByEmail, findUserById, getAllUsers, updateUser, deleteUser } = require('../models/User');
const { generateToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

// POST /api/auth/register - 회원가입
async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw new AppError('이메일, 비밀번호, 이름은 필수 항목입니다.', 400);
    }

    if (password.length < 6) {
      throw new AppError('비밀번호는 최소 6자 이상이어야 합니다.', 400);
    }

    const user = await createUser({ email, password, name });
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: { user: user.toJSON(), token },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 400));
  }
}

// POST /api/auth/login - 로그인
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('이메일과 비밀번호를 입력해주세요.', 400);
    }

    const user = findUserByEmail(email);
    if (!user) {
      throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
    }

    const isValid = await user.verifyPassword(password);
    if (!isValid) {
      throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
    }

    const token = generateToken(user);

    res.json({
      success: true,
      data: { user: user.toJSON(), token },
    });
  } catch (err) {
    next(err.isOperational ? err : new AppError(err.message, 500));
  }
}

// GET /api/auth/me - 내 프로필 조회
function getMe(req, res) {
  res.json({
    success: true,
    data: { user: req.user.toJSON() },
  });
}

// PATCH /api/auth/me - 내 프로필 수정
function updateMe(req, res, next) {
  const { name } = req.body;
  const updated = updateUser(req.user.id, { name });
  if (!updated) {
    return next(new AppError('사용자를 찾을 수 없습니다.', 404));
  }
  res.json({
    success: true,
    data: { user: updated.toJSON() },
  });
}

// GET /api/users - 전체 사용자 목록 (관리자 전용)
function listUsers(req, res) {
  const users = getAllUsers().map(u => u.toJSON());
  res.json({
    success: true,
    data: { users, count: users.length },
  });
}

// DELETE /api/users/:id - 사용자 삭제 (관리자 전용)
function removeUser(req, res, next) {
  const deleted = deleteUser(req.params.id);
  if (!deleted) {
    return next(new AppError('사용자를 찾을 수 없습니다.', 404));
  }
  res.json({ success: true, message: '사용자가 삭제되었습니다.' });
}

module.exports = { register, login, getMe, updateMe, listUsers, removeUser };

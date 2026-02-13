const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  register,
  login,
  getMe,
  updateMe,
  listUsers,
  removeUser,
} = require('../controllers/authController');

const router = Router();

// --- 공개 엔드포인트 ---
router.post('/auth/register', register);
router.post('/auth/login', login);

// --- 인증 필요 엔드포인트 ---
router.get('/auth/me', authenticate, getMe);
router.patch('/auth/me', authenticate, updateMe);

// --- 관리자 전용 엔드포인트 ---
router.get('/users', authenticate, authorize('admin'), listUsers);
router.delete('/users/:id', authenticate, authorize('admin'), removeUser);

module.exports = router;

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// 인메모리 사용자 저장소
const users = new Map();

class User {
  constructor({ email, password, name, role = 'user' }) {
    this.id = uuidv4();
    this.email = email;
    this.passwordHash = null;
    this._rawPassword = password;
    this.name = name;
    this.role = role; // 'admin' | 'user' | 'viewer'
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  async hashPassword() {
    this.passwordHash = await bcrypt.hash(this._rawPassword, 12);
    delete this._rawPassword;
  }

  async verifyPassword(password) {
    return bcrypt.compare(password, this.passwordHash);
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      role: this.role,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// --- 저장소 함수들 ---

async function createUser({ email, password, name, role }) {
  if (users.has(email)) {
    throw new Error('이미 등록된 이메일입니다.');
  }

  const user = new User({ email, password, name, role });
  await user.hashPassword();
  users.set(email, user);
  return user;
}

function findUserByEmail(email) {
  return users.get(email) || null;
}

function findUserById(id) {
  for (const user of users.values()) {
    if (user.id === id) return user;
  }
  return null;
}

function getAllUsers() {
  return Array.from(users.values());
}

function updateUser(id, updates) {
  const user = findUserById(id);
  if (!user) return null;

  const allowed = ['name', 'role'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      user[key] = updates[key];
    }
  }
  user.updatedAt = new Date().toISOString();
  return user;
}

function deleteUser(id) {
  const user = findUserById(id);
  if (!user) return false;
  users.delete(user.email);
  return true;
}

module.exports = {
  User,
  createUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  updateUser,
  deleteUser,
};

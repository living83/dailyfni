const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// 인메모리 직원 저장소
const employees = new Map();

// 유효 역할값
const VALID_ROLES = ['admin', 'sales'];
const VALID_DATA_SCOPES = ['self', 'all'];

class Employee {
  constructor({ name, loginId, department, position, role = 'sales', dataScope = 'self', isActive = true, joinDate, password }) {
    this.id = uuidv4();
    this.loginId = loginId || '';
    this.name = name;
    this.department = department || '';
    this.position = position || '';
    this.role = role;
    this.dataScope = dataScope;
    this.isActive = isActive;
    this.joinDate = joinDate || new Date().toISOString().split('T')[0];
    this.passwordHash = null;
    this._rawPassword = password;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  async hashPassword() {
    if (this._rawPassword) {
      this.passwordHash = await bcrypt.hash(this._rawPassword, 12);
      delete this._rawPassword;
    }
  }

  async verifyPassword(password) {
    return bcrypt.compare(password, this.passwordHash);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      department: this.department,
      position: this.position,
      role: this.role,
      dataScope: this.dataScope,
      isActive: this.isActive,
      joinDate: this.joinDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// --- 저장소 함수들 ---

async function create(data) {
  if (!data.name) {
    throw new Error('이름은 필수 항목입니다.');
  }
  if (data.role && !VALID_ROLES.includes(data.role)) {
    throw new Error(`유효하지 않은 역할입니다. 가능한 값: ${VALID_ROLES.join(', ')}`);
  }
  if (data.dataScope && !VALID_DATA_SCOPES.includes(data.dataScope)) {
    throw new Error(`유효하지 않은 데이터 범위입니다. 가능한 값: ${VALID_DATA_SCOPES.join(', ')}`);
  }

  const employee = new Employee(data);
  await employee.hashPassword();
  employees.set(employee.id, employee);
  return employee;
}

function findAll(options = {}) {
  let results = Array.from(employees.values());

  // 검색 (이름)
  if (options.search) {
    const keyword = options.search.toLowerCase();
    results = results.filter((e) => e.name.toLowerCase().includes(keyword));
  }

  // 필터: 부서
  if (options.department) {
    results = results.filter((e) => e.department === options.department);
  }

  // 필터: 역할
  if (options.role) {
    results = results.filter((e) => e.role === options.role);
  }

  // 필터: 활성 상태
  if (options.isActive !== undefined) {
    const active = options.isActive === 'true' || options.isActive === true;
    results = results.filter((e) => e.isActive === active);
  }

  // 정렬
  const sortBy = options.sortBy || 'createdAt';
  const order = options.order === 'asc' ? 1 : -1;
  results.sort((a, b) => {
    if (a[sortBy] < b[sortBy]) return -1 * order;
    if (a[sortBy] > b[sortBy]) return 1 * order;
    return 0;
  });

  return results;
}

function findById(id) {
  return employees.get(id) || null;
}

function update(id, updates) {
  const employee = employees.get(id);
  if (!employee) return null;

  const allowed = ['name', 'department', 'position', 'role', 'dataScope', 'joinDate'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'role' && !VALID_ROLES.includes(updates[key])) {
        throw new Error(`유효하지 않은 역할입니다. 가능한 값: ${VALID_ROLES.join(', ')}`);
      }
      if (key === 'dataScope' && !VALID_DATA_SCOPES.includes(updates[key])) {
        throw new Error(`유효하지 않은 데이터 범위입니다. 가능한 값: ${VALID_DATA_SCOPES.join(', ')}`);
      }
      employee[key] = updates[key];
    }
  }
  employee.updatedAt = new Date().toISOString();
  return employee;
}

function remove(id) {
  const employee = employees.get(id);
  if (!employee) return false;
  employees.delete(id);
  return true;
}

function activate(id) {
  const employee = employees.get(id);
  if (!employee) return null;
  employee.isActive = true;
  employee.updatedAt = new Date().toISOString();
  return employee;
}

function deactivate(id) {
  const employee = employees.get(id);
  if (!employee) return null;
  employee.isActive = false;
  employee.updatedAt = new Date().toISOString();
  return employee;
}

function findByLoginId(loginId) {
  return Array.from(employees.values()).find(e => e.loginId === loginId) || null;
}

async function resetPassword(id, tempPassword) {
  const employee = employees.get(id);
  if (!employee) return null;
  employee.passwordHash = await bcrypt.hash(tempPassword, 12);
  employee.updatedAt = new Date().toISOString();
  return employee;
}

// --- 초기 샘플 데이터 ---
async function initSampleData() {
  const samples = [
    { name: '박팀장', loginId: 'admin', department: '관리부', position: '팀장', role: 'admin', dataScope: 'all', joinDate: '2020-03-01', password: '1234' },
    { name: '김대리', loginId: 'kim', department: '영업부', position: '대리', role: 'sales', dataScope: 'self', joinDate: '2021-06-15', password: '1234' },
    { name: '이과장', loginId: 'lee', department: '영업부', position: '과장', role: 'sales', dataScope: 'self', joinDate: '2019-11-01', password: '1234' },
    { name: '박사원', loginId: 'park', department: '영업부', position: '사원', role: 'sales', dataScope: 'self', joinDate: '2023-01-10', password: '1234' },
  ];

  for (const sample of samples) {
    await create(sample);
  }
}

// 서버 시작 시 샘플 데이터 초기화
initSampleData().catch(console.error);

module.exports = {
  Employee,
  VALID_ROLES,
  VALID_DATA_SCOPES,
  create,
  findAll,
  findById,
  findByLoginId,
  update,
  remove,
  activate,
  deactivate,
  resetPassword,
};

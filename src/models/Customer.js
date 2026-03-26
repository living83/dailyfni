const { v4: uuidv4 } = require('uuid');

// 인메모리 고객 저장소
const customers = new Map();

// 유효 상태값
const VALID_STATUSES = ['리드', '상담', '접수', '심사', '승인', '부결', '실행', '환수', '종결'];

class Customer {
  constructor({ name, phone, dbSource, assignedTo, teamId, status = '리드', memo, tags = [] }) {
    this.id = uuidv4();
    this.name = name;
    this.phone = phone;
    this.dbSource = dbSource || null;       // DB유입출처
    this.assignedTo = assignedTo || null;   // 담당자
    this.teamId = teamId || null;
    this.status = status;
    this.memo = memo || '';
    this.tags = tags;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      phone: this.phone,
      dbSource: this.dbSource,
      assignedTo: this.assignedTo,
      teamId: this.teamId,
      status: this.status,
      memo: this.memo,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// --- 저장소 함수들 ---

function create(data) {
  if (!data.name || !data.phone) {
    throw new Error('이름과 전화번호는 필수 항목입니다.');
  }
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    throw new Error(`유효하지 않은 상태입니다. 가능한 값: ${VALID_STATUSES.join(', ')}`);
  }

  const customer = new Customer(data);
  customers.set(customer.id, customer);
  return customer;
}

/**
 * 전체 고객 조회 (필터/검색/정렬)
 * @param {Object} options
 * @param {string} options.search - 이름 또는 전화번호 검색
 * @param {string} options.status - 상태 필터
 * @param {string} options.assignedTo - 담당자 필터
 * @param {string} options.teamId - 팀 필터
 * @param {string} options.tag - 태그 필터
 * @param {string} options.sortBy - 정렬 기준 (createdAt, updatedAt, name)
 * @param {string} options.order - 정렬 방향 (asc, desc)
 */
function findAll(options = {}) {
  let results = Array.from(customers.values());

  // 검색 (이름 또는 전화번호)
  if (options.search) {
    const keyword = options.search.toLowerCase();
    results = results.filter(
      (c) => c.name.toLowerCase().includes(keyword) || c.phone.includes(keyword)
    );
  }

  // 필터: 상태
  if (options.status) {
    results = results.filter((c) => c.status === options.status);
  }

  // 필터: 담당자
  if (options.assignedTo) {
    results = results.filter((c) => c.assignedTo === options.assignedTo);
  }

  // 필터: 팀
  if (options.teamId) {
    results = results.filter((c) => c.teamId === options.teamId);
  }

  // 필터: 태그
  if (options.tag) {
    results = results.filter((c) => c.tags.includes(options.tag));
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
  return customers.get(id) || null;
}

function findByPhone(phone) {
  for (const customer of customers.values()) {
    if (customer.phone === phone) return customer;
  }
  return null;
}

function update(id, updates) {
  const customer = customers.get(id);
  if (!customer) return null;

  const allowed = ['name', 'phone', 'dbSource', 'assignedTo', 'teamId', 'status', 'memo', 'tags'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'status' && !VALID_STATUSES.includes(updates[key])) {
        throw new Error(`유효하지 않은 상태입니다. 가능한 값: ${VALID_STATUSES.join(', ')}`);
      }
      customer[key] = updates[key];
    }
  }
  customer.updatedAt = new Date().toISOString();
  return customer;
}

function remove(id) {
  const customer = customers.get(id);
  if (!customer) return false;
  customers.delete(id);
  return true;
}

/**
 * 고객 병합: sourceId 고객 정보를 targetId 고객에 병합 후 source 삭제
 * - target의 빈 필드를 source 값으로 채움
 * - 태그와 메모는 합침
 */
function merge(sourceId, targetId) {
  const source = customers.get(sourceId);
  const target = customers.get(targetId);

  if (!source) throw new Error('원본 고객을 찾을 수 없습니다.');
  if (!target) throw new Error('대상 고객을 찾을 수 없습니다.');
  if (sourceId === targetId) throw new Error('같은 고객을 병합할 수 없습니다.');

  // 빈 필드 채우기
  const fillable = ['dbSource', 'assignedTo', 'teamId'];
  for (const key of fillable) {
    if (!target[key] && source[key]) {
      target[key] = source[key];
    }
  }

  // 메모 합치기
  if (source.memo) {
    target.memo = target.memo
      ? `${target.memo}\n---\n[병합됨] ${source.memo}`
      : source.memo;
  }

  // 태그 합치기 (중복 제거)
  target.tags = [...new Set([...target.tags, ...source.tags])];

  target.updatedAt = new Date().toISOString();

  // 원본 삭제
  customers.delete(sourceId);

  return target;
}

module.exports = {
  Customer,
  VALID_STATUSES,
  create,
  findAll,
  findById,
  findByPhone,
  update,
  remove,
  merge,
};

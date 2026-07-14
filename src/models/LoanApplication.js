const { v4: uuidv4 } = require('uuid');

// 인메모리 대출신청 저장소
const loanApplications = new Map();

// 일련번호 카운터 (날짜별)
const sequenceCounters = {};

// 유효한 대출 유형
const LOAN_TYPES = ['신용', '담보', '자동차', '기타'];

// 유효한 상태값
const STATUSES = ['리드', '상담', '접수', '심사중', '승인', '부결', '실행', '환수', '종결'];

// 신청번호 자동생성 (LA-yyyyMMdd-NNN)
function generateApplicationNo() {
  const now = new Date();
  const dateStr = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0');

  if (!sequenceCounters[dateStr]) {
    sequenceCounters[dateStr] = 0;
  }
  sequenceCounters[dateStr]++;

  const seq = String(sequenceCounters[dateStr]).padStart(3, '0');
  return `LA-${dateStr}-${seq}`;
}

class LoanApplication {
  constructor({
    customerId,
    customerName,
    loanAmount,
    loanType = '신용',
    feeRate = 0,
    agencyName = '',
    dbSource = '',
    assignedTo = '',
    teamId = '',
    memo = '',
    tags = [],
  }) {
    this.id = uuidv4();
    this.applicationNo = generateApplicationNo();
    this.customerId = customerId;
    this.customerName = customerName;
    this.loanAmount = loanAmount;
    this.loanType = loanType;
    this.feeRate = feeRate;
    this.agencyName = agencyName;
    this.dbSource = dbSource;
    this.status = '리드';
    this.assignedTo = assignedTo;
    this.teamId = teamId;
    this.memo = memo;
    this.tags = tags;
    this.documents = [];
    this.statusHistory = [
      {
        from: null,
        to: '리드',
        reason: '신규 신청',
        changedBy: 'system',
        changedAt: new Date().toISOString(),
      },
    ];
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      applicationNo: this.applicationNo,
      customerId: this.customerId,
      customerName: this.customerName,
      loanAmount: this.loanAmount,
      loanType: this.loanType,
      feeRate: this.feeRate,
      agencyName: this.agencyName,
      dbSource: this.dbSource,
      status: this.status,
      assignedTo: this.assignedTo,
      teamId: this.teamId,
      memo: this.memo,
      tags: this.tags,
      documents: this.documents,
      statusHistory: this.statusHistory,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// --- 저장소 함수들 ---

function create(data) {
  const loan = new LoanApplication(data);
  loanApplications.set(loan.id, loan);
  return loan;
}

function findById(id) {
  return loanApplications.get(id) || null;
}

function findAll({ filter = {}, search = '', sort = 'createdAt', order = 'desc', tab = '' } = {}) {
  let results = Array.from(loanApplications.values());

  // 탭 필터 (상태 그룹)
  if (tab) {
    const tabMap = {
      '진행중': ['리드', '상담', '접수', '심사중'],
      '완료': ['승인', '실행'],
      '종결': ['부결', '환수', '종결'],
    };
    const statusGroup = tabMap[tab];
    if (statusGroup) {
      results = results.filter(l => statusGroup.includes(l.status));
    }
  }

  // 개별 필터
  if (filter.status) {
    results = results.filter(l => l.status === filter.status);
  }
  if (filter.loanType) {
    results = results.filter(l => l.loanType === filter.loanType);
  }
  if (filter.assignedTo) {
    results = results.filter(l => l.assignedTo === filter.assignedTo);
  }
  if (filter.teamId) {
    results = results.filter(l => l.teamId === filter.teamId);
  }
  if (filter.agencyName) {
    results = results.filter(l => l.agencyName === filter.agencyName);
  }
  if (filter.dbSource) {
    results = results.filter(l => l.dbSource === filter.dbSource);
  }

  // 검색 (고객명, 신청번호, 메모)
  if (search) {
    const keyword = search.toLowerCase();
    results = results.filter(l =>
      l.customerName.toLowerCase().includes(keyword) ||
      l.applicationNo.toLowerCase().includes(keyword) ||
      l.memo.toLowerCase().includes(keyword)
    );
  }

  // 정렬
  const validSorts = ['createdAt', 'updatedAt', 'loanAmount', 'customerName', 'applicationNo'];
  const sortField = validSorts.includes(sort) ? sort : 'createdAt';
  const sortOrder = order === 'asc' ? 1 : -1;

  results.sort((a, b) => {
    if (a[sortField] < b[sortField]) return -1 * sortOrder;
    if (a[sortField] > b[sortField]) return 1 * sortOrder;
    return 0;
  });

  return results;
}

function update(id, updates) {
  const loan = loanApplications.get(id);
  if (!loan) return null;

  const allowed = [
    'customerId', 'customerName', 'loanAmount', 'loanType',
    'feeRate', 'agencyName', 'dbSource', 'teamId', 'memo', 'tags',
  ];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      loan[key] = updates[key];
    }
  }
  loan.updatedAt = new Date().toISOString();
  return loan;
}

function changeStatus(id, newStatus, reason = '', changedBy = 'system') {
  const loan = loanApplications.get(id);
  if (!loan) return null;

  if (!STATUSES.includes(newStatus)) {
    throw new Error(`유효하지 않은 상태입니다: ${newStatus}`);
  }

  const oldStatus = loan.status;
  loan.status = newStatus;
  loan.statusHistory.push({
    from: oldStatus,
    to: newStatus,
    reason,
    changedBy,
    changedAt: new Date().toISOString(),
  });
  loan.updatedAt = new Date().toISOString();
  return loan;
}

function changeAssignee(id, newAssignee, memo = '', changedBy = 'system') {
  const loan = loanApplications.get(id);
  if (!loan) return null;

  const oldAssignee = loan.assignedTo;
  loan.assignedTo = newAssignee;
  loan.statusHistory.push({
    type: 'assignee_change',
    from: oldAssignee,
    to: newAssignee,
    memo,
    changedBy,
    changedAt: new Date().toISOString(),
  });
  loan.updatedAt = new Date().toISOString();
  return loan;
}

function addDocument(id, docMeta) {
  const loan = loanApplications.get(id);
  if (!loan) return null;

  const doc = {
    docId: uuidv4(),
    fileName: docMeta.fileName,
    fileType: docMeta.fileType || '',
    fileSize: docMeta.fileSize || 0,
    category: docMeta.category || '기타',
    uploadedBy: docMeta.uploadedBy || 'system',
    uploadedAt: new Date().toISOString(),
  };
  loan.documents.push(doc);
  loan.updatedAt = new Date().toISOString();
  return doc;
}

module.exports = {
  LoanApplication,
  LOAN_TYPES,
  STATUSES,
  create,
  findById,
  findAll,
  update,
  changeStatus,
  changeAssignee,
  addDocument,
};

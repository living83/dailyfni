// ========================================
// 대부중개 전산시스템 - 프론트엔드 앱
// ========================================

// API 인증 토큰 자동 전송
const _originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  if (typeof url === 'string' && url.startsWith('/api')) {
    try {
      const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
      if (user.token) {
        options.headers = options.headers || {};
        if (typeof options.headers === 'object' && !(options.headers instanceof Headers)) {
          options.headers['x-auth-token'] = user.token;
        }
      }
    } catch {}
  }
  return _originalFetch.call(this, url, options);
};

// 권한 체크 (전사=admin, 본인=sales)
function isAdmin() {
  try {
    const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
    return user.dataScope === 'all' || user.role === 'admin';
  } catch { return false; }
}

// 모달 배경 클릭으로 닫기 (드래그 방지)
function addModalClose(modal, closeFn) {
  let mouseDownTarget = null;
  modal.addEventListener('mousedown', (e) => { mouseDownTarget = e.target; });
  modal.addEventListener('mouseup', (e) => {
    if (e.target === modal && mouseDownTarget === modal) closeFn();
    mouseDownTarget = null;
  });
}

// 금액 콤마 포맷 (원 단위)
function formatWon(val) {
  const num = String(val).replace(/[^0-9]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString();
}

// 주민번호 하이픈 자동 포맷
function formatSsn(val) {
  const num = val.replace(/[^0-9]/g, '');
  if (num.length <= 6) return num;
  return num.substring(0,6) + '-' + num.substring(6,13);
}

// 주민번호에서 만나이 + 성별 자동 계산
function calcAge() {
  const ssn = (document.getElementById('reg-ssn')?.value || '').replace(/-/g,'');
  if (ssn.length < 7) return;
  const genderCode = ssn.charAt(6);
  const century = (genderCode === '1' || genderCode === '2') ? 1900 : 2000;
  const birthYear = century + parseInt(ssn.substring(0,2));
  const birthMonth = parseInt(ssn.substring(2,4));
  const birthDay = parseInt(ssn.substring(4,6));
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  if (today.getMonth()+1 < birthMonth || (today.getMonth()+1 === birthMonth && today.getDate() < birthDay)) age--;
  const ageEl = document.getElementById('reg-age');
  if (ageEl) ageEl.value = age + '세';
  const genderEl = document.getElementById('reg-gender');
  if (genderEl) genderEl.value = (genderCode === '1' || genderCode === '3') ? '남' : '여';
}

// 연봉 → 월 환산
function calcMonthly() {
  const salary = parseInt(document.getElementById('reg-salary')?.value) || 0;
  const monthlyEl = document.getElementById('reg-monthly');
  if (monthlyEl) monthlyEl.value = salary > 0 ? Math.round(salary/12) + '만원' : '';
}

// 주소 검색 (고객등록용 - 단일 input)
function openAddrSearchSingle(inputId) {
  new daum.Postcode({
    oncomplete: function(data) {
      const el = document.getElementById(inputId);
      if (el) {
        el.value = data.roadAddress || data.jibunAddress;
        el.removeAttribute('readonly');
      }
    }
  }).open();
}

// 상담내용 영문 → 한글 변환
function translateContent(content) {
  if (!content) return '';
  return content
    .replace(/employed/g, '직장인')
    .replace(/self_employed/g, '개인사업자')
    .replace(/unemployed/g, '무직')
    .replace(/other/g, '기타')
    .replace(/yes/g, '가입')
    .replace(/no/g, '미가입')
    .replace(/unknown/g, '모름')
    .replace(/SKT/g, 'SKT')
    .replace(/KT/g, 'KT')
    .replace(/LGU/g, 'LGU+')
    .replace(/통신사:/g, '통신사:')
    .replace(/직업:/g, '직업:')
    .replace(/4대보험:/g, '4대보험:');
}

// 전화번호 하이픈 자동 포맷
function formatPhone(val) {
  const num = val.replace(/[^0-9]/g, '');
  if (num.length <= 3) return num;
  if (num.length <= 7) return num.substring(0,3) + '-' + num.substring(3);
  return num.substring(0,3) + '-' + num.substring(3,7) + '-' + num.substring(7,11);
}

const pages = {
  dashboard: { title: '대시보드', render: renderDashboard },
  'customer-register': { title: '고객등록', render: renderCustomerRegister },
  'customer-edit': { title: '고객 수정', render: renderCustomerEdit },
  intake: { title: '신규 유입', render: renderIntake },
  'customer-ledger': { title: '고객원장', render: renderCustomerLedger },
  customers: { title: '고객현황', render: renderCustomers },
  loans: { title: '대출 신청 관리', render: renderLoans },
  'loan-register': { title: '대출 접수', render: renderLoanRegister },
  consultation: { title: '상담 이력', render: renderConsultation },
  settlement: { title: '매출/수당 정산', render: renderSettlement },
  performance: { title: '성과 분석', render: renderPerformance },
  export: { title: '데이터 내보내기', render: renderExport },
  employees: { title: '직원/권한 관리', render: renderEmployees },
  notifications: { title: '알림', render: renderNotifications },
  audit: { title: '감사로그', render: renderAudit },
};

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
  const hash = location.hash;
  if (hash && hash.startsWith('#ledger-')) {
    const id = parseInt(hash.replace('#ledger-', ''));
    if (id) {
      currentLedgerId = id;
      // 사이드바 숨기고 메인 영역 전체 사용
      document.getElementById('sidebar').style.display = 'none';
      document.querySelector('.main-wrapper').style.marginLeft = '0';
      // MySQL에서 로드 후 타이틀 변경
      loadLedgerCustomer(id).then(data => {
        if (data) {
          ledgerCustomer = data;
          document.title = data.name + ' - 고객원장';
          document.getElementById('content').innerHTML = renderCustomerLedger();
        }
      });
      navigate('customer-ledger');
    } else {
      navigate('dashboard');
    }
  } else {
    navigate('dashboard');
  }
  bindNav();
  bindToggle();
});

function bindNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });
}

function bindToggle() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
}

function navigate(page) {
  const p = pages[page];
  if (!p) return;
  document.getElementById('pageTitle').textContent = p.title;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const active = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (active) active.classList.add('active');
  document.getElementById('content').innerHTML = p.render();
  // 대출 접수 페이지 렌더 후 추천 상품 자동 표시
  if (page === 'loan-register' && loanRegisterCustomerId) {
    setTimeout(() => {
      renderRecommendations();
      // 폼 입력값 변경 시 추천 상품 자동 갱신
      document.querySelectorAll('.form-table input, .form-table select').forEach(el => {
        el.addEventListener('change', () => setTimeout(renderRecommendations, 100));
      });
    }, 50);
  }
  // 고객원장 렌더 후 타임라인 로드
  if (page === 'customer-ledger' && currentLedgerId) {
    setTimeout(() => loadLedgerTimelines(currentLedgerId), 200);
  }
}

// ========================================
// 1. 대시보드
// ========================================
let dashboardData = null;

function renderDashboard() {
  // DB에서 로드
  if (!dashboardData) {
    loadDashboard();
  }
  const d = dashboardData || {};
  const statusMap = {'리드':'badge-lead','상담':'badge-consult','접수':'badge-submit','심사중':'badge-review','승인':'badge-approved','부결':'badge-rejected','실행':'badge-executed','환수':'badge-rejected','종결':'badge-closed'};

  const totalCust = d.totalCustomers || 0;
  const statusRows = (d.statusCounts || []).map(s => {
    const pct = totalCust > 0 ? ((s.cnt / totalCust) * 100).toFixed(1) : 0;
    return `<tr><td><span class="badge ${statusMap[s.status]||'badge-lead'}">${s.status||'-'}</span></td><td>${s.cnt}</td><td>${pct}%</td></tr>`;
  }).join('') || '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">데이터 없음</td></tr>';

  const dbRows = (d.dbSourceCounts || []).map(s =>
    `<tr><td>${s.db_source||'-'}</td><td>${s.cnt}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:#94a3b8;">데이터 없음</td></tr>';

  const recentRows = (d.recentCustomers || []).map(c => {
    const date = c.created_at ? new Date(c.created_at).toISOString().split('T')[0] : '-';
    return `<tr>
      <td>${date}</td>
      <td><a href="#" class="customer-link" ondblclick="viewCustomerLedger(${c.id});return false;">${c.name}</a></td>
      <td>${formatPhone(c.phone||'')}</td>
      <td><span class="badge ${statusMap[c.status]||'badge-lead'}">${c.status||'리드'}</span></td>
      <td>${c.assigned_to||'-'}</td>
      <td>${c.db_source||'-'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">등록된 고객이 없습니다.</td></tr>';

  return `
    <div id="intakeCard"></div>
    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">이번 달 신규 고객</div>
        <div class="value">${d.newCustomers || 0}명</div>
      </div>
      <div class="stat-card">
        <div class="label">전체 고객</div>
        <div class="value">${totalCust}명</div>
      </div>
      <div class="stat-card">
        <div class="label">신규 유입 대기</div>
        <div class="value" style="color:#f59e0b;">${d.pendingIntake || 0}건</div>
      </div>
      <div class="stat-card">
        <div class="label">미확인 알림</div>
        <div class="value" style="color:#ef4444;">${d.unreadNotis || 0}건</div>
      </div>
      <div class="stat-card">
        <div class="label">오늘 상담</div>
        <div class="value">${d.todayConsults || 0}건</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h2>고객 상태별 현황</h2></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>상태</th><th>건수</th><th>비율</th></tr></thead>
            <tbody>${statusRows}</tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>DB 출처별 유입 현황</h2></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>출처</th><th>건수</th></tr></thead>
            <tbody>${dbRows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>최근 등록 고객</h2>
        <button class="btn btn-outline btn-sm" onclick="navigate('customers')">전체보기</button>
      </div>
      <div class="panel-body">
        <table>
          <thead><tr><th>등록일</th><th>고객명</th><th>연락처</th><th>상태</th><th>담당자</th><th>DB출처</th></tr></thead>
          <tbody>${recentRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard/summary');
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { return; }
    if (data.success) {
      dashboardData = data.data;
      if (document.getElementById('intakeCard')) {
        document.getElementById('content').innerHTML = renderDashboard();
      }
    }
  } catch (e) { console.error(e); }
}

// ========================================
// 2. 고객 관리
// ========================================
let dbCustomers = [];

function renderCustomers() {
  if (dbCustomers.length === 0) loadDbCustomers();

  const statusMap = {'리드':'badge-lead','상담':'badge-consult','접수':'badge-submit','심사중':'badge-review','승인':'badge-approved','부결':'badge-rejected','실행':'badge-executed','종결':'badge-closed'};
  const creditStatusBadge = (s) => {
    const map = {'정상':'badge-approved','회생':'badge-review','파산':'badge-rejected','회복':'badge-consult'};
    return `<span class="badge ${map[s]||'badge-lead'}">${s||'정상'}</span>`;
  };

  const rows = dbCustomers.map(c => {
    const ssn = c.ssn||'';
    const ssnDisplay = ssn.length >= 8 ? ssn.substring(0,6) + '-' + ssn.charAt(7) : ssn.substring(0,6);
    const loanDate = c.loan_date ? new Date(c.loan_date).toISOString().split('T')[0] : '-';
    const score = c.credit_score || 0;
    return `<tr>
      <td>${c.id}</td>
      <td><a href="#" class="customer-link" ondblclick="viewCustomerLedger(${c.id});return false;" title="더블클릭: 고객원장 열기">${c.name}</a></td>
      <td>${ssnDisplay}</td>
      <td>${creditStatusBadge(c.credit_status)}</td>
      <td style="color:${score>=700?'#16a34a':score>=600?'#d97706':'#ef4444'};font-weight:600;">${score}</td>
      <td>${loanDate}</td>
      <td>${c.loan_amount||'-'}</td>
      <td><span class="badge ${statusMap[c.status]||'badge-lead'}">${c.status||'리드'}</span></td>
      <td>${c.assigned_to||'-'}</td>
      <td>${c.db_source||'-'}</td>
      <td>${isAdmin() ? `<button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:#ef4444;" onclick="deleteDbCustomer(${c.id},'${c.name}')">삭제</button>` : ''}</td>
    </tr>`;
  }).join('');

  return `
    <div class="filter-bar">
      <input type="text" id="custSearch" placeholder="고객명 검색">
      <select id="custCreditStatus"><option>전체 신용상태</option><option>정상</option><option>회생</option><option>파산</option><option>회복</option></select>
      <select id="custStatus"><option>전체 진행상태</option><option>리드</option><option>상담</option><option>접수</option><option>심사중</option><option>승인</option><option>부결</option><option>실행</option></select>
      <select id="custAssigned"><option>전체 담당자</option></select>
      <button class="btn btn-primary" onclick="loadDbCustomers()">검색</button>
      <button class="btn btn-primary" style="margin-left:auto" onclick="navigate('customer-register')">+ 고객 등록</button>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>고객현황 (${dbCustomers.length}명)</h2>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead>
            <tr><th>No</th><th>고객명</th><th>주민번호</th><th>신용상태</th><th>신용점수</th><th>대출일자</th><th>대출금액</th><th>진행상태</th><th>담당자</th><th>DB출처</th><th>관리</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="12" style="text-align:center;padding:30px;color:#94a3b8;">등록된 고객이 없습니다.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ========================================
// 3. 대출 신청 관리
// ========================================
let loanListData = [];
let loanListSummary = null;

async function loadDbCustomers() {
  try {
    const search = document.getElementById('custSearch')?.value || '';
    const creditStatus = document.getElementById('custCreditStatus')?.value || '';
    const status = document.getElementById('custStatus')?.value || '';
    const assigned = document.getElementById('custAssigned')?.value || '';

    let url = '/api/customers?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (creditStatus && creditStatus !== '전체 신용상태') url += `creditStatus=${encodeURIComponent(creditStatus)}&`;
    if (status && status !== '전체 진행상태') url += `status=${encodeURIComponent(status)}&`;
    if (assigned && assigned !== '전체 담당자') url += `assignedTo=${encodeURIComponent(assigned)}&`;

    const res = await fetch(url);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { return; }
    if (data.success) {
      dbCustomers = data.data;
      if (document.getElementById('custSearch')) navigate('customers');
    }
  } catch (e) { console.error(e); }
}

async function deleteDbCustomer(id, name) {
  if (!confirm(`"${name}" 고객을 삭제하시겠습니까?\n\n삭제 후 복구할 수 없습니다.`)) return;
  try {
    await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    dbCustomers = [];
    navigate('customers');
    setTimeout(() => loadDbCustomers(), 100);
  } catch (e) { alert('오류: ' + e.message); }
}

// 페이지 로드 시 고객 데이터 로드
setTimeout(() => loadDbCustomers(), 600);

async function deleteCustomer(id, name) {
  if (!confirm(`"${name}" 고객을 삭제하시겠습니까?\n\n삭제 후 복구할 수 없습니다.`)) return;

  // MySQL 연동 시 API 호출
  try {
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      // 인메모리에서도 삭제
      delete customerData[id];
      navigate('customers');
      alert(`${name} 고객이 삭제되었습니다.`);
    } else {
      // API 미구현 시 인메모리에서만 삭제
      delete customerData[id];
      navigate('customers');
      alert(`${name} 고객이 삭제되었습니다.`);
    }
  } catch (e) {
    // API 연결 안 될 때 인메모리에서만 삭제
    delete customerData[id];
    navigate('customers');
    alert(`${name} 고객이 삭제되었습니다.`);
  }
}

function renderLoans() {
  const statusOptions = ['전체','접수','전송','심사','가승인','승인','보류','부결','진행후부결','조회접수','접수실패','완납','조회중','정상접수','상담중','진행중','예약완료','서류안내','서류받음','서류보완','부재','본인취소','진행불가','지속부재','진행안내','안내예정','통화예정','본진행접수','인증대기','진행보류'];

  const summaryHtml = loanListSummary ? `
    <div class="stat-cards" style="margin-bottom:10px;">
      <div class="stat-card"><div class="label">금일 접수</div><div class="value">${loanListSummary.todayApply}건</div></div>
      <div class="stat-card"><div class="label">금일 승인</div><div class="value">${loanListSummary.todayApproved}건 / ${loanListSummary.todayApprovedAmount}만원</div></div>
      <div class="stat-card"><div class="label">금일 부결</div><div class="value">${loanListSummary.todayRejected}건</div></div>
    </div>` : '';

  const statusBadge = (s) => {
    const map = {'접수':'badge-submit','전송':'badge-submit','심사':'badge-review','가승인':'badge-review','승인':'badge-approved','부결':'badge-rejected','진행후부결':'badge-rejected','완납':'badge-executed','본인취소':'badge-closed','진행불가':'badge-closed','조회중':'badge-lead','정상접수':'badge-submit','상담중':'badge-consult','진행중':'badge-consult','서류안내':'badge-consult','서류받음':'badge-consult','인증대기':'badge-lead'};
    return `<span class="badge ${map[s]||'badge-lead'}">${s}</span>`;
  };

  let rowsHtml = '';
  if (loanListData.length > 0) {
    rowsHtml = loanListData.map(r => `
      <tr>
        <td>${r.applyDate}</td><td>${r.processDate}</td><td>${r.productName}</td>
        <td>${r.recruiter}</td><td>${r.customerName}</td><td>${r.birthDate}</td>
        <td>${r.gender}</td><td>${r.jobType}</td><td>${statusBadge(r.status)}</td>
        <td>${r.approvedAmount}</td><td style="font-size:10px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.reviewMemo}">${r.reviewMemo}</td>
      </tr>`).join('');
  } else {
    rowsHtml = '<tr><td colspan="11" style="text-align:center;padding:30px;color:#94a3b8;">론앤마스터 연동 후 [동기화] 버튼을 클릭하세요.</td></tr>';
  }

  return `
    ${summaryHtml}
    <div class="filter-bar">
      <select id="loanStatusFilter">${statusOptions.map(s => `<option>${s}</option>`).join('')}</select>
      <select id="loanDateType"><option value="접수일">접수일</option><option value="처리일">처리일</option><option value="승인일">승인일</option></select>
      <select id="loanDateRange"><option value="당월">당월</option><option value="당일">당일</option><option value="전일">전일</option><option value="전월">전월</option></select>
      <button class="btn btn-primary" onclick="syncLoanList()">동기화</button>
      <span id="loanSyncStatus" style="font-size:11px;color:#94a3b8;margin-left:8px;"></span>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>대출 신청 내역 <span style="font-size:12px;color:#94a3b8;font-weight:400;">(론앤마스터 연동)</span></h2>
        <span style="font-size:11px;color:#94a3b8;">${loanListData.length}건</span>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead>
            <tr><th>접수일시</th><th>처리일시</th><th>상품명</th><th>모집인</th><th>이름</th><th>생년월일</th><th>성별</th><th>직업구분</th><th>처리상태</th><th>승인액</th><th>심사메모</th></tr>
          </thead>
          <tbody id="loanListBody">
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function syncLoanList() {
  const statusEl = document.getElementById('loanSyncStatus');
  const statusFilter = document.getElementById('loanStatusFilter')?.value;
  const dateType = document.getElementById('loanDateType')?.value;
  const dateRange = document.getElementById('loanDateRange')?.value;

  if (statusEl) statusEl.textContent = '동기화 중...';

  try {
    let url = '/api/crawler/loan-list?agentNo=12&upw=1';
    if (statusFilter && statusFilter !== '전체') url += '&status=' + encodeURIComponent(statusFilter);
    if (dateType) url += '&dateType=' + encodeURIComponent(dateType);
    if (dateRange) url += '&dateRange=' + encodeURIComponent(dateRange);

    const res = await fetch(url);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { if (statusEl) statusEl.textContent = '응답 파싱 실패'; return; }

    if (data.success) {
      loanListData = data.data.rows || [];
      loanListSummary = data.data.summary;
      if (statusEl) statusEl.textContent = `${loanListData.length}건 동기화 완료 (${new Date().toLocaleTimeString()})`;
      // 테이블 업데이트
      navigate('loans');
    } else {
      if (statusEl) statusEl.textContent = '동기화 실패: ' + (data.message || '');
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '연결 실패: ' + e.message;
  }
}

// ========================================
// 4. 대출 접수 (론앤마스터 연동 폼)
// ========================================
let loanRegisterCustomerId = null;

async function goLoanRegister(customerId) {
  closeCustomerModal();
  loanRegisterCustomerId = customerId;
  // MySQL에서 고객 데이터 로드
  try {
    const res = await fetch(`/api/customers/${customerId}`);
    const data = await res.json();
    if (data.success) {
      loanRegisterCustomerDB = data.data;
    }
  } catch (e) {}
  navigate('loan-register');
}

let loanRegisterCustomerDB = null;

function renderLoanRegister() {
  const c = loanRegisterCustomerDB || (loanRegisterCustomerId ? customerData[loanRegisterCustomerId] : null);

  // 고객 데이터에서 파생값 계산 (MySQL snake_case 호환)
  const ssn = c ? (c.ssn || '') : '';
  const birthFromSsn = ssn.replace(/-/g,'').substring(0,6);
  const ssnClean = ssn.replace(/-/g,'');
  const genderChar = ssnClean.length >= 7 ? ssnClean.charAt(6) : '';
  const genderFromSsn = {'1':'남(1)','2':'여(2)','3':'남(3)','4':'여(4)'}[genderChar] || '';
  const phone = c ? (c.phone || '') : '';
  const phoneParts = phone.includes('-') ? phone.split('-') : [phone.substring(0,3), phone.substring(3,7), phone.substring(7)];
  const salaryYear = c ? (c.salary || 0) : '';
  const salaryMonth = c ? Math.round((c.salary || 0) / 12) : '';
  const assignedTo = c ? (c.assigned_to || c.assignedTo || '') : '';
  const dbSource = c ? (c.db_source || c.dbSource || '') : '';
  const companyAddr = c ? (c.company_addr || c.companyAddr || '') : '';
  const creditScore = c ? (c.credit_score || c.creditScore || 0) : 0;
  const residenceAddr = c ? (c.residence_address || c.residenceAddress || c.address || '') : '';
  const housingType = c ? (c.housing_type || '') : '';
  const housingOwn = c ? (c.housing_ownership || '') : '';
  const vehicleNo = c ? (c.vehicle_no || '') : '';
  const vehicleName = c ? (c.vehicle_name || '') : '';
  const vehicleYear = c ? (c.vehicle_year || '') : '';
  const vehicleKm = c ? (c.vehicle_km || '') : '';
  const vehicleOwn = c ? (c.vehicle_ownership || '') : '';
  const vehicleCoOwner = c ? (c.vehicle_co_owner || '') : '';
  const recoveryType = c ? (c.recovery_type || '') : '';
  const courtName = c ? (c.court_name || c.courtName || '') : '';
  const caseNo = c ? (c.case_no || c.caseNo || '') : '';
  const refundBank = c ? (c.refund_bank || c.refundBank || '') : '';
  const refundAccount = c ? (c.refund_account || c.refundAccount || '') : '';
  const monthlyPayment = c ? (c.monthly_payment || '') : '';
  const carrier = c ? (c.carrier || '') : '';

  const sel = (opts, val) => opts.map(o => `<option${o===val?' selected':''}>${o}</option>`).join('');
  const ro = c ? 'readonly style="background:#f1f5f9;"' : '';

  return `
    ${c ? `<div class="panel" style="border-left:3px solid #3b82f6;margin-bottom:12px;">
      <div class="panel-body" style="padding:10px 18px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:13px;"><strong>연동 고객:</strong> ${c.name} (${phone}) | ${c.company||''} | 연봉 ${salaryYear}만원 | 신용 ${creditScore}점</div>
        <button class="btn btn-outline btn-sm" onclick="loanRegisterCustomerId=null;loanRegisterCustomerDB=null;navigate('loan-register');">연동 해제</button>
      </div>
    </div>` : ''}
    <div class="loan-register-layout">
    <div class="loan-register-left">

    <div class="panel">
      <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h2>신청서 입력</h2>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline btn-sm" onclick="loanRegisterCustomerId=null;navigate('loan-register');">reset</button>
        </div>
      </div>
      <div class="panel-body" style="padding:0;">

        <!-- 등록직원 (로그인 사용자 자동 셋팅) -->
        <table class="form-table">
          <tbody>
            <tr>
              <th>등록직원</th>
              <td colspan="5">
                <input type="text" style="width:200px;background:#f1f5f9;" value="${(() => { try { return JSON.parse(sessionStorage.getItem('loggedInUser')||'{}').name||''; } catch { return ''; } })()}" readonly>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 고객 정보 -->
        <div class="form-section-title">고객 정보</div>
        <table class="form-table">
          <tbody>
            <tr>
              <th>이름 <span class="required">*</span></th>
              <td><input type="text" placeholder="이름을(를) 입력하세요." value="${c ? c.name : ''}" ${ro}></td>
              <th>생년월일 <span class="required">*</span></th>
              <td><input type="text" placeholder="생년월일을(를) 입력하세요." value="${birthFromSsn}" ${ro}></td>
              <th>성별</th>
              <td><select ${c?'disabled style="background:#f1f5f9;"':''}>${sel(['남(1)','여(2)','남(3)','여(4)'], genderFromSsn || '남(1)')}</select></td>
            </tr>
            <tr>
              <th>휴대폰 <span class="required">*</span></th>
              <td colspan="5">
                <div style="display:flex;gap:4px;align-items:center;">
                  <select style="width:80px;" ${c?'disabled style="background:#f1f5f9;width:80px;"':''}>${sel(['통신사()','SK','KT','LGU+','알뜰','SK알뜰','KT알뜰','LG알뜰','기타'], carrier||'통신사()')}</select>
                  <input type="text" style="width:60px;" placeholder="010" value="${phoneParts[0]||''}" ${ro}>
                  <input type="text" style="width:80px;" placeholder="중간자리" value="${phoneParts[1]||''}" ${ro}>
                  <input type="text" style="width:80px;" placeholder="뒷자리" value="${phoneParts[2]||''}" ${ro}>
                </div>
              </td>
            </tr>
            <tr>
              <th>대출요청액 <span class="required">*</span></th>
              <td colspan="3"><div style="display:flex;align-items:center;gap:4px;"><input type="text" placeholder="1000" style="width:200px;"> <span style="font-size:12px;color:#64748b;">만원</span></div></td>
              <th>DB 출처</th>
              <td><select>${sel(['==선택==','네이버 광고','카카오 DB','자체 DB','소개/추천','홈페이지','기타'], c ? dbSource : '==선택==')}</select></td>
            </tr>
            <tr>
              <th>실거주지주소 <span class="required">*</span></th>
              <td colspan="5">
                <div style="display:flex;gap:4px;align-items:center;">
                  <input type="text" id="lr-addr-zone" style="width:60px;" placeholder="우편번호" readonly>
                  <button class="btn btn-sm btn-primary" onclick="openAddrSearch('lr-addr')">주소 검색</button>
                  <input type="text" id="lr-addr-road" style="flex:1;" placeholder="도로명주소" value="${c ? residenceAddr : ''}" readonly>
                  <input type="text" id="lr-addr-detail" style="width:150px;" placeholder="상세주소">
                </div>
              </td>
            </tr>
            <tr>
              <th>주거종류</th>
              <td colspan="2"><select>${sel(['==선택==','아파트','빌라','연립','다세대','단독주택','상가','오피스텔','관사','기타'], housingType||'==선택==')}</select></td>
              <th>주택소유구분</th>
              <td colspan="2"><select>${sel(['==선택==','부동산 소유중','부동산 없음','기타'], housingOwn||'==선택==')}</select></td>
            </tr>
          </tbody>
        </table>

        <!-- 직장 정보 -->
        <div class="form-section-title">직장 정보</div>
        <table class="form-table">
          <tbody>
            <tr>
              <th>직업구분 <span class="required">*</span></th>
              <td colspan="5"><select>${sel(['직장인(4대가입)','직장인(미가입)','개인사업자','프리랜서','무직','주부','학생','기타'], '')}</select></td>
            </tr>
            <tr>
              <th>직장명 <span class="required">*</span></th>
              <td colspan="2"><input type="text" placeholder="직장명" value="${c ? c.company : ''}" ${ro}></td>
              <th>입사(설립)일자</th>
              <td colspan="2"><input type="text" placeholder="입사일자" value="${c ? '' : ''}"></td>
            </tr>
            <tr>
              <th>4대보험 여부</th>
              <td colspan="2"><select>${sel(['- 4대보험 여부 항목 선택 -','가입','미가입'], '')}</select></td>
              <th>(직장)사업자번호</th>
              <td colspan="2">
                <div style="display:flex;gap:4px;">
                  <input type="text" style="width:70px;" placeholder="">
                  <input type="text" style="width:70px;" placeholder="">
                  <input type="text" style="width:70px;" placeholder="">
                </div>
              </td>
            </tr>
            <tr>
              <th>연소득(년/월) <span class="required">*</span></th>
              <td colspan="5">
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="text" style="width:120px;background:${c?'#fffde7':''};" placeholder="연소득(년)" value="${salaryYear}">
                  <span style="font-size:12px;color:#64748b;">만원/</span>
                  <input type="text" style="width:100px;" placeholder="" value="${salaryMonth}">
                  <span style="font-size:12px;color:#64748b;">만원</span>
                  <span style="margin-left:12px;font-size:12px;color:#64748b;">건강보험납부금액</span>
                  <input type="text" style="width:100px;" placeholder="">
                  <span style="font-size:12px;color:#64748b;">원</span>
                  <button class="btn btn-sm btn-outline">역산</button>
                </div>
              </td>
            </tr>
            <tr>
              <th>직장 주소</th>
              <td colspan="5">
                <div style="display:flex;gap:4px;align-items:center;">
                  <input type="text" id="lr-waddr-zone" style="width:60px;" placeholder="우편번호" readonly>
                  <button class="btn btn-sm btn-primary" onclick="openAddrSearch('lr-waddr')">주소 검색</button>
                  <input type="text" id="lr-waddr-road" style="flex:1;" placeholder="도로명주소" value="${c ? companyAddr : ''}" readonly>
                  <input type="text" id="lr-waddr-detail" style="width:150px;" placeholder="상세주소">
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 차량 정보 -->
        <div class="form-section-title" style="color:#c53030;">차량 정보 - <span style="font-size:11px;">오토론 접수시 필수입력!</span></div>
        <table class="form-table">
          <tbody>
            <tr>
              <th>차량번호</th>
              <td colspan="2"><input type="text" placeholder="차량번호 (ex:123가4567)" value="${vehicleNo}"></td>
              <th>차량명</th>
              <td colspan="2"><input type="text" placeholder="" value="${vehicleName}"></td>
            </tr>
            <tr>
              <th>차량연식</th>
              <td colspan="2"><select>${sel(['==선택==','2026','2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015','기타'], vehicleYear||'==선택==')}</select></td>
              <th>주행거리</th>
              <td colspan="2">
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="text" placeholder="숫자로만 입력" value="${vehicleKm}">
                  <span style="font-size:12px;color:#64748b;">km</span>
                </div>
              </td>
            </tr>
            <tr>
              <th>차량소유구분</th>
              <td colspan="2"><select>${sel(['==선택==','소유(본인명의)','소유(공동명의 대표)','소유(공동명의)','미소유'], vehicleOwn||'==선택==')}</select></td>
              <th>공동명의자명</th>
              <td colspan="2"><input type="text" placeholder="" value="${vehicleCoOwner}"></td>
            </tr>
          </tbody>
        </table>

        <!-- 회파복 -->
        <div class="form-section-title" style="color:#c53030;">회파복 - <span style="font-size:11px;">(*회복자의경우 법원명 항목만 기재, ※신협5619~시작하는 계좌는 환급계좌가 아니오니 유의하시기 바랍니다.)</span></div>
        <table class="form-table">
          <tbody>
            <tr>
              <th>회파복 구분</th>
              <td colspan="5"><select>${sel(['==선택==','회생','파산','회복','무'], recoveryType||'==선택==')}</select></td>
            </tr>
            <tr>
              <th>법원명</th>
              <td colspan="2"><input type="text" placeholder="회복자의 경우 신용회복위원회 라고 기재" value="${courtName}" ${courtName ? ro : ''}></td>
              <th>사건번호</th>
              <td colspan="2">
                <div style="display:flex;gap:4px;align-items:center;">
                  <input type="text" style="width:60px;" placeholder="0000" value="${caseNo ? caseNo.substring(0,4) : ''}">
                  <select style="width:70px;">${sel(['선택','가단','가합','개회','개파','기타'], c&&c.caseNo ? '' : '선택')}</select>
                  <input type="text" style="width:80px;" placeholder="" value="${caseNo ? caseNo.replace(/[^0-9]/g,'').substring(4) : ''}">
                </div>
              </td>
            </tr>
            <tr>
              <th>환급은행 <span class="required">*</span></th>
              <td colspan="2"><select>${sel(['==선택==','국민은행','신한은행','우리은행','하나은행','농협은행','카카오뱅크','토스뱅크','기업은행','SC제일','씨티','기타'], refundBank||'==선택==')}</select></td>
              <th>환급은행계좌</th>
              <td colspan="2"><input type="text" placeholder="계좌번호 입력" value="${refundAccount}" ${refundAccount ? ro : ''}></td>
            </tr>
            <tr>
              <th>월변제금액</th>
              <td colspan="3"><div style="display:flex;align-items:center;gap:4px;"><input type="text" placeholder="251,252" value="${monthlyPayment ? formatWon(monthlyPayment) : ''}" oninput="this.value=formatWon(this.value)" style="width:200px;"> <span style="font-size:12px;color:#64748b;">원</span></div></td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>

        <!-- 기타사항 -->
        <div class="form-section-title">기타사항 <span style="font-size:11px;color:#c53030;">※하단 상품 선택란 빨간글씨 필수항목 또는 각 금융사별 자료실 가이드 우측 상단 ★접수시 필수 기재사항 참고하여 기재 후 접수!</span></div>
        <table class="form-table">
          <tbody>
            <tr>
              <td colspan="6" style="padding:0;">
                <textarea rows="5" style="width:100%;border:none;padding:12px;font-size:12px;resize:vertical;" placeholder="기타사항을 입력하세요...">${c ? c.memo : ''}</textarea>
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>

    <!-- 하단 버튼 -->
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn btn-primary" style="padding:10px 32px;font-size:14px;" onclick="submitLoanRegister()">접수 등록</button>
      <button class="btn btn-outline" onclick="loanRegisterCustomerId=null;navigate('loan-register');">초기화</button>
    </div>
    </div><!-- /loan-register-left -->

    <div class="loan-register-right">
      <div class="panel" style="margin-bottom:0;">
        <div class="panel-header" style="position:sticky;top:0;z-index:10;background:#fff;">
          <h2>상품 선택</h2>
          <div style="display:flex;gap:4px;align-items:center;">
            <input type="text" id="productSearch" placeholder="상품명 검색..." style="width:120px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;" oninput="filterProducts()">
            <button class="btn btn-sm" onclick="crawlerLogin()" style="font-size:10px;padding:3px 6px;background:#f1f5f9;border:1px solid #e2e8f0;color:#64748b;" title="론앤마스터 연동">연동</button>
            <button class="btn btn-sm" onclick="collectFidxMap()" style="font-size:10px;padding:3px 6px;background:#f1f5f9;border:1px solid #e2e8f0;color:#64748b;" title="상품 fidx 자동 수집">매핑</button>
          </div>
        </div>
        <div class="panel-body" style="padding:8px;">
          <div class="product-filters" id="productFilters">
            ${productFilters.map(f => `<label class="product-filter-tag"><input type="checkbox" value="${f}" onchange="filterProducts()"> ${f}</label>`).join('')}
          </div>
          <div id="recommendedProducts"></div>
          <div id="productList">
            ${renderProductList()}
          </div>
        </div>
      </div>
    </div><!-- /loan-register-right -->
    </div><!-- /loan-register-layout -->
  `;
}

// 접수 등록 (론앤마스터 자동 입력)
async function submitLoanRegister() {
  // 선택된 상품 확인
  const selectedProduct = document.querySelector('.product-item.selected');
  if (!selectedProduct) {
    alert('상품을 선택해주세요.');
    return;
  }
  const productName = selectedProduct.querySelector('.product-name')?.textContent || '';
  const fidx = selectedProduct.getAttribute('data-fidx') || '';

  // 론앤마스터 연동 확인
  if (!crawlerLoggedIn) {
    alert('론앤마스터 연동이 필요합니다. 헤더의 연동 버튼을 클릭하세요.');
    return;
  }

  // 폼에서 데이터 수집
  const tables = document.querySelectorAll('.form-table');
  const getVal = (tableIdx, rowIdx, cellIdx) => {
    try {
      const row = tables[tableIdx]?.querySelectorAll('tr')[rowIdx];
      const cells = row?.querySelectorAll('td');
      const cell = cells?.[cellIdx] || cells?.[0];
      const input = cell?.querySelector('input, select, textarea');
      if (input?.tagName === 'SELECT') return input.options[input.selectedIndex]?.text || '';
      return input?.value || '';
    } catch { return ''; }
  };

  // 고객 정보 테이블 (index 1)
  const custTable = tables[1];
  const custRows = custTable?.querySelectorAll('tr') || [];
  const getInputsInRow = (row) => row?.querySelectorAll('input, select, textarea') || [];

  // Row 0: 이름, 생년월일, 성별
  const r0 = getInputsInRow(custRows[0]);
  const name = r0[0]?.value || '';
  const birth = r0[1]?.value || '';
  const genderSel = r0[2];
  const gender = genderSel?.tagName === 'SELECT' ? genderSel.options[genderSel.selectedIndex]?.text : '';

  // Row 1: 통신사, 전화번호
  const r1 = getInputsInRow(custRows[1]);
  const carrier = r1[0]?.tagName === 'SELECT' ? r1[0].options[r1[0].selectedIndex]?.text : '';
  const phone1 = r1[1]?.value || '';
  const phone2 = r1[2]?.value || '';
  const phone3 = r1[3]?.value || '';

  // Row 2: 대출요청액, DB출처
  const r2 = getInputsInRow(custRows[2]);
  const loanAmount = r2[0]?.value || '';
  const dbSourceSel = r2[1];
  const dbSource = dbSourceSel?.tagName === 'SELECT' ? dbSourceSel.options[dbSourceSel.selectedIndex]?.text : '';

  // Row 3: 실거주지 주소
  const zipcode = document.getElementById('lr-addr-zone')?.value || '';
  const address = document.getElementById('lr-addr-road')?.value || '';
  const addressDetail = document.getElementById('lr-addr-detail')?.value || '';

  // Row 4: 주거종류, 주택소유구분
  const r4 = getInputsInRow(custRows[4]);
  const housingType = r4[0]?.tagName === 'SELECT' ? r4[0].options[r4[0].selectedIndex]?.text : '';
  const housingOwnership = r4[1]?.tagName === 'SELECT' ? r4[1].options[r4[1].selectedIndex]?.text : '';

  // 직장 정보 테이블 (index 2)
  const jobTable = tables[2];
  const jobRows = jobTable?.querySelectorAll('tr') || [];
  const j0 = getInputsInRow(jobRows[0]);
  const jobType = j0[0]?.tagName === 'SELECT' ? j0[0].options[j0[0].selectedIndex]?.text : '';
  const j1 = getInputsInRow(jobRows[1]);
  const company = j1[0]?.value || '';
  const joinDate = j1[1]?.value || '';
  const j2 = getInputsInRow(jobRows[2]);
  const insurance4 = j2[0]?.tagName === 'SELECT' ? j2[0].options[j2[0].selectedIndex]?.text : '';
  const bizNo1 = j2[1]?.value || '';
  const bizNo2 = j2[2]?.value || '';
  const bizNo3 = j2[3]?.value || '';
  const j3 = getInputsInRow(jobRows[3]);
  const salary = j3[0]?.value || '';
  const monthlySalary = j3[1]?.value || '';
  const healthInsurance = j3[2]?.value || '';
  const workZipcode = document.getElementById('lr-waddr-zone')?.value || '';
  const workAddress = document.getElementById('lr-waddr-road')?.value || '';
  const workAddressDetail = document.getElementById('lr-waddr-detail')?.value || '';

  // 차량 정보 테이블 (index 3)
  const carTable = tables[3];
  const carRows = carTable?.querySelectorAll('tr') || [];
  const c0 = getInputsInRow(carRows[0]);
  const vehicleNo = c0[0]?.value || '';
  const vehicleName = c0[1]?.value || '';
  const c1 = getInputsInRow(carRows[1]);
  const vehicleYear = c1[0]?.tagName === 'SELECT' ? c1[0].options[c1[0].selectedIndex]?.text : '';
  const vehicleKm = c1[1]?.value || '';
  const c2 = getInputsInRow(carRows[2]);
  const vehicleOwnership = c2[0]?.tagName === 'SELECT' ? c2[0].options[c2[0].selectedIndex]?.text : '';
  const vehicleCoOwner = c2[1]?.value || '';

  // 회파복 테이블 (index 4)
  const recTable = tables[4];
  const recRows = recTable?.querySelectorAll('tr') || [];
  const rc0 = getInputsInRow(recRows[0]);
  const recoveryType = rc0[0]?.tagName === 'SELECT' ? rc0[0].options[rc0[0].selectedIndex]?.text : '';
  const rc1 = getInputsInRow(recRows[1]);
  const courtName = rc1[0]?.value || '';
  const caseNo = (rc1[1]?.value || '') + (rc1[2]?.tagName === 'SELECT' ? rc1[2].options[rc1[2].selectedIndex]?.text : '') + (rc1[3]?.value || '');
  const rc2 = getInputsInRow(recRows[2]);
  const refundBank = rc2[0]?.tagName === 'SELECT' ? rc2[0].options[rc2[0].selectedIndex]?.text : '';
  const refundAccount = rc2[1]?.value || '';
  const rc3 = getInputsInRow(recRows[3]);
  const monthlyPayment = rc3[0]?.value?.replace(/,/g, '') || '';

  // 기타사항 테이블 (index 5)
  const memoTable = tables[5];
  const memo = memoTable?.querySelector('textarea')?.value || '';

  const formData = {
    fidx, productName, name, birth, gender, carrier,
    phone1, phone2, phone3, loanAmount,
    jobType, company, joinDate, insurance4,
    bizNo1, bizNo2, bizNo3,
    salary, monthlySalary, healthInsurance,
    zipcode, address, addressDetail,
    housingType, housingOwnership,
    vehicleNo, vehicleName, vehicleYear, vehicleKm, vehicleOwnership, vehicleCoOwner,
    recoveryType, courtName, caseNo, refundBank, refundAccount, monthlyPayment,
    workZipcode, workAddress, workAddressDetail,
    memo, dbSource
  };

  if (!confirm(`[${productName}] 상품으로 접수를 진행합니다.\n\n고객명: ${name}\n대출요청액: ${loanAmount}만원\n\n론앤마스터에 폼을 자동 입력합니다. (제출은 별도 확인 필요)\n\n진행하시겠습니까?`)) {
    return;
  }

  try {
    const res = await fetch('/api/crawler/submit-loan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData })
    });
    const data = await res.json();
    if (data.success) {
      const result = data.data;
      const sr = result.submitResponse;

      if (result.submitResult?.clicked) {
        // 제출까지 완료
        let msg = `론앤마스터 접수 완료!\n\n`;
        msg += `입력 필드: ${result.filledCount}개\n`;
        msg += `미매칭 필드: ${(result.notFoundFields||[]).length}개\n`;
        msg += `제출 버튼: ${result.submitResult.buttonText}\n`;
        if (sr?.alertMessage) msg += `\n응답: ${sr.alertMessage}`;
        if (sr?.isSuccess) msg += `\n✓ 접수 성공`;
        if (sr?.isError) msg += `\n✗ 접수 오류 발생`;
        msg += `\n\n미매칭: ${(result.notFoundFields||[]).join(', ') || '없음'}`;
        alert(msg);
      } else {
        alert(`폼 입력은 완료했으나 제출 버튼을 찾지 못했습니다.\n미매칭: ${(result.notFoundFields||[]).join(', ')}`);
      }

      // 고객 상태를 '접수'로 변경
      if (loanRegisterCustomerId && result.submitResult?.clicked) {
        await fetch(`/api/customers/${loanRegisterCustomerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...loanRegisterCustomerDB, status: '접수' })
        });
      }
    } else {
      alert('접수 실패: ' + (data.message || '알 수 없는 오류'));
    }
  } catch (e) {
    alert('서버 연결 실패: ' + e.message);
  }
}

// 론앤마스터 폼 입력 결과 스크린샷 모달
function showLoanScreenshot(result) {
  const existing = document.getElementById('loanScreenshotModal');
  if (existing) existing.remove();

  const filledList = (result.filledFields || []).map(f => `<span style="background:#dcfce7;padding:1px 6px;border-radius:3px;font-size:10px;color:#166534;">${f.field}</span>`).join(' ');
  const notFoundList = (result.notFoundFields || []).map(f => `<span style="background:#fef2f2;padding:1px 6px;border-radius:3px;font-size:10px;color:#991b1b;">${f}</span>`).join(' ');

  const modal = document.createElement('div');
  modal.id = 'loanScreenshotModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:8px;max-width:900px;width:95%;max-height:90vh;display:flex;flex-direction:column;">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong style="font-size:14px;">론앤마스터 폼 입력 결과</strong>
          <span style="font-size:11px;color:#64748b;margin-left:8px;">입력: ${result.filledCount}개 | 미매칭: ${(result.notFoundFields||[]).length}개</span>
        </div>
        <button onclick="document.getElementById('loanScreenshotModal').remove()" style="border:none;background:none;font-size:18px;cursor:pointer;color:#64748b;">&times;</button>
      </div>
      <div style="padding:8px 16px;border-bottom:1px solid #f1f5f9;">
        <div style="margin-bottom:4px;font-size:11px;color:#166534;font-weight:600;">입력 완료 필드:</div>
        <div style="line-height:1.8;">${filledList || '<span style="font-size:11px;color:#94a3b8;">없음</span>'}</div>
        ${notFoundList ? `<div style="margin-top:6px;font-size:11px;color:#991b1b;font-weight:600;">미매칭 필드:</div><div style="line-height:1.8;">${notFoundList}</div>` : ''}
      </div>
      <div style="flex:1;overflow:auto;padding:12px;text-align:center;">
        ${result.screenshot ? `<img src="data:image/png;base64,${result.screenshot}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:4px;">` : '<div style="padding:40px;color:#94a3b8;">스크린샷을 불러올 수 없습니다.</div>'}
      </div>
      <div style="padding:12px 16px;border-top:1px solid #e2e8f0;text-align:right;">
        <span style="font-size:11px;color:#ef4444;margin-right:12px;">※ 론앤마스터에서 내용 확인 후 직접 제출해주세요</span>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('loanScreenshotModal').remove()">닫기</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ========================================
// 5. 상담 이력
// ========================================
function renderConsultation() {
  return `
    <div class="filter-bar">
      <input type="text" placeholder="고객명 검색">
      <select><option>전체 채널</option><option>전화</option><option>방문</option><option>카카오톡</option><option>문자</option></select>
      <input type="date" value="2026-03-01"> ~ <input type="date" value="2026-03-26">
      <button class="btn btn-primary">검색</button>
      <button class="btn btn-primary" style="margin-left:auto">+ 상담 기록</button>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>상담 이력</h2></div>
      <div class="panel-body">
        <table>
          <thead>
            <tr><th>상담일시</th><th>고객명</th><th>채널</th><th>상담내용</th><th>다음 액션</th><th>담당자</th></tr>
          </thead>
          <tbody>
            <tr><td>03-26 10:30</td><td>박지영</td><td>전화</td><td>대출 조건 문의, 금리 비교 안내</td><td>03-28 서류 제출 확인</td><td>김대리</td></tr>
            <tr><td>03-25 14:00</td><td>이승호</td><td>방문</td><td>소득 증빙 서류 접수, 심사 진행 안내</td><td>03-27 심사 결과 안내</td><td>이과장</td></tr>
            <tr><td>03-25 11:20</td><td>최민수</td><td>카카오톡</td><td>승인 조건 안내, 실행 일정 협의</td><td>03-26 실행 처리</td><td>김대리</td></tr>
            <tr><td>03-24 16:45</td><td>강서연</td><td>전화</td><td>초기 상담, 대출 가능 여부 문의</td><td>03-26 추가 상담 예정</td><td>김대리</td></tr>
            <tr><td>03-24 09:30</td><td>한동욱</td><td>방문</td><td>부결 사유 설명, 대안 상품 안내</td><td>-</td><td>이과장</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ========================================
// 6. 매출/수당 정산
// ========================================
let settlementTab = 'sales';
let settlementPolicyData = [];
let settlementRebateData = [];

function renderSettlement() {
  return `
    <div class="tabs">
      <div class="tab ${settlementTab==='sales'?'active':''}" onclick="settlementTab='sales';navigate('settlement')">매출 집계</div>
      <div class="tab ${settlementTab==='rebate'?'active':''}" onclick="settlementTab='rebate';navigate('settlement')">리베이트/환수</div>
      <div class="tab ${settlementTab==='policy'?'active':''}" onclick="settlementTab='policy';navigate('settlement')">정산 정책</div>
      <div class="tab ${settlementTab==='close'?'active':''}" onclick="settlementTab='close';navigate('settlement')">월 마감</div>
    </div>
    ${settlementTab==='sales' ? renderSettlementSales() :
      settlementTab==='rebate' ? renderSettlementRebate() :
      settlementTab==='policy' ? renderSettlementPolicy() :
      renderSettlementClose()}
  `;
}

let salesSummary = null;
let salesExecutions = [];

function renderSettlementSales() {
  if (!salesSummary) loadSalesSummary();

  const s = salesSummary || {};
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const execRows = salesExecutions.length > 0 ? salesExecutions.map(e => {
    const date = e.executed_date ? new Date(e.executed_date).toISOString().split('T')[0] : '-';
    return `<tr>
      <td>${date}</td><td>${e.customer_name||'-'}</td><td>${e.product_name||'-'}</td>
      <td>${e.loan_amount||0}만</td><td>${e.fee_rate_under||0}%/${e.fee_rate_over||0}%</td>
      <td>${e.fee_amount||0}만</td><td>${e.db_source||'-'}</td><td>${e.assigned_to||'-'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">실행 건이 없습니다. 실행 건을 등록하세요.</td></tr>';

  return `
    <div class="filter-bar">
      <select id="salesMonth">${months.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
      <select id="salesSource"><option>전체 출처</option><option>네이버 광고</option><option>카카오 DB</option><option>자체 DB</option><option>소개/추천</option><option>홈페이지</option></select>
      <button class="btn btn-primary" onclick="loadSalesSummary()">조회</button>
      ${isAdmin() ? '<button class="btn btn-outline" style="margin-left:auto;" onclick="showAddExecution()">+ 실행 건 등록</button>' : ''}
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="label">총 매출 (대출금액)</div><div class="value">${(s.totalSales||0).toLocaleString()}만</div></div>
      <div class="stat-card"><div class="label">총 수수료</div><div class="value">${Number(s.totalFee||0).toFixed(1)}만</div></div>
      <div class="stat-card"><div class="label">리베이트</div><div class="value" style="color:#16a34a;">${Number(s.rebateTotal||0).toFixed(1)}만</div></div>
      <div class="stat-card"><div class="label">환수</div><div class="value" style="color:#ef4444;">${Number(s.clawbackTotal||0).toFixed(1)}만</div></div>
      <div class="stat-card"><div class="label">실행 건수</div><div class="value">${s.execCount||0}건</div></div>
    </div>

    ${(s.byAssigned && s.byAssigned.length > 0) ? `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h2>출처별 매출</h2></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>출처</th><th>건수</th><th>매출</th><th>수수료</th></tr></thead>
            <tbody>${(s.bySource||[]).map(r => `<tr><td>${r.db_source||'-'}</td><td>${r.cnt}</td><td>${Number(r.total_amount).toLocaleString()}만</td><td>${Number(r.total_fee).toFixed(1)}만</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>담당자별 매출</h2></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>담당자</th><th>건수</th><th>매출</th><th>수수료</th></tr></thead>
            <tbody>${(s.byAssigned||[]).map(r => `<tr><td>${r.assigned_to||'-'}</td><td>${r.cnt}</td><td>${Number(r.total_amount).toLocaleString()}만</td><td>${Number(r.total_fee).toFixed(1)}만</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-header">
        <h2>실행 건별 매출 내역 (${salesExecutions.length}건)</h2>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>실행일</th><th>고객명</th><th>상품명</th><th>대출금액</th><th>수수료율</th><th>수수료</th><th>DB출처</th><th>담당자</th></tr></thead>
          <tbody>${execRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadSalesSummary() {
  try {
    const month = document.getElementById('salesMonth')?.value || '';
    const source = document.getElementById('salesSource')?.value || '';

    const [sumRes, execRes] = await Promise.all([
      fetch(`/api/settlement/summary${month ? '?month='+month : ''}`),
      fetch(`/api/settlement/executions?${month ? 'month='+month+'&' : ''}${source && source !== '전체 출처' ? 'dbSource='+encodeURIComponent(source) : ''}`)
    ]);
    const sumData = await sumRes.json();
    const execData = await execRes.json();

    if (sumData.success) salesSummary = sumData.data;
    if (execData.success) salesExecutions = execData.data;

    if (document.getElementById('salesMonth')) navigate('settlement');
  } catch (e) { console.error(e); }
}

function showAddExecution() {
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
  const old = document.getElementById('guideModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'guideModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="search-modal" style="max-width:500px;">
      <div class="modal-header">
        <h2 style="font-size:15px;font-weight:700;">실행 건 등록</h2>
        <button class="modal-close" onclick="closeGuideModal()">&times;</button>
      </div>
      <div style="padding:16px;">
        <div class="form-row">
          <div class="form-group"><label>고객명 *</label><input type="text" id="exec-name" placeholder="고객명"></div>
          <div class="form-group"><label>실행일 *</label><input type="date" id="exec-date" value="${new Date().toISOString().split('T')[0]}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>상품명</label><input type="text" id="exec-product" placeholder="SBI저축은행"></div>
          <div class="form-group"><label>대출금액 (만원) *</label><input type="text" id="exec-amount" placeholder="1000"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>수수료율(500↓) %</label><input type="text" id="exec-rate-under" placeholder="2.60"></div>
          <div class="form-group"><label>수수료율(500↑) %</label><input type="text" id="exec-rate-over" placeholder="1.85"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>DB출처</label><select id="exec-source"><option>선택</option><option>네이버 광고</option><option>카카오 DB</option><option>자체 DB</option><option>소개/추천</option><option>홈페이지</option></select></div>
          <div class="form-group"><label>담당자</label><input type="text" id="exec-assigned" value="${user.name||''}" readonly style="background:#f1f5f9;"></div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="submitExecution()">등록</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  addModalClose(modal, closeGuideModal);
}

async function submitExecution() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const amount = parseInt(v('exec-amount')) || 0;
  const rateUnder = parseFloat(v('exec-rate-under')) || 0;
  const rateOver = parseFloat(v('exec-rate-over')) || 0;

  // 수수료 자동 계산
  let fee = 0;
  if (rateUnder === 0 && rateOver > 0) {
    fee = amount * (rateOver / 100);
  } else if (amount <= 500) {
    fee = amount * (rateUnder / 100);
  } else {
    fee = 500 * (rateUnder / 100) + (amount - 500) * (rateOver / 100);
  }
  fee = Math.round(fee * 10) / 10;

  if (!v('exec-name') || !v('exec-date') || !amount) {
    alert('고객명, 실행일, 대출금액은 필수입니다.');
    return;
  }

  try {
    const res = await fetch('/api/settlement/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: v('exec-name'), executedDate: v('exec-date'),
        loanAmount: amount, productName: v('exec-product'),
        feeRateUnder: rateUnder, feeRateOver: rateOver, feeAmount: fee,
        dbSource: v('exec-source'), assignedTo: v('exec-assigned')
      })
    });
    const result = await res.json();
    if (result.success) {
      closeGuideModal();
      salesSummary = null;
      salesExecutions = [];
      navigate('settlement');
      setTimeout(() => loadSalesSummary(), 100);
      alert('실행 건 등록 완료 (수수료: ' + fee + '만원)');
    } else {
      alert('실패: ' + result.message);
    }
  } catch (e) { alert('오류: ' + e.message); }
}

function renderSettlementRebate() {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const curMonth = months[0];

  return `
    <div class="panel">
      <div class="panel-header">
        <h2>리베이트/환수 엑셀 업로드</h2>
      </div>
      <div class="panel-body" style="padding:16px;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;">적용월:</label>
          <select id="rebateMonth" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;">
            ${months.map(m => `<option value="${m}" ${m===curMonth?'selected':''}>${m}</option>`).join('')}
          </select>
          ${isAdmin() ? '<input type="file" id="rebateFile" accept=".xlsx,.xls,.csv" multiple onchange="parseRebateExcel(this)">' : '<span style="font-size:12px;color:#94a3b8;">관리자만 업로드 가능합니다.</span>'}
          <span style="font-size:11px;color:#94a3b8;">적용월 선택 후 업로드</span>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>리베이트/환수 내역 (${settlementRebateData.length}건)</h2>
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="rebateViewMonth" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;" onchange="loadRebateByMonth()">
            <option value="">전체</option>
            ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm" onclick="loadRebateByMonth()">조회</button>
        </div>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>구분</th><th>금액</th><th>사유</th><th>적용월</th><th>관련 실행건</th><th>담당자</th></tr></thead>
          <tbody id="rebateTableBody">
            ${settlementRebateData.length > 0 ?
              settlementRebateData.map(r => `<tr>
                <td><span class="badge ${r.type==='리베이트'?'badge-approved':'badge-rejected'}">${r.type}</span></td>
                <td style="font-weight:600;">${r.amount}만</td>
                <td>${r.reason||''}</td>
                <td>${r.month||''}</td>
                <td>${r.relatedId||''}</td>
                <td>${r.manager||''}</td>
              </tr>`).join('') :
              '<tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8;">엑셀 파일을 업로드하면 내역이 표시됩니다.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSettlementPolicy() {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  return `
    <div class="panel">
      <div class="panel-header">
        <h2>정산 정책 엑셀 업로드</h2>
      </div>
      <div class="panel-body" style="padding:16px;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;">적용월:</label>
          <select id="policyMonth" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;">
            ${months.map(m => `<option value="${m}" ${m===curMonth?'selected':''}>${m}</option>`).join('')}
          </select>
          ${isAdmin() ? '<input type="file" id="policyFile" accept=".xlsx,.xls,.csv" multiple onchange="parsePolicyExcel(this)">' : '<span style="font-size:12px;color:#94a3b8;">관리자만 업로드 가능합니다.</span>'}
          <span style="font-size:11px;color:#94a3b8;">적용월을 선택 후 엑셀 업로드</span>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>정산 정책 (${settlementPolicyData.length}건)</h2>
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="policyViewMonth" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;" onchange="loadPolicyByMonth()">
            <option value="">전체</option>
            ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm" onclick="loadPolicyByMonth()">조회</button>
        </div>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>상품구분</th><th>금융사</th><th>지급수당(500만이하)</th><th>지급수당(500만초과)</th><th>인증</th></tr></thead>
          <tbody id="policyTableBody">
            ${settlementPolicyData.length > 0 ?
              settlementPolicyData.map(p => `<tr>
                <td>${p.category||''}</td>
                <td style="font-weight:600;">${p.product||''}</td>
                <td>${p.rateUnder||''}</td>
                <td>${p.rateOver||''}</td>
                <td>${p.auth||''}</td>
              </tr>`).join('') :
              '<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">엑셀 파일을 업로드하면 정책이 표시됩니다.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// DB 저장/로드 함수
async function savePolicyToDB(data) {
  try {
    const month = document.getElementById('policyMonth')?.value || new Date().toISOString().substring(0,7);
    const res = await fetch('/api/settlement/policies/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policies: data, month })
    });
    const result = await res.json();
    if (!result.success) alert(result.message);
  } catch (e) { console.error('정산 정책 저장 실패:', e); }
}

async function saveAdjustmentsToDB(data) {
  try {
    const month = document.getElementById('rebateMonth')?.value || new Date().toISOString().substring(0,7);
    const res = await fetch('/api/settlement/adjustments/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustments: data, month })
    });
    const result = await res.json();
    if (!result.success) alert(result.message);
  } catch (e) { console.error('리베이트/환수 저장 실패:', e); }
}

async function loadRebateByMonth() {
  const month = document.getElementById('rebateViewMonth')?.value || '';
  try {
    const res = await fetch(`/api/settlement/adjustments${month ? '?month='+month : ''}`);
    const data = await res.json();
    if (data.success) {
      settlementRebateData = data.data.map(r => ({
        type: r.type, amount: r.amount,
        reason: r.reason, month: r.target_month, manager: r.manager
      }));
      navigate('settlement');
    }
  } catch (e) { console.error(e); }
}

async function loadPolicyByMonth() {
  const month = document.getElementById('policyViewMonth')?.value || '';
  try {
    const res = await fetch(`/api/settlement/policies${month ? '?month='+month : ''}`);
    const data = await res.json();
    if (data.success) {
      settlementPolicyData = data.data.map(r => ({
        category: r.category, product: r.product,
        rateUnder: r.rate_under, rateOver: r.rate_over, auth: r.auth
      }));
      navigate('settlement');
    }
  } catch (e) { console.error(e); }
}

async function loadSettlementFromDB() {
  try {
    const [pRes, aRes] = await Promise.all([
      fetch('/api/settlement/policies'),
      fetch('/api/settlement/adjustments')
    ]);
    const pData = await pRes.json();
    const aData = await aRes.json();
    if (pData.success && pData.data.length > 0) {
      settlementPolicyData = pData.data.map(r => ({
        category: r.category, product: r.product,
        rateUnder: r.rate_under, rateOver: r.rate_over, auth: r.auth
      }));
    }
    if (aData.success && aData.data.length > 0) {
      settlementRebateData = aData.data.map(r => ({
        type: r.type, amount: r.amount,
        reason: r.reason, month: r.target_month, manager: r.manager
      }));
    }
  } catch (e) { console.error('정산 데이터 로드 실패:', e); }
}

// 페이지 로드 시 DB에서 정산 데이터 불러오기
setTimeout(() => loadSettlementFromDB(), 300);

let closeData = [];

function renderSettlementClose() {
  if (closeData.length === 0) loadMonthlyCloses();

  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const closeRows = closeData.length > 0 ? closeData.map(c => {
    const closedAt = c.closed_at ? new Date(c.closed_at).toLocaleString('ko-KR') : '-';
    return `<tr>
      <td>${c.target_month}</td>
      <td>${closedAt}</td>
      <td>${c.closed_by||'-'}</td>
      <td>${c.execution_count||0}건</td>
      <td>${(c.total_sales||0).toLocaleString()}만</td>
      <td>${c.is_closed ? '<span class="badge badge-approved">마감완료</span>' : '<span class="badge badge-consult">미마감</span>'}</td>
      <td>${isAdmin() && c.is_closed ? `<button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:#ef4444;" onclick="reopenMonth('${c.target_month}')">해제</button>` : ''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">마감 이력이 없습니다.</td></tr>';

  return `
    ${!isAdmin() ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;margin-bottom:12px;font-size:12px;color:#991b1b;">월 마감 처리는 관리자만 가능합니다.</div>' : ''}
    <div class="panel">
      <div class="panel-header"><h2>월 마감 처리</h2></div>
      <div class="panel-body" style="padding:16px;">
        ${isAdmin() ? `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;">마감 대상월:</label>
          <select id="closeMonth" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;">
            ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="processMonthlyClose()">마감 처리</button>
        </div>` : ''}
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;margin-bottom:16px;">
          <div style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:4px;">마감 전 확인사항</div>
          <ul style="font-size:11px;color:#92400e;margin-left:16px;line-height:1.8;">
            <li>모든 실행 건의 수수료율이 정확한지 확인</li>
            <li>리베이트/환수 내역이 모두 반영되었는지 확인</li>
            <li>정산 정책(수수료율)이 최신인지 확인</li>
            <li>마감 후에는 정산 정책/리베이트/환수 수정 불가</li>
          </ul>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>마감 이력</h2></div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>대상월</th><th>마감일시</th><th>마감자</th><th>실행건수</th><th>총매출</th><th>상태</th><th>관리</th></tr></thead>
          <tbody>${closeRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadMonthlyCloses() {
  try {
    const res = await fetch('/api/settlement/monthly-closes');
    const data = await res.json();
    if (data.success) {
      closeData = data.data;
      if (document.getElementById('closeMonth') || closeData.length > 0) navigate('settlement');
    }
  } catch (e) { console.error(e); }
}

async function processMonthlyClose() {
  const month = document.getElementById('closeMonth')?.value;
  if (!month) return;
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');

  if (!confirm(`${month} 정산을 마감하시겠습니까?\n\n마감 후 해당 월의 정산 정책/리베이트/환수를 수정할 수 없습니다.`)) return;

  try {
    const res = await fetch('/api/settlement/close-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, closedBy: user.name })
    });
    const result = await res.json();
    if (result.success) {
      closeData = [];
      navigate('settlement');
      setTimeout(() => loadMonthlyCloses(), 100);
      alert(`${month} 마감 완료`);
    } else {
      alert('실패: ' + result.message);
    }
  } catch (e) { alert('오류: ' + e.message); }
}

async function reopenMonth(month) {
  const reason = prompt('마감 해제 사유:');
  if (reason === null) return;
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');

  try {
    const res = await fetch('/api/settlement/reopen-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, reopenedBy: user.name, reason })
    });
    const result = await res.json();
    if (result.success) {
      closeData = [];
      navigate('settlement');
      setTimeout(() => loadMonthlyCloses(), 100);
      alert(`${month} 마감 해제 완료`);
    } else {
      alert('실패: ' + result.message);
    }
  } catch (e) { alert('오류: ' + e.message); }
}

// 엑셀 파일 파싱 (CSV 방식)
// CSV 파일 읽기 (한글 인코딩 자동 감지)
// 파일 읽기 (엑셀 + CSV 모두 지원)
function readSpreadsheetFile(file, callback) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    // 엑셀 파일 → SheetJS로 파싱
    const reader = new FileReader();
    reader.onload = function(e) {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      // 모든 시트를 합산
      let allLines = [];
      wb.SheetNames.forEach(name => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        const lines = csv.split('\n').filter(l => l.trim());
        if (allLines.length === 0) {
          allLines = lines;
        } else {
          allLines = allLines.concat(lines.slice(1)); // 헤더 제외
        }
      });
      callback(allLines.join('\n'));
    };
    reader.readAsArrayBuffer(file);
  } else {
    // CSV 파일 → 인코딩 자동 감지
    const reader = new FileReader();
    reader.onload = function(e) {
      let text = e.target.result;
      if (text.includes('�') || text.includes('ï¿½')) {
        const reader2 = new FileReader();
        reader2.onload = function(e2) { callback(e2.target.result); };
        reader2.readAsText(file, 'EUC-KR');
      } else {
        callback(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }
}

function parseRebateExcel(input) {
  const files = input.files;
  if (!files.length) return;

  let allData = [];
  let processed = 0;

  for (const file of files) {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      alert('엑셀(.xlsx) 또는 CSV 파일만 지원합니다.');
      continue;
    }
    readSpreadsheetFile(file, function(text) {
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length >= 2) {
        lines.slice(1).forEach(line => {
          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          allData.push({
            type: cols[0] || '리베이트',
            amount: cols[1] || '0',
            reason: cols[2] || '',
            month: cols[3] || '',
            relatedId: cols[4] || '',
            manager: cols[5] || ''
          });
        });
      }
      processed++;
      if (processed === files.length) {
        settlementRebateData = allData;
        saveAdjustmentsToDB(allData);
        navigate('settlement');
        alert(`${allData.length}건 로드 및 저장 완료 (${files.length}개 파일)`);
      }
    });
  }
}

function parsePolicyExcel(input) {
  const files = input.files;
  if (!files.length) return;

  let allData = [];
  let processed = 0;

  for (const file of files) {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      alert('엑셀(.xlsx) 또는 CSV 파일만 지원합니다.');
      continue;
    }
    readSpreadsheetFile(file, function(text) {
      const lines = text.split('\n').filter(l => l.trim());
      let currentCategory = '';
      lines.forEach(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const col0 = (cols[0] || '').replace(/%$/,'');
        const col1 = (cols[1] || '').replace(/%$/,'');
        const col2 = cols[2] || '';
        const col3 = cols[3] || '';
        const col4 = cols[4] || '';

        // 헤더/설명 행 스킵
        if (['금융사별 수수료','소비자 금융사별 수수료','수수료 색상','금융사','상품구분'].some(k => col0.includes(k) || col1.includes(k))) return;

        // 상품구분이 있으면 카테고리 업데이트
        if (col0 && col0.length > 1 && col0 !== '%') {
          // 카테고리만 있는 행 (금융사 컬럼이 비어있거나 '금융사'인 경우)
          if (!col1 || col1 === '금융사' || col1 === '지급수당') {
            currentCategory = col0;
            return;
          }
          // 상품구분 + 금융사 같이 있는 행
          currentCategory = col0;
        }

        // 금융사명 결정 (col0에 있거나 col1에 있음)
        let product = '';
        let rateUnder = '';
        let rateOver = '';
        let auth = '';

        if (col0 && !['%',''].includes(col0) && col0.length > 1 && (col2 || col3)) {
          // 상품구분 없이 col0=금융사, col1=수수료1, col2=수수료2, col3=인증
          product = col0;
          rateUnder = col1;
          rateOver = col2;
          auth = col3;
        } else if (col1 && col1.length > 1 && col1 !== '지급수당' && (col2 || col3)) {
          // col0=상품구분(or빈칸), col1=금융사, col2=수수료1, col3=수수료2, col4=인증
          product = col1;
          rateUnder = col2;
          rateOver = col3;
          auth = col4;
        }

        if (!product || product === '%') return;

        allData.push({
          category: currentCategory,
          product: product,
          rateUnder: rateUnder,
          rateOver: rateOver,
          auth: auth
        });
      });
      processed++;
      if (processed === files.length) {
        settlementPolicyData = allData;
        // MySQL에 저장
        savePolicyToDB(allData);
        navigate('settlement');
        alert(`${allData.length}건 로드 및 저장 완료 (${files.length}개 파일)`);
      }
    });
  }
}

// ========================================
// 7. 성과 분석
// ========================================
let performanceData = null;

function renderPerformance() {
  if (!performanceData) loadPerformance();

  const p = performanceData || {};
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const sourceRows = (p.bySource || []).map(s => {
    const convRate = s.intake_count > 0 ? ((s.exec_count / s.intake_count) * 100).toFixed(1) : '0';
    return `<tr>
      <td>${s.db_source||'-'}</td>
      <td>${s.intake_count}</td>
      <td>${s.exec_count}</td>
      <td>${convRate}%</td>
      <td>${Number(s.total_amount).toLocaleString()}만</td>
      <td>${Number(s.total_fee).toFixed(1)}만</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">데이터 없음</td></tr>';

  const assignedRows = (p.byAssigned || []).map(s => {
    const execRate = s.customer_count > 0 ? ((s.exec_count / s.customer_count) * 100).toFixed(1) : '0';
    return `<tr>
      <td>${s.assigned_to||'-'}</td>
      <td>${s.customer_count}</td>
      <td>${s.exec_count}</td>
      <td>${execRate}%</td>
      <td>${Number(s.total_amount).toLocaleString()}만</td>
      <td>${Number(s.total_fee).toFixed(1)}만</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">데이터 없음</td></tr>';

  const te = p.totalExec || {};

  return `
    <div class="filter-bar">
      <select id="perfMonth">
        <option value="">전체</option>
        ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
      </select>
      <button class="btn btn-primary" onclick="loadPerformance()">조회</button>
    </div>

    <div class="stat-cards" style="margin-bottom:12px;">
      <div class="stat-card"><div class="label">전체 고객</div><div class="value">${p.totalCust||0}명</div></div>
      <div class="stat-card"><div class="label">실행 건수</div><div class="value">${te.cnt||0}건</div></div>
      <div class="stat-card"><div class="label">총 매출</div><div class="value">${Number(te.amount||0).toLocaleString()}만</div></div>
      <div class="stat-card"><div class="label">총 수수료</div><div class="value">${Number(te.fee||0).toFixed(1)}만</div></div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h2>DB 출처별 성과</h2></div>
        <div class="panel-body" style="overflow-x:auto;">
          <table>
            <thead><tr><th>출처</th><th>유입</th><th>실행</th><th>전환율</th><th>매출</th><th>수수료</th></tr></thead>
            <tbody>${sourceRows}</tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>담당자별 성과</h2></div>
        <div class="panel-body" style="overflow-x:auto;">
          <table>
            <thead><tr><th>담당자</th><th>고객수</th><th>실행</th><th>실행률</th><th>매출</th><th>수수료</th></tr></thead>
            <tbody>${assignedRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function loadPerformance() {
  try {
    const month = document.getElementById('perfMonth')?.value || '';
    const res = await fetch(`/api/dashboard/performance${month ? '?month='+month : ''}`);
    const data = await res.json();
    if (data.success) {
      performanceData = data.data;
      if (document.getElementById('perfMonth')) navigate('performance');
    }
  } catch (e) { console.error(e); }
}

// ========================================
// 8. 데이터 내보내기
// ========================================
function renderExport() {
  return `
    <div class="panel">
      <div class="panel-header"><h2>데이터 내보내기</h2></div>
      <div class="panel-body" style="padding:20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
          <div class="stat-card" style="cursor:pointer;">
            <div class="label">고객 목록</div>
            <div style="font-size:12px;color:#64748b;margin:8px 0;">현재 필터 조건 적용</div>
            <button class="btn btn-outline btn-sm">엑셀 다운로드</button>
          </div>
          <div class="stat-card" style="cursor:pointer;">
            <div class="label">대출 신청 목록</div>
            <div style="font-size:12px;color:#64748b;margin:8px 0;">현재 필터 조건 적용</div>
            <button class="btn btn-outline btn-sm">엑셀 다운로드</button>
          </div>
          <div class="stat-card" style="cursor:pointer;">
            <div class="label">월 정산 내역</div>
            <div style="font-size:12px;color:#64748b;margin:8px 0;">직원별 수당 포함</div>
            <button class="btn btn-outline btn-sm">엑셀 다운로드</button>
          </div>
        </div>
        <div style="margin-top:16px;font-size:11px;color:#94a3b8;">* 내보내기는 관리자 권한이 필요합니다.</div>
      </div>
    </div>
  `;
}

// ========================================
// 9. 직원/권한 관리
// ========================================
let employeeList = [];

function renderEmployees() {
  // DB에서 로드 안 됐으면 로드
  if (employeeList.length === 0) {
    loadEmployees();
  }

  const rows = employeeList.map(e => {
    const roleLabel = e.role === 'admin' ? '관리자' : '영업직원';
    const roleBadge = e.role === 'admin' ? 'badge-approved' : 'badge-lead';
    const scopeLabel = e.data_scope === 'all' ? '전사' : '본인';
    const statusLabel = e.is_active ? '활성' : '비활성';
    const statusBadge = e.is_active ? 'badge-approved' : 'badge-closed';
    const joinDate = e.join_date ? new Date(e.join_date).toISOString().split('T')[0] : '-';
    return `<tr>
      <td>${e.name}</td><td>${e.login_id}</td><td>${e.department}</td><td>${e.position_title}</td>
      <td><span class="badge ${roleBadge}">${roleLabel}</span></td>
      <td>${scopeLabel}</td>
      <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      <td>${joinDate}</td>
      <td>${isAdmin() ? `
        <button class="btn btn-sm btn-outline" onclick="editEmployee(${e.id})">수정</button>
        <button class="btn btn-sm btn-outline" onclick="resetEmployeePassword(${e.id})">비밀번호</button>
        <button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:#ef4444;" onclick="deleteEmployee(${e.id},'${e.name}')">삭제</button>
      ` : '-'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="filter-bar">
      <input type="text" id="empSearch" placeholder="직원명 검색">
      <select id="empRole"><option>전체 역할</option><option>관리자</option><option>영업직원</option></select>
      <select id="empStatus"><option>전체 상태</option><option>활성</option><option>비활성</option></select>
      <button class="btn btn-primary" onclick="loadEmployees()">검색</button>
      ${isAdmin() ? '<button class="btn btn-primary" style="margin-left:auto" onclick="showAddEmployeeModal()">+ 직원 등록</button>' : ''}
    </div>
    <div class="panel">
      <div class="panel-header"><h2>직원 목록 (${employeeList.length}명)</h2></div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>이름</th><th>아이디</th><th>소속</th><th>직급</th><th>역할</th><th>데이터 범위</th><th>상태</th><th>입사일</th><th>관리</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8;">직원 데이터를 불러오는 중...</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadEmployees() {
  try {
    const search = document.getElementById('empSearch')?.value || '';
    const role = document.getElementById('empRole')?.value || '';
    const status = document.getElementById('empStatus')?.value || '';
    let url = '/api/employees?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (role && role !== '전체 역할') url += `role=${encodeURIComponent(role)}&`;
    if (status && status !== '전체 상태') url += `status=${encodeURIComponent(status)}&`;

    const res = await fetch(url);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { return; }
    if (data.success) {
      employeeList = data.data;
      const tbody = document.querySelector('#content table tbody');
      if (tbody && document.getElementById('empSearch')) {
        navigate('employees');
      }
    }
  } catch (e) { console.error(e); }
}

function showAddEmployeeModal() {
  const old = document.getElementById('guideModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'guideModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="search-modal" style="max-width:500px;">
      <div class="modal-header">
        <h2 style="font-size:15px;font-weight:700;">직원 등록</h2>
        <button class="modal-close" onclick="closeGuideModal()">&times;</button>
      </div>
      <div style="padding:16px;">
        <div class="form-group"><label>아이디 <span class="required">*</span></label><input type="text" id="newEmpLoginId" placeholder="로그인 아이디"></div>
        <div class="form-group"><label>이름 <span class="required">*</span></label><input type="text" id="newEmpName" placeholder="이름"></div>
        <div class="form-group"><label>비밀번호 <span class="required">*</span></label><input type="password" id="newEmpPw" placeholder="비밀번호"></div>
        <div class="form-row">
          <div class="form-group"><label>소속</label><input type="text" id="newEmpDept" placeholder="영업부"></div>
          <div class="form-group"><label>직급</label><input type="text" id="newEmpPos" placeholder="사원"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>역할</label><select id="newEmpRole"><option value="sales">영업직원</option><option value="admin">관리자</option></select></div>
          <div class="form-group"><label>데이터 범위</label><select id="newEmpScope"><option value="self">본인</option><option value="all">전사</option></select></div>
        </div>
        <div class="form-group"><label>입사일</label><input type="date" id="newEmpDate"></div>
        <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="addEmployee()">등록</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  addModalClose(modal, closeGuideModal);
}

async function addEmployee() {
  const data = {
    loginId: document.getElementById('newEmpLoginId').value.trim(),
    name: document.getElementById('newEmpName').value.trim(),
    password: document.getElementById('newEmpPw').value,
    department: document.getElementById('newEmpDept').value.trim(),
    position: document.getElementById('newEmpPos').value.trim(),
    role: document.getElementById('newEmpRole').value,
    dataScope: document.getElementById('newEmpScope').value,
    joinDate: document.getElementById('newEmpDate').value || null
  };

  if (!data.loginId || !data.name || !data.password) {
    alert('아이디, 이름, 비밀번호는 필수입니다.');
    return;
  }

  try {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      closeGuideModal();
      employeeList = [];
      navigate('employees');
      setTimeout(() => loadEmployees(), 100);
      alert('직원 등록 완료');
    } else {
      alert('등록 실패: ' + result.message);
    }
  } catch (e) { alert('오류: ' + e.message); }
}

async function editEmployee(id) {
  const emp = employeeList.find(e => e.id === id);
  if (!emp) return;

  const name = prompt('이름:', emp.name);
  if (name === null) return;
  const dept = prompt('소속:', emp.department);
  const pos = prompt('직급:', emp.position_title);
  const role = prompt('역할 (admin/sales):', emp.role);
  const scope = prompt('데이터 범위 (self/all):', emp.data_scope);

  try {
    const res = await fetch(`/api/employees/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, department: dept, position: pos, role, dataScope: scope, isActive: emp.is_active })
    });
    const result = await res.json();
    if (result.success) {
      employeeList = [];
      navigate('employees');
      setTimeout(() => loadEmployees(), 100);
      alert('수정 완료');
    }
  } catch (e) { alert('오류: ' + e.message); }
}

async function resetEmployeePassword(id) {
  const pw = prompt('새 비밀번호:');
  if (!pw) return;

  try {
    const res = await fetch(`/api/employees/${id}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const result = await res.json();
    if (result.success) alert('비밀번호 변경 완료');
    else alert('실패: ' + result.message);
  } catch (e) { alert('오류: ' + e.message); }
}

async function deleteEmployee(id, name) {
  if (!confirm(`"${name}" 직원을 삭제하시겠습니까?`)) return;
  try {
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      employeeList = [];
      navigate('employees');
      setTimeout(() => loadEmployees(), 100);
      alert(`${name} 직원이 삭제되었습니다.`);
    } else {
      alert('실패: ' + (result.message || ''));
    }
  } catch (e) { alert('오류: ' + e.message); }
}

// 페이지 진입 시 직원 목록 로드
setTimeout(() => { if (employeeList.length === 0) loadEmployees(); }, 500);

// ========================================
// 10. 알림
// ========================================
let notificationData = [];
let notiFilter = 'unread';

function renderNotifications() {
  if (notificationData.length === 0) loadNotifications();

  const unreadCount = notificationData.filter(n => !n.is_read).length;
  const filtered = notiFilter === 'unread' ? notificationData.filter(n => !n.is_read) : notificationData;

  const typeIcon = (t) => {
    const map = { reminder: '상담 리마인더', stagnant: '상태 정체', document: '서류 미비', system: '시스템' };
    return map[t] || '알림';
  };

  const rows = filtered.length > 0 ? filtered.map(n => {
    const date = n.created_at ? new Date(n.created_at).toLocaleString('ko-KR') : '';
    return `<div class="timeline-item" style="${n.is_read ? 'opacity:0.6;' : ''}">
      <div class="tl-date">${date}</div>
      <div class="tl-content"><strong>${n.title}</strong></div>
      <div class="tl-user">${n.content || ''}${!n.is_read ? ` <a href="#" onclick="markNotiRead(${n.id});return false;" style="color:#3b82f6;font-size:10px;">읽음</a>` : ''}</div>
    </div>`;
  }).join('') : '<div style="text-align:center;padding:30px;color:#94a3b8;">알림이 없습니다.</div>';

  return `
    <div class="tabs">
      <div class="tab ${notiFilter==='unread'?'active':''}" onclick="notiFilter='unread';navigate('notifications')">미확인 (${unreadCount})</div>
      <div class="tab ${notiFilter==='all'?'active':''}" onclick="notiFilter='all';navigate('notifications')">전체</div>
    </div>
    <div class="filter-bar">
      <button class="btn btn-outline btn-sm" onclick="markAllNotiRead()">전체 읽음</button>
      <button class="btn btn-outline btn-sm" onclick="loadNotifications()">새로고침</button>
    </div>
    <div class="panel">
      <div class="panel-body" style="padding:8px 12px;">
        <div class="timeline">${rows}</div>
      </div>
    </div>
  `;
}

let lastNotiCount = 0;

async function loadNotifications() {
  try {
    const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
    const res = await fetch(`/api/notifications?userId=${user.id || ''}`);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { return; }
    if (data.success) {
      const prevUnread = lastNotiCount;
      notificationData = data.data;
      const newUnread = notificationData.filter(n => !n.is_read).length;
      // 새 알림이 추가되면 소리 + 브라우저 알림
      if (newUnread > prevUnread && prevUnread > 0) {
        playNotiSound();
        showBrowserNotification(notificationData.find(n => !n.is_read));
      }
      lastNotiCount = newUnread;
      updateNotiBadge();
    }
  } catch (e) { console.error(e); }
}

// 알림 소리
function playNotiSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1000;
      gain2.gain.value = 0.3;
      osc2.start();
      osc2.stop(ctx.currentTime + 0.3);
    }, 250);
  } catch (e) {}
}

// 브라우저 알림
function showBrowserNotification(noti) {
  if (!noti) return;
  if (Notification.permission === 'granted') {
    new Notification('대부중개 전산', { body: noti.title, icon: '/favicon.ico' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

// 페이지 로드 시 브라우저 알림 권한 요청
if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
  Notification.requestPermission();
}

function updateNotiBadge() {
  const unread = notificationData.filter(n => !n.is_read).length;
  const badge = document.getElementById('notiBadge');
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread > 0 ? '' : 'none';
  }
  const dot = document.querySelector('.noti-dot');
  if (dot) dot.style.display = unread > 0 ? '' : 'none';
}

async function markNotiRead(id) {
  try {
    await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
    const noti = notificationData.find(n => n.id === id);
    if (noti) noti.is_read = 1;
    navigate('notifications');
    updateNotiBadge();
  } catch (e) { console.error(e); }
}

async function markAllNotiRead() {
  try {
    const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
    await fetch('/api/notifications/read-all', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    notificationData.forEach(n => n.is_read = 1);
    navigate('notifications');
    updateNotiBadge();
  } catch (e) { console.error(e); }
}

// 30초마다 알림 자동 확인
setInterval(() => loadNotifications(), 30000);
// 페이지 로드 시 알림 로드
setTimeout(() => loadNotifications(), 1000);

// ========================================
// 11. 감사로그
// ========================================
let auditData = [];

function renderAudit() {
  if (auditData.length === 0) loadAuditLogs();

  const eventLabel = (t) => {
    const map = { login:'로그인', status_change:'상태 변경', assignee_change:'담당자 변경', settlement_change:'정산 변경', close_month:'월 마감', customer_edit:'고객 수정', customer_delete:'고객 삭제', employee_manage:'직원 관리' };
    return map[t] || t;
  };
  const eventBadge = (t) => {
    const map = { login:'badge-lead', status_change:'badge-submit', assignee_change:'badge-consult', settlement_change:'badge-review', close_month:'badge-executed', customer_edit:'badge-consult', customer_delete:'badge-rejected', employee_manage:'badge-approved' };
    return map[t] || 'badge-lead';
  };

  const rows = auditData.length > 0 ? auditData.map(a => {
    const date = a.performed_at ? new Date(a.performed_at).toLocaleString('ko-KR') : '';
    return `<tr>
      <td style="white-space:nowrap;">${date}</td>
      <td><span class="badge ${eventBadge(a.event_type)}">${eventLabel(a.event_type)}</span></td>
      <td>${a.target_name || '-'}</td>
      <td>${a.before_value || '-'}</td>
      <td>${a.after_value || '-'}</td>
      <td>${a.reason || '-'}</td>
      <td>${a.performed_by || '-'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8;">감사로그가 없습니다.</td></tr>';

  return `
    <div class="filter-bar">
      <input type="date" id="auditStart" value="${new Date(Date.now()-30*86400000).toISOString().split('T')[0]}"> ~
      <input type="date" id="auditEnd" value="${new Date().toISOString().split('T')[0]}">
      <select id="auditEmployee"><option>전체 직원</option><option>박팀장</option><option>김대리</option><option>이과장</option><option>박사원</option></select>
      <select id="auditEvent"><option>전체 이벤트</option><option>로그인</option><option>상태 변경</option><option>담당자 변경</option><option>정산 변경</option><option>월 마감</option><option>고객 수정</option><option>고객 삭제</option><option>직원 관리</option></select>
      <button class="btn btn-primary" onclick="loadAuditLogs()">조회</button>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>감사로그 (${auditData.length}건)</h2></div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>일시</th><th>구분</th><th>대상</th><th>변경 전</th><th>변경 후</th><th>사유</th><th>처리자</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadAuditLogs() {
  try {
    const startDate = document.getElementById('auditStart')?.value || '';
    const endDate = document.getElementById('auditEnd')?.value || '';
    const employee = document.getElementById('auditEmployee')?.value || '';
    const eventType = document.getElementById('auditEvent')?.value || '';

    let url = '/api/audit-logs?';
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}&`;
    if (employee) url += `performedBy=${encodeURIComponent(employee)}&`;
    if (eventType) url += `eventType=${encodeURIComponent(eventType)}&`;

    const res = await fetch(url);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { return; }
    if (data.success) {
      auditData = data.data;
      if (document.getElementById('auditStart')) navigate('audit');
    }
  } catch (e) { console.error(e); }
}

// ========================================
// 고객 상세 샘플 데이터
// ========================================
const customerData = {
  312: { name:'박지영', ssn:'920315-2******', age:33, phone:'010-1234-5678', phone2:'', email:'jiyoung.park@email.com', address:'서울특별시 강남구 테헤란로 123, 4층 402호', residenceAddress:'서울특별시 강남구 테헤란로 123, 4층 402호', company:'(주)한국금융서비스', companyAddr:'서울특별시 중구 을지로 45, 7층', companyPhone:'02-1234-5678', salary:4200, employmentType:'정규직', workYears:'3년 2개월', courtName:'서울중앙지방법원', caseNo:'2026가단12345', refundBank:'국민은행', refundAccount:'123-456-789012', refundHolder:'박지영', creditScore:680, creditStatus:'회생', totalDebt:'3,200만', loanDate:'2026-03-26', loanAmount:'3,000만', existingLoans:'신한은행 2,000만 (잔여 1,200만)', dbSource:'네이버 광고', assignedTo:'김대리', status:'접수', regDate:'2026-03-26', memo:'금리 비교 후 진행 희망. 서류 준비 중.' },
  311: { name:'이승호', ssn:'880720-1******', age:37, phone:'010-9876-5432', phone2:'010-5555-0000', email:'seungho.lee@company.com', address:'경기도 성남시 분당구 판교로 256, 8층', residenceAddress:'경기도 성남시 분당구 판교로 256, 8층', company:'테크스타트(주)', companyAddr:'경기도 성남시 분당구 판교역로 152', companyPhone:'031-987-6543', salary:5800, employmentType:'정규직', workYears:'5년 8개월', courtName:'', caseNo:'', refundBank:'신한은행', refundAccount:'110-234-567890', refundHolder:'이승호', creditScore:720, creditStatus:'정상', totalDebt:'0', loanDate:'2026-03-25', loanAmount:'5,000만', existingLoans:'없음', dbSource:'카카오 DB', assignedTo:'이과장', status:'심사중', regDate:'2026-03-25', memo:'소득 증빙 제출 완료. 심사 진행 중.' },
  310: { name:'최민수', ssn:'950103-1******', age:31, phone:'010-5555-1234', phone2:'', email:'minsu.choi@gmail.com', address:'서울특별시 마포구 월드컵북로 21', residenceAddress:'서울특별시 마포구 월드컵북로 21', company:'(주)디자인웍스', companyAddr:'서울특별시 마포구 양화로 45', companyPhone:'02-3456-7890', salary:3600, employmentType:'계약직', workYears:'1년 6개월', courtName:'', caseNo:'', refundBank:'우리은행', refundAccount:'1002-345-678901', refundHolder:'최민수', creditScore:650, creditStatus:'정상', totalDebt:'500만', loanDate:'2026-03-25', loanAmount:'2,000만', existingLoans:'카카오뱅크 500만', dbSource:'자체 DB', assignedTo:'김대리', status:'승인', regDate:'2026-03-25', memo:'승인 완료. 실행 일정 협의 중.' },
  309: { name:'정하나', ssn:'000515-4******', age:25, phone:'010-3333-7890', phone2:'', email:'hana.jung@naver.com', address:'인천광역시 남동구 구월로 123', residenceAddress:'인천광역시 남동구 구월로 123', company:'CJ올리브영 인천점', companyAddr:'인천광역시 남동구 인하로 321', companyPhone:'032-111-2222', salary:2800, employmentType:'정규직', workYears:'2년 1개월', courtName:'인천지방법원', caseNo:'2025가소98765', refundBank:'하나은행', refundAccount:'267-890-123456', refundHolder:'정하나', creditScore:590, creditStatus:'회복', totalDebt:'800만', loanDate:'2026-03-24', loanAmount:'1,500만', existingLoans:'토스뱅크 300만', dbSource:'소개/추천', assignedTo:'박사원', status:'실행', regDate:'2026-03-24', memo:'대출 실행 완료.' },
  308: { name:'한동욱', ssn:'850211-1******', age:41, phone:'010-7777-4321', phone2:'010-8888-1111', email:'dongwook.han@daum.net', address:'경기도 수원시 영통구 영통로 200', residenceAddress:'경기도 수원시 영통구 영통로 200', company:'삼성전자(주)', companyAddr:'경기도 수원시 영통구 삼성로 129', companyPhone:'031-200-1234', salary:7200, employmentType:'정규직', workYears:'12년 3개월', courtName:'', caseNo:'', refundBank:'삼성증권', refundAccount:'55-123456-78', refundHolder:'한동욱', creditScore:480, creditStatus:'정상', totalDebt:'7,000만', loanDate:'2026-03-24', loanAmount:'4,000만', existingLoans:'국민은행 5,000만, 하나은행 2,000만', dbSource:'네이버 광고', assignedTo:'이과장', status:'부결', regDate:'2026-03-24', memo:'소득 대비 기존 대출 과다. 부결 처리.' },
  307: { name:'강서연', ssn:'970830-2******', age:28, phone:'010-2222-8888', phone2:'', email:'seoyeon.kang@outlook.com', address:'서울특별시 송파구 올림픽로 300', residenceAddress:'서울특별시 송파구 올림픽로 300', company:'(주)네오위즈', companyAddr:'서울특별시 강남구 삼성로 512', companyPhone:'02-6789-0123', salary:4500, employmentType:'정규직', workYears:'3년 10개월', courtName:'', caseNo:'', refundBank:'카카오뱅크', refundAccount:'3333-01-2345678', refundHolder:'강서연', creditScore:710, creditStatus:'정상', totalDebt:'0', loanDate:'', loanAmount:'', existingLoans:'없음', dbSource:'카카오 DB', assignedTo:'김대리', status:'상담', regDate:'2026-03-23', memo:'초기 상담 완료. 추가 상담 예정.' },
  306: { name:'윤재현', ssn:'910612-1******', age:34, phone:'010-4444-6666', phone2:'', email:'jaehyun.yoon@gmail.com', address:'대전광역시 서구 둔산로 50', residenceAddress:'대전광역시 서구 둔산로 50', company:'한국철도공사', companyAddr:'대전광역시 동구 중앙로 240', companyPhone:'042-567-8901', salary:5100, employmentType:'정규직', workYears:'7년 5개월', courtName:'', caseNo:'', refundBank:'농협은행', refundAccount:'302-1234-5678-91', refundHolder:'윤재현', creditScore:750, creditStatus:'정상', totalDebt:'800만', loanDate:'', loanAmount:'', existingLoans:'농협 1,500만 (잔여 800만)', dbSource:'자체 DB', assignedTo:'박사원', status:'리드', regDate:'2026-03-23', memo:'DB 유입. 아직 연락 전.' }
};

// 고객원장 페이지로 이동
let currentLedgerId = null;
function viewCustomerLedger(id) {
  // 이미 고객원장 페이지에 있으면 같은 페이지에서 교체
  if (location.hash.startsWith('#ledger-')) {
    currentLedgerId = id;
    ledgerCustomer = null; // MySQL에서 다시 로드
    location.hash = 'ledger-' + id;
    navigate('customer-ledger');
  } else {
    window.open(location.pathname + '#ledger-' + id, '_blank');
  }
}

// 고객 상세 팝업 열기 (고객현황 목록에서 클릭 시)
function viewCustomer(id) {
  const c = customerData[id];
  if (!c) return;

  const statusMap = {'리드':'badge-lead','상담':'badge-consult','접수':'badge-submit','심사중':'badge-review','승인':'badge-approved','부결':'badge-rejected','실행':'badge-executed','종결':'badge-closed'};
  const badgeClass = statusMap[c.status] || 'badge-lead';
  const gender = c.ssn.charAt(7)==='1'||c.ssn.charAt(7)==='3'?'남':'여';
  const creditColor = c.creditScore>=700?'#16a34a':c.creditScore>=600?'#d97706':'#ef4444';
  const creditGrade = c.creditScore>=700?'양호':c.creditScore>=600?'보통':'주의';

  // 기존 모달 제거
  const old = document.getElementById('customerModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'customerModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700;">${c.name.charAt(0)}</div>
          <div>
            <div style="font-size:16px;font-weight:700;">${c.name} <span class="badge ${badgeClass}" style="font-size:11px;vertical-align:middle;">${c.status}</span> <span style="font-size:11px;color:#94a3b8;font-weight:400;">No.${id}</span></div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">담당: ${c.assignedTo} | 출처: ${c.dbSource} | 등록일: ${c.regDate}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn btn-primary btn-sm">수정</button>
          <button class="btn btn-outline btn-sm" onclick="goLoanRegister(${id})">대출 접수</button>
          <button class="modal-close" onclick="closeCustomerModal()">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <!-- 좌측: 전체 정보 -->
        <div class="modal-left">
          <div class="panel">
            <div class="panel-header"><h2>인적 사항</h2></div>
            <div class="panel-body" style="padding:0;">
              <table class="info-table">
                <tbody>
                  <tr><th>고객명</th><td>${c.name}</td><th>주민등록번호</th><td>${c.ssn}</td></tr>
                  <tr><th>만 나이</th><td>${c.age}세</td><th>성별</th><td>${gender}</td></tr>
                  <tr><th>휴대전화</th><td>${c.phone}</td><th>보조 연락처</th><td>${c.phone2 || '-'}</td></tr>
                  <tr><th>이메일</th><td>${c.email}</td><th>DB 유입출처</th><td>${c.dbSource}</td></tr>
                  <tr><th>초본 주소</th><td colspan="3">${c.residenceAddress}</td></tr>
                  <tr><th>실거주 주소</th><td colspan="3">${c.address}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h2>직장 정보</h2></div>
            <div class="panel-body" style="padding:0;">
              <table class="info-table">
                <tbody>
                  <tr><th>직장명</th><td>${c.company}</td><th>고용형태</th><td>${c.employmentType}</td></tr>
                  <tr><th>직장 주소</th><td colspan="3">${c.companyAddr}</td></tr>
                  <tr><th>직장 전화</th><td>${c.companyPhone}</td><th>재직기간</th><td>${c.workYears}</td></tr>
                  <tr><th>연봉</th><td>${c.salary.toLocaleString()}만원</td><th>월 환산</th><td>${Math.round(c.salary/12).toLocaleString()}만원</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h2>법원 사건 정보</h2></div>
            <div class="panel-body" style="padding:0;">
              <table class="info-table">
                <tbody>
                  <tr><th>법원명</th><td>${c.courtName || '-'}</td><th>사건번호</th><td>${c.caseNo || '-'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h2>개인회생 법원환급계좌</h2></div>
            <div class="panel-body" style="padding:0;">
              <table class="info-table">
                <tbody>
                  <tr><th>은행명</th><td>${c.refundBank}</td><th>예금주</th><td>${c.refundHolder}</td></tr>
                  <tr><th>계좌번호</th><td colspan="3">${c.refundAccount}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h2>신용 및 기존 대출</h2></div>
            <div class="panel-body" style="padding:0;">
              <table class="info-table">
                <tbody>
                  <tr><th>신용점수</th><td><span style="font-weight:700;color:${creditColor}">${c.creditScore}점</span></td><th>등급</th><td>${creditGrade}</td></tr>
                  <tr><th>기존 대출</th><td colspan="3">${c.existingLoans || '없음'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h2>연결된 대출 신청</h2></div>
            <div class="panel-body">
              <table>
                <thead><tr><th>대출금액</th><th>수수료율</th><th>상태</th><th>신청일</th></tr></thead>
                <tbody>
                  <tr><td>3,000만</td><td>3.5%</td><td><span class="badge ${badgeClass}">${c.status}</span></td><td>${c.regDate}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 우측: 상담/변경 이력 -->
        <div class="modal-right">
          <div class="panel">
            <div class="panel-header"><h2>메모</h2></div>
            <div class="panel-body" style="padding:10px 14px;">
              <div style="font-size:12px;color:#334155;background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0;">${c.memo}</div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <h2>상담 이력</h2>
              <button class="btn btn-primary btn-sm">+ 상담 기록</button>
            </div>
            <div class="panel-body">
              <div class="timeline">
                <div class="timeline-item">
                  <div class="tl-date">2026-03-26 10:30</div>
                  <div class="tl-content">대출 조건 문의, 금리 비교 안내. 서류 준비 안내 완료.</div>
                  <div class="tl-user">채널: 전화 | 담당: ${c.assignedTo}</div>
                </div>
                <div class="timeline-item">
                  <div class="tl-date">2026-03-24 14:00</div>
                  <div class="tl-content">초기 상담. 대출 가능 여부 확인 및 필요 서류 안내.</div>
                  <div class="tl-user">채널: 방문 | 담당: ${c.assignedTo}</div>
                </div>
                <div class="timeline-item">
                  <div class="tl-date">2026-03-22 11:00</div>
                  <div class="tl-content">첫 전화 상담. 고객 니즈 파악 및 기본 정보 수집.</div>
                  <div class="tl-user">채널: 전화 | 담당: ${c.assignedTo}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h2>상태 변경 이력</h2></div>
            <div class="panel-body">
              <div class="timeline">
                <div class="timeline-item">
                  <div class="tl-date">2026-03-26 10:30</div>
                  <div class="tl-content"><span class="badge badge-consult">상담</span> &rarr; <span class="badge ${badgeClass}">${c.status}</span></div>
                  <div class="tl-user">사유: 서류 접수 완료 | ${c.assignedTo}</div>
                </div>
                <div class="timeline-item">
                  <div class="tl-date">2026-03-24 14:00</div>
                  <div class="tl-content"><span class="badge badge-lead">리드</span> &rarr; <span class="badge badge-consult">상담</span></div>
                  <div class="tl-user">사유: 초기 상담 완료 | ${c.assignedTo}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h2>담당자 변경 이력</h2></div>
            <div class="panel-body">
              <div class="timeline">
                <div class="timeline-item">
                  <div class="tl-date">2026-03-22 09:00</div>
                  <div class="tl-content">최초 배정: ${c.assignedTo}</div>
                  <div class="tl-user">처리: 박팀장</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  // 배경 클릭 시 닫기
  addModalClose(modal, closeCustomerModal);
  // ESC 키로 닫기
  document.addEventListener('keydown', handleModalEsc);
}

function handleModalEsc(e) {
  if (e.key === 'Escape') {
    const search = document.getElementById('customerSearchModal');
    if (search) { closeCustomerSearch(); return; }
    closeCustomerModal();
  }
}

function closeCustomerModal() {
  const modal = document.getElementById('customerModal');
  if (modal) modal.remove();
  document.removeEventListener('keydown', handleModalEsc);
}

// ========================================
// 고객원장 개별조회 (검색 모달)
// ========================================
function openCustomerSearch() {
  const old = document.getElementById('customerSearchModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'customerSearchModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="search-modal">
      <div class="modal-header">
        <h2 style="font-size:16px;font-weight:700;">고객원장 (개별조회)</h2>
        <button class="modal-close" onclick="closeCustomerSearch()">&times;</button>
      </div>
      <div style="padding:20px;border-bottom:1px solid #e2e8f0;background:#fff;">
        <div class="search-form-grid">
          <div class="search-field">
            <label>이름</label>
            <input type="text" id="searchName" placeholder="고객명 입력">
          </div>
          <div class="search-field">
            <label>주민번호</label>
            <input type="text" id="searchSsn" placeholder="주민번호 입력">
          </div>
          <div class="search-field">
            <label>전화번호</label>
            <input type="text" id="searchPhone" placeholder="전화번호 입력">
          </div>
          <div class="search-field" style="align-self:end;">
            <button class="btn btn-primary" onclick="executeCustomerSearch()" style="width:100%;padding:8px 0;font-size:13px;">검색</button>
          </div>
        </div>
        <div style="margin-top:10px;font-size:11px;color:#94a3b8;">* 하나 이상의 항목을 입력하세요. 중복 시 복수 결과가 표시됩니다. 더블클릭하면 상세정보를 확인할 수 있습니다.</div>
      </div>
      <div id="searchResults" style="padding:16px 20px;min-height:200px;max-height:400px;overflow-y:auto;">
        <div class="empty-state" style="padding:40px 20px;">
          <div class="icon">&#128269;</div>
          <p>이름, 전화번호 또는 주민번호로 검색하세요.</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  addModalClose(modal, closeCustomerSearch);
  document.addEventListener('keydown', handleModalEsc);

  // 엔터키로 검색
  setTimeout(() => {
    const nameInput = document.getElementById('searchName');
    if (nameInput) {
      nameInput.focus();
      document.querySelectorAll('.search-field input').forEach(inp => {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') executeCustomerSearch();
        });
      });
    }
  }, 100);
}

function closeCustomerSearch() {
  const modal = document.getElementById('customerSearchModal');
  if (modal) modal.remove();
}

async function executeCustomerSearch() {
  const nameVal = (document.getElementById('searchName').value || '').trim();
  const ssnVal = (document.getElementById('searchSsn').value || '').trim();
  const phoneVal = (document.getElementById('searchPhone').value || '').trim();
  const resultsDiv = document.getElementById('searchResults');

  if (!nameVal && !ssnVal && !phoneVal) {
    resultsDiv.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="icon">&#128269;</div><p>하나 이상의 항목을 입력하세요.</p></div>';
    return;
  }

  // MySQL API에서 검색
  try {
    const searchTerm = nameVal || phoneVal || ssnVal;
    const res = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}`);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { resultsDiv.innerHTML = '<div class="empty-state"><p>검색 오류</p></div>'; return; }

    let results = data.success ? data.data : [];

    // 추가 필터링 (API가 name/phone만 검색하므로 ssn은 클라이언트에서)
    if (ssnVal) results = results.filter(c => (c.ssn||'').replace(/-/g,'').includes(ssnVal.replace(/-/g,'')));
    if (nameVal && phoneVal) results = results.filter(c => c.name.includes(nameVal) && (c.phone||'').replace(/-/g,'').includes(phoneVal.replace(/-/g,'')));

    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="icon">&#128566;</div><p>검색 결과가 없습니다.</p></div>';
      return;
    }

    const statusMap = {'리드':'badge-lead','상담':'badge-consult','접수':'badge-submit','심사중':'badge-review','승인':'badge-approved','부결':'badge-rejected','실행':'badge-executed','종결':'badge-closed'};

  let html = `
    <div style="font-size:12px;color:#64748b;margin-bottom:8px;">검색 결과: <strong>${results.length}명</strong>${results.length > 1 ? ' (동명이인 또는 중복 연락처)' : ''}</div>
    <table>
      <thead><tr><th>No</th><th>고객명</th><th>연락처</th><th>주민번호</th><th>상태</th><th>담당자</th><th>등록일</th></tr></thead>
      <tbody>
  `;
  for (const r of results) {
    const badge = statusMap[r.status] || 'badge-lead';
    const regDate = r.reg_date ? new Date(r.reg_date).toISOString().split('T')[0] : (r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '-');
    html += `<tr class="search-result-row" ondblclick="closeCustomerSearch();viewCustomerLedger(${r.id});" title="더블클릭하여 고객원장 보기">
      <td>${r.id}</td>
      <td><strong>${r.name}</strong></td>
      <td>${formatPhone(r.phone||'')}</td>
      <td>${(r.ssn||'').substring(0,6)}</td>
      <td><span class="badge ${badge}">${r.status||'리드'}</span></td>
      <td>${r.assigned_to||'-'}</td>
      <td>${regDate}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  resultsDiv.innerHTML = html;
  } catch (e) {
    resultsDiv.innerHTML = '<div class="empty-state"><p>검색 오류: ' + e.message + '</p></div>';
  }
}

// ========================================
// 고객원장 (조회 - 읽기 전용, 수정 버튼으로 전환)
// ========================================
let ledgerEditMode = false;

function toggleLedgerEdit() {
  // 수정 모드 → 고객등록 화면(데이터 채움)으로 전환
  if (!ledgerEditMode) {
    const c = ledgerCustomer;
    if (!c) return;
    // intakePrefill에 고객 전체 데이터를 넣어서 고객등록 화면으로 이동
    ledgerEditCustomerId = currentLedgerId;
    ledgerEditPrefill = c;
    navigate('customer-edit');
  }
}

let ledgerEditCustomerId = null;
let ledgerEditPrefill = null;

async function saveLedger() {
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');

  // 폼에서 수정된 값 수집 (ledgerForm 내 모든 input)
  const inputs = document.querySelectorAll('#ledgerForm input:not([data-always-readonly])');
  const values = [...inputs].map(i => i.value.trim());

  // MySQL API로 고객 정보 업데이트
  try {
    const res = await fetch(`/api/customers/${currentLedgerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values[0] || '', ssn: values[1] || '',
        phone: values[4] || '', phone2: values[5] || '',
        email: values[8] || '',
        assignedTo: user.name || ''
      })
    });
    const result = await res.json();
    if (!result.success) {
      alert('저장 실패: ' + (result.message || ''));
      return;
    }
  } catch (e) {
    alert('저장 오류: ' + e.message);
    return;
  }

  // 변경이력 추가
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const histDiv = document.getElementById('ledgerChangeHistory');
  if (histDiv) {
    const newItem = document.createElement('div');
    newItem.className = 'timeline-item';
    newItem.innerHTML = `<div class="tl-date">${ts}</div><div class="tl-content">고객 원장 정보 수정</div><div class="tl-user">처리: ${user.name||'-'}</div>`;
    histDiv.insertBefore(newItem, histDiv.firstChild);
  }

  // ledgerCustomer 캐시 초기화 → 다시 로드
  ledgerCustomer = null;

  // 읽기 전용으로 복원
  ledgerEditMode = true;
  toggleLedgerEdit();
  alert('저장되었습니다.');
}

async function saveLedgerMemo(customerId) {
  const textarea = document.getElementById('ledgerMemo');
  const content = textarea.value.trim();
  if (!content) { alert('메모를 입력하세요.'); return; }

  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');

  // MySQL에 상담 기록 저장
  try {
    await fetch('/api/consultations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customerId,
        channel: '메모',
        content: content,
        consultedBy: user.name || ''
      })
    });
  } catch (e) { console.error(e); }

  textarea.value = '';
  // 상담이력 새로고침
  loadLedgerTimelines(customerId);
}

// 고객원장 타임라인 로드 (상담이력 + 감사로그)
async function loadLedgerTimelines(customerId) {
  try {
    const [cRes, aRes] = await Promise.all([
      fetch(`/api/consultations?customerId=${customerId}`),
      fetch(`/api/audit-logs?targetId=${customerId}&targetType=customer`)
    ]);
    const cData = await cRes.json();
    const aData = await aRes.json();

    // 상담이력
    const consultTimeline = document.getElementById('ledgerConsultTimeline');
    if (consultTimeline && cData.success) {
      consultTimeline.innerHTML = cData.data.length > 0 ? cData.data.map(c => {
        const date = c.consulted_at ? new Date(c.consulted_at).toLocaleString('ko-KR') : '';
        return `<div class="timeline-item"><div class="tl-date">${date}</div><div class="tl-content">${c.content}</div><div class="tl-user">${c.channel||'메모'} | ${c.consulted_by||'-'}</div></div>`;
      }).join('') : '<div style="font-size:11px;color:#94a3b8;padding:8px;">상담 기록이 없습니다.</div>';
    }

    // 변경이력 (감사로그)
    const changeTimeline = document.getElementById('ledgerChangeHistory');
    if (changeTimeline && aData.success) {
      changeTimeline.innerHTML = aData.data.length > 0 ? aData.data.map(a => {
        const date = a.performed_at ? new Date(a.performed_at).toLocaleString('ko-KR') : '';
        return `<div class="timeline-item"><div class="tl-date">${date}</div><div class="tl-content">${a.after_value||a.event_type}</div><div class="tl-user">처리: ${a.performed_by||'-'}</div></div>`;
      }).join('') : '<div style="font-size:11px;color:#94a3b8;padding:8px;">변경 이력이 없습니다.</div>';
    }
  } catch (e) { console.error(e); }
}

// ========================================
// 도로명주소 검색 (행정안전부 Juso API)
// ========================================
function openAddrSearch(prefix) {
  new daum.Postcode({
    oncomplete: function(data) {
      const zoneEl = document.getElementById(prefix + '-zone');
      const roadEl = document.getElementById(prefix + '-road');
      if (zoneEl) zoneEl.value = data.zonecode;
      if (roadEl) roadEl.value = data.roadAddress || data.jibunAddress;
      const detailEl = document.getElementById(prefix + '-detail');
      if (detailEl) detailEl.focus();
    }
  }).open();
}

function saveRegisterMemo() {
  const memo = document.getElementById('regMemo');
  const channel = document.getElementById('regChannel');
  const content = memo.value.trim();
  if (!content) { alert('메모를 입력하세요.'); return; }

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const ch = channel.value !== '선택' ? channel.value : '메모';

  const timeline = document.getElementById('regConsultTimeline');
  if (timeline) {
    if (timeline.querySelector('div[style]')) timeline.innerHTML = '';
    const newItem = document.createElement('div');
    newItem.className = 'timeline-item';
    newItem.innerHTML = `<div class="tl-date">${ts}</div><div class="tl-content">${content}</div><div class="tl-user">${ch} | 김대리</div>`;
    timeline.insertBefore(newItem, timeline.firstChild);
  }
  memo.value = '';
}

function cancelLedgerEdit() {
  ledgerEditMode = true;
  toggleLedgerEdit();
  navigate('customer-ledger');
}

function ledgerSearch() {
  const nameVal = (document.getElementById('ledgerSearchName')?.value || '').trim();
  const ssnVal = (document.getElementById('ledgerSearchSsn')?.value || '').trim();
  const phoneVal = (document.getElementById('ledgerSearchPhone')?.value || '').trim();
  const resultDiv = document.getElementById('ledgerSearchResult');

  if (!nameVal && !ssnVal && !phoneVal) {
    if (resultDiv) resultDiv.innerHTML = '<span style="color:#ef4444;">검색어를 입력하세요.</span>';
    return;
  }

  const results = [];
  for (const [id, c] of Object.entries(customerData)) {
    let match = true;
    if (nameVal && !c.name.includes(nameVal)) match = false;
    if (phoneVal && !c.phone.replace(/-/g,'').includes(phoneVal.replace(/-/g,''))) match = false;
    if (ssnVal && !c.ssn.replace(/-/g,'').includes(ssnVal.replace(/-/g,''))) match = false;
    if (match) results.push({ id: parseInt(id), ...c });
  }

  if (results.length === 0) {
    if (resultDiv) resultDiv.innerHTML = '<span style="color:#ef4444;">검색 결과 없음</span>';
    return;
  }

  if (results.length === 1) {
    // 1명이면 바로 전환
    currentLedgerId = results[0].id;
    document.title = results[0].name + ' - 고객원장';
    location.hash = 'ledger-' + results[0].id;
    navigate('customer-ledger');
  } else {
    // 복수 결과 - 선택 UI
    let html = results.map(r =>
      `<a href="#" onclick="currentLedgerId=${r.id};document.title='${r.name} - 고객원장';location.hash='ledger-${r.id}';navigate('customer-ledger');return false;" style="margin-right:8px;color:#2563eb;text-decoration:underline;font-weight:600;">${r.name}(${r.ssn.substring(0,6)})</a>`
    ).join('');
    if (resultDiv) resultDiv.innerHTML = html;
  }
}

let ledgerCustomer = null;

async function loadLedgerCustomer(id) {
  try {
    const res = await fetch(`/api/customers/${id}`);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { return null; }
    if (data.success) return data.data;
  } catch (e) {}
  // fallback to in-memory
  return customerData[id] || null;
}

function renderCustomerLedger() {
  ledgerEditMode = false;

  // MySQL에서 로드 안 됐으면 로드 후 다시 렌더
  if (!ledgerCustomer || ledgerCustomer.id !== currentLedgerId) {
    loadLedgerCustomer(currentLedgerId).then(data => {
      if (data) {
        ledgerCustomer = data;
        document.getElementById('content').innerHTML = renderCustomerLedger();
      }
    });
    return '<div style="text-align:center;padding:40px;color:#94a3b8;">고객 정보를 불러오는 중...</div>';
  }

  const c = ledgerCustomer;
  const ssn = c.ssn || '';
  const genderChar = ssn.length >= 8 ? ssn.charAt(7) : '';
  const gender = (genderChar==='1'||genderChar==='3') ? '남' : (genderChar==='2'||genderChar==='4') ? '여' : '-';
  const creditScore = c.credit_score || c.creditScore || 0;
  const creditColor = creditScore>=700?'#16a34a':creditScore>=600?'#d97706':'#ef4444';
  const status = c.status || '리드';
  const statusMap = {'리드':'badge-lead','상담':'badge-consult','접수':'badge-submit','심사중':'badge-review','승인':'badge-approved','부결':'badge-rejected','실행':'badge-executed','종결':'badge-closed'};
  const badgeClass = statusMap[status] || 'badge-lead';
  const assignedTo = c.assigned_to || c.assignedTo || '-';
  const dbSource = c.db_source || c.dbSource || '-';
  const regDate = c.reg_date ? new Date(c.reg_date).toISOString().split('T')[0] : (c.regDate || '-');
  const ro = 'readonly style="background:#f8fafc;border-color:#e2e8f0;"';

  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:10px;display:flex;gap:8px;align-items:center;">
      <span style="font-size:12px;font-weight:600;color:#475569;white-space:nowrap;">고객 조회</span>
      <input type="text" id="ledgerSearchName" placeholder="이름" style="width:100px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;">
      <input type="text" id="ledgerSearchSsn" placeholder="주민번호" style="width:120px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;">
      <input type="text" id="ledgerSearchPhone" placeholder="전화번호" style="width:120px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;">
      <button class="btn btn-primary btn-sm" onclick="ledgerSearch()">검색</button>
      <div id="ledgerSearchResult" style="flex:1;font-size:11px;color:#94a3b8;"></div>
    </div>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <div style="width:36px;height:36px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;">${c.name.charAt(0)}</div>
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:700;">${c.name} <span class="badge ${badgeClass}" style="font-size:11px;vertical-align:middle;">${status}</span> <span style="font-size:11px;color:#94a3b8;">No.${currentLedgerId}</span></div>
        <div style="font-size:11px;color:#64748b;">담당: ${assignedTo} | 출처: ${dbSource} | 등록일: ${regDate}</div>
      </div>
    </div>

    <div id="ledgerForm" style="display:flex;gap:8px;align-items:flex-start;max-width:1305px;">
      <div style="flex:1;min-width:0;">
        <div class="panel"><div class="panel-header"><h2>인적 사항</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>고객명</th><td><input type="text" value="${c.name||''}" ${ro}></td><th>주민등록번호</th><td><input type="text" value="${formatSsn(ssn)}" ${ro}></td></tr>
            <tr><th>만 나이</th><td><input type="text" value="${c.age||''}세" data-always-readonly="1" readonly style="background:#f1f5f9;border-color:#e2e8f0;"></td><th>성별</th><td><input type="text" value="${gender}" data-always-readonly="1" readonly style="background:#f1f5f9;border-color:#e2e8f0;"></td></tr>
            <tr><th>통신사</th><td><input type="text" value="${c.carrier||'-'}" ${ro}></td><th>보조 연락처</th><td><input type="text" value="${c.phone2 || '-'}" ${ro}></td></tr>
            <tr><th>휴대전화</th><td><input type="text" value="${formatPhone(c.phone||'')}" ${ro}></td><th>4대보험</th><td><input type="text" value="${c.has_4_insurance||'-'}" ${ro}></td></tr>
            <tr><th>이메일</th><td><input type="text" value="${c.email||''}" ${ro}></td><th>DB 유입출처</th><td><input type="text" value="${dbSource}" ${ro}></td></tr>
            <tr><th>초본 주소</th><td colspan="3"><input type="text" value="${c.address||c.residence_address||''}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
            <tr><th>실거주 주소</th><td colspan="3"><input type="text" value="${c.residence_address||c.address||''}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>직장 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>직장명</th><td><input type="text" value="${c.company||''}" ${ro}></td><th>고용형태</th><td><input type="text" value="${c.employment_type||c.employmentType||''}" ${ro}></td></tr>
            <tr><th>직장 주소</th><td colspan="3"><input type="text" value="${c.company_addr||c.companyAddr||''}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
            <tr><th>직장 전화</th><td><input type="text" value="${c.company_phone||c.companyPhone||''}" ${ro}></td><th>재직기간</th><td><input type="text" value="${c.work_years||c.workYears||''}" ${ro}></td></tr>
            <tr><th>연봉</th><td><input type="text" value="${(c.salary||0)}만원" ${ro}></td><th>월 환산</th><td><input type="text" value="${c.salary ? Math.round(c.salary/12)+'만원' : ''}" data-always-readonly="1" readonly style="background:#f1f5f9;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>차량 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>차량번호</th><td><input type="text" value="${c.vehicle_no||'-'}" ${ro}></td><th>차량명</th><td><input type="text" value="${c.vehicle_name||'-'}" ${ro}></td></tr>
            <tr><th>차량연식</th><td><input type="text" value="${c.vehicle_year||'-'}" ${ro}></td><th>주행거리</th><td><input type="text" value="${c.vehicle_km ? c.vehicle_km+'km' : '-'}" ${ro}></td></tr>
            <tr><th>차량소유구분</th><td><input type="text" value="${c.vehicle_ownership||'-'}" ${ro}></td><th>공동명의자</th><td><input type="text" value="${c.vehicle_co_owner||'-'}" ${ro}></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>회파복 / 법원 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>회파복 구분</th><td><input type="text" value="${c.recovery_type||'-'}" ${ro}></td><th>총회차/납입회차</th><td><input type="text" value="${(c.recovery_total_count && c.recovery_paid_count) ? c.recovery_total_count+'/'+c.recovery_paid_count : '-'}" ${ro}></td></tr>
            <tr><th>법원명</th><td><input type="text" value="${c.court_name||c.courtName||'-'}" ${ro}></td><th>사건번호</th><td><input type="text" value="${c.case_no||c.caseNo||'-'}" ${ro}></td></tr>
            <tr><th>월변제금액</th><td><input type="text" value="${c.monthly_payment ? formatWon(c.monthly_payment)+'원' : '-'}" ${ro}></td><th></th><td></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>개인회생 법원환급계좌</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>은행명</th><td><input type="text" value="${c.refund_bank||c.refundBank||''}" ${ro}></td><th>예금주</th><td><input type="text" value="${c.refund_holder||c.refundHolder||''}" ${ro}></td></tr>
            <tr><th>계좌번호</th><td colspan="3"><input type="text" value="${c.refund_account||c.refundAccount||''}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>신용 및 기존 대출</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>신용점수</th><td><input type="text" value="${creditScore}점" ${ro} style="color:${creditColor};font-weight:700;background:#f8fafc;border-color:#e2e8f0;"></td><th>등급</th><td><input type="text" value="${c.credit_status||c.creditStatus||'-'}" ${ro}></td></tr>
            <tr><th>기존 대출</th><td colspan="3"><input type="text" value="${c.existing_loans||c.existingLoans||'없음'}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>연결된 대출 신청</h2></div><div class="panel-body" style="padding:0;">
          <table><thead><tr><th>대출상품</th><th>대출금액</th><th>상태</th><th>신청일</th></tr></thead>
          <tbody><tr><td>${c.loan_amount||c.loanAmount ? '-' : '-'}</td><td>${c.loan_amount||c.loanAmount||'-'}</td><td><span class="badge ${badgeClass}">${status}</span></td><td>${regDate}</td></tr></tbody></table>
        </div></div>
      </div>

      <div style="width:320px;flex-shrink:0;">
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button class="btn btn-outline btn-sm" id="ledgerEditBtn" onclick="toggleLedgerEdit()" style="flex:1;">수정</button>
          <button class="btn btn-primary btn-sm" id="ledgerSaveBtn" style="display:none;flex:1;" onclick="saveLedger()">수정 저장</button>
          <button class="btn btn-outline btn-sm" id="ledgerCancelBtn" style="display:none;flex:1;" onclick="cancelLedgerEdit()">취소</button>
          <button class="btn btn-outline btn-sm" onclick="goLoanRegister(${currentLedgerId})" style="flex:1;">대출 접수</button>
        </div>
        <div class="panel"><div class="panel-header"><h2>메모 / 상담 이력</h2><button class="btn btn-primary btn-sm" onclick="saveLedgerMemo(${currentLedgerId})">기록 저장</button></div>
          <div class="panel-body" style="padding:8px 12px;">
            <textarea id="ledgerMemo" rows="3" placeholder="메모를 입력하면 상담 이력에 기록됩니다..." style="width:100%;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;font-size:12px;resize:none;height:70px;box-sizing:border-box;"></textarea>
          </div>
          <div class="panel-body" style="padding:8px 12px;border-top:1px solid #e2e8f0;max-height:300px;overflow-y:auto;">
            <div class="timeline" id="ledgerConsultTimeline">
              <div style="font-size:11px;color:#94a3b8;padding:8px;">로딩중...</div>
            </div>
          </div>
        </div>

        <div class="panel"><div class="panel-header"><h2>변경 이력</h2></div>
          <div class="panel-body" style="padding:8px 12px;">
            <div class="timeline" id="ledgerChangeHistory">
              <div style="font-size:11px;color:#94a3b8;padding:8px;">로딩중...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// 고객 등록 (웹 페이지)
// ========================================
// ========================================
// 신규 유입 페이지
// ========================================
let intakeData = [];

function renderIntake() {
  if (intakeData.length === 0) loadIntake();

  const pending = intakeData.filter(i => i.status === 'pending');
  const processed = intakeData.filter(i => i.status !== 'pending');

  const rows = intakeData.map(i => {
    const date = i.created_at ? new Date(i.created_at).toLocaleString('ko-KR') : '';
    const statusBadge = i.status === 'pending' ? '<span class="badge badge-consult">대기</span>' :
                        i.status === 'processed' ? '<span class="badge badge-approved">처리</span>' :
                        '<span class="badge badge-rejected">반려</span>';
    const actions = i.status === 'pending' ? `
      <button class="btn btn-sm btn-primary" onclick="processIntake(${i.id},'${i.name}','${i.phone}','${(i.content||'').replace(/'/g,"\\'")}','${i.source||'홈페이지'}')">접수</button>
      <button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:#ef4444;" onclick="rejectIntake(${i.id})">반려</button>
    ` : (i.assigned_to || '-');

    const phoneF = formatPhone(i.phone||'');
    const contentKo = translateContent(i.content||'');

    return `<tr ondblclick="processIntake(${i.id},'${i.name}','${i.phone}','${(i.content||'').replace(/'/g,"\\'")}','${i.source||'홈페이지'}')" style="cursor:${i.status==='pending'?'pointer':'default'};" title="${i.status==='pending'?'더블클릭: 고객등록으로 이동':''}">
      <td>${date}</td>
      <td style="font-weight:600;">${i.name}</td>
      <td>${phoneF}</td>
      <td>${i.source || '홈페이지'}</td>
      <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${contentKo}">${contentKo||'-'}</td>
      <td>${statusBadge}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');

  return `
    <div class="stat-cards" style="margin-bottom:10px;">
      <div class="stat-card" style="border-left:3px solid #f59e0b;">
        <div class="label">대기 중</div>
        <div class="value" style="color:#f59e0b;">${pending.length}건</div>
      </div>
      <div class="stat-card">
        <div class="label">처리 완료</div>
        <div class="value">${processed.length}건</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>신규 유입 고객</h2>
        <button class="btn btn-outline btn-sm" onclick="loadIntake()">새로고침</button>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>접수일시</th><th>이름</th><th>연락처</th><th>출처</th><th>상담내용</th><th>상태</th><th>처리</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8;">신규 유입 고객이 없습니다.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadIntake() {
  try {
    const res = await fetch('/api/intake/list');
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { return; }
    if (data.success) {
      intakeData = data.data;
      updateIntakeBadge();
    }
  } catch (e) { console.error(e); }
}

function updateIntakeBadge() {
  const pending = intakeData.filter(i => i.status === 'pending').length;
  const badge = document.getElementById('intakeBadge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? '' : 'none';
  }
  // 대시보드 카드 업데이트
  const card = document.getElementById('intakeCard');
  if (card && pending > 0) {
    const recentPending = intakeData.filter(i => i.status === 'pending').slice(0, 5);
    card.innerHTML = `
      <div class="panel" style="border-left:3px solid #f59e0b;margin-bottom:10px;">
        <div class="panel-header">
          <h2 style="color:#f59e0b;">신규 유입 고객 (${pending}건)</h2>
          <button class="btn btn-sm btn-outline" onclick="navigate('intake')">전체보기</button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table>
            <thead><tr><th>이름</th><th>연락처</th><th>출처</th><th>접수시간</th><th>처리</th></tr></thead>
            <tbody>${recentPending.map(i => {
              const ago = Math.round((Date.now() - new Date(i.created_at).getTime()) / 60000);
              const agoText = ago < 60 ? ago + '분전' : Math.round(ago/60) + '시간전';
              return `<tr>
                <td style="font-weight:600;">${i.name}</td>
                <td>${i.phone}</td>
                <td>${i.source||'홈페이지'}</td>
                <td>${agoText}</td>
                <td><button class="btn btn-sm btn-primary" onclick="processIntake(${i.id},'${i.name}','${i.phone}')">접수</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }
}

// 신규 유입 → 고객등록 연동 데이터
let intakePrefill = null;

async function processIntake(id, name, phone, content, source) {
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
  if (!confirm(`${name} (${phone}) 고객을 접수 처리하시겠습니까?\n\n고객등록 화면으로 이동합니다.`)) return;

  try {
    await fetch(`/api/intake/${id}/process`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: user.name, assignedToId: user.id })
    });
    // 고객등록 화면에 데이터 전달
    // content에서 통신사 파싱 (예: "통신사: LGU+ / 직업: 직장인")
    let carrierFromContent = '';
    let insuranceFromContent = '';
    const carrierMatch = (content||'').match(/통신사:\s*([^\s/]+)/);
    if (carrierMatch) {
      carrierFromContent = carrierMatch[1];
      // LGU → LGU+, SKT → SK 등 매핑
      const carrierMap = {'LGU':'LGU+','LGT':'LGU+','SKT':'SK','알뜰폰':'알뜰','SK알뜰폰':'SK알뜰','KT알뜰폰':'KT알뜰','LG알뜰폰':'LG알뜰'};
      if (carrierMap[carrierFromContent]) carrierFromContent = carrierMap[carrierFromContent];
    }
    const insMatch = (content||'').match(/4대보험:\s*([^\s/]+)/);
    if (insMatch) insuranceFromContent = translateContent(insMatch[1]);
    intakePrefill = { name: name, phone: phone, carrier: carrierFromContent, has4Insurance: insuranceFromContent, memo: content || '', dbSource: source || '홈페이지' };
    intakeData = [];
    navigate('customer-register');
  } catch (e) { alert('오류: ' + e.message); }
}

async function rejectIntake(id) {
  const reason = prompt('반려 사유:');
  if (reason === null) return;

  try {
    await fetch(`/api/intake/${id}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    intakeData = [];
    navigate('intake');
    setTimeout(() => loadIntake(), 100);
  } catch (e) { alert('오류: ' + e.message); }
}

// 페이지 로드 시 신규 유입 확인
setTimeout(() => loadIntake(), 800);
// 1분마다 자동 확인
setInterval(() => loadIntake(), 60000);

// ========================================
// 고객 수정 (고객원장에서 수정 클릭 시)
// ========================================
function renderCustomerEdit() {
  const c = ledgerEditPrefill || {};
  const selDb = (opts, val) => opts.map(o => `<option${o===val?' selected':''}>${o}</option>`).join('');
  const dbOpts = ['선택하세요','네이버 광고','카카오 DB','자체 DB','소개/추천','홈페이지','기타'];
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
  const assignOptions = employeeList.length > 0 ? employeeList.map(e => `<option value="${e.name}" ${e.name===(c.assigned_to||'')?'selected':''}>${e.name}</option>`).join('') : '';

  return `
    <div class="panel" style="border-left:3px solid #3b82f6;margin-bottom:6px;">
      <div class="panel-body" style="padding:8px 14px;font-size:12px;">
        <strong style="color:#3b82f6;">고객 수정</strong> - ${c.name||''} (No.${ledgerEditCustomerId})
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-start;max-width:1305px;">
      <div style="flex:1;min-width:0;">
        <div class="panel"><div class="panel-header"><h2>인적 사항</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>고객명 *</th><td><input type="text" id="edit-name" value="${c.name||''}"></td><th>주민등록번호 *</th><td><input type="text" id="edit-ssn" value="${formatSsn(c.ssn||'')}" oninput="this.value=formatSsn(this.value)"></td></tr>
            <tr><th>통신사</th><td><select id="edit-carrier">${selDb(['선택','SK','KT','LGU+','알뜰','SK알뜰','KT알뜰','LG알뜰','기타'], c.carrier||'선택')}</select></td><th>보조 연락처</th><td><input type="text" id="edit-phone2" value="${c.phone2||''}"></td></tr>
            <tr><th>휴대전화 *</th><td><input type="text" id="edit-phone" value="${formatPhone(c.phone||'')}" oninput="this.value=formatPhone(this.value)"></td><th>4대보험</th><td><select id="edit-insurance">${selDb(['선택','가입','미가입','모름'], c.has_4_insurance||'선택')}</select></td></tr>
            <tr><th>이메일</th><td><input type="text" id="edit-email" value="${c.email||''}"></td><th>DB 유입출처 *</th><td><select id="edit-dbsource">${selDb(dbOpts, c.db_source||'선택하세요')}</select></td></tr>
            <tr><th>초본 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="edit-addr1" style="flex:1;" value="${c.address||''}" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('edit-addr1')">검색</button><input type="text" id="edit-addr1-detail" style="width:200px;" placeholder="상세주소"></div></td></tr>
            <tr><th>실거주 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="edit-addr2" style="flex:1;" value="${c.residence_address||''}" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('edit-addr2')">검색</button><input type="text" id="edit-addr2-detail" style="width:200px;" placeholder="상세주소"></div></td></tr>
            <tr><th>주거종류</th><td><select id="edit-housing">${selDb(['선택','아파트','빌라','연립','다세대','단독주택','상가','오피스텔','관사','기타'], c.housing_type||'선택')}</select></td><th>주택소유구분</th><td><select id="edit-housing-own">${selDb(['선택','부동산 소유중','부동산 없음','기타'], c.housing_ownership||'선택')}</select></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>직장 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>직장명</th><td><input type="text" id="edit-company" value="${c.company||''}"></td><th>고용형태</th><td><select id="edit-emptype">${selDb(['선택','정규직','계약직','프리랜서','자영업','무직'], c.employment_type||'선택')}</select></td></tr>
            <tr><th>직장 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="edit-compaddr" style="flex:1;" value="${c.company_addr||''}" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('edit-compaddr')">검색</button><input type="text" id="edit-compaddr-detail" style="width:200px;" placeholder="상세주소"></div></td></tr>
            <tr><th>직장 전화</th><td><input type="text" id="edit-compphone" value="${c.company_phone||''}"></td><th>재직기간</th><td><input type="text" id="edit-workyears" value="${c.work_years||''}"></td></tr>
            <tr><th>연봉</th><td><input type="text" id="edit-salary" value="${c.salary||''}"></td><th>월 환산</th><td><input type="text" value="${c.salary ? Math.round(c.salary/12)+'만원' : ''}" readonly style="background:#f1f5f9;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>차량 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>차량번호</th><td><input type="text" id="edit-vno" value="${c.vehicle_no||''}"></td><th>차량명</th><td><input type="text" id="edit-vname" value="${c.vehicle_name||''}"></td></tr>
            <tr><th>차량연식</th><td><select id="edit-vyear"><option>선택</option>${Array.from({length:20},(_,i)=>2026-i).map(y=>`<option ${String(y)===(c.vehicle_year||'')?'selected':''}>${y}</option>`).join('')}</select></td><th>주행거리</th><td><input type="text" id="edit-vkm" value="${c.vehicle_km||''}"></td></tr>
            <tr><th>차량소유구분</th><td><select id="edit-vown">${selDb(['선택','소유(본인명의)','소유(공동명의 대표)','소유(공동명의)','미소유'], c.vehicle_ownership||'선택')}</select></td><th>공동명의자</th><td><input type="text" id="edit-vcoowner" value="${c.vehicle_co_owner||''}"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>회파복 / 법원 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>회파복 구분</th><td><select id="edit-recovery">${selDb(['선택','무','회생','파산','회복'], c.recovery_type||'선택')}</select></td><th>총회차/납입회차</th><td><div style="display:flex;gap:4px;align-items:center;"><input type="text" id="edit-recovery-total" style="width:60px;" value="${c.recovery_total_count||''}"><span>/</span><input type="text" id="edit-recovery-paid" style="width:60px;" value="${c.recovery_paid_count||''}"></div></td></tr>
            <tr><th>법원명</th><td><input type="text" id="edit-court" value="${c.court_name||''}"></td><th>사건번호</th><td><input type="text" id="edit-caseno" value="${c.case_no||''}"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>개인회생 법원환급계좌</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>은행명</th><td><select id="edit-bank">${selDb(['선택하세요','국민은행','신한은행','우리은행','하나은행','농협은행','카카오뱅크','토스뱅크','기업은행','SC제일','기타'], c.refund_bank||'선택하세요')}</select></td><th>예금주</th><td><input type="text" id="edit-holder" value="${c.refund_holder||''}"></td></tr>
            <tr><th>계좌번호</th><td><input type="text" id="edit-account" value="${c.refund_account||''}"></td><th>월변제금액</th><td><div style="display:flex;align-items:center;gap:4px;"><input type="text" id="edit-monthly-pay" value="${c.monthly_payment ? formatWon(c.monthly_payment) : ''}" oninput="this.value=formatWon(this.value)" style="flex:1;"><span style="font-size:11px;">원</span></div></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>신용 및 기존 대출</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>신용점수</th><td><input type="text" id="edit-credit" value="${c.credit_score||''}"></td><th>등급</th><td><input type="text" id="edit-grade" value="${c.credit_status||''}"></td></tr>
            <tr><th>기존 대출</th><td colspan="3"><input type="text" id="edit-loans" value="${c.existing_loans||''}" style="width:100%;"></td></tr>
          </tbody></table>
        </div></div>
      </div>

      <div style="width:300px;flex-shrink:0;">
        <div class="panel"><div class="panel-header"><h2>담당자</h2></div>
          <div class="panel-body" style="padding:8px 10px;">
            <select id="edit-assigned" style="width:100%;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;"><option>선택하세요</option>${assignOptions}</select>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn btn-primary" style="flex:1;padding:8px;font-size:13px;" onclick="submitCustomerEdit()">수정 저장</button>
          <button class="btn btn-outline" style="padding:8px 14px;font-size:13px;" onclick="viewCustomerLedger(${ledgerEditCustomerId})">취소</button>
        </div>
      </div>
    </div>
  `;
}

async function submitCustomerEdit() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
  const data = {
    name: v('edit-name'), ssn: v('edit-ssn'), phone: v('edit-phone'), carrier: v('edit-carrier'),
    phone2: v('edit-phone2'), email: v('edit-email'), dbSource: v('edit-dbsource'),
    address: (v('edit-addr1') + ' ' + v('edit-addr1-detail')).trim(),
    residenceAddress: (v('edit-addr2') + ' ' + v('edit-addr2-detail')).trim(),
    housingType: v('edit-housing'), housingOwnership: v('edit-housing-own'),
    company: v('edit-company'), employmentType: v('edit-emptype'), has4Insurance: v('edit-insurance'),
    companyAddr: (v('edit-compaddr') + ' ' + v('edit-compaddr-detail')).trim(),
    companyPhone: v('edit-compphone'), workYears: v('edit-workyears'), salary: parseInt(v('edit-salary')) || 0,
    vehicleNo: v('edit-vno'), vehicleName: v('edit-vname'), vehicleYear: v('edit-vyear'),
    vehicleKm: v('edit-vkm'), vehicleOwnership: v('edit-vown'), vehicleCoOwner: v('edit-vcoowner'),
    recoveryType: v('edit-recovery'), recoveryTotalCount: v('edit-recovery-total'), recoveryPaidCount: v('edit-recovery-paid'),
    courtName: v('edit-court'), caseNo: v('edit-caseno'),
    refundBank: v('edit-bank'), refundHolder: v('edit-holder'), refundAccount: v('edit-account'), monthlyPayment: v('edit-monthly-pay'),
    creditScore: parseInt(v('edit-credit')) || 0, creditStatus: v('edit-grade'), existingLoans: v('edit-loans'),
    assignedTo: v('edit-assigned')
  };

  try {
    const res = await fetch(`/api/customers/${ledgerEditCustomerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      ledgerCustomer = null;
      alert('수정 저장 완료');
      viewCustomerLedger(ledgerEditCustomerId);
    } else {
      alert('저장 실패: ' + (result.message || ''));
    }
  } catch (e) { alert('오류: ' + e.message); }
}

// ========================================
// 고객 등록 (웹 페이지)
// ========================================
async function submitCustomerRegister() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    name: v('reg-name'), ssn: v('reg-ssn'), phone: v('reg-phone'), phone2: v('reg-phone2'),
    carrier: v('reg-carrier'), email: v('reg-email'), dbSource: v('reg-dbsource'),
    address: (v('reg-addr1') + ' ' + v('reg-addr1-detail')).trim(),
    residenceAddress: (v('reg-addr2') + ' ' + v('reg-addr2-detail')).trim(),
    housingType: v('reg-housing'), housingOwnership: v('reg-housing-own'),
    company: v('reg-company'), employmentType: v('reg-emptype'), has4Insurance: v('reg-insurance'),
    companyAddr: (v('reg-compaddr') + ' ' + v('reg-compaddr-detail')).trim(),
    companyPhone: v('reg-compphone'), workYears: v('reg-workyears'), salary: parseInt(v('reg-salary')) || 0,
    vehicleNo: v('reg-vno'), vehicleName: v('reg-vname'), vehicleYear: v('reg-vyear'),
    vehicleKm: v('reg-vkm'), vehicleOwnership: v('reg-vown'), vehicleCoOwner: v('reg-vcoowner'),
    recoveryType: v('reg-recovery'),
    recoveryTotalCount: v('reg-recovery-total'),
    recoveryPaidCount: v('reg-recovery-paid'),
    courtName: v('reg-court'), caseNo: v('reg-caseno'), monthlyPayment: v('reg-monthly-pay'),
    refundBank: v('reg-bank'), refundHolder: v('reg-holder'), refundAccount: v('reg-account'),
    creditScore: parseInt(v('reg-credit')) || 0, existingLoans: v('reg-loans'),
    assignedTo: v('reg-assigned'), status: v('reg-status') || '리드', memo: ''
  };

  if (!data.name || !data.phone) {
    alert('고객명과 휴대전화는 필수입니다.');
    return;
  }

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      intakePrefill = null;
      alert(`${data.name} 고객이 등록되었습니다.`);
      navigate('customers');
    } else {
      alert('등록 실패: ' + (result.message || ''));
    }
  } catch (e) {
    alert('오류: ' + e.message);
  }
}

function renderCustomerRegister() {
  const pf = intakePrefill || {};
  const selDb = (opts, val) => opts.map(o => `<option${o===val?' selected':''}>${o}</option>`).join('');
  const dbOpts = ['선택하세요','네이버 광고','카카오 DB','자체 DB','소개/추천','홈페이지','기타'];

  const phoneFormatted = formatPhone(pf.phone||'');

  // 담당자 목록 (직원 DB에서)
  const assignOptions = employeeList.length > 0 ?
    employeeList.map(e => `<option value="${e.name}">${e.name} (${e.position_title||''})</option>`).join('') :
    '<option>로딩중...</option>';

  const prefillBanner = pf.name ? `
    <div class="panel" style="border-left:3px solid #f59e0b;margin-bottom:6px;">
      <div class="panel-body" style="padding:8px 14px;font-size:12px;">
        <strong style="color:#f59e0b;">신규 유입 고객 접수</strong> - ${pf.name} (${phoneFormatted}) | 출처: ${pf.dbSource||'홈페이지'}
      </div>
    </div>
  ` : '';

  return `
    ${prefillBanner}
    <div style="display:flex;gap:8px;align-items:flex-start;max-width:1305px;">
      <div style="flex:1;min-width:0;">
        <div class="panel"><div class="panel-header"><h2>인적 사항</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>고객명 <span class="required">*</span></th><td><input type="text" id="reg-name" placeholder="고객명 입력" value="${pf.name||''}"></td><th>주민등록번호 <span class="required">*</span></th><td><input type="text" id="reg-ssn" placeholder="000000-0000000" oninput="this.value=formatSsn(this.value);calcAge();"></td></tr>
            <tr><th>만 나이</th><td><input type="text" id="reg-age" placeholder="주민번호 입력 시 자동" readonly style="background:#f1f5f9;"></td><th>성별</th><td><select id="reg-gender"><option>선택</option><option>남</option><option>여</option></select></td></tr>
            <tr><th>통신사</th><td><select id="reg-carrier">${selDb(['선택','SK','KT','LGU+','알뜰','SK알뜰','KT알뜰','LG알뜰','기타'], pf.carrier||'선택')}</select></td><th>보조 연락처</th><td><input type="text" id="reg-phone2" placeholder="연락처"></td></tr>
            <tr><th>휴대전화 <span class="required">*</span></th><td><input type="text" id="reg-phone" placeholder="010-0000-0000" value="${phoneFormatted}" oninput="this.value=formatPhone(this.value)"></td><th>이메일</th><td><input type="text" id="reg-email" placeholder="이메일"></td></tr>
            <tr><th>DB 유입출처 <span class="required">*</span></th><td><select id="reg-dbsource">${selDb(dbOpts, pf.dbSource||'선택하세요')}</select></td><th></th><td></td></tr>
            <tr><th>초본 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="reg-addr1" style="flex:1;" placeholder="주소 검색" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('reg-addr1')">검색</button><input type="text" id="reg-addr1-detail" style="width:200px;" placeholder="상세주소 입력"></div></td></tr>
            <tr><th>실거주 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="reg-addr2" style="flex:1;" placeholder="주소 검색" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('reg-addr2')">검색</button><input type="text" id="reg-addr2-detail" style="width:200px;" placeholder="상세주소 입력"></div></td></tr>
            <tr><th>주거종류</th><td><select id="reg-housing"><option>선택</option><option>아파트</option><option>빌라</option><option>연립</option><option>다세대</option><option>단독주택</option><option>상가</option><option>오피스텔</option><option>관사</option><option>기타</option></select></td><th>주택소유구분</th><td><select id="reg-housing-own"><option>선택</option><option>부동산 소유중</option><option>부동산 없음</option><option>기타</option></select></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>직장 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>직장명</th><td><input type="text" id="reg-company" placeholder="직장명"></td><th>고용형태</th><td><select id="reg-emptype"><option>선택</option><option>정규직</option><option>계약직</option><option>프리랜서</option><option>자영업</option><option>무직</option></select></td></tr>
            <tr><th>4대보험</th><td><select id="reg-insurance">${selDb(['선택','가입','미가입','모름'], pf.has4Insurance||'선택')}</select></td><th></th><td></td></tr>
            <tr><th>직장 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="reg-compaddr" style="flex:1;" placeholder="주소 검색" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('reg-compaddr')">검색</button><input type="text" id="reg-compaddr-detail" style="width:200px;" placeholder="상세주소 입력"></div></td></tr>
            <tr><th>직장 전화</th><td><input type="text" id="reg-compphone" placeholder="02-0000-0000"></td><th>재직기간</th><td><input type="text" id="reg-workyears" placeholder="예: 3년 2개월"></td></tr>
            <tr><th>연봉</th><td><input type="text" id="reg-salary" placeholder="만원 단위" oninput="calcMonthly()"></td><th>월 환산</th><td><input type="text" id="reg-monthly" placeholder="자동계산" readonly style="background:#f1f5f9;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>차량 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>차량번호</th><td><input type="text" id="reg-vno" placeholder="123가4567"></td><th>차량명</th><td><input type="text" id="reg-vname" placeholder="차량명"></td></tr>
            <tr><th>차량연식</th><td><select id="reg-vyear"><option>선택</option>${Array.from({length:20},(_,i)=>2026-i).map(y=>`<option>${y}</option>`).join('')}</select></td><th>주행거리</th><td><div style="display:flex;align-items:center;gap:4px;"><input type="text" id="reg-vkm" placeholder="숫자만" style="flex:1;"><span style="font-size:11px;">km</span></div></td></tr>
            <tr><th>차량소유구분</th><td><select id="reg-vown"><option>선택</option><option>소유(본인명의)</option><option>소유(공동명의 대표)</option><option>소유(공동명의)</option><option>미소유</option></select></td><th>공동명의자명</th><td><input type="text" id="reg-vcoowner" placeholder=""></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>회파복 / 법원 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>회파복 구분</th><td><select id="reg-recovery"><option>선택</option><option>무</option><option>회생</option><option>파산</option><option>회복</option></select></td><th>총회차/납입회차</th><td><div style="display:flex;gap:4px;align-items:center;"><input type="text" id="reg-recovery-total" style="width:60px;" placeholder="총"><span>/</span><input type="text" id="reg-recovery-paid" style="width:60px;" placeholder="납입"></div></td></tr>
            <tr><th>법원명</th><td><input type="text" id="reg-court" placeholder="법원명 (해당 시)"></td><th>사건번호</th><td><input type="text" id="reg-caseno" placeholder="사건번호 (해당 시)"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>개인회생 법원환급계좌</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>은행명</th><td><select id="reg-bank"><option>선택하세요</option><option>국민은행</option><option>신한은행</option><option>우리은행</option><option>하나은행</option><option>농협은행</option><option>카카오뱅크</option><option>토스뱅크</option><option>기업은행</option><option>SC제일</option><option>기타</option></select></td><th>예금주</th><td><input type="text" id="reg-holder" placeholder="예금주"></td></tr>
            <tr><th>계좌번호</th><td><input type="text" id="reg-account" placeholder="계좌번호 입력"></td><th>월변제금액</th><td><div style="display:flex;align-items:center;gap:4px;"><input type="text" id="reg-monthly-pay" placeholder="251,252" oninput="this.value=formatWon(this.value)" style="flex:1;"><span style="font-size:11px;">원</span></div></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>신용 및 기존 대출</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>신용점수</th><td><input type="text" id="reg-credit" placeholder="신용점수"></td><th>등급</th><td><input type="text" id="reg-grade" placeholder="등급 입력 (예: 5등급)"></td></tr>
            <tr><th>기존 대출</th><td colspan="3"><input type="text" id="reg-loans" placeholder="예: 신한은행 2,000만 (잔여 1,200만)" style="width:100%;"></td></tr>
          </tbody></table>
        </div></div>
      </div>

      <div style="width:300px;flex-shrink:0;">
        <div class="panel"><div class="panel-header"><h2>담당자 배정</h2></div>
          <div class="panel-body" style="padding:8px 10px;">
            <div class="form-group" style="margin-bottom:6px;">
              <label>담당자 <span class="required">*</span></label>
              <select id="reg-assigned" style="width:100%;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;"><option>선택하세요</option>${assignOptions}</select>
            </div>
            <div class="form-group">
              <label>초기 상태</label>
              <select id="reg-status" style="width:100%;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;"><option>리드</option><option>상담</option></select>
            </div>
          </div>
        </div>

        <div class="panel"><div class="panel-header"><h2>메모 / 상담 이력</h2><button class="btn btn-primary btn-sm" onclick="saveRegisterMemo()">기록 저장</button></div>
          <div class="panel-body" style="padding:8px 10px;">
            <div class="form-group" style="margin-bottom:6px;">
              <label>상담 채널</label>
              <select id="regChannel" style="width:100%;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;"><option>선택</option><option>전화</option><option>방문</option><option>카카오톡</option><option>문자</option></select>
            </div>
            <div class="form-group" style="margin-bottom:6px;">
              <label>메모</label>
              <textarea id="regMemo" rows="2" style="width:100%;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;font-size:12px;resize:none;height:60px;box-sizing:border-box;" placeholder="메모를 입력하면 상담 이력에 기록됩니다..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom:6px;">
              <label>다음 액션</label>
              <input type="text" id="regNextAction" style="width:100%;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;" placeholder="예: 03-28 서류 제출 확인">
            </div>
          </div>
          <div class="panel-body" style="padding:8px 10px;border-top:1px solid #e2e8f0;max-height:200px;overflow-y:auto;">
            <div class="timeline" id="regConsultTimeline">
              <div style="text-align:center;font-size:11px;color:#94a3b8;padding:10px 0;">기록 저장 시 여기에 이력이 표시됩니다.</div>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn btn-primary" style="flex:1;padding:8px;font-size:13px;" onclick="submitCustomerRegister()">고객 등록</button>
          <button class="btn btn-outline" style="padding:8px 14px;font-size:13px;" onclick="navigate('customer-register')">초기화</button>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// 상품 목록 렌더링 / 필터
// ========================================
function renderProductList(searchText, activeFilters) {
  searchText = (searchText || '').toLowerCase();
  activeFilters = activeFilters || [];

  return productCategories.map(cat => {
    let products = cat.products;

    // 검색 필터
    if (searchText) {
      products = products.filter(p => p.name.toLowerCase().includes(searchText) || p.desc.toLowerCase().includes(searchText));
    }

    // 태그 필터
    if (activeFilters.length > 0) {
      products = products.filter(p => {
        return activeFilters.some(f => {
          if (f === '직장인') return p.tags.some(t => t.includes('직장인'));
          if (f === '사업자') return p.tags.some(t => t.includes('사업자'));
          if (f === '오토론') return p.desc.includes('오토') || p.name.includes('오토');
          if (f === '부동산') return p.desc.includes('아파트') || p.desc.includes('부동산') || p.name.includes('담보');
          if (f === '회파복') return p.name.includes('회생') || p.name.includes('파산') || p.name.includes('회복');
          if (f === '채무통합') return p.desc.includes('채무통합') || p.desc.includes('대환');
          return p.tags.some(t => t.includes(f));
        });
      });
    }

    if (products.length === 0 && (searchText || activeFilters.length > 0)) return '';

    const isOpen = cat.open && !searchText && activeFilters.length === 0;
    return `
      <div class="product-category">
        <div class="product-cat-header" style="border-left:3px solid ${cat.color};" onclick="var b=this.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none';this.parentElement.classList.toggle('open')">
          <span>${cat.name} (${products.length})</span>
          <span class="arrow">&#9654;</span>
        </div>
        <div class="product-cat-body" ${isOpen || searchText || activeFilters.length > 0 ? '' : 'style="display:none;"'}>
          ${products.map(p => `
            <div class="product-item" onclick="selectProduct(this)" ondblclick="openProductGuide(this)" data-product-name="${p.name}" data-fidx="${p.fidx||''}" title="더블클릭: 상품 가이드 보기">
              <div class="product-name">${p.name}</div>
              <div class="product-tags">${p.tags.slice(0,4).map(t => `<span class="ptag">${t}</span>`).join('')}${p.tags.length > 4 ? `<span class="ptag">+${p.tags.length-4}</span>` : ''}</div>
              <div class="product-desc">${p.desc.split('\n')[0]}</div>
              ${p.manager ? `<div class="product-manager">상담사: ${p.manager}</div>` : ''}
              <div class="product-auth">[${p.auth || ''}]</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function filterProducts() {
  const search = (document.getElementById('productSearch')?.value || '').trim();
  const checks = [...document.querySelectorAll('#productFilters input:checked')].map(c => c.value);
  const list = document.getElementById('productList');
  if (list) list.innerHTML = renderProductList(search, checks);
}

// 고객 기반 상품 추천 렌더링
function renderRecommendations() {
  const container = document.getElementById('recommendedProducts');
  if (!container) return;

  // MySQL 고객 데이터 또는 인메모리
  const c = loanRegisterCustomerDB || (loanRegisterCustomerId ? customerData[loanRegisterCustomerId] : null);
  if (!c) { container.innerHTML = ''; return; }

  // 직업유형 → 상품 매칭 직군 변환
  const empType = c.employment_type || c.employmentType || '';
  const has4Ins = c.has_4_insurance || '';
  const jobTypeMap = {
    '정규직': has4Ins === '가입' ? '직장인(4대가입)' : '직장인(4대미가입)',
    '계약직': '직장인(4대미가입)',
    '프리랜서': '프리랜서', '자영업': '개인사업자', '개인사업자': '개인사업자',
    '무직': '무직', '주부': '주부'
  };

  // 대출 접수 폼에서 실시간 입력값 가져오기
  const getFormVal = (placeholder) => {
    const el = document.querySelector(`.form-table input[placeholder*="${placeholder}"]`);
    return el ? el.value.trim() : '';
  };
  const getFormSelect = (thText) => {
    const ths = document.querySelectorAll('.form-table th');
    for (const th of ths) {
      if (th.textContent.includes(thText)) {
        const select = th.nextElementSibling?.querySelector('select');
        if (select) return select.value;
        const input = th.nextElementSibling?.querySelector('input');
        if (input) return input.value.trim();
      }
    }
    return '';
  };

  // 폼 입력값 우선, 없으면 고객 DB
  const loanAmountForm = parseInt(getFormVal('1000')) || 0;
  const vehicleNoForm = getFormVal('차량번호') || c.vehicle_no || '';
  const vehicleYearForm = getFormSelect('차량연식') || c.vehicle_year || '';
  const vehicleKmForm = getFormVal('숫자') || c.vehicle_km || '';
  const recoveryForm = getFormSelect('회파복 구분') || c.recovery_type || '';

  const customer = {
    age: c.age || 0,
    jobType: jobTypeMap[empType] || '직장인(4대가입)',
    vehicleNo: vehicleNoForm,
    vehicleYear: parseInt(vehicleYearForm) || 0,
    vehicleKm: parseInt(String(vehicleKmForm).replace(/[^0-9]/g,'')) || 0,
    recoveryType: (recoveryForm === '==선택==' || recoveryForm === '선택') ? '무' : (recoveryForm || '무'),
    recoveryPaid: parseInt(c.recovery_paid_count || c.recoveryPaidCount || 0) || 0,
    recoveryTotal: parseInt(c.recovery_total_count || c.recoveryTotalCount || 0) || 0,
    hasProperty: (c.housing_ownership || '').includes('소유'),
    loanAmount: loanAmountForm
  };

  const result = matchProducts(customer);

  const totalRec = result.recommended.length + result.conditional.length;
  if (totalRec === 0) {
    container.innerHTML = `<div style="margin-bottom:8px;padding:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:11px;color:#991b1b;">
      조건에 맞는 추천 상품이 없습니다. 고객 정보를 확인하세요.
    </div>`;
    return;
  }

  // 카테고리별 분류
  const allRec = [...result.recommended, ...result.conditional];
  const isRecovery = (r) => r.category?.includes('회복') || r.category?.includes('회생') || r.category?.includes('파산') || r.name?.includes('회생') || r.name?.includes('파산') || r.name?.includes('회복');
  const isAuto = (r) => r.category?.includes('오토') || r.name?.includes('오토') || r.name?.includes('차량');
  const isProperty = (r) => r.category?.includes('부동산') || r.name?.includes('부동산') || r.name?.includes('담보');
  const isSunshine = (r) => r.category?.includes('햇살') || r.name?.includes('햇살') || r.name?.includes('사잇돌');
  const categories = {
    '전체': allRec,
    '신용': allRec.filter(r => !isAuto(r) && !isProperty(r) && !isRecovery(r) && !isSunshine(r)),
    '오토론': allRec.filter(r => isAuto(r)),
    '부동산': allRec.filter(r => isProperty(r)),
    '회파복': allRec.filter(r => isRecovery(r)),
    '햇살론': allRec.filter(r => isSunshine(r)),
  };
  // 비어있는 카테고리 제거
  const activeCats = Object.entries(categories).filter(([k,v]) => v.length > 0);

  let html = `<div style="margin-bottom:8px;padding:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
    <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:6px;">
      ★ ${c.name}님 추천 상품 (${totalRec}개)
      <span style="font-size:10px;font-weight:400;color:#64748b;margin-left:8px;">${customer.jobType} | ${customer.age}세 | 회파복:${customer.recoveryType}${customer.recoveryPaid ? '('+customer.recoveryPaid+'/'+customer.recoveryTotal+'회차)' : ''}${customer.vehicleNo ? ' | 차량보유' : ''}${customer.loanAmount ? ' | '+customer.loanAmount+'만' : ''}</span>
    </div>
    <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;">
      ${activeCats.map(([cat, items]) => `<button onclick="window._recCat='${cat}';renderRecommendations();" style="padding:2px 8px;border:1px solid ${(window._recCat||'전체')===cat?'#16a34a':'#d1d5db'};background:${(window._recCat||'전체')===cat?'#dcfce7':'#fff'};border-radius:12px;font-size:10px;cursor:pointer;color:${(window._recCat||'전체')===cat?'#166534':'#64748b'};">${cat} (${items.length})</button>`).join('')}
    </div>`;

  const selectedCat = window._recCat || '전체';
  const filteredRec = (categories[selectedCat] || allRec).filter(r => result.recommended.includes(r));
  const filteredCond = (categories[selectedCat] || allRec).filter(r => result.conditional.includes(r));

  // 추천 상품 (★)
  filteredRec.forEach(r => {
    html += `<div class="product-item" onclick="selectProduct(this)" ondblclick="openProductGuide(this)" data-product-name="${r.name}" data-fidx="${r.fidx}" title="더블클릭: 상품 가이드" style="border-left:3px solid #16a34a;margin-bottom:3px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="product-name" style="margin:0;">${r.name}</span>
        <span style="font-size:10px;color:#16a34a;font-weight:700;">★ ${r.matchRate}%</span>
      </div>
      <div style="font-size:9px;color:#64748b;">${r.reasons.join(' | ')}</div>
      <div style="font-size:9px;color:#94a3b8;">${r.notes}</div>
    </div>`;
  });

  // 조건부 상품 (△)
  filteredCond.forEach(r => {
    html += `<div class="product-item" onclick="selectProduct(this)" ondblclick="openProductGuide(this)" data-product-name="${r.name}" data-fidx="${r.fidx}" title="더블클릭: 상품 가이드" style="border-left:3px solid #d97706;margin-bottom:3px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="product-name" style="margin:0;">${r.name}</span>
        <span style="font-size:10px;color:#d97706;font-weight:700;">△ ${r.matchRate}%</span>
      </div>
      <div style="font-size:9px;color:#d97706;">${r.failReasons.join(' | ')}</div>
      <div style="font-size:9px;color:#94a3b8;">${r.notes}</div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

function selectProduct(el) {
  document.querySelectorAll('.product-item').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
}

// ========================================
// 론앤마스터 크롤러 연동
// ========================================
let crawlerLoggedIn = false;

async function crawlerLogin() {
  const userId = prompt('론앤마스터 아이디:');
  if (!userId) return;
  const password = prompt('론앤마스터 비밀번호:');
  if (!password) return;

  try {
    const res = await fetch('/api/crawler/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password })
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { alert('서버 응답을 처리할 수 없습니다.'); return; }
    if (data.success) {
      crawlerLoggedIn = true;
      updateCrawlerUI(true);
      alert('론앤마스터 로그인 성공');
    } else {
      alert('연동 실패: ' + (data.message || '알 수 없는 오류'));
    }
  } catch (e) {
    alert('서버 연결 실패: ' + e.message);
  }
}

// 헤더에서 론앤마스터 연동
async function headerCrawlerLogin() {
  if (crawlerLoggedIn) {
    if (confirm('론앤마스터 연동을 해제하시겠습니까?')) {
      await fetch('/api/crawler/close', { method: 'POST' });
      crawlerLoggedIn = false;
      updateCrawlerUI(false);
    }
  } else {
    await crawlerLogin();
  }
}

// 헤더 연동 상태 UI 업데이트
function updateCrawlerUI(connected) {
  const el = document.getElementById('crawlerStatus');
  const dot = document.getElementById('crawlerDot');
  const label = document.getElementById('crawlerLabel');
  if (!el) return;
  if (connected) {
    el.style.background = '#f0fdf4';
    el.style.borderColor = '#bbf7d0';
    el.style.color = '#166534';
    dot.style.background = '#16a34a';
    label.textContent = '론앤마스터: 연결됨';
  } else {
    el.style.background = '#fef2f2';
    el.style.borderColor = '#fecaca';
    el.style.color = '#991b1b';
    dot.style.background = '#ef4444';
    label.textContent = '론앤마스터: 미연결';
  }
}

// 페이지 로드 시 연동 상태 자동 확인
setTimeout(async () => {
  const ok = await checkCrawlerStatus();
  updateCrawlerUI(ok);
}, 500);

async function checkCrawlerStatus() {
  try {
    const res = await fetch('/api/crawler/status');
    if (!res.ok) return false;
    const text = await res.text();
    if (text.startsWith('<')) return false;
    const data = JSON.parse(text);
    crawlerLoggedIn = data.data?.isLoggedIn || false;
    return crawlerLoggedIn;
  } catch (e) {
    return false;
  }
}

// 상품 더블클릭 → 가이드 팝업
async function openProductGuide(el) {
  const productName = el.dataset.productName;
  const fidx = el.dataset.fidx;

  // fidx가 있으면 바로 가이드 가져오기 시도
  if (fidx && fidx !== '' && fidx !== 'undefined') {
    try {
      showGuideModal(productName, { loading: true });
      const res = await fetch('/api/crawler/product-guide/' + fidx);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { showGuideModal(productName, null); return; }
      if (data.success && data.data && data.data.body) {
        showGuideModal(productName, data.data);
      } else {
        showGuideModal(productName, null);
      }
    } catch (e) {
      showGuideModal(productName, null);
    }
  } else {
    showGuideModal(productName, null);
  }
}

function showGuideModal(productName, guideData) {
  const old = document.getElementById('guideModal');
  if (old) old.remove();

  let content = '';

  if (!guideData) {
    content = `
      <div style="text-align:center;padding:30px 20px;">
        <div style="font-size:14px;color:#475569;margin-bottom:16px;">론앤마스터 연동이 필요합니다.</div>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:16px;">상품 가이드를 보려면 론앤마스터에 로그인하세요.</p>
        <button class="btn btn-primary" onclick="closeGuideModal();crawlerLogin();">론앤마스터 로그인</button>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">또는 론앤마스터에서 직접 확인:</div>
          <button class="btn btn-outline btn-sm" onclick="window.open('https://lmaster.kr/jisa/login.asp','_blank')">론앤마스터 바로가기</button>
        </div>
      </div>
    `;
  } else if (guideData.loading) {
    content = `<div style="text-align:center;padding:40px;font-size:13px;color:#64748b;">상품 가이드를 불러오는 중...</div>`;
  } else if (guideData.error) {
    content = `<div style="text-align:center;padding:30px;font-size:13px;color:#ef4444;">오류: ${guideData.error}</div>`;
  } else {
    // 본문을 기본가이드 / 참고사항으로 분리
    const body = guideData.body || '';
    let leftContent = body;
    let rightContent = '';

    // *참고사항* 또는 *참고사항* 기준으로 분리
    const refIdx = body.indexOf('*참고사항*');
    if (refIdx !== -1) {
      leftContent = body.substring(0, refIdx);
      rightContent = body.substring(refIdx);
    }

    const formatLines = (text) => text.split('\n').filter(l => l.trim()).map(l => {
      // 색상 강조
      if (l.includes('★') || l.includes('📢') || l.includes('📌')) {
        return `<div style="font-size:12px;line-height:1.7;color:#c53030;font-weight:600;">${l}</div>`;
      }
      if (l.startsWith('▣') || l.startsWith('■') || l.includes('기본가이드')) {
        return `<div style="font-size:13px;line-height:1.7;color:#1e293b;font-weight:700;margin-top:8px;">${l}</div>`;
      }
      return `<div style="font-size:11px;line-height:1.7;color:#334155;">${l}</div>`;
    }).join('');

    const files = (guideData.buttons || []).filter(b => b !== '닫기' && b !== '🔍').map(f =>
      `<span style="display:inline-block;margin:2px 3px;padding:3px 8px;background:#3b82f6;color:#fff;border-radius:4px;font-size:10px;cursor:pointer;">${f}</span>`
    ).join('');

    content = `
      <div style="padding:10px 14px;">
        ${files ? `<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">파일: ${files}</div>` : ''}
      </div>
      <div style="display:flex;gap:1px;background:#e2e8f0;max-height:70vh;">
        <div style="flex:1;padding:12px;overflow-y:auto;background:#fff;">
          <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #334155;">기본가이드</div>
          ${formatLines(leftContent)}
        </div>
        <div style="flex:1;padding:12px;overflow-y:auto;background:#fff;">
          <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #334155;">참고사항</div>
          ${rightContent ? formatLines(rightContent) : '<div style="font-size:12px;color:#94a3b8;">참고사항 없음</div>'}
        </div>
      </div>
      <div style="padding:6px 14px;font-size:10px;color:#94a3b8;background:#fff;">수집: ${guideData.fetchedAt || ''}</div>
    `;
  }

  const modal = document.createElement('div');
  modal.id = 'guideModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="search-modal" style="max-width:1100px;">
      <div class="modal-header">
        <h2 style="font-size:15px;font-weight:700;">${productName} - 상품 가이드</h2>
        <button class="modal-close" onclick="closeGuideModal()">&times;</button>
      </div>
      ${content}
    </div>
  `;

  document.body.appendChild(modal);
  addModalClose(modal, closeGuideModal);
}

function closeGuideModal() {
  const modal = document.getElementById('guideModal');
  if (modal) modal.remove();
}

// fidx 자동 수집
async function collectFidxMap() {
  const agentNo = prompt('론앤마스터 에이전트 번호 (URL의 no= 값):', '12');
  if (!agentNo) return;
  const upw = prompt('upw 값:', '1');
  if (!upw) return;

  try {
    const res = await fetch('/api/crawler/product-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentNo, upw })
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { alert('응답 파싱 실패'); return; }

    if (data.success && data.data && data.data.length > 0) {
      // 결과를 팝업으로 표시
      const items = data.data;
      let html = `<div style="padding:16px;max-height:70vh;overflow-y:auto;">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">수집 결과: ${items.length}개 상품</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:12px;">아래 데이터를 복사하여 products.js에 fidx를 매핑하세요.</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">상품명</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">fidx</th></tr></thead>
          <tbody>`;
      items.forEach(item => {
        html += `<tr><td style="padding:3px 8px;font-size:11px;border-bottom:1px solid #f1f5f9;">${item.name}</td><td style="padding:3px 8px;font-size:11px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#3b82f6;">${item.fidx}</td></tr>`;
      });
      html += `</tbody></table>
        <div style="margin-top:12px;">
          <textarea id="fidxJsonOutput" rows="4" style="width:100%;font-size:10px;border:1px solid #e2e8f0;border-radius:4px;padding:6px;font-family:monospace;" readonly>${JSON.stringify(items, null, 0)}</textarea>
          <button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="document.getElementById('fidxJsonOutput').select();document.execCommand('copy');alert('복사됨!');">JSON 복사</button>
        </div>
      </div>`;

      const old = document.getElementById('guideModal');
      if (old) old.remove();
      const modal = document.createElement('div');
      modal.id = 'guideModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="search-modal" style="max-width:700px;">
          <div class="modal-header">
            <h2 style="font-size:15px;font-weight:700;">상품 fidx 매핑 결과</h2>
            <button class="modal-close" onclick="closeGuideModal()">&times;</button>
          </div>
          ${html}
        </div>`;
      document.body.appendChild(modal);
      addModalClose(modal, closeGuideModal);
    } else {
      alert('수집 실패: ' + (data.message || '결과 없음'));
    }
  } catch (e) {
    alert('수집 오류: ' + e.message);
  }
}

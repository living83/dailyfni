// ========================================
// 대부중개 전산시스템 - 프론트엔드 앱
// ========================================

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
    if (id && customerData[id]) {
      currentLedgerId = id;
      document.title = customerData[id].name + ' - 고객원장';
      // 사이드바 숨기고 메인 영역 전체 사용
      document.getElementById('sidebar').style.display = 'none';
      document.querySelector('.main-wrapper').style.marginLeft = '0';
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
    setTimeout(() => renderRecommendations(), 50);
  }
}

// ========================================
// 1. 대시보드
// ========================================
function renderDashboard() {
  return `
    <div id="intakeCard"></div>
    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">이번 달 신규 고객</div>
        <div class="value">127</div>
        <div class="change up">+12.5% vs 전월</div>
      </div>
      <div class="stat-card">
        <div class="label">대출 접수 건</div>
        <div class="value">84</div>
        <div class="change up">+8.2% vs 전월</div>
      </div>
      <div class="stat-card">
        <div class="label">대출 실행 건</div>
        <div class="value">52</div>
        <div class="change down">-3.1% vs 전월</div>
      </div>
      <div class="stat-card">
        <div class="label">이번 달 매출</div>
        <div class="value">4,820만</div>
        <div class="change up">+15.3% vs 전월</div>
      </div>
      <div class="stat-card">
        <div class="label">실행률</div>
        <div class="value">61.9%</div>
        <div class="change up">+2.4%p vs 전월</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <h2>대출 상태별 현황</h2>
        </div>
        <div class="panel-body">
          <table>
            <thead><tr><th>상태</th><th>건수</th><th>비율</th></tr></thead>
            <tbody>
              <tr><td><span class="badge badge-lead">리드</span></td><td>23</td><td>27.4%</td></tr>
              <tr><td><span class="badge badge-consult">상담</span></td><td>15</td><td>17.9%</td></tr>
              <tr><td><span class="badge badge-submit">접수</span></td><td>12</td><td>14.3%</td></tr>
              <tr><td><span class="badge badge-review">심사중</span></td><td>8</td><td>9.5%</td></tr>
              <tr><td><span class="badge badge-approved">승인</span></td><td>14</td><td>16.7%</td></tr>
              <tr><td><span class="badge badge-rejected">부결</span></td><td>5</td><td>6.0%</td></tr>
              <tr><td><span class="badge badge-executed">실행</span></td><td>7</td><td>8.3%</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <h2>DB 출처별 유입 현황</h2>
        </div>
        <div class="panel-body">
          <table>
            <thead><tr><th>출처</th><th>유입</th><th>실행</th><th>전환율</th></tr></thead>
            <tbody>
              <tr><td>네이버 광고</td><td>38</td><td>18</td><td>47.4%</td></tr>
              <tr><td>카카오 DB</td><td>25</td><td>14</td><td>56.0%</td></tr>
              <tr><td>자체 DB</td><td>20</td><td>12</td><td>60.0%</td></tr>
              <tr><td>소개/추천</td><td>15</td><td>5</td><td>33.3%</td></tr>
              <tr><td>기타</td><td>29</td><td>3</td><td>10.3%</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>최근 대출 신청</h2>
        <button class="btn btn-outline btn-sm" onclick="navigate('loans')">전체보기</button>
      </div>
      <div class="panel-body">
        <table>
          <thead><tr><th>신청일</th><th>고객명</th><th>연락처</th><th>대출금액</th><th>상태</th><th>담당자</th></tr></thead>
          <tbody>
            <tr><td>2026-03-26</td><td>박지영</td><td>010-1234-5678</td><td>3,000만</td><td><span class="badge badge-submit">접수</span></td><td>김대리</td></tr>
            <tr><td>2026-03-25</td><td>이승호</td><td>010-9876-5432</td><td>5,000만</td><td><span class="badge badge-review">심사중</span></td><td>이과장</td></tr>
            <tr><td>2026-03-25</td><td>최민수</td><td>010-5555-1234</td><td>2,000만</td><td><span class="badge badge-approved">승인</span></td><td>김대리</td></tr>
            <tr><td>2026-03-24</td><td>정하나</td><td>010-3333-7890</td><td>1,500만</td><td><span class="badge badge-executed">실행</span></td><td>박사원</td></tr>
            <tr><td>2026-03-24</td><td>한동욱</td><td>010-7777-4321</td><td>4,000만</td><td><span class="badge badge-rejected">부결</span></td><td>이과장</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
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
    const ssnFront = (c.ssn||'').substring(0,6);
    const loanDate = c.loan_date ? new Date(c.loan_date).toISOString().split('T')[0] : '-';
    const score = c.credit_score || 0;
    return `<tr>
      <td>${c.id}</td>
      <td><a href="#" class="customer-link" onclick="viewCustomer(${c.id});return false;">${c.name}</a></td>
      <td>${ssnFront}</td>
      <td>${creditStatusBadge(c.credit_status)}</td>
      <td style="color:${score>=700?'#16a34a':score>=600?'#d97706':'#ef4444'};font-weight:600;">${score}</td>
      <td>${c.total_debt||'-'}</td>
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
            <tr><th>No</th><th>고객명</th><th>주민번호</th><th>신용상태</th><th>신용점수</th><th>총채무</th><th>대출일자</th><th>대출금액</th><th>진행상태</th><th>담당자</th><th>DB출처</th><th>관리</th></tr>
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

function goLoanRegister(customerId) {
  closeCustomerModal();
  loanRegisterCustomerId = customerId;
  navigate('loan-register');
}

function renderLoanRegister() {
  const c = loanRegisterCustomerId ? customerData[loanRegisterCustomerId] : null;

  // 고객 데이터에서 파생값 계산
  const birthFromSsn = c ? c.ssn.substring(0,6) : '';
  const genderChar = c ? c.ssn.charAt(7) : '';
  const genderFromSsn = {'1':'남(1)','2':'여(2)','3':'남(3)','4':'여(4)'}[genderChar] || '';
  const phoneParts = c ? c.phone.split('-') : ['','',''];
  const salaryYear = c ? c.salary : '';
  const salaryMonth = c ? Math.round(c.salary / 12) : '';

  const sel = (opts, val) => opts.map(o => `<option${o===val?' selected':''}>${o}</option>`).join('');
  const ro = c ? 'readonly style="background:#f1f5f9;"' : '';

  return `
    ${c ? `<div class="panel" style="border-left:3px solid #3b82f6;margin-bottom:12px;">
      <div class="panel-body" style="padding:10px 18px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:13px;"><strong>연동 고객:</strong> ${c.name} (${c.phone}) | ${c.company} | 연봉 ${c.salary.toLocaleString()}만원 | 신용 ${c.creditScore}점</div>
        <button class="btn btn-outline btn-sm" onclick="loanRegisterCustomerId=null;navigate('loan-register');">연동 해제</button>
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
                  <select style="width:80px;" ${c?'disabled style="background:#f1f5f9;width:80px;"':''}>${sel(['통신사()','SK','KT','LGU+','알뜰','SK알뜰','KT알뜰','LG알뜰','기타'], '')}</select>
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
              <td><select>${sel(['==선택==','네이버 광고','카카오 DB','자체 DB','소개/추천','기타'], c ? c.dbSource : '==선택==')}</select></td>
            </tr>
            <tr>
              <th>실거주지주소 <span class="required">*</span></th>
              <td colspan="5">
                <div style="display:flex;gap:4px;align-items:center;">
                  <input type="text" id="lr-addr-zone" style="width:60px;" placeholder="우편번호" readonly>
                  <button class="btn btn-sm btn-primary" onclick="openAddrSearch('lr-addr')">주소 검색</button>
                  <input type="text" id="lr-addr-road" style="flex:1;" placeholder="도로명주소" value="${c ? c.address : ''}" readonly>
                  <input type="text" id="lr-addr-detail" style="width:150px;" placeholder="상세주소">
                </div>
              </td>
            </tr>
            <tr>
              <th>주거종류</th>
              <td colspan="2"><select>${sel(['==선택==','자가','전세','월세','기숙사','기타'], '')}</select></td>
              <th>주택소유구분</th>
              <td colspan="2"><select>${sel(['==선택==','본인소유','배우자소유','가족소유','무주택','기타'], '')}</select></td>
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
                  <input type="text" id="lr-waddr-road" style="flex:1;" placeholder="도로명주소" value="${c ? c.companyAddr : ''}" readonly>
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
              <td colspan="2"><input type="text" placeholder="띄어쓰기 없이 차량번호만 기재 (ex:123가4567)"></td>
              <th>차량명</th>
              <td colspan="2"><input type="text" placeholder=""></td>
            </tr>
            <tr>
              <th>차량연식</th>
              <td colspan="2"><select>${sel(['==선택==','2026','2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015','기타'], '')}</select></td>
              <th>주행거리</th>
              <td colspan="2">
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="text" placeholder="숫자로만 입력요망 (ex:5만키로 → 50000라고만 입력)">
                  <span style="font-size:12px;color:#64748b;">km</span>
                </div>
              </td>
            </tr>
            <tr>
              <th>차량소유구분</th>
              <td colspan="2"><select>${sel(['==선택==','소유(본인)','소유(공동명의대표)','소유(공동명의)','미소유'], '')}</select></td>
              <th>공동명의자명</th>
              <td colspan="2"><input type="text" placeholder=""></td>
            </tr>
          </tbody>
        </table>

        <!-- 회파복 -->
        <div class="form-section-title" style="color:#c53030;">회파복 - <span style="font-size:11px;">(*회복자의경우 법원명 항목만 기재, ※신협5619~시작하는 계좌는 환급계좌가 아니오니 유의하시기 바랍니다.)</span></div>
        <table class="form-table">
          <tbody>
            <tr>
              <th>회파복 구분</th>
              <td colspan="5"><select>${sel(['==선택==','회생','파산','회복','무'], '')}</select></td>
            </tr>
            <tr>
              <th>법원명</th>
              <td colspan="2"><input type="text" placeholder="회복자의 경우 신용회복위원회 라고 기재" value="${c ? c.courtName : ''}" ${c&&c.courtName ? ro : ''}></td>
              <th>사건번호</th>
              <td colspan="2">
                <div style="display:flex;gap:4px;align-items:center;">
                  <input type="text" style="width:60px;" placeholder="0000" value="${c&&c.caseNo ? c.caseNo.substring(0,4) : ''}">
                  <select style="width:70px;">${sel(['선택','가단','가합','개회','개파','기타'], c&&c.caseNo ? '' : '선택')}</select>
                  <input type="text" style="width:80px;" placeholder="" value="${c&&c.caseNo ? c.caseNo.replace(/[^0-9]/g,'').substring(4) : ''}">
                </div>
              </td>
            </tr>
            <tr>
              <th>환급은행 <span class="required">*</span></th>
              <td colspan="2"><select>${sel(['==선택==','국민은행','신한은행','우리은행','하나은행','농협은행','카카오뱅크','토스뱅크','기업은행','SC제일','씨티','기타'], c ? c.refundBank : '==선택==')}</select></td>
              <th>환급은행계좌</th>
              <td colspan="2"><input type="text" placeholder="계좌번호 입력" value="${c ? c.refundAccount : ''}" ${c&&c.refundAccount ? ro : ''}></td>
            </tr>
            <tr>
              <th>월변제금액</th>
              <td colspan="3"><div style="display:flex;align-items:center;gap:4px;"><input type="text" placeholder="" style="width:200px;"> <span style="font-size:12px;color:#64748b;">만원</span></div></td>
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
      <button class="btn btn-primary" style="padding:10px 32px;font-size:14px;">접수 등록</button>
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

function renderSettlementSales() {
  return `
    <div class="filter-bar">
      <select><option>2026년 3월</option><option>2026년 2월</option><option>2026년 1월</option></select>
      <select><option>전체 출처</option><option>네이버 광고</option><option>카카오 DB</option><option>자체 DB</option></select>
      <button class="btn btn-primary">조회</button>
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="label">이번 달 총 매출</div><div class="value">4,820만</div></div>
      <div class="stat-card"><div class="label">총 수수료</div><div class="value">381.5만</div></div>
      <div class="stat-card"><div class="label">리베이트 합계</div><div class="value">${settlementRebateData.length > 0 ? settlementRebateData.filter(r=>r.type==='리베이트').reduce((s,r)=>s+parseFloat(r.amount||0),0).toFixed(1)+'만' : '120만'}</div></div>
      <div class="stat-card"><div class="label">환수 합계</div><div class="value">${settlementRebateData.length > 0 ? settlementRebateData.filter(r=>r.type==='환수').reduce((s,r)=>s+parseFloat(r.amount||0),0).toFixed(1)+'만' : '85만'}</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>실행 건별 매출 내역</h2>
        <span style="font-size:11px;color:#94a3b8;">정산 기준: 실행 완료 건</span>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table>
          <thead><tr><th>실행일</th><th>고객명</th><th>대출금액</th><th>수수료율</th><th>수수료</th><th>DB 출처</th><th>담당자</th></tr></thead>
          <tbody>
            <tr><td>03-25</td><td>정하나</td><td>1,500만</td><td>3.5%</td><td>52.5만</td><td>소개/추천</td><td>박사원</td></tr>
            <tr><td>03-24</td><td>송미영</td><td>3,200만</td><td>3.0%</td><td>96.0만</td><td>네이버 광고</td><td>김대리</td></tr>
            <tr><td>03-23</td><td>오진우</td><td>2,800만</td><td>3.5%</td><td>98.0만</td><td>카카오 DB</td><td>이과장</td></tr>
            <tr><td>03-22</td><td>임수현</td><td>4,500만</td><td>3.0%</td><td>135.0만</td><td>자체 DB</td><td>김대리</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSettlementRebate() {
  return `
    <div class="panel">
      <div class="panel-header">
        <h2>리베이트/환수 엑셀 업로드</h2>
      </div>
      <div class="panel-body" style="padding:16px;">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
          ${isAdmin() ? '<input type="file" id="rebateFile" accept=".xlsx,.xls,.csv" multiple onchange="parseRebateExcel(this)">' : '<span style="font-size:12px;color:#94a3b8;">관리자만 업로드 가능합니다.</span>'}
          <span style="font-size:11px;color:#94a3b8;">론앤마스터에서 받은 리베이트/환수 엑셀 파일을 업로드하세요 (.xlsx, .csv)</span>
        </div>
        <div style="font-size:11px;color:#64748b;background:#f8fafc;padding:8px 12px;border-radius:4px;margin-bottom:12px;">
          엑셀 컬럼 예시: 구분(리베이트/환수) | 금액 | 사유 | 적용월 | 관련 실행건 | 담당자
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>리베이트/환수 내역 (${settlementRebateData.length}건)</h2>
        <button class="btn btn-outline btn-sm">엑셀 내보내기</button>
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
  return `
    <div class="panel">
      <div class="panel-header">
        <h2>정산 정책 엑셀 업로드</h2>
      </div>
      <div class="panel-body" style="padding:16px;">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
          ${isAdmin() ? '<input type="file" id="policyFile" accept=".xlsx,.xls,.csv" multiple onchange="parsePolicyExcel(this)">' : '<span style="font-size:12px;color:#94a3b8;">관리자만 업로드 가능합니다.</span>'}
          <span style="font-size:11px;color:#94a3b8;">론앤마스터에서 받은 정산 정책 엑셀 파일을 업로드하세요 (.xlsx, .csv)</span>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>현재 적용 정산 정책 (${settlementPolicyData.length}건)</h2>
        <button class="btn btn-outline btn-sm">엑셀 내보내기</button>
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
    await fetch('/api/settlement/policies/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policies: data })
    });
  } catch (e) { console.error('정산 정책 저장 실패:', e); }
}

async function saveAdjustmentsToDB(data) {
  try {
    await fetch('/api/settlement/adjustments/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustments: data })
    });
  } catch (e) { console.error('리베이트/환수 저장 실패:', e); }
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

function renderSettlementClose() {
  return `
    <div class="panel">
      <div class="panel-header"><h2>월 마감 처리</h2></div>
      <div class="panel-body" style="padding:16px;">
        <div class="stat-cards" style="margin-bottom:16px;">
          <div class="stat-card"><div class="label">마감 대상월</div><div class="value">2026년 3월</div></div>
          <div class="stat-card"><div class="label">마감 상태</div><div class="value" style="color:#d97706;">미마감</div></div>
          <div class="stat-card"><div class="label">실행 건수</div><div class="value">4건</div></div>
          <div class="stat-card"><div class="label">총 매출</div><div class="value">4,820만</div></div>
        </div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;margin-bottom:16px;">
          <div style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:4px;">마감 전 확인사항</div>
          <ul style="font-size:11px;color:#92400e;margin-left:16px;line-height:1.8;">
            <li>모든 실행 건의 수수료율이 정확한지 확인</li>
            <li>리베이트/환수 내역이 모두 반영되었는지 확인</li>
            <li>정산 정책(수수료율)이 최신인지 확인</li>
            <li>마감 후에는 관리자만 수정 가능</li>
          </ul>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="alert('마감 처리는 백엔드 연동 후 활성화됩니다.')">2026년 3월 마감 처리</button>
          <button class="btn btn-outline" disabled>마감 해제 (최고관리자)</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>마감 이력</h2></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>대상월</th><th>마감일시</th><th>마감자</th><th>실행건수</th><th>총매출</th><th>상태</th></tr></thead>
          <tbody>
            <tr><td>2026년 2월</td><td>2026-03-05 10:00</td><td>박팀장</td><td>48건</td><td>3,920만</td><td><span class="badge badge-approved">마감완료</span></td></tr>
            <tr><td>2026년 1월</td><td>2026-02-03 09:30</td><td>박팀장</td><td>52건</td><td>4,150만</td><td><span class="badge badge-approved">마감완료</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
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
function renderPerformance() {
  return `
    <div class="filter-bar">
      <select><option>2026년 3월</option><option>2026년 2월</option></select>
      <select><option>월간</option><option>주간</option></select>
      <button class="btn btn-primary">조회</button>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h2>DB 출처별 성과</h2></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>출처</th><th>유입</th><th>접수</th><th>실행</th><th>전환율</th><th>매출</th></tr></thead>
            <tbody>
              <tr><td>네이버 광고</td><td>38</td><td>28</td><td>18</td><td>47.4%</td><td>1,820만</td></tr>
              <tr><td>카카오 DB</td><td>25</td><td>20</td><td>14</td><td>56.0%</td><td>1,450만</td></tr>
              <tr><td>자체 DB</td><td>20</td><td>16</td><td>12</td><td>60.0%</td><td>980만</td></tr>
              <tr><td>소개/추천</td><td>15</td><td>10</td><td>5</td><td>33.3%</td><td>420만</td></tr>
              <tr><td>기타</td><td>29</td><td>10</td><td>3</td><td>10.3%</td><td>150만</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>직원별 성과</h2></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>직원</th><th>접수</th><th>실행</th><th>실행률</th><th>매출</th><th>수당</th></tr></thead>
            <tbody>
              <tr><td>김대리</td><td>32</td><td>22</td><td>68.8%</td><td>2,150만</td><td>860만</td></tr>
              <tr><td>이과장</td><td>28</td><td>18</td><td>64.3%</td><td>1,680만</td><td>672만</td></tr>
              <tr><td>박사원</td><td>24</td><td>12</td><td>50.0%</td><td>990만</td><td>396만</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
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
    document.title = customerData[id].name + ' - 고객원장';
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
  ledgerEditMode = !ledgerEditMode;
  const fields = document.querySelectorAll('#ledgerForm input, #ledgerForm textarea, #ledgerForm select');
  fields.forEach(f => {
    if (f.dataset.alwaysReadonly) return;
    if (ledgerEditMode) {
      f.removeAttribute('readonly');
      f.removeAttribute('disabled');
      f.style.background = '#fff';
      f.style.borderColor = '#3b82f6';
    } else {
      f.setAttribute('readonly', true);
      f.style.background = '#f8fafc';
      f.style.borderColor = '#e2e8f0';
    }
  });
  document.getElementById('ledgerEditBtn').style.display = ledgerEditMode ? 'none' : '';
  document.getElementById('ledgerSaveBtn').style.display = ledgerEditMode ? '' : 'none';
  document.getElementById('ledgerCancelBtn').style.display = ledgerEditMode ? '' : 'none';
}

function saveLedger() {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const histDiv = document.getElementById('ledgerChangeHistory');
  if (histDiv) {
    const newItem = document.createElement('div');
    newItem.className = 'timeline-item';
    newItem.innerHTML = `<div class="tl-date">${ts}</div><div class="tl-content">고객 원장 정보 수정</div><div class="tl-user">처리: 김대리</div>`;
    histDiv.insertBefore(newItem, histDiv.firstChild);
  }
  // 읽기 전용으로 복원
  ledgerEditMode = true;
  toggleLedgerEdit();
  alert('저장되었습니다.');
}

function saveLedgerMemo(customerId) {
  const textarea = document.getElementById('ledgerMemo');
  const content = textarea.value.trim();
  if (!content) { alert('메모를 입력하세요.'); return; }

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const timeline = document.getElementById('ledgerConsultTimeline');
  if (timeline) {
    const newItem = document.createElement('div');
    newItem.className = 'timeline-item';
    newItem.innerHTML = `<div class="tl-date">${ts}</div><div class="tl-content">${content}</div><div class="tl-user">메모 | 김대리</div>`;
    timeline.insertBefore(newItem, timeline.firstChild);
  }
  textarea.value = '';
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

function renderCustomerLedger() {
  ledgerEditMode = false;
  const c = currentLedgerId ? customerData[currentLedgerId] : null;
  if (!c) return '<div class="empty-state"><div class="icon">&#128566;</div><p>고객 정보를 찾을 수 없습니다.</p></div>';

  const gender = c.ssn.charAt(7)==='1'||c.ssn.charAt(7)==='3'?'남':'여';
  const creditColor = c.creditScore>=700?'#16a34a':c.creditScore>=600?'#d97706':'#ef4444';
  const creditGrade = c.creditScore>=700?'양호':c.creditScore>=600?'보통':'주의';
  const statusMap = {'리드':'badge-lead','상담':'badge-consult','접수':'badge-submit','심사중':'badge-review','승인':'badge-approved','부결':'badge-rejected','실행':'badge-executed','종결':'badge-closed'};
  const badgeClass = statusMap[c.status] || 'badge-lead';
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
        <div style="font-size:15px;font-weight:700;">${c.name} <span class="badge ${badgeClass}" style="font-size:11px;vertical-align:middle;">${c.status}</span> <span style="font-size:11px;color:#94a3b8;">No.${currentLedgerId}</span></div>
        <div style="font-size:11px;color:#64748b;">담당: ${c.assignedTo} | 출처: ${c.dbSource} | 등록일: ${c.regDate}</div>
      </div>
    </div>

    <div id="ledgerForm" style="display:flex;gap:8px;align-items:flex-start;max-width:1305px;">
      <div style="flex:1;min-width:0;">
        <div class="panel"><div class="panel-header"><h2>인적 사항</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>고객명</th><td><input type="text" value="${c.name}" ${ro}></td><th>주민등록번호</th><td><input type="text" value="${c.ssn}" ${ro}></td></tr>
            <tr><th>만 나이</th><td><input type="text" value="${c.age}세" data-always-readonly="1" readonly style="background:#f1f5f9;border-color:#e2e8f0;"></td><th>성별</th><td><input type="text" value="${gender}" data-always-readonly="1" readonly style="background:#f1f5f9;border-color:#e2e8f0;"></td></tr>
            <tr><th>휴대전화</th><td><input type="text" value="${c.phone}" ${ro}></td><th>보조 연락처</th><td><input type="text" value="${c.phone2 || '-'}" ${ro}></td></tr>
            <tr><th>이메일</th><td><input type="text" value="${c.email}" ${ro}></td><th>DB 유입출처</th><td><input type="text" value="${c.dbSource}" ${ro}></td></tr>
            <tr><th>초본 주소</th><td colspan="3"><input type="text" value="${c.residenceAddress}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
            <tr><th>실거주 주소</th><td colspan="3"><input type="text" value="${c.address}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>직장 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>직장명</th><td><input type="text" value="${c.company}" ${ro}></td><th>고용형태</th><td><input type="text" value="${c.employmentType}" ${ro}></td></tr>
            <tr><th>직장 주소</th><td colspan="3"><input type="text" value="${c.companyAddr}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
            <tr><th>직장 전화</th><td><input type="text" value="${c.companyPhone}" ${ro}></td><th>재직기간</th><td><input type="text" value="${c.workYears}" ${ro}></td></tr>
            <tr><th>연봉</th><td><input type="text" value="${c.salary.toLocaleString()}만원" ${ro}></td><th>월 환산</th><td><input type="text" value="${Math.round(c.salary/12).toLocaleString()}만원" data-always-readonly="1" readonly style="background:#f1f5f9;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>법원 사건 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>법원명</th><td><input type="text" value="${c.courtName || '-'}" ${ro}></td><th>사건번호</th><td><input type="text" value="${c.caseNo || '-'}" ${ro}></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>개인회생 법원환급계좌</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>은행명</th><td><input type="text" value="${c.refundBank}" ${ro}></td><th>예금주</th><td><input type="text" value="${c.refundHolder}" ${ro}></td></tr>
            <tr><th>계좌번호</th><td colspan="3"><input type="text" value="${c.refundAccount}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>신용 및 기존 대출</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>신용점수</th><td><input type="text" value="${c.creditScore}점" ${ro} style="color:${creditColor};font-weight:700;background:#f8fafc;border-color:#e2e8f0;"></td><th>등급</th><td><input type="text" value="${creditGrade}" data-always-readonly="1" readonly style="background:#f1f5f9;border-color:#e2e8f0;"></td></tr>
            <tr><th>기존 대출</th><td colspan="3"><input type="text" value="${c.existingLoans || '없음'}" ${ro} style="width:100%;background:#f8fafc;border-color:#e2e8f0;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>연결된 대출 신청</h2></div><div class="panel-body" style="padding:0;">
          <table><thead><tr><th>대출상품</th><th>대출금액</th><th>상태</th><th>신청일</th></tr></thead>
          <tbody><tr><td>${c.loanAmount ? 'SBI저축은행' : '-'}</td><td>${c.loanAmount||'-'}</td><td><span class="badge ${badgeClass}">${c.status}</span></td><td>${c.loanDate||c.regDate}</td></tr></tbody></table>
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
              <div class="timeline-item"><div class="tl-date">2026-03-26 10:30</div><div class="tl-content">대출 조건 문의, 금리 비교 안내.</div><div class="tl-user">전화 | ${c.assignedTo}</div></div>
              <div class="timeline-item"><div class="tl-date">2026-03-24 14:00</div><div class="tl-content">초기 상담. 대출 가능 여부 확인.</div><div class="tl-user">방문 | ${c.assignedTo}</div></div>
              <div class="timeline-item"><div class="tl-date">2026-03-22 11:00</div><div class="tl-content">첫 전화 상담. 고객 니즈 파악.</div><div class="tl-user">전화 | ${c.assignedTo}</div></div>
            </div>
          </div>
        </div>

        <div class="panel"><div class="panel-header"><h2>상태 변경 이력</h2></div>
          <div class="panel-body" style="padding:8px 12px;">
            <div class="timeline">
              <div class="timeline-item"><div class="tl-date">2026-03-26 10:30</div><div class="tl-content"><span class="badge badge-consult">상담</span> &rarr; <span class="badge ${badgeClass}">${c.status}</span></div><div class="tl-user">서류 접수 완료 | ${c.assignedTo}</div></div>
              <div class="timeline-item"><div class="tl-date">2026-03-24 14:00</div><div class="tl-content"><span class="badge badge-lead">리드</span> &rarr; <span class="badge badge-consult">상담</span></div><div class="tl-user">초기 상담 완료 | ${c.assignedTo}</div></div>
            </div>
          </div>
        </div>

        <div class="panel"><div class="panel-header"><h2>변경 이력</h2></div>
          <div class="panel-body" style="padding:8px 12px;">
            <div class="timeline" id="ledgerChangeHistory">
              <div class="timeline-item"><div class="tl-date">2026-03-22 09:00</div><div class="tl-content">최초 배정: ${c.assignedTo}</div><div class="tl-user">처리: 박팀장</div></div>
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
    intakePrefill = { name: name, phone: phone, memo: content || '', dbSource: source || '홈페이지' };
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
// 고객 등록 (웹 페이지)
// ========================================
async function submitCustomerRegister() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    name: v('reg-name'), ssn: v('reg-ssn'), phone: v('reg-phone'), phone2: v('reg-phone2'),
    email: v('reg-email'), dbSource: v('reg-dbsource'),
    address: (v('reg-addr1') + ' ' + v('reg-addr1-detail')).trim(),
    residenceAddress: (v('reg-addr2') + ' ' + v('reg-addr2-detail')).trim(),
    company: v('reg-company'), employmentType: v('reg-emptype'),
    companyAddr: (v('reg-compaddr') + ' ' + v('reg-compaddr-detail')).trim(),
    companyPhone: v('reg-compphone'), workYears: v('reg-workyears'), salary: parseInt(v('reg-salary')) || 0,
    courtName: v('reg-court'), caseNo: v('reg-caseno'),
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
            <tr><th>휴대전화 <span class="required">*</span></th><td><input type="text" id="reg-phone" placeholder="010-0000-0000" value="${phoneFormatted}" oninput="this.value=formatPhone(this.value)"></td><th>보조 연락처</th><td><input type="text" id="reg-phone2" placeholder="연락처"></td></tr>
            <tr><th>이메일</th><td><input type="text" id="reg-email" placeholder="이메일"></td><th>DB 유입출처 <span class="required">*</span></th><td><select id="reg-dbsource">${selDb(dbOpts, pf.dbSource||'선택하세요')}</select></td></tr>
            <tr><th>초본 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="reg-addr1" style="flex:1;" placeholder="주소 검색" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('reg-addr1')">검색</button><input type="text" id="reg-addr1-detail" style="width:200px;" placeholder="상세주소 입력"></div></td></tr>
            <tr><th>실거주 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="reg-addr2" style="flex:1;" placeholder="주소 검색" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('reg-addr2')">검색</button><input type="text" id="reg-addr2-detail" style="width:200px;" placeholder="상세주소 입력"></div></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>직장 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>직장명</th><td><input type="text" id="reg-company" placeholder="직장명"></td><th>고용형태</th><td><select id="reg-emptype"><option>선택</option><option>정규직</option><option>계약직</option><option>프리랜서</option><option>자영업</option><option>무직</option></select></td></tr>
            <tr><th>직장 주소</th><td colspan="3"><div style="display:flex;gap:4px;"><input type="text" id="reg-compaddr" style="flex:1;" placeholder="주소 검색" readonly><button class="btn btn-sm btn-primary" onclick="openAddrSearchSingle('reg-compaddr')">검색</button><input type="text" id="reg-compaddr-detail" style="width:200px;" placeholder="상세주소 입력"></div></td></tr>
            <tr><th>직장 전화</th><td><input type="text" id="reg-compphone" placeholder="02-0000-0000"></td><th>재직기간</th><td><input type="text" id="reg-workyears" placeholder="예: 3년 2개월"></td></tr>
            <tr><th>연봉</th><td><input type="text" id="reg-salary" placeholder="만원 단위" oninput="calcMonthly()"></td><th>월 환산</th><td><input type="text" id="reg-monthly" placeholder="자동계산" readonly style="background:#f1f5f9;"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>법원 사건 정보</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>법원명</th><td><input type="text" id="reg-court" placeholder="법원명 (해당 시)"></td><th>사건번호</th><td><input type="text" id="reg-caseno" placeholder="사건번호 (해당 시)"></td></tr>
          </tbody></table>
        </div></div>

        <div class="panel"><div class="panel-header"><h2>개인회생 법원환급계좌</h2></div><div class="panel-body" style="padding:0;">
          <table class="info-table"><tbody>
            <tr><th>은행명</th><td><select id="reg-bank"><option>선택하세요</option><option>국민은행</option><option>신한은행</option><option>우리은행</option><option>하나은행</option><option>농협은행</option><option>카카오뱅크</option><option>토스뱅크</option><option>기업은행</option><option>SC제일</option><option>기타</option></select></td><th>예금주</th><td><input type="text" id="reg-holder" placeholder="예금주"></td></tr>
            <tr><th>계좌번호</th><td colspan="3"><input type="text" id="reg-account" placeholder="계좌번호 입력" style="width:100%;"></td></tr>
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

  const c = loanRegisterCustomerId ? customerData[loanRegisterCustomerId] : null;
  if (!c) { container.innerHTML = ''; return; }

  // 고객 정보에서 매칭 조건 추출
  const jobTypeMap = {
    '정규직': '직장인(4대가입)', '계약직': '직장인(4대미가입)',
    '프리랜서': '프리랜서', '자영업': '개인사업자', '무직': '무직'
  };
  const customer = {
    age: c.age || 0,
    jobType: jobTypeMap[c.employmentType] || '직장인(4대가입)',
    vehicleNo: '', // 차량번호 (입력 폼에서 가져옴)
    vehicleYear: 0,
    vehicleKm: 0,
    recoveryType: c.courtName ? '회생' : '무',
    loanAmount: 0
  };

  // 대출 접수 폼에서 추가 정보 가져오기
  const loanAmtEl = document.querySelector('.form-table input[placeholder="1000"]');
  if (loanAmtEl && loanAmtEl.value) customer.loanAmount = parseInt(loanAmtEl.value) || 0;

  const vehicleEl = document.querySelector('.form-table input[placeholder*="차량번호"]');
  if (vehicleEl && vehicleEl.value) customer.vehicleNo = vehicleEl.value;

  const result = matchProducts(customer);

  if (result.recommended.length === 0 && result.conditional.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = `<div style="margin-bottom:8px;padding:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
    <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:6px;">
      ★ ${c.name}님 추천 상품 (${result.recommended.length + result.conditional.length}개)
    </div>`;

  // 추천 상품
  result.recommended.slice(0, 8).forEach(r => {
    html += `<div class="product-item" onclick="selectProduct(this)" ondblclick="openProductGuide(this)" data-product-name="${r.name}" data-fidx="${r.fidx}" title="더블클릭: 상품 가이드" style="border-left:3px solid #16a34a;margin-bottom:3px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="product-name" style="margin:0;">${r.name}</span>
        <span style="font-size:10px;color:#16a34a;font-weight:700;">★ ${r.matchRate}%</span>
      </div>
      <div style="font-size:9px;color:#64748b;">${r.reasons.join(' | ')}</div>
      <div style="font-size:9px;color:#94a3b8;">${r.notes}</div>
    </div>`;
  });

  // 조건부 상품
  result.conditional.slice(0, 5).forEach(r => {
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

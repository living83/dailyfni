// ========================================
// 대부중개 전산시스템 - 프론트엔드 앱
// ========================================

const pages = {
  dashboard: { title: '대시보드', render: renderDashboard },
  customers: { title: '고객 관리', render: renderCustomers },
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
  navigate('dashboard');
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
}

// ========================================
// 1. 대시보드
// ========================================
function renderDashboard() {
  return `
    <div class="quick-search-bar" onclick="openCustomerSearch()">
      <span class="quick-search-title">고객원장 (개별조회)</span>
      <span class="quick-search-hint">이름, 전화번호, 주민번호로 검색</span>
    </div>
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
function renderCustomers() {
  return `
    <div class="filter-bar">
      <input type="text" placeholder="고객명/연락처 검색">
      <select><option>전체 상태</option><option>리드</option><option>상담</option><option>접수</option><option>실행</option></select>
      <select><option>전체 출처</option><option>네이버 광고</option><option>카카오 DB</option><option>자체 DB</option><option>소개/추천</option></select>
      <select><option>전체 담당자</option><option>김대리</option><option>이과장</option><option>박사원</option></select>
      <input type="date" value="2026-03-01"> ~ <input type="date" value="2026-03-26">
      <button class="btn btn-primary">검색</button>
      <button class="btn btn-primary" style="margin-left:auto">+ 고객 등록</button>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>고객 목록 (총 312명)</h2>
        <button class="btn btn-outline btn-sm">엑셀 내보내기</button>
      </div>
      <div class="panel-body">
        <table>
          <thead>
            <tr><th>No</th><th>고객명</th><th>연락처</th><th>DB 출처</th><th>담당자</th><th>최근 상태</th><th>등록일</th></tr>
          </thead>
          <tbody>
            <tr><td>312</td><td><a href="#" class="customer-link" onclick="viewCustomer(312);return false;">박지영</a></td><td>010-1234-5678</td><td>네이버 광고</td><td>김대리</td><td><span class="badge badge-submit">접수</span></td><td>2026-03-26</td></tr>
            <tr><td>311</td><td><a href="#" class="customer-link" onclick="viewCustomer(311);return false;">이승호</a></td><td>010-9876-5432</td><td>카카오 DB</td><td>이과장</td><td><span class="badge badge-review">심사중</span></td><td>2026-03-25</td></tr>
            <tr><td>310</td><td><a href="#" class="customer-link" onclick="viewCustomer(310);return false;">최민수</a></td><td>010-5555-1234</td><td>자체 DB</td><td>김대리</td><td><span class="badge badge-approved">승인</span></td><td>2026-03-25</td></tr>
            <tr><td>309</td><td><a href="#" class="customer-link" onclick="viewCustomer(309);return false;">정하나</a></td><td>010-3333-7890</td><td>소개/추천</td><td>박사원</td><td><span class="badge badge-executed">실행</span></td><td>2026-03-24</td></tr>
            <tr><td>308</td><td><a href="#" class="customer-link" onclick="viewCustomer(308);return false;">한동욱</a></td><td>010-7777-4321</td><td>네이버 광고</td><td>이과장</td><td><span class="badge badge-rejected">부결</span></td><td>2026-03-24</td></tr>
            <tr><td>307</td><td><a href="#" class="customer-link" onclick="viewCustomer(307);return false;">강서연</a></td><td>010-2222-8888</td><td>카카오 DB</td><td>김대리</td><td><span class="badge badge-consult">상담</span></td><td>2026-03-23</td></tr>
            <tr><td>306</td><td><a href="#" class="customer-link" onclick="viewCustomer(306);return false;">윤재현</a></td><td>010-4444-6666</td><td>자체 DB</td><td>박사원</td><td><span class="badge badge-lead">리드</span></td><td>2026-03-23</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ========================================
// 3. 대출 신청 관리
// ========================================
function renderLoans() {
  return `
    <div class="tabs">
      <div class="tab active">전체</div>
      <div class="tab">리드</div>
      <div class="tab">상담</div>
      <div class="tab">접수</div>
      <div class="tab">심사중</div>
      <div class="tab">승인</div>
      <div class="tab">실행</div>
      <div class="tab">부결/환수</div>
    </div>
    <div class="filter-bar">
      <input type="text" placeholder="고객명/연락처">
      <select><option>전체 담당자</option><option>김대리</option><option>이과장</option><option>박사원</option></select>
      <input type="date" value="2026-03-01"> ~ <input type="date" value="2026-03-26">
      <button class="btn btn-primary">검색</button>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>대출 신청 목록 (84건)</h2>
      </div>
      <div class="panel-body">
        <table>
          <thead>
            <tr><th>신청번호</th><th>고객명</th><th>대출금액</th><th>수수료율</th><th>상태</th><th>담당자</th><th>신청일</th><th>최종변경</th><th>관리</th></tr>
          </thead>
          <tbody>
            <tr><td>LA-20260326-001</td><td>박지영</td><td>3,000만</td><td>3.5%</td><td><span class="badge badge-submit">접수</span></td><td>김대리</td><td>03-26</td><td>03-26 10:30</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>LA-20260325-003</td><td>이승호</td><td>5,000만</td><td>3.0%</td><td><span class="badge badge-review">심사중</span></td><td>이과장</td><td>03-25</td><td>03-26 09:15</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>LA-20260325-002</td><td>최민수</td><td>2,000만</td><td>4.0%</td><td><span class="badge badge-approved">승인</span></td><td>김대리</td><td>03-25</td><td>03-26 08:40</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>LA-20260324-005</td><td>정하나</td><td>1,500만</td><td>3.5%</td><td><span class="badge badge-executed">실행</span></td><td>박사원</td><td>03-24</td><td>03-25 16:20</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>LA-20260324-004</td><td>한동욱</td><td>4,000만</td><td>3.0%</td><td><span class="badge badge-rejected">부결</span></td><td>이과장</td><td>03-24</td><td>03-25 14:10</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ========================================
// 4. 대출 접수 (표준 접수 폼)
// ========================================
function renderLoanRegister() {
  return `
    <div class="panel">
      <div class="panel-header"><h2>표준 대출 접수</h2></div>
      <div class="panel-body" style="padding:20px;">
        <div class="form-row">
          <div class="form-group">
            <label>고객명 <span class="required">*</span></label>
            <input type="text" placeholder="고객명 입력 또는 검색">
          </div>
          <div class="form-group">
            <label>연락처 <span class="required">*</span></label>
            <input type="text" placeholder="010-0000-0000">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>대출 희망 금액 <span class="required">*</span></label>
            <input type="text" placeholder="금액 입력 (만원)">
          </div>
          <div class="form-group">
            <label>대출 종류 <span class="required">*</span></label>
            <select>
              <option>선택하세요</option>
              <option>신용대출</option>
              <option>담보대출</option>
              <option>자동차대출</option>
              <option>기타</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>DB 출처 <span class="required">*</span></label>
            <select>
              <option>선택하세요</option>
              <option>네이버 광고</option>
              <option>카카오 DB</option>
              <option>자체 DB</option>
              <option>소개/추천</option>
              <option>기타</option>
            </select>
          </div>
          <div class="form-group">
            <label>담당자 <span class="required">*</span></label>
            <select>
              <option>선택하세요</option>
              <option>김대리</option>
              <option>이과장</option>
              <option>박사원</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>수수료율 (%)</label>
            <input type="text" placeholder="예: 3.5">
          </div>
          <div class="form-group">
            <label>상위 에이전시</label>
            <select>
              <option>선택하세요</option>
              <option>A 에이전시</option>
              <option>B 에이전시</option>
              <option>C 에이전시</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>메모/특이사항</label>
          <textarea rows="3" placeholder="메모 입력"></textarea>
        </div>
        <div class="form-group">
          <label>서류 첨부</label>
          <input type="file" multiple>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px;">허용: PDF, JPG, PNG / 최대 10MB</div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary">접수 등록</button>
          <button class="btn btn-outline">취소</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>제출 서류 체크리스트</h2></div>
      <div class="panel-body" style="padding:14px 18px;">
        <label style="display:block;margin-bottom:6px;font-size:12px;"><input type="checkbox"> 신분증 사본</label>
        <label style="display:block;margin-bottom:6px;font-size:12px;"><input type="checkbox"> 소득 증빙서류 (원천징수영수증 등)</label>
        <label style="display:block;margin-bottom:6px;font-size:12px;"><input type="checkbox"> 재직증명서</label>
        <label style="display:block;margin-bottom:6px;font-size:12px;"><input type="checkbox"> 주민등록등본</label>
        <label style="display:block;margin-bottom:6px;font-size:12px;"><input type="checkbox"> 기타 추가 서류</label>
      </div>
    </div>
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
function renderSettlement() {
  return `
    <div class="tabs">
      <div class="tab active">매출 집계</div>
      <div class="tab">직원별 수당</div>
      <div class="tab">리베이트/환수</div>
      <div class="tab">정산 정책</div>
      <div class="tab">월 마감</div>
    </div>
    <div class="filter-bar">
      <select><option>2026년 3월</option><option>2026년 2월</option><option>2026년 1월</option></select>
      <select><option>전체 출처</option><option>네이버 광고</option><option>카카오 DB</option><option>자체 DB</option></select>
      <button class="btn btn-primary">조회</button>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">이번 달 총 매출</div>
        <div class="value">4,820만</div>
      </div>
      <div class="stat-card">
        <div class="label">총 수당 지급액</div>
        <div class="value">1,928만</div>
      </div>
      <div class="stat-card">
        <div class="label">리베이트 합계</div>
        <div class="value">120만</div>
      </div>
      <div class="stat-card">
        <div class="label">환수 합계</div>
        <div class="value">85만</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>실행 건별 매출 내역</h2>
        <span style="font-size:11px;color:#94a3b8;">정산 기준: 실행 완료 건</span>
      </div>
      <div class="panel-body">
        <table>
          <thead>
            <tr><th>실행일</th><th>신청번호</th><th>고객명</th><th>대출금액</th><th>수수료율</th><th>수수료</th><th>DB 출처</th><th>담당자</th></tr>
          </thead>
          <tbody>
            <tr><td>03-25</td><td>LA-20260324-005</td><td>정하나</td><td>1,500만</td><td>3.5%</td><td>52.5만</td><td>소개/추천</td><td>박사원</td></tr>
            <tr><td>03-24</td><td>LA-20260322-012</td><td>송미영</td><td>3,200만</td><td>3.0%</td><td>96.0만</td><td>네이버 광고</td><td>김대리</td></tr>
            <tr><td>03-23</td><td>LA-20260320-008</td><td>오진우</td><td>2,800만</td><td>3.5%</td><td>98.0만</td><td>카카오 DB</td><td>이과장</td></tr>
            <tr><td>03-22</td><td>LA-20260319-003</td><td>임수현</td><td>4,500만</td><td>3.0%</td><td>135.0만</td><td>자체 DB</td><td>김대리</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
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
function renderEmployees() {
  return `
    <div class="filter-bar">
      <input type="text" placeholder="직원명 검색">
      <select><option>전체 역할</option><option>관리자</option><option>영업직원</option></select>
      <select><option>전체 상태</option><option>활성</option><option>비활성</option></select>
      <button class="btn btn-primary">검색</button>
      <button class="btn btn-primary" style="margin-left:auto">+ 직원 등록</button>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>직원 목록</h2></div>
      <div class="panel-body">
        <table>
          <thead>
            <tr><th>이름</th><th>소속</th><th>직급</th><th>역할</th><th>데이터 범위</th><th>상태</th><th>입사일</th><th>관리</th></tr>
          </thead>
          <tbody>
            <tr><td>박팀장</td><td>영업1팀</td><td>팀장</td><td><span class="badge badge-approved">관리자</span></td><td>전사</td><td><span class="badge badge-approved">활성</span></td><td>2020-03-01</td><td><button class="btn btn-sm btn-outline">수정</button> <button class="btn btn-sm btn-outline">비밀번호</button></td></tr>
            <tr><td>김대리</td><td>영업1팀</td><td>대리</td><td><span class="badge badge-lead">영업직원</span></td><td>본인</td><td><span class="badge badge-approved">활성</span></td><td>2022-06-15</td><td><button class="btn btn-sm btn-outline">수정</button> <button class="btn btn-sm btn-outline">비밀번호</button></td></tr>
            <tr><td>이과장</td><td>영업2팀</td><td>과장</td><td><span class="badge badge-lead">영업직원</span></td><td>본인</td><td><span class="badge badge-approved">활성</span></td><td>2021-01-10</td><td><button class="btn btn-sm btn-outline">수정</button> <button class="btn btn-sm btn-outline">비밀번호</button></td></tr>
            <tr><td>박사원</td><td>영업1팀</td><td>사원</td><td><span class="badge badge-lead">영업직원</span></td><td>본인</td><td><span class="badge badge-approved">활성</span></td><td>2024-09-01</td><td><button class="btn btn-sm btn-outline">수정</button> <button class="btn btn-sm btn-outline">비밀번호</button></td></tr>
            <tr><td>최주임</td><td>영업2팀</td><td>주임</td><td><span class="badge badge-lead">영업직원</span></td><td>본인</td><td><span class="badge badge-closed">비활성</span></td><td>2023-03-20</td><td><button class="btn btn-sm btn-outline">수정</button> <button class="btn btn-sm btn-outline">비밀번호</button></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ========================================
// 10. 알림
// ========================================
function renderNotifications() {
  return `
    <div class="tabs">
      <div class="tab active">미확인 (3)</div>
      <div class="tab">전체</div>
    </div>
    <div class="panel">
      <div class="panel-body">
        <div class="timeline">
          <div class="timeline-item">
            <div class="tl-date">2026-03-26 10:30</div>
            <div class="tl-content"><strong>[상담 리마인더]</strong> 박지영 고객 서류 제출 확인 예정 (03-28)</div>
            <div class="tl-user">담당: 김대리</div>
          </div>
          <div class="timeline-item">
            <div class="tl-date">2026-03-26 09:00</div>
            <div class="tl-content"><strong>[상태 정체]</strong> 이승호 고객 - 심사중 상태 3일 경과</div>
            <div class="tl-user">담당: 이과장</div>
          </div>
          <div class="timeline-item">
            <div class="tl-date">2026-03-25 17:00</div>
            <div class="tl-content"><strong>[서류 미비]</strong> 강서연 고객 - 소득 증빙서류 미제출 (2일 경과)</div>
            <div class="tl-user">담당: 김대리</div>
          </div>
          <div class="timeline-item">
            <div class="tl-date">2026-03-25 09:00</div>
            <div class="tl-content"><strong>[월 마감 안내]</strong> 2026년 3월 정산 마감 D-5</div>
            <div class="tl-user">시스템</div>
          </div>
          <div class="timeline-item">
            <div class="tl-date">2026-03-24 15:20</div>
            <div class="tl-content"><strong>[상태 변경]</strong> 정하나 고객 대출 실행 완료</div>
            <div class="tl-user">처리: 박사원</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// 11. 감사로그
// ========================================
function renderAudit() {
  return `
    <div class="filter-bar">
      <input type="date" value="2026-03-01"> ~ <input type="date" value="2026-03-26">
      <select><option>전체 직원</option><option>박팀장</option><option>김대리</option><option>이과장</option><option>박사원</option></select>
      <select><option>전체 이벤트</option><option>상태 변경</option><option>담당자 변경</option><option>정산 변경</option><option>마감 처리</option></select>
      <button class="btn btn-primary">조회</button>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>감사로그</h2></div>
      <div class="panel-body">
        <table>
          <thead>
            <tr><th>일시</th><th>구분</th><th>대상</th><th>변경 전</th><th>변경 후</th><th>사유</th><th>처리자</th></tr>
          </thead>
          <tbody>
            <tr><td>03-26 10:30</td><td><span class="badge badge-submit">상태 변경</span></td><td>박지영 (LA-0326-001)</td><td>상담</td><td>접수</td><td>서류 접수 완료</td><td>김대리</td></tr>
            <tr><td>03-26 09:15</td><td><span class="badge badge-submit">상태 변경</span></td><td>이승호 (LA-0325-003)</td><td>접수</td><td>심사중</td><td>심사 의뢰</td><td>이과장</td></tr>
            <tr><td>03-25 16:20</td><td><span class="badge badge-executed">상태 변경</span></td><td>정하나 (LA-0324-005)</td><td>승인</td><td>실행</td><td>대출 실행 완료</td><td>박사원</td></tr>
            <tr><td>03-25 14:10</td><td><span class="badge badge-rejected">상태 변경</span></td><td>한동욱 (LA-0324-004)</td><td>심사중</td><td>부결</td><td>소득 기준 미달</td><td>이과장</td></tr>
            <tr><td>03-25 11:00</td><td><span class="badge badge-consult">담당자 변경</span></td><td>강서연</td><td>박사원</td><td>김대리</td><td>팀 재배치</td><td>박팀장</td></tr>
            <tr><td>03-24 17:00</td><td><span class="badge badge-review">정산 변경</span></td><td>2월 정산</td><td>-</td><td>환수 85만</td><td>조기 상환 환수</td><td>박팀장</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ========================================
// 고객 상세 샘플 데이터
// ========================================
const customerData = {
  312: { name:'박지영', ssn:'920315-2******', age:33, phone:'010-1234-5678', phone2:'', email:'jiyoung.park@email.com', address:'서울특별시 강남구 테헤란로 123, 4층 402호', residenceAddress:'서울특별시 강남구 테헤란로 123, 4층 402호', company:'(주)한국금융서비스', companyAddr:'서울특별시 중구 을지로 45, 7층', companyPhone:'02-1234-5678', salary:4200, employmentType:'정규직', workYears:'3년 2개월', courtName:'서울중앙지방법원', caseNo:'2026가단12345', refundBank:'국민은행', refundAccount:'123-456-789012', refundHolder:'박지영', creditScore:680, existingLoans:'신한은행 2,000만 (잔여 1,200만)', dbSource:'네이버 광고', assignedTo:'김대리', status:'접수', regDate:'2026-03-26', memo:'금리 비교 후 진행 희망. 서류 준비 중.' },
  311: { name:'이승호', ssn:'880720-1******', age:37, phone:'010-9876-5432', phone2:'010-5555-0000', email:'seungho.lee@company.com', address:'경기도 성남시 분당구 판교로 256, 8층', residenceAddress:'경기도 성남시 분당구 판교로 256, 8층', company:'테크스타트(주)', companyAddr:'경기도 성남시 분당구 판교역로 152', companyPhone:'031-987-6543', salary:5800, employmentType:'정규직', workYears:'5년 8개월', courtName:'', caseNo:'', refundBank:'신한은행', refundAccount:'110-234-567890', refundHolder:'이승호', creditScore:720, existingLoans:'없음', dbSource:'카카오 DB', assignedTo:'이과장', status:'심사중', regDate:'2026-03-25', memo:'소득 증빙 제출 완료. 심사 진행 중.' },
  310: { name:'최민수', ssn:'950103-1******', age:31, phone:'010-5555-1234', phone2:'', email:'minsu.choi@gmail.com', address:'서울특별시 마포구 월드컵북로 21', residenceAddress:'서울특별시 마포구 월드컵북로 21', company:'(주)디자인웍스', companyAddr:'서울특별시 마포구 양화로 45', companyPhone:'02-3456-7890', salary:3600, employmentType:'계약직', workYears:'1년 6개월', courtName:'', caseNo:'', refundBank:'우리은행', refundAccount:'1002-345-678901', refundHolder:'최민수', creditScore:650, existingLoans:'카카오뱅크 500만', dbSource:'자체 DB', assignedTo:'김대리', status:'승인', regDate:'2026-03-25', memo:'승인 완료. 실행 일정 협의 중.' },
  309: { name:'정하나', ssn:'000515-4******', age:25, phone:'010-3333-7890', phone2:'', email:'hana.jung@naver.com', address:'인천광역시 남동구 구월로 123', residenceAddress:'인천광역시 남동구 구월로 123', company:'CJ올리브영 인천점', companyAddr:'인천광역시 남동구 인하로 321', companyPhone:'032-111-2222', salary:2800, employmentType:'정규직', workYears:'2년 1개월', courtName:'인천지방법원', caseNo:'2025가소98765', refundBank:'하나은행', refundAccount:'267-890-123456', refundHolder:'정하나', creditScore:590, existingLoans:'토스뱅크 300만', dbSource:'소개/추천', assignedTo:'박사원', status:'실행', regDate:'2026-03-24', memo:'대출 실행 완료.' },
  308: { name:'한동욱', ssn:'850211-1******', age:41, phone:'010-7777-4321', phone2:'010-8888-1111', email:'dongwook.han@daum.net', address:'경기도 수원시 영통구 영통로 200', residenceAddress:'경기도 수원시 영통구 영통로 200', company:'삼성전자(주)', companyAddr:'경기도 수원시 영통구 삼성로 129', companyPhone:'031-200-1234', salary:7200, employmentType:'정규직', workYears:'12년 3개월', courtName:'', caseNo:'', refundBank:'삼성증권', refundAccount:'55-123456-78', refundHolder:'한동욱', creditScore:480, existingLoans:'국민은행 5,000만, 하나은행 2,000만', dbSource:'네이버 광고', assignedTo:'이과장', status:'부결', regDate:'2026-03-24', memo:'소득 대비 기존 대출 과다. 부결 처리.' },
  307: { name:'강서연', ssn:'970830-2******', age:28, phone:'010-2222-8888', phone2:'', email:'seoyeon.kang@outlook.com', address:'서울특별시 송파구 올림픽로 300', residenceAddress:'서울특별시 송파구 올림픽로 300', company:'(주)네오위즈', companyAddr:'서울특별시 강남구 삼성로 512', companyPhone:'02-6789-0123', salary:4500, employmentType:'정규직', workYears:'3년 10개월', courtName:'', caseNo:'', refundBank:'카카오뱅크', refundAccount:'3333-01-2345678', refundHolder:'강서연', creditScore:710, existingLoans:'없음', dbSource:'카카오 DB', assignedTo:'김대리', status:'상담', regDate:'2026-03-23', memo:'초기 상담 완료. 추가 상담 예정.' },
  306: { name:'윤재현', ssn:'910612-1******', age:34, phone:'010-4444-6666', phone2:'', email:'jaehyun.yoon@gmail.com', address:'대전광역시 서구 둔산로 50', residenceAddress:'대전광역시 서구 둔산로 50', company:'한국철도공사', companyAddr:'대전광역시 동구 중앙로 240', companyPhone:'042-567-8901', salary:5100, employmentType:'정규직', workYears:'7년 5개월', courtName:'', caseNo:'', refundBank:'농협은행', refundAccount:'302-1234-5678-91', refundHolder:'윤재현', creditScore:750, existingLoans:'농협 1,500만 (잔여 800만)', dbSource:'자체 DB', assignedTo:'박사원', status:'리드', regDate:'2026-03-23', memo:'DB 유입. 아직 연락 전.' }
};

// 고객 상세 팝업 열기
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
          <button class="btn btn-outline btn-sm">대출 접수</button>
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
            <div class="panel-header"><h2>환급 계좌</h2></div>
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
                <thead><tr><th>신청번호</th><th>대출금액</th><th>수수료율</th><th>상태</th><th>신청일</th></tr></thead>
                <tbody>
                  <tr><td>LA-20260326-001</td><td>3,000만</td><td>3.5%</td><td><span class="badge ${badgeClass}">${c.status}</span></td><td>${c.regDate}</td></tr>
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
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCustomerModal();
  });
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
      <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;background:#fff;">
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="searchType" style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;background:#fff;">
            <option value="name">이름</option>
            <option value="phone">전화번호</option>
            <option value="ssn">주민번호</option>
          </select>
          <input type="text" id="searchInput" placeholder="검색어 입력..." style="flex:1;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;outline:none;" autofocus>
          <button class="btn btn-primary" onclick="executeCustomerSearch()" style="padding:8px 20px;font-size:13px;">검색</button>
        </div>
        <div style="margin-top:8px;font-size:11px;color:#94a3b8;">이름/전화번호가 중복인 경우 복수의 고객이 조회됩니다. 고객을 더블클릭하면 상세정보를 확인할 수 있습니다.</div>
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
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCustomerSearch();
  });
  document.addEventListener('keydown', handleModalEsc);

  // 엔터키로 검색
  setTimeout(() => {
    const input = document.getElementById('searchInput');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executeCustomerSearch();
      });
    }
  }, 100);
}

function closeCustomerSearch() {
  const modal = document.getElementById('customerSearchModal');
  if (modal) modal.remove();
}

function executeCustomerSearch() {
  const type = document.getElementById('searchType').value;
  const keyword = document.getElementById('searchInput').value.trim();
  const resultsDiv = document.getElementById('searchResults');

  if (!keyword) {
    resultsDiv.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="icon">&#128269;</div><p>검색어를 입력하세요.</p></div>';
    return;
  }

  // customerData에서 검색
  const results = [];
  for (const [id, c] of Object.entries(customerData)) {
    let match = false;
    if (type === 'name' && c.name.includes(keyword)) match = true;
    if (type === 'phone' && c.phone.replace(/-/g,'').includes(keyword.replace(/-/g,''))) match = true;
    if (type === 'ssn' && c.ssn.replace(/-/g,'').includes(keyword.replace(/-/g,''))) match = true;
    if (match) results.push({ id: parseInt(id), ...c });
  }

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
    html += `<tr class="search-result-row" ondblclick="closeCustomerSearch();viewCustomer(${r.id});" title="더블클릭하여 상세보기">
      <td>${r.id}</td>
      <td><strong>${r.name}</strong></td>
      <td>${r.phone}</td>
      <td>${r.ssn}</td>
      <td><span class="badge ${badge}">${r.status}</span></td>
      <td>${r.assignedTo}</td>
      <td>${r.regDate}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  resultsDiv.innerHTML = html;
}

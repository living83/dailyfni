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
            <tr><th>No</th><th>고객명</th><th>연락처</th><th>DB 출처</th><th>담당자</th><th>최근 상태</th><th>등록일</th><th>관리</th></tr>
          </thead>
          <tbody>
            <tr><td>312</td><td>박지영</td><td>010-1234-5678</td><td>네이버 광고</td><td>김대리</td><td><span class="badge badge-submit">접수</span></td><td>2026-03-26</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>311</td><td>이승호</td><td>010-9876-5432</td><td>카카오 DB</td><td>이과장</td><td><span class="badge badge-review">심사중</span></td><td>2026-03-25</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>310</td><td>최민수</td><td>010-5555-1234</td><td>자체 DB</td><td>김대리</td><td><span class="badge badge-approved">승인</span></td><td>2026-03-25</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>309</td><td>정하나</td><td>010-3333-7890</td><td>소개/추천</td><td>박사원</td><td><span class="badge badge-executed">실행</span></td><td>2026-03-24</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>308</td><td>한동욱</td><td>010-7777-4321</td><td>네이버 광고</td><td>이과장</td><td><span class="badge badge-rejected">부결</span></td><td>2026-03-24</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>307</td><td>강서연</td><td>010-2222-8888</td><td>카카오 DB</td><td>김대리</td><td><span class="badge badge-consult">상담</span></td><td>2026-03-23</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
            <tr><td>306</td><td>윤재현</td><td>010-4444-6666</td><td>자체 DB</td><td>박사원</td><td><span class="badge badge-lead">리드</span></td><td>2026-03-23</td><td><button class="btn btn-sm btn-outline">상세</button></td></tr>
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

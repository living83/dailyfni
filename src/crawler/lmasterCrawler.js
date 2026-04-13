// ========================================
// 론앤마스터 크롤러 - 사용자 행동 모방 방식
// 상품 클릭 시 1건만 가져옴 (일괄 수집 X)
// ========================================
const puppeteer = require('puppeteer-core');

const LMASTER_BASE = 'https://lmaster.kr';
const LOGIN_URL = LMASTER_BASE + '/jisa/login.asp';
const PRODUCT_INFO_URL = LMASTER_BASE + '/admin/agent/win_fininfo.asp';
const LOAN_APP_URL = LMASTER_BASE + '/admin/agent/loanlist_app.asp';
const LOAN_LIST_URL = LMASTER_BASE + '/admin/agent/list_loanlist.asp';

// 브라우저 인스턴스 (싱글톤)
let browser = null;
let page = null;
let isLoggedIn = false;

// 랜덤 딜레이 (사람처럼)
function delay(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

// Chrome 경로 자동 탐색
function getChromePath() {
  const paths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.CHROME_PATH || ''
  ];
  const fs = require('fs');
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// 브라우저 시작
async function launchBrowser() {
  if (browser) return;

  const chromePath = getChromePath();
  if (!chromePath) {
    throw new Error('Chrome 브라우저를 찾을 수 없습니다. CHROME_PATH 환경변수를 설정하세요.');
  }

  const isLinux = process.platform === 'linux';

  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: isLinux ? 'new' : false, // 서버(Linux): headless, 로컬(Windows): 브라우저 표시
    defaultViewport: isLinux ? { width: 1280, height: 900 } : null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  page = (await browser.pages())[0] || await browser.newPage();

  // 브라우저 닫힘 감지
  browser.on('disconnected', () => {
    browser = null;
    page = null;
    isLoggedIn = false;
  });
}

// 론앤마스터 로그인
async function login(userId, password) {
  await launchBrowser();

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
  await delay(1000, 2000);

  // 로그인 폼 입력
  await page.evaluate((id, pw) => {
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) {
      if (inp.name && (inp.name.toLowerCase().includes('id') || inp.name.toLowerCase().includes('user'))) {
        inp.value = id;
      }
      if (inp.type === 'password') {
        inp.value = pw;
      }
    }
  }, userId, password);

  await delay(500, 1000);

  // 로그인 버튼 클릭
  await page.evaluate(() => {
    const btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
    for (const btn of btns) {
      if (btn.value && (btn.value.includes('로그인') || btn.value.includes('LOGIN'))) {
        btn.click();
        return;
      }
    }
    // 폼 서브밋
    const form = document.querySelector('form');
    if (form) form.submit();
  });

  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await delay(1500, 2500);

  isLoggedIn = true;
  return { success: true, message: '로그인 성공' };
}

// 상품 상세 가이드 가져오기 (1건, 사용자 행동 모방)
async function getProductGuide(fidx) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  const url = `${PRODUCT_INFO_URL}?fidx=${fidx}`;

  // 사람처럼 딜레이
  await delay(2000, 3500);

  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(1000, 2000);

  // 페이지 내용 추출
  const data = await page.evaluate(() => {
    const title = document.querySelector('td[bgcolor] font b')?.textContent?.trim() || '';
    const body = document.body.innerText;

    // 파일 링크 수집
    const files = [];
    document.querySelectorAll('a').forEach(a => {
      const href = a.href;
      const text = a.textContent.trim();
      if (href && (href.includes('.pdf') || href.includes('.xlsx') || href.includes('.xls') || href.includes('.hwp') || href.includes('download'))) {
        files.push({ name: text, url: href });
      }
    });

    // 버튼 (인증방법, 스크래핑방법 등)
    const buttons = [];
    document.querySelectorAll('input[type="button"], button').forEach(btn => {
      if (btn.value || btn.textContent) {
        buttons.push(btn.value || btn.textContent.trim());
      }
    });

    return { title, body, files, buttons };
  });

  return {
    fidx,
    ...data,
    fetchedAt: new Date().toISOString()
  };
}

// 상품 목록에서 fidx 매핑 수집 (현재 페이지 DOM에서 추출)
async function getProductFidxMap(agentNo, upw) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  // 현재 페이지가 신청서입력 페이지인지 확인
  const currentUrl = page.url();
  if (!currentUrl.includes('loanlist_app')) {
    const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;
    await delay(3000, 5000);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await delay(3000, 5000);
  }

  const products = await page.evaluate(() => {
    const result = [];
    // 모든 방식으로 fidx 추출 (onclick, href, 자바스크립트 호출 등)
    const allElements = document.querySelectorAll('a, span, div, td, input');
    const seen = new Set();
    allElements.forEach(el => {
      const onclick = el.getAttribute('onclick') || '';
      const href = el.getAttribute('href') || '';
      const allAttrs = onclick + ' ' + href;
      const match = allAttrs.match(/fidx[=:](\d+)/i);
      if (match) {
        const fidx = parseInt(match[1]);
        if (!seen.has(fidx)) {
          seen.add(fidx);
          // 상품명 찾기: 가장 가까운 텍스트
          let name = el.textContent.trim();
          if (!name || name.length > 50) {
            const parent = el.closest('td') || el.parentElement;
            if (parent) {
              const nameEl = parent.querySelector('a, b, strong, span');
              if (nameEl) name = nameEl.textContent.trim();
            }
          }
          if (name && name.length < 50) {
            result.push({ name, fidx });
          }
        }
      }
    });

    // 추가: 페이지 전체 HTML에서 fidx 패턴 검색
    const html = document.body.innerHTML;
    const regex = /fidx[=:](\d+)/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const fidx = parseInt(m[1]);
      if (!seen.has(fidx)) {
        seen.add(fidx);
        result.push({ name: '(이름 미확인)', fidx });
      }
    }

    return result;
  });

  return products;
}

// 론앤마스터 접수 폼 필드 스캔 (폼 구조 파악용)
async function scanFormFields(agentNo, upw) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(500, 1000);

  const fields = await page.evaluate(() => {
    const result = { inputs: [], selects: [], textareas: [] };

    document.querySelectorAll('input').forEach(el => {
      if (el.type === 'hidden' && !el.name) return;
      const label = el.closest('tr')?.querySelector('th,td:first-child')?.textContent?.trim() || '';
      result.inputs.push({
        name: el.name || '', id: el.id || '', type: el.type || 'text',
        value: el.value || '', placeholder: el.placeholder || '', label
      });
    });

    document.querySelectorAll('select').forEach(el => {
      const label = el.closest('tr')?.querySelector('th,td:first-child')?.textContent?.trim() || '';
      const options = [...el.options].map(o => ({ value: o.value, text: o.text.trim() }));
      result.selects.push({ name: el.name || '', id: el.id || '', label, options });
    });

    document.querySelectorAll('textarea').forEach(el => {
      const label = el.closest('tr')?.querySelector('th,td:first-child')?.textContent?.trim() || '';
      result.textareas.push({ name: el.name || '', id: el.id || '', label });
    });

    return result;
  });

  return fields;
}

// 대출 신청서 자동 입력 (제출 전까지만 - 폼 채우기)
async function submitLoanApplication(agentNo, upw, formData) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(500, 1000);

  // 1단계: 상품 선택 (fidx 기반)
  if (formData.fidx) {
    const productSelected = await page.evaluate((fidx) => {
      // fidx로 상품 링크/버튼 찾아서 클릭
      const allEls = document.querySelectorAll('a, input[type="button"], button, span, td');
      for (const el of allEls) {
        const onclick = el.getAttribute('onclick') || '';
        const href = el.getAttribute('href') || '';
        if (onclick.includes(`fidx=${fidx}`) || onclick.includes(`fidx:${fidx}`) ||
            href.includes(`fidx=${fidx}`) || onclick.includes(`'${fidx}'`)) {
          el.click();
          return true;
        }
      }
      // select 옵션에서 찾기
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        for (const opt of sel.options) {
          if (opt.value == fidx || opt.getAttribute('data-fidx') == fidx) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, formData.fidx);

    if (productSelected) {
      await delay(500, 1000);
      // 상품 선택 후 페이지 변경 대기
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
      await delay(300, 500);
    }
  }

  // 2단계: 폼 필드 일괄 입력 (론앤마스터 실제 필드명 기반)
  const fillResult = await page.evaluate((data) => {
    const filled = [];
    const notFound = [];

    function setInput(name, value, label) {
      if (!value && value !== 0) return;
      const el = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`);
      if (el) {
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled.push({ field: label || name, target: name, value: String(value) });
      } else { notFound.push(label || name); }
    }

    function setSelect(name, value, label) {
      if (!value && value !== 0) return;
      const el = document.querySelector(`select[name="${name}"]`);
      if (el) {
        // 정확한 value 매칭
        for (const opt of el.options) {
          if (opt.value === String(value)) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled.push({ field: label || name, target: name, value: opt.text.trim() });
            return;
          }
        }
        // 텍스트 포함 매칭
        for (const opt of el.options) {
          if (opt.text.includes(String(value)) || String(value).includes(opt.text.trim())) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled.push({ field: label || name, target: name, value: opt.text.trim() });
            return;
          }
        }
        notFound.push(label || name);
      } else { notFound.push(label || name); }
    }

    // === 고객 기본정보 ===
    setInput('name', data.name, '이름');
    setInput('jumin1', data.birth, '생년월일');
    // 성별: 남(1)→1, 여(2)→2, 남(3)→3, 여(4)→4
    const genderMap = {'남(1)':'1','여(2)':'2','남(3)':'3','여(4)':'4'};
    setSelect('sex', genderMap[data.gender] || data.gender, '성별');
    // 통신사: SK→S, KT→K, LGU+→L, 알뜰→T, SK알뜰→TS, KT알뜰→TK, LG알뜰→TL
    const carrierMap = {'SK':'S','KT':'K','LGU+':'L','알뜰':'T','SK알뜰':'TS','KT알뜰':'TK','LG알뜰':'TL','기타':'E'};
    setSelect('hpon_company', carrierMap[data.carrier] || data.carrier, '통신사');
    setInput('hpon1', data.phone1, '전화1');
    setInput('hpon2', data.phone2, '전화2');
    setInput('hpon3', data.phone3, '전화3');
    setInput('p_pay', data.loanAmount, '대출요청액');

    // === 주소 ===
    setInput('ZoneCode', data.zipcode, '우편번호');
    setInput('addr1', data.address, '주소');
    setInput('addr2', data.addressDetail, '상세주소');
    // 주거종류: 아파트→1, 빌라→2, 연립→3, 다세대→4, 단독주택→5, 상가→6, 오피스텔→7, 관사→8
    const housingMap = {'아파트':'1','빌라':'2','연립':'3','다세대':'4','단독주택':'5','상가':'6','오피스텔':'7','관사':'8','기타':'99'};
    setSelect('h_kind', housingMap[data.housingType] || data.housingType, '주거종류');
    // 주택소유: 소유→11, 미소유→12
    const ownMap = {'부동산 소유중':'11','부동산 없음':'12','기타':'99'};
    setSelect('h_sel', ownMap[data.housingOwnership] || data.housingOwnership, '주택소유');

    // === 직장 정보 ===
    // 직업구분: 직장인(4대가입)→1, 직장인(미가입)→2, 개인사업자→3, 프리랜서→4, 무직→7, 주부→8, 학생→9
    const jobMap = {'직장인(4대가입)':'1','직장인(미가입)':'2','개인사업자':'3','프리랜서':'4','무직':'7','주부':'8','학생':'9'};
    setSelect('j_sel', jobMap[data.jobType] || data.jobType, '직업구분');
    // 4대보험: 가입→Y, 미가입→N
    const insuMap = {'가입':'Y','미가입':'N'};
    setSelect('j_IsInsu', insuMap[data.insurance4] || data.insurance4, '4대보험');
    setInput('j_name', data.company, '직장명');
    setInput('j_date', data.joinDate, '입사일자');
    setInput('j_no1', data.bizNo1, '사업자번호1');
    setInput('j_no2', data.bizNo2, '사업자번호2');
    setInput('j_no3', data.bizNo3, '사업자번호3');
    setInput('j_pay1', data.salary, '연소득');
    setInput('j_pay2', data.monthlySalary, '월소득');
    setInput('j_insu_money', data.healthInsurance, '건강보험납부금');
    // 직장 주소
    setInput('j_zonecode', data.workZipcode, '직장우편번호');
    setInput('j_addr1', data.workAddress, '직장주소');
    setInput('j_addr2', data.workAddressDetail, '직장상세주소');

    // === 차량 정보 ===
    setInput('car_no', data.vehicleNo, '차량번호');
    setInput('car_name', data.vehicleName, '차량명');
    setSelect('car_year', data.vehicleYear, '차량연식');
    setInput('car_distance', data.vehicleKm, '주행거리');
    // 차량소유: 소유(본인명의)→1, 소유(공동명의 대표)→2, 소유(공동명의)→3, 미소유→4
    const carOwnMap = {'소유(본인명의)':'1','소유(공동명의 대표)':'2','소유(공동명의)':'3','미소유':'4'};
    setSelect('car_sel', carOwnMap[data.vehicleOwnership] || data.vehicleOwnership, '차량소유');
    setInput('car_joinown_name', data.vehicleCoOwner, '공동명의자');

    // === 회파복 ===
    // 회파복: 회생→1, 파산→2, 회복→3, 무→99
    const brtMap = {'회생':'1','파산':'2','회복':'3','무':'99','==선택==':'','선택':''};
    setSelect('brt_tp', brtMap[data.recoveryType] || data.recoveryType, '회파복구분');
    setInput('brt_court_name', data.courtName, '법원명');
    // 사건번호: 연도/종류/번호 분리
    if (data.caseNoYear) setSelect('brt_no1', data.caseNoYear, '사건연도');
    if (data.caseNoType) setSelect('brt_no2', data.caseNoType, '사건종류');
    if (data.caseNoNum) setInput('brt_no3', data.caseNoNum, '사건번호');
    setSelect('brt_bank', data.refundBankCode || data.refundBank, '환급은행');
    setInput('brt_bank_addr', data.refundAccount, '환급계좌');
    setInput('brt_month_repay_amt', data.monthlyPayment, '월변제금');

    // === 기타 (메모 → call_memo1) ===
    setInput('call_memo1', data.memo, '메모');

    return { filled, notFound };
  }, formData);

  // 3단계: alert 다이얼로그 핸들러 (제출 전에 등록)
  let alertMessage = '';
  const dialogHandler = async dialog => {
    alertMessage = dialog.message();
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);

  // 제출 버튼 클릭
  const submitResult = await page.evaluate(() => {
    // 제출/등록/저장 버튼 찾기
    const allBtns = document.querySelectorAll('input[type="submit"], input[type="button"], button, a');
    for (const btn of allBtns) {
      const text = (btn.value || btn.textContent || '').trim();
      if (text.includes('등록') || text.includes('접수') || text.includes('저장') || text.includes('신청')) {
        // "초기화", "취소" 등 제외
        if (text.includes('초기화') || text.includes('취소') || text.includes('삭제')) continue;
        btn.click();
        return { clicked: true, buttonText: text };
      }
    }
    // form submit 시도
    const form = document.querySelector('form');
    if (form) {
      form.submit();
      return { clicked: true, buttonText: 'form.submit()' };
    }
    return { clicked: false, buttonText: '' };
  });

  // 제출 후 페이지 이동/응답 대기
  let submitResponse = null;
  if (submitResult.clicked) {
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      await delay(500, 1000);

      // 제출 결과 확인 (성공/실패 메시지 추출)
      submitResponse = await page.evaluate(() => {
        const body = document.body.innerText;
        // alert 팝업이 뜬 경우 body에 포함될 수 있음
        const isSuccess = body.includes('완료') || body.includes('성공') || body.includes('접수되었습니다') || body.includes('등록되었습니다');
        const isError = body.includes('실패') || body.includes('오류') || body.includes('에러') || body.includes('ERROR');
        return {
          pageText: body.substring(0, 500),
          isSuccess,
          isError,
          url: location.href
        };
      });
    } catch (e) {
      // 네비게이션 안 되면 alert 팝업일 수 있음
      submitResponse = { pageText: '페이지 이동 없음 (alert 팝업 가능)', isSuccess: false, isError: false };
    }
  }

  // 핸들러 해제
  page.off('dialog', dialogHandler);
  if (alertMessage) {
    submitResponse = submitResponse || {};
    submitResponse.alertMessage = alertMessage;
  }

  const pageUrl = page.url();

  return {
    success: submitResult.clicked,
    message: submitResult.clicked
      ? `폼 입력 (${fillResult.filled.length}개) + 제출 완료 [${submitResult.buttonText}]`
      : `폼 입력 완료 (${fillResult.filled.length}개). 제출 버튼을 찾지 못했습니다.`,
    filledCount: fillResult.filled.length,
    filledFields: fillResult.filled,
    notFoundFields: fillResult.notFound,
    submitResult,
    submitResponse,
    pageUrl
  };
}

// 브라우저 종료
// 대출신청내역 목록 가져오기 (사용자 행동 모방)
async function getLoanList(agentNo, upw, filters = {}) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  let url = `${LOAN_LIST_URL}?no=${agentNo}&upw=${upw}`;

  // 필터 파라미터 추가
  if (filters.status) url += `&s_state=${encodeURIComponent(filters.status)}`;
  if (filters.dateType) url += `&s_date_type=${filters.dateType}`;
  if (filters.dateRange) url += `&s_date_range=${filters.dateRange}`;
  if (filters.product) url += `&s_fin_name=${encodeURIComponent(filters.product)}`;

  console.log('[크롤러] 대출목록 조회:', url);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  // AJAX 데이터 로드 대기 (테이블에 td가 나올 때까지)
  await page.waitForSelector('table td', { timeout: 10000 }).catch(() => {});
  await delay(1000, 1500);
  console.log('[크롤러] 페이지 로드 완료');

  const data = await page.evaluate(() => {
    const rows = [];
    const debug = { tableCount: 0, thTexts: [], tdCounts: [], pageTitle: document.title, bodyLength: document.body.innerText.length };

    const allTables = document.querySelectorAll('table');
    debug.tableCount = allTables.length;

    for (const t of allTables) {
      const ths = t.querySelectorAll('th');
      const thTexts = [...ths].map(th => th.textContent.trim());
      if (thTexts.length > 3) debug.thTexts.push(thTexts.join(','));

      // 이름 또는 고객명 포함 테이블 찾기
      if (thTexts.some(x => x.includes('이름') || x.includes('고객')) && thTexts.some(x => x.includes('상태') || x.includes('처리'))) {
        const trs = t.querySelectorAll('tr');
        for (const tr of trs) {
          const tds = tr.querySelectorAll('td');
          debug.tdCounts.push(tds.length);
          if (tds.length >= 8) {
            rows.push({
              applyDate: tds[0]?.textContent?.trim() || '',
              processDate: tds[1]?.textContent?.trim() || '',
              productName: tds[2]?.textContent?.trim() || tds[3]?.textContent?.trim() || '',
              recruiter: tds[3]?.textContent?.trim() || tds[4]?.textContent?.trim() || '',
              customerName: tds[4]?.textContent?.trim() || tds[7]?.textContent?.trim() || '',
              birthDate: tds[5]?.textContent?.trim() || tds[8]?.textContent?.trim() || '',
              gender: tds[6]?.textContent?.trim() || tds[9]?.textContent?.trim() || '',
              jobType: tds[7]?.textContent?.trim() || tds[10]?.textContent?.trim() || '',
              status: tds[8]?.textContent?.trim() || tds[11]?.textContent?.trim() || '',
              approvedAmount: tds[9]?.textContent?.trim() || tds[12]?.textContent?.trim() || '',
              reviewMemo: tds[10]?.textContent?.trim() || tds[13]?.textContent?.trim() || '',
              branchMemo: tds[11]?.textContent?.trim() || tds[14]?.textContent?.trim() || '',
            });
          }
        }
        break;
      }
    }

    // 요약 정보
    const summaryText = document.body.innerText;
    const summaryMatch = summaryText.match(/금일.*접수:(\d+)건.*승인:(\d+)건\/([\d,]+)만원.*부결:(\d+)건/);
    const summary = summaryMatch ? {
      todayApply: parseInt(summaryMatch[1]),
      todayApproved: parseInt(summaryMatch[2]),
      todayApprovedAmount: summaryMatch[3],
      todayRejected: parseInt(summaryMatch[4])
    } : null;

    const total = rows.length;
    return { rows, summary, total, debug };
  });

  console.log('[크롤러] 파싱 결과:', data.rows?.length, '건, 테이블:', data.debug?.tableCount, ', TH:', JSON.stringify(data.debug?.thTexts?.slice(0,3)));

  return {
    ...data,
    fetchedAt: new Date().toISOString()
  };
}

// 대출신청 상세 정보 1건 가져오기
async function getLoanDetail(detailUrl) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  await delay(2000, 3500);
  await page.goto(LMASTER_BASE + detailUrl, { waitUntil: 'networkidle2' });
  await delay(1000, 2000);

  const data = await page.evaluate(() => {
    return { body: document.body.innerText };
  });

  return {
    ...data,
    fetchedAt: new Date().toISOString()
  };
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    isLoggedIn = false;
  }
}

// 현재 페이지 테이블 HTML 디버그
async function getPageHtml() {
  if (!page) throw new Error('브라우저가 실행 중이 아닙니다.');
  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const result = { tables: [], bodySnippet: document.body.innerHTML.substring(0, 3000) };
    tables.forEach((t, i) => {
      const rows = t.querySelectorAll('tr');
      const rowData = [];
      rows.forEach((r, j) => {
        if (j < 3) { // 첫 3행만
          const cells = [...r.querySelectorAll('th,td')].map(c => c.textContent.trim().substring(0, 30));
          rowData.push(cells);
        }
      });
      result.tables.push({ index: i, totalRows: rows.length, firstRows: rowData, html: t.outerHTML.substring(0, 500) });
    });
    return result;
  });
}

// 상태 확인
function getStatus() {
  return {
    browserRunning: !!browser,
    isLoggedIn,
    pageUrl: page ? page.url() : null
  };
}

module.exports = {
  login,
  getProductGuide,
  getProductFidxMap,
  scanFormFields,
  submitLoanApplication,
  getLoanList,
  getLoanDetail,
  closeBrowser,
  getStatus,
  getPageHtml
};

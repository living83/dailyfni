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
    headless: 'new',
    defaultViewport: { width: 1280, height: 900 },
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

  // 2단계: 폼 필드 일괄 입력
  const fillResult = await page.evaluate((data) => {
    const filled = [];
    const notFound = [];

    // 필드명 매핑: formData 키 → 론앤마스터 폼의 name/id 패턴
    const fieldMap = {
      // 고객 기본정보
      name: ['name', 'u_name', 's_name', 'cust_name', 'customer_name', 'uname'],
      birth: ['birth', 'u_birth', 'birthday', 'jumin1', 'ssn1', 'birth_date'],
      gender: ['gender', 'u_gender', 'sex', 'u_sex'],
      phone1: ['phone1', 'hp1', 'u_hp1', 'tel1', 'mobile1', 'u_phone1'],
      phone2: ['phone2', 'hp2', 'u_hp2', 'tel2', 'mobile2', 'u_phone2'],
      phone3: ['phone3', 'hp3', 'u_hp3', 'tel3', 'mobile3', 'u_phone3'],
      carrier: ['carrier', 'telecom', 'u_telecom', 'phone_co', 'u_carrier'],
      // 대출 정보
      loanAmount: ['loan_amount', 'hope_amount', 'req_amount', 'amount', 'u_amount', 'hope_money'],
      // 직업 정보
      jobType: ['job_type', 'u_job', 'job', 'occupation', 'u_jobtype', 'job_kind'],
      company: ['company', 'u_company', 'comp_name', 'workplace', 'u_comp'],
      salary: ['salary', 'income', 'u_salary', 'year_income', 'u_income', 'annual_income'],
      monthlySalary: ['month_salary', 'month_income', 'u_month_salary', 'monthly_income'],
      joinDate: ['join_date', 'enter_date', 'u_joindate', 'work_start', 'u_enter_date'],
      insurance4: ['insurance', 'u_insurance', 'ins_4', '4dae', 'u_4dae', 'insurance_yn'],
      bizNo1: ['biz_no1', 'saup1', 'u_saup1', 'business_no1'],
      bizNo2: ['biz_no2', 'saup2', 'u_saup2', 'business_no2'],
      bizNo3: ['biz_no3', 'saup3', 'u_saup3', 'business_no3'],
      // 주소
      zipcode: ['zipcode', 'zip', 'u_zip', 'zonecode', 'post'],
      address: ['address', 'addr', 'u_addr', 'u_address', 'road_addr'],
      addressDetail: ['addr_detail', 'u_addr2', 'addr2', 'detail_addr', 'address_detail'],
      // 주거
      housingType: ['house_type', 'u_house', 'housing', 'u_housing', 'home_type'],
      housingOwnership: ['house_own', 'u_houseown', 'own_house', 'u_own_house', 'property'],
      // 차량
      vehicleNo: ['car_no', 'u_carno', 'vehicle_no', 'u_car_no', 'carnum'],
      vehicleName: ['car_name', 'u_carname', 'vehicle_name', 'u_car_name'],
      vehicleYear: ['car_year', 'u_caryear', 'vehicle_year', 'u_car_year'],
      vehicleKm: ['car_km', 'u_carkm', 'mileage', 'u_mileage', 'car_distance'],
      vehicleOwnership: ['car_own', 'u_carown', 'car_owner', 'u_car_owner', 'vehicle_own'],
      vehicleCoOwner: ['co_owner', 'u_coowner', 'car_coowner', 'u_car_coowner'],
      // 회파복
      recoveryType: ['recovery', 'u_recovery', 'hoe_type', 'u_hoetype', 'hoepabog'],
      courtName: ['court', 'u_court', 'court_name', 'u_court_name'],
      caseNo: ['case_no', 'u_caseno', 'case_num', 'u_case_no', 'sageonno'],
      refundBank: ['refund_bank', 'u_bank', 'bank', 'u_refundbank', 'return_bank'],
      refundAccount: ['refund_account', 'u_account', 'account', 'u_refundaccount', 'bank_account'],
      monthlyPayment: ['monthly_pay', 'u_monthlypay', 'month_pay', 'u_month_pay', 'byunje'],
      // 직장 주소
      workZipcode: ['w_zip', 'u_wzip', 'comp_zip', 'work_zip', 'u_work_zip'],
      workAddress: ['w_addr', 'u_waddr', 'comp_addr', 'work_addr', 'u_work_addr'],
      workAddressDetail: ['w_addr2', 'u_waddr2', 'comp_addr2', 'work_addr2', 'u_work_addr2'],
      // 기타
      memo: ['memo', 'u_memo', 'etc', 'remark', 'u_remark', 'note', 'u_note', 'bigo'],
      healthInsurance: ['health_ins', 'u_health', 'health_amount', 'u_health_ins'],
      creditScore: ['credit_score', 'u_credit', 'nice_score', 'u_score'],
      dbSource: ['db_source', 'u_dbsource', 'route', 'u_route', 'inflow'],
    };

    // input/textarea 채우기
    function fillInput(fieldKey, value) {
      if (!value && value !== 0) return;
      const patterns = fieldMap[fieldKey] || [fieldKey];
      for (const pat of patterns) {
        const el = document.querySelector(`input[name="${pat}"], input[id="${pat}"], textarea[name="${pat}"], textarea[id="${pat}"]`);
        if (el) {
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filled.push({ field: fieldKey, target: pat, value: String(value) });
          return true;
        }
      }
      // 패턴 부분 일치 시도
      for (const pat of patterns) {
        const el = document.querySelector(`input[name*="${pat}"], textarea[name*="${pat}"]`);
        if (el && el.type !== 'hidden') {
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filled.push({ field: fieldKey, target: el.name || el.id, value: String(value) });
          return true;
        }
      }
      notFound.push(fieldKey);
      return false;
    }

    // select 채우기
    function fillSelect(fieldKey, value) {
      if (!value) return;
      const patterns = fieldMap[fieldKey] || [fieldKey];
      for (const pat of patterns) {
        const el = document.querySelector(`select[name="${pat}"], select[id="${pat}"]`);
        if (el) {
          // value 일치
          for (const opt of el.options) {
            if (opt.value === String(value) || opt.text.trim() === String(value) || opt.text.includes(String(value))) {
              el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              filled.push({ field: fieldKey, target: pat, value: opt.text.trim() });
              return true;
            }
          }
        }
      }
      // 부분 일치
      for (const pat of patterns) {
        const el = document.querySelector(`select[name*="${pat}"]`);
        if (el) {
          for (const opt of el.options) {
            if (opt.text.includes(String(value))) {
              el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              filled.push({ field: fieldKey, target: el.name, value: opt.text.trim() });
              return true;
            }
          }
        }
      }
      notFound.push(fieldKey);
      return false;
    }

    // 필드 채우기 실행
    fillInput('name', data.name);
    fillInput('birth', data.birth);
    fillSelect('gender', data.gender);
    fillSelect('carrier', data.carrier);
    fillInput('phone1', data.phone1);
    fillInput('phone2', data.phone2);
    fillInput('phone3', data.phone3);
    fillInput('loanAmount', data.loanAmount);
    fillSelect('jobType', data.jobType);
    fillInput('company', data.company);
    fillInput('salary', data.salary);
    fillInput('monthlySalary', data.monthlySalary);
    fillInput('joinDate', data.joinDate);
    fillSelect('insurance4', data.insurance4);
    fillInput('bizNo1', data.bizNo1);
    fillInput('bizNo2', data.bizNo2);
    fillInput('bizNo3', data.bizNo3);
    fillInput('zipcode', data.zipcode);
    fillInput('address', data.address);
    fillInput('addressDetail', data.addressDetail);
    fillSelect('housingType', data.housingType);
    fillSelect('housingOwnership', data.housingOwnership);
    fillInput('vehicleNo', data.vehicleNo);
    fillInput('vehicleName', data.vehicleName);
    fillSelect('vehicleYear', data.vehicleYear);
    fillInput('vehicleKm', data.vehicleKm);
    fillSelect('vehicleOwnership', data.vehicleOwnership);
    fillInput('vehicleCoOwner', data.vehicleCoOwner);
    fillSelect('recoveryType', data.recoveryType);
    fillInput('courtName', data.courtName);
    fillInput('caseNo', data.caseNo);
    fillSelect('refundBank', data.refundBank);
    fillInput('refundAccount', data.refundAccount);
    fillInput('monthlyPayment', data.monthlyPayment);
    fillInput('workZipcode', data.workZipcode);
    fillInput('workAddress', data.workAddress);
    fillInput('workAddressDetail', data.workAddressDetail);
    fillInput('memo', data.memo);
    fillInput('healthInsurance', data.healthInsurance);
    fillInput('creditScore', data.creditScore);

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

  await delay(2000, 4000);
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(1500, 2500);

  const data = await page.evaluate(() => {
    const rows = [];
    const table = document.querySelector('table.tbl_list') || document.querySelector('table[class*=list]');

    if (!table) {
      // 테이블 클래스를 못 찾으면 모든 테이블에서 탐색
      const allTables = document.querySelectorAll('table');
      for (const t of allTables) {
        const ths = t.querySelectorAll('th');
        const thTexts = [...ths].map(th => th.textContent.trim());
        if (thTexts.includes('이름') && thTexts.includes('처리상태')) {
          // 이 테이블이 대출 목록 테이블
          const trs = t.querySelectorAll('tbody tr, tr');
          for (const tr of trs) {
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 10) {
              rows.push({
                applyDate: tds[0]?.textContent?.trim() || '',
                processDate: tds[1]?.textContent?.trim() || '',
                agency: tds[2]?.textContent?.trim() || '',
                productName: tds[3]?.textContent?.trim() || '',
                recruiter: tds[4]?.textContent?.trim() || '',
                auth: tds[5]?.textContent?.trim() || '',
                consent: tds[6]?.textContent?.trim() || '',
                customerName: tds[7]?.textContent?.trim() || '',
                birthDate: tds[8]?.textContent?.trim() || '',
                gender: tds[9]?.textContent?.trim() || '',
                jobType: tds[10]?.textContent?.trim() || '',
                status: tds[11]?.textContent?.trim() || '',
                approvedAmount: tds[12]?.textContent?.trim() || '',
                reviewMemo: tds[13]?.textContent?.trim() || '',
                branchMemo: tds[14]?.textContent?.trim() || '',
              });
            }
          }
          break;
        }
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

    // 페이지 정보
    const pageText = document.body.innerText;
    const totalMatch = pageText.match(/(\d+)건/);
    const total = totalMatch ? parseInt(totalMatch[1]) : 0;

    return { rows, summary, total };
  });

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
  getStatus
};

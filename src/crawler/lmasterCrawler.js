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
const NOTICE_LIST_URL = LMASTER_BASE + '/admin/bbs/notice/list.asp';

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

// 대출 신청서 자동 입력
// options.dryRun=true 면 폼 채우기까지만 하고 제출 직전에 멈춤 (스크린샷 반환)
async function submitLoanApplication(agentNo, upw, formData, options = {}) {
  const { dryRun = false } = options;
  if (!isLoggedIn) throw new Error('론앤마스터 로그인이 필요합니다. 상단의 [론앤마스터 연동] 버튼을 눌러 재로그인하세요.');

  const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(500, 1000);

  // 로그아웃 / 세션만료 페이지 조기 감지 (로그인 재시도 유도)
  const sessionCheck = await page.evaluate(() => {
    const body = document.body?.innerText || '';
    const href = location.href || '';
    const patterns = ['ACCESS_Deny', 'InValid_LoginInfo', '로그아웃되었습니다', '로그아웃 되었습니다', '세션이 만료', 'Session Timeout', 'login.asp'];
    const matched = patterns.find(p => body.includes(p) || href.includes(p));
    return matched ? { kicked: true, reason: matched, url: href, snippet: body.substring(0, 300) } : { kicked: false };
  });
  if (sessionCheck.kicked) {
    isLoggedIn = false; // 로컬 플래그 정정
    const err = new Error(`론앤마스터 세션이 만료되어 로그아웃되었습니다 (감지: "${sessionCheck.reason}"). 상단의 [론앤마스터 연동] 버튼으로 재로그인 후 다시 시도하세요.`);
    err.code = 'LMASTER_SESSION_EXPIRED';
    err.detail = sessionCheck;
    throw err;
  }

  // 1단계: 상품 선택 (fidx 기반) - 다양한 패턴 커버
  let productSelectResult = { selected: false, via: null, detail: '' };
  if (formData.fidx) {
    productSelectResult = await page.evaluate((fidx) => {
      const fidxStr = String(fidx);
      const fidxNum = Number(fidx);

      // 1) radio/checkbox input: value 일치
      const radios = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      for (const r of radios) {
        if (String(r.value) === fidxStr) {
          r.click();
          // label 클릭이 필요한 경우 대비
          if (r.id) {
            const lbl = document.querySelector(`label[for="${r.id}"]`);
            if (lbl) lbl.click();
          }
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
          return { selected: true, via: 'radio/checkbox', detail: `name=${r.name}, value=${r.value}` };
        }
      }

      // 2) select 옵션
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        for (const opt of sel.options) {
          if (String(opt.value) === fidxStr || opt.getAttribute('data-fidx') === fidxStr) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return { selected: true, via: 'select', detail: `name=${sel.name}, value=${opt.value}, text=${opt.text.trim()}` };
          }
        }
      }

      // 3) onclick / href / data-* 속성이 fidx를 참조하는 클릭 가능 요소
      //    element 본문이나 자식의 텍스트에 fidx 숫자가 그대로 있는 경우도 매칭
      const allEls = document.querySelectorAll('a, input[type="button"], input[type="submit"], button, span, td, tr, div, li, label');
      // 정규식: fidx=2197 / fidx:2197 / fidx('2197') / fidx(2197) / (2197) / '2197'
      const rx = new RegExp(`(?:^|[^0-9])${fidxStr}(?:$|[^0-9])`);
      for (const el of allEls) {
        const onclick = el.getAttribute('onclick') || '';
        const href = el.getAttribute('href') || '';
        const dataFidx = el.getAttribute('data-fidx') || el.getAttribute('data-idx') || '';

        const matchOnclick = onclick && (
          onclick.includes(`fidx=${fidxStr}`) ||
          onclick.includes(`fidx:${fidxStr}`) ||
          onclick.includes(`'${fidxStr}'`) ||
          onclick.includes(`"${fidxStr}"`) ||
          onclick.includes(`(${fidxStr})`) ||
          onclick.includes(`(${fidxStr},`) ||
          onclick.includes(`,${fidxStr})`) ||
          onclick.includes(`,${fidxStr},`) ||
          rx.test(onclick)
        );
        const matchHref = href && (
          href.includes(`fidx=${fidxStr}`) ||
          href.includes(`/${fidxStr}`) ||
          href.includes(`=${fidxStr}`)
        );
        const matchData = String(dataFidx) === fidxStr;

        if (matchOnclick || matchHref || matchData) {
          try { el.click(); } catch (e) {}
          return { selected: true, via: 'onclick/href/data', detail: `tag=${el.tagName}, text="${(el.textContent || '').trim().substring(0,40)}", onclick="${onclick.substring(0,80)}", data-fidx=${dataFidx}` };
        }
      }

      // 4) fileblank(fidx) 같은 패턴의 input name → 그 주변 행/그룹에서 클릭 가능한 요소 탐색
      const fileInput = document.querySelector(`input[name="fileblank(${fidxStr})"], input[name="file(${fidxStr})"]`);
      if (fileInput) {
        // 같은 행(tr)이나 부모 그룹에서 라디오/체크박스/라벨/버튼 클릭 시도
        const row = fileInput.closest('tr, li, div, label');
        if (row) {
          const radio = row.querySelector('input[type="radio"], input[type="checkbox"]');
          if (radio) {
            radio.click();
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            return { selected: true, via: 'fileblank-neighbor-radio', detail: `name=${radio.name}, value=${radio.value}` };
          }
          const label = row.querySelector('label');
          if (label) {
            label.click();
            return { selected: true, via: 'fileblank-neighbor-label', detail: `text=${(label.textContent||'').trim().substring(0,40)}` };
          }
        }
      }

      // 5) 전역 함수 호출 시도 (흔한 이름들)
      try {
        const globalFnNames = ['fn_fidx', 'go_fidx', 'select_fidx', 'selectFin', 'fn_sel', 'setFidx', 'chkFin', 'selFin'];
        for (const fn of globalFnNames) {
          if (typeof window[fn] === 'function') {
            window[fn](fidxNum);
            return { selected: true, via: 'global-fn', detail: `window.${fn}(${fidx})` };
          }
        }
      } catch (e) {}

      return { selected: false, via: null, detail: 'no matching element found' };
    }, formData.fidx);

    if (productSelectResult.selected) {
      await delay(500, 1000);
      // 상품 선택 후 페이지 변경 대기 (네비게이션 없이 부분 업데이트일 수도 있음)
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
      await delay(300, 500);
    }
  }

  // 2단계: 폼 필드 일괄 입력 (론앤마스터 실제 필드명 기반)
  const fillResult = await page.evaluate((data) => {
    const filled = [];
    const notFound = [];

    // 날짜 정규화: 'YYYYMMDD' / 'YYYY-MM-DD' / 'YYYY/MM/DD' / 'YYYY.MM.DD' 모두 'YYYY-MM-DD'
    // 론앤마스터 date picker 는 YYYY-MM-DD 만 인식 (빨간 박스 방지)
    function normalizeDate(s) {
      if (!s && s !== 0) return '';
      const m = String(s).match(/(\d{4})[^\d]?(\d{1,2})[^\d]?(\d{1,2})/);
      if (!m) return String(s);
      const mm = m[2].padStart(2, '0');
      const dd = m[3].padStart(2, '0');
      return `${m[1]}-${mm}-${dd}`;
    }

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
      // 전산에서 placeholder 상태로 넘어온 경우 setSelect 실행 안 함 → 명시적 notFound
      const vs = String(value).trim();
      const looksPlaceholder = /^-.*-$/.test(vs) || /^==.*==$/.test(vs) ||
                               /항목\s*선택|선택\s*하세요|선택해?주세요/.test(vs);
      if (looksPlaceholder) { notFound.push((label || name) + ' [값이 placeholder]'); return; }

      const el = document.querySelector(`select[name="${name}"]`);
      if (el) {
        // 정확한 value 매칭
        for (const opt of el.options) {
          if (opt.value === vs) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled.push({ field: label || name, target: name, value: opt.text.trim() });
            return;
          }
        }
        // 텍스트 포함 매칭 - 단, 매칭된 옵션이 placeholder 면 거부
        for (const opt of el.options) {
          const ot = opt.text.trim();
          if (/^-.*-$/.test(ot) || /^==.*==$/.test(ot) || /항목\s*선택|선택\s*하세요/.test(ot)) continue;
          if (opt.text.includes(vs) || vs.includes(ot)) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled.push({ field: label || name, target: name, value: ot });
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

    // 휴대폰: hpon1/2/3 가 '연락처수정' 같은 버튼 뒤에 가려져 있는 경우가 있어 먼저 노출시킴
    (function unmaskPhone() {
      try {
        // 이미 가시 상태면 skip
        const test = document.querySelector('input[name="hpon1"]');
        const isVisible = (el) => el && el.offsetParent !== null;
        if (isVisible(test) && test.type !== 'hidden') return;
        // 연락처수정/휴대폰수정/편집 등 버튼 찾아 클릭
        const btns = Array.from(document.querySelectorAll('button, input[type="button"], a, span'));
        for (const b of btns) {
          const t = (b.value || b.textContent || '').trim();
          if (/연락처\s*수정|휴대폰\s*수정|전화\s*수정|핸드폰\s*수정|phone.*edit/i.test(t)) {
            try { b.click(); } catch {}
            break;
          }
        }
      } catch {}
    })();

    setInput('hpon1', data.phone1, '전화1');
    setInput('hpon2', data.phone2, '전화2');
    setInput('hpon3', data.phone3, '전화3');

    // 채운 뒤 실제로 DOM 에 반영됐는지 검증 (hidden 이거나 값이 안 들어갔으면 명시)
    (function verifyPhone() {
      ['hpon1','hpon2','hpon3'].forEach(n => {
        const el = document.querySelector(`input[name="${n}"]`);
        if (!el) { notFound.push(n + ' [미존재]'); return; }
        if (el.offsetParent === null || el.type === 'hidden') {
          notFound.push(n + ' [여전히 hidden — 연락처수정 버튼 필요]');
        } else if (!el.value) {
          notFound.push(n + ' [값 미반영]');
        }
      });
    })();
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
    setInput('j_date', normalizeDate(data.joinDate), '입사일자');
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

    // === 고객적법확인 (아이앤유/대부 등) ===
    // 론앤마스터 input 이름 (스캔 확인): call_date, call_comp, call_staff, call_ceo, call_url
    // select (최초수집경로 / 중개사연락처경로) 는 이름이 불확실 → 라벨 매칭 우선 + 후보명 fallback
    const legal = data.legal || {};
    if (Object.keys(legal).length > 0) {
      setInput('call_date',  normalizeDate(legal.writeDate), '작성년월일');
      setInput('call_comp',  legal.company,   '회사명');
      setInput('call_staff', legal.writer,    '작성자명');
      setInput('call_ceo',   legal.ceo,       '대표자명');
      setInput('call_url',   legal.url,       '접수주소(URL)');

      // 최초수집경로 / 중개사연락처경로 — 라벨 기반 select 탐색 후 text 매칭
      const findSelectByLabel = (rxLabel) => {
        const selects = document.querySelectorAll('select');
        for (const sel of selects) {
          const label = sel.closest('tr')?.querySelector('th, td:first-child')?.textContent?.trim() || '';
          if (rxLabel.test(label)) return sel;
        }
        return null;
      };
      const setSelectByText = (sel, text, labelForLog) => {
        if (!sel || !text) return false;
        for (const opt of sel.options) {
          if (opt.text.trim() === String(text).trim()) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            filled.push({ field: labelForLog, target: sel.name || '(select)', value: opt.text.trim() });
            return true;
          }
        }
        // 부분 매칭 fallback
        for (const opt of sel.options) {
          if (opt.text.includes(String(text)) || String(text).includes(opt.text.trim())) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            filled.push({ field: labelForLog + ' (부분매칭)', target: sel.name || '(select)', value: opt.text.trim() });
            return true;
          }
        }
        return false;
      };

      if (legal.firstPath) {
        const firstSel = findSelectByLabel(/최초수집경로|수집경로/);
        if (firstSel) {
          if (!setSelectByText(firstSel, legal.firstPath, '최초수집경로')) notFound.push('최초수집경로');
        } else {
          // 후보명 직접 매칭
          for (const n of ['call_path', 'call_path1', 'call_origin', 'src_path', 'call_first']) {
            const el = document.querySelector(`select[name="${n}"]`);
            if (el) { if (!setSelectByText(el, legal.firstPath, `최초수집경로[${n}]`)) notFound.push('최초수집경로'); break; }
          }
        }
      }
      if (legal.brokerPath) {
        const brSel = findSelectByLabel(/중개사연락처경로|연락처경로|중개사경로/);
        if (brSel) {
          if (!setSelectByText(brSel, legal.brokerPath, '중개사연락처경로')) notFound.push('중개사연락처경로');
        } else {
          for (const n of ['call_path2', 'call_contact', 'broker_path', 'call_broker']) {
            const el = document.querySelector(`select[name="${n}"]`);
            if (el) { if (!setSelectByText(el, legal.brokerPath, `중개사연락처경로[${n}]`)) notFound.push('중개사연락처경로'); break; }
          }
        }
      }
    }

    // === 기타 (메모) ===
    // 실제 화면에 보이는 textarea 에 우선 기재해야 접수원이 확인 가능.
    // call_memo1/2/3 는 상품별로 hidden 이 많아 화면 반영이 안 되는 케이스 있음.
    if (data.memo) {
      const memoVal = String(data.memo);
      const isVisible = (el) => {
        if (!el) return false;
        if (el.offsetParent === null) return false;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        if (el.type === 'hidden') return false;
        return true;
      };
      const getLabel = (el) => el.closest('tr')?.querySelector('th, td:first-child')?.textContent?.trim()
        || el.closest('label')?.textContent?.trim() || '';

      const memoCandidateNames = ['call_memo1', 'call_memo2', 'call_memo3', 'call_memo',
        'memo', 'etc', 'etc1', 'bigo', 'remark', 'note', 'content', 'detail'];

      let memoTarget = null;

      // 1) 이름이 후보 목록인 **가시** textarea/input 우선
      for (const n of memoCandidateNames) {
        const els = document.querySelectorAll(`textarea[name="${n}"], input[name="${n}"]`);
        for (const el of els) {
          if (isVisible(el)) { memoTarget = { el, name: n, via: 'visible-candidate-name' }; break; }
        }
        if (memoTarget) break;
      }

      // 2) 이름은 달라도 라벨에 "기타/메모/비고/특이/상담" 들어가는 **가시** textarea
      if (!memoTarget) {
        const allTas = document.querySelectorAll('textarea');
        for (const ta of allTas) {
          if (!isVisible(ta)) continue;
          const label = getLabel(ta);
          if (/기타|메모|비고|특이|상담|call_memo|상세/.test(label)) {
            memoTarget = { el: ta, name: ta.name || `(textarea:${label.substring(0,20)})`, via: 'visible-label-match' };
            break;
          }
        }
      }

      // 3) 그래도 없으면: **마지막 가시 textarea** (보통 기타사항이 폼 하단)
      if (!memoTarget) {
        const allVisTas = Array.from(document.querySelectorAll('textarea')).filter(isVisible);
        if (allVisTas.length > 0) {
          const ta = allVisTas[allVisTas.length - 1];
          memoTarget = { el: ta, name: ta.name || '(last-visible-textarea)', via: 'last-visible-textarea' };
        }
      }

      // 4) 최후 폴백: 존재하는 아무 call_memo* (hidden 이라도) - 최소 백엔드 전송 보장
      if (!memoTarget) {
        for (const n of ['call_memo1', 'call_memo2', 'call_memo3']) {
          const el = document.querySelector(`textarea[name="${n}"], input[name="${n}"]`);
          if (el) { memoTarget = { el, name: n, via: 'hidden-call_memo-fallback' }; break; }
        }
      }

      if (memoTarget) {
        memoTarget.el.value = memoVal;
        memoTarget.el.dispatchEvent(new Event('input', { bubbles: true }));
        memoTarget.el.dispatchEvent(new Event('change', { bubbles: true }));
        filled.push({ field: `메모 [${memoTarget.via}]`, target: memoTarget.name, value: memoVal.substring(0, 120) });
      } else {
        notFound.push('메모');
      }
    }

    return { filled, notFound };
  }, formData);

  // === Dry-run: 제출 직전에 멈추고 스크린샷/미매칭 필드 반환 ===
  if (dryRun) {
    let screenshot = '';
    try {
      screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
    } catch (e) {
      // 스크린샷 실패 시에도 필수 데이터는 반환
      screenshot = '';
    }
    return {
      success: true,
      dryRun: true,
      message: `[Dry-run] 폼 입력 (${fillResult.filled.length}개). 제출되지 않았습니다.`,
      filledCount: fillResult.filled.length,
      filledFields: fillResult.filled,
      notFoundFields: fillResult.notFound,
      productSelectResult,
      screenshot,
      pageUrl: page.url()
    };
  }

  // 3단계: alert 다이얼로그 핸들러 (제출 전에 등록)
  let alertMessage = '';
  const dialogHandler = async dialog => {
    alertMessage = dialog.message();
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);

  // 제출 버튼 클릭 (정확 매칭 우선 + 강화된 deny list, fallback 없음 — 못 찾으면 실패)
  // 이전 버그: '등록'만 포함해도 매칭되어 '등록업체조회' 같은 조회 버튼을 눌러버림
  const submitResult = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button, a'));

    // 허용 단어
    const ALLOW = ['접수', '등록', '저장', '신청', '제출', '완료'];
    // 정확 매칭 대상 (최우선)
    const EXACT = [
      '접수', '등록', '저장', '신청', '제출', '완료',
      '접수하기', '등록하기', '저장하기', '신청하기', '제출하기',
      '최종접수', '최종 접수', '작성완료', '작성 완료', '접수완료', '접수 완료',
      '대출접수', '대출 접수', '대출신청', '대출 신청', '신청서 저장'
    ];
    // 반드시 제외 단어 — 조회/임시저장/업체관리 등 접수가 아닌 버튼
    const DENY = [
      '조회', '검색', '찾기', '목록', '리스트',
      '임시', '임시저장', '수정', '변경',
      '삭제', '취소', '닫기', '되돌리기',
      '초기화', '리셋', 'reset', 'RESET',
      '보기', '상세', '다운로드', '업로드', '출력', '인쇄',
      '이전', '다음', '새로고침', '확인',
      '업체', '회사', '지점', '담당자', '관리', '설정'  // '등록업체조회','지점등록' 등
    ];
    const hasDeny = (t) => DENY.some(d => t.includes(d));
    const btnText = (b) => (b.value || b.textContent || '').trim();
    const visible = (b) => (b.offsetParent !== null) && !b.disabled && b.type !== 'hidden';

    const typeRank = (b) => {
      // input[type=submit] 1순위, input[type=button] 2, button 3, a 4
      if (b.tagName === 'INPUT' && b.type === 'submit') return 1;
      if (b.tagName === 'INPUT' && b.type === 'button') return 2;
      if (b.tagName === 'BUTTON') return 3;
      return 4;
    };

    // 1단계: 정확 매칭
    let exact = [];
    for (const b of allBtns) {
      if (!visible(b)) continue;
      const t = btnText(b);
      if (!t || hasDeny(t)) continue;
      if (EXACT.includes(t)) exact.push({ b, t });
    }
    if (exact.length > 0) {
      exact.sort((x, y) => typeRank(x.b) - typeRank(y.b));
      exact[0].b.click();
      return { clicked: true, buttonText: exact[0].t, via: 'exact', candidateCount: exact.length };
    }

    // 2단계: 포함 매칭 (단 deny 단어 없어야 함)
    let subs = [];
    for (const b of allBtns) {
      if (!visible(b)) continue;
      const t = btnText(b);
      if (!t || hasDeny(t)) continue;
      if (ALLOW.some(a => t.includes(a))) subs.push({ b, t });
    }
    if (subs.length > 0) {
      // ALLOW 우선순위: 접수 > 등록 > 신청 > 저장 > 제출 > 완료
      const pri = ALLOW;
      subs.sort((x, y) => {
        const px = pri.findIndex(p => x.t.includes(p));
        const py = pri.findIndex(p => y.t.includes(p));
        if (px !== py) return (px < 0 ? 99 : px) - (py < 0 ? 99 : py);
        return typeRank(x.b) - typeRank(y.b);
      });
      subs[0].b.click();
      return { clicked: true, buttonText: subs[0].t, via: 'substring', candidateCount: subs.length };
    }

    // 후보가 없으면 실패 + 화면상 클릭 가능한 버튼 텍스트 샘플 반환 (디버그용)
    const sample = allBtns
      .filter(visible)
      .map(btnText)
      .filter(Boolean)
      .slice(0, 40);
    return { clicked: false, buttonText: '', reason: 'submit_button_not_found', sample };
  });

  // 제출 후 페이지 이동/응답 대기
  let submitResponse = null;
  if (submitResult.clicked) {
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      await delay(500, 1000);

      // 제출 결과 판정
      //  - 접수 성공 시 론앤마스터는 통상 대출신청내역(list_loanlist.asp) 으로 리다이렉트
      //  - 폼 페이지(loanlist_app.asp) 에 그대로 있으면 실패/검증오류
      //  - 본문의 '실패/오류/에러' 단순 포함은 왼쪽 메뉴/공지에 흔히 들어있어 오탐 유발 → 사용 안 함
      submitResponse = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const url = location.href || '';

        // URL 기반 1차 판정
        const onListPage = /list_loanlist\.asp/i.test(url);
        const stillOnForm = /loanlist_app\.asp/i.test(url);

        // 본문 기반 2차 판정 (명시적 문구만)
        const explicitSuccess = /접수되었습니다|등록되었습니다|정상적으로\s*(처리|등록|접수)/.test(body);
        const explicitError = /접수.*실패|등록.*실패|오류가\s*발생|에러가\s*발생|입력.{0,6}(확인|필수|누락)/.test(body);

        let isSuccess = false;
        let isError = false;
        if (explicitError) { isError = true; }
        else if (explicitSuccess) { isSuccess = true; }
        else if (onListPage) { isSuccess = true; }       // 리스트로 넘어갔으면 성공
        else if (stillOnForm) { isError = true; }        // 폼에 머물러있으면 실패

        return {
          pageText: body.substring(0, 500),
          isSuccess,
          isError,
          onListPage,
          stillOnForm,
          url
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

    // alert 메시지에서 실패/경고 신호 분석
    const msg = alertMessage;
    const failurePatterns = [
      '필수', '누락', '입력', '선택하', '확인',                                // 입력 검증
      '실패', '오류', '에러', '불가', '거부', '잘못',                           // 명시적 실패
      '중복', '이미 등록', '이미 접수', '이미 존재',                             // 중복
      '형식', '자리', '길이', '잘못된', 'invalid', 'error', 'fail',           // 포맷 오류
      '본인확인', '인증', '권한'                                                // 인증 관련
    ];
    const successPatterns = ['완료', '성공', '등록되었습니다', '접수되었습니다', '처리되었습니다'];
    const msgIsFailure = failurePatterns.some(p => msg.toLowerCase().includes(p.toLowerCase()));
    const msgIsSuccess = successPatterns.some(p => msg.includes(p));
    if (msgIsFailure && !msgIsSuccess) {
      submitResponse.isError = true;
      submitResponse.isSuccess = false;
      submitResponse.failureReason = `론앤마스터 알림: ${msg}`;
    } else if (msgIsSuccess && !msgIsFailure) {
      submitResponse.isSuccess = true;
    }
  }

  // 제출 버튼을 애초에 못 눌렀으면 실패
  if (!submitResult.clicked) {
    submitResponse = submitResponse || { isSuccess: false, isError: true };
    submitResponse.isError = true;
    submitResponse.isSuccess = false;
    submitResponse.failureReason = submitResponse.failureReason || '제출 버튼을 찾을 수 없습니다.';
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
    productSelectResult,
    submitResult,
    submitResponse,
    pageUrl
  };
}

// 서류 첨부 업로드 (다중 파일 지원)
async function uploadDocuments(agentNo, upw, fidx, files) {
  // files: [{ slot: 1, path: '/tmp/...', originalName: '...' }, ...]
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');
  if (!files || files.length === 0) throw new Error('파일이 없습니다.');

  // 접수 페이지 이동 + 해당 상품 선택
  const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await delay(500, 1000);

  // 상품 클릭 (fidx 기반)
  if (fidx) {
    await page.evaluate((f) => {
      const els = document.querySelectorAll('a, input[type="button"], button, span, td');
      for (const el of els) {
        const onclick = el.getAttribute('onclick') || '';
        if (onclick.includes(`fidx=${f}`) || onclick.includes(`'${f}'`)) {
          el.click();
          return;
        }
      }
    }, fidx);
    await delay(500, 1000);
  }

  // 파일 input 찾기 (file(fidx), file2(fidx) 패턴)
  const uploadResults = [];
  for (const f of files) {
    try {
      const selector = f.slot === 2
        ? `input[type="file"][name="file2(${fidx})"]`
        : `input[type="file"][name="file(${fidx})"]`;
      const el = await page.$(selector);
      if (!el) {
        // 백업 셀렉터: 슬롯 순번으로 찾기
        const allFileInputs = await page.$$(`input[type="file"]`);
        const targetEl = allFileInputs[f.slot - 1];
        if (targetEl) {
          await targetEl.uploadFile(f.path);
          uploadResults.push({ slot: f.slot, success: true, selector: 'fallback' });
          continue;
        }
        uploadResults.push({ slot: f.slot, success: false, message: '파일 슬롯 미발견' });
        continue;
      }
      await el.uploadFile(f.path);
      uploadResults.push({ slot: f.slot, success: true, selector });
    } catch (e) {
      uploadResults.push({ slot: f.slot, success: false, message: e.message });
    }
  }

  await delay(500, 1000);

  // 작성완료 버튼 클릭
  const submitResult = await page.evaluate(() => {
    const btns = document.querySelectorAll('input[type="submit"], input[type="button"], button');
    for (const btn of btns) {
      const text = (btn.value || btn.textContent || '').trim();
      if (text.includes('작성완료') || text.includes('등록') || text.includes('접수')) {
        if (text.includes('초기화') || text.includes('취소')) continue;
        btn.click();
        return { clicked: true, buttonText: text };
      }
    }
    return { clicked: false };
  });

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});

  return { uploadResults, submitResult, pageUrl: page.url() };
}

// 상품별 파일 슬롯 개수 스캔
async function scanProductFileSlots(agentNo, upw, fidx) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await delay(500, 1000);

  await page.evaluate((f) => {
    const els = document.querySelectorAll('a, input[type="button"], button, span, td');
    for (const el of els) {
      const onclick = el.getAttribute('onclick') || '';
      if (onclick.includes(`fidx=${f}`) || onclick.includes(`'${f}'`)) {
        el.click();
        return;
      }
    }
  }, fidx);
  await delay(500, 1000);

  const slots = await page.evaluate((f) => {
    const inputs = document.querySelectorAll(`input[type="file"][name*="(${f})"]`);
    const result = [];
    inputs.forEach((inp, idx) => {
      const label = inp.closest('tr')?.querySelector('td:first-child, th')?.textContent?.trim() || `파일${idx+1}`;
      result.push({ slot: idx + 1, name: inp.name, label });
    });
    return result;
  }, fidx);

  return slots;
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

    // 론앤마스터 테이블: id="id_list_table", 헤더는 td.cs_thema_ListBar_Header
    const table = document.getElementById('id_list_table') || document.querySelector('table.cs_thema_ListTable');

    if (table) {
      const trs = table.querySelectorAll('tr');
      for (let i = 1; i < trs.length; i++) { // 0번은 헤더
        const tds = trs[i].querySelectorAll('td');
        if (tds.length >= 14) {
          // 상품명 정규화: LoanMaster 행에 따라 이름 뒤에 '.' / ',' / '·' / '…' 등이 섞여 오는 케이스가 있어
          // 제거하지 않으면 동일 상품이 다른 이름으로 중복 저장됨
          const rawProduct = tds[3]?.textContent?.trim() || '';
          const productName = rawProduct.replace(/[\s.,·…ㆍ]+$/u, '').trim();
          rows.push({
            applyDate: tds[0]?.textContent?.trim() || '',
            processDate: tds[1]?.textContent?.trim() || '',
            productName,
            recruiter: tds[4]?.textContent?.trim() || '',
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
    return { rows, summary, total };
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

// 론앤마스터 공지사항 목록 + 본문 가져오기
// options.todayOnly=true 면 오늘 등록된 공지만 반환 (KST 기준)
// options.fetchBodies=true 면 각 공지의 본문도 함께 가져옴 (느림, 당일분에 한해 권장)
async function getNotices(agentNo, upw, options = {}) {
  if (!isLoggedIn) throw new Error('론앤마스터 로그인이 필요합니다.');
  const { todayOnly = true, fetchBodies = true } = options;

  const url = `${NOTICE_LIST_URL}?no=${agentNo || '12'}&upw=${upw || '1'}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
  // 동적 로드 대비 — 게시판 테이블이 나올 때까지 최대 8초 대기
  await page.waitForFunction(() => {
    const frames = [document, ...[...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument; } catch { return null; } }).filter(Boolean)];
    for (const d of frames) {
      const rows = d.querySelectorAll('table tr');
      for (const r of rows) {
        const text = (r.textContent || '');
        if (/\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/.test(text)) return true;
      }
    }
    return false;
  }, { timeout: 8000 }).catch(() => {});
  await delay(1500, 2500);

  // KST 기준 오늘 날짜 (YYYY-MM-DD)
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000) + now.getTimezoneOffset() * 60 * 1000);
  const todayStr = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,'0')}-${String(kst.getDate()).padStart(2,'0')}`;

  // 공지 목록 파싱 — 모든 Puppeteer frame 을 순회 (iframe 안쪽 포함)
  // 참고: window.iframe.contentDocument 는 sandbox/cross-origin 에 막힐 수 있어 page.frames() 사용
  const parseInFrame = async (frame) => {
    try {
      return await frame.evaluate(() => {
        const out = [];
        const debug = { tableCount: 0, rowCount: 0, dateMatched: 0 };
        const tables = document.querySelectorAll('table');
        debug.tableCount = tables.length;
        for (const t of tables) {
          const rows = t.querySelectorAll('tr');
          debug.rowCount += rows.length;
          for (const r of rows) {
            const tds = r.querySelectorAll('td, th');
            if (tds.length < 2) continue;
            const cellTexts = [...tds].map(td => (td.textContent || '').trim());
            let dateStr = '';
            for (const ct of cellTexts) {
              const m = ct.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
              if (m) { dateStr = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`; break; }
            }
            if (!dateStr) continue;
            debug.dateMatched++;

            const linkEl = r.querySelector('a[href], a[onclick]');
            let title = '';
            if (linkEl) title = (linkEl.textContent || '').trim();
            if (!title) title = cellTexts.find(s => s.length > 5) || '';
            title = title.replace(/\s+/g, ' ').trim();
            if (!title || title.length < 3) continue;

            let href = linkEl ? (linkEl.getAttribute('href') || '') : '';
            let idx = '';
            if (linkEl) {
              const onclick = linkEl.getAttribute('onclick') || '';
              const m = onclick.match(/[\(,'"\s](\d{2,})[\)'"\s,]/);
              if (m) idx = m[1];
            }
            if (!idx && href) {
              const m = href.match(/idx=(\d+)/i) || href.match(/no=(\d+)/i) || href.match(/(\d{3,})/);
              if (m) idx = m[1];
            }
            if (!idx && /^\d{2,}$/.test(cellTexts[0])) idx = cellTexts[0];

            out.push({ date: dateStr, title, idx, href });
          }
        }
        // Fallback 파서: innerText 에서 [번호]\n[제목]\n[글쓴이]\n[날짜] 4줄 패턴 스캔
        // lmaster 게시판이 table 로 안 그려지거나 우리 td 셀렉터가 놓치는 케이스 방어
        if (out.length === 0) {
          const bodyText = (document.body?.innerText || '');
          const lines = bodyText.split(/\n+/).map(s => s.trim()).filter(Boolean);
          for (let i = 0; i + 3 < lines.length; i++) {
            const num = lines[i];
            const title = lines[i+1];
            const author = lines[i+2];
            const dateLine = lines[i+3];
            if (!/^\d{3,6}$/.test(num)) continue;                           // 번호: 3~6자리 숫자만
            if (!title || title.length < 3) continue;
            if (!author || author.length > 20) continue;                    // 글쓴이 짧음
            const m = dateLine.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
            if (!m) continue;
            const date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
            out.push({ date, title: title.replace(/\s+/g, ' ').trim(), idx: num, href: '' });
            debug.dateMatched++;
          }
          debug.textFallback = out.length;
        }

        return {
          items: out, debug,
          url: location.href,
          innerText: (document.body?.innerText || '').substring(0, 3000),
          htmlSnippet: document.body ? document.body.innerHTML.substring(0, 1500) : ''
        };
      });
    } catch (e) {
      return { items: [], debug: { error: e.message }, url: frame.url() };
    }
  };

  // 모든 frame 순회
  const allFrames = page.frames();
  const frameResults = [];
  for (const f of allFrames) {
    const r = await parseInFrame(f);
    frameResults.push({ url: r.url || f.url(), ...r });
  }

  // 합치고 중복 제거
  const seen = new Set();
  const allItems = [];
  for (const fr of frameResults) {
    for (const n of (fr.items || [])) {
      const key = `${n.date}_${n.title}_${n.idx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allItems.push(n);
    }
  }

  const items = {
    items: allItems,
    todayStr,
    debug: {
      frameCount: allFrames.length,
      frames: frameResults.map(fr => ({
        url: fr.url,
        tableCount: fr.debug?.tableCount,
        rowCount: fr.debug?.rowCount,
        dateMatched: fr.debug?.dateMatched,
        innerText: (fr.innerText || '').substring(0, 500),
        snippet: (fr.htmlSnippet || '').substring(0, 600)
      }))
    },
    htmlSnippet: ''
  };

  const listItems = items.items || [];
  let list = listItems.filter(n => !todayOnly || n.date === todayStr);
  // 최신순
  list.sort((a, b) => (b.date + (b.idx || '')).localeCompare(a.date + (a.idx || '')));

  // 디버그: 파싱 통계
  const debugInfo = {
    parsedTotal: listItems.length,
    parsedTodayOnly: list.length,
    todayStr,
    pageDebug: items.debug,
    pageUrl: page.url(),
    htmlSnippet: items.htmlSnippet
  };

  // 본문 fetch (옵션)
  if (fetchBodies && list.length > 0) {
    for (const n of list.slice(0, 10)) {  // 안전상 최대 10건
      try {
        // 상세 페이지 URL 추정: list.asp 와 같은 폴더의 view.asp + idx
        if (n.idx) {
          const viewUrl = `${LMASTER_BASE}/admin/bbs/notice/view.asp?no=${agentNo || '12'}&upw=${upw || '1'}&idx=${n.idx}`;
          await page.goto(viewUrl, { waitUntil: 'networkidle2', timeout: 15000 });
          await delay(200, 500);
          n.body = await page.evaluate(() => {
            // 가장 큰 텍스트 블록 추출
            const candidates = document.querySelectorAll('td, div, article, section');
            let best = '';
            for (const el of candidates) {
              const t = (el.textContent || '').trim();
              if (t.length > best.length && t.length < 5000) best = t;
            }
            return best.substring(0, 3000);
          });
        } else if (n.href) {
          const viewUrl = n.href.startsWith('http') ? n.href : `${LMASTER_BASE}/admin/bbs/notice/${n.href}`;
          await page.goto(viewUrl, { waitUntil: 'networkidle2', timeout: 15000 });
          await delay(200, 500);
          n.body = await page.evaluate(() => (document.body.innerText || '').substring(0, 3000));
        }
      } catch (e) {
        n.bodyError = e.message;
      }
    }
  }

  return { todayStr, count: list.length, notices: list, debug: debugInfo };
}

// 공지 캐시 (1시간 TTL — 론앤마스터가 시간당 1건 올린다는 사용자 메모 기준)
let _noticeCache = { ts: 0, data: null };
const NOTICE_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

async function getCachedNotices(agentNo, upw, options = {}) {
  const force = options.force === true;
  const now = Date.now();
  if (!force && _noticeCache.data && (now - _noticeCache.ts < NOTICE_CACHE_TTL_MS)) {
    return { ..._noticeCache.data, cached: true, cachedAgeSec: Math.floor((now - _noticeCache.ts)/1000) };
  }
  const data = await getNotices(agentNo, upw, options);
  _noticeCache = { ts: now, data };
  return { ...data, cached: false };
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
  getPageHtml,
  uploadDocuments,
  scanProductFileSlots,
  getNotices,
  getCachedNotices
};

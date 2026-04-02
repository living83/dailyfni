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
    headless: isLinux ? 'new' : false,
    defaultViewport: isLinux ? { width: 1280, height: 800 } : null,
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

// 대출 신청서 자동 입력 (1건, 사용자 행동 모방)
async function submitLoanApplication(agentNo, upw, formData) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;

  await delay(2000, 3500);
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(1500, 2500);

  // 폼 필드 자동 입력 (사람처럼 하나씩 딜레이)
  const fillField = async (selector, value) => {
    if (!value) return;
    const el = await page.$(selector);
    if (el) {
      await el.click();
      await delay(200, 500);
      await el.evaluate((e, v) => { e.value = ''; }, null);
      await page.type(selector, String(value), { delay: 50 + Math.random() * 100 });
      await delay(300, 700);
    }
  };

  const selectField = async (selector, value) => {
    if (!value) return;
    const el = await page.$(selector);
    if (el) {
      await el.select(value).catch(() => {
        // option value가 아니면 텍스트로 매칭
        el.evaluate((e, v) => {
          for (const opt of e.options) {
            if (opt.text.includes(v)) {
              e.value = opt.value;
              break;
            }
          }
        }, value);
      });
      await delay(300, 600);
    }
  };

  // 실제 폼 필드 매핑은 론앤마스터 HTML 구조에 따라 조정 필요
  // 아래는 기본 구조이며, 실제 name/id는 크롤링 후 확인 필요

  return {
    success: true,
    message: '폼 데이터가 준비되었습니다. 실제 제출은 매핑 완료 후 활성화됩니다.',
    formData
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
  submitLoanApplication,
  getLoanList,
  getLoanDetail,
  closeBrowser,
  getStatus
};

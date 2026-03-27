// ========================================
// 론앤마스터 크롤러 - 사용자 행동 모방 방식
// 상품 클릭 시 1건만 가져옴 (일괄 수집 X)
// ========================================
const puppeteer = require('puppeteer-core');

const LMASTER_BASE = 'https://lmaster.kr';
const LOGIN_URL = LMASTER_BASE + '/admin/agent/login.asp';
const PRODUCT_INFO_URL = LMASTER_BASE + '/admin/agent/win_fininfo.asp';
const LOAN_APP_URL = LMASTER_BASE + '/admin/agent/loanlist_app.asp';

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

  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
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

// 상품 목록에서 fidx 매핑 수집 (1회성, 주의해서 사용)
async function getProductFidxMap(agentNo, upw) {
  if (!isLoggedIn) throw new Error('로그인이 필요합니다.');

  const url = `${LOAN_APP_URL}?no=${agentNo}&upw=${upw}&w=w`;

  await delay(2000, 3000);
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(2000, 3000);

  const products = await page.evaluate(() => {
    const result = [];
    // 상품명 링크에서 fidx 추출
    document.querySelectorAll('a').forEach(a => {
      const onclick = a.getAttribute('onclick') || '';
      const match = onclick.match(/fidx=(\d+)/);
      if (match) {
        result.push({
          name: a.textContent.trim(),
          fidx: parseInt(match[1])
        });
      }
    });
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
  closeBrowser,
  getStatus
};

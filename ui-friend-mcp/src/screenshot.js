/**
 * Puppeteer 스크린샷 엔진
 *
 * HTML 문자열 또는 템플릿 파일을 Puppeteer로 렌더링하여 PNG 파일로 저장.
 * 브라우저 인스턴스를 재사용하여 성능 최적화.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 이미지 저장 디렉토리
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'blog-generator', 'data', 'images');

let browserInstance = null;

/**
 * Puppeteer 브라우저 인스턴스를 가져온다 (싱글톤).
 */
async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });
  return browserInstance;
}

/**
 * HTML 문자열을 렌더링하여 PNG 스크린샷을 생성한다.
 *
 * @param {Object} options
 * @param {string} options.html - 렌더링할 HTML
 * @param {number} options.width - 뷰포트 너비 (기본 960)
 * @param {number} options.height - 뷰포트 높이 (기본 540)
 * @param {number} options.deviceScaleFactor - 디바이스 스케일 (기본 2, 고해상도)
 * @param {string} [options.outputPath] - 저장 경로 (미지정 시 자동 생성)
 * @returns {Object} { filePath, width, height, fileSize }
 */
async function renderScreenshot({ html, width = 960, height = 540, deviceScaleFactor = 2, outputPath }) {
  if (!html) throw new Error('html은 필수입니다.');

  // 출력 디렉토리 보장
  const outDir = outputPath ? path.dirname(outputPath) : OUTPUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const filePath = outputPath || path.join(
    OUTPUT_DIR,
    `screenshot_${crypto.randomBytes(6).toString('hex')}.png`
  );

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor });

    // HTML에 <html> 태그가 없으면 래핑
    const fullHtml = html.includes('<html') ? html : wrapHtml(html, width, height);

    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 15000 });

    // 폰트 로딩 대기
    await page.evaluate(() => document.fonts?.ready);

    await page.screenshot({
      path: filePath,
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });

    const stat = fs.statSync(filePath);

    return {
      filePath,
      width,
      height,
      fileSize: stat.size,
      deviceScaleFactor,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await page.close();
  }
}

/**
 * 사전 정의된 템플릿에 데이터를 주입하여 스크린샷을 생성한다.
 *
 * @param {Object} options
 * @param {string} options.templateName - 템플릿 이름
 * @param {Object} options.data - 주입할 데이터
 * @param {number} options.width
 * @param {number} options.height
 * @param {string} [options.outputPath]
 * @param {string} options.templatesDir - 템플릿 디렉토리
 * @returns {Object} { filePath, width, height, fileSize, template }
 */
async function renderTemplate({ templateName, data, width = 960, height = 540, outputPath, templatesDir }) {
  const templateFile = path.join(templatesDir, `${templateName}.html`);

  if (!fs.existsSync(templateFile)) {
    throw new Error(`템플릿 "${templateName}"을 찾을 수 없습니다: ${templateFile}`);
  }

  let html = fs.readFileSync(templateFile, 'utf-8');

  // 데이터 주입: {{key}} 패턴과 __DATA__ JSON 주입
  html = html.replace('__DATA__', JSON.stringify(data));
  for (const [key, value] of Object.entries(data)) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escapeHtml(strValue));
  }

  const result = await renderScreenshot({ html, width, height, outputPath });
  return { ...result, template: templateName };
}

/**
 * HTML 래핑 (body 조각을 완전한 HTML로)
 */
function wrapHtml(bodyContent, width, height) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
  body { font-family: 'Noto Sans KR', sans-serif; }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 브라우저 종료 (서버 종료 시 호출)
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

module.exports = { renderScreenshot, renderTemplate, closeBrowser, getBrowser };

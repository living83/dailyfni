/**
 * 포스팅 본문 전처리 — 광고 고지 + 하단 링크 자동 삽입
 */
const Posting = require('../models/Posting');

const AD_DISCLOSURE = '본 포스팅은 소정의 금액을 받고 작성하게 됐습니다.';

/**
 * 광고 고지 문구를 본문 최상단에 삽입
 */
function prependAdDisclosure(body) {
  // 이미 포함되어 있으면 중복 삽입 방지
  if (body && body.includes(AD_DISCLOSURE)) return body;
  return `${AD_DISCLOSURE}\n\n${body || ''}`;
}

/**
 * 본문 하단에 링크/문구 추가
 */
function appendFooter(body) {
  const settings = Posting.getSettings();
  const text1 = settings.footerText || '';
  const link1 = settings.footerLink || '';
  const text2 = settings.footerText2 || '';
  const link2 = settings.footerLink2 || '';

  if (!link1 && !text1 && !link2 && !text2) return body;

  const parts = ['', '', '─────────────────────'];

  if (text1) parts.push(text1);
  if (link1) parts.push(link1);

  if ((text1 || link1) && (text2 || link2)) {
    parts.push(''); // 두 링크 사이 구분
  }

  if (text2) parts.push(text2);
  if (link2) parts.push(link2);

  return (body || '') + '\n\n' + parts.join('\n');
}

/**
 * 본문 전체 처리 — 광고 고지(상단) + 하단 링크(하단)
 * @param {string} body - 원본 본문
 * @param {string} contentType - '일반 정보성' | '광고(대출)'
 * @returns {string}
 */
function processBody(body, contentType) {
  let processed = body || '';
  // 광고글이면 최상단에 고지 삽입
  if (contentType === '광고(대출)' || contentType === 'ad') {
    processed = prependAdDisclosure(processed);
  }
  // 모든 글에 하단 링크 추가
  processed = appendFooter(processed);
  return processed;
}

module.exports = { appendFooter, prependAdDisclosure, processBody, AD_DISCLOSURE };

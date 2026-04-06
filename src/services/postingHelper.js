/**
 * 포스팅 본문에 하단 링크/문구 자동 삽입 (홈페이지 + 카카오채널 2개)
 */
const Posting = require('../models/Posting');

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

module.exports = { appendFooter };

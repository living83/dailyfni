/**
 * 포스팅 본문에 하단 링크/문구 자동 삽입
 */
const Posting = require('../models/Posting');

function appendFooter(body) {
  const settings = Posting.getSettings();
  const link = settings.footerLink || '';
  const text = settings.footerText || '';

  if (!link && !text) return body;

  const footer = [
    '',
    '',
    '─────────────────────',
    text || '',
    link || '',
  ].filter(Boolean).join('\n');

  return (body || '') + '\n\n' + footer;
}

module.exports = { appendFooter };

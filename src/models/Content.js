const { v4: uuid } = require('uuid');
const db = require('../db/sqlite');

const insert = db.prepare(`INSERT INTO contents (id, keyword, title, body, tone, contentType, productInfo, grade, status, accountId, platform)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const selectAll = db.prepare(`SELECT * FROM contents ORDER BY createdAt DESC`);
const selectById = db.prepare(`SELECT * FROM contents WHERE id = ?`);
const deleteById = db.prepare(`DELETE FROM contents WHERE id = ?`);

function createContent(data) {
  const id = uuid();
  insert.run(id, data.keyword, data.title || `${data.keyword} 관련 블로그 글`, data.body || '',
    data.tone || '친근톤', data.contentType || '일반 정보성', data.productInfo || '',
    data.grade || null, data.status || '대기', data.accountId || null, data.platform || 'naver');
  return selectById.get(id);
}

function listContents() {
  return selectAll.all();
}

function getContent(id) {
  return selectById.get(id) || null;
}

function updateContent(id, data) {
  const item = selectById.get(id);
  if (!item) return null;
  const sets = []; const vals = [];
  for (const k of ['title', 'body', 'tone', 'contentType', 'productInfo', 'grade', 'status', 'accountId', 'platform']) {
    if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (sets.length) {
    sets.push(`updatedAt = datetime('now', 'localtime')`);
    vals.push(id);
    db.prepare(`UPDATE contents SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  return selectById.get(id);
}

function deleteContent(id) {
  return deleteById.run(id).changes > 0;
}

/**
 * 키워드 재활용 — 발행 완료된 콘텐츠와 같은 키워드+타입으로 새 콘텐츠 생성
 * AI가 매번 다른 글을 생성하므로 동일 키워드 재사용 가능
 */
function recycleKeyword(contentId) {
  const original = selectById.get(contentId);
  if (!original) return null;
  return createContent({
    keyword: original.keyword,
    tone: original.tone,
    contentType: original.contentType,
    productInfo: original.productInfo,
    platform: original.platform || 'naver',
    status: '대기',
  });
}

/**
 * 사용 가능한 키워드 목록 (고유 키워드 기준)
 */
function getUniqueKeywords() {
  return db.prepare(`SELECT DISTINCT keyword, contentType, tone, productInfo FROM contents`).all();
}

module.exports = { createContent, listContents, getContent, updateContent, deleteContent, recycleKeyword, getUniqueKeywords };

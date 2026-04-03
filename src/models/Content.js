const { v4: uuid } = require('uuid');
const db = require('../db/sqlite');

const insert = db.prepare(`INSERT INTO contents (id, keyword, title, body, tone, contentType, productInfo, grade, status, accountId)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const selectAll = db.prepare(`SELECT * FROM contents ORDER BY createdAt DESC`);
const selectById = db.prepare(`SELECT * FROM contents WHERE id = ?`);
const deleteById = db.prepare(`DELETE FROM contents WHERE id = ?`);

function createContent(data) {
  const id = uuid();
  insert.run(id, data.keyword, data.title || `${data.keyword} 관련 블로그 글`, data.body || '',
    data.tone || '친근톤', data.contentType || '일반 정보성', data.productInfo || '',
    data.grade || null, data.status || '대기', data.accountId || null);
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
  for (const k of ['title', 'body', 'tone', 'contentType', 'productInfo', 'grade', 'status', 'accountId']) {
    if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (sets.length) {
    sets.push(`updatedAt = datetime('now')`);
    vals.push(id);
    db.prepare(`UPDATE contents SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  return selectById.get(id);
}

function deleteContent(id) {
  return deleteById.run(id).changes > 0;
}

module.exports = { createContent, listContents, getContent, updateContent, deleteContent };

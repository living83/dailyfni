const { v4: uuid } = require('uuid');

/** @type {Map<string, object>} */
const contents = new Map();

function createContent(data) {
  const id = uuid();
  const item = {
    id,
    keyword: data.keyword,
    title: data.title || `${data.keyword} 관련 블로그 글`,
    body: data.body || '',
    tone: data.tone || '친근톤',
    contentType: data.contentType || '일반 정보성',
    productInfo: data.productInfo || '',
    grade: data.grade || null,
    status: data.status || '대기',   // 대기 | 생성중 | 검수완료 | 저품질
    accountId: data.accountId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  contents.set(id, item);
  return item;
}

function listContents() {
  return [...contents.values()].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function getContent(id) {
  return contents.get(id) || null;
}

function updateContent(id, data) {
  const item = contents.get(id);
  if (!item) return null;
  for (const k of ['title', 'body', 'tone', 'contentType', 'productInfo',
    'grade', 'status', 'accountId']) {
    if (data[k] !== undefined) item[k] = data[k];
  }
  item.updatedAt = new Date().toISOString();
  return item;
}

function deleteContent(id) {
  return contents.delete(id);
}

module.exports = { createContent, listContents, getContent, updateContent, deleteContent };

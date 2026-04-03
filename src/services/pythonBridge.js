/**
 * pythonBridge.js — Node.js ↔ Python FastAPI 통신 서비스
 * 콘텐츠 생성, 블로그 발행, 이웃참여 요청을 Python 서버로 전달
 */

const axios = require('axios');

const PYTHON_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * Python 서버에 콘텐츠 생성 요청
 * @param {object} params - { contentId, keyword, tone, contentType, productInfo, apiKey }
 * @returns {Promise<object>} - { success, article: { title, body, tags, review } }
 */
async function requestGenerate(params) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/dashboard/generate`, params, {
      timeout: 120000, // 2분 (AI 생성 시간 고려)
    });
    return res.data;
  } catch (err) {
    console.error('[PythonBridge] Generate 요청 실패:', err.message);
    return { success: false, error: err.response?.data?.detail || err.message };
  }
}

/**
 * Python 서버에 블로그 발행 요청
 * @param {object} params - { postingId, account: {naver_id, naver_password, account_name}, postData: {title, content, keywords} }
 * @returns {Promise<object>} - { success, url, error }
 */
async function requestPublish(params) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/dashboard/publish`, params, {
      timeout: 300000, // 5분 (브라우저 자동화 시간 고려)
    });
    return res.data;
  } catch (err) {
    console.error('[PythonBridge] Publish 요청 실패:', err.message);
    return { success: false, error: err.response?.data?.detail || err.message };
  }
}

/**
 * Python 서버에 이웃참여 요청
 * @param {object} params - { account, blogUrl, actions: {like, comment} }
 * @returns {Promise<object>} - { success, liked, commented, error }
 */
async function requestEngage(params) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/dashboard/engage`, params, {
      timeout: 180000, // 3분
    });
    return res.data;
  } catch (err) {
    console.error('[PythonBridge] Engage 요청 실패:', err.message);
    return { success: false, error: err.response?.data?.detail || err.message };
  }
}

/**
 * Python 서버에 AI 댓글 생성 요청
 * @param {object} params - { postTitle, postSummary, apiKey }
 * @returns {Promise<object>} - { success, comment }
 */
async function requestCommentPreview(params) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/dashboard/comment-preview`, params, {
      timeout: 30000,
    });
    return res.data;
  } catch (err) {
    console.error('[PythonBridge] Comment 요청 실패:', err.message);
    return { success: false, error: err.response?.data?.detail || err.message };
  }
}

/**
 * Python 서버에 이웃 피드 크롤링 요청
 * @param {object} params - { account, maxPosts }
 * @returns {Promise<object>} - { success, feed: [...] }
 */
async function requestFeed(params) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/dashboard/feed`, params, {
      timeout: 60000,
    });
    return res.data;
  } catch (err) {
    console.error('[PythonBridge] Feed 요청 실패:', err.message);
    return { success: false, error: err.response?.data?.detail || err.message };
  }
}

/**
 * Python 서버 상태 확인
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  try {
    const res = await axios.get(`${PYTHON_URL}/api/health`, { timeout: 5000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

module.exports = {
  requestGenerate,
  requestPublish,
  requestEngage,
  requestCommentPreview,
  requestFeed,
  checkHealth,
  PYTHON_URL,
};

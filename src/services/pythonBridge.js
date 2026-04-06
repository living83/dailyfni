/**
 * pythonBridge.js — Node.js ↔ Python FastAPI 통신 서비스
 * 콘텐츠 생성, 블로그 발행, 이웃참여 요청을 Python 서버로 전달
 */

const axios = require('axios');

const PYTHON_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * Python 서버에 콘텐츠 생성 요청 (SSE 스트림 소비)
 * Python의 /api/dashboard/generate는 SSE를 반환하므로 스트림을 파싱하여 최종 complete 이벤트를 추출
 */
async function requestGenerate(params) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/dashboard/generate`, params, {
      timeout: 180000,
      responseType: 'text',
      headers: { 'Accept': 'text/event-stream' },
    });

    // SSE 텍스트에서 complete 이벤트 파싱
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const lines = text.split('\n');
    let eventType = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType === 'complete') {
        try {
          return JSON.parse(line.slice(6));
        } catch { /* continue */ }
      } else if (line.startsWith('data: ') && eventType === 'error') {
        try {
          const err = JSON.parse(line.slice(6));
          return { success: false, error: err.message || 'AI 생성 실패' };
        } catch { /* continue */ }
      }
    }

    // SSE가 아닌 일반 JSON 응답인 경우
    try { return JSON.parse(text); } catch { /* ignore */ }
    return { success: false, error: 'SSE 파싱 실패' };
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
 * 중복 체크 — 네이버 블로그 검색으로 유사 포스팅 탐지
 * @param {object} params - { title, keywords }
 * @returns {Promise<object>} - { max_similarity, results, warning, message }
 */
async function checkDuplicate(params) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/dashboard/check-duplicate`, params, {
      timeout: 15000,
    });
    return res.data;
  } catch (err) {
    console.error('[PythonBridge] Duplicate check 실패:', err.message);
    return { max_similarity: 0, results: [], warning: false, message: err.message };
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
  checkDuplicate,
  checkHealth,
  PYTHON_URL,
};

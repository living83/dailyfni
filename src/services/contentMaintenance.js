/**
 * contentMaintenance.js — 블로그 콘텐츠 풀 자동 유지보수
 *
 * 1) 검수완료 풀이 임계값 미만으로 떨어지면 '대기' row 를 AI 로 자동 채움
 *    (기존엔 사용자가 대시보드 batch 생성 버튼을 눌러야 했음)
 * 2) '발행중' / '생성중' 상태로 N 분 이상 잠긴 row 를 자동 복원
 *    (기존엔 사용자가 reset-stuck 엔드포인트를 호출해야 했음)
 *
 * env 노브:
 *   BLOG_MAINTENANCE_DISABLED       — true 면 모듈 자체 비활성
 *   BLOG_MAINTENANCE_INTERVAL_MS    — tick 주기 (default 300000 = 5분)
 *   BLOG_AUTO_REFILL_THRESHOLD      — 검수완료가 이 미만이면 보충 (default 30)
 *   BLOG_AUTO_REFILL_BATCH          — 한 tick 에 채울 최대 row 수 (default 5)
 *   BLOG_STUCK_RESET_MINUTES        — 발행중/생성중 잠금 한도 (default 30)
 */

const Content = require('../models/Content');
const { getSettingsRaw } = require('../models/Settings');
const { requestGenerate } = require('./pythonBridge');
const telegram = require('./telegram');

const REFILL_THRESHOLD = parseInt(process.env.BLOG_AUTO_REFILL_THRESHOLD || '30', 10);
const REFILL_BATCH     = parseInt(process.env.BLOG_AUTO_REFILL_BATCH || '5', 10);
const STUCK_MINUTES    = parseInt(process.env.BLOG_STUCK_RESET_MINUTES || '30', 10);
const TICK_MS          = parseInt(process.env.BLOG_MAINTENANCE_INTERVAL_MS || String(5 * 60 * 1000), 10);

let intervalHandle = null;
let isProcessing = false;

function log(level, msg) {
  const tag = `[ContentMaintenance]`;
  if (level === 'error') console.error(tag, msg);
  else if (level === 'warn') console.warn(tag, msg);
  else console.log(tag, msg);
}

function getApiKey() {
  try {
    const settings = getSettingsRaw() || {};
    return settings.claudeApiKey || process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';
  } catch {
    return process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';
  }
}

function isNaverPlatform(c) {
  return (c.platform || 'naver') === 'naver';
}

/**
 * 발행중 / 생성중 상태로 STUCK_MINUTES 분 이상 머문 row 를 복원.
 * 발행중: 본문 50자 이상이면 검수완료, 미만이면 대기.
 * 생성중: 무조건 대기.
 */
async function resetStuck() {
  const cutoff = Date.now() - STUCK_MINUTES * 60 * 1000;
  const all = Content.listContents();
  const stuck = all.filter((c) => {
    if (c.status !== '발행중' && c.status !== '생성중') return false;
    const ts = new Date(c.updatedAt || c.createdAt || 0).getTime();
    return Number.isFinite(ts) && ts < cutoff;
  });

  if (stuck.length === 0) return 0;

  let restored = 0;
  for (const item of stuck) {
    let next;
    if (item.status === '발행중') {
      next = item.body && item.body.length > 50 ? '검수완료' : '대기';
    } else {
      next = '대기';
    }
    Content.updateContent(item.id, { status: next });
    restored++;
  }
  log('info', `stuck 복원 ${restored}건 (>${STUCK_MINUTES}분 지속)`);
  telegram
    .send(`🔧 [블로그] stuck 콘텐츠 ${restored}건 자동 복원`)
    .catch(() => {});
  return restored;
}

/**
 * 검수완료(naver) 콘텐츠가 REFILL_THRESHOLD 미만이면 대기 row 를 최대
 * REFILL_BATCH 개 골라 동시 AI 생성.
 */
async function refillReviewed() {
  const apiKey = getApiKey();
  if (!apiKey) {
    log('warn', 'Claude API 키 없음 — refill 스킵');
    return 0;
  }

  const all = Content.listContents();
  const reviewedCount = all.filter(
    (c) => c.status === '검수완료' && isNaverPlatform(c)
  ).length;

  if (reviewedCount >= REFILL_THRESHOLD) return 0;

  const pending = all
    .filter((c) => c.status === '대기' && isNaverPlatform(c))
    .slice(0, REFILL_BATCH);

  if (pending.length === 0) {
    log('info', `검수완료 ${reviewedCount}/${REFILL_THRESHOLD} 미달이지만 대기 row 없음`);
    return 0;
  }

  log(
    'info',
    `검수완료 ${reviewedCount}/${REFILL_THRESHOLD} 미달 → 대기 ${pending.length}건 AI 생성 시작`
  );

  // 미리 '생성중' 으로 마크해서 다른 워커 / 사용자 트리거와 중복 처리 방지
  for (const item of pending) {
    Content.updateContent(item.id, { status: '생성중' });
  }

  const results = await Promise.all(
    pending.map(async (item) => {
      try {
        const result = await requestGenerate({
          content_id: item.id,
          keyword: item.keyword,
          tone: item.tone || '친근톤',
          content_type: item.contentType || '일반 정보성',
          product_info: item.productInfo || '',
          api_key: apiKey,
        });
        if (result && result.title) {
          Content.updateContent(item.id, {
            title: result.title,
            body: result.body || '',
            grade: result.grade || 'B',
            status: result.grade === 'D' ? '저품질' : '검수완료',
          });
          return { ok: true, keyword: item.keyword };
        }
        Content.updateContent(item.id, { status: '대기' });
        return { ok: false, keyword: item.keyword, error: result?.error || 'unknown' };
      } catch (err) {
        Content.updateContent(item.id, { status: '대기' });
        return { ok: false, keyword: item.keyword, error: err.message };
      }
    })
  );

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.length - successCount;
  log('info', `자동 채움: 성공 ${successCount}건 / 실패 ${failCount}건`);

  if (successCount > 0) {
    const tail = failCount > 0 ? ` (실패 ${failCount}건)` : '';
    telegram
      .send(`✨ [블로그] 검수완료 풀 자동 보충 ${successCount}건${tail}`)
      .catch(() => {});
  }
  return successCount;
}

async function tick() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    await resetStuck();
    await refillReviewed();
  } catch (e) {
    log('error', `tick 오류: ${e.message}`);
  } finally {
    isProcessing = false;
  }
}

function start() {
  if (process.env.BLOG_MAINTENANCE_DISABLED === 'true') {
    log('warn', 'BLOG_MAINTENANCE_DISABLED=true — 시작 안 함');
    return;
  }
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => {
    tick().catch((e) => log('error', `interval 오류: ${e.message}`));
  }, TICK_MS);
  log(
    'info',
    `시작 (interval=${Math.round(TICK_MS / 1000)}s, refill_threshold=${REFILL_THRESHOLD}, ` +
      `batch=${REFILL_BATCH}, stuck>${STUCK_MINUTES}분)`
  );
  // 시작 직후 즉시 한 번
  tick().catch((e) => log('error', `초기 tick 오류: ${e.message}`));
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  log('warn', '정지됨');
}

module.exports = { start, stop, tick, resetStuck, refillReviewed };

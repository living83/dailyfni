/**
 * 티스토리 자동 포스팅 스케줄러
 * 네이버 scheduler.js와 동일 패턴 — 60초 간격, 윈도우 기반
 */

const db = require('../db/sqlite');
const TistoryAccount = require('../models/TistoryAccount');
const Content = require('../models/Content');
const { requestTistoryPublish } = require('./pythonBridge');
const telegram = require('./telegram');
const { processBody } = require('./postingHelper');
const { v4: uuid } = require('uuid');

// ── 상태 ──
let intervalHandle = null;
let running = false;
let lastRunDate = '';
let todayPostedAccounts = new Set();
let isProcessing = false;
let nextScheduledTime = null;

// ── 티어 사이클 (네이버와 동일) ──
const TIER_CYCLES = {
  1: { general: 1, ad: 0 },
  2: { general: 4, ad: 1 },
  3: { general: 3, ad: 1 },
  4: { general: 2, ad: 2 },
  5: { general: 1, ad: 1 },
};

// ── 요일 ──
const DAY_MAP = ['일', '월', '화', '수', '목', '금', '토'];
const FRONTEND_DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];

// ── 로그 링 버퍼 ──
const LOG_MAX = 200;
const logBuffer = [];
function log(level, message) {
  logBuffer.push({ time: new Date().toISOString(), level, message });
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
  const prefix = '[TistoryScheduler]';
  if (level === 'error') console.error(prefix, message);
  else if (level === 'warn') console.warn(prefix, message);
  else console.log(prefix, message);
}
function getLogs() { return logBuffer.slice().reverse(); }

// ── 설정 ──
function getSettings() {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'tistory'`).get();
  const defaults = {
    autoEngine: false,
    startHour: '09', startMin: '00',
    endHour: '18', endMin: '00',
    selectedDays: [true, true, true, true, true, false, false],
    intervalMin: 5, intervalMax: 15,
    dailyMax: 5,
    distribution: 'sequential',
  };
  return row ? { ...defaults, ...JSON.parse(row.value) } : defaults;
}

// ── 헬퍼 ──
function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isTodaySelected(settings) {
  const todayKor = DAY_MAP[new Date().getDay()];
  const selectedDays = settings.selectedDays;
  if (!selectedDays) return true;
  if (Array.isArray(selectedDays) && typeof selectedDays[0] === 'boolean') {
    const idx = FRONTEND_DAY_ORDER.indexOf(todayKor);
    return idx >= 0 && !!selectedDays[idx];
  }
  return true;
}

function isWithinTimeWindow(settings) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseInt(settings.startHour || '0', 10) * 60 + parseInt(settings.startMin || '0', 10);
  const endMinutes = parseInt(settings.endHour || '23', 10) * 60 + parseInt(settings.endMin || '59', 10);
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

function getPostTypeForTier(tier, publishedCount) {
  const cycle = TIER_CYCLES[tier] || TIER_CYCLES[1];
  const total = cycle.general + cycle.ad;
  if (total === 0 || cycle.ad === 0) return '일반 정보성';
  const pos = publishedCount % total;
  return pos < cycle.general ? '일반 정보성' : '광고(대출)';
}

function loadTodayPostedFromDB() {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT accountId FROM tistory_postings
      WHERE status IN ('발행완료', '확인필요')
        AND date(createdAt, 'localtime') = date('now', 'localtime')
        AND accountId IS NOT NULL
    `).all();
    return new Set(rows.map(r => r.accountId));
  } catch (err) {
    log('error', `DB 조회 실패: ${err.message}`);
    return new Set();
  }
}

// ── 메인 체크 ──
async function checkAndRun() {
  if (isProcessing) return;

  try {
    const settings = getSettings();
    if (!settings.autoEngine) return;

    const today = todayStr();
    if (lastRunDate !== today) {
      const prevDate = lastRunDate;
      lastRunDate = today;
      todayPostedAccounts = loadTodayPostedFromDB();
      nextScheduledTime = null;
      if (prevDate === '') {
        log('info', `기동/재시작: 오늘자 포스팅 ${todayPostedAccounts.size}개 DB에서 복원`);
      } else {
        log('info', `새로운 날짜: ${today} — DB 재조회 (${todayPostedAccounts.size}건)`);
      }
    }

    if (!isTodaySelected(settings)) return;
    if (!isWithinTimeWindow(settings)) return;

    const dailyMax = settings.dailyMax || 5;
    if (todayPostedAccounts.size >= dailyMax) return;

    if (nextScheduledTime && Date.now() < nextScheduledTime) return;

    isProcessing = true;
    log('info', '티스토리 자동 포스팅 시작...');

    const accounts = TistoryAccount.listAccounts().filter(a => a.isActive && a.autoPublish);
    if (accounts.length === 0) {
      log('warn', '활성 계정이 없습니다.');
      isProcessing = false;
      return;
    }

    todayPostedAccounts = loadTodayPostedFromDB();
    const pendingAccounts = accounts.filter(a => !todayPostedAccounts.has(a.id));
    if (pendingAccounts.length === 0) {
      log('info', `오늘 모든 계정 포스팅 완료 (${accounts.length}/${accounts.length})`);
      isProcessing = false;
      return;
    }

    const remaining = dailyMax - todayPostedAccounts.size;
    const toProcess = pendingAccounts.slice(0, remaining);

    for (const account of toProcess) {
      if (todayPostedAccounts.size >= dailyMax) break;

      try {
        const raw = TistoryAccount.getAccountRaw(account.id);
        if (!raw) continue;

        // 포스팅 타입 결정 — 티스토리는 Tier 5 고정 (일반1+광고1 교차)
        const publishedCount = db.prepare(
          `SELECT COUNT(1) as cnt FROM tistory_postings WHERE accountId = ? AND status IN ('발행완료', '확인필요')`
        ).get(account.id)?.cnt || 0;
        const postType = getPostTypeForTier(5, publishedCount);
        log('info', `${account.accountName}: 누적 ${publishedCount}회, Tier5 고정 → ${postType}`);

        // 검수완료 콘텐츠 찾기
        const contents = Content.listContents();
        let pendingContent = contents.find(c =>
          c.status === '검수완료' && c.contentType === postType && (c.platform || 'naver') === 'tistory'
        );

        if (!pendingContent) {
          log('warn', `${account.accountName}: '${postType}' 검수완료 콘텐츠 없음, 건너뜀`);
          continue;
        }

        log('info', `${account.accountName}: "${pendingContent.keyword}" 발행 시도`);
        Content.updateContent(pendingContent.id, { status: '발행중', accountId: account.id });

        // 발행 기록 생성
        const postingId = uuid();
        db.prepare(`INSERT INTO tistory_postings (id, keyword, accountName, accountId, contentId, status)
          VALUES (?, ?, ?, ?, ?, '발행중')`)
          .run(postingId, pendingContent.keyword, account.accountName, account.id, pendingContent.id);

        // 발행
        const result = await requestTistoryPublish({
          account: {
            id: raw.id,
            account_name: raw.accountName,
            blog_name: raw.blogName,
            kakao_id: raw.kakaoId,
            kakao_password: raw.kakaoPassword || '',
          },
          post_data: {
            title: pendingContent.title || pendingContent.keyword,
            content: processBody(pendingContent.body || '', pendingContent.contentType),
            keyword: pendingContent.keyword,
            tags: pendingContent.keyword,
            post_type: postType === '광고(대출)' ? 'ad' : 'general',
          },
        });

        if (result.success) {
          db.prepare(`UPDATE tistory_postings SET status='발행완료', url=?, updatedAt=datetime('now','localtime') WHERE id=?`)
            .run(result.url || '', postingId);
          Content.updateContent(pendingContent.id, { status: '발행완료' });
          todayPostedAccounts.add(account.id);
          log('success', `발행 성공: ${account.accountName} → ${result.url}`);
          telegram.send(`✅ [티스토리] ${account.accountName} 발행 완료\n키워드: ${pendingContent.keyword}\nURL: ${result.url || '-'}`).catch(() => {});
        } else {
          db.prepare(`UPDATE tistory_postings SET status='실패', error=?, updatedAt=datetime('now','localtime') WHERE id=?`)
            .run(result.error || '발행 실패', postingId);
          Content.updateContent(pendingContent.id, { status: '검수완료' });
          todayPostedAccounts.add(account.id);
          log('error', `발행 실패: ${account.accountName} — ${result.error} (오늘 재시도 안 함)`);
          telegram.send(`❌ [티스토리] ${account.accountName} 발행 실패\n오류: ${result.error}`).catch(() => {});
        }
      } catch (err) {
        todayPostedAccounts.add(account.id);
        log('error', `${account.accountName} 예외: ${err.message} (오늘 재시도 안 함)`);
      }

      // 다음 계정 대기
      if (toProcess.indexOf(account) < toProcess.length - 1) {
        const minMin = Number(settings.intervalMin);
        const maxMin = Number(settings.intervalMax);
        const safeMin = Number.isFinite(minMin) && minMin > 0 ? minMin : 5;
        const safeMax = Number.isFinite(maxMin) && maxMin >= safeMin ? maxMin : safeMin + 10;
        const waitMs = randomInt(safeMin * 60000, safeMax * 60000);
        nextScheduledTime = Date.now() + waitMs;
        log('info', `다음 발행까지 ${(waitMs / 60000).toFixed(1)}분 대기 (설정 ${safeMin}~${safeMax}분)`);
        isProcessing = false;
        return;
      }
    }

    log('success', `오늘 티스토리 포스팅 완료: ${todayPostedAccounts.size}/${dailyMax}`);
  } catch (err) {
    log('error', `checkAndRun 오류: ${err.message}`);
  } finally {
    isProcessing = false;
    if (!nextScheduledTime || Date.now() >= nextScheduledTime) {
      nextScheduledTime = null;
    }
  }
}

// ── 스케줄러 제어 ──
function startTistoryScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  running = true;
  intervalHandle = setInterval(() => {
    checkAndRun().catch(err => log('error', `예기치 않은 오류: ${err.message}`));
  }, 60 * 1000);
  log('info', '티스토리 스케줄러 시작됨 (60초 간격)');
  checkAndRun().catch(err => log('error', `초기 체크 오류: ${err.message}`));
}

function stopTistoryScheduler() {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  running = false;
  log('warn', '티스토리 스케줄러 정지됨');
}

function restartTistoryScheduler() {
  stopTistoryScheduler();
  startTistoryScheduler();
}

function getStatus() {
  const now = Date.now();
  let nextRunIn = null;
  if (nextScheduledTime && nextScheduledTime > now) {
    nextRunIn = Math.round((nextScheduledTime - now) / 1000);
  }
  return {
    running,
    lastRunDate,
    todayPosted: todayPostedAccounts.size,
    nextRunIn,
    isProcessing,
  };
}

module.exports = {
  startTistoryScheduler,
  stopTistoryScheduler,
  restartTistoryScheduler,
  getStatus,
  getLogs,
  isRunning: () => running,
};

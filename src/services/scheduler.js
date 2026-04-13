/**
 * scheduler.js — 자동 포스팅 스케줄러
 * 매분마다 설정을 확인하고 조건이 맞으면 자동으로 포스팅 큐 생성 + 발행
 */

const Posting = require('../models/Posting');
const Content = require('../models/Content');
const { listAccounts, getAccountRaw, updateAccount } = require('../models/Account');
const { requestPublish } = require('../services/pythonBridge');
const telegram = require('../services/telegram');
const { processBody } = require('../services/postingHelper');
const db = require('../db/sqlite');

// ── 상태 ──
let intervalHandle = null;
let running = false;
let lastRunDate = '';
let todayPostedAccounts = new Set();
let isProcessing = false; // 중복 실행 방지
let nextScheduledTime = null; // 다음 발행 예정 시각

// ── 링 버퍼 로그 (프론트엔드 실시간 표시용) ──
const LOG_MAX = 200;
const logBuffer = [];
function log(level, message) {
  const entry = {
    time: new Date().toISOString(),
    level, // 'info' | 'warn' | 'error' | 'success' | 'skip'
    message,
  };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
  const prefix = `[Scheduler]`;
  if (level === 'error') console.error(prefix, message);
  else if (level === 'warn') console.warn(prefix, message);
  else console.log(prefix, message);
}
function getLogs() {
  return logBuffer.slice().reverse(); // 최신이 위
}

// ── 티어별 사이클 정의 ──
const TIER_CYCLES = {
  1: { length: 1, adIndices: [] },           // 항상 일반
  2: { length: 4, adIndices: [3] },          // 3일반, 1광고
  3: { length: 4, adIndices: [2, 3] },       // 2일반, 2광고
  4: { length: 4, adIndices: [1, 2, 3] },    // 1일반, 3광고
  5: { length: 5, adIndices: [1, 2, 3, 4] }, // 1일반, 4광고
};

// ── 티어 업그레이드 기준 (일수) ──
const TIER_UPGRADE_DAYS = {
  1: 14,
  2: 14,
  3: 14,
  4: 14,
};

// ── 요일 매핑 (JS getDay → 한국어) ──
const DAY_MAP = ['일', '월', '화', '수', '목', '금', '토'];
// 프론트엔드 boolean 배열 순서: [월, 화, 수, 목, 금, 토, 일]
const FRONTEND_DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 티어와 계정 생성일로부터 오늘 포스팅 타입 결정
 */
function getPostTypeForTier(tier, daysSinceCreation) {
  const cycle = TIER_CYCLES[tier] || TIER_CYCLES[1];
  const dayInCycle = daysSinceCreation % cycle.length;
  if (cycle.adIndices.includes(dayInCycle)) {
    return '광고(대출)';
  }
  return '일반 정보성';
}

/**
 * 날짜 차이 계산 (일 단위)
 */
function daysBetween(dateStr) {
  const created = new Date(dateStr);
  const now = new Date();
  // 날짜만 비교 (시간 무시)
  const createdDate = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((todayDate - createdDate) / (1000 * 60 * 60 * 24));
}

/**
 * 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * DB에서 오늘 이미 포스팅(발행완료/확인필요)된 계정 ID Set을 조회
 * 재시작 후에도 정확한 "오늘 포스팅 현황"을 유지하기 위함
 */
function loadTodayPostedFromDB() {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT accountId FROM postings
      WHERE status IN ('발행완료', '확인필요')
        AND date(createdAt, 'localtime') = date('now', 'localtime')
        AND accountId IS NOT NULL
    `).all();
    const set = new Set(rows.map(r => r.accountId));
    return set;
  } catch (err) {
    log('error', `DB 조회 실패: ${err.message}`);
    return new Set();
  }
}

/**
 * 현재 시각이 운영 시간대 안에 있는지 확인
 */
function isWithinTimeWindow(settings) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseInt(settings.startHour || '0', 10) * 60 + parseInt(settings.startMin || '0', 10);
  const endMinutes = parseInt(settings.endHour || '23', 10) * 60 + parseInt(settings.endMin || '59', 10);
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * 오늘 요일이 선택된 요일인지 확인
 * 프론트엔드 포맷: boolean[7] — [월, 화, 수, 목, 금, 토, 일]
 * 레거시 포맷: string[] — ['월', '화', ...]
 */
function isTodaySelected(settings) {
  const selectedDays = settings.selectedDays;
  const todayKor = DAY_MAP[new Date().getDay()]; // JS: 0=일, 1=월, ..., 6=토

  // 기본값 (월~금)
  if (!selectedDays) return ['월', '화', '수', '목', '금'].includes(todayKor);

  // boolean 배열 포맷 (프론트엔드)
  if (Array.isArray(selectedDays) && typeof selectedDays[0] === 'boolean') {
    const idx = FRONTEND_DAY_ORDER.indexOf(todayKor);
    return idx >= 0 && !!selectedDays[idx];
  }

  // 문자열 배열 포맷 (레거시)
  if (Array.isArray(selectedDays)) {
    return selectedDays.includes(todayKor);
  }

  return false;
}

/**
 * 랜덤 정수 (min~max 포함)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * ms 동안 대기
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 자동 티어 업그레이드 확인 및 실행
 */
function checkTierUpgrades() {
  try {
    const accounts = listAccounts();
    for (const account of accounts) {
      if (!account.isActive) continue;
      const currentTier = account.tier || 1;
      if (currentTier >= 5) continue; // 최대 티어

      const requiredDays = TIER_UPGRADE_DAYS[currentTier];
      if (!requiredDays) continue;

      const days = daysBetween(account.createdAt);
      if (days >= requiredDays) {
        const newTier = currentTier + 1;
        updateAccount(account.id, { tier: newTier });
        console.log(`[Scheduler] 티어 업그레이드: ${account.accountName} (Tier ${currentTier} → ${newTier}, ${days}일 경과)`);
        telegram.notifyTierUpgrade(account.accountName, currentTier, newTier);
      }
    }
  } catch (err) {
    console.error('[Scheduler] 티어 업그레이드 확인 중 오류:', err.message);
  }
}

/**
 * 메인 체크: 조건 확인 후 큐 생성 + 발행
 */
async function checkAndRun() {
  if (isProcessing) {
    return; // 이미 처리 중이면 스킵
  }

  try {
    const settings = Posting.getSettings();

    // autoEngine이 꺼져 있으면 무시
    if (!settings.autoEngine) {
      return;
    }

    // 날짜 리셋 체크 — 재시작/날짜 변경 시 DB에서 오늘자 현황 복원
    const today = todayStr();
    if (lastRunDate !== today) {
      const prevDate = lastRunDate;
      lastRunDate = today;
      todayPostedAccounts = loadTodayPostedFromDB();
      nextScheduledTime = null;
      if (prevDate === '') {
        log('info', `기동/재시작: 오늘자 포스팅 ${todayPostedAccounts.size}개 DB에서 복원`);
      } else {
        log('info', `새로운 날짜 감지: ${today} — DB 재조회 (${todayPostedAccounts.size}건)`);
      }
    }

    // 요일 체크
    if (!isTodaySelected(settings)) {
      log('skip', `오늘은 선택된 요일이 아님 - selectedDays=${JSON.stringify(settings.selectedDays)}`);
      return;
    }

    // 시간대 체크
    if (!isWithinTimeWindow(settings)) {
      const now = new Date();
      log('skip', `시간 외 - 현재 ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}, 윈도우 ${settings.startHour}:${settings.startMin}~${settings.endHour}:${settings.endMin}`);
      return;
    }

    // dailyMax 체크
    const dailyMax = settings.dailyMax || 10;
    if (todayPostedAccounts.size >= dailyMax) {
      log('skip', `일일 최대 ${dailyMax} 도달`);
      return;
    }

    // 다음 예정 시각이 있고 아직 도달하지 않았으면 스킵
    if (nextScheduledTime && Date.now() < nextScheduledTime) {
      const remain = Math.round((nextScheduledTime - Date.now()) / 1000);
      log('skip', `다음 발행까지 ${remain}초 대기중`);
      return;
    }

    // 자동 티어 업그레이드
    if (settings.autoTierUpgrade) {
      checkTierUpgrades();
    }

    isProcessing = true;
    log('info', '자동 포스팅 시작...');

    // 활성 계정 목록
    const accounts = listAccounts().filter(a => a.isActive && a.autoPublish);
    if (accounts.length === 0) {
      log('warn', '활성 계정이 없습니다.');
      isProcessing = false;
      return;
    }

    // DB에서 오늘 완료된 계정 현황 재조회
    todayPostedAccounts = loadTodayPostedFromDB();

    // 오늘 아직 포스팅하지 않은 계정 필터
    const pendingAccounts = accounts.filter(a => !todayPostedAccounts.has(a.id));
    if (pendingAccounts.length === 0) {
      log('info', `오늘 모든 계정 포스팅 완료 (${accounts.length}/${accounts.length})`);
      isProcessing = false;
      return;
    }

    // dailyMax 남은 수만큼만 처리
    const remaining = dailyMax - todayPostedAccounts.size;
    const toProcess = pendingAccounts.slice(0, remaining);

    for (const account of toProcess) {
      // dailyMax 재확인
      if (todayPostedAccounts.size >= dailyMax) break;

      try {
        // 1. 포스팅 타입 결정
        const days = daysBetween(account.createdAt);
        const postType = getPostTypeForTier(account.tier || 1, days);
        log('info', `${account.accountName}: Tier ${account.tier}, ${days}일 경과, 타입=${postType}`);

        // 2. 검수완료 콘텐츠 찾기 (AI 생성 완료된 것)
        const contents = Content.listContents();
        let pendingContent = contents.find(c =>
          c.status === '검수완료' && c.contentType === postType
        );

        // 검수완료가 없으면 → 발행완료 키워드 재활용 (비동기로 새 콘텐츠 AI 생성 요청)
        if (!pendingContent) {
          const usedContent = contents.find(c =>
            c.status === '발행완료' && c.contentType === postType
          );
          if (usedContent) {
            const recycled = Content.recycleKeyword(usedContent.id);
            log('info', `키워드 재활용: "${usedContent.keyword}" → 새 콘텐츠 (AI 생성 대기)`);
            continue;
          }
        }

        if (!pendingContent) {
          log('warn', `${account.accountName}: '${postType}' 검수완료 콘텐츠 없음, 건너뜀`);
          continue;
        }

        // 3. 포스팅 큐 아이템 생성
        const posting = Posting.createPosting({
          keyword: pendingContent.keyword,
          accountName: account.accountName,
          accountId: account.id,
          tone: pendingContent.tone || '친근톤',
          contentId: pendingContent.id,
          scheduledTime: '즉시',
        });
        log('info', `큐 생성: ${account.accountName} / "${pendingContent.keyword}"`);

        // 4. 콘텐츠 상태 업데이트
        Content.updateContent(pendingContent.id, { status: '발행중', accountId: account.id });

        // 5. 발행 실행
        Posting.updatePosting(posting.id, { status: '발행중' });

        const rawAccount = getAccountRaw(account.id);
        const result = await requestPublish({
          posting_id: posting.id,
          account: {
            id: rawAccount.id,
            account_name: rawAccount.accountName,
            naver_id: rawAccount.naverId,
            naver_password: rawAccount.naverPassword || '',
          },
          post_data: {
            title: pendingContent.title || pendingContent.keyword,
            content: processBody(pendingContent.body || '', pendingContent.contentType),
            keywords: JSON.stringify([pendingContent.keyword]),
            keyword: pendingContent.keyword,
            post_type: postType === '광고(대출)' ? 'ad' : 'general',
          },
        });

        if (result.success) {
          Posting.updatePosting(posting.id, { status: '발행완료', url: result.url, error: null });
          Content.updateContent(pendingContent.id, { status: '발행완료' });
          todayPostedAccounts.add(account.id);
          log('success', `발행 성공: ${account.accountName} → ${result.url}`);
          telegram.notifyPublishSuccess(account.accountName, pendingContent.keyword, result.url);

          const recycled = Content.recycleKeyword(pendingContent.id);
          if (recycled) {
            log('info', `키워드 자동 재활용: "${pendingContent.keyword}"`);
          }
        } else if (result.timedOut) {
          Posting.updatePosting(posting.id, { status: '확인필요', error: '타임아웃 — 실제 발행 여부 확인 필요' });
          Content.updateContent(pendingContent.id, { status: '발행완료' });
          todayPostedAccounts.add(account.id);
          log('warn', `발행 타임아웃 (확인필요): ${account.accountName}`);
        } else {
          Posting.updatePosting(posting.id, { status: '실패', error: result.error || '발행 실패' });
          Content.updateContent(pendingContent.id, { status: '대기' });
          Posting.addError({
            accountName: account.accountName,
            message: `[자동] ${result.error || '발행 실패'}`,
            severity: '오류',
          });
          log('error', `발행 실패: ${account.accountName} — ${result.error}`);
          telegram.notifyPublishFail(account.accountName, pendingContent.keyword, result.error);
        }
      } catch (err) {
        Posting.addError({
          accountName: account.accountName,
          message: `[자동] ${err.message}`,
          severity: '오류',
        });
        log('error', `${account.accountName} 처리 중 예외: ${err.message}`);
      }

      // 다음 계정 발행 전 랜덤 간격 대기
      if (toProcess.indexOf(account) < toProcess.length - 1) {
        const minMin = Number(settings.intervalMin);
        const maxMin = Number(settings.intervalMax);
        const safeMin = Number.isFinite(minMin) && minMin > 0 ? minMin : 5;
        const safeMax = Number.isFinite(maxMin) && maxMin >= safeMin ? maxMin : safeMin + 10;
        const minInterval = safeMin * 60 * 1000;
        const maxInterval = safeMax * 60 * 1000;
        const waitMs = randomInt(minInterval, maxInterval);
        nextScheduledTime = Date.now() + waitMs;
        const waitMin = (waitMs / 60000).toFixed(1);
        log('info', `다음 발행까지 ${waitMin}분 대기 (설정 ${safeMin}~${safeMax}분)`);
        isProcessing = false;
        return;
      }
    }

    log('success', `오늘 포스팅 완료: ${todayPostedAccounts.size}/${dailyMax} 계정`);
  } catch (err) {
    log('error', `checkAndRun 오류: ${err.message}`);
  } finally {
    isProcessing = false;
    if (!nextScheduledTime || Date.now() >= nextScheduledTime) {
      nextScheduledTime = null;
    }
  }
}

/**
 * 스케줄러 시작 (60초 간격)
 */
function startScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
  }
  running = true;
  intervalHandle = setInterval(() => {
    checkAndRun().catch(err => {
      log('error', `예기치 않은 오류: ${err.message}`);
    });
  }, 60 * 1000);

  log('info', '스케줄러 시작됨 (60초 간격)');

  // 시작 시 즉시 한 번 체크
  checkAndRun().catch(err => {
    log('error', `초기 체크 오류: ${err.message}`);
  });
}

/**
 * 스케줄러 정지 — interval 해제. 진행 중인 작업은 완료됨.
 */
function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  running = false;
  log('warn', '스케줄러 정지됨 - 다음 체크부터 실행되지 않습니다');
}

/**
 * 스케줄러 재시작 (설정 변경 시 호출)
 */
function restartScheduler() {
  console.log('[Scheduler] 스케줄러 재시작...');
  stopScheduler();
  startScheduler();
}

/**
 * 스케줄러 상태 반환
 */
function getSchedulerStatus() {
  const now = Date.now();
  let nextRunIn = null;
  if (nextScheduledTime && nextScheduledTime > now) {
    nextRunIn = Math.round((nextScheduledTime - now) / 1000); // 초 단위
  }
  return {
    running,
    lastRunDate,
    todayPosted: todayPostedAccounts.size,
    todayPostedAccounts: Array.from(todayPostedAccounts),
    nextRunIn,
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  restartScheduler,
  getSchedulerStatus,
  checkAndRun,
  getPostTypeForTier,
  daysBetween,
  checkTierUpgrades,
  getLogs,
  isRunning: () => running,
};

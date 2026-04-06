/**
 * scheduler.js — 자동 포스팅 스케줄러
 * 매분마다 설정을 확인하고 조건이 맞으면 자동으로 포스팅 큐 생성 + 발행
 */

const Posting = require('../models/Posting');
const Content = require('../models/Content');
const { listAccounts, getAccountRaw, updateAccount } = require('../models/Account');
const { requestPublish } = require('../services/pythonBridge');

// ── 상태 ──
let intervalHandle = null;
let running = false;
let lastRunDate = '';
let todayPostedAccounts = new Set();
let isProcessing = false; // 중복 실행 방지
let nextScheduledTime = null; // 다음 발행 예정 시각

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
 * 현재 시각이 운영 시간대 안에 있는지 확인
 */
function isWithinTimeWindow(settings) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = (settings.startHour || 0) * 60 + (settings.startMin || 0);
  const endMinutes = (settings.endHour || 23) * 60 + (settings.endMin || 59);
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * 오늘 요일이 선택된 요일인지 확인
 */
function isTodaySelected(settings) {
  const selectedDays = settings.selectedDays || ['월', '화', '수', '목', '금'];
  const today = DAY_MAP[new Date().getDay()];
  return selectedDays.includes(today);
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
    if (!settings.autoEngine) return;

    // 날짜 리셋 체크
    const today = todayStr();
    if (lastRunDate !== today) {
      lastRunDate = today;
      todayPostedAccounts = new Set();
      nextScheduledTime = null;
      console.log(`[Scheduler] 새로운 날짜 감지: ${today} — 카운터 리셋`);
    }

    // 요일 체크
    if (!isTodaySelected(settings)) return;

    // 시간대 체크
    if (!isWithinTimeWindow(settings)) return;

    // randomRest: 10% 확률로 오늘 전체 스킵
    if (settings.randomRest && todayPostedAccounts.size === 0 && !nextScheduledTime) {
      if (Math.random() < 0.1) {
        console.log('[Scheduler] 랜덤 휴식: 오늘은 쉽니다.');
        // 오늘 다시 실행하지 않도록 표시
        todayPostedAccounts.add('__REST_DAY__');
        return;
      }
    }

    // 랜덤 휴식일이면 스킵
    if (todayPostedAccounts.has('__REST_DAY__')) return;

    // dailyMax 체크
    const dailyMax = settings.dailyMax || 10;
    if (todayPostedAccounts.size >= dailyMax) return;

    // 다음 예정 시각이 있고 아직 도달하지 않았으면 스킵
    if (nextScheduledTime && Date.now() < nextScheduledTime) return;

    // 자동 티어 업그레이드
    if (settings.autoTierUpgrade) {
      checkTierUpgrades();
    }

    isProcessing = true;
    console.log('[Scheduler] 자동 포스팅 시작...');

    // 활성 계정 목록
    const accounts = listAccounts().filter(a => a.isActive && a.autoPublish);
    if (accounts.length === 0) {
      console.log('[Scheduler] 활성 계정이 없습니다.');
      isProcessing = false;
      return;
    }

    // 오늘 아직 포스팅하지 않은 계정 필터
    const pendingAccounts = accounts.filter(a => !todayPostedAccounts.has(a.id));
    if (pendingAccounts.length === 0) {
      console.log('[Scheduler] 오늘 모든 계정 포스팅 완료.');
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
        console.log(`[Scheduler] ${account.accountName}: Tier ${account.tier}, ${days}일 경과, 타입=${postType}`);

        // 2. 매칭되는 대기 콘텐츠 찾기
        const contents = Content.listContents();
        const pendingContent = contents.find(c =>
          c.status === '대기' && c.contentType === postType
        );

        if (!pendingContent) {
          console.log(`[Scheduler] ${account.accountName}: '${postType}' 대기 콘텐츠가 없습니다. 건너뜁니다.`);
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
        console.log(`[Scheduler] 큐 생성: ${posting.id} (${account.accountName}, ${pendingContent.keyword})`);

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
            content: pendingContent.body || '',
            keywords: JSON.stringify([pendingContent.keyword]),
            keyword: pendingContent.keyword,
            post_type: postType === '광고(대출)' ? 'ad' : 'general',
          },
        });

        if (result.success) {
          Posting.updatePosting(posting.id, { status: '발행완료', url: result.url, error: null });
          Content.updateContent(pendingContent.id, { status: '발행완료' });
          todayPostedAccounts.add(account.id);
          console.log(`[Scheduler] 발행 성공: ${account.accountName} → ${result.url}`);
        } else {
          Posting.updatePosting(posting.id, { status: '실패', error: result.error || '발행 실패' });
          Content.updateContent(pendingContent.id, { status: '대기' }); // 실패 시 콘텐츠 복원
          Posting.addError({
            accountName: account.accountName,
            message: `[자동] ${result.error || '발행 실패'}`,
            severity: '오류',
          });
          console.error(`[Scheduler] 발행 실패: ${account.accountName} — ${result.error}`);
        }
      } catch (err) {
        Posting.addError({
          accountName: account.accountName,
          message: `[자동] ${err.message}`,
          severity: '오류',
        });
        console.error(`[Scheduler] ${account.accountName} 처리 중 예외:`, err.message);
      }

      // 다음 계정 발행 전 랜덤 간격 대기
      if (toProcess.indexOf(account) < toProcess.length - 1) {
        const minInterval = (settings.intervalMin || 5) * 60 * 1000;
        const maxInterval = (settings.intervalMax || 15) * 60 * 1000;
        const waitMs = randomInt(minInterval, maxInterval);
        nextScheduledTime = Date.now() + waitMs;
        console.log(`[Scheduler] 다음 발행까지 ${Math.round(waitMs / 60000)}분 대기...`);
        isProcessing = false;
        return; // 다음 checkAndRun 호출에서 이어서 처리
      }
    }

    console.log(`[Scheduler] 오늘 포스팅 완료: ${todayPostedAccounts.size}/${dailyMax} 계정`);
  } catch (err) {
    console.error('[Scheduler] checkAndRun 오류:', err.message);
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
      console.error('[Scheduler] 예기치 않은 오류:', err.message);
    });
  }, 60 * 1000);

  console.log('[Scheduler] 스케줄러 시작됨 (60초 간격)');

  // 시작 시 즉시 한 번 체크
  checkAndRun().catch(err => {
    console.error('[Scheduler] 초기 체크 오류:', err.message);
  });
}

/**
 * 스케줄러 정지
 */
function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  running = false;
  console.log('[Scheduler] 스케줄러 정지됨');
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
    todayPostedAccounts: Array.from(todayPostedAccounts).filter(id => id !== '__REST_DAY__'),
    isRestDay: todayPostedAccounts.has('__REST_DAY__'),
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
  checkTierUpgrades,
};

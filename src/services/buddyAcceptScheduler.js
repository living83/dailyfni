/**
 * 서로이웃 자동 수락 스케줄러 — 주간 단위 설정
 * 설정된 요일/시간에 서로이웃 신청을 자동 수락
 */

const db = require('../db/sqlite');
const { listAccounts, getAccountRaw } = require('../models/Account');
const { requestBuddyAccept } = require('./pythonBridge');
const telegram = require('./telegram');

let intervalId = null;
let isProcessing = false;

// ── 요일 매핑 (프론트엔드 boolean[7]: [월,화,수,목,금,토,일]) ──
const FRONTEND_DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_MAP = ['일', '월', '화', '수', '목', '금', '토']; // JS getDay

// ── 설정 ──
function getSettings() {
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'buddy_accept'`).get();
    const defaults = {
      enabled: false,
      selectedDays: [true, false, true, false, true, false, false], // 월수금
      runHour: '09',
      runMin: '00',
      acceptMode: 'all', // 'all' | 'with_message'
      dailyMaxAccept: 50,
      accountIds: [], // 비어있으면 전체
    };
    return row ? { ...defaults, ...JSON.parse(row.value) } : defaults;
  } catch { return { enabled: false }; }
}

function updateSettings(data) {
  const current = getSettings();
  const updated = { ...current, ...data };
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('buddy_accept', ?)`).run(JSON.stringify(updated));
  return updated;
}

// ── 영속 상태 (재시작에도 보존) ──
function loadState() {
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'buddy_accept_state'`).get();
    if (row) return JSON.parse(row.value);
  } catch {}
  return { lastRunDate: '' };
}

function saveState(state) {
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('buddy_accept_state', ?)`).run(JSON.stringify(state));
}

// ── 로그 ──
function addLog(accountName, acceptedCount, skippedCount, error) {
  db.prepare(`INSERT INTO buddy_accept_logs (accountName, acceptedCount, skippedCount, error) VALUES (?, ?, ?, ?)`)
    .run(accountName, acceptedCount || 0, skippedCount || 0, error || '');
}

function getLogs(limit = 50) {
  return db.prepare(`SELECT * FROM buddy_accept_logs ORDER BY timestamp DESC LIMIT ?`).all(limit);
}

// ── 메인 체크 ──
async function checkAndRun() {
  if (isProcessing) return;

  try {
    const settings = getSettings();
    if (!settings.enabled) return;

    const now = new Date();
    // 로컬 날짜 사용 (KST) — toISOString()은 UTC라 9시간 차이 발생
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const state = loadState();

    // 오늘 이미 실행했으면 스킵
    if (state.lastRunDate === today) return;

    // 요일 체크
    const todayKor = DAY_MAP[now.getDay()];
    const selectedDays = settings.selectedDays;
    if (Array.isArray(selectedDays) && typeof selectedDays[0] === 'boolean') {
      const idx = FRONTEND_DAY_ORDER.indexOf(todayKor);
      if (idx < 0 || !selectedDays[idx]) return;
    }

    // 시간 체크: 설정 시각 ~ +10분 이내에만 트리거
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const runMin = parseInt(settings.runHour || '9', 10) * 60 + parseInt(settings.runMin || '0', 10);
    if (currentMin < runMin || currentMin > runMin + 10) return;

    isProcessing = true;
    console.log(`[BuddyScheduler] 서로이웃 수락 시작 — ${now.toLocaleTimeString()}`);

    // 대상 계정
    const allAccounts = listAccounts().filter(a => a.isActive);
    const targetIds = settings.accountIds && settings.accountIds.length > 0
      ? new Set(settings.accountIds)
      : null;
    const accounts = targetIds
      ? allAccounts.filter(a => targetIds.has(a.id))
      : allAccounts;

    if (accounts.length === 0) {
      console.log('[BuddyScheduler] 활성 계정 없음');
      state.lastRunDate = today;
      saveState(state);
      isProcessing = false;
      return;
    }

    let totalAccepted = 0;

    for (const acc of accounts) {
      const raw = getAccountRaw(acc.id);
      if (!raw) continue;

      try {
        console.log(`[BuddyScheduler] ${raw.accountName} 수락 처리중...`);
        const result = await requestBuddyAccept({
          account: {
            id: raw.id,
            account_name: raw.accountName,
            naver_id: raw.naverId,
            naver_password: raw.naverPassword || '',
          },
          config: {
            max_accept: settings.dailyMaxAccept || 50,
            accept_mode: settings.acceptMode || 'all',
          },
        });

        const accepted = result.accepted_count || 0;
        const skipped = result.skipped_count || 0;
        totalAccepted += accepted;

        addLog(raw.accountName, accepted, skipped, result.error || '');
        console.log(`[BuddyScheduler] ${raw.accountName}: ${accepted}건 수락, ${skipped}건 건너뜀`);

        if (accepted > 0) {
          telegram.sendMessage(`🤝 [${raw.accountName}] 서로이웃 ${accepted}건 수락 완료`).catch(() => {});
        }
      } catch (err) {
        console.error(`[BuddyScheduler] ${raw.accountName} 예외:`, err.message);
        addLog(raw.accountName, 0, 0, err.message);
      }

      // 계정 간 30~60초 대기
      if (accounts.indexOf(acc) < accounts.length - 1) {
        await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000));
      }
    }

    state.lastRunDate = today;
    saveState(state);
    console.log(`[BuddyScheduler] 완료 — 총 ${totalAccepted}건 수락`);

  } catch (err) {
    console.error('[BuddyScheduler] 오류:', err.message);
  } finally {
    isProcessing = false;
  }
}

// ── 스케줄러 제어 ──
function startBuddyScheduler() {
  stopBuddyScheduler();
  console.log('[BuddyScheduler] 서로이웃 수락 스케줄러 시작');
  intervalId = setInterval(checkAndRun, 60 * 1000);
  setTimeout(checkAndRun, 10000); // 10초 후 첫 체크
}

function stopBuddyScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function restartBuddyScheduler() {
  stopBuddyScheduler();
  startBuddyScheduler();
}

function getStatus() {
  const settings = getSettings();
  const state = loadState();
  return {
    running: !!intervalId && !!settings.enabled,
    lastRunDate: state.lastRunDate,
    isProcessing,
  };
}

module.exports = {
  startBuddyScheduler,
  stopBuddyScheduler,
  restartBuddyScheduler,
  getStatus,
  getSettings,
  updateSettings,
  getLogs,
  addLog,
  checkAndRun,
};

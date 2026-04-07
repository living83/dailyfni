/**
 * 이웃참여 스케줄러 — 설정 시간에 자동으로 이웃 블로그 공감
 */

const { getSettingsRaw } = require('../models/Settings');
const { listAccounts, getAccountRaw } = require('../models/Account');
const Engagement = require('../models/Engagement');
const { requestEngageBatch } = require('./pythonBridge');
const telegram = require('./telegram');
const db = require('../db/sqlite');

let intervalId = null;
let isProcessing = false;

/* ── 영속 상태 (재시작에도 보존) ── */
function loadState() {
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'engagement_state'`).get();
    if (row) return JSON.parse(row.value);
  } catch {}
  return { lastRunDate: '', todayVisitedCount: 0, isRestDay: false };
}
function saveState(state) {
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('engagement_state', ?)`).run(JSON.stringify(state));
}

function startEngagementScheduler() {
  stopEngagementScheduler();
  console.log('[EngScheduler] 이웃참여 스케줄러 시작');
  intervalId = setInterval(checkAndRunEngagement, 60 * 1000);
  setTimeout(checkAndRunEngagement, 5000);
}

function stopEngagementScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function restartEngagementScheduler() {
  console.log('[EngScheduler] 스케줄러 재시작');
  stopEngagementScheduler();
  startEngagementScheduler();
}

async function checkAndRunEngagement() {
  if (isProcessing) return;

  try {
    const settings = getSettingsRaw();

    if (!settings.engagementBot) return;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const state = loadState();

    // 새 날짜로 진입 시 상태 리셋
    if (state.lastRunDate !== today) {
      state.lastRunDate = today;
      state.todayVisitedCount = 0;
      state.isRestDay = false;
      saveState(state);
    }

    // 오늘 이미 실행했으면 스킵 (재시작에도 영속)
    if (state.isRestDay) return;

    // 시간 체크
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const startH = parseInt(settings.engStartHour || '09');
    const startM = parseInt(settings.engStartMin || '00');
    const endH = parseInt(settings.engEndHour || '18');
    const endM = parseInt(settings.engEndMin || '00');

    const currentTime = currentHour * 60 + currentMin;
    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;

    if (currentTime < startTime || currentTime > endTime) return;

    // 트리거 윈도우: 시작 시각부터 10분 이내에만 발동
    // (재시작 후 윈도우 중간에 즉시 실행되는 문제 방지)
    if (currentTime > startTime + 10) return;

    // 참여 계정
    const engageAccounts = listAccounts().filter(a => a.isActive && a.neighborEngage);
    if (engageAccounts.length === 0) return;

    const maxVisits = settings.maxVisits || 10;

    isProcessing = true;
    console.log(`[EngScheduler] 공감 실행 — ${engageAccounts.length}개 계정, ${now.toLocaleTimeString()}`);

    let totalLikes = 0;
    for (const acc of engageAccounts) {
      const raw = getAccountRaw(acc.id);
      if (!raw) continue;

      try {
        const result = await requestEngageBatch({
          account: {
            id: raw.id,
            account_name: raw.accountName,
            naver_id: raw.naverId,
            naver_password: raw.naverPassword || '',
          },
          config: {
            engagement_max_posts: maxVisits,
            engagement_do_like: settings.heartLike !== false,
          },
        });

        const likes = result.like_count || 0;
        totalLikes += likes;
        state.todayVisitedCount += likes;

        for (const r of result.results || []) {
          if (r.like_success) {
            Engagement.addActivity({
              accountName: raw.accountName,
              action: '♥ 공감',
              target: (r.post_title || '').substring(0, 30),
            });
          }
        }

        console.log(`[EngScheduler] ${raw.accountName}: ${likes}건 공감 완료`);
        if (likes > 0) {
          telegram.notifyEngagementDone(raw.accountName, likes, 0).catch(() => {});
        }
      } catch (err) {
        console.error(`[EngScheduler] ${raw.accountName} 예외:`, err.message);
      }

      // 계정 간 간격 (30~60초)
      if (engageAccounts.indexOf(acc) < engageAccounts.length - 1) {
        await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000));
      }
    }

    console.log(`[EngScheduler] 오늘 총 공감 ${totalLikes}건 완료`);
    state.isRestDay = true; // 하루 1회만 실행 (영속 저장)
    saveState(state);
  } catch (err) {
    console.error('[EngScheduler] 오류:', err.message);
  } finally {
    isProcessing = false;
  }
}

function getEngagementSchedulerStatus() {
  const settings = getSettingsRaw();
  const state = loadState();
  return {
    running: !!intervalId && !!settings.engagementBot,
    lastRunDate: state.lastRunDate,
    todayVisitedCount: state.todayVisitedCount,
    isRestDay: state.isRestDay,
    isProcessing,
  };
}

module.exports = {
  startEngagementScheduler,
  stopEngagementScheduler,
  restartEngagementScheduler,
  getEngagementSchedulerStatus,
};

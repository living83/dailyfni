/**
 * 이웃참여 스케줄러 — 설정 시간에 자동으로 이웃 블로그 공감
 */

const { getSettingsRaw } = require('../models/Settings');
const { listAccounts, getAccountRaw } = require('../models/Account');
const Engagement = require('../models/Engagement');
const { requestEngageBatch } = require('./pythonBridge');
const telegram = require('./telegram');

let intervalId = null;
let lastRunDate = '';
let todayVisitedCount = 0;
let isProcessing = false;
let isRestDay = false;

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

    if (lastRunDate !== today) {
      lastRunDate = today;
      todayVisitedCount = 0;
      isRestDay = false;
    }

    if (isRestDay) return;

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

    // 참여 계정
    const engageAccounts = listAccounts().filter(a => a.isActive && a.neighborEngage);
    if (engageAccounts.length === 0) return;

    const maxVisits = settings.maxVisits || 10;
    // 하루 1회 실행 조건 — 이미 실행했으면 스킵
    if (todayVisitedCount >= maxVisits * engageAccounts.length) return;

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
        todayVisitedCount += likes;

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
    isRestDay = true; // 하루 1회만 실행
  } catch (err) {
    console.error('[EngScheduler] 오류:', err.message);
  } finally {
    isProcessing = false;
  }
}

function getEngagementSchedulerStatus() {
  const settings = getSettingsRaw();
  return {
    running: !!intervalId && !!settings.engagementBot,
    lastRunDate,
    todayVisitedCount,
    isRestDay,
    isProcessing,
  };
}

module.exports = {
  startEngagementScheduler,
  stopEngagementScheduler,
  restartEngagementScheduler,
  getEngagementSchedulerStatus,
};

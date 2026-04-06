/**
 * 이웃참여 스케줄러 — 설정 시간에 자동으로 이웃 블로그 공감 + AI 댓글
 */

const { getSettingsRaw } = require('../models/Settings');
const { listAccounts, getAccountRaw } = require('../models/Account');
const Engagement = require('../models/Engagement');
const { requestEngage, requestCommentPreview } = require('./pythonBridge');

let intervalId = null;
let lastRunDate = '';
let todayVisitedCount = 0;
let isProcessing = false;
let isRestDay = false;

function startEngagementScheduler() {
  stopEngagementScheduler();
  console.log('[EngScheduler] 이웃참여 스케줄러 시작');
  intervalId = setInterval(checkAndRunEngagement, 60 * 1000);
  // 즉시 1회 체크
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

    // 비활성화면 스킵
    if (!settings.engagementBot) return;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // 날짜 변경 → 리셋
    if (lastRunDate !== today) {
      lastRunDate = today;
      todayVisitedCount = 0;
      isRestDay = false;
    }

    // 이미 오늘 실행 완료
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

    // 참여 계정 가져오기
    const allAccounts = listAccounts();
    const engageAccounts = allAccounts.filter(a => a.isActive && a.neighborEngage);

    if (engageAccounts.length === 0) return;

    // maxVisits 체크
    const maxVisits = settings.maxVisits || 20;
    if (todayVisitedCount >= maxVisits * engageAccounts.length) return;

    isProcessing = true;
    console.log(`[EngScheduler] 이웃참여 실행 — ${engageAccounts.length}개 계정, ${now.toLocaleTimeString()}`);

    // 이웃 피드 가져오기
    const feed = Engagement.listFeed();
    if (feed.length === 0) {
      console.log('[EngScheduler] 이웃 피드가 비어있습니다.');
      isProcessing = false;
      return;
    }

    for (const acc of engageAccounts) {
      const accountRaw = getAccountRaw(acc.id);
      if (!accountRaw) continue;

      let visitCount = 0;

      for (const post of feed) {
        if (visitCount >= maxVisits) break;

        try {
          // 공감
          if (settings.heartLike && !post.liked) {
            Engagement.likePost(post.id);

            if (post.url) {
              await requestEngage({
                account: {
                  id: accountRaw.id,
                  naver_id: accountRaw.naverId,
                  naver_password: accountRaw.naverPassword,
                  account_name: accountRaw.accountName,
                },
                blog_url: post.url,
                actions: { like: true, comment: null },
              }).catch(err => console.error(`[EngScheduler] 공감 실패:`, err.message));
            }
          }

          // AI 댓글
          if (settings.aiComment && !post.commented) {
            // AI 댓글 생성
            const commentResult = await requestCommentPreview({
              post_title: post.title,
              post_summary: '',
            });

            const commentText = commentResult.comment || Engagement.generateComment(post.title);
            Engagement.commentPost(post.id, commentText);

            if (post.url) {
              await requestEngage({
                account: {
                  id: accountRaw.id,
                  naver_id: accountRaw.naverId,
                  naver_password: accountRaw.naverPassword,
                  account_name: accountRaw.accountName,
                },
                blog_url: post.url,
                actions: { like: false, comment: commentText },
              }).catch(err => console.error(`[EngScheduler] 댓글 실패:`, err.message));
            }
          }

          visitCount++;
          todayVisitedCount++;

          // 방문 간격 (visitInterval 기반, randomDelay 적용)
          const baseInterval = (settings.visitInterval || 10) * 1000;
          const delay = settings.randomDelay !== false
            ? baseInterval * (0.5 + Math.random())
            : baseInterval;
          await new Promise(r => setTimeout(r, delay));

        } catch (err) {
          console.error(`[EngScheduler] 참여 오류 (${post.title}):`, err.message);
        }
      }

      console.log(`[EngScheduler] ${accountRaw.accountName}: ${visitCount}건 참여 완료`);

      // 계정 간 간격 (30~60초)
      if (engageAccounts.indexOf(acc) < engageAccounts.length - 1) {
        await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000));
      }
    }

    console.log(`[EngScheduler] 오늘 총 ${todayVisitedCount}건 참여 완료`);

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

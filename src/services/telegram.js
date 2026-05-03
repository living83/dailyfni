/**
 * 텔레그램 알림 서비스
 * 포스팅 완료, 이웃참여, 에러 등을 텔레그램으로 전송
 */

const axios = require('axios');

function getConfig() {
  require('dotenv').config();
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  };
}

async function send(message) {
  const { token, chatId } = getConfig();
  if (!token || !chatId) return false;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }, { timeout: 10000 });
    return true;
  } catch (err) {
    console.error('[Telegram] 전송 실패:', err.message);
    return false;
  }
}

// ── 포스팅 알림 ──

async function notifyPublishSuccess(accountName, keyword, url) {
  await send(
    `✅ <b>포스팅 완료</b>\n` +
    `계정: ${accountName}\n` +
    `키워드: ${keyword}\n` +
    `URL: ${url || '-'}`
  );
}

async function notifyPublishFail(accountName, keyword, error) {
  await send(
    `❌ <b>포스팅 실패</b>\n` +
    `계정: ${accountName}\n` +
    `키워드: ${keyword}\n` +
    `오류: ${error || '알 수 없는 오류'}`
  );
}

// ── 콘텐츠 생성 알림 ──

async function notifyContentGenerated(keyword, title) {
  await send(
    `📝 <b>콘텐츠 생성 완료</b>\n` +
    `키워드: ${keyword}\n` +
    `제목: ${title}`
  );
}

async function notifyContentFail(keyword, error) {
  await send(
    `⚠️ <b>콘텐츠 생성 실패</b>\n` +
    `키워드: ${keyword}\n` +
    `오류: ${error}`
  );
}

// ── 이웃참여 알림 ──

async function notifyEngagementDone(accountName, likeCount, commentCount) {
  await send(
    `💬 <b>이웃참여 완료</b>\n` +
    `계정: ${accountName}\n` +
    `공감: ${likeCount}건 / 댓글: ${commentCount}건`
  );
}

// ── 스케줄러 알림 ──

async function notifyDailySummary(posted, failed, total) {
  await send(
    `📊 <b>일일 포스팅 요약</b>\n` +
    `성공: ${posted}건 / 실패: ${failed}건 / 전체: ${total}건`
  );
}

async function notifySchedulerError(message) {
  await send(`🚨 <b>시스템 오류</b>\n${message}`);
}

async function notifyTierUpgrade(accountName, fromTier, toTier) {
  await send(
    `⬆️ <b>티어 업그레이드</b>\n` +
    `계정: ${accountName}\n` +
    `Tier ${fromTier} → Tier ${toTier}`
  );
}

module.exports = {
  send,
  notifyPublishSuccess,
  notifyPublishFail,
  notifyContentGenerated,
  notifyContentFail,
  notifyEngagementDone,
  notifyDailySummary,
  notifySchedulerError,
  notifyTierUpgrade,
};

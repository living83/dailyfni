// 텔레그램 알림 모듈
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function sendTelegram(message) {
  return new Promise((resolve) => {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.log('[텔레그램] BOT_TOKEN/CHAT_ID 미설정 - 알림 스킵');
      return resolve(false);
    }

    const data = JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error('[텔레그램] 전송 실패:', res.statusCode, body);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[텔레그램] 요청 에러:', err.message);
      resolve(false);
    });
    req.on('timeout', () => {
      req.destroy();
      console.error('[텔레그램] 타임아웃');
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

// 신규 고객 유입 알림
function notifyNewCustomer({ name, phone, content, source }) {
  const msg = `🔔 <b>신규 고객이 유입됐습니다</b>\n\n` +
    `👤 이름: ${name}\n` +
    `📞 연락처: ${phone}\n` +
    `📥 출처: ${source || '홈페이지'}\n` +
    `💬 내용: ${content || '없음'}\n` +
    `⏰ 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
  return sendTelegram(msg);
}

module.exports = { sendTelegram, notifyNewCustomer };

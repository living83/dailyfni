const db = require('better-sqlite3')('data/dailyfni.db');

console.log('=== 포스팅 설정 ===');
const ps = db.prepare("SELECT value FROM settings WHERE key = 'posting'").get();
if (ps) {
  const s = JSON.parse(ps.value);
  console.log(JSON.stringify(s, null, 2));
} else {
  console.log('(없음)');
}

console.log('\n=== 서로이웃 설정 ===');
const bs = db.prepare("SELECT value FROM settings WHERE key = 'buddy_accept'").get();
if (bs) {
  const s = JSON.parse(bs.value);
  console.log(JSON.stringify(s, null, 2));
} else {
  console.log('(없음)');
}

console.log('\n=== 스케줄러 로그 (최근 10건) ===');
try {
  const { getLogs } = require('./src/services/scheduler');
  const logs = getLogs();
  logs.slice(0, 10).forEach(l => console.log(`[${l.time}] ${l.level}: ${l.message}`));
  if (logs.length === 0) console.log('(로그 없음 — 서버가 이 프로세스에서 시작되지 않음)');
} catch (e) {
  console.log('(스케줄러 로그 접근 불가:', e.message, ')');
}

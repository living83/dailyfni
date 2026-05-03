/**
 * 티어 복구 스크립트 — 누적 기준으로 올바른 티어로 재계산
 * 사용: node fix_tiers.js
 */
const db = require('./src/db/sqlite');

const TIER_THRESHOLDS = { 2: 14, 3: 28, 4: 42, 5: 56 };

function daysBetween(dateStr) {
  const created = new Date(dateStr);
  const now = new Date();
  const c = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((t - c) / (1000 * 60 * 60 * 24));
}

function correctTier(daysSinceCreation) {
  let tier = 1;
  if (daysSinceCreation >= 14) tier = 2;
  if (daysSinceCreation >= 28) tier = 3;
  if (daysSinceCreation >= 42) tier = 4;
  if (daysSinceCreation >= 56) tier = 5;
  return tier;
}

const accounts = db.prepare('SELECT id, accountName, tier, createdAt FROM accounts WHERE isActive = 1').all();

console.log('=== 티어 복구 ===');
console.log('생성일 기준 올바른 티어로 재계산합니다 (2주마다 1단계).\n');

let changed = 0;
for (const acc of accounts) {
  const days = daysBetween(acc.createdAt);
  const target = correctTier(days);
  const mark = acc.tier === target ? '✓' : `→ ${target}`;
  console.log(`${mark}  ${acc.accountName}: 생성 후 ${days}일, 현재 Tier ${acc.tier} ${mark}`);

  if (acc.tier !== target) {
    db.prepare("UPDATE accounts SET tier = ?, updatedAt = datetime('now','localtime') WHERE id = ?")
      .run(target, acc.id);
    changed++;
  }
}

console.log(`\n복구 완료: ${changed}개 계정 변경`);

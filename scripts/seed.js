/**
 * 초기 데이터 시드 — SQLite에 샘플 계정/프록시/콘텐츠 생성
 * 사용법: node scripts/seed.js
 */
const path = require('path');

// DB 경로 설정
process.chdir(path.join(__dirname, '..'));

const db = require('../src/db/sqlite');
const { createAccount } = require('../src/models/Account');
const { createProxy, assignProxy } = require('../src/models/Proxy');
const { createContent } = require('../src/models/Content');
const { createPosting } = require('../src/models/Posting');
const { updateSettings } = require('../src/models/Settings');

console.log('\n=== DailyFNI 초기 데이터 시드 ===\n');

// 기존 데이터 초기화
console.log('[1/6] 기존 데이터 초기화...');
db.exec(`
  DELETE FROM accounts;
  DELETE FROM proxies;
  DELETE FROM contents;
  DELETE FROM postings;
  DELETE FROM posting_errors;
  DELETE FROM settings;
  DELETE FROM engagement_activities;
`);

// 프록시 등록
console.log('[2/6] 프록시 서버 등록...');
const proxies = [
  createProxy({ ip: '103.15.22.41', port: 8080, username: 'user1', password: 'pass1' }),
  createProxy({ ip: '198.44.67.12', port: 3128, username: 'proxy_user', password: 'proxy_pass' }),
  createProxy({ ip: '45.77.123.88', port: 1080, username: 'admin', password: 'admin123' }),
  createProxy({ ip: '72.11.198.33', port: 8888, username: '', password: '' }),
];
console.log(`  ${proxies.length}개 프록시 등록 완료`);

// 계정 등록
console.log('[3/6] Naver 계정 등록...');
const accounts = [
  createAccount({ accountName: '블로그마스터', naverId: 'blog_master99', naverPassword: '', tier: 5, proxyId: proxies[0].id, proxyServer: '103.15.22.41:8080' }),
  createAccount({ accountName: '대출전문블로그', naverId: 'loan_expert01', naverPassword: '', tier: 4, proxyId: proxies[1].id, proxyServer: '198.44.67.12:3128' }),
  createAccount({ accountName: '금융정보센터', naverId: 'fin_info_center', naverPassword: '', tier: 3, proxyId: proxies[2].id, proxyServer: '45.77.123.88:1080' }),
  createAccount({ accountName: '생활꿀팁모음', naverId: 'life_tips_kr', naverPassword: '', tier: 2, proxyId: proxies[3].id, proxyServer: '72.11.198.33:8888' }),
  createAccount({ accountName: '마케팅신입01', naverId: 'mkt_newbie01', naverPassword: '', tier: 1 }),
  createAccount({ accountName: '재테크달인', naverId: 'invest_pro77', naverPassword: '', tier: 2, isActive: false }),
];
console.log(`  ${accounts.length}개 계정 등록 완료`);

// 프록시 할당
for (let i = 0; i < 4; i++) {
  assignProxy(proxies[i].id, accounts[i].id, accounts[i].accountName);
}

// 콘텐츠 등록
console.log('[4/6] 콘텐츠 대기열 등록...');
const contents = [
  createContent({ keyword: '청년도약계좌', title: '청년도약계좌, 2026년 달라진 점 총정리!', tone: '친근톤', contentType: '일반 정보성', grade: 'A', status: '검수완료' }),
  createContent({ keyword: '신용대출 비교', title: '2026 신용대출 금리 비교, 어디가 유리할까?', tone: '전문톤', contentType: '광고(대출)', productInfo: '금리 4.5%~8.9%, 한도 1억', grade: 'A', status: '검수완료' }),
  createContent({ keyword: '전세자금대출', title: '전세자금대출 조건 완벽 가이드', tone: '전문톤', contentType: '광고(대출)', productInfo: '전세자금 최대 3억, 금리 3.8%', grade: 'B', status: '검수완료' }),
  createContent({ keyword: '개인회생 방법', title: '개인회생 신청 절차와 조건 총정리', tone: '전문톤', contentType: '광고(대출)', grade: null, status: '생성중' }),
  createContent({ keyword: '카드 혜택 비교', title: '2026 신용카드 혜택 총정리 리뷰', tone: '리뷰톤', contentType: '일반 정보성', grade: 'C', status: '저품질' }),
  createContent({ keyword: '적금 추천', tone: '친근톤', contentType: '일반 정보성', grade: null, status: '대기' }),
  createContent({ keyword: '주택담보대출', tone: '전문톤', contentType: '광고(대출)', productInfo: '주담대 금리 비교', grade: null, status: '대기' }),
  createContent({ keyword: 'DSR 계산법', tone: '친근톤', contentType: '일반 정보성', grade: null, status: '대기' }),
];
console.log(`  ${contents.length}개 콘텐츠 등록 완료`);

// 포스팅 큐
console.log('[5/6] 포스팅 큐 등록...');
const postings = [
  createPosting({ keyword: '청년도약계좌', accountName: '블로그마스터', accountId: accounts[0].id, tone: '친근톤', contentId: contents[0].id, scheduledTime: '10:30' }),
  createPosting({ keyword: '신용대출 비교', accountName: '대출전문블로그', accountId: accounts[1].id, tone: '전문톤', contentId: contents[1].id, scheduledTime: '11:00' }),
  createPosting({ keyword: '전세자금대출', accountName: '금융정보센터', accountId: accounts[2].id, tone: '전문톤', contentId: contents[2].id, scheduledTime: '11:30' }),
  createPosting({ keyword: '카드 혜택 비교', accountName: '생활꿀팁모음', accountId: accounts[3].id, tone: '리뷰톤', scheduledTime: '12:00' }),
  createPosting({ keyword: '적금 추천', accountName: '마케팅신입01', accountId: accounts[4].id, tone: '친근톤', scheduledTime: '즉시' }),
];

// 일부 상태 업데이트 (발행완료/실패 등)
const { updatePosting, addError } = require('../src/models/Posting');
updatePosting(postings[0].id, { status: '발행완료', url: 'https://blog.naver.com/blog_master99/223456789' });
updatePosting(postings[1].id, { status: '발행완료', url: 'https://blog.naver.com/loan_expert01/223456790' });
updatePosting(postings[2].id, { status: '발행중' });
addError({ accountName: '생활꿀팁모음', message: '프록시 연결 실패 — timeout', severity: '오류' });
addError({ accountName: '마케팅신입01', message: '저품질 판정 — 재작성 필요', severity: '경고' });

console.log(`  ${postings.length}개 포스팅 등록 완료`);

// 설정
console.log('[6/6] 시스템 설정 초기화...');
updateSettings({
  engagementBot: true,
  heartLike: true,
  aiComment: true,
  maxVisits: 20,
  logLevel: '정보',
  logRetention: '30일',
  proxyAutoCheck: true,
  proxyCheckInterval: '6시간',
});

// 참여 활동 기록
const Engagement = require('../src/models/Engagement');
Engagement.addActivity({ accountName: '블로그마스터', action: '♥ 공감', target: '제주도 3박4일 여행...' });
Engagement.addActivity({ accountName: '블로그마스터', action: '💬 댓글', target: '강남역 숨은 맛집...' });
Engagement.addActivity({ accountName: '대출전문블로그', action: '♥ 공감', target: 'AI 트렌드 총정리' });
Engagement.addActivity({ accountName: '금융정보센터', action: '♥ 공감', target: '월 100만원 저축...' });
Engagement.addActivity({ accountName: '금융정보센터', action: '💬 댓글', target: '원룸 인테리어 팁...' });

console.log('\n=== 시드 완료! ===');
console.log(`  계정: ${accounts.length}개`);
console.log(`  프록시: ${proxies.length}개`);
console.log(`  콘텐츠: ${contents.length}개`);
console.log(`  포스팅: ${postings.length}개`);
console.log(`  참여 기록: 5건`);
console.log(`\n  DB 파일: data/dailyfni.db\n`);

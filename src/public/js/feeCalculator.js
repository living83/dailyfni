// ========================================
// 정산 정책 - 금융사별 수수료율 데이터 (출처: 2026.06 수당표)
// "통" = 단일 수수료율 (rateUnder=null) / flatFee = 정액(만원)
// rateUnder: 500만 이하, rateOver: 500만 초과
// ========================================

const feeRateData = {
  // === 저축은행 ===
  '애큐온저축은행-선인증': { category: '저축은행', rateUnder: 2.7, rateOver: 1.95, auth: 'O' },
  'SBI저축은행': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'X' },
  '친애저축은행-선인증': { category: '저축은행', rateUnder: 2.7, rateOver: 1.95, auth: 'O' },
  '친애저축은행-미인증': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '한국투자저축은행': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  'JT저축은행': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '키움저축은행(통합)-선인증': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '키움저축은행(통합)': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '키움저축은행(통합+오토플러스)-선인증': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '키움저축은행(통합+오토플러스)': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '키움YES저축은행(링크발송)': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '웰컴저축은행': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '다올저축은행(직장인)-선인증': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '다올저축은행(프리랜서/사업자/주부)-선인증': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '다올저축은행-미인증': { category: '저축은행', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  'OK저축은행': { category: '저축은행', rateUnder: 2.8, rateOver: 2, auth: 'X' },
  '고려저축은행': { category: '저축은행', rateUnder: 2.4, rateOver: 1.65, auth: 'O' },
  '예가람저축은행': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '동양저축은행': { category: '저축은행', rateUnder: 2, rateOver: 1.3, auth: 'X' },
  '대한저축은행(골프캐디론)': { category: '저축은행', rateUnder: 2.4, rateOver: 1.65, auth: 'O' },
  '페퍼저축은행': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  'OK저축은행(오토론)': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'X' },
  'MS저축은행(사잇돌)': { category: '저축은행', rateUnder: 2.6, rateOver: 1.85, auth: 'X' },
  '융창저축은행(신용)': { category: '저축은행', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  // === 캐피탈 ===
  '하나캐피탈': { category: '캐피탈', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '하나캐피탈(오토론)': { category: '캐피탈', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  'JB우리캐피탈': { category: '캐피탈', rateUnder: 2.9, rateOver: 2.1, auth: 'X' },
  'JB우리캐피탈(사업자-유담보)': { category: '캐피탈', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  'BNK캐피탈': { category: '캐피탈', rateUnder: 2.6, rateOver: 1.85, auth: 'X' },
  '한국캐피탈': { category: '캐피탈', rateUnder: 2.9, rateOver: 2.1, auth: 'X' },
  '한국캐피탈(유담보)': { category: '캐피탈', rateUnder: null, rateOver: 1.5, auth: 'X' },
  '우리금융캐피탈': { category: '캐피탈', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  'KB캐피탈': { category: '캐피탈', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  '롯데캐피탈': { category: '캐피탈', rateUnder: 2.7, rateOver: 1.95, auth: 'X' },
  'IM캐피탈': { category: '캐피탈', rateUnder: 2.6, rateOver: 1.85, auth: 'X' },
  'IM캐피탈(오토론)': { category: '캐피탈', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  'IM캐피탈(유담보)': { category: '캐피탈', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '농협캐피탈': { category: '캐피탈', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '농협캐피탈(산업재오토론)': { category: '캐피탈', rateUnder: null, rateOver: 1.2, auth: 'X' },
  '한국투자캐피탈': { category: '캐피탈', rateUnder: 2.3, rateOver: 1.55, auth: 'X' },
  '애큐온캐피탈(산업재오토론)': { category: '캐피탈', rateUnder: null, rateOver: 0.9, auth: 'X' },
  '현대커머셜(산업재오토론)': { category: '캐피탈', rateUnder: null, rateOver: 1, auth: 'X' },
  '메리츠캐피탈': { category: '캐피탈', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  // === 햇살론 ===
  'SBI저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.2, auth: 'X' },
  'SBI햇살론(사업자/프리랜서)': { category: '햇살론', rateUnder: null, rateOver: 1.2, auth: 'X' },
  '우리금융저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 0.6, auth: 'X' },
  'IBK저축은행(온라인햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1, auth: 'X' },
  '키움저축(햇살론)-인증': { category: '햇살론', rateUnder: null, rateOver: 1.2, auth: 'O' },
  '키움저축(햇살론)-미인증': { category: '햇살론', rateUnder: null, rateOver: 1.1, auth: 'X' },
  '키움 예스저축(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.2, auth: 'X' },
  '웰컴저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.2, auth: 'O' },
  '예가람저축(햇살론)-일반보증': { category: '햇살론', rateUnder: null, rateOver: 1.3, auth: 'O' },
  '예가람저축(햇살론)-특례보증': { category: '햇살론', rateUnder: null, rateOver: 1, auth: 'O' },
  '고려저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.8, auth: 'O' },
  '고려저축은행(햇살론)-특례': { category: '햇살론', rateUnder: null, rateOver: 1.7, auth: 'O' },
  '친애저축은행(직장인햇살론)-선인증': { category: '햇살론', rateUnder: null, rateOver: 1.1, auth: 'O' },
  '친애저축은행(직장인햇살론)-미인증': { category: '햇살론', rateUnder: null, rateOver: 1, auth: 'X' },
  'OK저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 0.8, auth: 'X' },
  'JT저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.3, auth: 'X' },
  '한국투자저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.1, auth: 'O' },
  'BNK저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.7, auth: 'X' },
  'BNK저축은행(햇살론)-특례': { category: '햇살론', rateUnder: null, rateOver: 1.5, auth: 'X' },
  '롯데캐피탈(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.2, auth: 'X' },
  '융창저축은행(햇살론)': { category: '햇살론', rateUnder: null, rateOver: 1.4, auth: 'O' },
  // === 오토론(통합) ===
  '오토통합론-상상인': { category: '오토론(통합)', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '오토통합론-상상인플러스': { category: '오토론(통합)', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '오토통합론-페퍼': { category: '오토론(통합)', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '오토통합론-스마트': { category: '오토론(통합)', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  '오토통합론-동원': { category: '오토론(통합)', rateUnder: 2.3, rateOver: 1.55, auth: 'X' },
  '오토통합론-키움': { category: '오토론(통합)', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  '오토통합론-웰컴': { category: '오토론(통합)', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  '오토통합론-jb우리캐': { category: '오토론(통합)', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '오토통합론-한국캐': { category: '오토론(통합)', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '오토통합론-어드벤스(미래)': { category: '오토론(통합)', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '오토통합론-미래크레디트': { category: '오토론(통합)', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '오토통합론-에이원': { category: '오토론(통합)', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  '오토통합론-밀리언': { category: '오토론(통합)', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  '오토통합론-티포스': { category: '오토론(통합)', rateUnder: 2.4, rateOver: 1.65, auth: 'X' },
  // === 오토론 ===
  '삼호저축은행(오토론)': { category: '오토론', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '상상인저축은행(오토론)': { category: '오토론', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '상상인플러스저축은행(오토론)': { category: '오토론', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '스마트저축은행(오토론)': { category: '오토론', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '페퍼저축은행(오토론)': { category: '오토론', rateUnder: 2.6, rateOver: 1.85, auth: 'X' },
  '동원저축은행(오토론)': { category: '오토론', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  '키움YES저축은행(오토론)': { category: '오토론', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '융창저축은행(오토론)': { category: '오토론', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  // === 청년/회파복 ===
  '상상인플러스저축은행(청년)': { category: '청년/회파복', rateUnder: 1.9, rateOver: 1.15, auth: 'O' },
  '삼호저축은행(새내기)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '삼호저축은행(청년)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '한성저축은행(청년)': { category: '청년/회파복', rateUnder: 1.9, rateOver: 1.15, auth: 'O' },
  '대한저축은행(회생면책)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '대한저축은행(회생)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '대한저축은행(주부)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'X' },
  '키움저축은행(파산)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '키움저축은행(회생)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '세람저축은행(회생면책)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '세람저축은행(회생)': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '통합회파복(저축)': { category: '청년/회파복', rateUnder: 1.4, rateOver: 0.8, auth: 'X' },
  '통합회파복(대부)': { category: '청년/회파복', rateUnder: 1.6, rateOver: 1, auth: 'X' },
  '웰컴저축은행(회생/파산)': { category: '청년/회파복', rateUnder: 2.6, rateOver: 1.85, auth: 'O' },
  'OK저축은행(회생)': { category: '청년/회파복', rateUnder: 2.7, rateOver: 1.95, auth: 'O' },
  '대한저축(청년)-4대가입': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  '대한저축(청년)-4대미가입': { category: '청년/회파복', rateUnder: 2.5, rateOver: 1.75, auth: 'O' },
  // === 기타 ===
  '통합개인회생/파산': { category: '기타', flatFee: 110, auth: 'X', note: '정액' },
  '채무조정(회복) 및 개인회생': { category: '기타', flatFee: 140, auth: 'X', note: '정액' },
  '스피드론(사업자PG)': { category: '기타', rateUnder: 2.9, rateOver: 2.15, auth: 'X' },
  'PG단말기사업자대출-카드가맹': { category: '기타', rateUnder: null, rateOver: 5, auth: 'X' },
  '대부전월세(던지기)': { category: '기타', rateUnder: 1.3, rateOver: 0.8, auth: 'X' },
  // === 대부-신용 ===
  '리드코프(신용)': { category: '대부-신용', rateUnder: null, rateOver: 1.4, auth: '*' },
  '안전대부(신용+오토)': { category: '대부-신용', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '앤알캐피탈': { category: '대부-신용', rateUnder: null, rateOver: 1.4, auth: '*' },
  '엠케이(신용)': { category: '대부-신용', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '저스트인타임': { category: '대부-신용', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  // === 대부-회파복 ===
  'MSI대부(회생/파산)': { category: '대부-회파복', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '골든_레이디(회생/개시)': { category: '대부-회파복', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '골든캐피탈(회생/개시)': { category: '대부-회파복', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '뉴스타트론(인가-회생/파산)': { category: '대부-회파복', rateUnder: 2.3, rateOver: 1.55, auth: '*' },
  '미래(회생)': { category: '대부-회파복', rateUnder: 2.3, rateOver: 1.55, auth: '*' },
  '밀리언(파산/첨담보)': { category: '대부-회파복', rateUnder: 2.3, rateOver: 1.55, auth: '*' },
  '밀리언(회생/첨담보)': { category: '대부-회파복', rateUnder: 2.3, rateOver: 1.55, auth: '*' },
  '아이앤유(회생)': { category: '대부-회파복', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '아이앤유(파산)': { category: '대부-회파복', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '안전대부(회생)': { category: '대부-회파복', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '엠케이(회생,파산)': { category: '대부-회파복', rateUnder: 2.4, rateOver: 1.65, auth: '*' },
  '유노스(회생/파산)': { category: '대부-회파복', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '저스트(회생/파산/회생면책)': { category: '대부-회파복', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '캐시벅스(회생/파산)': { category: '대부-회파복', rateUnder: 2.3, rateOver: 1.55, auth: '*' },
  // === 대부-오토론 ===
  'A1차량(마이카론)': { category: '대부-오토론', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  'A1(회파복-드림카론)': { category: '대부-오토론', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  'KM오토론': { category: '대부-오토론', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '골든캐피탈_오토론(회복/회생면책)': { category: '대부-오토론', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '드림앤캐쉬(오토론)': { category: '대부-오토론', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '리드코프(오토론)': { category: '대부-오토론', rateUnder: null, rateOver: 1.5, auth: '*' },
  '미래7(단기연체자)': { category: '대부-오토론', rateUnder: null, rateOver: 1.3, auth: '*' },
  '바로(오토론)': { category: '대부-오토론', rateUnder: 2.4, rateOver: 1.65, auth: '*' },
  '어드벤스네바퀴': { category: '대부-오토론', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '유노스_회파복(오토론)': { category: '대부-오토론', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  // === 대부-연계 ===
  '드림앤캐쉬(오토론)_유노스연계': { category: '대부-연계', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '미래네바퀴[연계]': { category: '대부-연계', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '안전대부(회생)-엘하연계': { category: '대부-연계', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '유노스(회생/파산)연계_드림앤캐쉬연계': { category: '대부-연계', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '유노스_회파복(오토론)_드림앤캐쉬연계': { category: '대부-연계', rateUnder: 2.6, rateOver: 1.85, auth: '*' },
  '저스트(회생/파산/회생면책)_써니_연계': { category: '대부-연계', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  '저스트(회생/파산/회생면책)_바로_연계': { category: '대부-연계', rateUnder: 2.5, rateOver: 1.75, auth: '*' },
  // === 중단 (엑셀 미기재, 보존) ===
  '애큐온저축은행-미인증': { category: '저축은행', rateUnder: null, rateOver: null, auth: 'X', note: '중단' },
  '키움YES저축은행(통화인증)': { category: '저축은행', rateUnder: null, rateOver: null, auth: 'X', note: '중단' },
};
// ========================================
// 수수료 자동 계산 함수
// ========================================
// 기준금액: 500만원
const FEE_THRESHOLD = 500;

function calculateFee(productName, loanAmount) {
  const rate = feeRateData[productName];
  if (!rate) return { fee: 0, detail: '수수료율 미등록', rateUnder: 0, rateOver: 0 };
  if (rate.note === '중단') return { fee: 0, detail: '상품 중단', rateUnder: 0, rateOver: 0 };
  if (rate.flatFee != null) return { fee: rate.flatFee, detail: `정액 ${rate.flatFee}만원`, rateUnder: 0, rateOver: 0 };

  // "통" (단일 수수료율)
  if (rate.rateUnder === null) {
    const fee = loanAmount * (rate.rateOver / 100);
    return {
      fee: Math.round(fee * 10) / 10,
      detail: `${loanAmount}만 × ${rate.rateOver}% = ${(Math.round(fee * 10) / 10)}만`,
      rateUnder: rate.rateOver,
      rateOver: rate.rateOver
    };
  }

  // 단계별 수수료
  if (loanAmount <= FEE_THRESHOLD) {
    const fee = loanAmount * (rate.rateUnder / 100);
    return {
      fee: Math.round(fee * 10) / 10,
      detail: `${loanAmount}만 × ${rate.rateUnder}% = ${(Math.round(fee * 10) / 10)}만`,
      rateUnder: rate.rateUnder,
      rateOver: rate.rateOver
    };
  } else {
    const feeUnder = FEE_THRESHOLD * (rate.rateUnder / 100);
    const feeOver = (loanAmount - FEE_THRESHOLD) * (rate.rateOver / 100);
    const total = Math.round((feeUnder + feeOver) * 10) / 10;
    return {
      fee: total,
      detail: `500만×${rate.rateUnder}%=${(Math.round(feeUnder*10)/10)}만 + ${loanAmount-FEE_THRESHOLD}만×${rate.rateOver}%=${(Math.round(feeOver*10)/10)}만`,
      rateUnder: rate.rateUnder,
      rateOver: rate.rateOver
    };
  }
}

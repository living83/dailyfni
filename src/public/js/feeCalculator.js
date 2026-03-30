// ========================================
// 정산 정책 - 금융사별 수수료율 데이터
// "통" = 금액 무관 단일 수수료율 (rateUnder = null)
// rateUnder: 500만 이하 수수료율, rateOver: 500만 초과 수수료율
// ========================================

const feeRateData = {
  // === Sheet 1: 저축은행 ===
  '애큐온저축은행-선인증': { category: '저축은행', rateUnder: 2.70, rateOver: 1.95, auth: 'O' },
  '애큐온저축은행-미인증': { category: '저축은행', rateUnder: null, rateOver: null, auth: 'X', note: '중단' },
  'SBI저축은행': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'X' },
  '친애저축은행-선인증': { category: '저축은행', rateUnder: 2.70, rateOver: 1.95, auth: 'O' },
  '친애저축은행-미인증': { category: '저축은행', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '한국투자저축은행': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'X' },
  'JT저축은행': { category: '저축은행', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '키움저축은행(통합)-선인증': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'O' },
  '키움저축은행(통합)': { category: '저축은행', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '키움저축은행(통합+오토플러스)-선인증': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'O' },
  '키움저축은행(통합+오토플러스)': { category: '저축은행', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '키움YES저축은행(링크발송)': { category: '저축은행', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '키움YES저축은행(통화인증)': { category: '저축은행', rateUnder: null, rateOver: null, auth: 'X', note: '중단' },
  '웰컴저축은행': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'O' },
  '다올저축은행(직장인)-선인증': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'O' },
  '다올저축은행(프리랜서/사업자/주부)-선인증': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'O' },
  '다올저축은행-미인증': { category: '저축은행', rateUnder: 2.40, rateOver: 1.65, auth: 'X' },
  'OK저축은행': { category: '저축은행', rateUnder: 2.80, rateOver: 2.00, auth: 'X' },
  '고려저축은행': { category: '저축은행', rateUnder: 2.40, rateOver: 1.65, auth: 'O' },
  'IBK저축은행': { category: '저축은행', rateUnder: null, rateOver: 1.30, auth: 'X' },
  '예가람저축은행': { category: '저축은행', rateUnder: 2.50, rateOver: 1.75, auth: 'O' },
  '동양저축은행': { category: '저축은행', rateUnder: 2.00, rateOver: 1.30, auth: 'X' },
  '대한저축은행(골프캐디론)': { category: '저축은행', rateUnder: 2.40, rateOver: 1.65, auth: 'X' },
  '페퍼저축은행': { category: '저축은행', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  'OK저축은행(오토론)': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'X' },
  'MS저축(사잇돌)': { category: '저축은행', rateUnder: 2.60, rateOver: 1.85, auth: 'X' },

  // === Sheet 1: 캐피탈 ===
  '하나캐피탈': { category: '캐피탈', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '하나캐피탈(오토론)': { category: '캐피탈', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  'JB우리캐피탈': { category: '캐피탈', rateUnder: 2.90, rateOver: 2.10, auth: 'X' },
  'JB우리캐피탈(사업자-유담보)': { category: '캐피탈', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  'BNK캐피탈': { category: '캐피탈', rateUnder: 2.60, rateOver: 1.85, auth: 'X' },
  '한국캐피탈': { category: '캐피탈', rateUnder: 2.90, rateOver: 2.10, auth: 'X' },
  '한국캐피탈(유담보)': { category: '캐피탈', rateUnder: null, rateOver: 1.50, auth: 'X' },
  '우리금융캐피탈': { category: '캐피탈', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  'KB캐피탈': { category: '캐피탈', rateUnder: 2.40, rateOver: 1.65, auth: 'X' },
  '롯데캐피탈': { category: '캐피탈', rateUnder: 2.70, rateOver: 1.95, auth: 'X' },
  'IM캐피탈': { category: '캐피탈', rateUnder: 2.60, rateOver: 1.85, auth: 'X' },
  'IM캐피탈(오토론)': { category: '캐피탈', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  'IM캐피탈(유담보)': { category: '캐피탈', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '농협캐피탈': { category: '캐피탈', rateUnder: 2.50, rateOver: 1.75, auth: 'X' },
  '농협캐피탈(산업재오토론)': { category: '캐피탈', rateUnder: null, rateOver: 1.20, auth: 'X' },
  '한국투자캐피탈': { category: '캐피탈', rateUnder: 2.30, rateOver: 1.55, auth: 'X' },
  '애큐온캐피탈(산업재오토론)': { category: '캐피탈', rateUnder: null, rateOver: 0.90, auth: 'X' },
  '현대커머셜(산업재오토론)': { category: '캐피탈', rateUnder: null, rateOver: 1.00, auth: 'X' },

  // === Sheet 2: 대부 신용 ===
  '리드코프(신용)': { category: '대부 신용', rateUnder: null, rateOver: 1.40, auth: '*' },
  '안전대부(신용+오토)': { category: '대부 신용', rateUnder: 2.50, rateOver: 1.75, auth: '*' },
  '앤알캐피탈': { category: '대부 신용', rateUnder: null, rateOver: 1.40, auth: '*' },
  '엠케이(신용)': { category: '대부 신용', rateUnder: 2.50, rateOver: 1.75, auth: '*' },
  '저스트인타임': { category: '대부 신용', rateUnder: 2.50, rateOver: 1.75, auth: '*' },

  // === Sheet 2: 회파복 ===
  'MSI대부(회생/파산)': { category: '회파복', rateUnder: 2.50, rateOver: 1.75, auth: '*' },
  '골든_레이디(회생/개시)': { category: '회파복', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '골든캐피탈(회생/개시)': { category: '회파복', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '뉴스타트론(인가-회생/파산)': { category: '회파복', rateUnder: 2.30, rateOver: 1.55, auth: '*' },
  '미래(회생)': { category: '회파복', rateUnder: 2.30, rateOver: 1.55, auth: '*' },
  '밀리언(파산/첨담보)': { category: '회파복', rateUnder: 2.30, rateOver: 1.55, auth: '*' },
  '밀리언(회생/첨담보)': { category: '회파복', rateUnder: 2.30, rateOver: 1.55, auth: '*' },
  '아이앤유(회생)': { category: '회파복', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '아이앤유(파산)': { category: '회파복', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '안전대부(회생)': { category: '회파복', rateUnder: 2.50, rateOver: 1.75, auth: '*' },
  '엠케이(회생)': { category: '회파복', rateUnder: 2.40, rateOver: 1.65, auth: '*' },
  '유노스(회생/파산)': { category: '회파복', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '저스트(회생/파산/회생면책)': { category: '회파복', rateUnder: 2.50, rateOver: 1.75, auth: '*' },
  '캐시벅스(회생/파산)': { category: '회파복', rateUnder: 2.30, rateOver: 1.55, auth: '*' },

  // === Sheet 2: 오토론 (대부) ===
  'A1차량(마이카론)': { category: '대부 오토론', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  'A1(회파복-드림카론)': { category: '대부 오토론', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '밀리언/KM오토론': { category: '대부 오토론', rateUnder: 2.50, rateOver: 1.75, auth: '*' },
  '골든캐피탈_오토론(회복/회생면책)': { category: '대부 오토론', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '드림앤캐쉬(오토론)': { category: '대부 오토론', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
  '리드코프(오토론)': { category: '대부 오토론', rateUnder: null, rateOver: 1.50, auth: '*' },
  '미래7(단기연체자)': { category: '대부 오토론', rateUnder: null, rateOver: 1.30, auth: '*' },
  '바로(오토론)': { category: '대부 오토론', rateUnder: 2.40, rateOver: 1.65, auth: '*' },
  '어드벤스네바퀴': { category: '대부 오토론', rateUnder: 2.50, rateOver: 1.75, auth: '*' },
  '유노스_회파복(오토론)': { category: '대부 오토론', rateUnder: 2.60, rateOver: 1.85, auth: '*' },
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

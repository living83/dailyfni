// ========================================
// 상품 조건 매칭 엔진
// 고객 정보를 기반으로 대출 가능 상품 추천
// ========================================

// 상품별 구조화된 조건 데이터
// 가이드 본문에서 추출한 핵심 조건
const productConditions = {
  // === 추천상품 / 저축은행 ===
  2422: { // SBI저축은행
    name: 'SBI저축은행', category: '저축은행',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직'],
    ageMin: 19, ageMax: 70,
    loanMin: 100, loanMax: 10000,
    vehicle: false,
    recovery: ['무','회생','파산'],
    insurance4: null, // 제한 없음
    notes: '신용,대환,사잇돌,햇살론 조회가능'
  },
  1535: { // 웰컴저축은행
    name: '웰컴저축은행', category: '저축은행',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','주부','프리랜서','무직'],
    ageMin: 20, ageMax: 75,
    loanMin: 200, loanMax: 7000,
    vehicle: true, vehicleYear: 2007, vehicleKm: 200000,
    recovery: ['무'],
    insurance4: '1고지1납',
    notes: '신용,오토,사잇돌. 차량보유자 한하여 신용한도 발생'
  },
  2289: { // 페퍼저축은행
    name: '페퍼저축은행', category: '저축은행',
    jobTypes: ['직장인(4대가입)','프리랜서'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 5000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,대환'
  },
  2448: { // BNK저축은행(햇살론)
    name: 'BNK저축은행(햇살론)', category: '햇살론',
    jobTypes: ['직장인(4대가입)'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 3000,
    vehicle: false,
    recovery: ['무'],
    insurance4: '3개월이상+납부3회',
    notes: '온라인햇살론/인적심사'
  },
  2056: { // 우리금융저축은행(햇살론)
    name: '우리금융저축은행(햇살론)', category: '햇살론',
    jobTypes: ['직장인(4대가입)'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 3000,
    vehicle: false,
    recovery: ['무'],
    insurance4: '3고지3납부or3연금',
    notes: '인적심사. 보증료분납 진행시 자동이체은행방문必'
  },

  // === 오토론 ===
  2184: { // 오토통합론
    name: '오토통합론', category: '오토론',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 10000,
    vehicle: true, vehicleYear: 2010, vehicleKm: 200000,
    recovery: ['무','회생','파산','회복'],
    insurance4: null,
    notes: '웰컴|스마트|페퍼|상상인|상상인플러스|키움|동원|어드|미래|에이원'
  },
  2405: { // 하나캐피탈(오토론)
    name: '하나캐피탈(오토론)', category: '오토론',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','프리랜서','무직'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 10000,
    vehicle: true, vehicleYear: 2014, vehicleKm: 200000,
    recovery: ['무'],
    insurance4: null,
    notes: '오토 단독 조회. 본인|최초등록일 12년이내|20만km미만'
  },
  2457: { // JB우리캐피탈
    name: 'JB우리캐피탈', category: '캐피탈',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 15000,
    vehicle: true, vehicleYear: 2010, vehicleKm: null,
    recovery: ['무'],
    insurance4: null,
    notes: '아파트,오토. KB시세1.5억이상'
  },

  // === 캐피탈 ===
  404: { // 하나캐피탈
    name: '하나캐피탈', category: '캐피탈',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','프리랜서','무직'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 20000,
    vehicle: true, vehicleYear: 2014, vehicleKm: 200000,
    recovery: ['무'],
    insurance4: null,
    notes: '아파트(주거용오피스텔),오토. KB시세3억이상'
  },
  2438: { // 한국캐피탈
    name: '한국캐피탈', category: '캐피탈',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 10000,
    vehicle: true, vehicleYear: 2012, vehicleKm: 300000,
    recovery: ['무'],
    insurance4: null,
    notes: '신카,레이디,오토,아파트'
  },
  2149: { // KB캐피탈
    name: 'KB캐피탈', category: '캐피탈',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 20000,
    vehicle: true, vehicleYear: 2013, vehicleKm: 200000,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,오토,하우스론'
  },
  869: { // 우리금융캐피탈
    name: '우리금융캐피탈', category: '캐피탈',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 20000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,자산론,전월세론,신카주택결합'
  },
  2339: { // BNK캐피탈
    name: 'BNK캐피탈', category: '캐피탈',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','법인사업자','주부','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 10000,
    vehicle: true, vehicleYear: null, vehicleKm: null,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,오토. 차량시세300만이상'
  },
  2159: { // IM캐피탈
    name: 'IM캐피탈', category: '캐피탈',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 10000,
    vehicle: true, vehicleYear: 2018, vehicleKm: 200000,
    recovery: ['무'],
    insurance4: null,
    notes: '오토,리치론,아파트론,유담보'
  },

  // === 저축은행 (선순위&후순위) ===
  2262: { // IBK저축은행
    name: 'IBK저축은행', category: '저축은행',
    jobTypes: ['직장인(4대가입)'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 5000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '신용상품(빅론,패스트론)'
  },
  2222: { // JT저축은행-미인증
    name: 'JT저축은행-미인증', category: '저축은행',
    jobTypes: ['직장인(4대가입)'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 5000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,채무통합,햇살론'
  },
  2329: { // OK저축은행
    name: 'OK저축은행', category: '저축은행',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','프리랜서'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 10000,
    vehicle: true, vehicleYear: 2015, vehicleKm: 200000,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,대환,오토,아파트론,햇살론'
  },
  2439: { // 고려저축은행
    name: '고려저축은행', category: '저축은행',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','주부','프리랜서'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 5000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,대환,햇살'
  },
  1700: { // 한국투자저축은행(4대가입자)
    name: '한국투자저축은행(4대가입자)', category: '저축은행',
    jobTypes: ['직장인(4대가입)'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 5000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '신용,대환'
  },

  // === 회복/회생/파산 ===
  2403: { // OK저축은행(회생)
    name: 'OK저축은행(회생)', category: '회복/회생/파산',
    jobTypes: ['직장인(4대가입)'],
    ageMin: 20, ageMax: 65,
    loanMin: 100, loanMax: 5000,
    vehicle: true, vehicleYear: 2015, vehicleKm: 200000,
    recovery: ['회생'],
    insurance4: '4대가입',
    notes: '회생 4회차 이상 납입 4대가입자'
  },
  2197: { // 통합회생/파산
    name: '통합회생/파산', category: '회복/회생/파산',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 5000,
    vehicle: false,
    recovery: ['회생','파산'],
    insurance4: null,
    notes: '회생 인가후 1회납이상|파산 확정일로 5년이내'
  },
  1947: { // 웰컴저축은행(회생/파산)
    name: '웰컴저축은행(회생/파산)', category: '회복/회생/파산',
    jobTypes: ['직장인(4대가입)','개인사업자','프리랜서'],
    ageMin: 20, ageMax: 70,
    loanMin: 100, loanMax: 5000,
    vehicle: false,
    recovery: ['회생','파산'],
    insurance4: null,
    notes: '회생면책 1년이내 / 파산 면책 후 5년이내'
  },

  // === 부동산담보 ===
  2308: { // AT통합부동산담보
    name: 'AT통합부동산담보(대부/P2P)', category: '부동산담보',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 75,
    loanMin: 500, loanMax: 100000,
    vehicle: false,
    recovery: ['무','회생','파산','회복'],
    insurance4: null,
    notes: '대부|P2P|지자체. 아파트,빌라,오피스텔,단독주택,토지'
  },

  // === 대부 신용 ===
  2520: { // 리드코프(신용)
    name: '리드코프(신용)', category: '대부 신용',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','프리랜서'],
    ageMin: 20, ageMax: 65,
    loanMin: 50, loanMax: 3000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '신분증/원초본/소득+재직'
  },
  2476: { // 저스트인타임
    name: '저스트인타임', category: '대부 신용',
    jobTypes: ['직장인(4대가입)','개인사업자','주부'],
    ageMin: 20, ageMax: 65,
    loanMin: 50, loanMax: 2000,
    vehicle: false,
    recovery: ['무'],
    insurance4: null,
    notes: '서류미첨부. 선인증'
  },

  // === 대부 회복/회생/파산 ===
  2477: { // 저스트(회생/파산/회생면책)
    name: '저스트(회생/파산/회생면책)', category: '대부 회복/회생/파산',
    jobTypes: ['직장인(4대가입)'],
    ageMin: 20, ageMax: 65,
    loanMin: 50, loanMax: 2000,
    vehicle: false,
    recovery: ['회생','파산'],
    insurance4: null,
    notes: '무서류접수. 선인증'
  },
  2480: { // 유노스(회생/파산)
    name: '유노스(회생/파산)', category: '대부 회복/회생/파산',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','프리랜서'],
    ageMin: 20, ageMax: 65,
    loanMin: 50, loanMax: 3000,
    vehicle: false,
    recovery: ['회생','파산'],
    insurance4: null,
    notes: '신분증/원초본/재직+소득서류. 선인증'
  },

  // === 대부 오토론 ===
  2492: { // 드림앤캐쉬(오토론)
    name: '드림앤캐쉬(오토론)', category: '대부 오토론',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 50, loanMax: 5000,
    vehicle: true, vehicleYear: null, vehicleKm: null,
    recovery: ['무','회생','파산','회복'],
    insurance4: null,
    notes: '차량원부(갑/을)+기타메모 必'
  },
  2494: { // 어드벤스네바퀴
    name: '어드벤스네바퀴', category: '대부 오토론',
    jobTypes: ['직장인(4대가입)','직장인(4대미가입)','개인사업자','법인사업자','주부','청년','프리랜서','무직','기타'],
    ageMin: 20, ageMax: 70,
    loanMin: 50, loanMax: 5000,
    vehicle: true, vehicleYear: null, vehicleKm: null,
    recovery: ['무','회생','파산','회복'],
    insurance4: null,
    notes: '무서류접수. 접수 후 세이프키 발송'
  }
};

// ========================================
// 고객 정보 → 상품 매칭 엔진
// ========================================
function matchProducts(customer) {
  const results = [];

  // 고객 정보 정규화
  const age = customer.age || 0;
  const jobType = customer.jobType || ''; // 직업구분 (form-table의 select 값)
  const hasVehicle = !!customer.vehicleNo; // 차량번호 유무
  const vehicleYear = customer.vehicleYear || 0; // 차량연식
  const vehicleKm = customer.vehicleKm || 0; // 주행거리
  const recoveryType = customer.recoveryType || '무'; // 회파복 구분
  const loanAmount = customer.loanAmount || 0; // 대출요청액

  for (const [fidx, cond] of Object.entries(productConditions)) {
    const match = {
      fidx: parseInt(fidx),
      name: cond.name,
      category: cond.category,
      notes: cond.notes,
      score: 0,
      maxScore: 0,
      reasons: [],
      failReasons: []
    };

    // 1. 직군 매칭 (필수)
    match.maxScore += 3;
    const jobMatched = cond.jobTypes.some(j => jobType.includes(j) || j.includes(jobType));
    if (jobMatched) {
      match.score += 3;
      match.reasons.push('직군 적합');
    } else {
      match.failReasons.push(`직군 부적합 (${cond.jobTypes.slice(0,3).join(',')}...)`);
    }

    // 2. 연령 매칭 (필수)
    match.maxScore += 2;
    if (age >= cond.ageMin && age <= cond.ageMax) {
      match.score += 2;
      match.reasons.push(`연령 적합 (${cond.ageMin}~${cond.ageMax}세)`);
    } else {
      match.failReasons.push(`연령 부적합 (${cond.ageMin}~${cond.ageMax}세)`);
    }

    // 3. 회파복 매칭 (필수)
    match.maxScore += 3;
    if (cond.recovery.includes(recoveryType)) {
      match.score += 3;
      match.reasons.push('회파복 적합');
    } else {
      match.failReasons.push(`회파복 부적합 (${cond.recovery.join('/')} 만 가능)`);
    }

    // 4. 차량 조건 (해당 시)
    if (cond.vehicle) {
      match.maxScore += 2;
      if (hasVehicle) {
        match.score += 2;
        match.reasons.push('차량 보유 ✓');
        // 차량 연식 체크
        if (cond.vehicleYear && vehicleYear && vehicleYear < cond.vehicleYear) {
          match.score -= 1;
          match.failReasons.push(`차량연식 부적합 (${cond.vehicleYear}년식~)`);
        }
        // 주행거리 체크
        if (cond.vehicleKm && vehicleKm && vehicleKm > cond.vehicleKm) {
          match.score -= 1;
          match.failReasons.push(`주행거리 초과 (${(cond.vehicleKm/10000).toFixed(0)}만km 이하)`);
        }
      } else {
        match.failReasons.push('차량 필요 상품');
      }
    }

    // 5. 대출금액 범위
    if (loanAmount > 0) {
      match.maxScore += 1;
      if (loanAmount >= cond.loanMin && loanAmount <= cond.loanMax) {
        match.score += 1;
        match.reasons.push('대출금액 범위 적합');
      } else {
        match.failReasons.push(`대출금액 범위 초과 (${cond.loanMin}~${cond.loanMax}만)`);
      }
    }

    // 매칭률 계산
    match.matchRate = match.maxScore > 0 ? Math.round((match.score / match.maxScore) * 100) : 0;
    match.status = match.failReasons.length === 0 ? 'recommended' :
                   match.matchRate >= 60 ? 'conditional' : 'unsuitable';

    results.push(match);
  }

  // 매칭률 순 정렬
  results.sort((a, b) => b.matchRate - a.matchRate || b.score - a.score);

  return {
    recommended: results.filter(r => r.status === 'recommended'),
    conditional: results.filter(r => r.status === 'conditional'),
    unsuitable: results.filter(r => r.status === 'unsuitable'),
    all: results
  };
}

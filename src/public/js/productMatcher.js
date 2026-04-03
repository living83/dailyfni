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
    recovery: ['무'],
    insurance4: null,
    notes: '신용,대환,사잇돌,햇살론 조회가능 (일반 전용)'
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
  const jobType = customer.jobType || '';
  const hasVehicle = !!customer.vehicleNo;
  const vehicleYear = customer.vehicleYear || 0;
  const vehicleKm = customer.vehicleKm || 0;
  const recoveryType = customer.recoveryType || '무';
  const loanAmount = customer.loanAmount || 0;

  // 1단계: productConditions에 등록된 상품 매칭
  for (const [fidx, cond] of Object.entries(productConditions)) {
    const match = matchOneProduct(parseInt(fidx), cond, { age, jobType, hasVehicle, vehicleYear, vehicleKm, recoveryType, loanAmount });
    results.push(match);
  }

  // 2단계: products.js에서 productConditions에 없는 상품 자동 매칭
  if (typeof productCategories !== 'undefined') {
    const registeredFidx = new Set(Object.keys(productConditions).map(Number));
    productCategories.forEach(cat => {
      cat.products.forEach(p => {
        if (!p.fidx || registeredFidx.has(p.fidx)) return;

        // tags에서 자동 조건 생성
        const desc = p.desc || '';
        const autoCond = {
          name: p.name,
          category: cat.name,
          jobTypes: p.tags || [],
          ageMin: 20, ageMax: 70,
          loanMin: 50, loanMax: 10000,
          vehicle: false,
          vehicleYear: null, vehicleKm: null,
          recovery: detectRecovery(p.name, cat.name),
          insurance4: null,
          notes: desc.split('\n')[0],
          suspended: false,
          requireProperty: false,
          exclusions: []
        };

        // desc에서 조건 자동 파싱
        const parsed = parseDescConditions(desc, p.name, cat.name);
        Object.assign(autoCond, parsed);

        const match = matchOneProduct(p.fidx, autoCond, { age, jobType, hasVehicle, vehicleYear, vehicleKm, recoveryType, loanAmount });
        results.push(match);
      });
    });
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

// desc에서 불가사항/조건 자동 파싱
function parseDescConditions(desc, productName, categoryName) {
  const result = {
    vehicle: false,
    vehicleYear: null,
    vehicleKm: null,
    requireProperty: false,
    suspended: false,
    exclusions: [],
    insurance4Months: null
  };

  if (!desc) return result;

  // 상품 중단 감지
  if (desc.includes('임시중단') || productName.includes('임시중단')) {
    result.suspended = true;
    result.exclusions.push('상품 임시중단');
  }

  // 차량 조건 파싱 (🚗 포함 시)
  if (desc.includes('🚗') || categoryName.includes('오토론') || productName.includes('오토') || productName.includes('차량')) {
    result.vehicle = true;

    // 차량 연식 파싱 (예: 2007년식부터, 2014년식부터, 10년이내, 12년이내)
    const yearMatch = desc.match(/(\d{4})년식/);
    if (yearMatch) result.vehicleYear = parseInt(yearMatch[1]);
    const yearInMatch = desc.match(/(\d+)년이내/);
    if (yearInMatch) result.vehicleYear = new Date().getFullYear() - parseInt(yearInMatch[1]);

    // 주행거리 파싱 (예: 20만km미만, 20만km이하, 30만km미만)
    const kmMatch = desc.match(/(\d+)만km/i);
    if (kmMatch) result.vehicleKm = parseInt(kmMatch[1]) * 10000;

    // 본인명의 체크
    if (desc.includes('본인|') || desc.includes('본인명의')) {
      result.exclusions.push('본인명의 차량만');
    }
  }

  // 부동산 조건 파싱 (🏠 포함 시)
  if (desc.includes('🏠')) {
    result.requireProperty = true;

    // KB시세 조건
    const kbMatch = desc.match(/KB시세(\d+[.\d]*)억/);
    if (kbMatch) result.exclusions.push(`KB시세 ${kbMatch[1]}억 이상`);

    const kbMatch2 = desc.match(/시세(\d+)천/);
    if (kbMatch2) result.exclusions.push(`시세 ${kbMatch2[1]}천만 이상`);
  }

  // 4대보험 가입 기간 (📌 포함 시)
  if (desc.includes('📌')) {
    const ins4Match = desc.match(/4대가입\s*(\d+)개월/);
    if (ins4Match) result.insurance4Months = parseInt(ins4Match[1]);

    const ins4Match2 = desc.match(/4대가입\s*(\d+)고지/);
    if (ins4Match2) result.insurance4Months = parseInt(ins4Match2[1]);

    const ins4Match3 = desc.match(/(\d+)납/);
    if (ins4Match3 && !result.insurance4Months) result.insurance4Months = parseInt(ins4Match3[1]);
  }

  // 사잇돌+오토 동시 불가
  if (desc.includes('사잇돌+오토') && desc.includes('不')) {
    result.exclusions.push('사잇돌+오토 동시 불가');
  }

  return result;
}

// 회파복 자동 감지
function detectRecovery(productName, categoryName) {
  const name = productName + categoryName;
  if (name.includes('회생') || name.includes('파산') || name.includes('회복') || name.includes('회파복')) {
    const recovery = [];
    if (name.includes('회생')) recovery.push('회생');
    if (name.includes('파산')) recovery.push('파산');
    if (name.includes('회복')) recovery.push('회복');
    return recovery;
  }
  return ['무'];
}

// 단일 상품 매칭
function matchOneProduct(fidx, cond, customer) {
  const { age, jobType, hasVehicle, vehicleYear, vehicleKm, recoveryType, loanAmount } = customer;

  const match = {
    fidx: fidx,
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

  // 3. 회파복 매칭 (필수 - 엄격 매칭)
  match.maxScore += 3;
  if (recoveryType === '무') {
    // 일반 고객: recovery에 '무'가 포함된 상품만
    if (cond.recovery.includes('무')) {
      match.score += 3;
      match.reasons.push('일반(회파복 없음)');
    } else {
      // 회파복 전용 상품은 일반 고객에게 추천 불가
      match.score = 0;
      match.failReasons = ['회파복 전용 상품 (일반 고객 불가)'];
      match.matchRate = 0;
      match.status = 'unsuitable';
      return match;
    }
  } else {
    // 회파복 고객: 정확한 회파복 구분이 포함된 상품만
    if (cond.recovery.includes(recoveryType)) {
      match.score += 3;
      match.reasons.push(`${recoveryType} 적합`);
    } else if (cond.recovery.length === 1 && cond.recovery[0] === '무') {
      // 일반 전용 상품은 회파복 고객에게 절대 추천 불가
      match.score = 0;
      match.failReasons = ['일반 전용 상품 (회파복 고객 불가)'];
      match.matchRate = 0;
      match.status = 'unsuitable';
      return match;
    } else {
      match.failReasons.push(`회파복 불일치 (${cond.recovery.join('/')} 만 가능, 고객:${recoveryType})`);
    }
  }

  // 4. 차량 조건 (필수 - 차량 미소유 시 즉시 부적합)
  if (cond.vehicle) {
    match.maxScore += 2;
    if (hasVehicle) {
      match.score += 2;
      match.reasons.push('차량 보유');
      if (cond.vehicleYear && vehicleYear && vehicleYear < cond.vehicleYear) {
        match.score -= 1;
        match.failReasons.push(`차량연식 부적합 (${cond.vehicleYear}년식~)`);
      }
      if (cond.vehicleKm && vehicleKm && vehicleKm > cond.vehicleKm) {
        match.score -= 1;
        match.failReasons.push(`주행거리 초과 (${(cond.vehicleKm/10000).toFixed(0)}만km 이하)`);
      }
    } else {
      // 차량 필수 상품인데 차량 미소유 → 즉시 부적합
      match.score = 0;
      match.failReasons = ['차량 미소유 (오토론/차량담보 불가)'];
      match.matchRate = 0;
      match.status = 'unsuitable';
      return match;
    }
  }

  // 5. 대출금액 범위
  if (loanAmount > 0 && cond.loanMin && cond.loanMax) {
    match.maxScore += 1;
    if (loanAmount >= cond.loanMin && loanAmount <= cond.loanMax) {
      match.score += 1;
      match.reasons.push('대출금액 범위 적합');
    } else {
      match.failReasons.push(`대출금액 범위 (${cond.loanMin}~${cond.loanMax}만)`);
    }
  }

  // 6. 상품 중단 체크
  if (cond.suspended) {
    match.failReasons.push('상품 임시중단');
    match.score = 0;
  }

  // 7. 부동산 담보 체크 (부동산 없으면 즉시 부적합)
  if (cond.requireProperty) {
    if (customer.hasProperty === false) {
      match.score = 0;
      match.failReasons = ['부동산 미보유 (담보대출 불가)'];
      match.matchRate = 0;
      match.status = 'unsuitable';
      return match;
    } else {
      match.maxScore += 1;
      match.reasons.push('부동산 담보 확인 필요');
    }
  }

  // 8. 4대보험 가입 기간 체크
  if (cond.insurance4Months && cond.insurance4Months > 0) {
    match.maxScore += 1;
    match.reasons.push(`4대보험 ${cond.insurance4Months}개월+ 필요`);
  }

  // 9. 불가사항/특수조건 표시
  if (cond.exclusions && cond.exclusions.length > 0) {
    cond.exclusions.forEach(ex => {
      if (!match.failReasons.includes(ex)) {
        match.failReasons.push(ex);
      }
    });
  }

  // 10. (3번에서 이미 처리됨 - 회파복 엄격 매칭)

  // 11. 회생 납입 회차 체크 (desc에서 파싱)
  if (recoveryType === '회생' && customer.recoveryPaid > 0 && cond.notes) {
    const notes = cond.notes;
    // "회생 1/3 이상", "회생 4회차 이상", "회생 총회차 25%" 등
    const thirdMatch = notes.match(/[⅓1\/3]/);
    const halfMatch = notes.match(/[½1\/2]/);
    const countMatch = notes.match(/(\d+)회차/);

    if (thirdMatch && customer.recoveryTotal > 0) {
      const required = Math.ceil(customer.recoveryTotal / 3);
      if (customer.recoveryPaid >= required) {
        match.score += 1;
        match.maxScore += 1;
        match.reasons.push(`회생 1/3 충족 (${customer.recoveryPaid}/${customer.recoveryTotal})`);
      } else {
        match.maxScore += 1;
        match.failReasons.push(`회생 1/3 미충족 (${customer.recoveryPaid}/${customer.recoveryTotal}, 필요:${required}회)`);
      }
    } else if (halfMatch && customer.recoveryTotal > 0) {
      const required = Math.ceil(customer.recoveryTotal / 2);
      if (customer.recoveryPaid >= required) {
        match.score += 1;
        match.maxScore += 1;
        match.reasons.push(`회생 1/2 충족 (${customer.recoveryPaid}/${customer.recoveryTotal})`);
      } else {
        match.maxScore += 1;
        match.failReasons.push(`회생 1/2 미충족 (${customer.recoveryPaid}/${customer.recoveryTotal}, 필요:${required}회)`);
      }
    } else if (countMatch) {
      const required = parseInt(countMatch[1]);
      if (customer.recoveryPaid >= required) {
        match.score += 1;
        match.maxScore += 1;
        match.reasons.push(`회생 ${required}회차 충족`);
      } else {
        match.maxScore += 1;
        match.failReasons.push(`회생 ${required}회차 미충족 (현재:${customer.recoveryPaid}회)`);
      }
    } else if (customer.recoveryPaid >= 1) {
      match.score += 1;
      match.maxScore += 1;
      match.reasons.push(`회생 납입 ${customer.recoveryPaid}회차`);
    }
  }

  // 매칭률 계산
  match.matchRate = match.maxScore > 0 ? Math.round((match.score / match.maxScore) * 100) : 0;
  match.status = cond.suspended ? 'unsuitable' :
                 match.failReasons.length === 0 ? 'recommended' :
                 match.matchRate >= 60 ? 'conditional' : 'unsuitable';

  return match;
}

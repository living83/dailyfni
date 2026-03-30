export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "DAILY F&I",
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "(주)데일리에프앤아이대부",
  businessNumber: process.env.NEXT_PUBLIC_BUSINESS_NUMBER || "894-86-03385",
  registrationNumber: process.env.NEXT_PUBLIC_REGISTRATION_NUMBER || "2024-금감원-2626",
  registrationType: "대부업, 대부중개업",
  ceoName: process.env.NEXT_PUBLIC_CEO_NAME || "홍나령",
  phone: process.env.NEXT_PUBLIC_PHONE || "02-2138-0759",
  complaintPhone: "02-2138-0749",
  email: process.env.NEXT_PUBLIC_EMAIL || "info@dailyfni.co.kr",
  address: process.env.NEXT_PUBLIC_ADDRESS || "서울시 강남구 자봉로센길 606 대상디트레지아빌리스타 615호",
  website: "www.dailyfni.co.kr",
};

export const CARRIERS = [
  { value: "SKT", label: "SKT" },
  { value: "KT", label: "KT" },
  { value: "LGU", label: "LG U+" },
  { value: "SKT_MVNO", label: "SKT 알뜰폰" },
  { value: "KT_MVNO", label: "KT 알뜰폰" },
  { value: "LGU_MVNO", label: "LG U+ 알뜰폰" },
];

export const EMPLOYMENT_TYPES = [
  { value: "employed", label: "직장인" },
  { value: "self_employed", label: "개인사업자" },
  { value: "unemployed", label: "무직" },
  { value: "other", label: "기타" },
];

export const INSURANCE_OPTIONS = [
  { value: "yes", label: "가입" },
  { value: "no", label: "미가입" },
  { value: "unknown", label: "모름" },
];

export const LOAN_AREAS = [
  {
    code: "rehabilitation",
    title: "개인회생 · 파산",
    shortTitle: "개인회생",
    description: "개인회생 및 파산 관련 전문 상담과 대출 중개 서비스를 제공합니다.",
    priority: 1,
    color: "navy",
    icon: "shield",
    highlights: [
      "법원 인가 절차 안내",
      "개인회생 전문 상담",
      "파산 면책 후 재기 지원",
    ],
  },
  {
    code: "auto",
    title: "오토론 · 자동차 대출",
    shortTitle: "오토론",
    description: "자동차 구입 및 오토론 관련 최적의 대출 상품을 중개합니다.",
    priority: 2,
    color: "deep-blue",
    icon: "car",
    highlights: [
      "신차/중고차 대출",
      "자동차 담보 대출",
      "합리적인 금리 비교",
    ],
  },
  {
    code: "credit",
    title: "신용대출",
    shortTitle: "신용대출",
    description: "개인 신용 기반의 다양한 대출 상품을 비교하고 중개합니다.",
    priority: 3,
    color: "slate",
    icon: "credit",
    highlights: [
      "신용등급별 맞춤 상품",
      "빠른 심사 절차",
      "다양한 금융사 비교",
    ],
  },
  {
    code: "realestate",
    title: "부동산 대출",
    shortTitle: "부동산",
    description: "부동산 담보 대출 및 전세 자금 대출을 중개합니다.",
    priority: 4,
    color: "gray-700",
    icon: "building",
    highlights: [
      "아파트/주택 담보 대출",
      "전세 자금 대출",
      "부동산 투자 상담",
    ],
  },
];

export const COMMON_LEGAL_NOTICE = `※ 대부업·대부중개업 법적 고지사항
• 상호: (주)데일리에프앤아이대부 | 대표: 홍나령 | 사업자등록번호: 894-86-03385
• 대부업 등록번호: 2024-금감원-2626 (대부업, 대부중개업)
• 주소: 서울시 강남구 자봉로센길 606 대상디트레지아빌리스타 615호
• 고객문의접수: 02-2138-0749 | 대표전화: 02-2138-0759
• 금리 연 20% 이내(연체금리는 약정금리+3% 이내, 연 20% 이내) 건, 2021.7.7부터 적용
• 취급수수료 등 부대비용 없음 ※ 대부대비: 등록대부업체, 자발교부세, 등기신청수수료, 근저당권설정/말소 관련비용 등은 별도 부담
• 과도한 빚은 당신에게 큰 불행을 안겨줄 수 있습니다.
• 대출 시 귀하의 신용등급 또는 개인신용평점이 하락할 수 있습니다.
• 금리, 한도 등 대출조건은 개인별 심사 결과에 따라 상이합니다.
• 대출 시 귀하의 신용등급 또는 개인신용평점이 하락할 수 있습니다. 각 금융회사에서 적용하는 금리, 조건 등은 해당 금융회사에 문의하시기 바랍니다.`;

export const MASKING = {
  phone: (phone: string) => {
    if (!phone || phone.length < 8) return "***";
    return phone.slice(0, 3) + "-****-" + phone.slice(-4);
  },
  name: (name: string) => {
    if (!name || name.length < 2) return "*";
    return name[0] + "*".repeat(name.length - 1);
  },
};

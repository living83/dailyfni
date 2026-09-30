const Tool = require('../core/Tool');

/**
 * 웹 디자인 도구 (15년차 웹디자이너 전문 지식)
 *
 * 역할:
 * 1. 페이지별 레이아웃 설계 (와이어프레임 구조)
 * 2. 반응형 디자인 가이드 (모바일 퍼스트)
 * 3. 컬러/타이포그래피/스페이싱 시스템 관리
 * 4. UI 컴포넌트 디자인 토큰 제공
 * 5. 접근성(A11y) 검증
 * 6. 전환율 최적화(CRO) 디자인 가이드
 */
class WebDesignTool extends Tool {
  constructor() {
    super({
      name: 'web_design',
      description: '웹 디자인 가이드(레이아웃, 반응형, 컬러, 타이포, 접근성, CRO)를 제공합니다.',
      parameters: {
        action: { type: 'string', description: '실행 액션 (getDesignSystem, getLayout, getResponsive, checkA11y, getCROGuide)' },
        pageType: { type: 'string', description: '페이지 유형 (main, landing, apply, admin, terms)' },
        device: { type: 'string', description: '기기 유형 (desktop, tablet, mobile)', default: 'all' },
      },
    });

    // ─── 디자인 시스템 ───
    this.designSystem = {
      colors: {
        primary: {
          navy: '#1B2A4A',
          navyLight: '#2C3E6B',
          navyDark: '#0F1A33',
          deepBlue: '#1E3A5F',
        },
        neutral: {
          white: '#FFFFFF',
          gray50: '#F9FAFB',
          gray100: '#F3F4F6',
          gray200: '#E5E7EB',
          gray300: '#D1D5DB',
          gray400: '#9CA3AF',
          gray500: '#6B7280',
          gray600: '#4B5563',
          gray700: '#374151',
          gray800: '#1F2937',
          gray900: '#111827',
        },
        accent: {
          blue: '#2563EB',
          blueHover: '#1D4ED8',
        },
        semantic: {
          success: '#059669',
          warning: '#D97706',
          error: '#DC2626',
          info: '#2563EB',
        },
      },
      typography: {
        fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        scale: {
          hero: { size: '2.5rem', lineHeight: 1.2, weight: 700, mobile: '1.875rem' },
          h1: { size: '2rem', lineHeight: 1.3, weight: 700, mobile: '1.5rem' },
          h2: { size: '1.5rem', lineHeight: 1.4, weight: 600, mobile: '1.25rem' },
          h3: { size: '1.25rem', lineHeight: 1.4, weight: 600, mobile: '1.125rem' },
          body: { size: '1rem', lineHeight: 1.6, weight: 400, mobile: '0.9375rem' },
          small: { size: '0.875rem', lineHeight: 1.5, weight: 400, mobile: '0.8125rem' },
          caption: { size: '0.75rem', lineHeight: 1.4, weight: 400, mobile: '0.75rem' },
        },
      },
      spacing: {
        unit: 4, // 기본 단위: 4px
        scale: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64],
        section: { desktop: 80, tablet: 60, mobile: 40 },
        container: { maxWidth: 1280, padding: { desktop: 32, tablet: 24, mobile: 16 } },
      },
      breakpoints: {
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280,
      },
      borderRadius: {
        sm: 4,
        md: 8,
        lg: 12,
        xl: 16,
        full: 9999,
      },
      shadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 6px rgba(0,0,0,0.07)',
        lg: '0 10px 15px rgba(0,0,0,0.1)',
        xl: '0 20px 25px rgba(0,0,0,0.1)',
      },
      components: {
        button: {
          primary: { bg: '#2563EB', text: '#FFFFFF', hover: '#1D4ED8', radius: 8, padding: '12px 24px', minHeight: 44 },
          secondary: { bg: 'transparent', text: '#2563EB', border: '#2563EB', hover: '#EFF6FF', radius: 8, padding: '12px 24px', minHeight: 44 },
          ghost: { bg: 'transparent', text: '#6B7280', hover: '#F3F4F6', radius: 8, padding: '12px 24px', minHeight: 44 },
        },
        input: {
          height: 48,
          padding: '12px 16px',
          border: '#D1D5DB',
          focusBorder: '#2563EB',
          errorBorder: '#DC2626',
          radius: 8,
          fontSize: '1rem',
        },
        card: {
          bg: '#FFFFFF',
          border: '#E5E7EB',
          radius: 12,
          padding: { desktop: 24, mobile: 16 },
          shadow: '0 1px 3px rgba(0,0,0,0.08)',
          hoverShadow: '0 4px 12px rgba(0,0,0,0.12)',
        },
      },
    };
  }

  async execute(input) {
    const { action, pageType, device = 'all' } = input;

    switch (action) {
      case 'getDesignSystem':
        return this._getDesignSystem();
      case 'getLayout':
        return this._getLayout(pageType, device);
      case 'getResponsive':
        return this._getResponsive(pageType);
      case 'checkA11y':
        return this._checkA11y(pageType);
      case 'getCROGuide':
        return this._getCROGuide(pageType);
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  _getDesignSystem() {
    return {
      status: 'success',
      designSystem: this.designSystem,
      principles: [
        '모바일 퍼스트: 모든 디자인은 모바일에서 먼저 설계하고 데스크톱으로 확장',
        '신뢰 기반 디자인: 네이비/딥블루 톤으로 전문성과 안정감 전달',
        '최소 터치 타겟: 44x44px 이상 (Apple HIG, Google Material 기준)',
        '콘텐츠 우선: 불필요한 장식 요소 배제, 정보 전달력 극대화',
        '법적 고지 가시성: 법적 필수 문구는 항상 읽기 쉬운 크기와 대비로 표시',
        '일관된 간격: 4px 그리드 기반으로 모든 간격을 정의',
      ],
    };
  }

  _getLayout(pageType, device) {
    const layouts = {
      main: {
        name: '메인 홈페이지',
        sections: [
          { id: 'header', type: 'sticky-header', height: { desktop: 64, mobile: 56 }, description: '로고 + 네비 + CTA(온라인신청)' },
          { id: 'hero', type: 'hero-banner', height: { desktop: 560, mobile: 480 }, description: '히어로 배너 (그라데이션 배경, 메인 카피, CTA 2개, 신뢰 지표)' },
          { id: 'trust-bar', type: 'trust-indicators', height: { desktop: 80, mobile: 60 }, description: '신뢰 지표 바 (상담건수, 제휴금융사, 만족도, 법규위반0건)' },
          { id: 'section-1', type: 'product-card', priority: 1, description: '개인회생·파산 (가장 넓은 면적, 풀 와이드 카드)' },
          { id: 'section-2', type: 'product-card', priority: 2, description: '오토론·자동차 (중간 면적, 2/3 카드)' },
          { id: 'section-3', type: 'product-card', priority: 3, description: '신용대출 (표준 면적, 1/2 카드)' },
          { id: 'section-4', type: 'product-card', priority: 4, description: '부동산 (표준 면적, 1/2 카드)' },
          { id: 'cta-banner', type: 'cta-section', description: '하단 CTA 배너 (온라인 신청 유도)' },
          { id: 'legal-notice', type: 'legal-footer', description: '법적 고지사항 전문' },
          { id: 'footer', type: 'footer', description: '회사정보, 연락처, 바로가기, 보안인증' },
        ],
        gridSystem: {
          desktop: { columns: 12, gutter: 24, maxWidth: 1280 },
          tablet: { columns: 8, gutter: 20, maxWidth: 768 },
          mobile: { columns: 4, gutter: 16, maxWidth: '100%' },
        },
      },
      landing: {
        name: '영역별 랜딩 페이지',
        sections: [
          { id: 'header', type: 'sticky-header' },
          { id: 'landing-hero', type: 'landing-header', height: { desktop: 400, mobile: 320 }, description: '영역별 헤더 이미지 + 제목 + 부제' },
          { id: 'service-desc', type: 'content-section', description: '서비스 설명 (아이콘 + 텍스트 그리드)' },
          { id: 'eligibility', type: 'info-table', description: '자격 조건 테이블' },
          { id: 'rate-info', type: 'info-card', description: '금리/수수료/한도/상환방식 카드' },
          { id: 'process', type: 'step-flow', description: '신청 절차 플로우 (3~4단계)' },
          { id: 'faq', type: 'accordion', description: '자주 묻는 질문 (아코디언)' },
          { id: 'cta-bottom', type: 'cta-section', description: '하단 CTA (상담 신청 / 온라인 신청)' },
          { id: 'legal-notice', type: 'legal-footer' },
          { id: 'footer', type: 'footer' },
        ],
      },
      apply: {
        name: '온라인 신청 페이지',
        sections: [
          { id: 'header', type: 'minimal-header', description: '최소한 헤더 (로고 + 닫기)' },
          { id: 'progress', type: 'progress-bar', description: '단계 진행률 바' },
          { id: 'form-area', type: 'centered-form', maxWidth: 480, description: '중앙 정렬된 폼 영역' },
          { id: 'consent', type: 'consent-checkbox', description: '개인정보 동의 체크박스 (경고 하이라이트 영역)' },
          { id: 'submit', type: 'sticky-submit', description: '모바일: 하단 고정 등록 버튼' },
          { id: 'legal-summary', type: 'legal-inline', description: '폼 하단 법적 고지 요약' },
        ],
        formDesign: {
          inputSpacing: 16,
          labelPosition: 'top',
          errorColor: '#DC2626',
          warningHighlight: {
            borderColor: '#DC2626',
            bgColor: '#FEF2F2',
            textColor: '#DC2626',
            animation: 'shake 0.3s ease',
          },
        },
      },
      admin: {
        name: '관리자 페이지',
        sections: [
          { id: 'sidebar', type: 'collapsible-sidebar', width: { open: 256, collapsed: 64 }, description: '접이식 사이드바 네비게이션' },
          { id: 'topbar', type: 'admin-topbar', height: 56, description: '상단 바 (검색, 알림, 프로필)' },
          { id: 'content', type: 'main-content', description: '메인 콘텐츠 영역 (사이드바 오른쪽)' },
        ],
      },
      terms: {
        name: '약관/정책 페이지',
        sections: [
          { id: 'header', type: 'sticky-header' },
          { id: 'breadcrumb', type: 'breadcrumb' },
          { id: 'toc', type: 'table-of-contents', description: '목차 (데스크톱: 좌측 고정, 모바일: 상단 아코디언)' },
          { id: 'content', type: 'prose-content', maxWidth: 720, description: '약관 본문 (가독성 최적 너비)' },
          { id: 'footer', type: 'footer' },
        ],
      },
    };

    const layout = layouts[pageType];
    if (!layout) {
      return { status: 'error', message: `알 수 없는 페이지 유형: ${pageType}. 사용 가능: ${Object.keys(layouts).join(', ')}` };
    }

    return { status: 'success', layout, device };
  }

  _getResponsive(pageType) {
    return {
      status: 'success',
      strategy: 'mobile-first',
      breakpoints: this.designSystem.breakpoints,
      rules: [
        {
          rule: '모바일(~639px): 단일 컬럼, 카드 풀 와이드, 터치 최적화',
          details: '버튼/입력란 높이 48px 이상, 간격 16px, 폰트 15px 이상',
        },
        {
          rule: '태블릿(640~1023px): 2컬럼 그리드, 사이드바 접힘, 패딩 24px',
          details: '카드 2열 배치, CTA 상단 고정 해제',
        },
        {
          rule: '데스크톱(1024px~): 멀티 컬럼, 사이드바 표시, 패딩 32px',
          details: '최대 너비 1280px, 카드 3~4열, 호버 효과 활성화',
        },
      ],
      imageStrategy: {
        technique: '<picture> + srcset',
        formats: ['webp', 'jpg'],
        sizes: {
          mobile: '100vw',
          tablet: '50vw',
          desktop: '33vw',
        },
        lazyLoading: 'above-the-fold 이미지 제외하고 lazy loading 적용',
      },
      touchTargets: {
        minimum: '44x44px',
        recommended: '48x48px',
        spacing: '최소 8px 간격',
      },
    };
  }

  _checkA11y(pageType) {
    return {
      status: 'success',
      checks: [
        { id: 'contrast', label: '색상 대비 (WCAG AA 4.5:1)', status: 'guide', detail: '본문 텍스트는 배경 대비 4.5:1 이상, 큰 텍스트는 3:1 이상' },
        { id: 'focus', label: '키보드 포커스 표시', status: 'guide', detail: '모든 인터랙티브 요소에 :focus-visible 스타일 적용' },
        { id: 'alt_text', label: '이미지 대체 텍스트', status: 'guide', detail: '모든 <img>에 alt 속성 필수' },
        { id: 'aria_labels', label: 'ARIA 레이블', status: 'guide', detail: '아이콘 버튼, 모달, 드롭다운에 aria-label 필수' },
        { id: 'form_labels', label: '폼 레이블', status: 'guide', detail: '모든 입력란에 <label> 연결 필수' },
        { id: 'heading_order', label: '제목 계층 구조', status: 'guide', detail: 'h1 → h2 → h3 순서 유지, 건너뛰기 금지' },
        { id: 'motion', label: '모션 제어', status: 'guide', detail: 'prefers-reduced-motion 미디어 쿼리 적용' },
        { id: 'language', label: '언어 속성', status: 'guide', detail: '<html lang="ko"> 설정' },
      ],
    };
  }

  _getCROGuide(pageType) {
    const guides = {
      main: {
        principles: [
          { title: 'F 패턴 레이아웃', detail: '사용자 시선은 왼쪽 상단 → 오른쪽 → 아래로 이동. 핵심 CTA를 좌측 상단 영역에 배치.' },
          { title: '첫 화면 CTA', detail: '스크롤 없이 보이는 영역에 "무료 상담 신청" CTA 배치. 대비색(파란색) 버튼.' },
          { title: '신뢰 지표 노출', detail: '히어로 아래 즉시 상담 건수/제휴사/만족도 표시하여 이탈 방지.' },
          { title: '우선순위 면적 배분', detail: '1순위(개인회생) 섹션에 가장 큰 면적과 시각적 강조를 부여.' },
        ],
      },
      apply: {
        principles: [
          { title: '최소 필드', detail: '첫 화면은 3개 필드(이름/통신사/전화번호)만. 추가 필드는 점진적 노출.' },
          { title: '동의 체크 UX', detail: '미체크 시 빨간 테두리 + 경고 텍스트로 안내. 입력값 유지. 모달 팝업 사용 금지 (이탈 유발).' },
          { title: '진행률 표시', detail: '상단 프로그레스 바로 현재 단계와 남은 단계를 시각화.' },
          { title: '모바일 고정 버튼', detail: '모바일에서 "등록" 버튼을 하단 고정(sticky)으로 항상 접근 가능하게.' },
          { title: '성공 피드백', detail: '등록 성공 시 체크마크 애니메이션 + "접수 완료" 메시지로 확신 제공.' },
        ],
      },
      landing: {
        principles: [
          { title: '단일 목적', detail: '랜딩 페이지의 목적은 "상담 신청" 단 하나. 다른 이탈 링크 최소화.' },
          { title: '상단/하단 이중 CTA', detail: '헤더 아래와 페이지 최하단에 CTA 2개 배치.' },
          { title: '정보 구조화', detail: '금리/수수료/자격조건은 카드/테이블로 한눈에 비교 가능하게.' },
          { title: 'FAQ 아코디언', detail: '자주 묻는 질문으로 불안 해소. 클릭 시 부드러운 전개 애니메이션.' },
        ],
      },
    };

    return {
      status: 'success',
      pageType,
      guide: guides[pageType] || guides.main,
    };
  }
}

module.exports = WebDesignTool;

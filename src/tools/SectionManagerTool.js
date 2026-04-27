const Tool = require('../core/Tool');

/**
 * 메인 섹션 콘텐츠 관리 도구
 *
 * 역할:
 * 1. 메인 섹션(개인회생/오토론/신용대출/부동산) 노출 순서/ON-OFF 관리
 * 2. 섹션별 콘텐츠 템플릿 생성
 * 3. 변경 이력 기록
 * 4. 법적 필수 고지 섹션 보호 정책 적용
 */
class SectionManagerTool extends Tool {
  constructor() {
    super({
      name: 'section_manager',
      description: '메인 섹션의 노출 순서, ON/OFF, 콘텐츠 템플릿을 관리합니다.',
      parameters: {
        action: { type: 'string', description: '실행 액션 (getSections, reorder, toggle, validate, getTemplate)' },
        sections: { type: 'array', description: '섹션 배열 (재정렬 시)' },
        sectionCode: { type: 'string', description: '대상 섹션 코드' },
        visible: { type: 'boolean', description: 'ON/OFF 값' },
        adminId: { type: 'string', description: '관리자 ID' },
      },
    });

    // 기본 섹션 설정
    this.defaultSections = [
      {
        code: 'rehabilitation',
        title: '개인회생 · 파산',
        sortOrder: 1,
        isVisible: true,
        isProtected: true, // 법적 필수 고지 포함 → OFF 불가
        priority: 'highest',
        template: {
          headline: '개인회생·파산 전문 상담',
          subheading: '법적 절차부터 대출 중개까지 한 번에',
          points: ['법원 인가 절차 안내', '개인회생 전문 상담', '파산 면책 후 재기 지원'],
          ctaText: '무료 상담 신청',
          ctaLink: '/apply',
        },
      },
      {
        code: 'auto',
        title: '오토론 · 자동차 대출',
        sortOrder: 2,
        isVisible: true,
        isProtected: false,
        priority: 'high',
        template: {
          headline: '자동차 대출 비교',
          subheading: '신차부터 중고차까지 최적의 조건',
          points: ['신차/중고차 대출', '자동차 담보 대출', '합리적인 금리 비교'],
          ctaText: '견적 받기',
          ctaLink: '/apply',
        },
      },
      {
        code: 'credit',
        title: '신용대출',
        sortOrder: 3,
        isVisible: true,
        isProtected: false,
        priority: 'normal',
        template: {
          headline: '신용대출 맞춤 비교',
          subheading: '내 신용등급에 맞는 최적의 상품',
          points: ['신용등급별 맞춤 상품', '빠른 심사 절차', '다양한 금융사 비교'],
          ctaText: '상품 비교하기',
          ctaLink: '/apply',
        },
      },
      {
        code: 'realestate',
        title: '부동산 대출',
        sortOrder: 4,
        isVisible: true,
        isProtected: false,
        priority: 'normal',
        template: {
          headline: '부동산 담보 대출',
          subheading: '아파트·주택·전세 자금 대출',
          points: ['아파트/주택 담보 대출', '전세 자금 대출', '부동산 투자 상담'],
          ctaText: '상담 신청',
          ctaLink: '/apply',
        },
      },
    ];

    this.changeLog = [];
  }

  async execute(input) {
    const { action, sections, sectionCode, visible, adminId } = input;

    switch (action) {
      case 'getSections':
        return this._getSections();
      case 'reorder':
        return this._reorder(sections, adminId);
      case 'toggle':
        return this._toggle(sectionCode, visible, adminId);
      case 'validate':
        return this._validate();
      case 'getTemplate':
        return this._getTemplate(sectionCode);
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  _getSections() {
    const sorted = [...this.defaultSections].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      status: 'success',
      sections: sorted,
      visibleCount: sorted.filter(s => s.isVisible).length,
      totalCount: sorted.length,
    };
  }

  _reorder(newOrder, adminId) {
    if (!newOrder || !Array.isArray(newOrder)) {
      return { status: 'error', message: '새로운 순서 배열이 필요합니다.' };
    }

    const before = this.defaultSections.map(s => ({ code: s.code, sortOrder: s.sortOrder }));

    newOrder.forEach((code, index) => {
      const section = this.defaultSections.find(s => s.code === code);
      if (section) {
        section.sortOrder = index + 1;
      }
    });

    const after = this.defaultSections.map(s => ({ code: s.code, sortOrder: s.sortOrder }));

    this.changeLog.push({
      type: 'reorder',
      adminId: adminId || 'unknown',
      timestamp: new Date().toISOString(),
      before,
      after,
    });

    return {
      status: 'success',
      message: '섹션 순서가 변경되었습니다.',
      sections: this._getSections().sections,
      changeLog: this.changeLog[this.changeLog.length - 1],
    };
  }

  _toggle(sectionCode, visible, adminId) {
    const section = this.defaultSections.find(s => s.code === sectionCode);
    if (!section) {
      return { status: 'error', message: `섹션을 찾을 수 없습니다: ${sectionCode}` };
    }

    // 보호 섹션 OFF 방지
    if (section.isProtected && visible === false) {
      return {
        status: 'blocked',
        message: `"${section.title}" 섹션은 법적 필수 고지가 포함되어 있어 비활성화할 수 없습니다.`,
        sectionCode,
        isProtected: true,
      };
    }

    const before = { code: section.code, isVisible: section.isVisible };
    section.isVisible = visible;
    const after = { code: section.code, isVisible: section.isVisible };

    this.changeLog.push({
      type: 'toggle',
      adminId: adminId || 'unknown',
      timestamp: new Date().toISOString(),
      before,
      after,
    });

    return {
      status: 'success',
      message: `"${section.title}" 섹션이 ${visible ? '활성화' : '비활성화'}되었습니다.`,
      section: { code: section.code, title: section.title, isVisible: section.isVisible },
      changeLog: this.changeLog[this.changeLog.length - 1],
    };
  }

  _validate() {
    const issues = [];
    const visibleSections = this.defaultSections.filter(s => s.isVisible);

    if (visibleSections.length === 0) {
      issues.push({ severity: 'critical', message: '최소 1개 이상의 섹션이 노출되어야 합니다.' });
    }

    // 보호 섹션이 OFF인지 확인
    this.defaultSections.forEach(s => {
      if (s.isProtected && !s.isVisible) {
        issues.push({ severity: 'critical', message: `보호 섹션 "${s.title}"이 비활성화되어 있습니다.` });
      }
    });

    // 순서 중복 확인
    const orders = this.defaultSections.map(s => s.sortOrder);
    const duplicates = orders.filter((v, i, arr) => arr.indexOf(v) !== i);
    if (duplicates.length > 0) {
      issues.push({ severity: 'warning', message: `순서 번호가 중복됩니다: ${duplicates.join(', ')}` });
    }

    return {
      status: issues.length === 0 ? 'pass' : 'fail',
      issues,
      canPublish: issues.filter(i => i.severity === 'critical').length === 0,
    };
  }

  _getTemplate(sectionCode) {
    const section = this.defaultSections.find(s => s.code === sectionCode);
    if (!section) {
      return { status: 'error', message: `섹션을 찾을 수 없습니다: ${sectionCode}` };
    }
    return { status: 'success', section };
  }
}

module.exports = SectionManagerTool;

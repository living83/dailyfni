const Tool = require('../core/Tool');

/**
 * 법적 고지 문구 생성/관리 도구
 *
 * 역할:
 * 1. 공통 법적 고지 문구 생성
 * 2. 영역별(개인회생/오토론/신용대출/부동산) 추가 고지 문구 생성
 * 3. 고지 문구 버전 관리
 * 4. 고지 문구 포함 여부 검증
 */
class LegalNoticeTool extends Tool {
  constructor() {
    super({
      name: 'legal_notice',
      description: '대부중개법에 맞는 법적 고지 문구를 생성하고, 페이지별 고지 포함 여부를 검증합니다.',
      parameters: {
        action: { type: 'string', description: '실행 액션 (generate, validate, getTemplate)', default: 'generate' },
        areaCode: { type: 'string', description: '영역 코드', default: 'common' },
        companyInfo: { type: 'object', description: '회사 정보 (이름, 등록번호, 대표자 등)', default: {} },
        pageContent: { type: 'string', description: '검증할 페이지 콘텐츠', default: '' },
      },
    });

    // 공통 필수 고지 템플릿
    this.commonTemplate = {
      sections: [
        {
          id: 'company_info',
          label: '업체 정보',
          template: '상호: {companyName} | 대표: {ceoName} | 사업자등록번호: {businessNumber} | 대부중개업 등록번호: {registrationNumber}',
          required: true,
        },
        {
          id: 'fee_disclosure',
          label: '수수료 안내',
          template: '대부중개수수료: 대출금액의 0% (고객 부담 없음, 금융사로부터 수수료 수령)',
          required: true,
        },
        {
          id: 'interest_cap',
          label: '이자율 상한 안내',
          template: '이자율은 연 20% 이내이며, 개인 신용도 및 대출 조건에 따라 달라질 수 있습니다.',
          required: true,
        },
        {
          id: 'debt_warning',
          label: '과도한 빚 경고',
          template: '과도한 빚은 당신에게 큰 불행을 안겨줄 수 있습니다.',
          required: true,
        },
        {
          id: 'credit_warning',
          label: '신용등급 경고',
          template: '대출 시 귀하의 신용등급 또는 개인신용평점이 하락할 수 있습니다.',
          required: true,
        },
        {
          id: 'individual_diff',
          label: '개인별 상이 안내',
          template: '금리, 한도 등 대출조건은 개인별 심사 결과에 따라 상이합니다.',
          required: true,
        },
      ],
    };

    // 영역별 추가 고지 템플릿
    this.areaTemplates = {
      rehabilitation: {
        label: '개인회생·파산',
        sections: [
          {
            id: 'rehab_notice',
            label: '개인회생 안내',
            template: '개인회생·파산 절차는 법원의 결정에 따라 진행되며, 대부중개업체가 법적 절차를 직접 수행하지 않습니다. 법률 상담이 필요한 경우 변호사 또는 법률 전문가에게 문의하시기 바랍니다.',
            required: true,
          },
          {
            id: 'rehab_disclaimer',
            label: '면책 안내',
            template: '본 서비스는 개인회생·파산 관련 대출 중개 서비스이며, 개인회생·파산 신청 대행 서비스가 아닙니다.',
            required: true,
          },
        ],
      },
      auto: {
        label: '오토론·자동차 대출',
        sections: [
          {
            id: 'auto_collateral',
            label: '자동차 담보 안내',
            template: '자동차 담보 대출 시 차량에 대한 근저당 또는 저당권이 설정될 수 있습니다. 상환 불이행 시 담보물(차량)이 처분될 수 있습니다.',
            required: true,
          },
        ],
      },
      credit: {
        label: '신용대출',
        sections: [
          {
            id: 'credit_rate_range',
            label: '금리 범위 안내',
            template: '신용대출 금리는 개인 신용등급에 따라 연 {minRate}% ~ 연 {maxRate}% 범위에서 적용됩니다.',
            required: true,
          },
        ],
      },
      realestate: {
        label: '부동산 대출',
        sections: [
          {
            id: 'realestate_collateral',
            label: '부동산 담보 안내',
            template: '부동산 담보 대출 시 해당 부동산에 근저당권이 설정됩니다. 상환 불이행 시 담보물(부동산)이 경매 처분될 수 있습니다.',
            required: true,
          },
          {
            id: 'ltv_notice',
            label: 'LTV 안내',
            template: '대출 한도는 담보물 감정가 대비 LTV(담보인정비율)에 따라 결정되며, 정부 규제에 따라 변경될 수 있습니다.',
            required: true,
          },
        ],
      },
    };
  }

  async execute(input) {
    const { action = 'generate', areaCode = 'common', companyInfo = {}, pageContent = '' } = input;

    switch (action) {
      case 'generate':
        return this._generateNotice(areaCode, companyInfo);
      case 'validate':
        return this._validatePage(pageContent, areaCode);
      case 'getTemplate':
        return this._getTemplate(areaCode);
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  _generateNotice(areaCode, companyInfo) {
    const commonSections = this.commonTemplate.sections.map(section => {
      let text = section.template;
      // 회사 정보 치환
      Object.entries(companyInfo).forEach(([key, value]) => {
        text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value || `[${key} 입력 필요]`);
      });
      // 미치환 플레이스홀더 경고
      const missingFields = text.match(/\{(\w+)\}/g) || [];
      return {
        ...section,
        text,
        missingFields: missingFields.map(f => f.replace(/[{}]/g, '')),
        isComplete: missingFields.length === 0,
      };
    });

    const areaSections = [];
    if (areaCode !== 'common' && this.areaTemplates[areaCode]) {
      const template = this.areaTemplates[areaCode];
      template.sections.forEach(section => {
        let text = section.template;
        Object.entries(companyInfo).forEach(([key, value]) => {
          text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value || `[${key} 입력 필요]`);
        });
        const missingFields = text.match(/\{(\w+)\}/g) || [];
        areaSections.push({
          ...section,
          text,
          missingFields: missingFields.map(f => f.replace(/[{}]/g, '')),
          isComplete: missingFields.length === 0,
        });
      });
    }

    const allSections = [...commonSections, ...areaSections];
    const fullNotice = allSections.map(s => s.text).join('\n');
    const isComplete = allSections.every(s => s.isComplete);

    return {
      status: 'success',
      areaCode,
      areaLabel: areaCode === 'common' ? '공통' : (this.areaTemplates[areaCode]?.label || areaCode),
      commonSections,
      areaSections,
      fullNotice,
      isComplete,
      missingFields: allSections.flatMap(s => s.missingFields),
    };
  }

  _validatePage(pageContent, areaCode) {
    if (!pageContent) {
      return { status: 'error', message: '검증할 페이지 콘텐츠가 없습니다.' };
    }

    const requiredSections = [...this.commonTemplate.sections];
    if (areaCode !== 'common' && this.areaTemplates[areaCode]) {
      requiredSections.push(...this.areaTemplates[areaCode].sections);
    }

    const results = requiredSections.map(section => {
      // 핵심 키워드로 포함 여부 확인
      const keywords = section.template
        .replace(/\{[^}]+\}/g, '')
        .split(/[,.|()]/)
        .map(k => k.trim())
        .filter(k => k.length > 3);

      const foundKeywords = keywords.filter(kw => pageContent.includes(kw));
      const isPresent = foundKeywords.length >= Math.ceil(keywords.length * 0.5);

      return {
        id: section.id,
        label: section.label,
        required: section.required,
        isPresent,
        foundKeywords,
        totalKeywords: keywords.length,
        coverage: keywords.length > 0 ? Math.round((foundKeywords.length / keywords.length) * 100) : 0,
      };
    });

    const missingRequired = results.filter(r => r.required && !r.isPresent);
    const allRequiredPresent = missingRequired.length === 0;

    return {
      status: 'success',
      areaCode,
      totalSections: results.length,
      presentSections: results.filter(r => r.isPresent).length,
      missingRequired,
      allRequiredPresent,
      canPublish: allRequiredPresent,
      details: results,
    };
  }

  _getTemplate(areaCode) {
    const result = {
      common: this.commonTemplate,
    };

    if (areaCode !== 'common' && this.areaTemplates[areaCode]) {
      result.area = {
        code: areaCode,
        label: this.areaTemplates[areaCode].label,
        ...this.areaTemplates[areaCode],
      };
    } else if (areaCode === 'all') {
      result.areas = this.areaTemplates;
    }

    return { status: 'success', templates: result };
  }
}

module.exports = LegalNoticeTool;

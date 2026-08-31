const Tool = require('../core/Tool');

/**
 * 대부중개법 광고 규정 준수 검사 도구
 *
 * 검사 항목:
 * 1. 필수 고지사항 포함 여부 (등록번호, 중개수수료, 이자율, 경고문구 등)
 * 2. 금지 표현 탐지 (확정/과장: 무조건, 100%, 확정, 즉시승인 등)
 * 3. 공공기관/법원/금융기관 오인 소지 문구 탐지
 * 4. 허위/과장 광고 요소 탐지
 */
class LegalCheckTool extends Tool {
  constructor() {
    super({
      name: 'legal_check',
      description: '대부중개법 광고 규정 준수 여부를 검사하고, 위반 항목을 리포트합니다.',
      parameters: {
        content: { type: 'string', description: '검사할 텍스트 콘텐츠' },
        contentType: { type: 'string', description: '콘텐츠 유형 (page, banner, landing, notice)', default: 'page' },
        areaCode: { type: 'string', description: '영역 코드 (rehabilitation, auto, credit, realestate)', default: null },
      },
    });

    // 필수 고지사항 체크리스트
    this.requiredNotices = [
      { id: 'reg_number', label: '대부중개업 등록번호', patterns: ['등록번호', '대부중개업 등록'] },
      { id: 'fee_info', label: '중개수수료 안내', patterns: ['중개수수료', '수수료'] },
      { id: 'interest_rate', label: '이자율 안내', patterns: ['이자율', '금리', '연 20%'] },
      { id: 'warning_debt', label: '과도한 빚 경고문구', patterns: ['과도한 빚', '불행'] },
      { id: 'credit_warning', label: '신용등급 하락 경고', patterns: ['신용등급', '신용평점', '하락'] },
      { id: 'individual_diff', label: '개인별 상이 안내', patterns: ['개인별 상이', '심사 결과에 따라', '개인별로 다를'] },
    ];

    // 금지 표현 목록
    this.prohibitedExpressions = [
      { pattern: '무조건', severity: 'critical', reason: '확정적 표현 (대부업법 위반)' },
      { pattern: '100%', severity: 'critical', reason: '확정적 표현 (대부업법 위반)' },
      { pattern: '확정', severity: 'critical', reason: '확정적 표현 (대부업법 위반)' },
      { pattern: '즉시 승인', severity: 'critical', reason: '확정적 표현 (대부업법 위반)' },
      { pattern: '무심사', severity: 'critical', reason: '허위 광고 (대부업법 위반)' },
      { pattern: '당일 지급', severity: 'warning', reason: '과장 소지 (조건부 가능 시 조건 명시 필요)' },
      { pattern: '누구나 가능', severity: 'critical', reason: '허위 광고 (심사 조건 존재)' },
      { pattern: '최저 금리', severity: 'warning', reason: '비교 광고 시 근거 필요' },
      { pattern: '정부 지원', severity: 'critical', reason: '공공기관 오인 소지' },
      { pattern: '법원 공식', severity: 'critical', reason: '공공기관 오인 소지' },
      { pattern: '은행 금리', severity: 'warning', reason: '금융기관 오인 소지' },
      { pattern: '국가 보증', severity: 'critical', reason: '공공기관 오인 소지' },
      { pattern: '공무원 전용', severity: 'critical', reason: '특정 직군 대상 오인' },
      { pattern: '서민금융', severity: 'warning', reason: '정부 기관 사업명 오인 소지 (사용 시 주의)' },
    ];

    // 공공기관/법원/금융기관 오인 키워드
    this.institutionKeywords = [
      '법원', '검찰', '경찰', '국세청', '금융위원회', '금융감독원',
      '정부', '공공기관', '관공서', '은행', '저축은행',
    ];
  }

  async execute(input) {
    const { content, contentType = 'page', areaCode = null } = input;

    if (!content || content.trim().length === 0) {
      return {
        status: 'error',
        message: '검사할 콘텐츠가 비어있습니다.',
      };
    }

    const results = {
      contentType,
      areaCode,
      timestamp: new Date().toISOString(),
      requiredNotices: this._checkRequiredNotices(content),
      prohibitedExpressions: this._checkProhibitedExpressions(content),
      institutionMisuse: this._checkInstitutionMisuse(content),
      overallScore: 0,
      verdict: 'fail', // pass, warning, fail
      violations: [],
      warnings: [],
      recommendations: [],
    };

    // 필수 고지사항 누락 → violation
    results.requiredNotices.missing.forEach(item => {
      results.violations.push({
        type: 'missing_notice',
        severity: 'critical',
        message: `필수 고지사항 누락: ${item.label}`,
        recommendation: `"${item.label}" 관련 문구를 추가하세요.`,
      });
    });

    // 금지 표현 발견
    results.prohibitedExpressions.found.forEach(item => {
      if (item.severity === 'critical') {
        results.violations.push({
          type: 'prohibited_expression',
          severity: 'critical',
          message: `금지 표현 발견: "${item.pattern}" - ${item.reason}`,
          recommendation: `"${item.pattern}" 표현을 삭제하거나 조건부 표현으로 수정하세요.`,
        });
      } else {
        results.warnings.push({
          type: 'prohibited_expression',
          severity: 'warning',
          message: `주의 표현 발견: "${item.pattern}" - ${item.reason}`,
          recommendation: `"${item.pattern}" 사용 시 근거나 조건을 함께 명시하세요.`,
        });
      }
    });

    // 기관 오인 소지
    results.institutionMisuse.found.forEach(item => {
      results.warnings.push({
        type: 'institution_misuse',
        severity: 'warning',
        message: `공공기관/금융기관 오인 소지: "${item}" 키워드 사용`,
        recommendation: `"${item}" 키워드가 대부중개업체를 공공기관/금융기관으로 오인하게 하지 않는지 확인하세요.`,
      });
    });

    // 점수 계산
    const totalChecks = this.requiredNotices.length + results.prohibitedExpressions.checked;
    const passedChecks = results.requiredNotices.found.length + (results.prohibitedExpressions.checked - results.prohibitedExpressions.found.length);
    results.overallScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    // 판정
    if (results.violations.length > 0) {
      results.verdict = 'fail';
    } else if (results.warnings.length > 0) {
      results.verdict = 'warning';
    } else {
      results.verdict = 'pass';
    }

    // 개선 권고
    if (results.verdict !== 'pass') {
      results.recommendations.push('모든 필수 고지사항을 페이지 하단에 명확히 기재하세요.');
      results.recommendations.push('확정/과장 표현 대신 "개인별 상이", "심사 결과에 따라" 등 조건부 표현을 사용하세요.');
    }

    return results;
  }

  _checkRequiredNotices(content) {
    const found = [];
    const missing = [];

    this.requiredNotices.forEach(notice => {
      const isFound = notice.patterns.some(pattern =>
        content.includes(pattern)
      );
      if (isFound) {
        found.push(notice);
      } else {
        missing.push(notice);
      }
    });

    return { found, missing, total: this.requiredNotices.length };
  }

  _checkProhibitedExpressions(content) {
    const found = [];
    let checked = 0;

    this.prohibitedExpressions.forEach(expr => {
      checked++;
      if (content.includes(expr.pattern)) {
        found.push(expr);
      }
    });

    return { found, checked };
  }

  _checkInstitutionMisuse(content) {
    const found = [];

    this.institutionKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        found.push(keyword);
      }
    });

    return { found };
  }
}

module.exports = LegalCheckTool;

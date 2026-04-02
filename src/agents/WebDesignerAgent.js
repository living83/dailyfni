const Agent = require('../core/Agent');
const WebDesignTool = require('../tools/WebDesignTool');
const ImageGuidelineTool = require('../tools/ImageGuidelineTool');

/**
 * 웹 디자이너 에이전트 (Web Designer Agent) — 15년차
 *
 * 대부중개 홈페이지의 UI/UX 디자인을 전담합니다.
 *
 * 핵심 역할:
 * 1. 디자인 시스템 관리 (컬러, 타이포, 스페이싱, 컴포넌트 토큰)
 * 2. 페이지별 레이아웃 설계 (와이어프레임 수준)
 * 3. 반응형 디자인 가이드 (모바일 퍼스트)
 * 4. 접근성(A11y) 기준 검증
 * 5. 전환율 최적화(CRO) 디자인 가이드
 * 6. 이미지 슬롯 기준 및 크롭 가이드
 *
 * 전문성:
 * - 금융/대부중개 업종 특화 (신뢰감, 전문성, 투명성 강조)
 * - 네이비/딥블루 톤 기반 저채도 디자인
 * - 점진적 폼 UX 최적화 (이탈률 최소화)
 * - 법적 고지 가시성 보장
 *
 * 파이프라인:
 * 요청 → 디자인 시스템 참조 → 레이아웃 설계 → 반응형 적용 → 접근성 검증 → CRO 최적화
 */
class WebDesignerAgent extends Agent {
  constructor(options = {}) {
    const webDesignTool = new WebDesignTool();
    const imageGuidelineTool = new ImageGuidelineTool();

    super({
      name: options.name || '웹 디자이너 에이전트',
      role: options.role || '15년차 시니어 웹 디자이너',
      goal: options.goal || '대부중개 홈페이지의 전문적이고 신뢰감 있는 디자인을 설계하고, 반응형/접근성/전환율 최적화를 관리합니다.',
      backstory: options.backstory || '금융업 웹디자인 15년차 시니어. 대형 금융사·대부중개사 홈페이지 50+ 프로젝트 수행. 모바일 퍼스트 반응형 설계, WCAG 2.1 접근성, 전환율 최적화(CRO) 전문. 네이비/딥블루 톤의 신뢰감 있는 디자인과 점진적 폼 UX로 업계 최고 전환율을 기록. 법적 고지 가시성과 사용성을 동시에 만족시키는 설계 철학을 보유.',
      tools: [webDesignTool, imageGuidelineTool],
      model: options.model || 'default',
    });

    this.webDesignTool = webDesignTool;
    this.imageGuidelineTool = imageGuidelineTool;
  }

  async execute(task) {
    this.addMemory({ type: 'design_start', task: task.description });

    const context = task.context || {};
    const { action = 'fullDesignGuide', pageType = 'main', device = 'all' } = context;

    try {
      switch (action) {
        case 'fullDesignGuide':
          return await this._fullDesignGuide(task, pageType, device);

        case 'getDesignSystem':
          return await this._getDesignSystem(task);

        case 'getLayout':
          return await this._getLayout(task, pageType, device);

        case 'getResponsive':
          return await this._getResponsive(task, pageType);

        case 'checkA11y':
          return await this._checkA11y(task, pageType);

        case 'getCROGuide':
          return await this._getCROGuide(task, pageType);

        case 'getImageGuide':
          return await this._getImageGuide(task);

        case 'reviewDesign':
          return await this._reviewDesign(task, context);

        default:
          return this._result(task, 'failed', { error: `알 수 없는 액션: ${action}` });
      }
    } catch (error) {
      this.addMemory({ type: 'design_error', error: error.message });
      return this._result(task, 'failed', { error: error.message });
    }
  }

  /**
   * 전체 디자인 가이드 (한 번에 모든 정보 제공)
   */
  async _fullDesignGuide(task, pageType, device) {
    const phases = [];

    // 1. 디자인 시스템
    const designSystem = await this.webDesignTool.execute({ action: 'getDesignSystem' });
    phases.push({ phase: '디자인 시스템', result: designSystem });

    // 2. 레이아웃
    const layout = await this.webDesignTool.execute({ action: 'getLayout', pageType, device });
    phases.push({ phase: '레이아웃', result: layout });

    // 3. 반응형
    const responsive = await this.webDesignTool.execute({ action: 'getResponsive', pageType });
    phases.push({ phase: '반응형 가이드', result: responsive });

    // 4. 접근성
    const a11y = await this.webDesignTool.execute({ action: 'checkA11y', pageType });
    phases.push({ phase: '접근성', result: a11y });

    // 5. CRO
    const cro = await this.webDesignTool.execute({ action: 'getCROGuide', pageType });
    phases.push({ phase: '전환율 최적화', result: cro });

    // 6. 이미지 가이드
    const imageGuide = await this.imageGuidelineTool.execute({ action: 'getGuideline' });
    phases.push({ phase: '이미지 가이드', result: imageGuide });

    this.addMemory({ type: 'design_guide_complete', pageType });

    return this._result(task, 'completed', {
      action: 'fullDesignGuide',
      pageType,
      device,
      phases,
      summary: {
        designPrinciples: designSystem.principles,
        sectionCount: layout.layout?.sections?.length || 0,
        breakpoints: responsive.breakpoints,
        a11yChecks: a11y.checks?.length || 0,
        croTips: cro.guide?.principles?.length || 0,
      },
    });
  }

  async _getDesignSystem(task) {
    const result = await this.webDesignTool.execute({ action: 'getDesignSystem' });
    return this._result(task, 'completed', { action: 'getDesignSystem', result });
  }

  async _getLayout(task, pageType, device) {
    const result = await this.webDesignTool.execute({ action: 'getLayout', pageType, device });
    return this._result(task, 'completed', { action: 'getLayout', result });
  }

  async _getResponsive(task, pageType) {
    const result = await this.webDesignTool.execute({ action: 'getResponsive', pageType });
    return this._result(task, 'completed', { action: 'getResponsive', result });
  }

  async _checkA11y(task, pageType) {
    const result = await this.webDesignTool.execute({ action: 'checkA11y', pageType });
    return this._result(task, 'completed', { action: 'checkA11y', result });
  }

  async _getCROGuide(task, pageType) {
    const result = await this.webDesignTool.execute({ action: 'getCROGuide', pageType });
    return this._result(task, 'completed', { action: 'getCROGuide', result });
  }

  async _getImageGuide(task) {
    const result = await this.imageGuidelineTool.execute({ action: 'getGuideline' });
    return this._result(task, 'completed', { action: 'getImageGuide', result });
  }

  /**
   * 디자인 리뷰 (15년차 경험 기반 종합 피드백)
   */
  async _reviewDesign(task, context) {
    const { pageType = 'main', designDescription = '' } = context;
    const phases = [];

    // 1. 레이아웃 기준 대조
    const layoutSpec = await this.webDesignTool.execute({ action: 'getLayout', pageType });
    phases.push({ phase: '레이아웃 기준 대조', result: layoutSpec });

    // 2. CRO 기준 대조
    const croGuide = await this.webDesignTool.execute({ action: 'getCROGuide', pageType });
    phases.push({ phase: 'CRO 기준 대조', result: croGuide });

    // 3. 접근성 체크
    const a11y = await this.webDesignTool.execute({ action: 'checkA11y', pageType });
    phases.push({ phase: '접근성 체크', result: a11y });

    // 4. 이미지 가이드라인
    const imageGuide = await this.imageGuidelineTool.execute({ action: 'getGuideline' });
    phases.push({ phase: '이미지 가이드라인', result: imageGuide });

    // 종합 피드백
    const feedback = {
      overall: '15년차 시니어 디자이너 관점에서의 종합 리뷰',
      mustFix: [
        '모든 인터랙티브 요소의 최소 터치 타겟 44x44px 확보',
        '법적 고지 문구 가시성 확보 (최소 12px, 배경 대비 4.5:1 이상)',
        '모바일에서 CTA 버튼 하단 고정 (sticky) 적용',
      ],
      recommendations: [
        '1순위 섹션(개인회생)에 가장 넓은 면적과 시각적 강조 부여',
        '동의 체크 미완료 시 빨간 테두리 + 흔들림 애니메이션 적용',
        '프로그레스 바로 신청 단계 시각화',
        '네이비 → 화이트 그라데이션으로 신뢰감 연출',
      ],
      colorCheck: '네이비/딥블루/그레이/화이트 톤 유지 여부 확인 필요',
    };

    return this._result(task, 'completed', {
      action: 'reviewDesign',
      pageType,
      phases,
      feedback,
    });
  }

  _result(task, status, output) {
    return {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status,
      output,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = WebDesignerAgent;

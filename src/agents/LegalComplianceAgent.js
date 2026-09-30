const Agent = require('../core/Agent');
const LegalCheckTool = require('../tools/LegalCheckTool');
const LegalNoticeTool = require('../tools/LegalNoticeTool');

/**
 * 법적 규정 준수 에이전트 (Legal Compliance Agent)
 *
 * 대부중개법 광고 규정 준수를 전담합니다.
 *
 * 핵심 역할:
 * 1. 홈페이지 콘텐츠의 법적 규정 준수 여부 검사
 * 2. 법적 고지 문구 생성 및 관리
 * 3. 금지 표현/허위 광고 탐지
 * 4. 페이지 게시 전 법적 검증 게이트
 *
 * 파이프라인:
 * 콘텐츠 입력 → 필수 고지 확인 → 금지 표현 탐지 → 기관 오인 확인 → 판정 & 리포트
 */
class LegalComplianceAgent extends Agent {
  constructor(options = {}) {
    const legalCheckTool = new LegalCheckTool();
    const legalNoticeTool = new LegalNoticeTool();

    super({
      name: options.name || '법적 규정 준수 에이전트',
      role: options.role || '대부중개법 광고 규정 전문가',
      goal: options.goal || '홈페이지의 모든 콘텐츠가 대부중개법 광고 규정을 완벽히 준수하도록 검증하고, 법적 고지 문구를 관리합니다.',
      backstory: options.backstory || '대부중개법 및 대부업법 관련 규제에 정통한 전문가. 금융감독원 광고 심의 기준에 따라 콘텐츠를 검사하며, 허위/과장 광고를 원천 차단합니다.',
      tools: [legalCheckTool, legalNoticeTool],
      model: options.model || 'default',
    });

    this.legalCheckTool = legalCheckTool;
    this.legalNoticeTool = legalNoticeTool;
  }

  /**
   * 전체 법적 검증 파이프라인
   *
   * @param {Object} task - 태스크 객체
   *   task.context.content - 검사할 콘텐츠
   *   task.context.contentType - 콘텐츠 유형
   *   task.context.areaCode - 영역 코드
   *   task.context.companyInfo - 회사 정보
   */
  async execute(task) {
    this.addMemory({ type: 'legal_check_start', task: task.description });

    const context = task.context || {};
    const {
      content = '',
      contentType = 'page',
      areaCode = null,
      companyInfo = {},
      action = 'fullCheck',
    } = context;

    const phases = [];

    try {
      if (action === 'fullCheck' || action === 'check') {
        // Phase 1: 법적 규정 검사
        const checkResult = await this.legalCheckTool.execute({
          content,
          contentType,
          areaCode,
        });
        phases.push({ phase: '법적 규정 검사', result: checkResult });

        // Phase 2: 법적 고지 문구 검증
        const noticeValidation = await this.legalNoticeTool.execute({
          action: 'validate',
          areaCode: areaCode || 'common',
          pageContent: content,
        });
        phases.push({ phase: '고지 문구 검증', result: noticeValidation });

        // 종합 판정
        const canPublish = checkResult.verdict !== 'fail' && noticeValidation.canPublish;

        const result = {
          agentId: this.id,
          agentName: this.name,
          taskId: task.id,
          status: 'completed',
          output: {
            action: 'fullCheck',
            canPublish,
            overallVerdict: checkResult.verdict,
            checkResult,
            noticeValidation,
            phases,
            summary: this._generateSummary(checkResult, noticeValidation),
          },
          timestamp: new Date().toISOString(),
        };

        this.addMemory({ type: 'legal_check_complete', verdict: checkResult.verdict });
        return result;
      }

      if (action === 'generateNotice') {
        // 고지 문구 생성
        const noticeResult = await this.legalNoticeTool.execute({
          action: 'generate',
          areaCode: areaCode || 'common',
          companyInfo,
        });
        phases.push({ phase: '고지 문구 생성', result: noticeResult });

        return {
          agentId: this.id,
          agentName: this.name,
          taskId: task.id,
          status: 'completed',
          output: {
            action: 'generateNotice',
            noticeResult,
            phases,
          },
          timestamp: new Date().toISOString(),
        };
      }

      if (action === 'getTemplate') {
        const templateResult = await this.legalNoticeTool.execute({
          action: 'getTemplate',
          areaCode: areaCode || 'all',
        });

        return {
          agentId: this.id,
          agentName: this.name,
          taskId: task.id,
          status: 'completed',
          output: {
            action: 'getTemplate',
            templateResult,
          },
          timestamp: new Date().toISOString(),
        };
      }

      return {
        agentId: this.id,
        agentName: this.name,
        taskId: task.id,
        status: 'failed',
        output: { error: `알 수 없는 액션: ${action}` },
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.addMemory({ type: 'legal_check_error', error: error.message });
      return {
        agentId: this.id,
        agentName: this.name,
        taskId: task.id,
        status: 'failed',
        output: { error: error.message, phases },
        timestamp: new Date().toISOString(),
      };
    }
  }

  _generateSummary(checkResult, noticeValidation) {
    const issues = [];

    if (checkResult.violations?.length > 0) {
      issues.push(`법규 위반 ${checkResult.violations.length}건 발견`);
    }
    if (checkResult.warnings?.length > 0) {
      issues.push(`주의 사항 ${checkResult.warnings.length}건`);
    }
    if (noticeValidation.missingRequired?.length > 0) {
      issues.push(`필수 고지 누락 ${noticeValidation.missingRequired.length}건`);
    }

    return {
      totalIssues: issues.length,
      issues,
      recommendation: issues.length > 0
        ? '게시 전 위 사항을 모두 수정해 주세요.'
        : '법적 검증을 통과했습니다. 게시 가능합니다.',
    };
  }
}

module.exports = LegalComplianceAgent;

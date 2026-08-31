const Agent = require('../core/Agent');
const SectionManagerTool = require('../tools/SectionManagerTool');
const LegalNoticeTool = require('../tools/LegalNoticeTool');

/**
 * 콘텐츠 관리 에이전트 (Content Manager Agent)
 *
 * 메인 섹션, 랜딩 페이지 콘텐츠, 법적 고지 문구를 관리합니다.
 *
 * 핵심 역할:
 * 1. 메인 섹션 노출 순서/ON-OFF 관리
 * 2. 법적 필수 고지 섹션 보호
 * 3. 랜딩 페이지 게시 전 필수 정보 검증
 * 4. 변경 이력 기록 및 승인 관리
 *
 * 파이프라인:
 * 변경 요청 → 보호 정책 확인 → 변경 적용 → 검증 → 이력 기록
 */
class ContentManagerAgent extends Agent {
  constructor(options = {}) {
    const sectionManagerTool = new SectionManagerTool();
    const legalNoticeTool = new LegalNoticeTool();

    super({
      name: options.name || '콘텐츠 관리 에이전트',
      role: options.role || '홈페이지 콘텐츠 관리자',
      goal: options.goal || '메인 섹션과 랜딩 페이지의 콘텐츠를 관리하고, 법적 필수 고지 누락 없이 게시할 수 있도록 검증합니다.',
      backstory: options.backstory || '대부중개 홈페이지 콘텐츠 기획 전문가. 우선순위 기반 노출 전략과 법적 규정 준수를 동시에 관리하며, 변경 이력을 투명하게 관리합니다.',
      tools: [sectionManagerTool, legalNoticeTool],
      model: options.model || 'default',
    });

    this.sectionManagerTool = sectionManagerTool;
    this.legalNoticeTool = legalNoticeTool;
  }

  async execute(task) {
    this.addMemory({ type: 'content_manage_start', task: task.description });

    const context = task.context || {};
    const {
      action = 'getSections',
      sectionCode,
      sections,
      visible,
      adminId,
      areaCode,
      companyInfo,
    } = context;

    try {
      switch (action) {
        case 'getSections':
          return await this._getSections(task);

        case 'reorder':
          return await this._reorder(task, sections, adminId);

        case 'toggle':
          return await this._toggle(task, sectionCode, visible, adminId);

        case 'validateForPublish':
          return await this._validateForPublish(task, areaCode, context.pageContent);

        case 'generateNotice':
          return await this._generateNotice(task, areaCode, companyInfo);

        default:
          return this._result(task, 'failed', { error: `알 수 없는 액션: ${action}` });
      }
    } catch (error) {
      this.addMemory({ type: 'content_manage_error', error: error.message });
      return this._result(task, 'failed', { error: error.message });
    }
  }

  async _getSections(task) {
    const result = await this.sectionManagerTool.execute({ action: 'getSections' });
    return this._result(task, 'completed', { action: 'getSections', result });
  }

  async _reorder(task, sections, adminId) {
    // 변경 전 검증
    const validation = await this.sectionManagerTool.execute({ action: 'validate' });

    const result = await this.sectionManagerTool.execute({
      action: 'reorder',
      sections,
      adminId,
    });

    // 변경 후 재검증
    const postValidation = await this.sectionManagerTool.execute({ action: 'validate' });

    return this._result(task, 'completed', {
      action: 'reorder',
      result,
      preValidation: validation,
      postValidation: postValidation,
    });
  }

  async _toggle(task, sectionCode, visible, adminId) {
    const result = await this.sectionManagerTool.execute({
      action: 'toggle',
      sectionCode,
      visible,
      adminId,
    });

    return this._result(task, result.status === 'blocked' ? 'completed' : 'completed', {
      action: 'toggle',
      result,
      blocked: result.status === 'blocked',
    });
  }

  async _validateForPublish(task, areaCode, pageContent) {
    const noticeValidation = await this.legalNoticeTool.execute({
      action: 'validate',
      areaCode: areaCode || 'common',
      pageContent: pageContent || '',
    });

    const sectionValidation = await this.sectionManagerTool.execute({ action: 'validate' });

    const canPublish = noticeValidation.canPublish && sectionValidation.canPublish;

    return this._result(task, 'completed', {
      action: 'validateForPublish',
      canPublish,
      noticeValidation,
      sectionValidation,
    });
  }

  async _generateNotice(task, areaCode, companyInfo) {
    const result = await this.legalNoticeTool.execute({
      action: 'generate',
      areaCode: areaCode || 'common',
      companyInfo: companyInfo || {},
    });

    return this._result(task, 'completed', { action: 'generateNotice', result });
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

module.exports = ContentManagerAgent;

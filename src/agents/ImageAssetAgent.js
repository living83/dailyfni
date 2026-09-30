const Agent = require('../core/Agent');
const ImageGuidelineTool = require('../tools/ImageGuidelineTool');

/**
 * 이미지 자산 관리 에이전트 (Image Asset Agent)
 *
 * AI 이미지 생성 가이드, 브랜드 톤앤매너 검수, 워크플로우를 관리합니다.
 *
 * 핵심 역할:
 * 1. AI 이미지 생성 프롬프트 가이드 및 금지어 검사
 * 2. 브랜드 톤앤매너 체크리스트 기반 검수
 * 3. 법적 오인 소지 체크리스트 기반 검수
 * 4. 업로드 품질 기준(형식/용량/해상도) 검증
 * 5. 검수 워크플로우 (초안→검수→승인→적용/반려)
 *
 * 파이프라인:
 * 이미지 입력 → 프롬프트/업로드 검증 → 체크리스트 검수 → 승인/반려 → 적용
 */
class ImageAssetAgent extends Agent {
  constructor(options = {}) {
    const imageGuidelineTool = new ImageGuidelineTool();

    super({
      name: options.name || '이미지 자산 관리 에이전트',
      role: options.role || '브랜드 이미지 검수 전문가',
      goal: options.goal || '홈페이지에 사용되는 모든 이미지가 브랜드 신뢰 톤앤매너를 유지하고, 법적 오인 소지가 없도록 검수합니다.',
      backstory: options.backstory || '금융업 브랜드 디자인 검수 경력 10년. 대부중개업 광고 이미지의 법적 리스크를 사전에 차단하며, 전문적이고 신뢰감 있는 비주얼 기준을 관리합니다.',
      tools: [imageGuidelineTool],
      model: options.model || 'default',
    });

    this.imageGuidelineTool = imageGuidelineTool;
  }

  async execute(task) {
    this.addMemory({ type: 'image_asset_start', task: task.description });

    const context = task.context || {};
    const { action = 'getGuideline' } = context;

    try {
      switch (action) {
        case 'getGuideline':
          return await this._getGuideline(task);

        case 'checkPrompt':
          return await this._checkPrompt(task, context.prompt);

        case 'validateUpload':
          return await this._validateUpload(task, context.fileInfo, context.slot);

        case 'runReview':
          return await this._runReview(task, context);

        case 'getChecklist':
          return await this._getChecklist(task);

        default:
          return this._result(task, 'failed', { error: `알 수 없는 액션: ${action}` });
      }
    } catch (error) {
      this.addMemory({ type: 'image_asset_error', error: error.message });
      return this._result(task, 'failed', { error: error.message });
    }
  }

  async _getGuideline(task) {
    const result = await this.imageGuidelineTool.execute({ action: 'getGuideline' });
    return this._result(task, 'completed', { action: 'getGuideline', result });
  }

  async _checkPrompt(task, prompt) {
    const result = await this.imageGuidelineTool.execute({ action: 'checkPrompt', prompt });
    return this._result(task, 'completed', { action: 'checkPrompt', result });
  }

  async _validateUpload(task, fileInfo, slot) {
    const result = await this.imageGuidelineTool.execute({ action: 'validateUpload', fileInfo, slot });
    return this._result(task, 'completed', { action: 'validateUpload', result });
  }

  async _runReview(task, context) {
    const phases = [];

    // Phase 1: 업로드 품질 검증 (파일 정보가 있을 경우)
    if (context.fileInfo) {
      const uploadResult = await this.imageGuidelineTool.execute({
        action: 'validateUpload',
        fileInfo: context.fileInfo,
        slot: context.slot,
      });
      phases.push({ phase: '업로드 품질 검증', result: uploadResult });
    }

    // Phase 2: 프롬프트 금지어 검사 (AI 생성인 경우)
    if (context.prompt) {
      const promptResult = await this.imageGuidelineTool.execute({
        action: 'checkPrompt',
        prompt: context.prompt,
      });
      phases.push({ phase: '프롬프트 금지어 검사', result: promptResult });
    }

    // Phase 3: 체크리스트 기반 검수
    if (context.checklistAnswers) {
      const checklistResult = await this.imageGuidelineTool.execute({
        action: 'runChecklist',
        checklistAnswers: context.checklistAnswers,
      });
      phases.push({ phase: '체크리스트 검수', result: checklistResult });
    }

    // 종합 판정
    const allPassed = phases.every(p => p.result.status !== 'fail');
    const hasWarnings = phases.some(p => p.result.status === 'warning');

    const verdict = allPassed
      ? (hasWarnings ? 'approve_with_notes' : 'approve')
      : 'reject';

    return this._result(task, 'completed', {
      action: 'runReview',
      verdict,
      canApprove: allPassed,
      phases,
    });
  }

  async _getChecklist(task) {
    const result = await this.imageGuidelineTool.execute({ action: 'getChecklist' });
    return this._result(task, 'completed', { action: 'getChecklist', result });
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

module.exports = ImageAssetAgent;

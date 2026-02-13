const Agent = require('../core/Agent');
const NaverBlogPublishTool = require('../tools/NaverBlogPublishTool');
const ScheduleManagerTool = require('../tools/ScheduleManagerTool');
const PostVerifierTool = require('../tools/PostVerifierTool');

/**
 * 퍼블리셔 에이전트 (Blog Publisher)
 *
 * 완성된 블로그 글을 네이버에 실제 발행하는 에이전트:
 * 1. 발행 준비 (HTML 변환, 카테고리/태그 설정, 메타데이터)
 * 2. 발행 실행 (즉시 발행 / 임시저장 / 예약 발행)
 * 3. 발행 후 검증 (접근성, 인덱싱, OG, SEO)
 *
 * 추가 기능:
 * - 최적 발행 시간대 분석
 * - 예약 발행 큐 관리
 * - 발행 간격 최적화 (네이버 저품질 방지)
 */
class PublisherAgent extends Agent {
  constructor(options = {}) {
    const publishTool = new NaverBlogPublishTool();
    const scheduleTool = new ScheduleManagerTool();
    const verifierTool = new PostVerifierTool();

    super({
      name: options.name || '퍼블리셔 에이전트',
      role: options.role || '블로그 발행 관리자',
      goal: options.goal || '완성된 블로그 글을 네이버 블로그에 최적의 시간에 발행하고, 정상 게시 여부를 확인합니다.',
      backstory: options.backstory || '네이버 블로그 발행 자동화, 예약 발행, 인덱싱 관리 전문가. 저품질 방지를 위한 발행 간격 최적화.',
      tools: [publishTool, scheduleTool, verifierTool],
      model: options.model || 'default',
    });

    this.publishTool = publishTool;
    this.scheduleTool = scheduleTool;
    this.verifierTool = verifierTool;
    this.blogId = options.blogId || '';
  }

  /**
   * 전체 발행 파이프라인
   *
   * @param {Object} task
   * @param {Object} task.context
   *   context.title          - 글 제목
   *   context.content        - 본문 (마크다운 또는 HTML)
   *   context.category       - 카테고리
   *   context.tags           - 태그 목록
   *   context.thumbnailUrl   - 대표 이미지 URL
   *   context.publishMode    - 'publish' | 'draft' | 'schedule'
   *   context.scheduledAt    - 예약 발행 시각 (ISO 8601)
   *   context.blogId         - 네이버 블로그 ID
   *   context.skipVerify     - 발행 후 검증 건너뛰기
   */
  async execute(task) {
    this.addMemory({ type: 'publish_start', task: task.description });

    const context = task.context || {};
    const title = context.title || '';
    const content = context.content || '';
    const category = context.category || '';
    const tags = context.tags || [];
    const thumbnailUrl = context.thumbnailUrl || '';
    const publishMode = context.publishMode || 'publish';
    const scheduledAt = context.scheduledAt || null;
    const blogId = context.blogId || this.blogId;
    const skipVerify = context.skipVerify || false;
    const phases = [];

    if (!title || !content) {
      return {
        agentId: this.id,
        agentName: this.name,
        taskId: task.id,
        status: 'failed',
        error: '제목(title)과 본문(content)은 필수입니다.',
        timestamp: new Date().toISOString(),
      };
    }

    // Phase 1: 최적 발행 시간 분석 (예약 발행 모드일 때)
    let scheduleAnalysis = null;
    if (publishMode === 'schedule' && !scheduledAt) {
      try {
        scheduleAnalysis = await this.scheduleTool.execute({
          action: 'analyze',
          keyword: this._extractKeyword(task.description),
          category,
        });
        phases.push({
          phase: '발행 시간 분석',
          status: 'completed',
          topSlot: scheduleAnalysis.top3?.[0]?.displayTime || '분석 완료',
        });
        this.addMemory({ type: 'schedule_analyzed', topSlot: scheduleAnalysis.top3?.[0] });
      } catch (err) {
        phases.push({ phase: '발행 시간 분석', status: 'failed', error: err.message });
      }
    }

    // 예약 시각 결정 (제공되지 않았을 때 최적 시간 자동 설정)
    const finalScheduledAt = scheduledAt || (publishMode === 'schedule' && scheduleAnalysis?.top3?.[0]?.datetime) || null;

    // Phase 2: 발행 실행
    let publishResult = null;
    try {
      publishResult = await this.publishTool.execute({
        title,
        content,
        category,
        tags,
        thumbnailUrl,
        publishMode,
        scheduledAt: finalScheduledAt,
        blogId,
      });

      if (publishResult.status === 'failed') {
        phases.push({
          phase: '발행',
          status: 'failed',
          errors: publishResult.errors,
        });

        return {
          agentId: this.id,
          agentName: this.name,
          taskId: task.id,
          status: 'failed',
          phases,
          publishResult,
          timestamp: new Date().toISOString(),
        };
      }

      phases.push({
        phase: '발행',
        status: 'completed',
        mode: publishMode,
        postId: publishResult.postId,
        blogUrl: publishResult.blogUrl,
      });
      this.addMemory({ type: 'published', mode: publishMode, postId: publishResult.postId });
    } catch (err) {
      phases.push({ phase: '발행', status: 'failed', error: err.message });
      return {
        agentId: this.id,
        agentName: this.name,
        taskId: task.id,
        status: 'failed',
        phases,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
    }

    // Phase 3: 예약 큐 등록 (예약 발행일 때)
    let scheduleResult = null;
    if (publishMode === 'schedule' && publishResult.postId) {
      try {
        scheduleResult = await this.scheduleTool.execute({
          action: 'schedule',
          postId: publishResult.postId,
          scheduledAt: finalScheduledAt,
          keyword: this._extractKeyword(task.description),
          userId: context.userId,
        });
        phases.push({
          phase: '예약 등록',
          status: 'completed',
          scheduleId: scheduleResult.scheduleId,
          scheduledAt: finalScheduledAt,
        });
      } catch (err) {
        phases.push({ phase: '예약 등록', status: 'failed', error: err.message });
      }
    }

    // Phase 4: 발행 후 검증 (즉시 발행이고 skipVerify가 아닐 때)
    let verifyResult = null;
    if (publishMode === 'publish' && !skipVerify && publishResult.blogUrl) {
      try {
        verifyResult = await this.verifierTool.execute({
          postUrl: publishResult.blogUrl,
          postId: publishResult.postId,
          expectedTitle: title,
          expectedTags: tags,
          expectedCategory: category,
        });
        phases.push({
          phase: '발행 검증',
          status: 'completed',
          overallStatus: verifyResult.overallStatus,
          score: verifyResult.summary.score,
        });
        this.addMemory({ type: 'verified', score: verifyResult.summary.score });
      } catch (err) {
        phases.push({ phase: '발행 검증', status: 'failed', error: err.message });
      }
    }

    // 최종 결과 조립
    const result = {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      publishMode,
      phases,
      publish: {
        postId: publishResult.postId,
        blogUrl: publishResult.blogUrl,
        status: publishResult.status,
        htmlPreview: publishResult.htmlPreview,
        metadata: publishResult.metadata,
      },
      schedule: scheduleResult ? {
        scheduleId: scheduleResult.scheduleId,
        scheduledAt: finalScheduledAt,
        displayTime: new Date(finalScheduledAt).toLocaleString('ko-KR'),
      } : null,
      verification: verifyResult ? {
        overallStatus: verifyResult.overallStatus,
        score: verifyResult.summary.score,
        actions: verifyResult.actions,
      } : null,
      timestamp: new Date().toISOString(),
    };

    this.addMemory({
      type: 'publish_complete',
      mode: publishMode,
      postId: publishResult.postId,
      verified: verifyResult?.overallStatus || 'skipped',
    });

    return result;
  }

  // --- 개별 도구 실행 ---

  async publish(options) {
    return this.publishTool.execute(options);
  }

  async analyzeSchedule(keyword, category) {
    return this.scheduleTool.execute({ action: 'analyze', keyword, category });
  }

  async addSchedule(postId, scheduledAt, keyword, userId) {
    return this.scheduleTool.execute({ action: 'schedule', postId, scheduledAt, keyword, userId });
  }

  async cancelSchedule(postId, userId) {
    return this.scheduleTool.execute({ action: 'cancel', postId, userId });
  }

  async listSchedules(userId) {
    return this.scheduleTool.execute({ action: 'list', userId });
  }

  async optimizeSchedule(userId, category) {
    return this.scheduleTool.execute({ action: 'optimize', userId, category });
  }

  async verifyPost(options) {
    return this.verifierTool.execute(options);
  }

  // --- 유틸 ---

  _extractKeyword(description) {
    const match = description.match(/\[(.+?)\]/);
    if (match) return match[1];
    return description
      .replace(/에\s*대해.*$/, '')
      .replace(/(을|를)\s*(발행|게시|퍼블리시).*$/, '')
      .replace(/\s*(발행|게시|퍼블리시).*$/, '')
      .trim() || description;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'PublisherAgent',
      blogId: this.blogId,
      capabilities: [
        '네이버 블로그 즉시 발행 / 임시저장 / 예약 발행',
        '마크다운 → 네이버 블로그 HTML 변환',
        '카테고리/태그 자동 설정',
        '최적 발행 시간대 분석 (요일별, 카테고리별)',
        '예약 발행 큐 관리 및 간격 최적화',
        '발행 후 검증 (접근성, OG 태그, 인덱싱, SEO)',
      ],
    };
  }
}

module.exports = PublisherAgent;

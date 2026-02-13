const Agent = require('../core/Agent');
const SpellCheckTool = require('../tools/SpellCheckTool');
const FactCheckerTool = require('../tools/FactCheckerTool');
const DuplicateCheckerTool = require('../tools/DuplicateCheckerTool');

/**
 * 리뷰어 에이전트 (Quality Checker)
 *
 * 완성된 글을 4단계로 검수:
 * 1. 맞춤법/문법 체크
 * 2. 사실 확인 (가격, 스펙)
 * 3. SEO 가이드라인 준수 (키워드 밀도, 배치)
 * 4. 중복 콘텐츠 체크 (네이버 저품질 방지)
 *
 * 최종 산출물: 품질 검수 리포트 + 발행 승인/보류 판정
 */
class ReviewerAgent extends Agent {
  constructor(options = {}) {
    const spellTool = new SpellCheckTool();
    const factTool = new FactCheckerTool();
    const dupeTool = new DuplicateCheckerTool();

    super({
      name: options.name || '리뷰어 에이전트',
      role: options.role || '품질 검수관',
      goal: options.goal || '완성된 블로그 글의 맞춤법, 사실 정확성, SEO, 중복 콘텐츠를 검수하여 발행 승인 여부를 판정합니다.',
      backstory: options.backstory || '한국어 맞춤법, 네이버 저품질 판정 기준, 팩트체크 전문가. 발행 전 최종 관문.',
      tools: [spellTool, factTool, dupeTool],
      model: options.model || 'default',
    });

    this.spellTool = spellTool;
    this.factTool = factTool;
    this.dupeTool = dupeTool;
  }

  /**
   * 전체 검수 파이프라인
   *
   * @param {Object} task
   * @param {Object} task.context
   *   context.content      - 검수할 본문 텍스트
   *   context.keyword       - 메인 키워드
   *   context.researchData  - 리서치 데이터 (사실 확인용)
   */
  async execute(task) {
    this.addMemory({ type: 'review_start', task: task.description });

    const context = task.context || {};
    const content = context.content || '';
    const keyword = context.keyword || this._extractKeyword(task.description);
    const researchData = context.researchData || {};
    const strictLevel = context.strictLevel || 'standard';
    const phases = [];

    if (!content) {
      return {
        agentId: this.id,
        agentName: this.name,
        taskId: task.id,
        status: 'failed',
        error: '검수할 본문이 없습니다.',
        timestamp: new Date().toISOString(),
      };
    }

    // Phase 1: 맞춤법/문법 체크
    let spellResult = null;
    try {
      spellResult = await this.spellTool.execute({ content, strictLevel });
      phases.push({
        phase: '맞춤법/문법',
        status: 'completed',
        score: spellResult.score,
        grade: spellResult.grade,
        errors: spellResult.summary.totalErrors,
      });
      this.addMemory({ type: 'spell_complete', score: spellResult.score });
    } catch (err) {
      phases.push({ phase: '맞춤법/문법', status: 'failed', error: err.message });
    }

    // Phase 2: 사실 확인
    let factResult = null;
    try {
      factResult = await this.factTool.execute({ content, researchData, keyword });
      phases.push({
        phase: '사실 확인',
        status: 'completed',
        score: factResult.score,
        grade: factResult.grade,
        checked: factResult.summary.totalChecked,
        warnings: factResult.summary.warnings,
      });
      this.addMemory({ type: 'fact_complete', score: factResult.score });
    } catch (err) {
      phases.push({ phase: '사실 확인', status: 'failed', error: err.message });
    }

    // Phase 3: 중복/원본성 체크
    let dupeResult = null;
    try {
      dupeResult = await this.dupeTool.execute({ content, keyword });
      phases.push({
        phase: '중복/원본성',
        status: 'completed',
        score: dupeResult.originalityScore.score,
        grade: dupeResult.originalityScore.grade,
        risk: dupeResult.riskAssessment.label,
      });
      this.addMemory({ type: 'dupe_complete', score: dupeResult.originalityScore.score });
    } catch (err) {
      phases.push({ phase: '중복/원본성', status: 'failed', error: err.message });
    }

    // Phase 4: 종합 검수 리포트
    const report = this._buildReport(keyword, content, spellResult, factResult, dupeResult);

    const result = {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      keyword,
      phases,
      report,
      rawData: {
        spell: spellResult,
        fact: factResult,
        duplicate: dupeResult,
      },
      timestamp: new Date().toISOString(),
    };

    this.addMemory({ type: 'review_complete', keyword, verdict: report.verdict.decision });
    return result;
  }

  // --- 개별 도구 실행 ---

  async checkSpelling(content, options = {}) {
    return this.spellTool.execute({ content, ...options });
  }

  async checkFacts(content, options = {}) {
    return this.factTool.execute({ content, ...options });
  }

  async checkDuplicate(content, options = {}) {
    return this.dupeTool.execute({ content, ...options });
  }

  // --- 종합 검수 리포트 ---

  _buildReport(keyword, content, spell, fact, dupe) {
    const scores = {};
    const issues = [];
    const fixes = [];

    // 점수 수집
    if (spell) {
      scores.spelling = { score: spell.score, grade: spell.grade, weight: 0.25 };
      spell.spelling.forEach(e => {
        fixes.push({ area: '맞춤법', priority: 'high', action: `"${e.found}" → "${e.suggestion}" (${e.rule})` });
      });
      spell.spacing.forEach(e => {
        fixes.push({ area: '띄어쓰기', priority: 'medium', action: `"${e.found}" → "${e.suggestion}"` });
      });
      spell.lowQuality.forEach(w => {
        issues.push({ area: '저품질 표현', severity: w.risk, message: w.reason });
      });
    }

    if (fact) {
      scores.factCheck = { score: fact.score, grade: fact.grade, weight: 0.25 };
      fact.priceCheck.items.filter(i => i.status !== 'pass').forEach(i => {
        fixes.push({ area: '가격 정보', priority: 'high', action: `${i.price.toLocaleString()}원 → 최신 가격 확인 필요 (${i.message})` });
      });
      fact.linkCheck.items.filter(i => i.status === 'fail').forEach(i => {
        issues.push({ area: '링크', severity: 'high', message: i.message });
      });
    }

    if (dupe) {
      scores.originality = { score: dupe.originalityScore.score, grade: dupe.originalityScore.grade, weight: 0.3 };
      scores.seoCompliance = {
        score: dupe.keywordStuffing.status === 'pass' ? 90 : dupe.keywordStuffing.status === 'warning' ? 65 : 30,
        grade: dupe.keywordStuffing.status === 'pass' ? 'A' : dupe.keywordStuffing.status === 'warning' ? 'C' : 'D',
        weight: 0.2,
      };

      dupe.keywordStuffing.issues?.forEach(i => {
        fixes.push({ area: 'SEO', priority: i.severity, action: i.action || i.detail });
      });
      dupe.riskAssessment.risks.forEach(r => {
        issues.push({ area: r.area, severity: r.level, message: r.message });
      });
    }

    // 종합 점수 계산
    const weightedScores = Object.values(scores);
    const totalWeight = weightedScores.reduce((s, v) => s + v.weight, 0) || 1;
    const overallScore = Math.round(
      weightedScores.reduce((s, v) => s + v.score * v.weight, 0) / totalWeight
    );

    // 발행 판정
    const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
    const verdict = this._makeVerdict(overallScore, criticalIssues, dupe?.riskAssessment);

    return {
      title: `[검수 리포트] ${keyword}`,
      overallScore,
      overallGrade: overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 55 ? 'C' : 'D',
      scores,
      verdict,
      issues: {
        critical: issues.filter(i => i.severity === 'critical'),
        high: issues.filter(i => i.severity === 'high'),
        medium: issues.filter(i => i.severity === 'medium'),
        low: issues.filter(i => i.severity === 'low'),
        total: issues.length,
      },
      fixes: {
        required: fixes.filter(f => f.priority === 'high'),
        recommended: fixes.filter(f => f.priority === 'medium'),
        optional: fixes.filter(f => f.priority === 'low'),
        total: fixes.length,
      },
      contentStats: {
        charCount: content.replace(/\s/g, '').length,
        toneConsistency: spell?.toneConsistency || null,
      },
    };
  }

  _makeVerdict(score, criticalIssues, riskAssessment) {
    // 발행 불가 조건
    if (criticalIssues.length > 0) {
      return {
        decision: 'reject',
        label: '발행 보류',
        emoji: '🚫',
        reason: `치명적 이슈 ${criticalIssues.length}건 발견. 수정 후 재검수가 필요합니다.`,
        blockers: criticalIssues.map(i => i.message),
      };
    }

    if (riskAssessment && !riskAssessment.publishable) {
      return {
        decision: 'reject',
        label: '발행 보류',
        emoji: '🚫',
        reason: `네이버 저품질 위험: ${riskAssessment.label}`,
        blockers: riskAssessment.risks.map(r => r.message),
      };
    }

    // 조건부 승인
    if (score < 70) {
      return {
        decision: 'revise',
        label: '수정 후 발행',
        emoji: '⚠️',
        reason: `품질 점수 ${score}점. 필수 수정 사항을 반영한 후 발행하세요.`,
      };
    }

    // 승인
    if (score >= 85) {
      return {
        decision: 'approve',
        label: '발행 승인',
        emoji: '✅',
        reason: `품질 점수 ${score}점. 우수한 콘텐츠입니다. 바로 발행해도 좋습니다.`,
      };
    }

    return {
      decision: 'approve_with_notes',
      label: '조건부 승인',
      emoji: '✅',
      reason: `품질 점수 ${score}점. 발행 가능하나, 권장 수정 사항을 확인하세요.`,
    };
  }

  _extractKeyword(description) {
    const match = description.match(/\[(.+?)\]/);
    if (match) return match[1];
    return description
      .replace(/에\s*대해.*$/, '')
      .replace(/(을|를)\s*(검수|체크|확인).*$/, '')
      .replace(/\s*(검수|체크|리뷰|확인).*$/, '')
      .trim() || description;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'ReviewerAgent',
      capabilities: [
        '맞춤법/띄어쓰기/문법 오류 검출 & 교정안',
        '가격/스펙/순위 사실 확인 (리서치 데이터 대조)',
        'SEO 키워드 밀도/배치 준수 검증',
        '중복 콘텐츠/저품질 위험도 평가 (D.I.A. 시뮬레이션)',
        '발행 승인/보류/수정 판정',
      ],
    };
  }
}

module.exports = ReviewerAgent;

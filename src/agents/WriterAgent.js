const Agent = require('../core/Agent');
const ContentTemplateTool = require('../tools/ContentTemplateTool');
const AffiliateLinkTool = require('../tools/AffiliateLinkTool');
const ToneStylerTool = require('../tools/ToneStylerTool');

/**
 * 라이터 에이전트 (Content Writer)
 *
 * 리서치 결과 + SEO 키워드를 받아서 네이버 블로그 글 작성
 *
 * 핵심 역할:
 * 1. 6단 구성 본문 생성 (도입/상품소개/스펙비교/장단점/구매링크/마무리)
 * 2. 네이버 블로그 톤앤매너 유지 (친근 + 정보성)
 * 3. 어필리에이트 링크 삽입 & 수익화
 * 4. SEO + 가독성 최종 점검
 *
 * 파이프라인:
 * 리서치 데이터 → 본문 생성 → 어필리에이트 삽입 → 톤/SEO 점검 → 발행 준비 완료
 */
class WriterAgent extends Agent {
  constructor(options = {}) {
    const contentTool = new ContentTemplateTool();
    const affiliateTool = new AffiliateLinkTool();
    const toneTool = new ToneStylerTool();

    super({
      name: options.name || '라이터 에이전트',
      role: options.role || '콘텐츠 라이터',
      goal: options.goal || '리서치/SEO 데이터를 기반으로 네이버 블로그에 최적화된 수익형 글을 작성합니다.',
      backstory: options.backstory || '네이버 블로그 상위 노출 전문 라이터. 친근한 톤으로 정보성 글을 작성하며, 어필리에이트 전환율 최적화 경험 보유.',
      tools: [contentTool, affiliateTool, toneTool],
      model: options.model || 'default',
    });

    this.contentTool = contentTool;
    this.affiliateTool = affiliateTool;
    this.toneTool = toneTool;
  }

  /**
   * 전체 글 작성 파이프라인
   *
   * @param {Object} task - 태스크 객체
   * @param {Object} task.context - 컨텍스트 (리서치/SEO 데이터)
   *   task.context.researchData - 리서치 에이전트 결과
   *   task.context.seoData      - SEO 에이전트 결과
   */
  async execute(task) {
    this.addMemory({ type: 'write_start', task: task.description });

    const keyword = this._extractKeyword(task.description);
    const context = task.context || {};
    const researchData = context.researchData || {};
    const seoData = context.seoData || {};
    const phases = [];

    // 리서치 데이터에서 상품 정보 추출
    const products = this._extractProducts(researchData);

    // Phase 1: 6단 구성 본문 생성
    let contentResult = null;
    try {
      contentResult = await this.contentTool.execute({
        keyword,
        products,
        seoData,
        style: this._detectStyle(task.description),
        tone: context.tone || 'friendly',
      });
      phases.push({
        phase: '본문 생성',
        status: 'completed',
        charCount: contentResult.meta.charCount,
        sections: contentResult.meta.sectionCount,
      });
      this.addMemory({ type: 'content_complete', charCount: contentResult.meta.charCount });
    } catch (err) {
      phases.push({ phase: '본문 생성', status: 'failed', error: err.message });
    }

    // Phase 2: 어필리에이트 링크 삽입
    let affiliateResult = null;
    try {
      affiliateResult = await this.affiliateTool.execute({
        products,
        platform: context.platform || 'coupang',
        partnerId: context.partnerId || 'dailyfni',
        content: contentResult?.fullText || '',
      });
      phases.push({
        phase: '어필리에이트 삽입',
        status: 'completed',
        linkCount: affiliateResult.links.length,
      });
      this.addMemory({ type: 'affiliate_complete', linkCount: affiliateResult.links.length });
    } catch (err) {
      phases.push({ phase: '어필리에이트 삽입', status: 'failed', error: err.message });
    }

    // Phase 3: 톤앤매너 & SEO 최종 점검
    let styleResult = null;
    const finalContent = affiliateResult?.processedContent || contentResult?.fullText || '';
    try {
      styleResult = await this.toneTool.execute({
        content: finalContent,
        keyword,
        targetLength: 2000,
      });
      phases.push({
        phase: '톤/SEO 점검',
        status: 'completed',
        readabilityGrade: styleResult.readability.grade,
        seoScore: styleResult.seoCheck.score,
      });
      this.addMemory({
        type: 'style_check_complete',
        readability: styleResult.readability.score,
        seo: styleResult.seoCheck.score,
      });
    } catch (err) {
      phases.push({ phase: '톤/SEO 점검', status: 'failed', error: err.message });
    }

    // Phase 4: 최종 글 조립
    const article = this._assembleArticle(keyword, contentResult, affiliateResult, styleResult);

    const result = {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      keyword,
      phases,
      article,
      qualityReport: this._buildQualityReport(contentResult, affiliateResult, styleResult),
      rawData: {
        content: contentResult,
        affiliate: affiliateResult,
        style: styleResult,
      },
      timestamp: new Date().toISOString(),
    };

    this.addMemory({ type: 'write_complete', keyword });
    return result;
  }

  // --- 개별 도구 실행 ---

  async generateContent(keyword, options = {}) {
    return this.contentTool.execute({ keyword, ...options });
  }

  async insertAffiliateLinks(products, options = {}) {
    return this.affiliateTool.execute({ products, ...options });
  }

  async checkStyle(content, keyword, options = {}) {
    return this.toneTool.execute({ content, keyword, ...options });
  }

  // --- 최종 글 조립 ---

  _assembleArticle(keyword, contentResult, affiliateResult, styleResult) {
    const article = {
      title: `${keyword} 추천 & 비교 | 실사용 후기 정리 (${new Date().getFullYear()})`,
      keyword,
      body: affiliateResult?.processedContent || contentResult?.fullText || '',
      sections: contentResult?.sections?.map(s => ({
        id: s.id,
        title: s.title,
        heading: s.heading,
        imageSlots: s.imageSlots,
        imageGuide: s.imageGuide,
      })) || [],
      meta: {
        charCount: contentResult?.meta?.charCount || 0,
        keywordCount: contentResult?.meta?.keywordCount || 0,
        keywordDensity: contentResult?.meta?.keywordDensity || '0%',
        estimatedReadTime: contentResult?.meta?.estimatedReadTime || '0분',
        totalImageSlots: contentResult?.meta?.imageSlots || 0,
      },
      affiliate: {
        links: affiliateResult?.links?.map(l => ({
          product: l.productTitle,
          url: l.affiliateUrl,
          button: l.htmlButton.text,
        })) || [],
        disclosure: affiliateResult?.disclosure || null,
        revenueEstimate: affiliateResult?.analysis?.revenueScenarios?.[1] || null,
      },
      publishReady: this._isPublishReady(styleResult),
    };

    // 어필리에이트 고지 문구 추가
    if (affiliateResult?.disclosure?.full) {
      article.body += `\n\n---\n${affiliateResult.disclosure.full}`;
    }

    return article;
  }

  _isPublishReady(styleResult) {
    if (!styleResult) return { ready: false, reason: '스타일 점검 미완료' };

    const criticalFails = styleResult.publishChecklist
      .filter(c => c.critical && !c.pass);

    if (criticalFails.length === 0) {
      return { ready: true, message: '발행 준비 완료!' };
    }

    return {
      ready: false,
      blockers: criticalFails.map(c => `${c.item}: ${c.detail}`),
    };
  }

  // --- 품질 리포트 ---

  _buildQualityReport(contentResult, affiliateResult, styleResult) {
    const report = {
      overall: 'N/A',
      scores: {},
      checklist: [],
      improvements: [],
    };

    if (contentResult) {
      report.scores.content = {
        charCount: contentResult.meta.charCount,
        sectionCount: contentResult.meta.sectionCount,
        tone: contentResult.tone,
      };
    }

    if (affiliateResult) {
      report.scores.monetization = {
        linkCount: affiliateResult.links.length,
        platform: affiliateResult.platform,
        hasDisclosure: !!affiliateResult.disclosure,
      };
    }

    if (styleResult) {
      report.scores.readability = {
        score: styleResult.readability.score,
        grade: styleResult.readability.grade,
        mobileOptimized: styleResult.readability.mobileOptimized,
      };
      report.scores.seo = {
        score: styleResult.seoCheck.score,
        keywordDensity: styleResult.seoCheck.keywordDensity,
        distribution: styleResult.seoCheck.distribution,
      };
      report.scores.tone = styleResult.toneAnalysis;
      report.checklist = styleResult.publishChecklist;
      report.improvements = styleResult.improvements;

      // 종합 점수
      const avgScore = Math.round(
        (styleResult.readability.score + styleResult.seoCheck.score) / 2
      );
      report.overall = avgScore >= 80 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'D';
    }

    return report;
  }

  // --- 유틸 ---

  _extractProducts(researchData) {
    // 리서치 에이전트 결과에서 상품 데이터 추출
    if (researchData.rawData?.crawl?.results) {
      const results = researchData.rawData.crawl.results;
      const allProducts = Object.values(results).flat();
      return allProducts.slice(0, 5);
    }
    if (researchData.results) {
      return Object.values(researchData.results).flat().slice(0, 5);
    }
    return [];
  }

  _extractKeyword(description) {
    const match = description.match(/\[(.+?)\]/);
    if (match) return match[1];
    return description
      .replace(/에\s*대해.*$/, '')
      .replace(/(을|를)\s*(작성|쓰기|글).*$/, '')
      .replace(/\s*(글|작성|포스팅|블로그).*$/, '')
      .trim() || description;
  }

  _detectStyle(description) {
    if (/비교|vs/i.test(description)) return 'comparison';
    if (/가이드|방법|선택/i.test(description)) return 'guide';
    if (/순위|BEST|TOP|리스트/i.test(description)) return 'list';
    return 'review';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'WriterAgent',
      capabilities: [
        '6단 구성 블로그 글 생성 (도입/소개/스펙/장단점/추천/마무리)',
        '네이버 블로그 톤앤매너 최적화 (친근/전문/캐주얼)',
        '어필리에이트 링크 자동 삽입 & 수익 분석',
        'SEO + 가독성 최종 품질 점검',
        '리서치/SEO 에이전트 결과 자동 연동',
      ],
    };
  }
}

module.exports = WriterAgent;

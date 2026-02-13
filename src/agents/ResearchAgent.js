const Agent = require('../core/Agent');
const ProductCrawlerTool = require('../tools/ProductCrawlerTool');
const BlogAnalyzerTool = require('../tools/BlogAnalyzerTool');
const ReviewSummarizerTool = require('../tools/ReviewSummarizerTool');

/**
 * 리서치 에이전트
 *
 * 4가지 핵심 역할:
 * 1. 상품 정보 수집 (가격, 스펙, 장단점)
 * 2. 쿠팡/네이버 쇼핑 상품 데이터 크롤링
 * 3. 경쟁 블로그 글 분석 (상위 노출 키워드)
 * 4. 리뷰 요약 (실사용자 후기 핵심 정리)
 *
 * 최종 산출물: 상품 리서치 리포트
 */
class ResearchAgent extends Agent {
  constructor(options = {}) {
    const crawler = new ProductCrawlerTool();
    const blogAnalyzer = new BlogAnalyzerTool();
    const reviewSummarizer = new ReviewSummarizerTool();

    super({
      name: options.name || '리서치 에이전트',
      role: options.role || '리서처',
      goal: options.goal || '상품 정보를 수집·분석하여 종합 리서치 리포트를 생성합니다.',
      backstory: options.backstory || '쿠팡/네이버 쇼핑 데이터 분석, SEO 키워드 분석, 리뷰 감성 분석 전문가',
      tools: [crawler, blogAnalyzer, reviewSummarizer],
      model: options.model || 'default',
    });

    this.crawler = crawler;
    this.blogAnalyzer = blogAnalyzer;
    this.reviewSummarizer = reviewSummarizer;
  }

  /**
   * 전체 리서치 파이프라인 실행
   * 1. 상품 크롤링 → 2. 블로그 분석 → 3. 리뷰 요약 → 4. 리포트 생성
   */
  async execute(task) {
    this.addMemory({ type: 'research_start', task: task.description });

    const keyword = this._extractKeyword(task.description);
    const phases = [];

    // Phase 1: 상품 크롤링
    let crawlResult = null;
    try {
      crawlResult = await this.crawler.execute({
        query: keyword,
        sources: ['coupang', 'naver'],
        maxResults: 5,
      });
      phases.push({ phase: '상품 크롤링', status: 'completed', itemsFound: crawlResult.totalFound });
      this.addMemory({ type: 'crawl_complete', keyword, totalFound: crawlResult.totalFound });
    } catch (err) {
      phases.push({ phase: '상품 크롤링', status: 'failed', error: err.message });
    }

    // Phase 2: 블로그 분석
    let blogResult = null;
    try {
      blogResult = await this.blogAnalyzer.execute({
        keyword,
        platform: 'naver',
        topN: 10,
      });
      phases.push({ phase: '블로그 분석', status: 'completed', postsAnalyzed: blogResult.analyzedPosts });
      this.addMemory({ type: 'blog_analysis_complete', keyword, postsAnalyzed: blogResult.analyzedPosts });
    } catch (err) {
      phases.push({ phase: '블로그 분석', status: 'failed', error: err.message });
    }

    // Phase 3: 리뷰 요약
    let reviewResult = null;
    try {
      reviewResult = await this.reviewSummarizer.execute({
        productName: keyword,
        source: 'all',
        maxReviews: 100,
      });
      phases.push({ phase: '리뷰 요약', status: 'completed', reviewsAnalyzed: reviewResult.totalReviews });
      this.addMemory({ type: 'review_summary_complete', keyword, reviewsAnalyzed: reviewResult.totalReviews });
    } catch (err) {
      phases.push({ phase: '리뷰 요약', status: 'failed', error: err.message });
    }

    // Phase 4: 종합 리포트 생성
    const report = this._buildReport(keyword, crawlResult, blogResult, reviewResult);

    const result = {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      keyword,
      phases,
      report,
      rawData: {
        crawl: crawlResult,
        blog: blogResult,
        review: reviewResult,
      },
      timestamp: new Date().toISOString(),
    };

    this.addMemory({ type: 'research_complete', keyword });
    return result;
  }

  /**
   * 개별 도구 실행 (API에서 단독 호출용)
   */
  async crawlProducts(query, options = {}) {
    return this.crawler.execute({ query, ...options });
  }

  async analyzeBlogs(keyword, options = {}) {
    return this.blogAnalyzer.execute({ keyword, ...options });
  }

  async summarizeReviews(productName, options = {}) {
    return this.reviewSummarizer.execute({ productName, ...options });
  }

  // --- 종합 리포트 빌더 ---

  _buildReport(keyword, crawl, blog, review) {
    const report = {
      title: `[리서치 리포트] ${keyword}`,
      generatedAt: new Date().toISOString(),
      sections: [],
    };

    // 섹션 1: 시장 개요
    if (crawl) {
      report.sections.push({
        title: '시장 개요',
        content: {
          소스별상품수: crawl.totalFound,
          가격대: crawl.analysis.priceAnalysis
            ? `${crawl.analysis.priceAnalysis.lowest.toLocaleString()}원 ~ ${crawl.analysis.priceAnalysis.highest.toLocaleString()}원`
            : 'N/A',
          평균가: crawl.analysis.priceAnalysis
            ? `${crawl.analysis.priceAnalysis.average.toLocaleString()}원`
            : 'N/A',
          평균평점: crawl.analysis.ratingAnalysis?.average || 'N/A',
          추천상품: crawl.analysis.recommendation || 'N/A',
        },
      });

      // 섹션 2: 장단점 요약
      report.sections.push({
        title: '장단점 요약',
        content: {
          주요장점: (crawl.analysis.topPros || []).map(p => p.text),
          주요단점: (crawl.analysis.topCons || []).map(p => p.text),
        },
      });
    }

    // 섹션 3: SEO/키워드 분석
    if (blog) {
      const topKws = blog.keywordAnalysis.relatedKeywords.slice(0, 5);
      report.sections.push({
        title: 'SEO 키워드 분석',
        content: {
          추천제목: blog.keywordAnalysis.suggestedTitle,
          핵심키워드: topKws.map(k => `${k.keyword} (검색량: ${k.volume.toLocaleString()})`),
          롱테일키워드: blog.keywordAnalysis.longTailKeywords.map(k => k.keyword),
          경쟁강도: blog.competition.level,
          진입난이도: blog.competition.entryDifficulty,
        },
      });

      // 섹션 4: 콘텐츠 전략
      report.sections.push({
        title: '콘텐츠 전략',
        content: {
          권장글자수: blog.structureAnalysis.recommendedStructure.targetWordCount,
          권장이미지수: blog.structureAnalysis.recommendedStructure.targetImageCount,
          필수구성: blog.structureAnalysis.recommendedStructure.sections,
          실행전략: blog.strategy.map(s => ({
            영역: s.area,
            액션: s.actions,
          })),
        },
      });
    }

    // 섹션 5: 리뷰 인사이트
    if (review) {
      report.sections.push({
        title: '리뷰 인사이트',
        content: {
          총리뷰수: review.totalReviews,
          감성평가: review.sentiment.verdict,
          긍정비율: review.sentiment.positive.ratio,
          부정비율: review.sentiment.negative.ratio,
          평균별점: review.ratingDistribution.average,
          핵심요약: review.summary.oneLiner,
          강점: review.summary.strengths,
          약점: review.summary.weaknesses,
          구매팁: review.summary.buyerTip,
          인증구매비율: review.summary.verifiedRatio,
        },
      });
    }

    // 섹션 6: 최종 추천
    report.sections.push({
      title: '최종 추천 사항',
      content: {
        글작성방향: `"${keyword}" 관련 비교 리뷰 + 실사용 후기 중심의 콘텐츠 추천`,
        타겟독자: '구매를 고민 중인 소비자',
        차별화포인트: [
          '실제 가격 비교 데이터 포함',
          '실사용자 리뷰 기반 장단점 정리',
          '비교표로 한눈에 보는 스펙 비교',
        ],
      },
    });

    return report;
  }

  _extractKeyword(description) {
    // 태스크 설명에서 대괄호 안의 상품명 추출, 없으면 전체 사용
    const match = description.match(/\[(.+?)\]/);
    if (match) return match[1];

    // "~에 대해", "~을/를" 등 패턴 제거
    return description
      .replace(/에\s*대해.*$/, '')
      .replace(/을\s*(분석|조사|리서치).*$/, '')
      .replace(/를\s*(분석|조사|리서치).*$/, '')
      .replace(/\s*(리서치|분석|조사|수집).*$/, '')
      .trim() || description;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'ResearchAgent',
      capabilities: [
        '상품 정보 크롤링 (쿠팡, 네이버 쇼핑)',
        '경쟁 블로그 SEO 분석',
        '실사용자 리뷰 감성 분석 및 요약',
        '종합 리서치 리포트 생성',
      ],
    };
  }
}

module.exports = ResearchAgent;

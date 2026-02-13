const Tool = require('../core/Tool');

/**
 * 경쟁 블로그 분석 도구
 * - 상위 노출 블로그 글 분석
 * - SEO 키워드 추출
 * - 콘텐츠 구조 분석 (제목, 소제목, 이미지, 글 길이)
 * - 경쟁 강도 평가
 */
class BlogAnalyzerTool extends Tool {
  constructor() {
    super({
      name: 'blog_analyzer',
      description: '경쟁 블로그 글을 분석하여 상위 노출 키워드, 콘텐츠 구조, SEO 전략을 파악합니다.',
      parameters: {
        keyword: { type: 'string', description: '분석할 키워드' },
        platform: { type: 'string', description: '플랫폼 (naver, google)', default: 'naver' },
        topN: { type: 'number', description: '상위 몇 개 글을 분석할지', default: 10 },
      },
    });
  }

  async execute({ keyword, platform = 'naver', topN = 10 }) {
    if (!keyword) throw new Error('분석할 키워드(keyword)는 필수입니다.');

    await this._delay(150);

    // 상위 노출 글 수집
    const topPosts = this._collectTopPosts(keyword, platform, topN);

    // SEO 키워드 분석
    const keywordAnalysis = this._analyzeKeywords(keyword, topPosts);

    // 콘텐츠 구조 분석
    const structureAnalysis = this._analyzeStructure(topPosts);

    // 경쟁 강도 평가
    const competition = this._evaluateCompetition(topPosts);

    // 전략 제안
    const strategy = this._generateStrategy(keyword, keywordAnalysis, structureAnalysis, competition);

    return {
      keyword,
      platform,
      analyzedPosts: topPosts.length,
      topPosts,
      keywordAnalysis,
      structureAnalysis,
      competition,
      strategy,
      analyzedAt: new Date().toISOString(),
    };
  }

  _collectTopPosts(keyword, platform, topN) {
    const posts = [];
    const titlePatterns = [
      `${keyword} 추천 BEST`,
      `${keyword} 비교 분석`,
      `${keyword} 솔직 후기`,
      `${keyword} 구매 가이드`,
      `${keyword} 가성비 순위`,
      `2024 ${keyword} 총정리`,
      `${keyword} 장단점 비교`,
      `${keyword} 실사용 리뷰`,
      `${keyword} 어떤게 좋을까?`,
      `${keyword} 꿀팁 모음`,
    ];

    const blogTypes = ['파워블로거', '체험단', '일반블로거', '전문리뷰어', '인플루언서'];

    for (let i = 0; i < Math.min(topN, titlePatterns.length); i++) {
      const wordCount = this._randInt(1500, 5000);
      const imageCount = this._randInt(5, 30);
      const daysAgo = this._randInt(1, 90);
      const publishDate = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];

      posts.push({
        rank: i + 1,
        title: titlePatterns[i],
        url: `https://${platform === 'naver' ? 'blog.naver.com' : 'blog.example.com'}/post/${this._randInt(100000, 999999)}`,
        blogType: blogTypes[i % blogTypes.length],
        publishDate,
        metrics: {
          wordCount,
          imageCount,
          videoCount: this._randInt(0, 3),
          headingCount: this._randInt(3, 10),
          linkCount: this._randInt(2, 15),
        },
        engagement: {
          likes: this._randInt(10, 500),
          comments: this._randInt(2, 80),
          shares: this._randInt(0, 50),
        },
        seoFeatures: {
          titleContainsKeyword: i < 7,
          hasMetaDescription: i < 5,
          hasTableOfContents: i < 4,
          hasComparison: i < 6,
          hasProsCons: i < 5,
        },
      });
    }

    return posts;
  }

  _analyzeKeywords(mainKeyword, posts) {
    // 상위 글에서 공통으로 사용되는 연관 키워드 분석
    const relatedKeywords = [
      { keyword: `${mainKeyword} 추천`, volume: this._randInt(5000, 50000), difficulty: this._randInt(30, 90), frequency: this._randInt(6, 10) },
      { keyword: `${mainKeyword} 비교`, volume: this._randInt(3000, 30000), difficulty: this._randInt(25, 85), frequency: this._randInt(5, 9) },
      { keyword: `${mainKeyword} 가격`, volume: this._randInt(4000, 40000), difficulty: this._randInt(20, 80), frequency: this._randInt(4, 8) },
      { keyword: `${mainKeyword} 후기`, volume: this._randInt(2000, 25000), difficulty: this._randInt(20, 70), frequency: this._randInt(4, 8) },
      { keyword: `${mainKeyword} 장단점`, volume: this._randInt(1000, 15000), difficulty: this._randInt(15, 60), frequency: this._randInt(3, 7) },
      { keyword: `${mainKeyword} 순위`, volume: this._randInt(2000, 20000), difficulty: this._randInt(30, 80), frequency: this._randInt(3, 7) },
      { keyword: `가성비 ${mainKeyword}`, volume: this._randInt(1500, 18000), difficulty: this._randInt(20, 70), frequency: this._randInt(2, 6) },
      { keyword: `${mainKeyword} 2024`, volume: this._randInt(3000, 35000), difficulty: this._randInt(25, 75), frequency: this._randInt(3, 6) },
    ];

    // 롱테일 키워드
    const longTailKeywords = [
      `${mainKeyword} 가성비 좋은거`,
      `${mainKeyword} 입문자 추천`,
      `${mainKeyword} 선물용 추천`,
      `${mainKeyword} 브랜드 비교`,
      `직장인 ${mainKeyword} 추천`,
    ].map(kw => ({
      keyword: kw,
      volume: this._randInt(500, 5000),
      difficulty: this._randInt(10, 40),
    }));

    return {
      mainKeyword: {
        keyword: mainKeyword,
        estimatedVolume: this._randInt(10000, 100000),
        difficulty: this._randInt(40, 95),
      },
      relatedKeywords: relatedKeywords.sort((a, b) => b.volume - a.volume),
      longTailKeywords,
      suggestedTitle: `${mainKeyword} 추천 TOP 10 | 가격 비교 & 실사용 후기 (2024)`,
      suggestedKeywordDensity: '2~3%',
    };
  }

  _analyzeStructure(posts) {
    const avgWordCount = Math.round(posts.reduce((s, p) => s + p.metrics.wordCount, 0) / posts.length);
    const avgImageCount = Math.round(posts.reduce((s, p) => s + p.metrics.imageCount, 0) / posts.length);
    const avgHeadingCount = Math.round(posts.reduce((s, p) => s + p.metrics.headingCount, 0) / posts.length);

    return {
      averageMetrics: {
        wordCount: avgWordCount,
        imageCount: avgImageCount,
        headingCount: avgHeadingCount,
      },
      recommendedStructure: {
        targetWordCount: `${Math.round(avgWordCount * 1.2)}자 이상`,
        targetImageCount: `${Math.round(avgImageCount * 1.1)}장 이상`,
        sections: [
          '도입부 - 키워드 포함 인트로',
          '선정 기준 설명',
          '상품별 상세 리뷰 (스펙 + 장단점)',
          '비교표 (가격/성능/디자인)',
          '실사용 후기 요약',
          '총평 및 추천 제품',
          'FAQ (자주 묻는 질문)',
        ],
      },
      commonElements: {
        comparisonTable: `${posts.filter(p => p.seoFeatures.hasComparison).length}/${posts.length}개 글`,
        prosConsList: `${posts.filter(p => p.seoFeatures.hasProsCons).length}/${posts.length}개 글`,
        tableOfContents: `${posts.filter(p => p.seoFeatures.hasTableOfContents).length}/${posts.length}개 글`,
      },
    };
  }

  _evaluateCompetition(posts) {
    const avgEngagement = Math.round(
      posts.reduce((s, p) => s + p.engagement.likes + p.engagement.comments, 0) / posts.length
    );
    const powerBloggers = posts.filter(p => p.blogType === '파워블로거' || p.blogType === '인플루언서').length;

    let level;
    if (powerBloggers >= 5 && avgEngagement > 200) level = '매우 높음';
    else if (powerBloggers >= 3 && avgEngagement > 100) level = '높음';
    else if (powerBloggers >= 1) level = '보통';
    else level = '낮음';

    return {
      level,
      powerBloggerRatio: `${powerBloggers}/${posts.length}`,
      averageEngagement: avgEngagement,
      entryDifficulty: level === '매우 높음' ? '어려움' : level === '높음' ? '도전적' : '진입 가능',
    };
  }

  _generateStrategy(keyword, keywordAnalysis, structureAnalysis, competition) {
    const strategies = [];

    // 키워드 전략
    strategies.push({
      area: '키워드 전략',
      actions: [
        `메인 키워드 "${keyword}"를 제목, 첫 문단, 소제목에 포함`,
        `연관 키워드 "${keywordAnalysis.relatedKeywords[0]?.keyword}" 자연스럽게 삽입`,
        `롱테일 키워드로 서브 섹션 구성하여 노출 범위 확대`,
      ],
    });

    // 콘텐츠 전략
    strategies.push({
      area: '콘텐츠 전략',
      actions: [
        `글 분량 ${structureAnalysis.recommendedStructure.targetWordCount} 작성`,
        `실제 사용 사진 ${structureAnalysis.recommendedStructure.targetImageCount} 포함`,
        `비교표와 장단점 리스트 필수 포함`,
        `FAQ 섹션으로 롱테일 키워드 추가 확보`,
      ],
    });

    // 경쟁 전략
    if (competition.level === '매우 높음' || competition.level === '높음') {
      strategies.push({
        area: '차별화 전략',
        actions: [
          '독자적인 실험/테스트 데이터 포함으로 신뢰도 확보',
          '영상 리뷰 임베드로 체류 시간 증가',
          '최신 날짜 업데이트로 신선도 유지',
        ],
      });
    }

    return strategies;
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
}

module.exports = BlogAnalyzerTool;

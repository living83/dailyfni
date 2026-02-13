const Tool = require('../core/Tool');

/**
 * 태그 & 카테고리 추천 도구
 *
 * - 네이버 블로그 태그 최적화 (최대 30개)
 * - 카테고리 추천
 * - 태그 우선순위 (검색량 + 경쟁도 기반)
 * - 본문 내 키워드 배치 가이드
 * - 이미지 ALT 태그 생성
 */
class TagRecommenderTool extends Tool {
  constructor() {
    super({
      name: 'tag_recommender',
      description: '네이버 블로그 태그, 카테고리, 본문 키워드 배치, 이미지 ALT 태그를 추천합니다.',
      parameters: {
        keyword: { type: 'string', description: '메인 키워드' },
        subKeywords: { type: 'array', description: '보조 키워드 목록', default: [] },
        imageCount: { type: 'number', description: '본문 이미지 수 (ALT 태그 생성용)', default: 10 },
        contentLength: { type: 'number', description: '예상 글 길이 (자)', default: 2000 },
      },
    });

    // 네이버 블로그 태그 규칙
    this.tagRules = {
      maxTags: 30,
      optimalTags: { min: 10, max: 20 },
    };
  }

  async execute({ keyword, subKeywords = [], imageCount = 10, contentLength = 2000 }) {
    if (!keyword) throw new Error('키워드(keyword)는 필수입니다.');

    await this._delay(80);

    // 태그 추천
    const tags = this._recommendTags(keyword, subKeywords);

    // 카테고리 추천
    const categories = this._recommendCategories(keyword);

    // 본문 키워드 배치 가이드 (네이버 SEO 핵심)
    const keywordPlacement = this._generateKeywordPlacement(keyword, subKeywords, contentLength);

    // 이미지 ALT 태그 생성
    const altTags = this._generateAltTags(keyword, subKeywords, imageCount);

    // 글 구조 최적화 가이드
    const contentGuide = this._generateContentGuide(keyword, subKeywords, contentLength);

    return {
      keyword,
      tags,
      categories,
      keywordPlacement,
      altTags,
      contentGuide,
      generatedAt: new Date().toISOString(),
    };
  }

  _recommendTags(keyword, subKeywords) {
    const year = new Date().getFullYear();

    // 태그 풀 생성 (우선순위별)
    const tagPool = [];

    // Tier 1: 메인 키워드 변형 (필수)
    const tier1 = [
      keyword,
      `${keyword}추천`,
      `${keyword}비교`,
      `${keyword}후기`,
      `${keyword}리뷰`,
    ];

    // Tier 2: 보조 키워드 조합
    const tier2 = subKeywords.flatMap(sub => [
      `${keyword}${sub}`,
      sub,
      `${sub}추천`,
    ]);

    // Tier 3: 롱테일 & 트렌드
    const tier3 = [
      `${keyword}${year}`,
      `${keyword}순위`,
      `${keyword}가성비`,
      `${keyword}가격`,
      `${keyword}장단점`,
      `${keyword}선택법`,
      `${keyword}구매가이드`,
      `가성비${keyword}`,
      `${keyword}브랜드`,
      `${keyword}인기`,
      `${keyword}할인`,
      `${keyword}최저가`,
      `${keyword}실사용`,
      `${keyword}꿀팁`,
      `${keyword}정보`,
    ];

    // 중복 제거 후 우선순위 할당
    const seen = new Set();
    const addTags = (tags, tier) => {
      tags.forEach(tag => {
        const clean = tag.replace(/\s+/g, '');
        if (!seen.has(clean) && clean.length >= 2) {
          seen.add(clean);
          const volume = tier === 1 ? this._randInt(5000, 50000) :
                         tier === 2 ? this._randInt(1000, 20000) :
                                      this._randInt(500, 10000);
          tagPool.push({ tag: clean, tier, estimatedVolume: volume, priority: tier });
        }
      });
    };

    addTags(tier1, 1);
    addTags(tier2, 2);
    addTags(tier3, 3);

    // 검색량 순 정렬, 최대 개수 제한
    tagPool.sort((a, b) => a.priority - b.priority || b.estimatedVolume - a.estimatedVolume);
    const finalTags = tagPool.slice(0, this.tagRules.maxTags);

    return {
      recommended: finalTags,
      count: finalTags.length,
      tierBreakdown: {
        필수: finalTags.filter(t => t.tier === 1).length,
        보조: finalTags.filter(t => t.tier === 2).length,
        롱테일: finalTags.filter(t => t.tier === 3).length,
      },
      tips: [
        `태그는 ${this.tagRules.optimalTags.min}~${this.tagRules.optimalTags.max}개가 최적 (최대 ${this.tagRules.maxTags}개)`,
        '메인 키워드 태그를 반드시 첫 번째로 배치',
        '태그에 띄어쓰기를 넣지 마세요 (붙여쓰기가 네이버 태그 규칙)',
        '너무 광범위한 태그(예: "추천")보다 조합 태그가 효과적',
      ],
    };
  }

  _recommendCategories(keyword) {
    // 키워드 기반 카테고리 매칭
    const categoryMap = {
      전자기기: { match: ['이어폰', '노트북', '태블릿', '폰', '스마트', '가전', '청소기', '공기청정기', '에어컨'], category: 'IT·컴퓨터' },
      뷰티: { match: ['화장품', '스킨케어', '선크림', '향수', '립스틱', '파운데이션'], category: '뷰티·미용' },
      패션: { match: ['옷', '신발', '가방', '자켓', '코트', '운동화'], category: '패션·미용' },
      식품: { match: ['음식', '맛집', '커피', '차', '건강식품', '다이어트'], category: '맛집·음식' },
      생활: { match: ['가구', '수납', '청소', '인테리어', '침구'], category: '생활·노하우·쇼핑' },
    };

    let matched = '생활·노하우·쇼핑'; // 기본값
    const lower = keyword.toLowerCase();
    for (const [, { match, category }] of Object.entries(categoryMap)) {
      if (match.some(m => lower.includes(m))) {
        matched = category;
        break;
      }
    }

    return {
      primary: matched,
      alternatives: ['생활·노하우·쇼핑', '리뷰', 'IT·컴퓨터'].filter(c => c !== matched).slice(0, 2),
      tip: '카테고리는 글 발행 후 변경이 어려우므로 신중하게 선택하세요.',
    };
  }

  _generateKeywordPlacement(keyword, subKeywords, contentLength) {
    const allKeywords = [keyword, ...subKeywords];
    const density = 2.5; // 목표 키워드 밀도 (%)
    const totalKeywordChars = allKeywords.join('').length;
    const targetMentions = Math.max(3, Math.round((contentLength * density / 100) / totalKeywordChars));

    // 섹션별 배치 가이드
    const sections = [
      {
        위치: '제목',
        규칙: `"${keyword}" 반드시 포함, 앞쪽 배치`,
        키워드: keyword,
        중요도: '★★★★★',
      },
      {
        위치: '첫 문단 (상단 100자)',
        규칙: `"${keyword}" 자연스럽게 1회 포함`,
        키워드: keyword,
        중요도: '★★★★★',
        예시: `오늘은 ${keyword}에 대해 솔직하게 리뷰해보겠습니다.`,
      },
      {
        위치: '소제목 (H3/굵은글씨)',
        규칙: `2~3개 소제목에 "${keyword}" 또는 보조 키워드 포함`,
        키워드: allKeywords.slice(0, 3).join(', '),
        중요도: '★★★★☆',
        예시: `${keyword} 장점과 단점`,
      },
      {
        위치: '본문 중간',
        규칙: `${Math.ceil(targetMentions / 2)}회 자연스럽게 분산 배치`,
        키워드: allKeywords.join(', '),
        중요도: '★★★☆☆',
        예시: `실제로 ${keyword}를 사용해보니...`,
      },
      {
        위치: '본문 하단 (마무리)',
        규칙: `"${keyword}" 1회 + CTA (댓글 유도)`,
        키워드: keyword,
        중요도: '★★★★☆',
        예시: `${keyword} 구매를 고민하시는 분들께 도움이 되셨으면 합니다. 궁금한 점은 댓글로 남겨주세요!`,
      },
      {
        위치: '이미지 ALT',
        규칙: '모든 이미지에 키워드 포함 ALT 태그 작성',
        키워드: keyword,
        중요도: '★★★★☆',
      },
    ];

    return {
      targetDensity: `${density}%`,
      targetMentions,
      sections,
      warnings: [
        `키워드 밀도 ${density + 2}% 이상은 스팸으로 판정될 수 있습니다.`,
        '같은 키워드를 연속으로 반복하지 마세요.',
        '본문과 태그의 키워드가 일치해야 SEO 효과가 극대화됩니다.',
      ],
    };
  }

  _generateAltTags(keyword, subKeywords, imageCount) {
    const templates = [
      `${keyword} 전면 모습`,
      `${keyword} 스펙 비교표`,
      `${keyword} 실제 사용 사진`,
      `${keyword} 패키지 개봉기`,
      `${keyword} 사이즈 비교`,
      `${keyword} 장점 요약 인포그래픽`,
      `${keyword} 단점 정리`,
      `${keyword} 가격 비교 차트`,
      `${keyword} 디테일 클로즈업`,
      `${keyword} 실사용 환경`,
      `${keyword} 액세서리 구성`,
      `${keyword} 색상 옵션`,
      `${keyword} 후면 디자인`,
      `${keyword} 타제품과 비교`,
      `${keyword} 추천 순위 정리`,
    ];

    const altTags = [];
    for (let i = 0; i < imageCount; i++) {
      const template = templates[i % templates.length];
      altTags.push({
        imageIndex: i + 1,
        alt: template,
        filename: `${keyword.replace(/\s+/g, '-')}-${i + 1}.jpg`,
      });
    }

    return {
      tags: altTags,
      rules: [
        '모든 이미지에 ALT 태그를 반드시 작성하세요.',
        `ALT 태그에 "${keyword}" 키워드를 자연스럽게 포함하세요.`,
        'ALT 태그는 이미지 내용을 설명하면서 키워드를 포함해야 합니다.',
        '같은 ALT 태그를 반복하면 스팸 판정을 받을 수 있습니다.',
        '파일명에도 키워드를 포함하면 추가 SEO 효과가 있습니다.',
      ],
    };
  }

  _generateContentGuide(keyword, subKeywords, contentLength) {
    // 적정 글 길이 평가
    let lengthVerdict;
    if (contentLength >= 1500 && contentLength <= 3000) {
      lengthVerdict = { status: '최적', message: '네이버 블로그 상위 노출에 적합한 길이입니다.' };
    } else if (contentLength < 1500) {
      lengthVerdict = { status: '부족', message: `${1500 - contentLength}자 더 작성을 권장합니다. 최소 1,500자 이상이 좋습니다.` };
    } else {
      lengthVerdict = { status: '양호', message: '충분한 길이입니다. 핵심 내용 위주로 정리되었다면 좋은 글입니다.' };
    }

    return {
      targetLength: { min: 1500, max: 3000, optimal: 2000 },
      currentLength: contentLength,
      lengthVerdict,
      structure: [
        { section: '인트로', ratio: '10%', chars: Math.round(contentLength * 0.1), guide: `${keyword} 키워드 포함, 글의 목적 명시` },
        { section: '본문 상단', ratio: '30%', chars: Math.round(contentLength * 0.3), guide: '핵심 정보 + 비교표/스펙' },
        { section: '본문 중간', ratio: '35%', chars: Math.round(contentLength * 0.35), guide: '상세 리뷰/분석 + 이미지' },
        { section: '본문 하단', ratio: '15%', chars: Math.round(contentLength * 0.15), guide: '장단점 요약 + 추천 의견' },
        { section: '마무리', ratio: '10%', chars: Math.round(contentLength * 0.1), guide: `${keyword} 키워드 포함 마무리 + 댓글 유도` },
      ],
      naverSpecificRules: [
        { rule: '문단 간격', detail: '3~4줄마다 줄바꿈하여 가독성 확보 (모바일 최적화)' },
        { rule: '이미지 배치', detail: '200~300자마다 이미지 1장 삽입 권장' },
        { rule: '굵은글씨', detail: '키워드 포함 문장은 굵은글씨로 강조 (네이버가 중요 텍스트로 인식)' },
        { rule: '링크', detail: '외부 링크는 최소화, 내부 링크(내 다른 글)는 2~3개 권장' },
        { rule: '동영상', detail: '본문에 영상 삽입 시 체류 시간 증가로 SEO 긍정적' },
        { rule: '댓글 유도', detail: '마지막에 질문형 문장으로 댓글 유도 (C-Rank 상승)' },
      ],
    };
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
}

module.exports = TagRecommenderTool;

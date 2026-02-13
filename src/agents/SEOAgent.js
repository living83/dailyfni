const Agent = require('../core/Agent');
const NaverTrendTool = require('../tools/NaverTrendTool');
const TitleOptimizerTool = require('../tools/TitleOptimizerTool');
const TagRecommenderTool = require('../tools/TagRecommenderTool');

/**
 * SEO 에이전트 - 네이버 블로그 상위 노출 전문
 *
 * 핵심 역할:
 * 1. 네이버 검색 트렌드 분석 (검색량 높은 키워드 선정)
 * 2. 제목 최적화 (네이버 블로그 상위 노출 공식)
 * 3. 태그/카테고리 추천
 * 4. 네이버 블로그 SEO 규칙 반영:
 *    - 본문 내 키워드 배치 (상단, 중간, 하단)
 *    - 적절한 글 길이 (1,500~3,000자)
 *    - 이미지 ALT 태그
 *
 * 최종 산출물: SEO 최적화 청사진
 */
class SEOAgent extends Agent {
  constructor(options = {}) {
    const trendTool = new NaverTrendTool();
    const titleTool = new TitleOptimizerTool();
    const tagTool = new TagRecommenderTool();

    super({
      name: options.name || 'SEO 에이전트',
      role: options.role || 'SEO 전략가',
      goal: options.goal || '네이버 블로그 상위 노출을 위한 키워드, 제목, 태그, 본문 구조를 최적화합니다.',
      backstory: options.backstory || '네이버 C-Rank, D.I.A. 알고리즘, 검색 트렌드 분석 전문가. 수천 건의 상위 노출 블로그를 분석한 경험 보유.',
      tools: [trendTool, titleTool, tagTool],
      model: options.model || 'default',
    });

    this.trendTool = trendTool;
    this.titleTool = titleTool;
    this.tagTool = tagTool;

    // 네이버 블로그 SEO 지식 베이스
    this.seoKnowledge = {
      cRank: {
        name: 'C-Rank (Creator Rank)',
        description: '블로거의 특정 주제에 대한 전문성·신뢰도 점수',
        factors: [
          '주제 일관성 (한 분야에 집중하는 블로그가 유리)',
          '글 발행 빈도 (주 2~3회 이상 꾸준한 발행)',
          '독자 반응 (댓글, 공감, 이웃 추가)',
          '체류 시간 (방문자가 오래 머무를수록 좋음)',
        ],
      },
      dia: {
        name: 'D.I.A. (Deep Intent Analysis)',
        description: '글 자체의 품질과 검색 의도 부합도 평가',
        factors: [
          '글의 완성도 (충분한 텍스트 + 이미지)',
          '검색 의도 충족도 (키워드와 내용 일치)',
          '원본성 (복사/수정 글이 아닌 원본 콘텐츠)',
          '사용자 만족도 (낮은 이탈률, 높은 체류 시간)',
        ],
      },
      contentRules: {
        length: { min: 1500, optimal: 2000, max: 3000, unit: '자' },
        images: { min: 5, optimal: 10, max: 20, rule: '200~300자마다 1장' },
        paragraphs: { rule: '3~4줄마다 줄바꿈, 모바일 가독성 필수' },
        keywords: { density: '2~3%', placement: '상단·중간·하단 고르게 분포' },
        boldText: { rule: '키워드 포함 핵심 문장을 굵은글씨로 강조' },
      },
    };
  }

  /**
   * 전체 SEO 최적화 파이프라인
   * 1. 트렌드 분석 → 2. 제목 최적화 → 3. 태그/키워드 배치 → 4. SEO 청사진 생성
   */
  async execute(task) {
    this.addMemory({ type: 'seo_start', task: task.description });

    const keyword = this._extractKeyword(task.description);
    const style = this._detectStyle(task.description);
    const phases = [];

    // Phase 1: 트렌드 분석
    let trendResult = null;
    try {
      trendResult = await this.trendTool.execute({ keyword, includeRelated: true, months: 6 });
      phases.push({ phase: '트렌드 분석', status: 'completed', searchVolume: trendResult.searchVolume.total });
      this.addMemory({ type: 'trend_complete', keyword, volume: trendResult.searchVolume.total });
    } catch (err) {
      phases.push({ phase: '트렌드 분석', status: 'failed', error: err.message });
    }

    // 트렌드에서 추천 키워드 추출
    const subKeywords = trendResult
      ? trendResult.relatedKeywords
          .filter(k => k.recommended)
          .slice(0, 3)
          .map(k => k.keyword.replace(`${keyword} `, ''))
      : [];

    // Phase 2: 제목 최적화
    let titleResult = null;
    try {
      titleResult = await this.titleTool.execute({ keyword, subKeywords, style, count: 5 });
      phases.push({ phase: '제목 최적화', status: 'completed', bestGrade: titleResult.bestTitle.grade });
      this.addMemory({ type: 'title_complete', bestTitle: titleResult.bestTitle.title });
    } catch (err) {
      phases.push({ phase: '제목 최적화', status: 'failed', error: err.message });
    }

    // Phase 3: 태그/카테고리/키워드 배치
    let tagResult = null;
    try {
      tagResult = await this.tagTool.execute({
        keyword,
        subKeywords,
        imageCount: 10,
        contentLength: 2000,
      });
      phases.push({ phase: '태그/배치 최적화', status: 'completed', tagCount: tagResult.tags.count });
      this.addMemory({ type: 'tag_complete', tagCount: tagResult.tags.count });
    } catch (err) {
      phases.push({ phase: '태그/배치 최적화', status: 'failed', error: err.message });
    }

    // Phase 4: SEO 청사진 생성
    const blueprint = this._buildBlueprint(keyword, trendResult, titleResult, tagResult);

    const result = {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      keyword,
      phases,
      blueprint,
      rawData: { trend: trendResult, title: titleResult, tag: tagResult },
      timestamp: new Date().toISOString(),
    };

    this.addMemory({ type: 'seo_complete', keyword });
    return result;
  }

  // --- 개별 도구 실행 (API 단독 호출) ---

  async analyzeTrend(keyword, options = {}) {
    return this.trendTool.execute({ keyword, ...options });
  }

  async optimizeTitle(keyword, options = {}) {
    return this.titleTool.execute({ keyword, ...options });
  }

  async recommendTags(keyword, options = {}) {
    return this.tagTool.execute({ keyword, ...options });
  }

  // --- SEO 청사진 빌더 ---

  _buildBlueprint(keyword, trend, title, tag) {
    const blueprint = {
      title: `[SEO 청사진] ${keyword}`,
      generatedAt: new Date().toISOString(),
      sections: [],
    };

    // 1. 키워드 전략
    if (trend) {
      const topRecommended = trend.relatedKeywords
        .filter(k => k.recommended)
        .slice(0, 5);

      blueprint.sections.push({
        title: '1. 키워드 전략',
        content: {
          메인키워드: {
            키워드: keyword,
            월간검색량: trend.searchVolume.total.toLocaleString(),
            모바일비율: trend.searchVolume.mobileRatio,
            경쟁도: `${trend.searchVolume.competition.level} (${trend.searchVolume.competition.score}/100)`,
          },
          검색트렌드: {
            방향: trend.trend.summary.direction,
            성장률: trend.trend.summary.growthRate,
            피크: `${trend.trend.summary.peak.month} (${trend.trend.summary.peak.volume.toLocaleString()})`,
          },
          계절성: trend.seasonality,
          추천서브키워드: topRecommended.map(k => ({
            키워드: k.keyword,
            검색량: k.volume.total.toLocaleString(),
            난이도: k.difficulty,
          })),
          블로그노출가능성: trend.blogPotential,
        },
      });
    }

    // 2. 제목 최적화
    if (title) {
      blueprint.sections.push({
        title: '2. 제목 최적화',
        content: {
          추천제목: title.candidates.slice(0, 3).map(c => ({
            제목: c.title,
            점수: `${c.score.total}/100`,
            등급: c.grade,
            길이: `${c.length}자`,
          })),
          제목규칙: {
            최적길이: '30~42자',
            키워드위치: '앞쪽 5글자 이내',
            필수요소: '숫자 + 파워워드 + 구분자',
          },
          피해야할패턴: title.avoid,
          팁: title.tips,
        },
      });
    }

    // 3. 태그 & 카테고리
    if (tag) {
      blueprint.sections.push({
        title: '3. 태그 & 카테고리',
        content: {
          카테고리: tag.categories,
          추천태그: tag.tags.recommended.slice(0, 15).map(t => t.tag),
          태그수: `${tag.tags.count}개`,
          태그구성: tag.tags.tierBreakdown,
          태그팁: tag.tags.tips,
        },
      });
    }

    // 4. 본문 키워드 배치
    if (tag) {
      blueprint.sections.push({
        title: '4. 본문 키워드 배치',
        content: {
          목표키워드밀도: tag.keywordPlacement.targetDensity,
          목표언급횟수: tag.keywordPlacement.targetMentions,
          배치가이드: tag.keywordPlacement.sections,
          주의사항: tag.keywordPlacement.warnings,
        },
      });
    }

    // 5. 이미지 ALT 태그
    if (tag) {
      blueprint.sections.push({
        title: '5. 이미지 ALT 태그',
        content: {
          ALT태그: tag.altTags.tags.slice(0, 10).map(a => ({
            순서: a.imageIndex,
            ALT: a.alt,
            파일명: a.filename,
          })),
          규칙: tag.altTags.rules,
        },
      });
    }

    // 6. 글 구조 가이드
    if (tag) {
      blueprint.sections.push({
        title: '6. 글 구조 가이드',
        content: {
          적정길이: tag.contentGuide.lengthVerdict,
          섹션별구성: tag.contentGuide.structure,
          네이버SEO규칙: tag.contentGuide.naverSpecificRules,
        },
      });
    }

    // 7. C-Rank & D.I.A. 가이드
    blueprint.sections.push({
      title: '7. 네이버 알고리즘 가이드',
      content: {
        cRank: this.seoKnowledge.cRank,
        dia: this.seoKnowledge.dia,
        핵심실행사항: [
          '주제에 맞는 글을 꾸준히 발행 (주 2~3회)',
          '댓글에 성의 있게 답변하여 소통 지수 높이기',
          '이미지 + 영상을 포함한 풍부한 콘텐츠 작성',
          '다른 블로그 글 복사/수정 금지 (원본성 핵심)',
          '체류 시간을 늘리는 흥미로운 도입부 작성',
        ],
      },
    });

    return blueprint;
  }

  _extractKeyword(description) {
    const match = description.match(/\[(.+?)\]/);
    if (match) return match[1];

    return description
      .replace(/에\s*대해.*$/, '')
      .replace(/(을|를)\s*(최적화|분석|SEO).*$/, '')
      .replace(/\s*(SEO|최적화|분석).*$/, '')
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
      type: 'SEOAgent',
      capabilities: [
        '네이버 검색 트렌드 분석 (검색량, 경쟁도, 계절성)',
        '블로그 제목 최적화 (상위 노출 공식)',
        '태그/카테고리 추천',
        '본문 키워드 배치 가이드',
        '이미지 ALT 태그 생성',
        'C-Rank / D.I.A. 알고리즘 최적화',
      ],
      seoKnowledge: {
        algorithms: ['C-Rank', 'D.I.A.'],
        contentRules: this.seoKnowledge.contentRules,
      },
    };
  }
}

module.exports = SEOAgent;

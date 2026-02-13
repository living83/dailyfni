const Tool = require('../core/Tool');

/**
 * 네이버 블로그 콘텐츠 템플릿 & 본문 생성 도구
 *
 * 6단 구성:
 * 1. 도입부 (공감/후킹)
 * 2. 상품 소개
 * 3. 스펙 비교
 * 4. 장단점
 * 5. 구매 링크/추천 이유
 * 6. 마무리
 *
 * 네이버 블로그 톤앤매너: 친근 + 정보성
 */
class ContentTemplateTool extends Tool {
  constructor() {
    super({
      name: 'content_template',
      description: '네이버 블로그 톤앤매너에 맞는 6단 구성 본문을 생성합니다.',
      parameters: {
        keyword: { type: 'string', description: '메인 키워드' },
        products: { type: 'array', description: '리서치에서 받은 상품 데이터 배열' },
        seoData: { type: 'object', description: 'SEO 에이전트에서 받은 키워드/태그 데이터' },
        style: { type: 'string', description: '글 스타일 (review, comparison, guide, list)', default: 'review' },
        tone: { type: 'string', description: '톤 (friendly, expert, casual)', default: 'friendly' },
      },
    });

    // 네이버 블로그 톤앤매너 사전
    this.toneStyles = {
      friendly: {
        name: '친근한 이웃',
        endings: ['~요', '~니다', '~에요', '~답니다'],
        connectors: ['그래서', '그런데', '사실', '솔직히', '참고로', '특히'],
        emoticons: ['😊', '👍', '✅', '💡', '⭐', '📌', '🔍', '💰'],
        openers: [
          '안녕하세요, 여러분!',
          '요즘 많이들 고민하시죠?',
          '혹시 저처럼 고민하신 분 계신가요?',
        ],
      },
      expert: {
        name: '전문 리뷰어',
        endings: ['~합니다', '~입니다', '~습니다'],
        connectors: ['따라서', '결론적으로', '실제로', '객관적으로', '분석 결과'],
        emoticons: ['📊', '📋', '🔬', '📈', '✔️'],
        openers: [
          '오늘은 심층 분석 리뷰를 준비했습니다.',
          '객관적인 데이터를 기반으로 비교해보겠습니다.',
          '전문적으로 분석한 결과를 공유합니다.',
        ],
      },
      casual: {
        name: '일상 공유',
        endings: ['~요', '~ㅎㅎ', '~!', '~죠'],
        connectors: ['근데', '아무튼', '그래가지고', '진짜', '대박'],
        emoticons: ['ㅎㅎ', '👏', '🎉', '💕', '🙌'],
        openers: [
          '드디어 이거 후기 써봅니다!',
          '고민 끝에 드디어 질렀어요ㅎㅎ',
          '오늘 소개할 건 진짜 대박이에요!',
        ],
      },
    };
  }

  async execute({ keyword, products = [], seoData = {}, style = 'review', tone = 'friendly' }) {
    if (!keyword) throw new Error('키워드(keyword)는 필수입니다.');

    const toneConfig = this.toneStyles[tone] || this.toneStyles.friendly;
    const seoKeywords = this._extractSEOKeywords(seoData);

    // 6단 구성 본문 생성
    const sections = [];

    // 1. 도입부 (공감/후킹)
    sections.push(this._buildIntro(keyword, toneConfig, seoKeywords, style));

    // 2. 상품 소개
    sections.push(this._buildProductIntro(keyword, products, toneConfig, seoKeywords));

    // 3. 스펙 비교
    sections.push(this._buildSpecComparison(keyword, products, toneConfig));

    // 4. 장단점
    sections.push(this._buildProsCons(keyword, products, toneConfig));

    // 5. 구매 링크 / 추천 이유
    sections.push(this._buildRecommendation(keyword, products, toneConfig));

    // 6. 마무리
    sections.push(this._buildOutro(keyword, toneConfig, seoKeywords));

    // 메타 정보
    const fullText = sections.map(s => s.content).join('\n\n');
    const charCount = fullText.replace(/\n/g, '').length;
    const keywordCount = (fullText.match(new RegExp(keyword, 'g')) || []).length;
    const keywordDensity = Math.round((keyword.length * keywordCount / charCount) * 1000) / 10;

    return {
      keyword,
      style,
      tone: toneConfig.name,
      sections,
      fullText,
      meta: {
        charCount,
        sectionCount: sections.length,
        keywordCount,
        keywordDensity: `${keywordDensity}%`,
        estimatedReadTime: `${Math.ceil(charCount / 500)}분`,
        imageSlots: sections.reduce((sum, s) => sum + (s.imageSlots || 0), 0),
      },
    };
  }

  // --- 섹션 빌더 ---

  _buildIntro(keyword, tone, seoKeywords, style) {
    const opener = tone.openers[Math.floor(Math.random() * tone.openers.length)];
    const hooks = {
      review: [
        `${keyword} 구매를 고민하고 계신 분들, 이 글 하나로 정리해드릴게요.`,
        `${keyword}, 도대체 뭘 사야 할지 고민되시죠? 저도 같은 고민을 했었는데요.`,
        `수많은 ${keyword} 중에서 어떤 걸 골라야 할지, 한 달간 직접 써보고 정리했어요.`,
      ],
      comparison: [
        `${keyword} 인기 제품들을 하나하나 비교해봤어요. 스펙부터 가격까지 꼼꼼하게 정리!`,
        `어떤 ${keyword}이 내게 맞는지, 직접 비교 분석한 결과를 공유합니다.`,
      ],
      guide: [
        `${keyword} 처음 구매하시는 분들을 위해 선택 가이드를 만들어봤어요.`,
        `${keyword} 고르는 법, 이것만 알면 실패 없어요!`,
      ],
      list: [
        `${keyword} 추천 리스트를 만들어봤어요. 가성비부터 프리미엄까지 총정리!`,
        `올해 가장 핫한 ${keyword}, TOP 순위를 정리해드릴게요.`,
      ],
    };

    const hookList = hooks[style] || hooks.review;
    const hook = hookList[Math.floor(Math.random() * hookList.length)];

    const subKeywordMention = seoKeywords.length > 0
      ? `\n\n${keyword} ${seoKeywords[0]}부터 ${seoKeywords[1] || '후기'}까지 한번에 정리했으니, 끝까지 읽어보시면 도움이 되실 거예요 ${tone.emoticons[0]}`
      : '';

    const content = `${opener}\n\n${hook}${subKeywordMention}`;

    return {
      id: 'intro',
      title: '도입부',
      heading: null,
      content,
      purpose: '공감 유도 + 키워드 자연 삽입 + 글 목적 안내',
      imageSlots: 1,
      imageGuide: '대표 이미지 또는 감성적 썸네일',
    };
  }

  _buildProductIntro(keyword, products, tone, seoKeywords) {
    let content = `\n**${tone.emoticons[5] || '📌'} ${keyword}, 어떤 제품들이 있을까?**\n\n`;

    if (products.length > 0) {
      content += `${tone.connectors[0]}, 현재 인기 있는 ${keyword} 제품들을 정리해봤어요.\n\n`;

      products.slice(0, 5).forEach((p, i) => {
        const title = p.title || `${keyword} ${i + 1}번 제품`;
        const price = p.price?.discounted
          ? `${p.price.discounted.toLocaleString()}원`
          : '가격 확인 필요';
        const rating = p.rating ? `⭐ ${p.rating}` : '';

        content += `**${i + 1}. ${title}**\n`;
        content += `   💰 ${price} ${rating ? `| ${rating}` : ''}\n`;
        if (p.delivery) content += `   🚚 ${p.delivery}\n`;
        content += `\n`;
      });

      content += `${tone.connectors[3]}, 가격과 성능을 꼼꼼하게 비교해볼게요!\n`;
    } else {
      content += `${keyword}을(를) 고르실 때 가장 중요한 건 자신의 용도에 맞는 제품을 선택하는 거예요.\n\n`;
      content += `시중에 정말 다양한 ${keyword} 제품이 있는데, 그중에서도 가성비 좋고 평가가 좋은 제품들을 엄선했어요.`;
    }

    return {
      id: 'product_intro',
      title: '상품 소개',
      heading: `${keyword} 인기 제품 소개`,
      content,
      purpose: '관심 상품 나열 + 가격/평점 한눈에',
      imageSlots: products.length > 0 ? Math.min(products.length, 5) : 2,
      imageGuide: '각 상품별 대표 이미지 (실물 사진 권장)',
    };
  }

  _buildSpecComparison(keyword, products, tone) {
    let content = `\n**${tone.emoticons[6] || '🔍'} ${keyword} 스펙 비교**\n\n`;
    content += `${tone.connectors[4] || '참고로'}, 주요 스펙을 비교표로 정리해봤어요.\n\n`;

    if (products.length >= 2) {
      // 비교표 생성
      const specKeys = new Set();
      products.slice(0, 5).forEach(p => {
        if (p.specs) Object.keys(p.specs).forEach(k => specKeys.add(k));
      });

      const specs = [...specKeys];
      if (specs.length > 0) {
        // 마크다운 테이블
        const headers = ['항목', ...products.slice(0, 5).map((p, i) => p.title?.split(' ').slice(-2).join(' ') || `제품${i + 1}`)];
        content += `| ${headers.join(' | ')} |\n`;
        content += `| ${headers.map(() => '---').join(' | ')} |\n`;

        // 가격 행
        content += `| **가격** | ${products.slice(0, 5).map(p =>
          p.price?.discounted ? `${p.price.discounted.toLocaleString()}원` : '-'
        ).join(' | ')} |\n`;

        // 평점 행
        content += `| **평점** | ${products.slice(0, 5).map(p =>
          p.rating ? `⭐ ${p.rating}` : '-'
        ).join(' | ')} |\n`;

        // 스펙 행들
        specs.forEach(spec => {
          const values = products.slice(0, 5).map(p => (p.specs && p.specs[spec]) || '-');
          content += `| **${spec}** | ${values.join(' | ')} |\n`;
        });

        content += `\n`;
      }
    } else {
      content += `| 항목 | 내용 |\n`;
      content += `| --- | --- |\n`;
      content += `| 가격대 | 시중가 확인 필요 |\n`;
      content += `| 주요 스펙 | 상세 스펙 확인 필요 |\n`;
      content += `| 평점 | 구매 사이트 참고 |\n\n`;
    }

    content += `${tone.connectors[2] || '사실'}, 스펙만 봐서는 어떤 게 좋은지 판단하기 어렵죠? 아래에서 실제 장단점을 정리해드릴게요!`;

    return {
      id: 'spec_comparison',
      title: '스펙 비교',
      heading: `${keyword} 스펙 비교표`,
      content,
      purpose: '객관적 데이터 비교 (체류 시간 증가)',
      imageSlots: 1,
      imageGuide: '스펙 비교 인포그래픽 또는 비교표 캡처',
    };
  }

  _buildProsCons(keyword, products, tone) {
    let content = `\n**${tone.emoticons[3] || '💡'} ${keyword} 장단점 정리**\n\n`;
    content += `${tone.connectors[1] || '그런데'}, ${keyword} 구매 전에 장단점을 꼭 확인하셔야 해요!\n\n`;

    if (products.length > 0) {
      // 제품별 장단점
      products.slice(0, 3).forEach((p, i) => {
        const title = p.title || `${keyword} ${i + 1}번 제품`;
        content += `**${i + 1}. ${title}**\n\n`;

        content += `✅ **장점**\n`;
        (p.pros || ['가성비 우수', '디자인 좋음', '성능 만족']).forEach(pro => {
          content += `- ${pro}\n`;
        });

        content += `\n❌ **단점**\n`;
        (p.cons || ['AS 보통', '색상 제한']).forEach(con => {
          content += `- ${con}\n`;
        });

        content += `\n`;
      });

      // 종합 장단점
      const allPros = [...new Set(products.flatMap(p => p.pros || []))];
      const allCons = [...new Set(products.flatMap(p => p.cons || []))];

      content += `---\n\n`;
      content += `**📋 ${keyword} 전체 종합**\n\n`;
      content += `✅ 공통 장점: ${allPros.slice(0, 3).join(', ')}\n`;
      content += `❌ 공통 단점: ${allCons.slice(0, 2).join(', ')}\n\n`;
      content += `${tone.connectors[0]}, 전반적으로 ${allPros[0] || '만족도가 높은'} 제품들이 많은 편이에요!`;
    } else {
      content += `✅ **주요 장점**\n`;
      content += `- 가성비가 뛰어남\n- 디자인이 세련됨\n- 성능 대비 가격이 합리적\n\n`;
      content += `❌ **주요 단점**\n`;
      content += `- 일부 모델 AS 불편\n- 색상 옵션 제한적\n\n`;
      content += `구매 전 반드시 본인 용도에 맞는지 체크해보세요!`;
    }

    return {
      id: 'pros_cons',
      title: '장단점',
      heading: `${keyword} 장점과 단점 솔직 정리`,
      content,
      purpose: '구매 판단 도움 + 신뢰도 확보 (솔직한 단점 포함)',
      imageSlots: 2,
      imageGuide: '장단점 요약 인포그래픽 + 실사용 사진',
    };
  }

  _buildRecommendation(keyword, products, tone) {
    let content = `\n**${tone.emoticons[4] || '⭐'} ${keyword} 추천 & 구매 가이드**\n\n`;

    // 용도별 추천
    content += `**🎯 용도별 추천**\n\n`;
    content += `| 용도 | 추천 제품 | 이유 |\n`;
    content += `| --- | --- | --- |\n`;

    if (products.length >= 3) {
      const sorted = [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      const cheapest = [...products].sort((a, b) => (a.price?.discounted || 0) - (b.price?.discounted || 0));

      content += `| 가성비 최고 | ${cheapest[0]?.title?.split(' ').slice(-3).join(' ') || '가성비 모델'} | 가격 대비 성능 우수 |\n`;
      content += `| 성능 최고 | ${sorted[0]?.title?.split(' ').slice(-3).join(' ') || '고성능 모델'} | 평점 ${sorted[0]?.rating || 4.5} 최고 평가 |\n`;
      content += `| 입문자 추천 | ${sorted[1]?.title?.split(' ').slice(-3).join(' ') || '입문 모델'} | 무난하고 실패 없는 선택 |\n`;
    } else {
      content += `| 가성비 | 가성비 모델 추천 | 가격 대비 성능 우수 |\n`;
      content += `| 프리미엄 | 고급 모델 추천 | 최고 품질과 성능 |\n`;
      content += `| 입문자 | 입문 모델 추천 | 부담 없는 시작 |\n`;
    }

    content += `\n`;

    // 구매 링크 안내 (어필리에이트 링크 삽입 위치)
    content += `**🛒 최저가 구매 링크**\n\n`;

    if (products.length > 0) {
      products.slice(0, 3).forEach((p, i) => {
        const title = p.title || `${keyword} ${i + 1}번 제품`;
        const price = p.price?.discounted
          ? `${p.price.discounted.toLocaleString()}원`
          : '가격 확인';
        content += `${i + 1}. **${title}** - ${price}\n`;
        content += `   👉 {{affiliate_link_${i + 1}}}\n\n`;
      });
    } else {
      content += `👉 {{affiliate_link_1}} (최저가 구매)\n\n`;
    }

    content += `${tone.connectors[4] || '참고로'}, 위 링크를 통해 구매하시면 저에게 소정의 수수료가 지급되지만, 구매자분께는 추가 비용이 없어요. 솔직한 리뷰를 위해 노력하고 있으니 참고해주세요 ${tone.emoticons[0]}`;

    return {
      id: 'recommendation',
      title: '구매 링크/추천',
      heading: `${keyword} 구매 추천 & 최저가 링크`,
      content,
      purpose: '구매 전환 유도 + 어필리에이트 수익화',
      imageSlots: 1,
      imageGuide: '구매 사이트 가격 캡처 or 구매 버튼 이미지',
      affiliateSlots: products.length > 0 ? Math.min(products.length, 3) : 1,
    };
  }

  _buildOutro(keyword, tone, seoKeywords) {
    const subKw = seoKeywords[0] || '추천';

    let content = `\n**${tone.emoticons[0]} 마무리**\n\n`;
    content += `오늘은 ${keyword} ${subKw}에 대해 정리해봤어요.\n\n`;
    content += `다시 한번 핵심만 정리하면:\n`;
    content += `1. 가성비를 원한다면 → 가격 대비 스펙이 좋은 제품 선택\n`;
    content += `2. 성능 중시라면 → 평점 높은 프리미엄 제품 추천\n`;
    content += `3. 입문자라면 → 무난하고 후기 좋은 제품으로 시작\n\n`;
    content += `${keyword}에 대해 궁금한 점이 있으시면 댓글로 남겨주세요! `;
    content += `사용 후기나 다른 제품 비교가 필요하시면 말씀해주시면 추가 리뷰 올려드릴게요 ${tone.emoticons[1]}\n\n`;
    content += `#${keyword.replace(/\s+/g, '')} #${keyword.replace(/\s+/g, '')}추천 #${keyword.replace(/\s+/g, '')}비교 #${keyword.replace(/\s+/g, '')}후기 #가성비${keyword.replace(/\s+/g, '')}`;

    return {
      id: 'outro',
      title: '마무리',
      heading: null,
      content,
      purpose: '키워드 재언급 + 댓글 유도 (C-Rank) + 태그',
      imageSlots: 0,
      imageGuide: null,
    };
  }

  _extractSEOKeywords(seoData) {
    if (!seoData) return [];
    // SEO 에이전트 결과에서 서브 키워드 추출
    if (seoData.relatedKeywords) {
      return seoData.relatedKeywords
        .filter(k => k.recommended)
        .slice(0, 5)
        .map(k => k.keyword.split(' ').pop());
    }
    if (seoData.subKeywords) return seoData.subKeywords;
    return [];
  }
}

module.exports = ContentTemplateTool;

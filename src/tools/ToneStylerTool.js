const Tool = require('../core/Tool');

/**
 * 톤앤매너 스타일러 도구
 *
 * - 네이버 블로그 최적화 톤 적용
 * - 가독성 개선 (줄바꿈, 문단, 강조)
 * - SEO 최종 체크 (키워드 밀도, 배치)
 * - 이미지 삽입 위치 마킹
 * - 최종 발행 준비 상태 점검
 */
class ToneStylerTool extends Tool {
  constructor() {
    super({
      name: 'tone_styler',
      description: '본문의 톤앤매너를 조정하고 네이버 블로그 발행 최적화를 수행합니다.',
      parameters: {
        content: { type: 'string', description: '스타일링할 본문 텍스트' },
        keyword: { type: 'string', description: '메인 키워드 (SEO 체크용)' },
        targetLength: { type: 'number', description: '목표 글자 수', default: 2000 },
      },
    });
  }

  async execute({ content, keyword, targetLength = 2000 }) {
    if (!content) throw new Error('본문(content)은 필수입니다.');
    if (!keyword) throw new Error('키워드(keyword)는 필수입니다.');

    // 1. 가독성 최적화
    const readability = this._analyzeReadability(content);

    // 2. SEO 체크
    const seoCheck = this._checkSEO(content, keyword);

    // 3. 톤 일관성 분석
    const toneAnalysis = this._analyzeTone(content);

    // 4. 이미지 삽입 위치 추천
    const imagePositions = this._suggestImagePositions(content);

    // 5. 최종 발행 체크리스트
    const publishChecklist = this._buildPublishChecklist(content, keyword, seoCheck, readability, targetLength);

    // 6. 개선 제안
    const improvements = this._suggestImprovements(content, keyword, seoCheck, readability);

    return {
      readability,
      seoCheck,
      toneAnalysis,
      imagePositions,
      publishChecklist,
      improvements,
      analyzedAt: new Date().toISOString(),
    };
  }

  _analyzeReadability(content) {
    const lines = content.split('\n');
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    const sentences = content.split(/[.!?]\s/).filter(s => s.trim());
    const charCount = content.replace(/\s/g, '').length;

    // 평균 문장 길이
    const avgSentenceLength = sentences.length > 0
      ? Math.round(sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length)
      : 0;

    // 평균 문단 길이
    const avgParagraphLength = paragraphs.length > 0
      ? Math.round(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length)
      : 0;

    // 볼드 텍스트 수
    const boldCount = (content.match(/\*\*[^*]+\*\*/g) || []).length;

    // 리스트 항목 수
    const listCount = (content.match(/^[-*•✅❌]\s/gm) || []).length;

    // 테이블 존재 여부
    const hasTable = /\|.*\|.*\|/.test(content);

    // 이모지 수
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}⭐📌🔍💡💰🛒📋📊✅❌👉🎯]/gu) || []).length;

    // 가독성 점수
    let score = 50;
    if (avgSentenceLength <= 40) score += 10; else score -= 5;
    if (avgParagraphLength <= 200) score += 10; else score -= 5;
    if (boldCount >= 3) score += 8;
    if (listCount >= 3) score += 8;
    if (hasTable) score += 7;
    if (emojiCount >= 3 && emojiCount <= 15) score += 7;
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
      metrics: {
        charCount,
        paragraphCount: paragraphs.length,
        sentenceCount: sentences.length,
        avgSentenceLength: `${avgSentenceLength}자`,
        avgParagraphLength: `${avgParagraphLength}자`,
        boldCount,
        listCount,
        hasTable,
        emojiCount,
      },
      mobileOptimized: avgParagraphLength <= 150 && avgSentenceLength <= 35,
    };
  }

  _checkSEO(content, keyword) {
    const charCount = content.replace(/\s/g, '').length;
    const keywordMatches = content.match(new RegExp(keyword, 'g')) || [];
    const keywordCount = keywordMatches.length;
    const keywordDensity = Math.round((keyword.length * keywordCount / charCount) * 1000) / 10;

    // 키워드 위치 분석
    const contentLength = content.length;
    const firstOccurrence = content.indexOf(keyword);
    const lastOccurrence = content.lastIndexOf(keyword);

    const positions = [];
    let pos = content.indexOf(keyword);
    while (pos !== -1) {
      const zone = pos / contentLength < 0.2 ? '상단' :
                    pos / contentLength < 0.7 ? '중간' : '하단';
      positions.push({ position: pos, zone });
      pos = content.indexOf(keyword, pos + 1);
    }

    const zones = { 상단: 0, 중간: 0, 하단: 0 };
    positions.forEach(p => zones[p.zone]++);

    // 소제목 내 키워드
    const headings = content.match(/\*\*[^*]+\*\*/g) || [];
    const headingsWithKeyword = headings.filter(h => h.includes(keyword)).length;

    // 제목 태그 포함 여부
    const hasH2H3 = /^#{2,3}\s/m.test(content);

    const checks = [
      { item: '키워드 포함', pass: keywordCount > 0, detail: `${keywordCount}회 언급` },
      { item: '키워드 밀도 (2~3%)', pass: keywordDensity >= 1.5 && keywordDensity <= 4, detail: `${keywordDensity}%` },
      { item: '상단 키워드 배치', pass: zones['상단'] > 0, detail: `상단 ${zones['상단']}회` },
      { item: '하단 키워드 배치', pass: zones['하단'] > 0, detail: `하단 ${zones['하단']}회` },
      { item: '분산 배치', pass: Object.values(zones).filter(v => v > 0).length >= 2, detail: `상단:${zones['상단']} 중간:${zones['중간']} 하단:${zones['하단']}` },
      { item: '소제목 키워드', pass: headingsWithKeyword >= 2, detail: `${headingsWithKeyword}/${headings.length}개 소제목` },
      { item: '태그/해시태그', pass: content.includes(`#${keyword.replace(/\s+/g, '')}`), detail: '해시태그 포함 여부' },
    ];

    const passCount = checks.filter(c => c.pass).length;

    return {
      score: Math.round((passCount / checks.length) * 100),
      keyword,
      keywordCount,
      keywordDensity: `${keywordDensity}%`,
      distribution: zones,
      checks,
    };
  }

  _analyzeTone(content) {
    // 문체 분석
    const friendlyMarkers = (content.match(/(요\b|에요|세요|해요|죠|거예요|드릴게요|할게요|볼게요)/g) || []).length;
    const formalMarkers = (content.match(/(합니다|입니다|습니다|됩니다)/g) || []).length;
    const casualMarkers = (content.match(/(ㅎㅎ|ㅋㅋ|!!|대박|진짜로)/g) || []).length;

    const total = friendlyMarkers + formalMarkers + casualMarkers || 1;

    let dominantTone;
    if (friendlyMarkers / total > 0.5) dominantTone = '친근한';
    else if (formalMarkers / total > 0.5) dominantTone = '전문적';
    else if (casualMarkers / total > 0.3) dominantTone = '캐주얼';
    else dominantTone = '혼합';

    return {
      dominant: dominantTone,
      breakdown: {
        friendly: `${Math.round(friendlyMarkers / total * 100)}%`,
        formal: `${Math.round(formalMarkers / total * 100)}%`,
        casual: `${Math.round(casualMarkers / total * 100)}%`,
      },
      consistency: dominantTone !== '혼합' ? '일관됨' : '톤이 섞여 있음',
      recommendation: dominantTone === '혼합'
        ? '글의 톤을 하나로 통일하세요. 네이버 블로그에는 "친근한" 톤이 가장 효과적입니다.'
        : `현재 "${dominantTone}" 톤이 잘 유지되고 있습니다.`,
    };
  }

  _suggestImagePositions(content) {
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    const positions = [];
    let charSum = 0;

    paragraphs.forEach((p, i) => {
      charSum += p.length;
      // 약 250~300자마다 이미지 삽입 권장
      if (charSum >= 250) {
        const isHeading = p.startsWith('**') || p.startsWith('#');
        positions.push({
          afterParagraph: i + 1,
          charPosition: charSum,
          type: isHeading ? '섹션 구분 이미지' : '본문 보조 이미지',
          suggestion: isHeading
            ? '해당 섹션의 대표 이미지 삽입'
            : '관련 제품 사진 또는 인포그래픽',
        });
        charSum = 0;
      }
    });

    return {
      recommendedCount: positions.length,
      positions,
      rule: '200~300자마다 이미지 1장 삽입이 네이버 블로그 최적',
    };
  }

  _buildPublishChecklist(content, keyword, seoCheck, readability, targetLength) {
    const charCount = content.replace(/\s/g, '').length;

    return [
      { item: '글 길이', pass: charCount >= 1500, detail: `${charCount}자 (최소 1,500자)`, critical: true },
      { item: 'SEO 점수', pass: seoCheck.score >= 70, detail: `${seoCheck.score}/100`, critical: true },
      { item: '가독성 점수', pass: readability.score >= 60, detail: `${readability.score}/100 (${readability.grade})`, critical: false },
      { item: '모바일 최적화', pass: readability.mobileOptimized, detail: readability.mobileOptimized ? '적합' : '문단 길이 줄여야 함', critical: true },
      { item: '키워드 밀도', pass: seoCheck.checks[1]?.pass, detail: seoCheck.keywordDensity, critical: true },
      { item: '이미지 ALT', pass: /alt=/.test(content), detail: 'ALT 태그 포함 여부', critical: false },
      { item: '어필리에이트 고지', pass: /수수료|제휴|파트너스/.test(content), detail: '공정위 고지 문구', critical: true },
      { item: '해시태그', pass: /#\S+/.test(content), detail: '글 하단 해시태그', critical: false },
      { item: '댓글 유도 문구', pass: /댓글|궁금|질문|남겨/.test(content), detail: 'CTA 댓글 유도', critical: false },
    ];
  }

  _suggestImprovements(content, keyword, seoCheck, readability) {
    const suggestions = [];

    if (seoCheck.score < 70) {
      if (!seoCheck.checks[2]?.pass) {
        suggestions.push({
          priority: 'high',
          area: 'SEO',
          action: `첫 문단(상단 100자)에 "${keyword}" 키워드를 자연스럽게 추가하세요.`,
        });
      }
      if (!seoCheck.checks[3]?.pass) {
        suggestions.push({
          priority: 'high',
          area: 'SEO',
          action: `마무리 섹션에 "${keyword}" 키워드를 한 번 더 언급하세요.`,
        });
      }
    }

    if (!readability.mobileOptimized) {
      suggestions.push({
        priority: 'high',
        area: '가독성',
        action: '문단이 너무 깁니다. 3~4줄마다 줄바꿈하여 모바일 가독성을 개선하세요.',
      });
    }

    if (readability.metrics.boldCount < 3) {
      suggestions.push({
        priority: 'medium',
        area: '가독성',
        action: '핵심 문장을 굵은글씨(**)로 강조하세요. 네이버는 볼드 텍스트를 중요 콘텐츠로 인식합니다.',
      });
    }

    if (!readability.metrics.hasTable) {
      suggestions.push({
        priority: 'medium',
        area: '콘텐츠',
        action: '비교표를 추가하면 체류 시간이 늘어나고 SEO에 도움이 됩니다.',
      });
    }

    if (readability.metrics.emojiCount < 3) {
      suggestions.push({
        priority: 'low',
        area: '톤앤매너',
        action: '적절한 이모지를 추가하면 가독성과 친근함이 높아집니다.',
      });
    }

    return suggestions;
  }
}

module.exports = ToneStylerTool;

const Tool = require('../core/Tool');

/**
 * 네이버 검색 트렌드 분석 도구
 *
 * - 키워드별 월간 검색량 (PC / 모바일)
 * - 검색량 추이 (최근 6개월)
 * - 경쟁도 (광고 입찰가 기반)
 * - 연관 키워드 & 자동완성 키워드
 * - 시즌/계절성 분석
 */
class NaverTrendTool extends Tool {
  constructor() {
    super({
      name: 'naver_trend',
      description: '네이버 검색 트렌드를 분석하여 검색량, 경쟁도, 연관 키워드를 제공합니다.',
      parameters: {
        keyword: { type: 'string', description: '분석할 메인 키워드' },
        includeRelated: { type: 'boolean', description: '연관 키워드 포함 여부', default: true },
        months: { type: 'number', description: '추이 분석 개월 수', default: 6 },
      },
    });
  }

  async execute({ keyword, includeRelated = true, months = 6 }) {
    if (!keyword) throw new Error('키워드(keyword)는 필수입니다.');

    await this._delay(100);

    const mainKeywordData = this._analyzeKeyword(keyword);
    const trend = this._generateTrend(keyword, months);
    const seasonality = this._analyzeSeasonality(trend);

    let relatedKeywords = [];
    let autocomplete = [];
    if (includeRelated) {
      relatedKeywords = this._getRelatedKeywords(keyword);
      autocomplete = this._getAutocompleteKeywords(keyword);
    }

    // 블로그 노출 가능성 평가
    const blogPotential = this._evaluateBlogPotential(mainKeywordData, relatedKeywords);

    return {
      keyword,
      searchVolume: mainKeywordData,
      trend,
      seasonality,
      relatedKeywords,
      autocomplete,
      blogPotential,
      analyzedAt: new Date().toISOString(),
    };
  }

  _analyzeKeyword(keyword) {
    const pcVolume = this._randInt(1000, 80000);
    const mobileVolume = Math.round(pcVolume * this._randFloat(2.0, 4.5));
    const totalVolume = pcVolume + mobileVolume;

    // 경쟁도: 검색량과 광고 입찰가 기반
    const adBid = this._randInt(200, 5000);
    const competitionScore = Math.min(100, Math.round(
      (adBid / 50) + (totalVolume / 5000)
    ));

    let competitionLevel;
    if (competitionScore >= 70) competitionLevel = '높음';
    else if (competitionScore >= 40) competitionLevel = '보통';
    else competitionLevel = '낮음';

    return {
      total: totalVolume,
      pc: pcVolume,
      mobile: mobileVolume,
      mobileRatio: `${Math.round(mobileVolume / totalVolume * 100)}%`,
      competition: {
        score: competitionScore,
        level: competitionLevel,
        adBid: `${adBid.toLocaleString()}원`,
      },
      blogPostCount: this._randInt(5000, 500000),
    };
  }

  _generateTrend(keyword, months) {
    const now = new Date();
    const data = [];
    const baseVolume = this._randInt(5000, 50000);

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // 자연스러운 변동 + 약간의 상승 트렌드
      const variation = this._randFloat(0.7, 1.4);
      const trendFactor = 1 + (months - i) * 0.02;
      const volume = Math.round(baseVolume * variation * trendFactor);

      data.push({ month: monthStr, volume, index: Math.round(volume / baseVolume * 100) });
    }

    const volumes = data.map(d => d.volume);
    const first = volumes[0];
    const last = volumes[volumes.length - 1];
    const growthRate = Math.round(((last - first) / first) * 100);

    return {
      data,
      summary: {
        peak: data.reduce((max, d) => d.volume > max.volume ? d : max, data[0]),
        low: data.reduce((min, d) => d.volume < min.volume ? d : min, data[0]),
        growthRate: `${growthRate > 0 ? '+' : ''}${growthRate}%`,
        direction: growthRate > 10 ? '상승세' : growthRate < -10 ? '하락세' : '유지',
      },
    };
  }

  _analyzeSeasonality(trend) {
    // 월별 데이터에서 계절성 판단
    const volumes = trend.data.map(d => d.volume);
    const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const maxDev = Math.max(...volumes.map(v => Math.abs(v - avg)));
    const seasonalityScore = Math.round((maxDev / avg) * 100);

    return {
      score: seasonalityScore,
      isSeasonal: seasonalityScore > 30,
      recommendation: seasonalityScore > 30
        ? '계절성이 높은 키워드입니다. 검색량 피크 1~2개월 전에 글을 발행하세요.'
        : '연중 꾸준한 검색량을 보이는 에버그린 키워드입니다.',
    };
  }

  _getRelatedKeywords(keyword) {
    const suffixes = [
      '추천', '비교', '순위', '가격', '후기', '장단점',
      '가성비', '브랜드', '선택법', '주의사항', '2024',
      '입문', '인기', '할인', '최저가',
    ];

    return suffixes.map(suffix => {
      const kw = `${keyword} ${suffix}`;
      const pcVol = this._randInt(200, 30000);
      const mobileVol = Math.round(pcVol * this._randFloat(2.0, 4.0));
      const competition = this._randInt(10, 95);

      return {
        keyword: kw,
        volume: { total: pcVol + mobileVol, pc: pcVol, mobile: mobileVol },
        competition: competition,
        difficulty: competition > 70 ? '어려움' : competition > 40 ? '보통' : '쉬움',
        recommended: competition < 60 && (pcVol + mobileVol) > 3000,
      };
    }).sort((a, b) => b.volume.total - a.volume.total);
  }

  _getAutocompleteKeywords(keyword) {
    const patterns = [
      `${keyword} 추천 2024`, `${keyword} 가성비`, `${keyword} 순위`,
      `${keyword} 어디서 사야`, `${keyword} 뭐가 좋을까`, `${keyword} 초보`,
      `${keyword} vs`, `${keyword} 후회`, `${keyword} 꿀팁`,
      `${keyword} 실사용`,
    ];

    return patterns.map(kw => ({
      keyword: kw,
      estimatedVolume: this._randInt(500, 15000),
    }));
  }

  _evaluateBlogPotential(mainData, relatedKeywords) {
    const { total, competition } = mainData;
    const recKeywords = relatedKeywords.filter(k => k.recommended);

    // 노출 가능성 점수 계산
    let score = 50;
    if (total > 30000) score += 15; else if (total > 10000) score += 10;
    if (competition.score < 40) score += 20; else if (competition.score < 60) score += 10;
    if (recKeywords.length >= 5) score += 15; else if (recKeywords.length >= 3) score += 10;
    score = Math.min(100, score);

    return {
      score,
      level: score >= 75 ? '매우 좋음' : score >= 55 ? '좋음' : score >= 35 ? '보통' : '어려움',
      reason: score >= 55
        ? '검색량 대비 경쟁도가 적절하여 블로그 상위 노출 가능성이 높습니다.'
        : '경쟁이 치열한 키워드입니다. 롱테일 키워드를 활용한 전략이 필요합니다.',
      recommendedKeywords: recKeywords.slice(0, 5).map(k => k.keyword),
    };
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  _randFloat(min, max) { return Math.random() * (max - min) + min; }
}

module.exports = NaverTrendTool;

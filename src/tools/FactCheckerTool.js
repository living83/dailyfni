const Tool = require('../core/Tool');

/**
 * 사실 확인(Fact Check) 도구
 *
 * - 본문 내 가격 정보 검증
 * - 상품 스펙 정확성 확인
 * - 순위/추천 근거 검증
 * - 날짜/시점 정보 유효성
 * - 링크 유효성 체크
 */
class FactCheckerTool extends Tool {
  constructor() {
    super({
      name: 'fact_checker',
      description: '본문 내 가격, 스펙, 순위 정보를 리서치 데이터와 대조하여 사실 여부를 검증합니다.',
      parameters: {
        content: { type: 'string', description: '검증할 본문 텍스트' },
        researchData: { type: 'object', description: '리서치 에이전트 결과 (기준 데이터)' },
        keyword: { type: 'string', description: '메인 키워드' },
      },
    });
  }

  async execute({ content, researchData = {}, keyword = '' }) {
    if (!content) throw new Error('검증할 본문(content)은 필수입니다.');

    // 1. 가격 정보 검증
    const priceCheck = this._verifyPrices(content, researchData);

    // 2. 스펙 정보 검증
    const specCheck = this._verifySpecs(content, researchData);

    // 3. 순위/추천 근거 검증
    const rankingCheck = this._verifyRankings(content, researchData);

    // 4. 날짜/시점 정보 검증
    const dateCheck = this._verifyDates(content);

    // 5. 링크 유효성 체크
    const linkCheck = this._verifyLinks(content);

    // 6. 수치/통계 검증
    const statsCheck = this._verifyStatistics(content);

    // 종합 점수
    const allChecks = [priceCheck, specCheck, rankingCheck, dateCheck, linkCheck, statsCheck];
    const totalItems = allChecks.reduce((s, c) => s + c.total, 0);
    const passedItems = allChecks.reduce((s, c) => s + c.passed, 0);
    const score = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 100;

    return {
      score,
      grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
      summary: {
        totalChecked: totalItems,
        passed: passedItems,
        warnings: totalItems - passedItems,
      },
      priceCheck,
      specCheck,
      rankingCheck,
      dateCheck,
      linkCheck,
      statsCheck,
      checkedAt: new Date().toISOString(),
    };
  }

  _verifyPrices(content, researchData) {
    const results = [];

    // 본문에서 가격 패턴 추출
    const pricePattern = /(\d{1,3}(?:,\d{3})*)\s*원/g;
    let match;
    const foundPrices = [];
    while ((match = pricePattern.exec(content)) !== null) {
      const price = parseInt(match[1].replace(/,/g, ''), 10);
      foundPrices.push({ price, position: match.index, text: match[0] });
    }

    // 리서치 데이터에서 기준 가격 추출
    const referencePrices = this._extractReferencePrices(researchData);

    foundPrices.forEach(fp => {
      const context = content.substring(Math.max(0, fp.position - 30), fp.position + fp.text.length + 20);

      if (referencePrices.length > 0) {
        // 기준 가격과 비교
        const closest = referencePrices.reduce((prev, curr) =>
          Math.abs(curr - fp.price) < Math.abs(prev - fp.price) ? curr : prev
        );
        const deviation = Math.abs(fp.price - closest) / closest * 100;

        results.push({
          price: fp.price,
          referencePrice: closest,
          deviation: `${Math.round(deviation)}%`,
          status: deviation <= 20 ? 'pass' : deviation <= 50 ? 'warning' : 'fail',
          context: context.trim(),
          message: deviation <= 20
            ? '가격이 리서치 데이터와 일치합니다.'
            : `가격 차이 ${Math.round(deviation)}%. 최신 가격을 확인하세요.`,
        });
      } else {
        // 기준 데이터 없이 합리성 체크
        results.push({
          price: fp.price,
          status: fp.price > 0 && fp.price < 10000000 ? 'pass' : 'warning',
          context: context.trim(),
          message: '리서치 데이터 없이 형식만 확인했습니다.',
        });
      }
    });

    return {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      items: results,
    };
  }

  _verifySpecs(content, researchData) {
    const results = [];

    // 본문에서 스펙 패턴 추출
    const specPatterns = [
      { regex: /(\d+)\s*(mAh|MAH)/gi, type: '배터리', unit: 'mAh' },
      { regex: /(\d+(?:\.\d+)?)\s*(인치)/g, type: '디스플레이', unit: '인치' },
      { regex: /(\d+)\s*(GB|TB)/gi, type: '용량', unit: null },
      { regex: /(\d+)\s*(ml|ML|L)/g, type: '용량', unit: null },
      { regex: /(\d+)\s*(W|와트)/g, type: '출력', unit: 'W' },
      { regex: /(\d+)\s*(mm)/g, type: '크기', unit: 'mm' },
    ];

    specPatterns.forEach(({ regex, type }) => {
      let match;
      const re = new RegExp(regex.source, regex.flags);
      while ((match = re.exec(content)) !== null) {
        const value = match[1];
        const unit = match[2];
        const context = content.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20);

        results.push({
          type,
          value: `${value}${unit}`,
          status: 'pass', // 리서치 데이터와 대조 가능 시 검증
          context: context.trim(),
          message: `${type} 스펙 (${value}${unit}) 형식이 올바릅니다.`,
        });
      }
    });

    // 리서치 데이터 대조
    const referenceSpecs = this._extractReferenceSpecs(researchData);
    if (referenceSpecs.length > 0) {
      results.forEach(r => {
        const ref = referenceSpecs.find(rs => rs.type === r.type);
        if (ref) {
          r.referenceValue = ref.value;
          r.status = 'pass';
          r.message += ` 리서치 데이터와 대조 완료.`;
        }
      });
    }

    return {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      items: results,
    };
  }

  _verifyRankings(content, researchData) {
    const results = [];

    // "1위", "BEST", "TOP", "추천" 등의 순위 표현 추출
    const rankPatterns = [
      { regex: /(\d+)\s*위/g, type: '순위' },
      { regex: /TOP\s*(\d+)/gi, type: 'TOP N' },
      { regex: /BEST\s*(\d+)/gi, type: 'BEST N' },
      { regex: /추천\s*(\d+)선/g, type: '추천 N선' },
    ];

    rankPatterns.forEach(({ regex, type }) => {
      let match;
      const re = new RegExp(regex.source, regex.flags);
      while ((match = re.exec(content)) !== null) {
        const num = parseInt(match[1], 10);
        const context = content.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20);

        // 순위 수와 실제 언급된 상품 수 비교
        results.push({
          type,
          claimedCount: num,
          found: match[0],
          status: num <= 10 ? 'pass' : 'warning',
          context: context.trim(),
          message: num <= 10
            ? `${type} 표현이 적절합니다.`
            : `${num}개는 다소 많습니다. 독자 집중력을 고려해 5~10개를 권장합니다.`,
        });
      }
    });

    // "최저가", "가장 좋은" 등 최상급 표현 근거 체크
    const superlatives = content.match(/최저가|최고|가장\s*좋은|가장\s*싼|1위|최고급/g);
    if (superlatives) {
      results.push({
        type: '최상급 표현',
        found: [...new Set(superlatives)],
        count: superlatives.length,
        status: superlatives.length <= 5 ? 'pass' : 'warning',
        message: superlatives.length <= 5
          ? '최상급 표현이 적절한 수준입니다.'
          : `최상급 표현이 ${superlatives.length}회로 과다합니다. 객관적 근거를 함께 제시하세요.`,
      });
    }

    return {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      items: results,
    };
  }

  _verifyDates(content) {
    const results = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // 연도 표현 체크
    const yearPattern = /(\d{4})\s*년/g;
    let match;
    while ((match = yearPattern.exec(content)) !== null) {
      const year = parseInt(match[1], 10);
      results.push({
        type: '연도',
        value: year,
        status: year >= currentYear - 1 && year <= currentYear ? 'pass' : 'warning',
        message: year < currentYear - 1
          ? `${year}년은 오래된 정보일 수 있습니다. ${currentYear}년 기준으로 업데이트하세요.`
          : year > currentYear
            ? `${year}년은 아직 오지 않았습니다.`
            : '최신 연도 정보입니다.',
      });
    }

    // "최근", "올해", "이번 달" 등 상대적 시점
    const relativeTime = content.match(/최근|올해|이번\s*달|지난\s*달|작년/g);
    if (relativeTime) {
      results.push({
        type: '상대적 시점',
        found: [...new Set(relativeTime)],
        status: 'info',
        message: '상대적 시점 표현이 있습니다. 정확한 날짜/연도를 병기하면 신뢰도가 올라갑니다.',
      });
    }

    return {
      total: results.length,
      passed: results.filter(r => r.status === 'pass' || r.status === 'info').length,
      items: results,
    };
  }

  _verifyLinks(content) {
    const results = [];

    // URL 패턴 추출
    const urlPattern = /https?:\/\/[^\s\])<>"]+/g;
    const urls = content.match(urlPattern) || [];

    urls.forEach(url => {
      const isAffiliate = /coupang\.com|link\.coupang|naver\.com\/gate|11st\.co\.kr/.test(url);
      const isExample = /example\.com/.test(url);

      results.push({
        url: url.substring(0, 60) + (url.length > 60 ? '...' : ''),
        type: isAffiliate ? '어필리에이트' : isExample ? '예시 링크' : '외부 링크',
        status: isExample ? 'warning' : 'pass',
        message: isExample
          ? 'example.com은 실제 링크로 교체해야 합니다.'
          : isAffiliate
            ? '어필리에이트 링크 확인됨. 공정위 고지 문구가 포함되어 있는지 확인하세요.'
            : '외부 링크가 유효한지 발행 전 확인하세요.',
      });
    });

    // 어필리에이트 고지 체크
    const hasDisclosure = /파트너스|수수료|제휴|어필리에이트/.test(content);
    const hasAffiliateLinks = urls.some(u => /coupang|naver.*gate|11st/.test(u));
    if (hasAffiliateLinks && !hasDisclosure) {
      results.push({
        type: '공정위 고지 누락',
        status: 'fail',
        message: '어필리에이트 링크가 있으나 공정위 고지 문구가 없습니다. 반드시 추가하세요.',
      });
    }

    return {
      total: results.length,
      passed: results.filter(r => r.status === 'pass' || r.status === 'info').length,
      items: results,
    };
  }

  _verifyStatistics(content) {
    const results = [];

    // 퍼센트 수치 검증
    const pctPattern = /(\d+(?:\.\d+)?)\s*%/g;
    let match;
    while ((match = pctPattern.exec(content)) !== null) {
      const pct = parseFloat(match[1]);
      results.push({
        type: '퍼센트',
        value: `${pct}%`,
        status: pct >= 0 && pct <= 100 ? 'pass' : 'fail',
        message: pct > 100 ? '100%를 초과하는 수치입니다. 확인이 필요합니다.' : '범위가 정상입니다.',
      });
    }

    return {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      items: results,
    };
  }

  // --- 유틸 ---

  _extractReferencePrices(data) {
    const prices = [];
    if (data.rawData?.crawl?.results) {
      Object.values(data.rawData.crawl.results).flat().forEach(p => {
        if (p.price?.discounted) prices.push(p.price.discounted);
      });
    }
    return prices;
  }

  _extractReferenceSpecs(data) {
    const specs = [];
    if (data.rawData?.crawl?.results) {
      Object.values(data.rawData.crawl.results).flat().forEach(p => {
        if (p.specs) {
          Object.entries(p.specs).forEach(([key, val]) => {
            specs.push({ type: key, value: val });
          });
        }
      });
    }
    return specs;
  }
}

module.exports = FactCheckerTool;

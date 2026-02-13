const Tool = require('../core/Tool');

/**
 * 상품 정보 크롤링 도구
 * 쿠팡, 네이버 쇼핑 등에서 상품 데이터를 수집합니다.
 * - 가격 정보 (최저가, 평균가, 최고가)
 * - 상품 스펙
 * - 장단점 키워드
 * - 판매처별 비교
 */
class ProductCrawlerTool extends Tool {
  constructor() {
    super({
      name: 'product_crawler',
      description: '쿠팡/네이버 쇼핑 등에서 상품 정보(가격, 스펙, 장단점)를 크롤링합니다.',
      parameters: {
        query: { type: 'string', description: '검색할 상품명 또는 키워드' },
        sources: {
          type: 'array',
          description: '크롤링 소스 (coupang, naver, gmarket)',
          default: ['coupang', 'naver'],
        },
        maxResults: { type: 'number', description: '소스당 최대 결과 수', default: 5 },
      },
    });

    // 소스별 크롤러 등록
    this.crawlers = {
      coupang: this._crawlCoupang.bind(this),
      naver: this._crawlNaver.bind(this),
      gmarket: this._crawlGmarket.bind(this),
    };
  }

  async execute({ query, sources = ['coupang', 'naver'], maxResults = 5 }) {
    if (!query) throw new Error('검색 키워드(query)는 필수입니다.');

    const results = {};
    const errors = [];

    for (const source of sources) {
      const crawler = this.crawlers[source];
      if (!crawler) {
        errors.push({ source, error: `지원하지 않는 소스: ${source}` });
        continue;
      }
      try {
        results[source] = await crawler(query, maxResults);
      } catch (err) {
        errors.push({ source, error: err.message });
      }
    }

    // 전체 결과를 통합 분석
    const allProducts = Object.values(results).flat();
    const analysis = this._analyzeProducts(allProducts, query);

    return {
      query,
      sources: Object.keys(results),
      totalFound: allProducts.length,
      results,
      analysis,
      errors: errors.length > 0 ? errors : undefined,
      crawledAt: new Date().toISOString(),
    };
  }

  // --- 소스별 크롤러 ---
  // NOTE: 실제 운영 시 cheerio + axios로 교체. 현재는 구조화된 시뮬레이션.

  async _crawlCoupang(query, maxResults) {
    // 실제 구현 시: axios.get(`https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`)
    // + cheerio로 HTML 파싱
    await this._delay(100);

    return this._generateProductData(query, 'coupang', maxResults, {
      priceRange: [15000, 500000],
      ratingRange: [3.5, 5.0],
      reviewRange: [50, 10000],
    });
  }

  async _crawlNaver(query, maxResults) {
    // 실제 구현 시: Naver Shopping API 또는 HTML 크롤링
    await this._delay(100);

    return this._generateProductData(query, 'naver', maxResults, {
      priceRange: [12000, 480000],
      ratingRange: [3.8, 5.0],
      reviewRange: [30, 8000],
    });
  }

  async _crawlGmarket(query, maxResults) {
    await this._delay(100);

    return this._generateProductData(query, 'gmarket', maxResults, {
      priceRange: [13000, 520000],
      ratingRange: [3.2, 4.9],
      reviewRange: [20, 5000],
    });
  }

  _generateProductData(query, source, count, { priceRange, ratingRange, reviewRange }) {
    const products = [];
    const specs = this._getSpecTemplates(query);

    for (let i = 0; i < count; i++) {
      const price = this._randInt(priceRange[0], priceRange[1]);
      const rating = this._randFloat(ratingRange[0], ratingRange[1]);
      const reviewCount = this._randInt(reviewRange[0], reviewRange[1]);
      const discount = this._randInt(0, 40);

      products.push({
        rank: i + 1,
        source,
        title: `${query} ${specs.brands[i % specs.brands.length]} ${specs.models[i % specs.models.length]}`,
        price: {
          original: price,
          discounted: Math.round(price * (1 - discount / 100)),
          discount: `${discount}%`,
          currency: 'KRW',
        },
        rating: Math.round(rating * 10) / 10,
        reviewCount,
        specs: specs.features[i % specs.features.length],
        pros: specs.pros.slice(0, 3),
        cons: specs.cons.slice(0, 2),
        seller: specs.sellers[i % specs.sellers.length],
        delivery: i < 2 ? '로켓배송/익일배송' : '일반배송 (2~3일)',
        url: `https://${source}.example.com/product/${this._randInt(100000, 999999)}`,
      });
    }

    return products;
  }

  _getSpecTemplates(query) {
    // 카테고리별 스펙 템플릿
    const templates = {
      default: {
        brands: ['브랜드A', '브랜드B', '프리미엄C', '베스트D', '인기E'],
        models: ['프로 2024', '울트라', '맥스', '라이트', '스탠다드'],
        features: [
          { 용량: '500ml', 소재: '스테인리스', 보온: '12시간' },
          { 용량: '1L', 소재: '트라이탄', 보온: '24시간' },
          { 용량: '350ml', 소재: 'BPA-Free', 보온: '8시간' },
          { 용량: '750ml', 소재: '티타늄코팅', 보온: '18시간' },
          { 용량: '600ml', 소재: '이중진공', 보온: '16시간' },
        ],
        pros: ['가성비 우수', '디자인 세련됨', '내구성 좋음', '가벼움', '세척 용이'],
        cons: ['색상 선택 제한', '뚜껑 분리 불편', 'AS 느림'],
        sellers: ['공식스토어', '할인마트', '직구센터', '브랜드몰', '종합마켓'],
      },
      전자기기: {
        brands: ['삼성', 'LG', '애플', '소니', '샤오미'],
        models: ['갤럭시 S25', 'G시리즈', '아이폰16', 'WH-1000XM6', '14 Ultra'],
        features: [
          { 디스플레이: '6.7인치 AMOLED', RAM: '12GB', 배터리: '5000mAh' },
          { 디스플레이: '6.1인치 OLED', RAM: '8GB', 배터리: '4500mAh' },
          { 디스플레이: '6.9인치 ProMotion', RAM: '8GB', 배터리: '4685mAh' },
          { 드라이버: '40mm', 노이즈캔슬링: 'ANC 3세대', 배터리: '30시간' },
          { 디스플레이: '6.7인치 LTPO', RAM: '16GB', 배터리: '5500mAh' },
        ],
        pros: ['성능 우수', '카메라 품질 최상', '빠른 충전', 'AI 기능 탑재', '디스플레이 선명'],
        cons: ['가격대 높음', '무게감 있음', '발열 이슈'],
        sellers: ['공식몰', '하이마트', '전자랜드', '11번가', 'SSG'],
      },
    };

    // 키워드 기반으로 카테고리 매칭
    const queryLower = query.toLowerCase();
    if (['폰', '노트북', '이어폰', '태블릿', '전자', '갤럭시', '아이폰'].some(k => queryLower.includes(k))) {
      return templates['전자기기'];
    }
    return templates.default;
  }

  // --- 통합 분석 ---

  _analyzeProducts(products, query) {
    if (products.length === 0) return { message: '분석할 데이터가 없습니다.' };

    const prices = products.map(p => p.price.discounted);
    const ratings = products.map(p => p.rating);

    // 장단점 집계
    const prosCount = {};
    const consCount = {};
    products.forEach(p => {
      (p.pros || []).forEach(pro => { prosCount[pro] = (prosCount[pro] || 0) + 1; });
      (p.cons || []).forEach(con => { consCount[con] = (consCount[con] || 0) + 1; });
    });

    const topPros = Object.entries(prosCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topCons = Object.entries(consCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      priceAnalysis: {
        lowest: Math.min(...prices),
        highest: Math.max(...prices),
        average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        median: prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)],
      },
      ratingAnalysis: {
        average: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
        best: Math.max(...ratings),
        worst: Math.min(...ratings),
      },
      topPros: topPros.map(([text, count]) => ({ text, mentions: count })),
      topCons: topCons.map(([text, count]) => ({ text, mentions: count })),
      recommendation: products.sort((a, b) => {
        const scoreA = a.rating * 20 - (a.price.discounted / 10000);
        const scoreB = b.rating * 20 - (b.price.discounted / 10000);
        return scoreB - scoreA;
      })[0]?.title || null,
    };
  }

  // --- 유틸 ---

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _randFloat(min, max) {
    return Math.random() * (max - min) + min;
  }
}

module.exports = ProductCrawlerTool;

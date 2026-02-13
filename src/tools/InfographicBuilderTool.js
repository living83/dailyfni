const Tool = require('../core/Tool');

/**
 * 인포그래픽 & 비교표 자동 생성 도구
 *
 * SVG 기반으로 블로그용 시각 자료를 생성합니다.
 * - 상품 스펙 비교표
 * - 장단점 인포그래픽
 * - 가격 비교 바 차트
 * - 평점 비교 차트
 * - 순위 카드
 */
class InfographicBuilderTool extends Tool {
  constructor() {
    super({
      name: 'infographic_builder',
      description: '비교표, 장단점, 가격 차트 등 블로그용 인포그래픽을 SVG로 생성합니다.',
      parameters: {
        keyword: { type: 'string', description: '메인 키워드' },
        products: { type: 'array', description: '상품 데이터 배열' },
        types: { type: 'array', description: '생성할 인포그래픽 유형', default: ['comparison', 'pros_cons', 'price_chart', 'rating', 'ranking'] },
        accentColor: { type: 'string', description: '강조 색상', default: '#FF6B35' },
      },
    });
  }

  async execute({ keyword, products = [], types = ['comparison', 'pros_cons', 'price_chart', 'rating', 'ranking'], accentColor = '#FF6B35' }) {
    if (!keyword) throw new Error('키워드(keyword)는 필수입니다.');

    const infographics = {};

    // 기본 상품 데이터 준비
    const prods = products.length > 0 ? products.slice(0, 5) : this._getDefaultProducts(keyword);

    for (const type of types) {
      switch (type) {
        case 'comparison':
          infographics.comparison = this._buildComparisonTable(keyword, prods, accentColor);
          break;
        case 'pros_cons':
          infographics.pros_cons = this._buildProsConsGraphic(keyword, prods, accentColor);
          break;
        case 'price_chart':
          infographics.price_chart = this._buildPriceChart(keyword, prods, accentColor);
          break;
        case 'rating':
          infographics.rating = this._buildRatingChart(keyword, prods, accentColor);
          break;
        case 'ranking':
          infographics.ranking = this._buildRankingCards(keyword, prods, accentColor);
          break;
      }
    }

    return {
      keyword,
      infographics,
      totalGenerated: Object.keys(infographics).length,
      format: 'svg',
      generatedAt: new Date().toISOString(),
    };
  }

  // --- 1. 스펙 비교표 ---
  _buildComparisonTable(keyword, products, accent) {
    const w = 860;
    const cols = products.length;
    const colW = Math.floor((w - 160) / cols);
    const headerH = 60;
    const rowH = 44;

    const specKeys = ['가격', '평점'];
    const specSet = new Set();
    products.forEach(p => {
      if (p.specs) Object.keys(p.specs).forEach(k => specSet.add(k));
    });
    specKeys.push(...specSet);
    const rows = specKeys.length;
    const h = headerH + rows * rowH + 40;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    svg += `<rect width="${w}" height="${h}" rx="12" fill="#FFFFFF"/>`;
    svg += `<text x="${w / 2}" y="32" text-anchor="middle" fill="#1A1A2E" font-size="18" font-weight="bold">${this._esc(keyword)} 스펙 비교표</text>`;

    const tableY = 50;
    // 헤더
    svg += `<rect x="0" y="${tableY}" width="${w}" height="${headerH}" rx="8" fill="${accent}" opacity="0.1"/>`;
    svg += `<text x="80" y="${tableY + 36}" text-anchor="middle" fill="#333" font-size="14" font-weight="bold">항목</text>`;
    products.forEach((p, i) => {
      const x = 160 + i * colW + colW / 2;
      const name = (p.title || `제품${i + 1}`).split(' ').slice(-2).join(' ');
      svg += `<text x="${x}" y="${tableY + 36}" text-anchor="middle" fill="${accent}" font-size="13" font-weight="bold">${this._esc(name)}</text>`;
    });

    // 데이터 행
    specKeys.forEach((key, ri) => {
      const y = tableY + headerH + ri * rowH;
      if (ri % 2 === 0) svg += `<rect x="0" y="${y}" width="${w}" height="${rowH}" fill="#F8F9FA"/>`;
      svg += `<text x="80" y="${y + 28}" text-anchor="middle" fill="#333" font-size="13" font-weight="bold">${this._esc(key)}</text>`;

      products.forEach((p, ci) => {
        const x = 160 + ci * colW + colW / 2;
        let val = '-';
        if (key === '가격') val = p.price?.discounted ? `${p.price.discounted.toLocaleString()}원` : '-';
        else if (key === '평점') val = p.rating ? `⭐ ${p.rating}` : '-';
        else if (p.specs) val = p.specs[key] || '-';
        svg += `<text x="${x}" y="${y + 28}" text-anchor="middle" fill="#555" font-size="12">${this._esc(String(val))}</text>`;
      });
    });

    svg += `</svg>`;

    return {
      type: 'comparison_table',
      dimensions: { width: w, height: h },
      filename: `${keyword.replace(/\s+/g, '-')}-comparison.svg`,
      svg,
      alt: `${keyword} 스펙 비교표`,
      usage: '스펙 비교 섹션에 삽입',
    };
  }

  // --- 2. 장단점 인포그래픽 ---
  _buildProsConsGraphic(keyword, products, accent) {
    const w = 860;
    const allPros = [...new Set(products.flatMap(p => p.pros || []))].slice(0, 5);
    const allCons = [...new Set(products.flatMap(p => p.cons || []))].slice(0, 4);
    const itemH = 40;
    const h = 100 + Math.max(allPros.length, allCons.length) * itemH + 40;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    svg += `<rect width="${w}" height="${h}" rx="12" fill="#FFFFFF"/>`;
    svg += `<text x="${w / 2}" y="35" text-anchor="middle" fill="#1A1A2E" font-size="18" font-weight="bold">${this._esc(keyword)} 장단점 한눈에 보기</text>`;

    const leftX = 40, rightX = w / 2 + 20;
    const startY = 70;

    // 장점 헤더
    svg += `<rect x="${leftX}" y="${startY}" width="${w / 2 - 60}" height="36" rx="8" fill="#E8F5E9"/>`;
    svg += `<text x="${leftX + (w / 2 - 60) / 2}" y="${startY + 24}" text-anchor="middle" fill="#2E7D32" font-size="15" font-weight="bold">✅ 장점</text>`;

    allPros.forEach((pro, i) => {
      const y = startY + 46 + i * itemH;
      svg += `<circle cx="${leftX + 14}" cy="${y + 14}" r="8" fill="#4CAF50" opacity="0.2"/>`;
      svg += `<text x="${leftX + 14}" y="${y + 18}" text-anchor="middle" fill="#4CAF50" font-size="12">✓</text>`;
      svg += `<text x="${leftX + 32}" y="${y + 18}" fill="#333" font-size="14">${this._esc(pro)}</text>`;
    });

    // 단점 헤더
    svg += `<rect x="${rightX}" y="${startY}" width="${w / 2 - 60}" height="36" rx="8" fill="#FFEBEE"/>`;
    svg += `<text x="${rightX + (w / 2 - 60) / 2}" y="${startY + 24}" text-anchor="middle" fill="#C62828" font-size="15" font-weight="bold">❌ 단점</text>`;

    allCons.forEach((con, i) => {
      const y = startY + 46 + i * itemH;
      svg += `<circle cx="${rightX + 14}" cy="${y + 14}" r="8" fill="#F44336" opacity="0.2"/>`;
      svg += `<text x="${rightX + 14}" y="${y + 18}" text-anchor="middle" fill="#F44336" font-size="12">✗</text>`;
      svg += `<text x="${rightX + 32}" y="${y + 18}" fill="#333" font-size="14">${this._esc(con)}</text>`;
    });

    // 구분선
    svg += `<line x1="${w / 2}" y1="${startY}" x2="${w / 2}" y2="${h - 20}" stroke="#E0E0E0" stroke-width="1" stroke-dasharray="4 4"/>`;
    svg += `</svg>`;

    return {
      type: 'pros_cons',
      dimensions: { width: w, height: h },
      filename: `${keyword.replace(/\s+/g, '-')}-pros-cons.svg`,
      svg,
      alt: `${keyword} 장점 단점 비교`,
      usage: '장단점 섹션에 삽입',
    };
  }

  // --- 3. 가격 비교 바 차트 ---
  _buildPriceChart(keyword, products, accent) {
    const w = 860;
    const barH = 48;
    const gap = 16;
    const h = 80 + products.length * (barH + gap) + 20;

    const prices = products.map(p => p.price?.discounted || this._randInt(20000, 300000));
    const maxPrice = Math.max(...prices);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    svg += `<rect width="${w}" height="${h}" rx="12" fill="#FFFFFF"/>`;
    svg += `<text x="${w / 2}" y="35" text-anchor="middle" fill="#1A1A2E" font-size="18" font-weight="bold">${this._esc(keyword)} 가격 비교</text>`;

    const chartX = 180, chartW = w - 220;
    const startY = 60;
    const lowestPrice = Math.min(...prices);

    products.forEach((p, i) => {
      const y = startY + i * (barH + gap);
      const price = prices[i];
      const barWidth = Math.max(40, (price / maxPrice) * chartW);
      const name = (p.title || `제품${i + 1}`).split(' ').slice(-2).join(' ');
      const isLowest = price === lowestPrice;

      // 이름
      svg += `<text x="${chartX - 10}" y="${y + barH / 2 + 5}" text-anchor="end" fill="#333" font-size="13" font-weight="${isLowest ? 'bold' : 'normal'}">${this._esc(name)}</text>`;

      // 바
      const barColor = isLowest ? accent : '#B0BEC5';
      svg += `<rect x="${chartX}" y="${y + 6}" width="${barWidth}" height="${barH - 12}" rx="6" fill="${barColor}" opacity="${isLowest ? 1 : 0.6}"/>`;

      // 가격 라벨
      svg += `<text x="${chartX + barWidth + 8}" y="${y + barH / 2 + 5}" fill="${isLowest ? accent : '#666'}" font-size="13" font-weight="${isLowest ? 'bold' : 'normal'}">${price.toLocaleString()}원${isLowest ? ' ★최저가' : ''}</text>`;
    });

    svg += `</svg>`;

    return {
      type: 'price_chart',
      dimensions: { width: w, height: h },
      filename: `${keyword.replace(/\s+/g, '-')}-price-chart.svg`,
      svg,
      alt: `${keyword} 가격 비교 차트`,
      usage: '가격 비교 섹션 또는 추천 섹션에 삽입',
    };
  }

  // --- 4. 평점 비교 ---
  _buildRatingChart(keyword, products, accent) {
    const w = 860;
    const itemH = 56;
    const h = 70 + products.length * itemH + 20;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    svg += `<rect width="${w}" height="${h}" rx="12" fill="#FFFFFF"/>`;
    svg += `<text x="${w / 2}" y="35" text-anchor="middle" fill="#1A1A2E" font-size="18" font-weight="bold">${this._esc(keyword)} 평점 비교</text>`;

    const startY = 60;
    const ratings = products.map(p => p.rating || this._randFloat(3.5, 5.0));
    const maxRating = 5;
    const barX = 200, barMaxW = 400;

    products.forEach((p, i) => {
      const y = startY + i * itemH;
      const rating = Math.round(ratings[i] * 10) / 10;
      const barW = (rating / maxRating) * barMaxW;
      const name = (p.title || `제품${i + 1}`).split(' ').slice(-2).join(' ');

      svg += `<text x="${barX - 10}" y="${y + 28}" text-anchor="end" fill="#333" font-size="13">${this._esc(name)}</text>`;

      // 배경 바
      svg += `<rect x="${barX}" y="${y + 10}" width="${barMaxW}" height="24" rx="12" fill="#F5F5F5"/>`;
      // 채움 바
      const hue = rating >= 4.5 ? accent : rating >= 4.0 ? '#FFA726' : '#EF5350';
      svg += `<rect x="${barX}" y="${y + 10}" width="${barW}" height="24" rx="12" fill="${hue}"/>`;

      // 별점 텍스트
      const stars = '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '');
      svg += `<text x="${barX + barMaxW + 12}" y="${y + 28}" fill="#333" font-size="13" font-weight="bold">${stars} ${rating}</text>`;
    });

    svg += `</svg>`;

    return {
      type: 'rating_chart',
      dimensions: { width: w, height: h },
      filename: `${keyword.replace(/\s+/g, '-')}-rating.svg`,
      svg,
      alt: `${keyword} 평점 비교`,
      usage: '상품 소개 또는 추천 섹션에 삽입',
    };
  }

  // --- 5. 순위 카드 ---
  _buildRankingCards(keyword, products, accent) {
    const w = 860;
    const cardH = 100;
    const gap = 12;
    const top3 = products.slice(0, 3);
    const h = 70 + top3.length * (cardH + gap) + 20;

    const medals = ['🥇', '🥈', '🥉'];
    const bgColors = ['#FFF8E1', '#F5F5F5', '#FBE9E7'];

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    svg += `<rect width="${w}" height="${h}" rx="12" fill="#FFFFFF"/>`;
    svg += `<text x="${w / 2}" y="35" text-anchor="middle" fill="#1A1A2E" font-size="18" font-weight="bold">${this._esc(keyword)} TOP 3 추천</text>`;

    const startY = 55;

    top3.forEach((p, i) => {
      const y = startY + i * (cardH + gap);
      const name = p.title || `${keyword} ${i + 1}위 제품`;
      const price = p.price?.discounted ? `${p.price.discounted.toLocaleString()}원` : '가격 확인';
      const rating = p.rating || (5 - i * 0.3);

      // 카드 배경
      svg += `<rect x="20" y="${y}" width="${w - 40}" height="${cardH}" rx="12" fill="${bgColors[i]}" stroke="#E0E0E0" stroke-width="1"/>`;

      // 메달
      svg += `<text x="55" y="${y + 58}" text-anchor="middle" font-size="32">${medals[i]}</text>`;

      // 상품명
      svg += `<text x="90" y="${y + 35}" fill="#1A1A2E" font-size="16" font-weight="bold">${this._esc(name.substring(0, 30))}</text>`;

      // 가격 + 평점
      svg += `<text x="90" y="${y + 60}" fill="#666" font-size="13">💰 ${price}  ⭐ ${Math.round(rating * 10) / 10}</text>`;

      // 추천 라벨
      const labels = ['가성비 최고', '성능 우수', '인기 상품'];
      svg += `<rect x="${w - 170}" y="${y + 34}" width="110" height="28" rx="14" fill="${accent}" opacity="0.15"/>`;
      svg += `<text x="${w - 115}" y="${y + 53}" text-anchor="middle" fill="${accent}" font-size="12" font-weight="bold">${labels[i]}</text>`;
    });

    svg += `</svg>`;

    return {
      type: 'ranking_cards',
      dimensions: { width: w, height: h },
      filename: `${keyword.replace(/\s+/g, '-')}-ranking.svg`,
      svg,
      alt: `${keyword} TOP 3 추천 순위`,
      usage: '글 상단 또는 추천 섹션에 삽입',
    };
  }

  // --- 유틸 ---
  _getDefaultProducts(keyword) {
    return [
      { title: `${keyword} A모델`, price: { discounted: 45000 }, rating: 4.7, pros: ['가성비 우수', '디자인 좋음', '내구성 좋음'], cons: ['색상 제한', 'AS 느림'], specs: { 용량: '500ml', 소재: '스테인리스' } },
      { title: `${keyword} B모델`, price: { discounted: 78000 }, rating: 4.3, pros: ['성능 우수', '가벼움', '세척 용이'], cons: ['가격 높음', '무게감'], specs: { 용량: '750ml', 소재: '트라이탄' } },
      { title: `${keyword} C모델`, price: { discounted: 32000 }, rating: 4.5, pros: ['가성비 우수', '편리함', '빠른 배송'], cons: ['내구성 보통'], specs: { 용량: '350ml', 소재: 'BPA-Free' } },
    ];
  }

  _esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  _randFloat(min, max) { return Math.random() * (max - min) + min; }
}

module.exports = InfographicBuilderTool;

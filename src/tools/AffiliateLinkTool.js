const Tool = require('../core/Tool');

/**
 * 어필리에이트 링크 관리 도구
 *
 * - 쿠팡 파트너스 / 네이버 애드포스트 등 제휴 링크 생성
 * - 본문 내 링크 자동 삽입
 * - 링크 클릭 추적용 태그 부여
 * - 수익화 전략 분석
 */
class AffiliateLinkTool extends Tool {
  constructor() {
    super({
      name: 'affiliate_link',
      description: '어필리에이트(제휴) 링크를 생성하고 본문에 삽입합니다.',
      parameters: {
        products: { type: 'array', description: '링크 생성할 상품 목록' },
        platform: { type: 'string', description: '플랫폼 (coupang, naver, all)', default: 'coupang' },
        partnerId: { type: 'string', description: '파트너 ID', default: 'dailyfni' },
        content: { type: 'string', description: '링크를 삽입할 본문 텍스트' },
      },
    });

    // 플랫폼별 어필리에이트 설정
    this.platforms = {
      coupang: {
        name: '쿠팡 파트너스',
        baseUrl: 'https://link.coupang.com/a',
        commission: '3~7%',
        cookieDays: 24, // 24시간
        format: (productId, partnerId, trackingId) =>
          `https://link.coupang.com/a/${productId}?itemId=${productId}&vendorItemId=${productId}&src=1032&spec=10305200&addtag=400&ctag=${trackingId}&lptag=${partnerId}&itime=${Date.now()}`,
      },
      naver: {
        name: '네이버 애드포스트',
        baseUrl: 'https://search.shopping.naver.com/gate.nhn',
        commission: '1~5%',
        cookieDays: 15,
        format: (productId, partnerId, trackingId) =>
          `https://search.shopping.naver.com/gate.nhn?id=${productId}&query=&channel=${partnerId}&tag=${trackingId}`,
      },
      elevenst: {
        name: '11번가 셀러',
        baseUrl: 'https://www.11st.co.kr/products',
        commission: '2~6%',
        cookieDays: 7,
        format: (productId, partnerId, trackingId) =>
          `https://www.11st.co.kr/products/${productId}?trCtag=${partnerId}_${trackingId}`,
      },
    };
  }

  async execute({ products = [], platform = 'coupang', partnerId = 'dailyfni', content = '' }) {
    if (products.length === 0 && !content) {
      throw new Error('상품 목록(products) 또는 본문(content)이 필요합니다.');
    }

    // 상품별 어필리에이트 링크 생성
    const links = this._generateLinks(products, platform, partnerId);

    // 본문에 링크 삽입
    let processedContent = content;
    if (content) {
      processedContent = this._insertLinks(content, links);
    }

    // 수익화 분석
    const analysis = this._analyzeRevenue(products, links, platform);

    // CTA (Call to Action) 문구 생성
    const ctas = this._generateCTAs(products, platform);

    // 공정위 문구
    const disclosure = this._getDisclosure(platform);

    return {
      links,
      processedContent,
      analysis,
      ctas,
      disclosure,
      platform: this.platforms[platform]?.name || platform,
      generatedAt: new Date().toISOString(),
    };
  }

  _generateLinks(products, platform, partnerId) {
    const platformConfig = this.platforms[platform] || this.platforms.coupang;

    return products.map((product, index) => {
      const productId = product.url?.match(/\d{6,}/) ?.[0]
        || `${this._randInt(100000, 999999)}`;
      const trackingId = `dfni_${Date.now()}_${index}`;

      const affiliateUrl = platformConfig.format(productId, partnerId, trackingId);

      return {
        productIndex: index + 1,
        productTitle: product.title || `상품 ${index + 1}`,
        originalUrl: product.url || null,
        affiliateUrl,
        trackingId,
        price: product.price?.discounted || null,
        commission: platformConfig.commission,
        shortLabel: `{{affiliate_link_${index + 1}}}`,
        htmlButton: this._generateButton(product, affiliateUrl, index),
      };
    });
  }

  _generateButton(product, url, index) {
    const title = product.title?.split(' ').slice(-3).join(' ') || `추천 상품 ${index + 1}`;
    const price = product.price?.discounted
      ? ` - ${product.price.discounted.toLocaleString()}원`
      : '';

    return {
      text: `🛒 ${title}${price} 최저가 보기`,
      url,
      style: 'primary',
      html: `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;background:#ff6b35;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:8px 0;">🛒 ${title}${price} 최저가 보기</a>`,
    };
  }

  _insertLinks(content, links) {
    let result = content;

    links.forEach(link => {
      // {{affiliate_link_N}} 플레이스홀더를 실제 링크로 교체
      const placeholder = link.shortLabel;
      const replacement = `[${link.htmlButton.text}](${link.affiliateUrl})`;
      result = result.replace(placeholder, replacement);
    });

    return result;
  }

  _analyzeRevenue(products, links, platform) {
    const platformConfig = this.platforms[platform] || this.platforms.coupang;
    const commissionRange = platformConfig.commission.split('~').map(s => parseFloat(s));
    const avgCommission = (commissionRange[0] + (commissionRange[1] || commissionRange[0])) / 2 / 100;

    const productPrices = products
      .map(p => p.price?.discounted || 0)
      .filter(p => p > 0);

    const avgPrice = productPrices.length > 0
      ? Math.round(productPrices.reduce((a, b) => a + b, 0) / productPrices.length)
      : 30000;

    const avgCommissionPerSale = Math.round(avgPrice * avgCommission);

    // 예상 수익 시나리오
    const scenarios = [
      { label: '일 방문자 100명, 전환율 2%', dailySales: 2, monthly: avgCommissionPerSale * 2 * 30 },
      { label: '일 방문자 500명, 전환율 3%', dailySales: 15, monthly: avgCommissionPerSale * 15 * 30 },
      { label: '일 방문자 1,000명, 전환율 5%', dailySales: 50, monthly: avgCommissionPerSale * 50 * 30 },
    ];

    return {
      platform: platformConfig.name,
      commission: platformConfig.commission,
      cookieWindow: `${platformConfig.cookieDays}${platformConfig.cookieDays >= 24 ? '시간' : '일'}`,
      avgProductPrice: `${avgPrice.toLocaleString()}원`,
      avgCommissionPerSale: `${avgCommissionPerSale.toLocaleString()}원`,
      revenueScenarios: scenarios.map(s => ({
        ...s,
        monthly: `${s.monthly.toLocaleString()}원/월`,
      })),
      tips: [
        '상위 노출 키워드를 공략하면 일 방문자를 효과적으로 늘릴 수 있어요.',
        '글 내 CTA 버튼을 눈에 띄게 배치하세요.',
        '시즌 키워드(연말 선물, 여름 가전 등)를 활용하면 전환율이 높아져요.',
        '비교 글이 단일 리뷰보다 전환율이 1.5배 이상 높은 경향이 있어요.',
      ],
    };
  }

  _generateCTAs(products, platform) {
    const templates = [
      { position: '상품 소개 직후', text: '👉 최저가 확인하러 가기', style: 'inline' },
      { position: '장단점 섹션 후', text: '🛒 할인가로 구매하기', style: 'button' },
      { position: '비교표 아래', text: '💰 현재 최저가 비교하기', style: 'inline' },
      { position: '마무리 직전', text: '⭐ 오늘 특가 확인하기', style: 'button' },
    ];

    return {
      recommended: templates,
      bestPractice: [
        '글 내 CTA는 2~3개가 적당 (너무 많으면 스팸 느낌)',
        '가격이 저렴할 때(세일 기간) CTA를 더 강조하세요',
        '"이 포스팅은 쿠팡 파트너스 활동의 일환으로~" 고지 문구 필수',
        'CTA 버튼 색상은 글 배경과 대비되는 색으로',
      ],
    };
  }

  _getDisclosure(platform) {
    const disclosures = {
      coupang: {
        short: '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
        full: '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다. 다만, 본 리뷰는 솔직한 사용 경험을 바탕으로 작성되었으며, 제휴 관계가 리뷰 내용에 영향을 미치지 않습니다.',
        placement: '글 하단 (마무리 섹션 아래)',
        required: true,
      },
      naver: {
        short: '이 글에는 제휴 링크가 포함되어 있습니다.',
        full: '이 글에는 네이버 제휴 링크가 포함되어 있으며, 링크를 통한 구매 시 블로거에게 소정의 수수료가 지급됩니다.',
        placement: '글 상단 또는 하단',
        required: true,
      },
      elevenst: {
        short: '이 글에는 11번가 제휴 링크가 포함되어 있습니다.',
        full: '이 글에는 11번가 제휴 링크가 포함되어 있으며, 구매 시 수수료가 지급될 수 있습니다.',
        placement: '글 하단',
        required: true,
      },
    };

    return disclosures[platform] || disclosures.coupang;
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = AffiliateLinkTool;

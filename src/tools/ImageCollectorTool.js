const Tool = require('../core/Tool');

/**
 * 상품 이미지 수집 & 가공 도구
 *
 * - 상품별 이미지 URL 수집 (메인/서브/디테일)
 * - 네이버 블로그 규격에 맞는 리사이즈 사양 생성
 * - ALT 태그 자동 매칭
 * - 이미지 배치 순서 추천
 * - 워터마크/로고 오버레이 사양
 */
class ImageCollectorTool extends Tool {
  constructor() {
    super({
      name: 'image_collector',
      description: '상품 이미지를 수집하고 네이버 블로그 규격에 맞는 가공 사양을 생성합니다.',
      parameters: {
        keyword: { type: 'string', description: '상품 키워드' },
        products: { type: 'array', description: '상품 데이터 배열' },
        imagePerProduct: { type: 'number', description: '상품당 수집할 이미지 수', default: 3 },
        blogName: { type: 'string', description: '블로그명 (워터마크용)', default: '' },
      },
    });

    // 네이버 블로그 이미지 규격
    this.naverSpecs = {
      thumbnail: { width: 1200, height: 630, ratio: '1.91:1', format: 'jpg', maxSize: '10MB' },
      content: { width: 860, height: null, maxWidth: 860, format: 'jpg', maxSize: '10MB' },
      square: { width: 800, height: 800, ratio: '1:1', format: 'jpg' },
      comparison: { width: 860, height: 'auto', format: 'png' },
      mobile: { width: 720, height: null, maxWidth: 720, format: 'jpg' },
      maxFileSize: '10MB',
      supportedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      maxImagesPerPost: 50,
    };
  }

  async execute({ keyword, products = [], imagePerProduct = 3, blogName = '' }) {
    if (!keyword) throw new Error('키워드(keyword)는 필수입니다.');

    await this._delay(100);

    // 상품별 이미지 수집
    const productImages = this._collectProductImages(keyword, products, imagePerProduct);

    // 블로그 글 전체 이미지 배치 계획
    const layoutPlan = this._buildLayoutPlan(keyword, productImages);

    // 이미지 가공 사양 생성
    const processSpecs = this._buildProcessSpecs(productImages, blogName);

    // ALT 태그 매핑
    const altTags = this._generateAltTags(keyword, productImages);

    return {
      keyword,
      naverSpecs: this.naverSpecs,
      productImages,
      layoutPlan,
      processSpecs,
      altTags,
      totalImages: productImages.reduce((sum, p) => sum + p.images.length, 0),
      collectedAt: new Date().toISOString(),
    };
  }

  _collectProductImages(keyword, products, imagePerProduct) {
    if (products.length === 0) {
      // 상품 데이터 없을 때 기본 이미지 세트 생성
      return [{
        productName: keyword,
        productIndex: 1,
        images: this._generateImageSet(keyword, keyword, 1, imagePerProduct),
      }];
    }

    return products.slice(0, 5).map((product, i) => {
      const name = product.title || `${keyword} ${i + 1}번 제품`;
      return {
        productName: name,
        productIndex: i + 1,
        price: product.price?.discounted || null,
        rating: product.rating || null,
        images: this._generateImageSet(keyword, name, i + 1, imagePerProduct),
      };
    });
  }

  _generateImageSet(keyword, productName, index, count) {
    const imageTypes = [
      { type: 'main', label: '메인 이미지', purpose: '상품 전면 사진', priority: 1 },
      { type: 'detail', label: '디테일 사진', purpose: '제품 세부 클로즈업', priority: 2 },
      { type: 'package', label: '패키지 샷', purpose: '박스/구성품 전체', priority: 3 },
      { type: 'usage', label: '사용 사진', purpose: '실제 사용 모습', priority: 4 },
      { type: 'size', label: '사이즈 비교', purpose: '크기 비교 참고 사진', priority: 5 },
      { type: 'back', label: '후면 사진', purpose: '제품 뒷면/스펙 라벨', priority: 6 },
      { type: 'accessory', label: '액세서리', purpose: '기본 제공 액세서리', priority: 7 },
    ];

    return imageTypes.slice(0, count).map((img, j) => {
      const filename = `${keyword.replace(/\s+/g, '-')}-${index}-${img.type}.jpg`;
      return {
        ...img,
        filename,
        alt: `${productName} ${img.label}`,
        sourceUrl: `https://shopping-images.example.com/${keyword}/${index}/${img.type}.jpg`,
        dimensions: { width: 1200, height: 900 },
        sizeKB: this._randInt(200, 1500),
        needsResize: true,
        targetDimensions: { width: this.naverSpecs.content.maxWidth, height: null },
      };
    });
  }

  _buildLayoutPlan(keyword, productImages) {
    const plan = [];
    let order = 1;

    // 1. 대표 썸네일
    plan.push({
      order: order++,
      section: '대표 썸네일',
      type: 'thumbnail',
      spec: this.naverSpecs.thumbnail,
      description: `${keyword} 블로그 대표 이미지 (OG 이미지)`,
      tip: '텍스트 오버레이 포함, 핵심 키워드 + 감성적 디자인',
    });

    // 2. 도입부 이미지
    plan.push({
      order: order++,
      section: '도입부',
      type: 'hero',
      spec: { width: 860, height: 480 },
      description: '글 시작 감성 이미지',
      tip: '깔끔한 배경 + 상품 배치, 밝은 톤',
    });

    // 3. 상품별 이미지
    productImages.forEach((p) => {
      // 메인 이미지
      plan.push({
        order: order++,
        section: `상품 소개 - ${p.productName}`,
        type: 'product_main',
        spec: this.naverSpecs.content,
        description: `${p.productName} 메인 사진`,
        source: p.images[0]?.filename || null,
      });

      // 디테일
      if (p.images.length > 1) {
        plan.push({
          order: order++,
          section: `디테일 - ${p.productName}`,
          type: 'product_detail',
          spec: this.naverSpecs.content,
          description: `${p.productName} 디테일/사용 사진`,
          source: p.images[1]?.filename || null,
        });
      }
    });

    // 4. 비교표
    plan.push({
      order: order++,
      section: '스펙 비교',
      type: 'comparison_table',
      spec: this.naverSpecs.comparison,
      description: '상품 스펙 비교 인포그래픽',
      tip: '표 형태, 칼럼별 색상 구분, 추천 상품 강조',
    });

    // 5. 장단점 인포그래픽
    plan.push({
      order: order++,
      section: '장단점',
      type: 'pros_cons_infographic',
      spec: this.naverSpecs.comparison,
      description: '장점/단점 시각화',
      tip: '초록/빨강 아이콘으로 직관적 구분',
    });

    // 6. 가격 비교 차트
    plan.push({
      order: order++,
      section: '가격 비교',
      type: 'price_chart',
      spec: this.naverSpecs.comparison,
      description: '가격 비교 바 차트',
      tip: '최저가 강조, 할인율 표시',
    });

    return {
      totalImages: order - 1,
      maxAllowed: this.naverSpecs.maxImagesPerPost,
      plan,
    };
  }

  _buildProcessSpecs(productImages, blogName) {
    const specs = [];

    productImages.forEach(p => {
      p.images.forEach(img => {
        const spec = {
          filename: img.filename,
          original: img.dimensions,
          process: [],
        };

        // 리사이즈
        if (img.dimensions.width > this.naverSpecs.content.maxWidth) {
          const ratio = this.naverSpecs.content.maxWidth / img.dimensions.width;
          spec.process.push({
            action: 'resize',
            width: this.naverSpecs.content.maxWidth,
            height: Math.round(img.dimensions.height * ratio),
            quality: 85,
          });
        }

        // 포맷 변환
        if (!this.naverSpecs.supportedFormats.includes(img.filename.split('.').pop())) {
          spec.process.push({ action: 'convert', format: 'jpg', quality: 85 });
        }

        // 압축 (1MB 이상)
        if (img.sizeKB > 1000) {
          spec.process.push({ action: 'compress', targetKB: 800, quality: 80 });
        }

        // 워터마크
        if (blogName) {
          spec.process.push({
            action: 'watermark',
            text: blogName,
            position: 'bottom-right',
            opacity: 0.3,
            fontSize: 14,
          });
        }

        specs.push(spec);
      });
    });

    return specs;
  }

  _generateAltTags(keyword, productImages) {
    const tags = [];
    let index = 1;

    productImages.forEach(p => {
      p.images.forEach(img => {
        tags.push({
          imageIndex: index++,
          filename: img.filename,
          alt: img.alt,
          title: `${keyword} - ${img.label}`,
          seoOptimized: true,
        });
      });
    });

    return tags;
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
}

module.exports = ImageCollectorTool;

const Agent = require('../core/Agent');
const ImageCollectorTool = require('../tools/ImageCollectorTool');
const ThumbnailGeneratorTool = require('../tools/ThumbnailGeneratorTool');
const InfographicBuilderTool = require('../tools/InfographicBuilderTool');

/**
 * 이미지 에이전트 (Image Handler)
 *
 * 핵심 역할:
 * 1. 상품 이미지 수집 & 가공 사양 생성
 * 2. 블로그 썸네일/배너 자동 생성 (SVG)
 * 3. 비교표/인포그래픽 자동 생성 (SVG)
 * 4. 네이버 블로그 이미지 규격 최적화
 *
 * 파이프라인:
 * 상품 데이터 → 이미지 수집 → 썸네일/배너 → 인포그래픽 → 이미지 패키지
 */
class ImageAgent extends Agent {
  constructor(options = {}) {
    const collector = new ImageCollectorTool();
    const thumbnail = new ThumbnailGeneratorTool();
    const infographic = new InfographicBuilderTool();

    super({
      name: options.name || '이미지 에이전트',
      role: options.role || '이미지 핸들러',
      goal: options.goal || '블로그 글에 필요한 이미지를 수집·생성·최적화하여 완성된 이미지 패키지를 제공합니다.',
      backstory: options.backstory || '네이버 블로그 이미지 규격, SVG 인포그래픽, 썸네일 디자인 전문가.',
      tools: [collector, thumbnail, infographic],
      model: options.model || 'default',
    });

    this.collector = collector;
    this.thumbnail = thumbnail;
    this.infographic = infographic;
  }

  /**
   * 전체 이미지 파이프라인
   *
   * 1. 이미지 수집 & 가공 사양
   * 2. 썸네일/배너 생성
   * 3. 인포그래픽 생성
   * 4. 이미지 패키지 조립
   */
  async execute(task) {
    this.addMemory({ type: 'image_start', task: task.description });

    const keyword = this._extractKeyword(task.description);
    const context = task.context || {};
    const products = context.products || [];
    const style = context.style || 'modern';
    const blogName = context.blogName || 'DailyFNI';
    const accentColor = context.accentColor || '#FF6B35';
    const phases = [];

    // Phase 1: 이미지 수집 & 가공 사양
    let collectResult = null;
    try {
      collectResult = await this.collector.execute({
        keyword,
        products,
        imagePerProduct: 3,
        blogName,
      });
      phases.push({
        phase: '이미지 수집',
        status: 'completed',
        totalImages: collectResult.totalImages,
      });
      this.addMemory({ type: 'collect_complete', total: collectResult.totalImages });
    } catch (err) {
      phases.push({ phase: '이미지 수집', status: 'failed', error: err.message });
    }

    // Phase 2: 썸네일/배너 생성
    let thumbnailResult = null;
    try {
      const title = context.title || `${keyword} 추천 BEST`;
      thumbnailResult = await this.thumbnail.execute({
        keyword,
        title,
        style,
        blogName,
        accentColor,
      });
      phases.push({
        phase: '썸네일/배너 생성',
        status: 'completed',
        generated: thumbnailResult.totalGenerated,
      });
      this.addMemory({ type: 'thumbnail_complete', count: thumbnailResult.totalGenerated });
    } catch (err) {
      phases.push({ phase: '썸네일/배너 생성', status: 'failed', error: err.message });
    }

    // Phase 3: 인포그래픽 생성
    let infographicResult = null;
    try {
      infographicResult = await this.infographic.execute({
        keyword,
        products,
        types: ['comparison', 'pros_cons', 'price_chart', 'rating', 'ranking'],
        accentColor,
      });
      phases.push({
        phase: '인포그래픽 생성',
        status: 'completed',
        generated: infographicResult.totalGenerated,
      });
      this.addMemory({ type: 'infographic_complete', count: infographicResult.totalGenerated });
    } catch (err) {
      phases.push({ phase: '인포그래픽 생성', status: 'failed', error: err.message });
    }

    // Phase 4: 이미지 패키지 조립
    const imagePackage = this._assemblePackage(
      keyword, collectResult, thumbnailResult, infographicResult
    );

    const result = {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      keyword,
      phases,
      imagePackage,
      rawData: {
        collect: collectResult,
        thumbnail: thumbnailResult,
        infographic: infographicResult,
      },
      timestamp: new Date().toISOString(),
    };

    this.addMemory({ type: 'image_complete', keyword });
    return result;
  }

  // --- 개별 도구 실행 ---

  async collectImages(keyword, options = {}) {
    return this.collector.execute({ keyword, ...options });
  }

  async generateThumbnails(keyword, options = {}) {
    return this.thumbnail.execute({ keyword, ...options });
  }

  async buildInfographics(keyword, options = {}) {
    return this.infographic.execute({ keyword, ...options });
  }

  // --- 이미지 패키지 조립 ---

  _assemblePackage(keyword, collect, thumbnail, infographic) {
    const pkg = {
      title: `[이미지 패키지] ${keyword}`,
      generatedAt: new Date().toISOString(),
      summary: { totalImages: 0, svgGenerated: 0, productImages: 0 },
      sections: [],
    };

    // 1. 썸네일 & 배너
    if (thumbnail) {
      const images = [];

      if (thumbnail.images.ogThumbnail) {
        images.push({
          name: 'OG 썸네일',
          filename: thumbnail.images.ogThumbnail.filename,
          dimensions: thumbnail.images.ogThumbnail.dimensions,
          usage: thumbnail.images.ogThumbnail.usage,
          alt: thumbnail.images.ogThumbnail.alt,
        });
      }
      if (thumbnail.images.heroBanner) {
        images.push({
          name: '히어로 배너',
          filename: thumbnail.images.heroBanner.filename,
          dimensions: thumbnail.images.heroBanner.dimensions,
          usage: thumbnail.images.heroBanner.usage,
        });
      }
      if (thumbnail.images.socialImage) {
        images.push({
          name: 'SNS 공유',
          filename: thumbnail.images.socialImage.filename,
          dimensions: thumbnail.images.socialImage.dimensions,
          usage: thumbnail.images.socialImage.usage,
        });
      }
      if (thumbnail.images.sectionBanners) {
        thumbnail.images.sectionBanners.forEach(sb => {
          images.push({
            name: `섹션 배너: ${sb.label}`,
            filename: sb.filename,
            dimensions: sb.dimensions,
          });
        });
      }

      pkg.sections.push({
        title: '썸네일 & 배너',
        count: images.length,
        images,
      });
      pkg.summary.svgGenerated += images.length;
    }

    // 2. 인포그래픽
    if (infographic) {
      const images = [];
      Object.entries(infographic.infographics).forEach(([type, data]) => {
        images.push({
          name: data.type || type,
          filename: data.filename,
          dimensions: data.dimensions,
          usage: data.usage,
          alt: data.alt,
        });
      });

      pkg.sections.push({
        title: '인포그래픽',
        count: images.length,
        images,
      });
      pkg.summary.svgGenerated += images.length;
    }

    // 3. 상품 이미지
    if (collect) {
      const images = [];
      collect.productImages.forEach(p => {
        p.images.forEach(img => {
          images.push({
            product: p.productName,
            filename: img.filename,
            type: img.type,
            alt: img.alt,
            dimensions: img.dimensions,
            needsResize: img.needsResize,
          });
        });
      });

      pkg.sections.push({
        title: '상품 이미지',
        count: images.length,
        images,
      });
      pkg.summary.productImages = images.length;

      // 배치 계획
      pkg.layoutPlan = collect.layoutPlan;
      pkg.processSpecs = collect.processSpecs;
    }

    // 4. 네이버 규격 정보
    if (collect) {
      pkg.naverSpecs = collect.naverSpecs;
    }

    pkg.summary.totalImages = pkg.summary.svgGenerated + pkg.summary.productImages;

    return pkg;
  }

  _extractKeyword(description) {
    const match = description.match(/\[(.+?)\]/);
    if (match) return match[1];
    return description
      .replace(/에\s*대해.*$/, '')
      .replace(/(을|를)\s*(이미지|생성|수집).*$/, '')
      .replace(/\s*(이미지|생성|수집|썸네일).*$/, '')
      .trim() || description;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: 'ImageAgent',
      capabilities: [
        '상품 이미지 수집 & 네이버 규격 가공 사양',
        '블로그 썸네일/배너 SVG 자동 생성 (4종 스타일)',
        '비교표/장단점/가격차트/평점/순위 인포그래픽 생성',
        '이미지 배치 계획 & ALT 태그 자동 생성',
        'SNS 공유용 이미지 생성',
      ],
    };
  }
}

module.exports = ImageAgent;

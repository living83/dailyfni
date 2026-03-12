const Agent = require('../core/Agent');
const ImageCollectorTool = require('../tools/ImageCollectorTool');
const ThumbnailGeneratorTool = require('../tools/ThumbnailGeneratorTool');
const InfographicBuilderTool = require('../tools/InfographicBuilderTool');
const UIFriendScreenshotTool = require('../tools/UIFriendScreenshotTool');

/**
 * 이미지 에이전트 (Image Handler)
 *
 * 핵심 역할:
 * 1. 상품 이미지 수집 & 가공 사양 생성
 * 2. 블로그 썸네일/배너 자동 생성 (SVG)
 * 3. 비교표/인포그래픽 자동 생성 (SVG)
 * 4. 네이버 블로그 이미지 규격 최적화
 * 5. UI-Friend-MCP 통해 React 템플릿 기반 대문 이미지 생성 (PNG)
 *
 * 파이프라인:
 * 상품 데이터 → 이미지 수집 → 썸네일/배너 → 인포그래픽 → 대문이미지 → 이미지 패키지
 */
class ImageAgent extends Agent {
  constructor(options = {}) {
    const collector = new ImageCollectorTool();
    const thumbnail = new ThumbnailGeneratorTool();
    const infographic = new InfographicBuilderTool();
    const uiScreenshot = new UIFriendScreenshotTool(options.uiFriendOptions || {});

    super({
      name: options.name || '이미지 에이전트',
      role: options.role || '이미지 핸들러',
      goal: options.goal || '블로그 글에 필요한 이미지를 수집·생성·최적화하여 완성된 이미지 패키지를 제공합니다.',
      backstory: options.backstory || '네이버 블로그 이미지 규격, SVG 인포그래픽, 썸네일 디자인, React 템플릿 기반 대문이미지 전문가.',
      tools: [collector, thumbnail, infographic, uiScreenshot],
      model: options.model || 'default',
    });

    this.collector = collector;
    this.thumbnail = thumbnail;
    this.infographic = infographic;
    this.uiScreenshot = uiScreenshot;
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

    // Phase 4: 대문이미지 생성 (UI-Friend-MCP)
    let coverResult = null;
    try {
      coverResult = await this.generateCoverImage(keyword, {
        title: context.title,
        subtitle: context.subtitle,
        badge: context.badge,
        template: context.coverTemplate,
        accent: context.coverAccent,
        theme: context.coverTheme,
      });
      phases.push({
        phase: '대문이미지 생성',
        status: 'completed',
        filePath: coverResult.filePath,
      });
      this.addMemory({ type: 'cover_complete', filePath: coverResult.filePath });
    } catch (err) {
      phases.push({ phase: '대문이미지 생성', status: 'skipped', error: err.message });
    }

    // Phase 5: 이미지 패키지 조립
    const imagePackage = this._assemblePackage(
      keyword, collectResult, thumbnailResult, infographicResult, coverResult
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

  /**
   * UI-Friend-MCP를 통해 대문이미지(커버 이미지)를 생성한다.
   *
   * 키워드/제목에 따라 적절한 React 템플릿을 자동 선택:
   *   - TOP/BEST + 숫자 → naver_ranking_cover
   *   - VS/비교 → naver_comparison_cover
   *   - 리뷰/후기/별점 → naver_review_cover
   *   - 기본 → naver_product_cover
   *
   * @param {string} keyword - 메인 키워드
   * @param {Object} options
   * @param {string} [options.title] - 대문 제목 (미지정 시 keyword 기반 자동 생성)
   * @param {string} [options.subtitle] - 서브 제목
   * @param {string} [options.badge] - 배지 텍스트
   * @param {string} [options.template] - 강제 템플릿 이름
   * @param {string} [options.accent] - 강조색 이름 (gold, neon, cyan, amber)
   * @param {string} [options.theme] - 배경 테마 (navy, dark, forest, midnight)
   * @returns {Object} { filePath, width, height, fileSize, template }
   */
  async generateCoverImage(keyword, options = {}) {
    const title = options.title || `${keyword} 추천 BEST`;
    const template = options.template || this._selectCoverTemplate(title);

    const data = {
      title,
      subtitle: options.subtitle || '가격 비교 · 실사용 후기 · 장단점 총정리',
      badge: options.badge || '',
      accent: options.accent || 'gold',
      theme: options.theme || 'navy',
    };

    return this.uiScreenshot.execute({
      mode: 'template',
      template,
      data,
      width: 960,
      height: 540,
    });
  }

  /**
   * 제목 패턴에 따라 적절한 대문이미지 템플릿을 선택한다.
   */
  _selectCoverTemplate(title) {
    const t = title.toLowerCase();
    if (/top\s*\d|best\s*\d|순위|랭킹/i.test(t)) return 'naver_ranking_cover';
    if (/vs|비교|대결/i.test(t)) return 'naver_comparison_cover';
    if (/리뷰|후기|별점|솔직/i.test(t)) return 'naver_review_cover';
    return 'naver_product_cover';
  }

  // --- 이미지 패키지 조립 ---

  _assemblePackage(keyword, collect, thumbnail, infographic, cover) {
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

    // 4. 대문이미지 (UI-Friend-MCP)
    if (cover) {
      pkg.sections.push({
        title: '대문이미지',
        count: 1,
        images: [{
          name: '대문이미지 (PNG)',
          filePath: cover.filePath,
          dimensions: { width: cover.width, height: cover.height },
          format: 'png',
          fileSize: cover.fileSize,
          template: cover.template,
          usage: '네이버 블로그 본문 최상단 대문 이미지',
        }],
      });
      pkg.summary.pngGenerated = (pkg.summary.pngGenerated || 0) + 1;
    }

    // 5. 네이버 규격 정보
    if (collect) {
      pkg.naverSpecs = collect.naverSpecs;
    }

    pkg.summary.totalImages = pkg.summary.svgGenerated + pkg.summary.productImages + (pkg.summary.pngGenerated || 0);

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
        'UI-Friend-MCP 기반 React 템플릿 대문이미지 PNG 생성',
      ],
    };
  }
}

module.exports = ImageAgent;

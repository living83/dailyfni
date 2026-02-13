const Tool = require('../core/Tool');

/**
 * 썸네일 & 배너 생성 도구
 *
 * SVG 기반으로 블로그 대표 이미지를 생성합니다.
 * - 네이버 블로그 OG 이미지 (1200x630)
 * - 상단 배너 이미지
 * - 섹션 구분 배너
 * - SNS 공유용 이미지
 */
class ThumbnailGeneratorTool extends Tool {
  constructor() {
    super({
      name: 'thumbnail_generator',
      description: '블로그 대표 이미지(썸네일), 배너, 섹션 구분 이미지를 SVG로 생성합니다.',
      parameters: {
        keyword: { type: 'string', description: '메인 키워드' },
        title: { type: 'string', description: '블로그 글 제목' },
        style: { type: 'string', description: '스타일 (modern, minimal, bold, warm)', default: 'modern' },
        blogName: { type: 'string', description: '블로그 이름', default: 'DailyFNI' },
        accentColor: { type: 'string', description: '강조 색상 (hex)', default: '#FF6B35' },
      },
    });

    this.styles = {
      modern: {
        bg: '#FFFFFF',
        text: '#1A1A2E',
        accent: '#FF6B35',
        subText: '#666666',
        font: 'Pretendard, sans-serif',
        borderRadius: 16,
      },
      minimal: {
        bg: '#FAFAFA',
        text: '#333333',
        accent: '#2196F3',
        subText: '#888888',
        font: 'Noto Sans KR, sans-serif',
        borderRadius: 8,
      },
      bold: {
        bg: '#1A1A2E',
        text: '#FFFFFF',
        accent: '#E94560',
        subText: '#CCCCCC',
        font: 'Black Han Sans, sans-serif',
        borderRadius: 0,
      },
      warm: {
        bg: '#FFF8F0',
        text: '#3D2C2E',
        accent: '#E07A5F',
        subText: '#8B7355',
        font: 'Nanum Gothic, sans-serif',
        borderRadius: 20,
      },
    };
  }

  async execute({ keyword, title, style = 'modern', blogName = 'DailyFNI', accentColor }) {
    if (!keyword) throw new Error('키워드(keyword)는 필수입니다.');

    const displayTitle = title || `${keyword} 추천 BEST`;
    const theme = { ...this.styles[style] || this.styles.modern };
    if (accentColor) theme.accent = accentColor;

    // 1. OG 썸네일 (1200x630) - 가장 중요
    const ogThumbnail = this._generateOGThumbnail(keyword, displayTitle, theme, blogName);

    // 2. 상단 히어로 배너 (860x480)
    const heroBanner = this._generateHeroBanner(keyword, displayTitle, theme, blogName);

    // 3. 섹션 구분 배너 세트 (860x200)
    const sectionBanners = this._generateSectionBanners(keyword, theme);

    // 4. SNS 공유 이미지 (정사각 800x800)
    const socialImage = this._generateSocialImage(keyword, displayTitle, theme, blogName);

    // 5. 사용 가이드
    const guide = this._getUsageGuide();

    return {
      keyword,
      title: displayTitle,
      style,
      images: {
        ogThumbnail,
        heroBanner,
        sectionBanners,
        socialImage,
      },
      totalGenerated: 4 + sectionBanners.length,
      guide,
      generatedAt: new Date().toISOString(),
    };
  }

  // --- OG 이미지 (1200 x 630) ---
  _generateOGThumbnail(keyword, title, theme, blogName) {
    const w = 1200, h = 630;
    // 제목을 줄바꿈 처리
    const lines = this._wrapText(title, 16);
    const titleY = h / 2 - (lines.length * 50) / 2;

    let titleSvg = '';
    lines.forEach((line, i) => {
      titleSvg += `<text x="${w / 2}" y="${titleY + i * 56}" text-anchor="middle" fill="${theme.text}" font-size="46" font-weight="bold" font-family="${theme.font}">${this._escXml(line)}</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" rx="${theme.borderRadius}" fill="${theme.bg}"/>
  <rect x="40" y="40" width="${w - 80}" height="${h - 80}" rx="${theme.borderRadius}" fill="none" stroke="${theme.accent}" stroke-width="3" stroke-dasharray="8 4"/>
  <rect x="0" y="0" width="8" height="${h}" fill="${theme.accent}"/>
  ${titleSvg}
  <text x="${w / 2}" y="${titleY + lines.length * 56 + 30}" text-anchor="middle" fill="${theme.subText}" font-size="22" font-family="${theme.font}">가격 비교 · 실사용 후기 · 장단점 총정리</text>
  <rect x="${w / 2 - 100}" y="${h - 100}" width="200" height="40" rx="20" fill="${theme.accent}"/>
  <text x="${w / 2}" y="${h - 74}" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold" font-family="${theme.font}">${this._escXml(blogName)}</text>
  <text x="${w - 60}" y="${h - 30}" text-anchor="end" fill="${theme.subText}" font-size="14" font-family="${theme.font}">${new Date().getFullYear()}</text>
</svg>`;

    return {
      type: 'og_thumbnail',
      dimensions: { width: w, height: h },
      format: 'svg',
      filename: `${keyword.replace(/\s+/g, '-')}-og-thumbnail.svg`,
      svg,
      usage: '네이버 블로그 대표 이미지 (OG 태그, 검색 결과 노출)',
      alt: `${keyword} 추천 비교 리뷰 - ${blogName}`,
    };
  }

  // --- 히어로 배너 (860 x 480) ---
  _generateHeroBanner(keyword, title, theme, blogName) {
    const w = 860, h = 480;
    const lines = this._wrapText(title, 14);
    const titleY = h / 2 - 30;

    let titleSvg = '';
    lines.forEach((line, i) => {
      titleSvg += `<text x="${w / 2}" y="${titleY + i * 52}" text-anchor="middle" fill="${theme.text}" font-size="40" font-weight="bold" font-family="${theme.font}">${this._escXml(line)}</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.bg};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${theme.accent};stop-opacity:0.08"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="${theme.borderRadius}" fill="url(#grad1)"/>
  <circle cx="${w - 80}" cy="80" r="120" fill="${theme.accent}" opacity="0.06"/>
  <circle cx="80" cy="${h - 60}" r="80" fill="${theme.accent}" opacity="0.04"/>
  ${titleSvg}
  <text x="${w / 2}" y="${titleY + lines.length * 52 + 25}" text-anchor="middle" fill="${theme.subText}" font-size="18" font-family="${theme.font}">실사용 후기 기반 · 가격 비교 · 장단점 정리</text>
  <line x1="${w / 2 - 40}" y1="${titleY - 40}" x2="${w / 2 + 40}" y2="${titleY - 40}" stroke="${theme.accent}" stroke-width="3"/>
  <text x="${w / 2}" y="${h - 35}" text-anchor="middle" fill="${theme.subText}" font-size="14" font-family="${theme.font}">by ${this._escXml(blogName)}</text>
</svg>`;

    return {
      type: 'hero_banner',
      dimensions: { width: w, height: h },
      format: 'svg',
      filename: `${keyword.replace(/\s+/g, '-')}-hero-banner.svg`,
      svg,
      usage: '블로그 글 최상단 히어로 이미지',
      alt: `${keyword} 리뷰 가이드`,
    };
  }

  // --- 섹션 배너 세트 (860 x 160) ---
  _generateSectionBanners(keyword, theme) {
    const sections = [
      { id: 'product_intro', label: '상품 소개', icon: '📦', emoji: '🛍️' },
      { id: 'spec_comparison', label: '스펙 비교', icon: '📊', emoji: '🔍' },
      { id: 'pros_cons', label: '장단점 분석', icon: '⚖️', emoji: '✅' },
      { id: 'recommendation', label: '구매 추천', icon: '🛒', emoji: '⭐' },
    ];

    const w = 860, h = 160;

    return sections.map(sec => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" rx="${theme.borderRadius}" fill="${theme.bg}"/>
  <rect x="0" y="0" width="${w}" height="${h}" rx="${theme.borderRadius}" fill="${theme.accent}" opacity="0.06"/>
  <rect x="0" y="0" width="6" height="${h}" fill="${theme.accent}"/>
  <text x="60" y="${h / 2 + 4}" fill="${theme.accent}" font-size="36" font-family="${theme.font}">${sec.emoji}</text>
  <text x="110" y="${h / 2 + 2}" fill="${theme.text}" font-size="28" font-weight="bold" font-family="${theme.font}">${keyword} ${sec.label}</text>
  <line x1="110" y1="${h / 2 + 16}" x2="${110 + (keyword.length + sec.label.length) * 18}" y2="${h / 2 + 16}" stroke="${theme.accent}" stroke-width="2" opacity="0.4"/>
</svg>`;

      return {
        sectionId: sec.id,
        label: sec.label,
        dimensions: { width: w, height: h },
        format: 'svg',
        filename: `${keyword.replace(/\s+/g, '-')}-section-${sec.id}.svg`,
        svg,
        alt: `${keyword} ${sec.label}`,
      };
    });
  }

  // --- SNS 공유 이미지 (800 x 800) ---
  _generateSocialImage(keyword, title, theme, blogName) {
    const w = 800, h = 800;
    const lines = this._wrapText(title, 10);
    const titleY = h / 2 - 20;

    let titleSvg = '';
    lines.forEach((line, i) => {
      titleSvg += `<text x="${w / 2}" y="${titleY + i * 55}" text-anchor="middle" fill="${theme.text}" font-size="42" font-weight="bold" font-family="${theme.font}">${this._escXml(line)}</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${theme.bg}"/>
  <rect x="30" y="30" width="${w - 60}" height="${h - 60}" rx="${theme.borderRadius}" fill="none" stroke="${theme.accent}" stroke-width="2"/>
  <rect x="${w / 2 - 60}" y="60" width="120" height="4" rx="2" fill="${theme.accent}"/>
  ${titleSvg}
  <text x="${w / 2}" y="${titleY + lines.length * 55 + 30}" text-anchor="middle" fill="${theme.subText}" font-size="20" font-family="${theme.font}">비교 리뷰 · 실사용 후기</text>
  <rect x="${w / 2 - 80}" y="${h - 90}" width="160" height="36" rx="18" fill="${theme.accent}"/>
  <text x="${w / 2}" y="${h - 67}" text-anchor="middle" fill="#FFFFFF" font-size="15" font-weight="bold" font-family="${theme.font}">${this._escXml(blogName)}</text>
</svg>`;

    return {
      type: 'social_square',
      dimensions: { width: w, height: h },
      format: 'svg',
      filename: `${keyword.replace(/\s+/g, '-')}-social.svg`,
      svg,
      usage: 'SNS 공유용 (인스타그램, 카카오톡)',
      alt: `${keyword} 추천 리뷰`,
    };
  }

  _getUsageGuide() {
    return {
      ogThumbnail: 'SEO 탭 → 대표 이미지로 등록. 네이버/카카오 검색 결과에 노출됨.',
      heroBanner: '글 본문 최상단에 삽입. 첫인상 결정.',
      sectionBanners: '각 섹션(상품소개, 스펙비교, 장단점, 추천) 시작 전에 삽입. 가독성 향상.',
      socialImage: '카카오톡/인스타 공유 시 활용.',
      svgToImage: 'SVG를 PNG/JPG로 변환하려면 브라우저에서 열고 스크린샷하거나, sharp/canvas 라이브러리 사용.',
    };
  }

  _wrapText(text, maxCharsPerLine) {
    const words = text.split('');
    const lines = [];
    let current = '';
    for (const char of words) {
      if (current.length >= maxCharsPerLine && char === ' ') {
        lines.push(current.trim());
        current = '';
      } else if (current.length >= maxCharsPerLine + 4) {
        lines.push(current.trim());
        current = char;
      } else {
        current += char;
      }
    }
    if (current.trim()) lines.push(current.trim());
    return lines;
  }

  _escXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

module.exports = ThumbnailGeneratorTool;

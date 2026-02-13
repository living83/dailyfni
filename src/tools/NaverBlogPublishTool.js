const Tool = require('../core/Tool');

/**
 * 네이버 블로그 발행 도구
 *
 * - 네이버 블로그 API 연동 (Open API / 자동화)
 * - 콘텐츠 → 네이버 블로그 HTML 변환
 * - 카테고리/태그 설정
 * - 대표 이미지(OG) 설정
 * - 발행 / 임시저장 / 예약 발행
 *
 * 실제 API 연동 시 네이버 Open API (blog/writePost) 또는
 * Selenium/Puppeteer 기반 자동화로 교체할 수 있습니다.
 */
class NaverBlogPublishTool extends Tool {
  constructor() {
    super({
      name: 'naver_blog_publish',
      description: '네이버 블로그에 글을 발행합니다. 카테고리, 태그, 대표 이미지 설정을 포함합니다.',
      parameters: {
        title: { type: 'string', description: '글 제목' },
        content: { type: 'string', description: '본문 (마크다운 또는 HTML)' },
        category: { type: 'string', description: '카테고리명' },
        tags: { type: 'array', description: '태그 목록' },
        thumbnailUrl: { type: 'string', description: '대표 이미지 URL' },
        publishMode: { type: 'string', description: 'publish | draft | schedule' },
        scheduledAt: { type: 'string', description: '예약 발행 시각 (ISO 8601)' },
        blogId: { type: 'string', description: '네이버 블로그 ID' },
      },
    });

    // 네이버 블로그 규격
    this.specs = {
      maxTitleLength: 60,
      maxTagCount: 30,
      maxTagLength: 30,
      maxContentLength: 65536, // 약 65KB
      supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      ogImageSize: { width: 1200, height: 630 },
      contentMaxWidth: 860,
    };
  }

  async execute({ title, content, category = '', tags = [], thumbnailUrl = '', publishMode = 'publish', scheduledAt = null, blogId = '' }) {
    if (!title) throw new Error('글 제목(title)은 필수입니다.');
    if (!content) throw new Error('본문(content)은 필수입니다.');

    // 1. 입력값 검증
    const validation = this._validateInput(title, content, tags, publishMode, scheduledAt);
    if (!validation.valid) {
      return {
        status: 'failed',
        errors: validation.errors,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. 콘텐츠 → 네이버 블로그 HTML 변환
    const htmlContent = this._convertToNaverHtml(content);

    // 3. 카테고리 매핑
    const categoryInfo = this._resolveCategory(category);

    // 4. 태그 정제
    const processedTags = this._processTags(tags);

    // 5. 메타데이터 구성
    const metadata = this._buildMetadata(title, htmlContent, categoryInfo, processedTags, thumbnailUrl);

    // 6. 발행 요청 (시뮬레이션)
    const publishResult = await this._publish(metadata, publishMode, scheduledAt, blogId);

    return {
      ...publishResult,
      metadata,
      validation,
      htmlPreview: htmlContent.substring(0, 500) + (htmlContent.length > 500 ? '...' : ''),
      timestamp: new Date().toISOString(),
    };
  }

  _validateInput(title, content, tags, publishMode, scheduledAt) {
    const errors = [];
    const warnings = [];

    // 제목 검증
    if (title.length > this.specs.maxTitleLength) {
      errors.push({
        field: 'title',
        message: `제목이 ${this.specs.maxTitleLength}자를 초과했습니다. (현재: ${title.length}자)`,
        action: `${this.specs.maxTitleLength}자 이내로 줄이세요.`,
      });
    }

    if (title.length < 5) {
      warnings.push({
        field: 'title',
        message: '제목이 너무 짧습니다. SEO에 불리할 수 있습니다.',
      });
    }

    // 본문 검증
    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (contentBytes > this.specs.maxContentLength) {
      errors.push({
        field: 'content',
        message: `본문이 ${this.specs.maxContentLength}바이트를 초과했습니다.`,
        action: '글을 분할하거나 줄이세요.',
      });
    }

    const charCount = content.replace(/\s/g, '').length;
    if (charCount < 500) {
      warnings.push({
        field: 'content',
        message: `본문이 ${charCount}자로 짧습니다. 네이버 상위 노출에는 1,500자 이상을 권장합니다.`,
      });
    }

    // 태그 검증
    if (tags.length > this.specs.maxTagCount) {
      errors.push({
        field: 'tags',
        message: `태그가 ${this.specs.maxTagCount}개를 초과했습니다. (현재: ${tags.length}개)`,
        action: `${this.specs.maxTagCount}개 이내로 줄이세요.`,
      });
    }

    const longTags = tags.filter(t => t.length > this.specs.maxTagLength);
    if (longTags.length > 0) {
      errors.push({
        field: 'tags',
        message: `태그 "${longTags[0]}"이(가) ${this.specs.maxTagLength}자를 초과했습니다.`,
        action: `${this.specs.maxTagLength}자 이내로 줄이세요.`,
      });
    }

    // 발행 모드 검증
    const validModes = ['publish', 'draft', 'schedule'];
    if (!validModes.includes(publishMode)) {
      errors.push({
        field: 'publishMode',
        message: `"${publishMode}"은(는) 유효하지 않은 발행 모드입니다.`,
        action: `publish, draft, schedule 중 선택하세요.`,
      });
    }

    // 예약 발행 시각 검증
    if (publishMode === 'schedule') {
      if (!scheduledAt) {
        errors.push({
          field: 'scheduledAt',
          message: '예약 발행 모드에서는 scheduledAt이 필수입니다.',
        });
      } else {
        const schedDate = new Date(scheduledAt);
        if (isNaN(schedDate.getTime())) {
          errors.push({
            field: 'scheduledAt',
            message: 'scheduledAt 형식이 올바르지 않습니다. ISO 8601 형식을 사용하세요.',
          });
        } else if (schedDate <= new Date()) {
          errors.push({
            field: 'scheduledAt',
            message: '예약 시각은 현재 시각보다 미래여야 합니다.',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  _convertToNaverHtml(content) {
    let html = content;

    // 마크다운 → HTML 변환 (기본적인 패턴)
    // 헤딩
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 볼드/이탤릭
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');

    // 리스트
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // 링크
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 이미지
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<div class="se-image" style="text-align:center;"><img src="$2" alt="$1" style="max-width:860px;" /><p class="se-caption">$1</p></div>'
    );

    // 줄바꿈 → 네이버 블로그 스타일 <br>
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br/>');

    // 전체를 <p> 태그로 감싸기
    if (!html.startsWith('<')) {
      html = `<p>${html}</p>`;
    }

    // 네이버 블로그 스마트에디터 래퍼
    html = `<div class="se-main-container">
  <div class="se-component se-text se-l-default">
    <div class="se-component-content">
      <div class="se-section se-section-text se-l-default">
        <div class="se-module se-module-text">
          ${html}
        </div>
      </div>
    </div>
  </div>
</div>`;

    return html;
  }

  _resolveCategory(category) {
    // 네이버 블로그 기본 카테고리 매핑
    const categoryMap = {
      '일상': { id: 'daily', name: '일상·생각' },
      '리뷰': { id: 'review', name: '리뷰' },
      'IT': { id: 'it_tech', name: 'IT·컴퓨터' },
      '가전': { id: 'electronics', name: '가전·디지털' },
      '뷰티': { id: 'beauty', name: '뷰티·미용' },
      '패션': { id: 'fashion', name: '패션·의류' },
      '음식': { id: 'food', name: '맛집·음식' },
      '여행': { id: 'travel', name: '여행' },
      '육아': { id: 'parenting', name: '육아·교육' },
      '건강': { id: 'health', name: '건강·운동' },
      '인테리어': { id: 'interior', name: '인테리어' },
      '자동차': { id: 'car', name: '자동차' },
      '반려동물': { id: 'pet', name: '반려동물' },
      '경제': { id: 'economy', name: '경제·비즈니스' },
    };

    // 직접 매칭
    if (categoryMap[category]) {
      return { ...categoryMap[category], matched: true };
    }

    // 부분 매칭
    const partialMatch = Object.entries(categoryMap).find(
      ([key, val]) => category.includes(key) || val.name.includes(category)
    );
    if (partialMatch) {
      return { ...partialMatch[1], matched: true, matchedFrom: partialMatch[0] };
    }

    // 매칭 실패 시 기본값
    return {
      id: 'etc',
      name: category || '기타',
      matched: false,
      suggestion: '카테고리가 매핑되지 않았습니다. 네이버 블로그에서 직접 설정하세요.',
    };
  }

  _processTags(tags) {
    return tags
      .map(tag => {
        // # 제거
        let cleaned = tag.replace(/^#/, '').trim();
        // 특수문자 제거 (네이버 태그 규칙)
        cleaned = cleaned.replace(/[^\w가-힣\s]/g, '');
        // 길이 제한
        if (cleaned.length > this.specs.maxTagLength) {
          cleaned = cleaned.substring(0, this.specs.maxTagLength);
        }
        return cleaned;
      })
      .filter(tag => tag.length > 0)
      .slice(0, this.specs.maxTagCount);
  }

  _buildMetadata(title, html, category, tags, thumbnailUrl) {
    return {
      title,
      category,
      tags,
      thumbnailUrl: thumbnailUrl || null,
      contentLength: html.length,
      contentCharCount: html.replace(/<[^>]+>/g, '').replace(/\s/g, '').length,
      hasImages: /<img\s/.test(html),
      hasLinks: /<a\s/.test(html),
      ogMeta: {
        'og:title': title,
        'og:description': html.replace(/<[^>]+>/g, '').substring(0, 150).trim(),
        'og:image': thumbnailUrl || '',
        'og:type': 'article',
      },
    };
  }

  async _publish(metadata, mode, scheduledAt, blogId) {
    // === 시뮬레이션 ===
    // 실제 구현 시 아래 중 하나로 교체:
    // 1. 네이버 Open API: POST https://openapi.naver.com/blog/writePost.json
    //    - Header: Authorization: Bearer {access_token}
    //    - Body: { title, contents, categoryNo }
    // 2. Puppeteer/Selenium 자동화
    //    - blog.naver.com 로그인 → 스마트에디터 접근 → 글 작성

    const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const blogUrl = blogId
      ? `https://blog.naver.com/${blogId}/${postId}`
      : `https://blog.naver.com/dailyfni/${postId}`;

    if (mode === 'draft') {
      return {
        status: 'drafted',
        postId,
        blogUrl: null,
        message: '임시저장되었습니다. 네이버 블로그에서 직접 발행하세요.',
        publishedAt: null,
        draftedAt: new Date().toISOString(),
      };
    }

    if (mode === 'schedule') {
      return {
        status: 'scheduled',
        postId,
        blogUrl,
        scheduledAt,
        message: `${new Date(scheduledAt).toLocaleString('ko-KR')}에 자동 발행 예정입니다.`,
        publishedAt: null,
        scheduledInfo: {
          scheduledAt,
          timezone: 'Asia/Seoul',
          canCancel: true,
          cancelEndpoint: `/api/publisher/agents/:id/cancel/${postId}`,
        },
      };
    }

    // 즉시 발행
    return {
      status: 'published',
      postId,
      blogUrl,
      message: '네이버 블로그에 성공적으로 발행되었습니다.',
      publishedAt: new Date().toISOString(),
      naverIndexing: {
        submitted: true,
        expectedIndexTime: '10분~2시간',
        searchConsoleUrl: `https://searchadvisor.naver.com/console/site/${blogId || 'dailyfni'}`,
      },
    };
  }
}

module.exports = NaverBlogPublishTool;

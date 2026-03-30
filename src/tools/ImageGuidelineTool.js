const Tool = require('../core/Tool');

/**
 * 이미지 브랜드 가이드라인 & 검수 도구
 *
 * 역할:
 * 1. 브랜드 신뢰 톤앤매너 가이드 제공
 * 2. 이미지 메타데이터(용도/영역/슬롯) 검증
 * 3. 법적 오인 소지 체크리스트 제공/검수
 * 4. AI 생성 프롬프트 금지어 검사
 * 5. 업로드 품질 기준(형식/용량/해상도) 검증
 */
class ImageGuidelineTool extends Tool {
  constructor() {
    super({
      name: 'image_guideline',
      description: '이미지 브랜드 가이드라인 준수 여부를 검사하고, 검수 체크리스트를 제공합니다.',
      parameters: {
        action: { type: 'string', description: '실행 액션 (getGuideline, checkPrompt, validateUpload, getChecklist, runChecklist)' },
        prompt: { type: 'string', description: 'AI 생성 프롬프트 (checkPrompt 시)' },
        fileInfo: { type: 'object', description: '파일 정보 (type, size, width, height)' },
        slot: { type: 'string', description: '적용 슬롯 (main_hero, card_thumbnail, landing_header 등)' },
        checklistAnswers: { type: 'object', description: '체크리스트 응답' },
      },
    });

    // 슬롯별 이미지 기준
    this.slotSpecs = {
      main_hero: {
        label: '메인 히어로 배너',
        desktopRatio: '16:9',
        mobileRatio: '4:5 또는 1:1',
        minWidth: 1600,
        maxFileSize: 300 * 1024, // 300KB
        recommendedFileSize: 150 * 1024,
        formats: ['jpg', 'png', 'webp'],
        recommendedFormat: 'webp',
      },
      card_thumbnail: {
        label: '섹션 썸네일 카드',
        desktopRatio: '1:1 또는 4:3',
        mobileRatio: '1:1',
        minWidth: 600,
        maxFileSize: 300 * 1024,
        recommendedFileSize: 150 * 1024,
        formats: ['jpg', 'png', 'webp'],
        recommendedFormat: 'webp',
      },
      landing_header: {
        label: '랜딩 헤더',
        desktopRatio: '21:9 또는 16:9',
        mobileRatio: '4:5 또는 1:1',
        minWidth: 1600,
        maxFileSize: 300 * 1024,
        recommendedFileSize: 150 * 1024,
        formats: ['jpg', 'png', 'webp'],
        recommendedFormat: 'webp',
      },
      section_inline: {
        label: '섹션 인라인 이미지',
        desktopRatio: '4:3 또는 1:1',
        mobileRatio: '1:1',
        minWidth: 800,
        maxFileSize: 300 * 1024,
        recommendedFileSize: 150 * 1024,
        formats: ['jpg', 'png', 'webp'],
        recommendedFormat: 'webp',
      },
      cta_banner: {
        label: 'CTA 보조 배너',
        desktopRatio: '3:1 또는 4:1',
        mobileRatio: '2:1',
        minWidth: 1200,
        maxFileSize: 300 * 1024,
        recommendedFileSize: 150 * 1024,
        formats: ['jpg', 'png', 'webp'],
        recommendedFormat: 'webp',
      },
    };

    // 프롬프트 금지어
    this.prohibitedPromptWords = [
      { word: '무조건', reason: '확정적 표현' },
      { word: '100%', reason: '확정적 표현' },
      { word: '확정', reason: '확정적 표현' },
      { word: '즉시 승인', reason: '확정적 표현' },
      { word: '법원', reason: '공공기관 오인' },
      { word: '판사', reason: '공공기관 오인' },
      { word: '검찰', reason: '공공기관 오인' },
      { word: '경찰', reason: '공공기관 오인' },
      { word: '공무원', reason: '공공기관 오인' },
      { word: '은행원', reason: '금융기관 오인' },
      { word: '제복', reason: '특정 직군 오인' },
      { word: '배지', reason: '공공기관 상징 오인' },
      { word: '돈다발', reason: '자극적 소품' },
      { word: '금괴', reason: '자극적 소품' },
      { word: '현금뭉치', reason: '자극적 소품' },
      { word: '형광', reason: '과채도 색상' },
      { word: '빨간색 배경', reason: '과채도 색상' },
    ];

    // 톤앤매너 체크리스트
    this.toneChecklist = [
      { id: 'color_tone', label: '저채도/중성 톤(네이비, 딥블루, 그레이, 화이트) 사용', category: 'tone', required: true },
      { id: 'no_neon', label: '과도한 원색(빨강/형광/과채도) 미사용', category: 'tone', required: true },
      { id: 'clean_font', label: '깔끔한 고딕 계열 폰트 (장식체/손글씨 미사용)', category: 'tone', required: true },
      { id: 'calm_person', label: '인물: 단정한 복장, 차분한 표정', category: 'person', required: true },
      { id: 'no_exaggerated', label: '인물: 과장된 표정/선정적 연출 없음', category: 'person', required: true },
      { id: 'no_uniform', label: '인물: 공무원/판사/은행원 등 오인 복장 없음', category: 'person', required: true },
      { id: 'clean_bg', label: '배경: 법원/공공기관/은행 상징 없음', category: 'background', required: true },
      { id: 'no_provocative', label: '소품: 과도한 현금/금괴/돈다발 없음', category: 'background', required: true },
      { id: 'photo_quality', label: '사진 품질: AI 티(손/얼굴 왜곡, 텍스트 깨짐) 없음', category: 'quality', required: true },
      { id: 'no_personal_info', label: '이미지 내 개인정보(이름/전화번호) 미포함', category: 'privacy', required: true },
    ];

    // 법적 오인 체크리스트
    this.legalChecklist = [
      { id: 'no_absolute', label: '확정/과장 표현("무조건", "100%", "확정") 없음', category: 'expression', required: true },
      { id: 'no_gov_symbol', label: '공공기관 상징(법원 건물, 저울, 도장/배지, 관공서 문양) 없음', category: 'institution', required: true },
      { id: 'no_bank_symbol', label: '금융기관 유사 요소(은행 로고 유사) 없음', category: 'institution', required: true },
      { id: 'no_false_claim', label: '허위 암시("정부 지원 확정", "법원 공식 상담") 없음', category: 'claim', required: true },
      { id: 'condition_noted', label: '수치/혜택 표기 시 조건("개인별 상이", "심사 결과에 따라") 명시', category: 'condition', required: false },
    ];
  }

  async execute(input) {
    const { action, prompt, fileInfo, slot, checklistAnswers } = input;

    switch (action) {
      case 'getGuideline':
        return this._getGuideline();
      case 'checkPrompt':
        return this._checkPrompt(prompt);
      case 'validateUpload':
        return this._validateUpload(fileInfo, slot);
      case 'getChecklist':
        return this._getChecklist();
      case 'runChecklist':
        return this._runChecklist(checklistAnswers);
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  _getGuideline() {
    return {
      status: 'success',
      guideline: {
        color: '저채도/중성 톤(네이비, 딥블루, 그레이, 화이트 중심). 과도한 원색 지양.',
        font: '깔끔한 고딕 계열. 장식체/손글씨/과한 드롭섀도우/번쩍이는 효과 금지.',
        person: '단정한 복장(정장/오피스캐주얼), 차분한 표정. 과장된 표정/선정적 연출 금지. 특정 직군 오인 복장 금지.',
        background: '법원/공공기관/금융기관 상징 사용 금지. 과도한 현금/금괴 등 자극적 소품 금지.',
        photoVsIllust: '실제 사진 톤 기본. AI 티 보이면 폐기. 일러스트는 단색/미니멀만.',
        message: '확정/과장 표현 금지. 수치/혜택은 조건 함께 표기.',
        safeZone: '이미지 내 텍스트/로고는 가장자리 10% 영역에 배치하지 않음.',
      },
      slotSpecs: this.slotSpecs,
    };
  }

  _checkPrompt(prompt) {
    if (!prompt) return { status: 'error', message: '프롬프트가 필요합니다.' };

    const found = [];
    this.prohibitedPromptWords.forEach(item => {
      if (prompt.includes(item.word)) {
        found.push(item);
      }
    });

    return {
      status: found.length > 0 ? 'warning' : 'pass',
      riskLevel: found.length > 0 ? 'high' : 'normal',
      prohibitedWords: found,
      message: found.length > 0
        ? `금지어가 ${found.length}개 발견되었습니다. 생성은 가능하나 "검수 필요(고위험)" 상태로 표시됩니다.`
        : '프롬프트에 문제가 없습니다.',
      canGenerate: true, // 경고 시에도 생성은 허용
    };
  }

  _validateUpload(fileInfo, slot) {
    if (!fileInfo) return { status: 'error', message: '파일 정보가 필요합니다.' };

    const spec = this.slotSpecs[slot];
    const issues = [];
    const warnings = [];

    // 형식 검증
    const ext = (fileInfo.type || '').toLowerCase();
    const allowedFormats = spec ? spec.formats : ['jpg', 'png', 'webp'];
    if (!allowedFormats.includes(ext)) {
      issues.push(`지원하지 않는 파일 형식: ${ext}. 허용: ${allowedFormats.join(', ')}`);
    }
    if (spec && ext !== spec.recommendedFormat) {
      warnings.push(`WebP 형식을 권장합니다 (현재: ${ext}).`);
    }

    // 용량 검증
    if (spec && fileInfo.size > spec.maxFileSize) {
      issues.push(`파일 용량 초과: ${Math.round(fileInfo.size / 1024)}KB (최대: ${Math.round(spec.maxFileSize / 1024)}KB)`);
    } else if (spec && fileInfo.size > spec.recommendedFileSize) {
      warnings.push(`권장 용량 초과: ${Math.round(fileInfo.size / 1024)}KB (권장: ${Math.round(spec.recommendedFileSize / 1024)}KB 이하)`);
    }

    // 해상도 검증
    if (spec && fileInfo.width && fileInfo.width < spec.minWidth) {
      warnings.push(`권장 최소 가로 해상도 미달: ${fileInfo.width}px (권장: ${spec.minWidth}px 이상)`);
    }

    return {
      status: issues.length > 0 ? 'fail' : (warnings.length > 0 ? 'warning' : 'pass'),
      canUpload: true, // 업로드는 항상 허용 (승인 단계에서 재확인)
      canApprove: issues.length === 0,
      issues,
      warnings,
      spec: spec || null,
    };
  }

  _getChecklist() {
    return {
      status: 'success',
      toneChecklist: this.toneChecklist,
      legalChecklist: this.legalChecklist,
    };
  }

  _runChecklist(answers) {
    if (!answers) return { status: 'error', message: '체크리스트 응답이 필요합니다.' };

    const allItems = [...this.toneChecklist, ...this.legalChecklist];
    const results = allItems.map(item => {
      const answer = answers[item.id];
      return {
        ...item,
        checked: answer === true,
        passed: answer === true,
      };
    });

    const requiredFailed = results.filter(r => r.required && !r.passed);
    const canApprove = requiredFailed.length === 0;

    return {
      status: canApprove ? 'pass' : 'fail',
      canApprove,
      totalItems: results.length,
      passedItems: results.filter(r => r.passed).length,
      failedRequired: requiredFailed,
      results,
    };
  }
}

module.exports = ImageGuidelineTool;

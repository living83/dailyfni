const Tool = require('../core/Tool');

/**
 * 맞춤법/문법 체크 도구
 *
 * - 한국어 맞춤법 오류 검출
 * - 띄어쓰기 교정
 * - 블로그 톤앤매너 일관성 체크
 * - 네이버 블로그 금지어/저품질 표현 탐지
 * - 교정 제안 생성
 */
class SpellCheckTool extends Tool {
  constructor() {
    super({
      name: 'spell_check',
      description: '맞춤법, 띄어쓰기, 문법 오류를 검출하고 교정안을 제시합니다.',
      parameters: {
        content: { type: 'string', description: '검사할 본문 텍스트' },
        strictLevel: { type: 'string', description: '엄격도 (basic, standard, strict)', default: 'standard' },
      },
    });

    // 자주 틀리는 맞춤법 패턴
    this.spellingRules = [
      { wrong: /되서/g, correct: '돼서', rule: '"되어서"의 준말은 "돼서"' },
      { wrong: /됬/g, correct: '됐', rule: '"되었"의 준말은 "됐"' },
      { wrong: /안되/g, correct: '안 되', rule: '"안"과 "되"는 띄어쓰기' },
      { wrong: /안됩니다/g, correct: '안 됩니다', rule: '"안"과 "됩니다"는 띄어쓰기' },
      { wrong: /어떻게\s*해야되/g, correct: '어떻게 해야 돼', rule: '"되"가 아닌 "돼"' },
      { wrong: /할수있/g, correct: '할 수 있', rule: '"할 수 있"은 모두 띄어쓰기' },
      { wrong: /할수록/g, correct: '할수록', rule: '"할수록"은 붙여쓰기 (올바름)' },
      { wrong: /몇일/g, correct: '며칠', rule: '"몇일"이 아닌 "며칠"' },
      { wrong: /오랫만/g, correct: '오랜만', rule: '"오랫만"이 아닌 "오랜만"' },
      { wrong: /금새/g, correct: '금세', rule: '"금새"가 아닌 "금세" (금시에의 준말)' },
      { wrong: /어의없/g, correct: '어이없', rule: '"어의"가 아닌 "어이"' },
      { wrong: /왠지/g, correct: '왠지', rule: '"왠지"는 올바름 (왜인지의 준말)' },
      { wrong: /왠만하면/g, correct: '웬만하면', rule: '"왠만"이 아닌 "웬만"' },
      { wrong: /예기치/g, correct: '예기치', rule: '"예기치"는 올바름' },
      { wrong: /갯수/g, correct: '개수', rule: '사이시옷 불필요, "개수"가 표준' },
      { wrong: /해야될/g, correct: '해야 될', rule: '"해야"와 "될"은 띄어쓰기' },
      { wrong: /있슴/g, correct: '있음', rule: '"있슴"이 아닌 "있음"' },
      { wrong: /업데이트/g, correct: '업데이트', rule: '올바름' },
      { wrong: /데이타/g, correct: '데이터', rule: '"데이타"가 아닌 "데이터"' },
      { wrong: /서비스센타/g, correct: '서비스센터', rule: '"센타"가 아닌 "센터"' },
    ];

    // 띄어쓰기 규칙
    this.spacingRules = [
      { pattern: /([가-힣])(및)([가-힣])/g, fix: '$1 및 $3', rule: '"및" 앞뒤 띄어쓰기' },
      { pattern: /([가-힣])(등)([가-힣])/g, fix: '$1 등 $3', rule: '"등" 앞뒤 띄어쓰기 (문맥에 따라)' },
      { pattern: /(\d+)(원)/g, fix: '$1원', rule: '숫자+단위는 붙여쓰기 (올바름)' },
      { pattern: /(\d+)\s+(개|장|개월|년|일|시간|분)/g, fix: '$1$2', rule: '숫자+단위는 붙여쓰기' },
    ];

    // 네이버 저품질 위험 표현
    this.lowQualityPatterns = [
      { pattern: /최저가.*클릭.*구매/s, risk: 'high', reason: '과도한 구매 유도 표현 (광고성 의심)' },
      { pattern: /(지금\s*바로|서두르세요|한정\s*수량)/g, risk: 'medium', reason: '긴급성 마케팅 표현 (네이버 저품질 요인)' },
      { pattern: /(100%\s*만족|절대\s*후회\s*없)/g, risk: 'medium', reason: '과장 표현 (신뢰도 하락)' },
      { pattern: /(무료\s*배송|공짜|0원)/g, risk: 'low', reason: '프로모션 표현 (과다 사용 시 광고성 판정)' },
      { pattern: /(.)\1{4,}/g, risk: 'high', reason: '같은 문자 반복 (예: ㅋㅋㅋㅋㅋ) - 저품질 콘텐츠 신호' },
    ];

    // 톤 일관성 체크 패턴
    this.tonePatterns = {
      formal: /합니다|입니다|습니다|겠습니다/g,
      friendly: /에요|이에요|거예요|세요|죠|요$/gm,
      casual: /ㅎㅎ|ㅋㅋ|!!+|~{2,}|대박|짱/g,
    };
  }

  async execute({ content, strictLevel = 'standard' }) {
    if (!content) throw new Error('검사할 본문(content)은 필수입니다.');

    // 1. 맞춤법 검사
    const spellingErrors = this._checkSpelling(content);

    // 2. 띄어쓰기 검사
    const spacingErrors = this._checkSpacing(content);

    // 3. 문법/문체 분석
    const grammarIssues = this._checkGrammar(content, strictLevel);

    // 4. 네이버 저품질 위험 표현 탐지
    const lowQualityWarnings = this._checkLowQuality(content);

    // 5. 톤 일관성 분석
    const toneConsistency = this._checkToneConsistency(content);

    // 6. 종합 점수
    const totalErrors = spellingErrors.length + spacingErrors.length + grammarIssues.length;
    const totalWarnings = lowQualityWarnings.length;
    const score = this._calculateScore(totalErrors, totalWarnings, content.length);

    return {
      score,
      grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
      summary: {
        totalErrors,
        spellingErrors: spellingErrors.length,
        spacingErrors: spacingErrors.length,
        grammarIssues: grammarIssues.length,
        lowQualityWarnings: totalWarnings,
      },
      spelling: spellingErrors,
      spacing: spacingErrors,
      grammar: grammarIssues,
      lowQuality: lowQualityWarnings,
      toneConsistency,
      checkedAt: new Date().toISOString(),
    };
  }

  _checkSpelling(content) {
    const errors = [];
    this.spellingRules.forEach(rule => {
      let match;
      const regex = new RegExp(rule.wrong.source, rule.wrong.flags);
      while ((match = regex.exec(content)) !== null) {
        if (rule.correct === match[0]) continue; // 올바른 표현은 스킵
        errors.push({
          type: 'spelling',
          position: match.index,
          found: match[0],
          suggestion: rule.correct,
          rule: rule.rule,
          context: content.substring(Math.max(0, match.index - 10), match.index + match[0].length + 10),
        });
      }
    });
    return errors;
  }

  _checkSpacing(content) {
    const errors = [];
    this.spacingRules.forEach(rule => {
      let match;
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      while ((match = regex.exec(content)) !== null) {
        const fixed = match[0].replace(new RegExp(rule.pattern.source), rule.fix);
        if (fixed !== match[0]) {
          errors.push({
            type: 'spacing',
            position: match.index,
            found: match[0],
            suggestion: fixed,
            rule: rule.rule,
          });
        }
      }
    });
    return errors;
  }

  _checkGrammar(content, strictLevel) {
    const issues = [];
    const sentences = content.split(/[.!?]\s/).filter(s => s.trim());

    // 문장 길이 체크
    sentences.forEach((sentence, i) => {
      const len = sentence.replace(/\s/g, '').length;
      if (len > 100) {
        issues.push({
          type: 'long_sentence',
          severity: 'warning',
          sentenceIndex: i + 1,
          length: len,
          message: `문장이 너무 깁니다 (${len}자). 50자 이내로 나누는 것을 권장합니다.`,
          preview: sentence.substring(0, 50) + '...',
        });
      }
    });

    // 같은 문장 끝 반복 체크
    const endings = sentences.map(s => s.trim().slice(-4));
    const endingCount = {};
    endings.forEach(e => { endingCount[e] = (endingCount[e] || 0) + 1; });
    Object.entries(endingCount).forEach(([ending, count]) => {
      if (count >= 4) {
        issues.push({
          type: 'repetitive_ending',
          severity: 'info',
          ending,
          count,
          message: `"${ending}"로 끝나는 문장이 ${count}번 반복됩니다. 문체를 다양하게 바꿔보세요.`,
        });
      }
    });

    // strict 모드: 추가 검사
    if (strictLevel === 'strict') {
      // 수동태 과다 사용
      const passiveCount = (content.match(/되어|되는|되고|되면|됩니다/g) || []).length;
      if (passiveCount > sentences.length * 0.3) {
        issues.push({
          type: 'passive_voice',
          severity: 'info',
          count: passiveCount,
          message: `수동태 표현이 많습니다 (${passiveCount}회). 능동태로 바꾸면 더 생동감 있는 글이 됩니다.`,
        });
      }

      // 접속사 과다
      const conjCount = (content.match(/그리고|그래서|그런데|하지만|그러나|따라서/g) || []).length;
      if (conjCount > sentences.length * 0.4) {
        issues.push({
          type: 'excessive_conjunctions',
          severity: 'info',
          count: conjCount,
          message: `접속사가 많습니다 (${conjCount}회). 문장을 독립적으로 쓰면 가독성이 좋아집니다.`,
        });
      }
    }

    return issues;
  }

  _checkLowQuality(content) {
    const warnings = [];
    this.lowQualityPatterns.forEach(({ pattern, risk, reason }) => {
      const matches = content.match(pattern);
      if (matches) {
        warnings.push({
          risk,
          reason,
          found: matches.slice(0, 3).map(m => m.substring(0, 30)),
          count: matches.length,
          action: risk === 'high'
            ? '반드시 수정하세요. 네이버 저품질 판정을 받을 수 있습니다.'
            : '가능하면 수정을 권장합니다.',
        });
      }
    });
    return warnings;
  }

  _checkToneConsistency(content) {
    const counts = {};
    for (const [tone, pattern] of Object.entries(this.tonePatterns)) {
      counts[tone] = (content.match(pattern) || []).length;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const ratios = {};
    for (const [tone, count] of Object.entries(counts)) {
      ratios[tone] = `${Math.round(count / total * 100)}%`;
    }

    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const isConsistent = (dominant[1] / total) > 0.5;

    return {
      dominant: dominant[0] === 'formal' ? '격식체' : dominant[0] === 'friendly' ? '친근체' : '캐주얼',
      ratios,
      isConsistent,
      message: isConsistent
        ? `"${dominant[0] === 'formal' ? '격식체' : dominant[0] === 'friendly' ? '친근체' : '캐주얼'}" 톤이 일관되게 유지됩니다.`
        : '톤이 혼재되어 있습니다. 하나의 톤으로 통일하세요.',
    };
  }

  _calculateScore(errors, warnings, contentLength) {
    const charCount = contentLength || 1;
    const errorRate = errors / (charCount / 500); // 500자당 오류 수
    const warningPenalty = warnings * 3;

    let score = 100 - (errorRate * 8) - warningPenalty;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}

module.exports = SpellCheckTool;

const Tool = require('../core/Tool');

class TextTool extends Tool {
  constructor() {
    super({
      name: 'text_processor',
      description: '텍스트 변환 도구 (요약, 번역 힌트, 키워드 추출 등)',
      parameters: {
        text: { type: 'string', description: '처리할 텍스트' },
        action: { type: 'string', description: '수행할 작업: word_count, char_count, keywords' },
      },
    });
  }

  async execute({ text, action }) {
    switch (action) {
      case 'word_count':
        return { action, result: text.split(/\s+/).filter(Boolean).length };
      case 'char_count':
        return { action, result: text.length };
      case 'keywords': {
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const freq = {};
        for (const w of words) freq[w] = (freq[w] || 0) + 1;
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return { action, result: sorted.map(([word, count]) => ({ word, count })) };
      }
      default:
        throw new Error(`알 수 없는 액션: ${action}`);
    }
  }
}

module.exports = TextTool;

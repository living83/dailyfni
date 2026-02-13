const Tool = require('../core/Tool');

class CalculatorTool extends Tool {
  constructor() {
    super({
      name: 'calculator',
      description: '수학 표현식을 계산합니다.',
      parameters: { expression: { type: 'string', description: '계산할 수학 표현식' } },
    });
  }

  async execute({ expression }) {
    // 안전한 수학 연산만 허용 (숫자, 연산자, 괄호, 소수점만)
    if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
      throw new Error('허용되지 않은 문자가 포함되어 있습니다.');
    }
    const result = Function(`"use strict"; return (${expression})`)();
    return { expression, result };
  }
}

module.exports = CalculatorTool;

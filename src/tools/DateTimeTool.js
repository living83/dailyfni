const Tool = require('../core/Tool');

class DateTimeTool extends Tool {
  constructor() {
    super({
      name: 'datetime',
      description: '현재 날짜/시간 정보를 제공합니다.',
      parameters: {
        timezone: { type: 'string', description: '타임존 (예: Asia/Seoul)', default: 'Asia/Seoul' },
      },
    });
  }

  async execute({ timezone = 'Asia/Seoul' } = {}) {
    const now = new Date();
    const formatted = now.toLocaleString('ko-KR', { timeZone: timezone });
    return {
      iso: now.toISOString(),
      formatted,
      timezone,
      timestamp: now.getTime(),
    };
  }
}

module.exports = DateTimeTool;

const Tool = require('../core/Tool');
const http = require('http');

/**
 * UI-Friend-MCP 스크린샷 도구
 *
 * UI-Friend-MCP 서버(localhost:3100)를 호출하여
 * HTML/React 템플릿을 Puppeteer로 렌더링한 PNG 스크린샷을 생성합니다.
 *
 * 두 가지 모드:
 * 1. preview_screenshot - 직접 HTML을 전달하여 스크린샷
 * 2. render_template   - 사전 정의된 템플릿 + 데이터로 스크린샷
 */
class UIFriendScreenshotTool extends Tool {
  constructor(options = {}) {
    super({
      name: 'ui_friend_screenshot',
      description: 'UI-Friend-MCP 서버를 통해 HTML/React 템플릿을 PNG 이미지로 렌더링합니다.',
      parameters: {
        mode: {
          type: 'string',
          description: '모드: "screenshot" (HTML 직접) 또는 "template" (사전 정의 템플릿)',
          default: 'template',
        },
        html: { type: 'string', description: '(screenshot 모드) 렌더링할 HTML 문자열' },
        template: { type: 'string', description: '(template 모드) 템플릿 이름' },
        data: { type: 'object', description: '(template 모드) 템플릿에 주입할 데이터' },
        width: { type: 'number', description: '뷰포트 너비 (기본 960)', default: 960 },
        height: { type: 'number', description: '뷰포트 높이 (기본 540)', default: 540 },
        outputPath: { type: 'string', description: '저장 경로 (미지정 시 자동 생성)' },
      },
    });

    this.baseUrl = options.baseUrl || process.env.UI_FRIEND_URL || 'http://localhost:3100';
  }

  async execute({ mode = 'template', html, template, data, width = 960, height = 540, outputPath }) {
    if (mode === 'screenshot') {
      if (!html) throw new Error('screenshot 모드에서는 html이 필수입니다.');
      return this._callMCP('/preview_screenshot', { html, width, height, outputPath });
    }

    if (mode === 'template') {
      if (!template) throw new Error('template 모드에서는 template 이름이 필수입니다.');
      return this._callMCP('/render_template', { template, data: data || {}, width, height, outputPath });
    }

    throw new Error(`지원하지 않는 모드: ${mode}`);
  }

  /**
   * UI-Friend-MCP 서버에 HTTP POST 요청
   */
  _callMCP(path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const payload = JSON.stringify(body);

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                reject(new Error(`UI-Friend-MCP 오류: ${parsed.error}`));
              } else {
                resolve(parsed);
              }
            } catch {
              reject(new Error(`UI-Friend-MCP 응답 파싱 실패: ${data}`));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(new Error(`UI-Friend-MCP 연결 실패 (${this.baseUrl}): ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('UI-Friend-MCP 요청 타임아웃 (30초)'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * 사용 가능한 템플릿 목록 조회
   */
  listTemplates() {
    return new Promise((resolve, reject) => {
      const url = new URL('/templates', this.baseUrl);

      http.get(url.toString(), (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('템플릿 목록 파싱 실패'));
          }
        });
      }).on('error', (err) => {
        reject(new Error(`UI-Friend-MCP 연결 실패: ${err.message}`));
      });
    });
  }
}

module.exports = UIFriendScreenshotTool;

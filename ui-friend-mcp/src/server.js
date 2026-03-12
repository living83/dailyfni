/**
 * UI-Friend-MCP Server
 *
 * Puppeteer 기반 HTML/React 템플릿 → PNG 스크린샷 생성 MCP 서버.
 * Express REST API + MCP 프로토콜 양쪽으로 호출 가능.
 *
 * 엔드포인트:
 *   POST /preview_screenshot  - HTML 렌더링 후 PNG 스크린샷
 *   POST /render_template     - 템플릿 이름 + 데이터로 스크린샷
 *   GET  /templates           - 사용 가능한 템플릿 목록
 *   GET  /health              - 헬스체크
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { renderScreenshot, renderTemplate } = require('./screenshot');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.UI_FRIEND_PORT || 3100;
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// ── MCP Tool 정의 (외부에서 import 가능) ──

const MCP_TOOLS = [
  {
    name: 'preview_screenshot',
    description: 'HTML/React 코드를 Puppeteer로 렌더링하여 PNG 스크린샷을 생성합니다.',
    input_schema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: '렌더링할 HTML 문자열' },
        width: { type: 'number', description: '뷰포트 너비 (기본 960)', default: 960 },
        height: { type: 'number', description: '뷰포트 높이 (기본 540)', default: 540 },
        deviceScaleFactor: { type: 'number', description: '디바이스 스케일 (기본 2)', default: 2 },
        outputPath: { type: 'string', description: '저장 경로 (없으면 자동 생성)' },
      },
      required: ['html'],
    },
  },
  {
    name: 'render_template',
    description: '사전 정의된 React 템플릿에 데이터를 주입하여 PNG 스크린샷을 생성합니다.',
    input_schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: '템플릿 이름 (예: naver_product_cover)' },
        data: { type: 'object', description: '템플릿에 주입할 데이터' },
        width: { type: 'number', description: '뷰포트 너비', default: 960 },
        height: { type: 'number', description: '뷰포트 높이', default: 540 },
        outputPath: { type: 'string', description: '저장 경로' },
      },
      required: ['template', 'data'],
    },
  },
];

// ── REST API 엔드포인트 ──

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ui-friend-mcp', tools: MCP_TOOLS.map(t => t.name) });
});

app.get('/templates', (req, res) => {
  try {
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.html'));
    const templates = files.map(f => {
      const name = f.replace('.html', '');
      return { name, file: f };
    });
    res.json({ templates });
  } catch {
    res.json({ templates: [] });
  }
});

app.post('/preview_screenshot', async (req, res) => {
  try {
    const { html, width, height, deviceScaleFactor, outputPath } = req.body;
    if (!html) return res.status(400).json({ error: 'html 필드는 필수입니다.' });

    const result = await renderScreenshot({
      html,
      width: width || 960,
      height: height || 540,
      deviceScaleFactor: deviceScaleFactor || 2,
      outputPath,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/render_template', async (req, res) => {
  try {
    const { template, data, width, height, outputPath } = req.body;
    if (!template) return res.status(400).json({ error: 'template 필드는 필수입니다.' });

    const result = await renderTemplate({
      templateName: template,
      data: data || {},
      width: width || 960,
      height: height || 540,
      outputPath,
      templatesDir: TEMPLATES_DIR,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MCP 프로토콜 핸들러 (JSON-RPC over stdin/stdout) ──

app.post('/mcp', async (req, res) => {
  const { method, params, id } = req.body;

  if (method === 'tools/list') {
    return res.json({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    try {
      let result;
      if (name === 'preview_screenshot') {
        result = await renderScreenshot({
          html: args.html,
          width: args.width || 960,
          height: args.height || 540,
          deviceScaleFactor: args.deviceScaleFactor || 2,
          outputPath: args.outputPath,
        });
      } else if (name === 'render_template') {
        result = await renderTemplate({
          templateName: args.template,
          data: args.data || {},
          width: args.width || 960,
          height: args.height || 540,
          outputPath: args.outputPath,
          templatesDir: TEMPLATES_DIR,
        });
      } else {
        return res.json({
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        });
      }

      return res.json({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      });
    } catch (err) {
      return res.json({
        jsonrpc: '2.0', id,
        error: { code: -32000, message: err.message },
      });
    }
  }

  res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
});

// ── 서버 시작 ──

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[UI-Friend-MCP] 서버 시작: http://localhost:${PORT}`);
    console.log(`[UI-Friend-MCP] 도구: ${MCP_TOOLS.map(t => t.name).join(', ')}`);
  });
}

module.exports = { app, MCP_TOOLS };

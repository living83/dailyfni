const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const MonitoringAgent = require('../agents/MonitoringAgent');
const Task = require('../core/Task');

const router = Router();
const monitoringAgent = new MonitoringAgent();

// GET /api/monitoring/status - 종합 상태 조회
router.get('/monitoring/status', authenticate, async (req, res, next) => {
  try {
    const { url } = req.query;
    const task = new Task({
      description: '서버 종합 상태 조회',
      agent: monitoringAgent,
      context: { action: 'getStatus', url: url || process.env.SITE_URL || 'https://localhost:3000' },
    });
    const result = await monitoringAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/monitoring/health - 헬스체크
router.get('/monitoring/health', authenticate, async (req, res, next) => {
  try {
    const { url } = req.query;
    const task = new Task({
      description: '서버 헬스체크',
      agent: monitoringAgent,
      context: { action: 'healthCheck', url: url || process.env.SITE_URL },
    });
    const result = await monitoringAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/monitoring/ssl - SSL 인증서 확인
router.get('/monitoring/ssl', authenticate, async (req, res, next) => {
  try {
    const { url } = req.query;
    const task = new Task({
      description: 'SSL 인증서 확인',
      agent: monitoringAgent,
      context: { action: 'sslCheck', url: url || process.env.SITE_URL },
    });
    const result = await monitoringAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/monitoring/dns - DNS 확인
router.get('/monitoring/dns', authenticate, async (req, res, next) => {
  try {
    const { url } = req.query;
    const task = new Task({
      description: 'DNS 확인',
      agent: monitoringAgent,
      context: { action: 'dnsCheck', url: url || process.env.SITE_URL },
    });
    const result = await monitoringAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

// GET /api/monitoring/alerts - 알림 이력
router.get('/monitoring/alerts', authenticate, async (req, res, next) => {
  try {
    const task = new Task({
      description: '알림 이력 조회',
      agent: monitoringAgent,
      context: { action: 'getAlerts' },
    });
    const result = await monitoringAgent.execute(task);
    task.complete(result);
    res.json({ success: true, data: result.output });
  } catch (err) { next(err); }
});

module.exports = router;

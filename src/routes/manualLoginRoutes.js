const { Router } = require('express');
const axios = require('axios');

const PYTHON_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';
const router = Router();

router.post('/manual-login/start', async (req, res) => {
  try {
    const resp = await axios.post(`${PYTHON_URL}/api/manual-login/start`, req.body, { timeout: 30000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.get('/manual-login/screenshot/:sessionId', async (req, res) => {
  try {
    const resp = await axios.get(`${PYTHON_URL}/api/manual-login/screenshot/${req.params.sessionId}`, { timeout: 10000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/manual-login/click', async (req, res) => {
  try {
    const resp = await axios.post(`${PYTHON_URL}/api/manual-login/click`, req.body, { timeout: 10000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/manual-login/type', async (req, res) => {
  try {
    const resp = await axios.post(`${PYTHON_URL}/api/manual-login/type`, req.body, { timeout: 10000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/manual-login/key', async (req, res) => {
  try {
    const resp = await axios.post(`${PYTHON_URL}/api/manual-login/key`, req.body, { timeout: 10000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/manual-login/navigate', async (req, res) => {
  try {
    const resp = await axios.post(`${PYTHON_URL}/api/manual-login/navigate`, req.body, { timeout: 30000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/manual-login/save-cookies', async (req, res) => {
  try {
    const resp = await axios.post(`${PYTHON_URL}/api/manual-login/save-cookies`, req.body, { timeout: 10000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/manual-login/close/:sessionId', async (req, res) => {
  try {
    const resp = await axios.post(`${PYTHON_URL}/api/manual-login/close/${req.params.sessionId}`, {}, { timeout: 10000 });
    res.json(resp.data);
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

module.exports = router;

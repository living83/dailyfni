const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const sessions = new Set();

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie;
  if (header) {
    header.split(';').forEach(c => {
      const [name, ...rest] = c.trim().split('=');
      cookies[name] = rest.join('=');
    });
  }
  return cookies;
}

function sessionAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next();

  const skip = ['/api/health', '/api/admin/login', '/api/admin/check'];
  if (skip.includes(req.path)) return next();

  const cookies = parseCookies(req);
  if (cookies.session && sessions.has(cookies.session)) return next();

  return res.status(401).json({ detail: 'Unauthorized' });
}

function loginHandler(req, res) {
  if (!ADMIN_PASSWORD) return res.json({ success: true });
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.add(token);
    res.cookie('session', token, { maxAge: 7 * 24 * 3600 * 1000, httpOnly: true });
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: '비밀번호가 틀렸습니다' });
}

function logoutHandler(req, res) {
  const cookies = parseCookies(req);
  if (cookies.session) sessions.delete(cookies.session);
  res.clearCookie('session');
  res.json({ success: true });
}

function checkHandler(req, res) {
  if (!ADMIN_PASSWORD) return res.json({ authenticated: true });
  const cookies = parseCookies(req);
  if (cookies.session && sessions.has(cookies.session)) {
    return res.json({ authenticated: true });
  }
  return res.json({ authenticated: false });
}

module.exports = { sessionAuth, loginHandler, logoutHandler, checkHandler };

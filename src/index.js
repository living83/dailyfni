require('dotenv').config();
const express = require('express');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const agencyRoutes = require('./routes/agencyRoutes');
const plannerRoutes = require('./routes/plannerRoutes');
const researchRoutes = require('./routes/researchRoutes');
const seoRoutes = require('./routes/seoRoutes');
const writerRoutes = require('./routes/writerRoutes');
const imageRoutes = require('./routes/imageRoutes');
const reviewerRoutes = require('./routes/reviewerRoutes');
const publisherRoutes = require('./routes/publisherRoutes');
const customerRoutes = require('./routes/customerRoutes');
const loanRoutes = require('./routes/loanRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const auditRoutes = require('./routes/auditRoutes');
const crawlerRoutes = require('./routes/crawlerRoutes');
const loginRoutes = require('./routes/loginRoutes');
const settlementApiRoutes = require('./routes/settlementApiRoutes');
const employeeApiRoutes = require('./routes/employeeApiRoutes');
const notificationApiRoutes = require('./routes/notificationApiRoutes');
const intakeRoutes = require('./routes/intakeRoutes');
const auditApiRoutes = require('./routes/auditApiRoutes');
const customerApiRoutes = require('./routes/customerApiRoutes');
const consultationApiRoutes = require('./routes/consultationApiRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const docConvertRoutes = require('./routes/docConvertRoutes');
const documentRoutes = require('./routes/documentRoutes');

const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 미들웨어 ---
app.use(cors({
  origin: ['https://home.dailyfni.co.kr', 'https://dailyfni.co.kr', 'https://dailyfni.vercel.app', 'http://localhost:3001', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 인증 미들웨어
const { apiAuth } = require('./middleware/apiAuth');
app.use('/api', apiAuth);

// --- 라우트 ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// app.use('/api', authRoutes);
// app.use('/api', agencyRoutes);
// app.use('/api', plannerRoutes);
// app.use('/api', researchRoutes);
// app.use('/api', seoRoutes);
// app.use('/api', writerRoutes);
// app.use('/api', imageRoutes);
// app.use('/api', reviewerRoutes);
// app.use('/api', publisherRoutes);
// app.use('/api', customerRoutes); // customerApiRoutes로 대체
// app.use('/api', loanRoutes);
// app.use('/api', settlementRoutes);
// app.use('/api', employeeRoutes);
// app.use('/api', notificationRoutes);
// app.use('/api', auditRoutes);
app.use('/api', crawlerRoutes);
app.use('/api', loginRoutes);
app.use('/api', settlementApiRoutes);
app.use('/api', employeeApiRoutes);
app.use('/api', notificationApiRoutes);
app.use('/api', intakeRoutes);
app.use('/api', auditApiRoutes);
app.use('/api', customerApiRoutes);
app.use('/api', consultationApiRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', docConvertRoutes);
app.use('/api', documentRoutes);

// --- 에러 핸들링 ---
app.use(errorHandler);

// --- HTTPS + HTTP 서버 ---
const fs = require('fs');
const https = require('https');
const http = require('http');

const sslCertPath = '/etc/letsencrypt/live/work.dailyfni.co.kr';
const hasSSL = fs.existsSync(sslCertPath + '/fullchain.pem');

if (hasSSL) {
  const sslOptions = {
    key: fs.readFileSync(sslCertPath + '/privkey.pem'),
    cert: fs.readFileSync(sslCertPath + '/fullchain.pem')
  };
  https.createServer(sslOptions, app).listen(443, async () => {
    console.log(`\n=== 대부중개 전산시스템 ===`);
    console.log(`서버: https://work.dailyfni.co.kr`);
    const { testConnection, query } = require('./database/db');
    const dbOk = await testConnection();
    console.log(`MySQL: ${dbOk ? '연결됨' : '연결실패'}`);
    if (dbOk) {
      try {
        await query(`CREATE TABLE IF NOT EXISTS lmaster_notices (
          idx VARCHAR(20) PRIMARY KEY,
          notice_date DATE,
          title VARCHAR(500),
          body TEXT,
          author VARCHAR(50) DEFAULT '',
          fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_date (notice_date)
        )`);
        console.log('lmaster_notices 테이블 준비됨');
      } catch (e) { console.error('lmaster_notices 생성 실패:', e.message); }
    }
    console.log(`==========================\n`);
  });
  // HTTP → HTTPS 리다이렉트
  http.createServer((req, res) => {
    res.writeHead(301, { Location: 'https://work.dailyfni.co.kr' + req.url });
    res.end();
  }).listen(80);
} else {
  app.listen(PORT, async () => {
    console.log(`\n=== 대부중개 전산시스템 ===`);
    console.log(`서버: http://localhost:${PORT}`);
    const { testConnection, query } = require('./database/db');
    const dbOk = await testConnection();
    console.log(`MySQL: ${dbOk ? '연결됨' : '연결실패'}`);
    if (dbOk) {
      try {
        await query(`CREATE TABLE IF NOT EXISTS lmaster_notices (
          idx VARCHAR(20) PRIMARY KEY,
          notice_date DATE,
          title VARCHAR(500),
          body TEXT,
          author VARCHAR(50) DEFAULT '',
          fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_date (notice_date)
        )`);
      } catch (e) { console.error('lmaster_notices 생성 실패:', e.message); }
    }
    console.log(`==========================\n`);
  });
}

module.exports = app;

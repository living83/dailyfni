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

const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 미들웨어 ---
app.use(cors({
  origin: ['https://home.dailyfni.co.kr', 'https://dailyfni.co.kr', 'http://localhost:3001', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 라우트 ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', authRoutes);
app.use('/api', agencyRoutes);
app.use('/api', plannerRoutes);
app.use('/api', researchRoutes);
app.use('/api', seoRoutes);
app.use('/api', writerRoutes);
app.use('/api', imageRoutes);
app.use('/api', reviewerRoutes);
app.use('/api', publisherRoutes);
app.use('/api', customerRoutes);
app.use('/api', loanRoutes);
app.use('/api', settlementRoutes);
app.use('/api', employeeRoutes);
app.use('/api', notificationRoutes);
app.use('/api', auditRoutes);
app.use('/api', crawlerRoutes);
app.use('/api', loginRoutes);
app.use('/api', settlementApiRoutes);
app.use('/api', employeeApiRoutes);
app.use('/api', notificationApiRoutes);
app.use('/api', intakeRoutes);
app.use('/api', auditApiRoutes);

// --- 에러 핸들링 ---
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`\n=== 대부중개 전산시스템 ===`);
  console.log(`서버: http://localhost:${PORT}`);

  // MySQL 연결 확인
  const { testConnection } = require('./database/db');
  const dbOk = await testConnection();
  console.log(`MySQL: ${dbOk ? '연결됨' : '연결실패'}`);
  console.log(`==========================\n`);
});

module.exports = app;

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
const legalRoutes = require('./routes/legalRoutes');
const customerRoutes = require('./routes/customerRoutes');
const contentRoutes = require('./routes/contentRoutes');
const imageAssetRoutes = require('./routes/imageAssetRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const webDesignRoutes = require('./routes/webDesignRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 미들웨어 ---
app.use(express.json());

// CORS 허용 (홈페이지에서 API 호출)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- 홈페이지 고객 접수 API ---
const intakeRecords = [];

app.post('/api/intake/homepage', (req, res) => {
  const { name, phone, content, source } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: '이름과 전화번호는 필수입니다.' });
  }
  const record = {
    id: intakeRecords.length + 1,
    name,
    phone,
    content: content || '',
    source: source || '홈페이지',
    createdAt: new Date().toISOString(),
  };
  intakeRecords.push(record);
  console.log('[신규 유입]', record.name, record.phone, record.source);
  res.json({ success: true, message: '접수 완료', id: record.id });
});

app.get('/api/intake/list', (req, res) => {
  res.json({ success: true, data: intakeRecords, total: intakeRecords.length });
});

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
app.use('/api', legalRoutes);
app.use('/api', customerRoutes);
app.use('/api', contentRoutes);
app.use('/api', imageAssetRoutes);
app.use('/api', monitoringRoutes);
app.use('/api', webDesignRoutes);

// --- 에러 핸들링 ---
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n=== DailyFNI Agency System ===`);
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`==============================\n`);
});

module.exports = app;

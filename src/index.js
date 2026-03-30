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

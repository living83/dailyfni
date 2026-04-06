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
const settingsRoutes = require('./routes/settingsRoutes');
const accountRoutes = require('./routes/accountRoutes');
const contentRoutes = require('./routes/contentRoutes');
const postingRoutes = require('./routes/postingRoutes');
const engagementRoutes = require('./routes/engagementRoutes');
const statsRoutes = require('./routes/statsRoutes');

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
app.use('/api', settingsRoutes);
app.use('/api', accountRoutes);
app.use('/api', contentRoutes);
app.use('/api', postingRoutes);
app.use('/api', engagementRoutes);
app.use('/api', statsRoutes);

// --- 에러 핸들링 ---
app.use(errorHandler);

// --- 자동 포스팅 스케줄러 ---
const { startScheduler } = require('./services/scheduler');
startScheduler();

// --- 이웃참여 스케줄러 ---
const { startEngagementScheduler } = require('./services/engagementScheduler');
startEngagementScheduler();

app.listen(PORT, () => {
  console.log(`\n=== DailyFNI Agency System ===`);
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`==============================\n`);
});

module.exports = app;

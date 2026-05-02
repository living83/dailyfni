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
const buddyRoutes = require('./routes/buddyRoutes');
const styleRoutes = require('./routes/styleRoutes');
const tistoryRoutes = require('./routes/tistoryRoutes');
const manualLoginRoutes = require('./routes/manualLoginRoutes');

const { sessionAuth, loginHandler, logoutHandler, checkHandler } = require('./middleware/sessionAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 미들웨어 ---
app.use(express.json());
app.use(sessionAuth);

// --- 인증 ---
app.post('/api/admin/login', loginHandler);
app.get('/api/admin/logout', logoutHandler);
app.get('/api/admin/check', checkHandler);

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
app.use('/api', buddyRoutes);
app.use('/api', styleRoutes);
app.use('/api', tistoryRoutes);
app.use('/api', manualLoginRoutes);

// --- 에러 핸들링 ---
app.use(errorHandler);

// --- 자동 포스팅 스케줄러 ---
const { startScheduler } = require('./services/scheduler');
startScheduler();

// --- 이웃참여 스케줄러 ---
const { startEngagementScheduler } = require('./services/engagementScheduler');
startEngagementScheduler();

// --- 서로이웃 수락 스케줄러 ---
const { startBuddyScheduler } = require('./services/buddyAcceptScheduler');
startBuddyScheduler();

// --- 티스토리 포스팅 스케줄러 ---
const { startTistoryScheduler } = require('./services/tistoryScheduler');
startTistoryScheduler();

app.listen(PORT, () => {
  console.log(`\n=== DailyFNI Agency System ===`);
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`==============================\n`);
});

module.exports = app;

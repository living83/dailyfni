require('dotenv').config();
const express = require('express');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const agencyRoutes = require('./routes/agencyRoutes');
const plannerRoutes = require('./routes/plannerRoutes');

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

// --- 에러 핸들링 ---
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n=== DailyFNI Agency System ===`);
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`==============================\n`);
});

module.exports = app;

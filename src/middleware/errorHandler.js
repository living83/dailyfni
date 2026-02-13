function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : '서버 내부 오류가 발생했습니다.';

  if (!err.isOperational) {
    console.error('[ERROR]', err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = errorHandler;

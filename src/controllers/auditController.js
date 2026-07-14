const AuditLog = require('../models/AuditLog');

// GET /api/audit-logs - 감사로그 조회
function getAuditLogs(req, res) {
  const { startDate, endDate, performedBy, eventType, targetId } = req.query;
  const logs = AuditLog.findAll({ startDate, endDate, performedBy, eventType, targetId });
  res.json({
    success: true,
    data: { logs: logs.map((l) => l.toJSON()), count: logs.length },
  });
}

module.exports = {
  getAuditLogs,
};

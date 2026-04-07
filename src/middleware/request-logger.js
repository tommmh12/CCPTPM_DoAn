const logger = require("../utils/logger");

function requestLogger(req, res, next) {
  res.on("finish", () => {
    const startedAt = req.requestStartedAt || process.hrtime.bigint();
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;

    logger.info("request.completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user ? req.user.user_id : null,
      ip: req.ip
    });
  });

  next();
}

module.exports = { requestLogger };

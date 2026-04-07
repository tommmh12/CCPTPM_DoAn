const crypto = require("crypto");
//
function requestContext(req, res, next) {
  const requestId = crypto.randomUUID();

  req.requestId = requestId;
  req.requestStartedAt = process.hrtime.bigint();
  res.setHeader("X-Request-Id", requestId);

  next();
}

module.exports = { requestContext };

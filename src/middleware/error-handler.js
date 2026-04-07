const logger = require("../utils/logger");
const { httpError } = require("../utils/http-error");

function notFoundHandler(req, _res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  error.code = "ROUTE_NOT_FOUND";
  next(error);
}

function errorHandler(error, req, res, _next) {
  let normalizedError = error;

  if (error instanceof SyntaxError && error.type === "entity.parse.failed") {
    normalizedError = httpError(400, "Request body contains invalid JSON", {
      code: "INVALID_JSON"
    });
  } else if (error && error.code === "ER_DUP_ENTRY") {
    normalizedError = httpError(409, "A record with the same unique value already exists", {
      code: "DUPLICATE_RESOURCE"
    });
  }

  const status = normalizedError.status || 500;
  const code = normalizedError.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");

  logger.error("request.failed", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: status,
    code,
    message: normalizedError.message || "Internal server error",
    stack: normalizedError.stack
  });

  res.status(status).json({
    requestId: req.requestId,
    message: normalizedError.message || "Internal server error",
    error: {
      code,
      message: normalizedError.message || "Internal server error",
      details: normalizedError.details || null
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};

function httpError(status, message, options = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = options.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");
  error.details = options.details;
  return error;
}

module.exports = { httpError };

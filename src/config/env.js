const dotenv = require("dotenv");

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  dbHost: process.env.DB_HOST || "127.0.0.1",
  dbPort: Number(process.env.DB_PORT || 3306),
  dbName: process.env.DB_NAME || "zen_workspace",
  dbUser: process.env.DB_USER || "root",
  dbPassword: process.env.DB_PASSWORD || "",
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  sessionCleanupIntervalMinutes: Number(process.env.SESSION_CLEANUP_INTERVAL_MINUTES || 30),
  authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15),
  authRateLimitMaxAttempts: Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 5),
  logLevel: process.env.LOG_LEVEL || "info"
};

module.exports = { env };

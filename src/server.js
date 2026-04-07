const app = require("./app");
const { pool } = require("./config/database");
const { env } = require("./config/env");
const { startSessionCleanupScheduler } = require("./services/session-service");
const logger = require("./utils/logger");

const server = app.listen(env.port, () => {
  logger.info("server.started", {
    port: env.port,
    environment: env.nodeEnv
  });
});
const stopSessionCleanup = startSessionCleanupScheduler();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("server.shutdown.started", { signal });
  stopSessionCleanup();

  server.close(async () => {
    try {
      await pool.end();
      logger.info("server.shutdown.completed", { signal });
      process.exit(0);
    } catch (error) {
      logger.error("server.shutdown.failed", {
        signal,
        message: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("unhandledRejection", (error) => {
  logger.error("process.unhandledRejection", {
    message: error && error.message ? error.message : "Unhandled rejection",
    stack: error && error.stack ? error.stack : null
  });
});

process.on("uncaughtException", (error) => {
  logger.error("process.uncaughtException", {
    message: error.message,
    stack: error.stack
  });
  shutdown("uncaughtException");
});

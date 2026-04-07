const { env } = require("../config/env");

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function shouldLog(level) {
  const configuredLevel = levels[env.logLevel] ?? levels.info;
  const targetLevel = levels[level] ?? levels.info;
  return targetLevel <= configuredLevel;
}

function writeLog(level, message, context = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

module.exports = {
  debug: (message, context) => writeLog("debug", message, context),
  info: (message, context) => writeLog("info", message, context),
  warn: (message, context) => writeLog("warn", message, context),
  error: (message, context) => writeLog("error", message, context)
};

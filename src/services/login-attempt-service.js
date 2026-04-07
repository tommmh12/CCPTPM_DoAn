const { env } = require("../config/env");
const { httpError } = require("../utils/http-error");

const attempts = new Map();

function buildKey(ipAddress, email) {
  return `${ipAddress || "unknown"}:${String(email || "").trim().toLowerCase()}`;
}

function getWindowMs() {
  return Math.max(1, env.authRateLimitWindowMinutes) * 60 * 1000;
}

function getMaxAttempts() {
  return Math.max(1, env.authRateLimitMaxAttempts);
}

function pruneEntry(entry, now) {
  const windowStart = now - getWindowMs();
  entry.timestamps = entry.timestamps.filter((timestamp) => timestamp >= windowStart);

  if (entry.blockedUntil && entry.blockedUntil <= now) {
    entry.blockedUntil = null;
  }
}

function assertLoginAllowed(ipAddress, email) {
  const key = buildKey(ipAddress, email);
  const entry = attempts.get(key);

  if (!entry) {
    return;
  }

  const now = Date.now();
  pruneEntry(entry, now);

  if (entry.blockedUntil && entry.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((entry.blockedUntil - now) / 1000);

    throw httpError(429, "Too many failed login attempts. Please try again later.", {
      code: "AUTH_RATE_LIMITED",
      details: [{ field: "email", message: `Retry after ${retryAfterSeconds} seconds` }]
    });
  }

  if (!entry.timestamps.length) {
    attempts.delete(key);
  }
}

function recordFailure(ipAddress, email) {
  const key = buildKey(ipAddress, email);
  const now = Date.now();
  const entry = attempts.get(key) || { timestamps: [], blockedUntil: null };

  pruneEntry(entry, now);
  entry.timestamps.push(now);

  if (entry.timestamps.length >= getMaxAttempts()) {
    entry.blockedUntil = now + getWindowMs();
  }

  attempts.set(key, entry);
}

function clearFailures(ipAddress, email) {
  attempts.delete(buildKey(ipAddress, email));
}

module.exports = {
  assertLoginAllowed,
  clearFailures,
  recordFailure
};

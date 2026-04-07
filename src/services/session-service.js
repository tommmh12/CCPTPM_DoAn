const { pool } = require("../config/database");
const { env } = require("../config/env");
const logger = require("../utils/logger");

let capabilitiesPromise = null;

function normalizeIpAddress(ipAddress) {
  if (!ipAddress) {
    return null;
  }

  return String(ipAddress).trim().slice(0, 45) || null;
}

function normalizeUserAgent(userAgent) {
  if (!userAgent) {
    return null;
  }

  return String(userAgent).trim().slice(0, 255) || null;
}

async function loadCapabilities() {
  try {
    const [rows] = await pool.query(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = 'user_sessions'
          AND COLUMN_NAME IN ('last_used_at', 'ip_address', 'user_agent')
      `,
      [env.dbName]
    );

    const availableColumns = new Set(rows.map((row) => row.COLUMN_NAME));

    return {
      hasLastUsedAt: availableColumns.has("last_used_at"),
      hasIpAddress: availableColumns.has("ip_address"),
      hasUserAgent: availableColumns.has("user_agent")
    };
  } catch (error) {
    logger.warn("session.capabilities.unavailable", {
      message: error.message
    });

    return {
      hasLastUsedAt: false,
      hasIpAddress: false,
      hasUserAgent: false
    };
  }
}

async function getCapabilities() {
  if (!capabilitiesPromise) {
    capabilitiesPromise = loadCapabilities();
  }

  return capabilitiesPromise;
}

async function createSession(userId, tokenHash, sessionDays, metadata = {}, executor = pool) {
  const capabilities = await getCapabilities();
  const ipAddress = normalizeIpAddress(metadata.ipAddress);
  const userAgent = normalizeUserAgent(metadata.userAgent);

  if (capabilities.hasLastUsedAt || capabilities.hasIpAddress || capabilities.hasUserAgent) {
    const columns = ["user_id", "token_hash", "expires_at"];
    const values = ["?", "?", "DATE_ADD(NOW(), INTERVAL ? DAY)"];
    const params = [userId, tokenHash, sessionDays];

    if (capabilities.hasLastUsedAt) {
      columns.push("last_used_at");
      values.push("NOW()");
    }

    if (capabilities.hasIpAddress) {
      columns.push("ip_address");
      values.push("?");
      params.push(ipAddress);
    }

    if (capabilities.hasUserAgent) {
      columns.push("user_agent");
      values.push("?");
      params.push(userAgent);
    }

    await executor.query(
      `
        INSERT INTO user_sessions (${columns.join(", ")})
        VALUES (${values.join(", ")})
      `,
      params
    );

    return;
  }

  await executor.query(
    `
      INSERT INTO user_sessions (user_id, token_hash, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))
    `,
    [userId, tokenHash, sessionDays]
  );
}

async function touchSession(sessionId, metadata = {}, executor = pool) {
  const capabilities = await getCapabilities();

  if (!capabilities.hasLastUsedAt && !capabilities.hasIpAddress && !capabilities.hasUserAgent) {
    return;
  }

  const assignments = [];
  const params = [];

  if (capabilities.hasLastUsedAt) {
    assignments.push("last_used_at = NOW()");
  }

  if (capabilities.hasIpAddress) {
    assignments.push("ip_address = ?");
    params.push(normalizeIpAddress(metadata.ipAddress));
  }

  if (capabilities.hasUserAgent) {
    assignments.push("user_agent = ?");
    params.push(normalizeUserAgent(metadata.userAgent));
  }

  if (!assignments.length) {
    return;
  }

  params.push(sessionId);

  await executor.query(
    `
      UPDATE user_sessions
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );
}

async function deleteSessionByTokenHash(tokenHash, executor = pool) {
  await executor.query("DELETE FROM user_sessions WHERE token_hash = ?", [tokenHash]);
}

async function deleteOtherUserSessions(userId, currentTokenHash, executor = pool) {
  await executor.query(
    `
      DELETE FROM user_sessions
      WHERE user_id = ? AND token_hash <> ?
    `,
    [userId, currentTokenHash]
  );
}

async function deleteAllUserSessions(userId, executor = pool) {
  await executor.query(
    `
      DELETE FROM user_sessions
      WHERE user_id = ?
    `,
    [userId]
  );
}

async function deleteExpiredSessions(executor = pool) {
  const [result] = await executor.query(
    `
      DELETE FROM user_sessions
      WHERE expires_at <= NOW()
    `
  );

  return result.affectedRows || 0;
}

function startSessionCleanupScheduler() {
  const intervalMinutes = Math.max(1, env.sessionCleanupIntervalMinutes);

  const runCleanup = async () => {
    try {
      const deletedCount = await deleteExpiredSessions();

      if (deletedCount > 0) {
        logger.info("session.cleanup.completed", {
          deletedCount
        });
      }
    } catch (error) {
      logger.error("session.cleanup.failed", {
        message: error.message,
        stack: error.stack
      });
    }
  };

  runCleanup();

  const timer = setInterval(runCleanup, intervalMinutes * 60 * 1000);
  timer.unref();

  return () => clearInterval(timer);
}

module.exports = {
  createSession,
  deleteAllUserSessions,
  deleteExpiredSessions,
  deleteOtherUserSessions,
  deleteSessionByTokenHash,
  getCapabilities,
  startSessionCleanupScheduler,
  touchSession
};

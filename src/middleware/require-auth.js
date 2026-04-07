const { pool } = require("../config/database");
const { hashToken } = require("../utils/security");
const { httpError } = require("../utils/http-error");
const { touchSession } = require("../services/session-service");

async function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return next(httpError(401, "Authentication token is required", { code: "AUTH_REQUIRED" }));
  }

  const tokenHash = hashToken(token);

  const [rows] = await pool.query(
    `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.expires_at,
        u.full_name,
        u.email,
        u.avatar_url
      FROM user_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  if (!rows.length) {
    return next(httpError(401, "Session expired or invalid", { code: "AUTH_INVALID_SESSION" }));
  }

  req.authToken = token;
  req.user = rows[0];
  await touchSession(req.user.session_id, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  });
  next();
}

module.exports = { requireAuth };

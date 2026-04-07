const { pool } = require("../config/database");
const { env } = require("../config/env");
const { generateToken, hashPassword, hashToken, verifyPassword } = require("../utils/security");
const { httpError } = require("../utils/http-error");
const { assertLoginAllowed, clearFailures, recordFailure } = require("../services/login-attempt-service");
const {
  createSession,
  deleteAllUserSessions,
  deleteSessionByTokenHash
} = require("../services/session-service");

async function login(req, res) {
  const { email, password, remember } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get("user-agent");

  assertLoginAllowed(ipAddress, email);

  const [users] = await pool.query(
    `
      SELECT id, full_name, email, password_hash, avatar_url
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [String(email).trim().toLowerCase()]
  );

  const user = users[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailure(ipAddress, email);
    const error = new Error("Invalid email or password");
    error.status = 401;
    error.code = "AUTH_INVALID_CREDENTIALS";
    throw error;
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const sessionDays = remember ? env.sessionDays : 1;

  clearFailures(ipAddress, email);
  await createSession(user.id, tokenHash, sessionDays, { ipAddress, userAgent });

  res.json({
    token: rawToken,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      avatarUrl: user.avatar_url
    }
  });
}

async function register(req, res) {
  const { fullName, email, password, remember } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get("user-agent");
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingUsers] = await connection.query(
      `
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email]
    );

    if (existingUsers[0]) {
      throw httpError(409, "An account with this email already exists", {
        code: "AUTH_EMAIL_IN_USE"
      });
    }

    const [result] = await connection.query(
      `
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          membership_tier,
          public_profile
        )
        VALUES (?, ?, ?, 'Premium Member', 1)
      `,
      [fullName, email, hashPassword(password)]
    );

    const userId = result.insertId;

    await connection.query(
      `
        INSERT INTO user_preferences (
          user_id,
          theme,
          accent_color,
          language_code,
          timezone,
          auto_translate,
          auto_dst
        )
        VALUES (?, 'light', '#3d6758', 'en-US', 'UTC', 0, 1)
      `,
      [userId]
    );

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const sessionDays = remember ? env.sessionDays : 1;

    await createSession(userId, tokenHash, sessionDays, { ipAddress, userAgent }, connection);

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'session', ?, 'registered', 'Created a new account')
      `,
      [userId, userId, userId]
    );

    await connection.commit();

    res.status(201).json({
      token: rawToken,
      user: {
        id: userId,
        fullName,
        email,
        avatarUrl: null
      }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;

  const [users] = await pool.query(
    `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  if (users[0]) {
    await pool.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'session', ?, 'password_reset_requested', 'Requested a password reset link')
      `,
      [users[0].id, users[0].id, users[0].id]
    );
  }

  res.status(202).json({
    message: "If an account exists for this email, a password reset link has been prepared."
  });
}

async function session(req, res) {
  res.json({
    user: {
      id: req.user.user_id,
      fullName: req.user.full_name,
      email: req.user.email,
      avatarUrl: req.user.avatar_url
    }
  });
}

async function logout(req, res) {
  await deleteSessionByTokenHash(hashToken(req.authToken));
  res.status(204).send();
}

async function logoutAll(req, res) {
  await deleteAllUserSessions(req.user.user_id);
  res.status(204).send();
}

module.exports = {
  forgotPassword,
  login,
  logoutAll,
  logout,
  register,
  session
};

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
const { getGoogleAuthConfig, verifyGoogleCredential } = require("../services/google-auth-service");

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

async function googleConfig(_req, res) {
  res.json(getGoogleAuthConfig());
}

async function googleLogin(req, res) {
  const { credential, remember } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get("user-agent");
  const googleProfile = await verifyGoogleCredential(credential);

  assertLoginAllowed(ipAddress, googleProfile.email);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.query(
      `
        SELECT id, full_name, email, avatar_url
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [googleProfile.email]
    );

    let user = users[0];

    if (!user) {
      const generatedPasswordHash = hashPassword(generateToken());
      const [result] = await connection.query(
        `
          INSERT INTO users (full_name, email, password_hash, avatar_url)
          VALUES (?, ?, ?, ?)
        `,
        [googleProfile.fullName, googleProfile.email, generatedPasswordHash, googleProfile.avatarUrl]
      );

      await connection.query(
        `
          INSERT INTO user_preferences (user_id)
          VALUES (?)
        `,
        [result.insertId]
      );

      user = {
        id: result.insertId,
        full_name: googleProfile.fullName,
        email: googleProfile.email,
        avatar_url: googleProfile.avatarUrl
      };
    } else if (!user.avatar_url && googleProfile.avatarUrl) {
      await connection.query(
        `
          UPDATE users
          SET avatar_url = ?
          WHERE id = ?
        `,
        [googleProfile.avatarUrl, user.id]
      );

      user.avatar_url = googleProfile.avatarUrl;
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const sessionDays = remember ? env.sessionDays : 1;

    await createSession(user.id, tokenHash, sessionDays, { ipAddress, userAgent }, connection);
    await connection.commit();
    clearFailures(ipAddress, googleProfile.email);

    res.json({
      token: rawToken,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        avatarUrl: user.avatar_url
      }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw httpError(409, "This Google account is already linked to another user", {
        code: "GOOGLE_AUTH_DUPLICATE_ACCOUNT"
      });
    }

    throw error;
  } finally {
    connection.release();
  }
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
  googleConfig,
  googleLogin,
  login,
  logoutAll,
  logout,
  session
};

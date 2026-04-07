const { pool } = require("../config/database");
const { httpError } = require("../utils/http-error");
const { hashPassword, hashToken, verifyPassword } = require("../utils/security");
const { deleteOtherUserSessions } = require("../services/session-service");

function mapProfile(row, preferences) {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    phoneNumber: row.phone_number,
    location: row.location,
    membershipTier: row.membership_tier,
    publicProfile: Boolean(row.public_profile),
    preferences: preferences
      ? {
          theme: preferences.theme,
          accentColor: preferences.accent_color,
          languageCode: preferences.language_code,
          timezone: preferences.timezone,
          autoTranslate: Boolean(preferences.auto_translate),
          autoDst: Boolean(preferences.auto_dst)
        }
      : null
  };
}

async function getProfile(req, res) {
  const userId = req.user.user_id;

  const [[users], [preferences]] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          full_name,
          username,
          email,
          avatar_url,
          bio,
          phone_number,
          location,
          membership_tier,
          public_profile
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT theme, accent_color, language_code, timezone, auto_translate, auto_dst
        FROM user_preferences
        WHERE user_id = ?
        LIMIT 1
      `,
      [userId]
    )
  ]);

  const user = users[0];

  if (!user) {
    throw httpError(404, "User not found");
  }

  res.json({
    profile: mapProfile(user, preferences[0] || null)
  });
}

async function updateProfile(req, res) {
  const userId = req.user.user_id;
  const {
    fullName,
    username,
    email,
    bio,
    phoneNumber,
    location,
    avatarUrl,
    publicProfile
  } = req.body;

  if (!fullName || !String(fullName).trim()) {
    throw httpError(400, "Full name is required");
  }

  if (!email || !String(email).trim()) {
    throw httpError(400, "Email is required");
  }

  const [existingRows] = await pool.query(
    `
      SELECT avatar_url, public_profile
           , phone_number
           , location
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  const existing = existingRows[0];

  if (!existing) {
    throw httpError(404, "User not found");
  }

  await pool.query(
    `
      UPDATE users
      SET
        full_name = ?,
        username = ?,
        email = ?,
        bio = ?,
        phone_number = ?,
        location = ?,
        avatar_url = ?,
        public_profile = ?
      WHERE id = ?
    `,
    [
      String(fullName).trim(),
      username ? String(username).trim() : null,
      String(email).trim().toLowerCase(),
      bio ? String(bio).trim() : null,
      phoneNumber === undefined ? existing.phone_number : phoneNumber ? String(phoneNumber).trim() : null,
      location === undefined ? existing.location : location ? String(location).trim() : null,
      avatarUrl ? String(avatarUrl).trim() : existing.avatar_url,
      publicProfile === undefined ? existing.public_profile : publicProfile ? 1 : 0,
      userId
    ]
  );

  await pool.query(
    `
      INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
      VALUES (?, ?, 'session', ?, 'profile_updated', 'Updated profile settings')
    `,
    [userId, userId, userId]
  );

  res.status(204).send();
}

async function getPreferences(req, res) {
  const userId = req.user.user_id;

  const [rows] = await pool.query(
    `
      SELECT theme, accent_color, language_code, timezone, auto_translate, auto_dst
      FROM user_preferences
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  const preferences = rows[0] || {
    theme: "light",
    accent_color: "#3d6758",
    language_code: "en-US",
    timezone: "UTC",
    auto_translate: 0,
    auto_dst: 1
  };

  res.json({
    preferences: {
      theme: preferences.theme,
      accentColor: preferences.accent_color,
      languageCode: preferences.language_code,
      timezone: preferences.timezone,
      autoTranslate: Boolean(preferences.auto_translate),
      autoDst: Boolean(preferences.auto_dst)
    }
  });
}

async function updatePreferences(req, res) {
  const userId = req.user.user_id;
  const { theme, accentColor, languageCode, timezone, autoTranslate, autoDst } = req.body;

  const normalizedTheme = theme === "dark" ? "dark" : "light";
  const normalizedAccent = accentColor ? String(accentColor).trim() : "#3d6758";
  const normalizedLanguage = languageCode ? String(languageCode).trim() : "en-US";
  const normalizedTimezone = timezone ? String(timezone).trim() : "UTC";

  await pool.query(
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        theme = VALUES(theme),
        accent_color = VALUES(accent_color),
        language_code = VALUES(language_code),
        timezone = VALUES(timezone),
        auto_translate = VALUES(auto_translate),
        auto_dst = VALUES(auto_dst)
    `,
    [
      userId,
      normalizedTheme,
      normalizedAccent,
      normalizedLanguage,
      normalizedTimezone,
      autoTranslate ? 1 : 0,
      autoDst ? 1 : 0
    ]
  );

  await pool.query(
    `
      INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
      VALUES (?, ?, 'session', ?, 'preferences_updated', 'Updated workspace preferences')
    `,
    [userId, userId, userId]
  );

  res.status(204).send();
}

async function changePassword(req, res) {
  const userId = req.user.user_id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw httpError(400, "All password fields are required");
  }

  if (newPassword.length < 8) {
    throw httpError(400, "New password must be at least 8 characters");
  }

  if (newPassword !== confirmPassword) {
    throw httpError(400, "Password confirmation does not match");
  }

  const [rows] = await pool.query(
    `
      SELECT password_hash
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  const user = rows[0];

  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    throw httpError(400, "Current password is incorrect");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
      `,
      [hashPassword(newPassword), userId]
    );

    await deleteOtherUserSessions(userId, req.authToken ? hashToken(req.authToken) : "", connection);

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'session', ?, 'password_changed', 'Changed account password')
      `,
      [userId, userId, userId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.status(204).send();
}

module.exports = {
  changePassword,
  getPreferences,
  getProfile,
  updatePreferences,
  updateProfile
};

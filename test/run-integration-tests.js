const assert = require("node:assert/strict");
const app = require("../src/app");
const { pool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/security");
//
const TEST_USER_EMAIL = "integration.test@zenspace.local";
const TEST_USER_PASSWORD = "Integration123!";
const TEST_USER_NAME = "Integration Test User";
const REGISTER_USER_EMAIL = "integration.register@zenspace.local";

let server;
let baseUrl;
let testUserId;
let registeredUserId;

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  return {
    response,
    payload,
  };
}

async function ensureTestUser() {
  const passwordHash = hashPassword(TEST_USER_PASSWORD);

  await pool.query(
    `
      INSERT INTO users (full_name, email, password_hash, membership_tier, public_profile)
      VALUES (?, ?, ?, 'Test Member', 0)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        password_hash = VALUES(password_hash),
        membership_tier = VALUES(membership_tier),
        public_profile = VALUES(public_profile)
    `,
    [TEST_USER_NAME, TEST_USER_EMAIL, passwordHash],
  );

  const [rows] = await pool.query(
    `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [TEST_USER_EMAIL],
  );

  testUserId = rows[0].id;

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
      VALUES (?, 'light', '#3d6758', 'en-US', 'UTC', 0, 1)
      ON DUPLICATE KEY UPDATE
        theme = VALUES(theme),
        accent_color = VALUES(accent_color),
        language_code = VALUES(language_code),
        timezone = VALUES(timezone),
        auto_translate = VALUES(auto_translate),
        auto_dst = VALUES(auto_dst)
    `,
    [testUserId],
  );
}

async function resetTestUserState() {
  if (!testUserId) {
    return;
  }

  await pool.query("DELETE FROM activity_logs WHERE user_id = ?", [testUserId]);
  await pool.query("DELETE FROM user_sessions WHERE user_id = ?", [testUserId]);
  await pool.query("DELETE FROM notes WHERE user_id = ?", [testUserId]);
  await pool.query("DELETE FROM tasks WHERE user_id = ?", [testUserId]);
  await pool.query("DELETE FROM tags WHERE user_id = ?", [testUserId]);
  await pool.query("DELETE FROM projects WHERE user_id = ?", [testUserId]);
}

async function resetRegisteredUserState() {
  if (!registeredUserId) {
    const [rows] = await pool.query(
      `
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [REGISTER_USER_EMAIL],
    );

    registeredUserId = rows[0]?.id;
  }

  if (!registeredUserId) {
    return;
  }

  await pool.query("DELETE FROM activity_logs WHERE user_id = ?", [
    registeredUserId,
  ]);
  await pool.query("DELETE FROM user_sessions WHERE user_id = ?", [
    registeredUserId,
  ]);
  await pool.query("DELETE FROM notes WHERE user_id = ?", [registeredUserId]);
  await pool.query("DELETE FROM tasks WHERE user_id = ?", [registeredUserId]);
  await pool.query("DELETE FROM tags WHERE user_id = ?", [registeredUserId]);
  await pool.query("DELETE FROM projects WHERE user_id = ?", [
    registeredUserId,
  ]);
  await pool.query("DELETE FROM user_preferences WHERE user_id = ?", [
    registeredUserId,
  ]);
  await pool.query("DELETE FROM users WHERE id = ?", [registeredUserId]);
  registeredUserId = null;
}

async function loginAndGetToken() {
  const { response, payload } = await requestJson("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      remember: false,
    }),
  });

  assert.equal(response.status, 200);
  assert.ok(payload.token);

  return payload.token;
}

async function startServer() {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function runStep(name, handler) {
  process.stdout.write(`- ${name} ... `);

  try {
    await handler();
    process.stdout.write("ok\n");
  } catch (error) {
    process.stdout.write("failed\n");
    throw error;
  }
}

async function main() {
  try {
    await ensureTestUser();
    await startServer();

    await runStep("login returns token and session data", async () => {
      await resetTestUserState();

      const { response, payload } = await requestJson("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          remember: false,
        }),
      });

      assert.equal(response.status, 200);
      assert.ok(payload.token);
      assert.equal(payload.user.email, TEST_USER_EMAIL);
    });

    await runStep(
      "login rejects malformed input with validation details",
      async () => {
        await resetTestUserState();

        const { response, payload } = await requestJson("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "bad-email",
            password: "short",
            remember: false,
          }),
        });

        assert.equal(response.status, 400);
        assert.equal(payload.error.code, "VALIDATION_ERROR");
        assert.ok(Array.isArray(payload.error.details));
        assert.ok(payload.message);
      },
    );

    await runStep(
      "register creates a new account and returns a session token",
      async () => {
        await resetRegisteredUserState();

        const { response, payload } = await requestJson("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fullName: "Registered Integration User",
            email: REGISTER_USER_EMAIL,
            password: "Register123!",
            confirmPassword: "Register123!",
            remember: true,
            acceptTerms: true,
          }),
        });

        assert.equal(response.status, 201);
        assert.ok(payload.token);
        assert.equal(payload.user.email, REGISTER_USER_EMAIL);

        const [rows] = await pool.query(
          `
          SELECT id
          FROM users
          WHERE email = ?
          LIMIT 1
        `,
          [REGISTER_USER_EMAIL],
        );

        assert.ok(rows[0]?.id);
        registeredUserId = rows[0].id;
      },
    );

    await runStep(
      "forgot password responds safely for existing and missing accounts",
      async () => {
        const existing = await requestJson("/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: TEST_USER_EMAIL,
          }),
        });

        assert.equal(existing.response.status, 202);
        assert.match(existing.payload.message, /If an account exists/i);

        const missing = await requestJson("/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "missing.account@zenspace.local",
          }),
        });

        assert.equal(missing.response.status, 202);
        assert.match(missing.payload.message, /If an account exists/i);
      },
    );

    await runStep("logout-all revokes every active session", async () => {
      await resetTestUserState();

      const firstToken = await loginAndGetToken();
      const secondToken = await loginAndGetToken();

      const logoutResponse = await fetch(`${baseUrl}/api/auth/logout-all`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firstToken}`,
        },
      });

      assert.equal(logoutResponse.status, 204);

      const sessionCheck = await fetch(`${baseUrl}/api/auth/session`, {
        headers: {
          Authorization: `Bearer ${secondToken}`,
        },
      });

      assert.equal(sessionCheck.status, 401);
    });

    await runStep(
      "task lifecycle routes create, update, star, and delete a task",
      async () => {
        await resetTestUserState();

        const token = await loginAndGetToken();
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        const createResult = await requestJson("/api/tasks", {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: "Integration task",
            description: "Created by integration test",
            priority: "high",
            dueAt: null,
            reminderAt: null,
            projectId: null,
            tagIds: [],
            subtasks: ["First subtask", "Second subtask"],
          }),
        });

        assert.equal(createResult.response.status, 201);
        assert.ok(createResult.payload.taskId);

        const taskId = createResult.payload.taskId;

        const updateResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            title: "Integration task updated",
            description: "Updated by integration test",
            priority: "medium",
            dueAt: null,
            reminderAt: null,
            projectId: null,
            tagIds: [],
            subtasks: ["Updated subtask"],
          }),
        });

        assert.equal(updateResponse.status, 204);

        const starResponse = await fetch(
          `${baseUrl}/api/tasks/${taskId}/star`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              isStarred: true,
            }),
          },
        );

        assert.equal(starResponse.status, 204);

        const detailResult = await requestJson(`/api/tasks/${taskId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        assert.equal(detailResult.response.status, 200);
        assert.equal(
          detailResult.payload.task.title,
          "Integration task updated",
        );
        assert.equal(detailResult.payload.task.isStarred, true);
        assert.equal(detailResult.payload.task.subtasks.length, 1);

        const deleteResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        assert.equal(deleteResponse.status, 204);

        const deletedCheck = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        assert.equal(deletedCheck.status, 404);
      },
    );

    process.stdout.write("\nIntegration tests passed.\n");
  } finally {
    await stopServer().catch(() => {});

    if (testUserId) {
      await resetTestUserState().catch(() => {});
      await pool
        .query("DELETE FROM user_preferences WHERE user_id = ?", [testUserId])
        .catch(() => {});
      await pool
        .query("DELETE FROM users WHERE id = ?", [testUserId])
        .catch(() => {});
    }

    await resetRegisteredUserState().catch(() => {});

    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("\nIntegration tests failed.");
  console.error(error);
  process.exit(1);
});

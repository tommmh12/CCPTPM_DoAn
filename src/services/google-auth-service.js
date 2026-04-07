const https = require("https");

const { env } = require("../config/env");
const { httpError } = require("../utils/http-error");

function isGoogleAuthEnabled() {
  return Boolean(env.googleClientId);
}

function getGoogleAuthConfig() {
  return {
    googleAuthEnabled: isGoogleAuthEnabled(),
    googleClientId: env.googleClientId || ""
  };
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let raw = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => {
        let payload = {};

        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(httpError(502, "Google returned an invalid response", { code: "GOOGLE_AUTH_INVALID_RESPONSE" }));
          return;
        }

        resolve({
          statusCode: response.statusCode || 500,
          payload
        });
      });
    });

    request.setTimeout(10000, () => {
      request.destroy(new Error("Google auth request timed out"));
    });

    request.on("error", (error) => {
      reject(
        httpError(502, "Unable to reach Google for sign-in verification", {
          code: "GOOGLE_AUTH_UNAVAILABLE",
          details: [{ field: "credential", message: error.message }]
        })
      );
    });
  });
}

async function verifyGoogleCredential(credential) {
  if (!isGoogleAuthEnabled()) {
    throw httpError(503, "Google sign-in is not configured", {
      code: "GOOGLE_AUTH_NOT_CONFIGURED"
    });
  }

  const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const { statusCode, payload } = await requestJson(tokenInfoUrl);

  if (statusCode < 200 || statusCode >= 300) {
    throw httpError(401, payload.error_description || payload.error || "Google credential is invalid", {
      code: "GOOGLE_AUTH_INVALID_CREDENTIAL"
    });
  }

  if (payload.aud !== env.googleClientId) {
    throw httpError(401, "Google credential was issued for a different application", {
      code: "GOOGLE_AUTH_INVALID_AUDIENCE"
    });
  }

  if (payload.iss && !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
    throw httpError(401, "Google credential issuer is invalid", {
      code: "GOOGLE_AUTH_INVALID_ISSUER"
    });
  }

  if (payload.email_verified !== "true") {
    throw httpError(401, "Google account email is not verified", {
      code: "GOOGLE_AUTH_EMAIL_NOT_VERIFIED"
    });
  }

  if (!payload.email || !payload.sub) {
    throw httpError(401, "Google credential is missing required identity fields", {
      code: "GOOGLE_AUTH_INCOMPLETE_PROFILE"
    });
  }

  return {
    email: String(payload.email).trim().toLowerCase(),
    fullName: String(payload.name || payload.email).trim(),
    avatarUrl: payload.picture ? String(payload.picture).trim() : null,
    googleSubject: String(payload.sub).trim()
  };
}

module.exports = {
  getGoogleAuthConfig,
  isGoogleAuthEnabled,
  verifyGoogleCredential
};

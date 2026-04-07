const express = require("express");
const path = require("path");

const { pageRouter } = require("./routes/pages");
const { apiRouter } = require("./routes/api");
const { requestContext } = require("./middleware/request-context");
const { requestLogger } = require("./middleware/request-logger");
const { notFoundHandler, errorHandler } = require("./middleware/error-handler");
const { env } = require("./config/env");

const app = express();
const frontendDir = path.join(__dirname, "..", "html_renamed_for_copy");
<<<<<<< HEAD
const trustProxyValue = String(env.trustProxy).trim().toLowerCase();
const corsAllowedOrigins = String(env.corsAllowedOrigins)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function appendVaryHeader(res, value) {
  const currentValue = res.getHeader("Vary");

  if (!currentValue) {
    res.setHeader("Vary", value);
    return;
  }

  const varyValues = new Set(
    String(currentValue)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

  varyValues.add(value);
  res.setHeader("Vary", Array.from(varyValues).join(", "));
}

function isOriginAllowed(origin) {
  return corsAllowedOrigins.includes("*") || corsAllowedOrigins.includes(origin);
}
=======
const uploadsDir = path.join(__dirname, "..", "uploads");
>>>>>>> 0bc4cf3cbaefa3effd59dd40fcec691490a60326

app.disable("x-powered-by");

if (trustProxyValue === "true") {
  app.set("trust proxy", true);
} else if (/^\d+$/.test(trustProxyValue)) {
  app.set("trust proxy", Number(trustProxyValue));
}

app.use((req, res, next) => {
  const origin = req.get("origin");

  if (origin && corsAllowedOrigins.length > 0) {
    appendVaryHeader(res, "Origin");

    if (isOriginAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    } else if (req.method === "OPTIONS") {
      return res.status(403).json({
        error: {
          message: "Origin not allowed",
          code: "CORS_ORIGIN_NOT_ALLOWED"
        }
      });
    }
  }

  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }

  next();
});

app.use(requestContext);
app.use(requestLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(frontendDir));
app.use("/uploads", express.static(uploadsDir));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.use("/", pageRouter(frontendDir));
app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

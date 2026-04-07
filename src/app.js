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
const uploadsDir = path.join(__dirname, "..", "uploads");

app.disable("x-powered-by");
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

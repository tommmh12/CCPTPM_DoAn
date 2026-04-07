const express = require("express");
const path = require("path");

function pageRouter(frontendDir) {
  const router = express.Router();
  //
  const pages = {
    "/": "07-ethereal-canvas-login.html",
    "/login": "07-ethereal-canvas-login.html",
    "/register": "11-ethereal-canvas-register.html",
    "/forgot-password": "05-ethereal-canvas-forgot-password.html",
    "/dashboard": "04-zen-workspace-dashboard.html",
    "/schedule": "03-zen-workspace-calendar.html",
    "/tasks": "14-zen-workspace-tasks-overview.html",
    "/tasks/new": "15-zen-workspace-create-task.html",
    "/notes": "08-zen-workspace-notes-library.html",
    "/profile": "21-zen-workspace-profile.html",
    "/profile/edit": "22-zen-workspace-edit-profile.html",
    "/settings": "24-zen-workspace-settings-preferences.html",
    "/settings/preferences": "24-zen-workspace-settings-preferences.html",
    "/settings/security": "23-zen-workspace-change-password.html",
  };

  for (const [routePath, fileName] of Object.entries(pages)) {
    router.get(routePath, (_req, res) => {
      res.sendFile(path.join(frontendDir, fileName));
    });
  }

  return router;
}

module.exports = { pageRouter };

const express = require("express");

const { googleConfig, googleLogin, login, logout, logoutAll, session } = require("../controllers/auth-controller");
const { summary } = require("../controllers/dashboard-controller");
const { options } = require("../controllers/meta-controller");
const { list: scheduleList } = require("../controllers/schedule-controller");
const {
  create: createNote,
  detail: noteDetail,
  list: noteList,
  remove: deleteNote,
  setPinned,
  update: updateNote
} = require("../controllers/note-controller");
const {
  changePassword,
  getPreferences,
  getProfile,
  updatePreferences,
  updateProfile
} = require("../controllers/profile-controller");
const {
  addActivity,
  create: createTask,
  detail: taskDetail,
  list: taskList,
  remove: deleteTask,
  setStarred,
  toggleSubtask,
  update: updateTask,
  updateStatus
} = require("../controllers/task-controller");
const { requireAuth } = require("../middleware/require-auth");
const { validateRequest } = require("../middleware/validate-request");
const {
  validateChangePasswordBody,
  validateGoogleAuthBody,
  validateLoginBody,
  validateNoteCreateBody,
  validateNotePinBody,
  validateNoteIdParam,
  validateNoteUpdateBody,
  validatePreferencesBody,
  validateProfileUpdateBody,
  validateScheduleQuery,
  validateSearchQuery,
  validateSubtaskIdParam,
  validateTaskActivityBody,
  validateTaskCreateBody,
  validateTaskIdParam,
  validateTaskStarBody,
  validateTaskStatusBody,
  validateTaskUpdateBody
} = require("../middleware/validators");
const { asyncHandler } = require("../utils/async-handler");

const apiRouter = express.Router();

apiRouter.get("/auth/config", asyncHandler(googleConfig));
apiRouter.post("/auth/login", validateRequest(validateLoginBody), asyncHandler(login));
apiRouter.post("/auth/google", validateRequest(validateGoogleAuthBody), asyncHandler(googleLogin));
apiRouter.get("/auth/session", asyncHandler(requireAuth), asyncHandler(session));
apiRouter.post("/auth/logout", asyncHandler(requireAuth), asyncHandler(logout));
apiRouter.post("/auth/logout-all", asyncHandler(requireAuth), asyncHandler(logoutAll));

apiRouter.get("/dashboard/summary", asyncHandler(requireAuth), asyncHandler(summary));
apiRouter.get("/schedule", asyncHandler(requireAuth), validateRequest(validateScheduleQuery), asyncHandler(scheduleList));
apiRouter.get("/meta/options", asyncHandler(requireAuth), asyncHandler(options));
apiRouter.get("/profile", asyncHandler(requireAuth), asyncHandler(getProfile));
apiRouter.put(
  "/profile",
  asyncHandler(requireAuth),
  validateRequest(validateProfileUpdateBody),
  asyncHandler(updateProfile)
);
apiRouter.post(
  "/profile/change-password",
  asyncHandler(requireAuth),
  validateRequest(validateChangePasswordBody),
  asyncHandler(changePassword)
);
apiRouter.get("/preferences", asyncHandler(requireAuth), asyncHandler(getPreferences));
apiRouter.put(
  "/preferences",
  asyncHandler(requireAuth),
  validateRequest(validatePreferencesBody),
  asyncHandler(updatePreferences)
);

apiRouter.get("/tasks", asyncHandler(requireAuth), validateRequest(validateSearchQuery), asyncHandler(taskList));
apiRouter.get(
  "/tasks/:taskId",
  asyncHandler(requireAuth),
  validateRequest(validateTaskIdParam),
  asyncHandler(taskDetail)
);
apiRouter.post(
  "/tasks",
  asyncHandler(requireAuth),
  validateRequest(validateTaskCreateBody),
  asyncHandler(createTask)
);
apiRouter.put(
  "/tasks/:taskId",
  asyncHandler(requireAuth),
  validateRequest(validateTaskIdParam),
  validateRequest(validateTaskUpdateBody),
  asyncHandler(updateTask)
);
apiRouter.patch(
  "/tasks/:taskId/status",
  asyncHandler(requireAuth),
  validateRequest(validateTaskIdParam),
  validateRequest(validateTaskStatusBody),
  asyncHandler(updateStatus)
);
apiRouter.patch(
  "/tasks/:taskId/star",
  asyncHandler(requireAuth),
  validateRequest(validateTaskIdParam),
  validateRequest(validateTaskStarBody),
  asyncHandler(setStarred)
);
apiRouter.post(
  "/tasks/:taskId/activity",
  asyncHandler(requireAuth),
  validateRequest(validateTaskIdParam),
  validateRequest(validateTaskActivityBody),
  asyncHandler(addActivity)
);
apiRouter.patch(
  "/subtasks/:subtaskId/toggle",
  asyncHandler(requireAuth),
  validateRequest(validateSubtaskIdParam),
  asyncHandler(toggleSubtask)
);
apiRouter.delete(
  "/tasks/:taskId",
  asyncHandler(requireAuth),
  validateRequest(validateTaskIdParam),
  asyncHandler(deleteTask)
);

apiRouter.get("/notes", asyncHandler(requireAuth), validateRequest(validateSearchQuery), asyncHandler(noteList));
apiRouter.get(
  "/notes/:noteId",
  asyncHandler(requireAuth),
  validateRequest(validateNoteIdParam),
  asyncHandler(noteDetail)
);
apiRouter.post(
  "/notes",
  asyncHandler(requireAuth),
  validateRequest(validateNoteCreateBody),
  asyncHandler(createNote)
);
apiRouter.put(
  "/notes/:noteId",
  asyncHandler(requireAuth),
  validateRequest(validateNoteIdParam),
  validateRequest(validateNoteUpdateBody),
  asyncHandler(updateNote)
);
apiRouter.patch(
  "/notes/:noteId/pin",
  asyncHandler(requireAuth),
  validateRequest(validateNoteIdParam),
  validateRequest(validateNotePinBody),
  asyncHandler(setPinned)
);
apiRouter.delete(
  "/notes/:noteId",
  asyncHandler(requireAuth),
  validateRequest(validateNoteIdParam),
  asyncHandler(deleteNote)
);

module.exports = { apiRouter };

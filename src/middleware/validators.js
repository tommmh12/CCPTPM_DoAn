const {
  assertValid,
  ensureObject,
  parseBoolean,
  parseDateTime,
  parseEmail,
  parseEnum,
  parseIdArray,
  parseInteger,
  parseString,
  parseStringArray,
  pushIssue
} = require("../utils/validation");

function validateSearchQuery(req) {
  const issues = [];
  const search = parseString(req.query.search, "search", issues, {
    allowEmpty: true,
    maxLength: 120
  });

  assertValid(issues);
  req.query.search = search || "";
}

function validateScheduleQuery(req) {
  const issues = [];
  const view = parseEnum(req.query.view, "view", ["day", "week", "month"], issues, {
    defaultValue: "month"
  });
  const date = parseString(req.query.date, "date", issues, {
    allowEmpty: true,
    maxLength: 10
  });
  const day = parseString(req.query.day, "day", issues, {
    allowEmpty: true,
    maxLength: 10
  });

  [date, day].forEach((value, index) => {
    if (!value) {
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
      pushIssue(issues, index === 0 ? "date" : "day", "Must be a valid date in YYYY-MM-DD format");
    }
  });

  assertValid(issues);
  req.query.view = view;
  req.query.date = date || "";
  req.query.day = day || "";
}

function validateTaskIdParam(req) {
  const issues = [];
  const taskId = parseInteger(req.params.taskId, "taskId", issues, { required: true, positive: true });

  assertValid(issues);
  req.params.taskId = String(taskId);
}

function validateSubtaskIdParam(req) {
  const issues = [];
  const subtaskId = parseInteger(req.params.subtaskId, "subtaskId", issues, { required: true, positive: true });

  assertValid(issues);
  req.params.subtaskId = String(subtaskId);
}

function validateNoteIdParam(req) {
  const issues = [];
  const noteId = parseInteger(req.params.noteId, "noteId", issues, { required: true, positive: true });

  assertValid(issues);
  req.params.noteId = String(noteId);
}

function validateLoginBody(req) {
  ensureObject(req.body);

  const issues = [];
  const email = parseEmail(req.body.email, "email", issues, { required: true });
  const password = parseString(req.body.password, "password", issues, {
    required: true,
    minLength: 8,
    maxLength: 200
  });
  const remember = parseBoolean(req.body.remember, "remember", issues, {
    defaultValue: false
  });

  assertValid(issues);

  req.body = {
    email,
    password,
    remember
  };
}

function validateGoogleAuthBody(req) {
  ensureObject(req.body);

  const issues = [];
  const credential = parseString(req.body.credential, "credential", issues, {
    required: true,
    minLength: 20,
    maxLength: 4096
  });
  const remember = parseBoolean(req.body.remember, "remember", issues, {
    defaultValue: false
  });

  assertValid(issues);

  req.body = {
    credential,
    remember
  };
}

function validateProfileUpdateBody(req) {
  ensureObject(req.body);

  const issues = [];
  const fullName = parseString(req.body.fullName, "fullName", issues, {
    required: true,
    maxLength: 120
  });
  const username = parseString(req.body.username, "username", issues, {
    allowEmpty: true,
    maxLength: 80
  });
  const email = parseEmail(req.body.email, "email", issues, { required: true });
  const bio = parseString(req.body.bio, "bio", issues, {
    allowEmpty: true,
    maxLength: 2000
  });
  const phoneNumber = parseString(req.body.phoneNumber, "phoneNumber", issues, {
    allowEmpty: true,
    maxLength: 40
  });
  const location = parseString(req.body.location, "location", issues, {
    allowEmpty: true,
    maxLength: 120
  });
  const avatarUrl = parseString(req.body.avatarUrl, "avatarUrl", issues, {
    allowEmpty: true,
    maxLength: 255
  });
  const publicProfile = req.body.publicProfile === undefined
    ? undefined
    : parseBoolean(req.body.publicProfile, "publicProfile", issues, { required: true });

  if (username && !/^[a-zA-Z0-9_.-]+$/.test(username)) {
    pushIssue(issues, "username", "Can only contain letters, numbers, dot, underscore, and hyphen");
  }

  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
    pushIssue(issues, "avatarUrl", "Must be a valid http or https URL");
  }

  assertValid(issues);

  req.body = {
    fullName,
    username: username || null,
    email,
    bio: bio || null,
    phoneNumber: phoneNumber === undefined ? undefined : phoneNumber || null,
    location: location === undefined ? undefined : location || null,
    avatarUrl: avatarUrl || null,
    publicProfile
  };
}

function validatePreferencesBody(req) {
  ensureObject(req.body);

  const issues = [];
  const theme = parseEnum(req.body.theme, "theme", ["light", "dark"], issues, {
    defaultValue: "light"
  });
  const accentColor = parseString(req.body.accentColor, "accentColor", issues, {
    allowEmpty: true,
    maxLength: 7
  }) || "#3d6758";
  const languageCode = parseString(req.body.languageCode, "languageCode", issues, {
    allowEmpty: true,
    maxLength: 20
  }) || "en-US";
  const timezone = parseString(req.body.timezone, "timezone", issues, {
    allowEmpty: true,
    maxLength: 80
  }) || "UTC";
  const autoTranslate = parseBoolean(req.body.autoTranslate, "autoTranslate", issues, {
    defaultValue: false
  });
  const autoDst = parseBoolean(req.body.autoDst, "autoDst", issues, {
    defaultValue: true
  });

  if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    pushIssue(issues, "accentColor", "Must be a valid hex color");
  }

  assertValid(issues);

  req.body = {
    theme,
    accentColor,
    languageCode,
    timezone,
    autoTranslate,
    autoDst
  };
}

function validateChangePasswordBody(req) {
  ensureObject(req.body);

  const issues = [];
  const currentPassword = parseString(req.body.currentPassword, "currentPassword", issues, {
    required: true,
    minLength: 8,
    maxLength: 200
  });
  const newPassword = parseString(req.body.newPassword, "newPassword", issues, {
    required: true,
    minLength: 8,
    maxLength: 200
  });
  const confirmPassword = parseString(req.body.confirmPassword, "confirmPassword", issues, {
    required: true,
    minLength: 8,
    maxLength: 200
  });

  if (newPassword && !/[A-Z]/.test(newPassword)) {
    pushIssue(issues, "newPassword", "Must include at least one uppercase letter");
  }

  if (newPassword && !/[a-z]/.test(newPassword)) {
    pushIssue(issues, "newPassword", "Must include at least one lowercase letter");
  }

  if (newPassword && !/[0-9]/.test(newPassword)) {
    pushIssue(issues, "newPassword", "Must include at least one number");
  }

  if (newPassword && !/[^A-Za-z0-9]/.test(newPassword)) {
    pushIssue(issues, "newPassword", "Must include at least one special character");
  }

  if (newPassword && currentPassword && newPassword === currentPassword) {
    pushIssue(issues, "newPassword", "Must be different from the current password");
  }

  if (newPassword && confirmPassword && newPassword !== confirmPassword) {
    pushIssue(issues, "confirmPassword", "Does not match the new password");
  }

  assertValid(issues);

  req.body = {
    currentPassword,
    newPassword,
    confirmPassword
  };
}

function validateTaskCreateBody(req) {
  ensureObject(req.body);

  const issues = [];
  const title = parseString(req.body.title, "title", issues, {
    required: true,
    maxLength: 160
  });
  const description = parseString(req.body.description, "description", issues, {
    allowEmpty: true,
    maxLength: 4000
  });
  const projectId = parseInteger(req.body.projectId, "projectId", issues, {
    positive: true
  });
  const priority = parseEnum(req.body.priority, "priority", ["low", "medium", "high"], issues, {
    defaultValue: "medium"
  });
  const dueAt = parseDateTime(req.body.dueAt, "dueAt", issues);
  const reminderAt = parseDateTime(req.body.reminderAt, "reminderAt", issues);
  const tagIds = parseIdArray(req.body.tagIds, "tagIds", issues);
  const subtasks = parseStringArray(req.body.subtasks, "subtasks", issues, {
    maxItems: 20,
    itemMaxLength: 160
  });

  assertValid(issues);

  req.body = {
    title,
    description: description || null,
    projectId: projectId || null,
    priority,
    dueAt,
    reminderAt,
    tagIds,
    subtasks
  };
}

function validateTaskUpdateBody(req) {
  validateTaskCreateBody(req);
}

function validateTaskStatusBody(req) {
  ensureObject(req.body);

  const issues = [];
  const status = parseEnum(req.body.status, "status", ["todo", "in_progress", "completed"], issues, {
    required: true
  });

  assertValid(issues);
  req.body = { status };
}

function validateTaskStarBody(req) {
  ensureObject(req.body);

  const issues = [];
  const isStarred = parseBoolean(req.body.isStarred, "isStarred", issues, {
    required: true
  });

  assertValid(issues);
  req.body = { isStarred };
}

function validateTaskActivityBody(req) {
  ensureObject(req.body);

  const issues = [];
  const message = parseString(req.body.message, "message", issues, {
    allowEmpty: true,
    maxLength: 240
  });
  const emoji = parseString(req.body.emoji, "emoji", issues, {
    allowEmpty: true,
    maxLength: 16
  });
  const imageUrl = parseString(req.body.imageUrl, "imageUrl", issues, {
    allowEmpty: true,
    maxLength: 2000
  });
  const linkUrl = parseString(req.body.linkUrl, "linkUrl", issues, {
    allowEmpty: true,
    maxLength: 2000
  });
  const fileLabel = parseString(req.body.fileLabel, "fileLabel", issues, {
    allowEmpty: true,
    maxLength: 160
  });

  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    pushIssue(issues, "imageUrl", "Must be a valid http or https URL");
  }

  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
    pushIssue(issues, "linkUrl", "Must be a valid http or https URL");
  }

  if (!message && !emoji && !imageUrl && !linkUrl && !fileLabel) {
    pushIssue(issues, "message", "Add a message, emoji, image, file, or link");
  }

  assertValid(issues);
  req.body = {
    message: message || "",
    emoji: emoji || null,
    imageUrl: imageUrl || null,
    linkUrl: linkUrl || null,
    fileLabel: fileLabel || null
  };
}

function validateNoteCreateBody(req) {
  ensureObject(req.body);

  const issues = [];
  const title = parseString(req.body.title, "title", issues, {
    required: true,
    maxLength: 160
  });
  const body = parseString(req.body.body, "body", issues, {
    allowEmpty: true,
    maxLength: 20000
  });
  const category = parseString(req.body.category, "category", issues, {
    allowEmpty: true,
    maxLength: 60
  });
  const projectId = parseInteger(req.body.projectId, "projectId", issues, {
    positive: true
  });
  const tagIds = parseIdArray(req.body.tagIds, "tagIds", issues);

  assertValid(issues);

  req.body = {
    title,
    body: body || "",
    category: category || "General",
    projectId: projectId || null,
    tagIds
  };
}

function validateNoteUpdateBody(req) {
  validateNoteCreateBody(req);
}

function validateNotePinBody(req) {
  ensureObject(req.body);

  const issues = [];
  const isPinned = parseBoolean(req.body.isPinned, "isPinned", issues, {
    required: true
  });

  assertValid(issues);
  req.body = { isPinned };
}

module.exports = {
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
  validateTaskCreateBody,
  validateTaskActivityBody,
  validateTaskIdParam,
  validateTaskStarBody,
  validateTaskStatusBody,
  validateTaskUpdateBody
};

const { httpError } = require("./http-error");

function buildValidationError(details) {
  return httpError(400, "Request validation failed", {
    code: "VALIDATION_ERROR",
    details
  });
}

function pushIssue(issues, field, message) {
  issues.push({ field, message });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureObject(value, fieldName = "body") {
  if (!isPlainObject(value)) {
    throw buildValidationError([{ field: fieldName, message: "Must be an object" }]);
  }
}

function parseBoolean(value, field, issues, options = {}) {
  const { required = false, defaultValue } = options;

  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  if (required) {
    pushIssue(issues, field, "Must be a boolean");
  }

  return defaultValue;
}

function parseString(value, field, issues, options = {}) {
  const {
    required = false,
    trim = true,
    allowEmpty = false,
    minLength = 0,
    maxLength
  } = options;

  if (value === undefined || value === null) {
    if (required) {
      pushIssue(issues, field, "Is required");
    }

    return undefined;
  }

  const normalized = trim ? String(value).trim() : String(value);

  if (!allowEmpty && normalized.length === 0) {
    if (required) {
      pushIssue(issues, field, "Is required");
    } else {
      pushIssue(issues, field, "Cannot be empty");
    }
  }

  if (normalized.length > 0 && normalized.length < minLength) {
    pushIssue(issues, field, `Must be at least ${minLength} characters`);
  }

  if (maxLength && normalized.length > maxLength) {
    pushIssue(issues, field, `Must be at most ${maxLength} characters`);
  }

  return normalized;
}

function parseEmail(value, field, issues, options = {}) {
  const normalized = parseString(value, field, issues, {
    required: options.required,
    maxLength: 160
  });

  if (normalized === undefined || normalized.length === 0) {
    return normalized;
  }

  const email = normalized.toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    pushIssue(issues, field, "Must be a valid email address");
  }

  return email;
}

function parseInteger(value, field, issues, options = {}) {
  const { required = false, positive = false } = options;

  if (value === undefined || value === null || value === "") {
    if (required) {
      pushIssue(issues, field, "Is required");
    }

    return undefined;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized)) {
    pushIssue(issues, field, "Must be an integer");
    return undefined;
  }

  if (positive && normalized <= 0) {
    pushIssue(issues, field, "Must be greater than 0");
  }

  return normalized;
}

function parseEnum(value, field, allowedValues, issues, options = {}) {
  const { required = false, defaultValue } = options;

  if (value === undefined || value === null || value === "") {
    if (required && defaultValue === undefined) {
      pushIssue(issues, field, "Is required");
    }

    return defaultValue;
  }

  const normalized = String(value).trim();

  if (!allowedValues.includes(normalized)) {
    pushIssue(issues, field, `Must be one of: ${allowedValues.join(", ")}`);
    return defaultValue;
  }

  return normalized;
}

function parseDateTime(value, field, issues, options = {}) {
  const { required = false } = options;

  if (value === undefined || value === null || value === "") {
    if (required) {
      pushIssue(issues, field, "Is required");
    }

    return null;
  }

  const normalized = String(value).trim();
  const parsedDate = new Date(normalized);

  if (Number.isNaN(parsedDate.getTime())) {
    pushIssue(issues, field, "Must be a valid date/time");
    return null;
  }

  return normalized;
}

function parseIdArray(value, field, issues) {
  const items = value === undefined || value === null || value === "" ? [] : Array.isArray(value) ? value : [value];
  const normalized = [];

  for (let index = 0; index < items.length; index += 1) {
    const parsed = parseInteger(items[index], `${field}[${index}]`, issues, { positive: true });

    if (parsed !== undefined && !normalized.includes(parsed)) {
      normalized.push(parsed);
    }
  }

  return normalized;
}

function parseStringArray(value, field, issues, options = {}) {
  const { maxItems = 20, itemMaxLength = 160 } = options;
  const items = value === undefined || value === null || value === "" ? [] : Array.isArray(value) ? value : [value];

  if (items.length > maxItems) {
    pushIssue(issues, field, `Must contain at most ${maxItems} items`);
  }

  const normalized = [];

  for (let index = 0; index < items.length; index += 1) {
    const parsed = parseString(items[index], `${field}[${index}]`, issues, {
      maxLength: itemMaxLength
    });

    if (parsed && !normalized.includes(parsed)) {
      normalized.push(parsed);
    }
  }

  return normalized;
}

function assertValid(issues) {
  if (issues.length > 0) {
    throw buildValidationError(issues);
  }
}

module.exports = {
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
};

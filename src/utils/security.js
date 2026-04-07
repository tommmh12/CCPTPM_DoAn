const crypto = require("crypto");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("scrypt:")) {
    return false;
  }

  const [, salt, expectedHash] = storedHash.split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const candidateHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const candidateBuffer = Buffer.from(candidateHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

module.exports = {
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword
};

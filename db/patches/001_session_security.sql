ALTER TABLE user_sessions
  ADD COLUMN last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER expires_at,
  ADD COLUMN ip_address VARCHAR(45) NULL AFTER last_used_at,
  ADD COLUMN user_agent VARCHAR(255) NULL AFTER ip_address;

ALTER TABLE user_sessions
  ADD INDEX idx_user_sessions_expires_at (expires_at);

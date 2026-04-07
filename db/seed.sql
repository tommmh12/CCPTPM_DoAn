START TRANSACTION;

INSERT INTO users (
  full_name,
  username,
  email,
  password_hash,
  avatar_url,
  bio,
  phone_number,
  location,
  membership_tier,
  public_profile
)
VALUES (
  'Julian Rivera',
  'julian_rivera',
  'julian@zenspace.local',
  'scrypt:5fa6c594fd8a046855e944dc47377690:e533eda0784a8b5f32447113904494daec6da32937621d964d4db0681e33f3ebd34a0468ebaf12f962393459f811ec7ee5a17948ef684c913cb6df01c78e0a46',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
  'Productivity-focused maker building calm systems for notes, tasks, and daily planning.',
  '+84 912 345 678',
  'Ho Chi Minh City, Vietnam',
  'Premium Member',
  1
)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  username = VALUES(username),
  password_hash = VALUES(password_hash),
  avatar_url = VALUES(avatar_url),
  bio = VALUES(bio),
  phone_number = VALUES(phone_number),
  location = VALUES(location),
  membership_tier = VALUES(membership_tier),
  public_profile = VALUES(public_profile);

SET @user_id := (
  SELECT id
  FROM users
  WHERE email = 'julian@zenspace.local'
  LIMIT 1
);

DELETE FROM user_sessions
WHERE user_id = @user_id;

DELETE FROM activity_logs
WHERE user_id = @user_id;

DELETE FROM notes
WHERE user_id = @user_id;

DELETE FROM tasks
WHERE user_id = @user_id;

DELETE FROM tags
WHERE user_id = @user_id;

DELETE FROM projects
WHERE user_id = @user_id;

INSERT INTO user_preferences (
  user_id,
  theme,
  accent_color,
  language_code,
  timezone,
  auto_translate,
  auto_dst
)
VALUES (
  @user_id,
  'light',
  '#3d6758',
  'en-US',
  'Asia/Ho_Chi_Minh',
  0,
  1
)
ON DUPLICATE KEY UPDATE
  theme = VALUES(theme),
  accent_color = VALUES(accent_color),
  language_code = VALUES(language_code),
  timezone = VALUES(timezone),
  auto_translate = VALUES(auto_translate),
  auto_dst = VALUES(auto_dst);

INSERT INTO projects (user_id, name, color_hex, is_default)
VALUES
  (@user_id, 'Work / Design System', '#3d6758', 1),
  (@user_id, 'Personal Growth', '#486083', 0),
  (@user_id, 'Product Launch', '#3a6571', 0);

SET @project_work_id := (
  SELECT id
  FROM projects
  WHERE user_id = @user_id AND name = 'Work / Design System'
  LIMIT 1
);
SET @project_personal_id := (
  SELECT id
  FROM projects
  WHERE user_id = @user_id AND name = 'Personal Growth'
  LIMIT 1
);
SET @project_launch_id := (
  SELECT id
  FROM projects
  WHERE user_id = @user_id AND name = 'Product Launch'
  LIMIT 1
);

INSERT INTO tags (user_id, name, color_type)
VALUES
  (@user_id, 'Productivity', 'tertiary'),
  (@user_id, 'Phase 1', 'secondary'),
  (@user_id, 'Work', 'primary'),
  (@user_id, 'Personal', 'neutral'),
  (@user_id, 'Planning', 'tertiary');

SET @tag_productivity_id := (
  SELECT id
  FROM tags
  WHERE user_id = @user_id AND name = 'Productivity'
  LIMIT 1
);
SET @tag_phase1_id := (
  SELECT id
  FROM tags
  WHERE user_id = @user_id AND name = 'Phase 1'
  LIMIT 1
);
SET @tag_work_id := (
  SELECT id
  FROM tags
  WHERE user_id = @user_id AND name = 'Work'
  LIMIT 1
);
SET @tag_personal_id := (
  SELECT id
  FROM tags
  WHERE user_id = @user_id AND name = 'Personal'
  LIMIT 1
);
SET @tag_planning_id := (
  SELECT id
  FROM tags
  WHERE user_id = @user_id AND name = 'Planning'
  LIMIT 1
);

INSERT INTO tasks (
  user_id,
  project_id,
  title,
  description,
  status,
  priority,
  due_at,
  reminder_at,
  is_starred,
  completed_at,
  created_at,
  updated_at
)
VALUES
  (
    @user_id,
    @project_work_id,
    'Redesign workspace dashboard',
    'Ensure the dashboard supports a calm visual hierarchy while keeping the to-do flow and note shortcuts visible.',
    'in_progress',
    'high',
    DATE_ADD(CURDATE(), INTERVAL 17 HOUR),
    DATE_ADD(CURDATE(), INTERVAL 12 HOUR),
    1,
    NULL,
    DATE_SUB(NOW(), INTERVAL 5 DAY),
    DATE_SUB(NOW(), INTERVAL 2 HOUR)
  ),
  (
    @user_id,
    @project_launch_id,
    'Client review: Q4 Strategy',
    'Prepare the final talking points for the strategy review and sync dependencies with the product team.',
    'in_progress',
    'medium',
    DATE_ADD(CURDATE(), INTERVAL 1 DAY),
    DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 DAY), INTERVAL 10 HOUR),
    0,
    NULL,
    DATE_SUB(NOW(), INTERVAL 4 DAY),
    DATE_SUB(NOW(), INTERVAL 5 HOUR)
  ),
  (
    @user_id,
    @project_work_id,
    'Update documentation for API',
    'Write implementation notes for task reminders and note preview endpoints.',
    'todo',
    'medium',
    DATE_ADD(CURDATE(), INTERVAL 2 DAY),
    DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 2 DAY), INTERVAL 9 HOUR),
    0,
    NULL,
    DATE_SUB(NOW(), INTERVAL 3 DAY),
    DATE_SUB(NOW(), INTERVAL 1 DAY)
  ),
  (
    @user_id,
    @project_work_id,
    'Weekly sync with mobile team',
    'Review blockers and confirm shared task status vocabulary across platforms.',
    'todo',
    'low',
    DATE_ADD(CURDATE(), INTERVAL 3 DAY),
    DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 3 DAY), INTERVAL 8 HOUR),
    0,
    NULL,
    DATE_SUB(NOW(), INTERVAL 2 DAY),
    DATE_SUB(NOW(), INTERVAL 20 HOUR)
  ),
  (
    @user_id,
    @project_personal_id,
    'Prepare monthly invoice',
    'Invoice freelance design support work for last month.',
    'completed',
    'medium',
    DATE_SUB(CURDATE(), INTERVAL 3 DAY),
    DATE_SUB(CURDATE(), INTERVAL 3 DAY),
    0,
    DATE_SUB(NOW(), INTERVAL 2 DAY),
    DATE_SUB(NOW(), INTERVAL 10 DAY),
    DATE_SUB(NOW(), INTERVAL 2 DAY)
  );

SET @task_dashboard_id := (
  SELECT id
  FROM tasks
  WHERE user_id = @user_id AND title = 'Redesign workspace dashboard'
  LIMIT 1
);
SET @task_strategy_id := (
  SELECT id
  FROM tasks
  WHERE user_id = @user_id AND title = 'Client review: Q4 Strategy'
  LIMIT 1
);
SET @task_api_docs_id := (
  SELECT id
  FROM tasks
  WHERE user_id = @user_id AND title = 'Update documentation for API'
  LIMIT 1
);
SET @task_mobile_sync_id := (
  SELECT id
  FROM tasks
  WHERE user_id = @user_id AND title = 'Weekly sync with mobile team'
  LIMIT 1
);
SET @task_invoice_id := (
  SELECT id
  FROM tasks
  WHERE user_id = @user_id AND title = 'Prepare monthly invoice'
  LIMIT 1
);

INSERT INTO task_subtasks (task_id, title, is_completed, sort_order)
VALUES
  (@task_dashboard_id, 'Audit current navigation structure', 0, 1),
  (@task_dashboard_id, 'Select primary typography scale', 1, 2),
  (@task_dashboard_id, 'Create glassmorphic modal components', 0, 3),
  (@task_strategy_id, 'Finalize review agenda', 1, 1),
  (@task_strategy_id, 'Collect KPI screenshots', 0, 2),
  (@task_api_docs_id, 'Document POST /api/tasks', 0, 1);

INSERT INTO task_tags (task_id, tag_id)
VALUES
  (@task_dashboard_id, @tag_work_id),
  (@task_dashboard_id, @tag_productivity_id),
  (@task_strategy_id, @tag_planning_id),
  (@task_api_docs_id, @tag_phase1_id),
  (@task_mobile_sync_id, @tag_work_id);

INSERT INTO notes (
  user_id,
  project_id,
  title,
  body,
  category,
  is_pinned,
  created_at,
  updated_at
)
VALUES
  (
    @user_id,
    @project_launch_id,
    'Q4 Strategic Overview',
    'The primary focus for the upcoming quarter should revolve around scaling the workspace interface for enterprise clients. We need to preserve the calm visual rhythm while supporting heavier task density and better reminder visibility.',
    'Work',
    1,
    DATE_SUB(NOW(), INTERVAL 6 DAY),
    DATE_SUB(NOW(), INTERVAL 2 HOUR)
  ),
  (
    @user_id,
    @project_personal_id,
    'Morning Meditation Routine',
    '1. Deep breathing for 5 minutes. 2. Visualization of the day''s priorities. 3. Gratitude journaling. End by checking the top 3 tasks only.',
    'Personal',
    0,
    DATE_SUB(NOW(), INTERVAL 8 DAY),
    DATE_SUB(NOW(), INTERVAL 1 DAY)
  ),
  (
    @user_id,
    @project_personal_id,
    'Sustainable Garden Plan',
    'Consider hydroponics for the rooftop deck. Need to research which herbs survive indirect morning light and whether reminders should track watering cycles.',
    'Ideas',
    0,
    DATE_SUB(NOW(), INTERVAL 10 DAY),
    DATE_SUB(NOW(), INTERVAL 3 DAY)
  ),
  (
    @user_id,
    @project_work_id,
    'UI Audit Feedback',
    'User testing suggests the navigation labels were too small on mobile. Increase tap targets and make the task due state more visible without adding visual noise.',
    'Work',
    0,
    DATE_SUB(NOW(), INTERVAL 14 DAY),
    DATE_SUB(NOW(), INTERVAL 7 DAY)
  );

SET @note_strategy_id := (
  SELECT id
  FROM notes
  WHERE user_id = @user_id AND title = 'Q4 Strategic Overview'
  LIMIT 1
);
SET @note_meditation_id := (
  SELECT id
  FROM notes
  WHERE user_id = @user_id AND title = 'Morning Meditation Routine'
  LIMIT 1
);
SET @note_garden_id := (
  SELECT id
  FROM notes
  WHERE user_id = @user_id AND title = 'Sustainable Garden Plan'
  LIMIT 1
);
SET @note_ui_audit_id := (
  SELECT id
  FROM notes
  WHERE user_id = @user_id AND title = 'UI Audit Feedback'
  LIMIT 1
);

INSERT INTO note_tags (note_id, tag_id)
VALUES
  (@note_strategy_id, @tag_work_id),
  (@note_strategy_id, @tag_planning_id),
  (@note_meditation_id, @tag_personal_id),
  (@note_garden_id, @tag_productivity_id),
  (@note_ui_audit_id, @tag_work_id);

INSERT INTO activity_logs (
  user_id,
  actor_user_id,
  entity_type,
  entity_id,
  action_type,
  message,
  created_at
)
VALUES
  (@user_id, @user_id, 'note', @note_strategy_id, 'updated', 'Updated note "Q4 Strategic Overview"', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  (@user_id, @user_id, 'task', @task_dashboard_id, 'updated', 'Updated task description for "Redesign workspace dashboard"', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  (@user_id, @user_id, 'task', @task_strategy_id, 'commented', 'Added review prep comment to "Client review: Q4 Strategy"', DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (@user_id, @user_id, 'task', @task_invoice_id, 'completed', 'Completed task "Prepare monthly invoice"', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (@user_id, @user_id, 'note', @note_ui_audit_id, 'created', 'Created note "UI Audit Feedback"', DATE_SUB(NOW(), INTERVAL 7 DAY));

COMMIT;

const { pool } = require("../config/database");
const { httpError } = require("../utils/http-error");

async function ensureProjectOwnership(userId, projectId) {
  if (!projectId) {
    return;
  }

  const [projects] = await pool.query(
    `
      SELECT id
      FROM projects
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    [projectId, userId]
  );

  if (!projects[0]) {
    throw httpError(400, "Selected project is invalid", {
      code: "INVALID_PROJECT"
    });
  }
}

async function ensureTagOwnership(userId, tagIds) {
  if (!tagIds.length) {
    return;
  }

  const [tags] = await pool.query(
    `
      SELECT id
      FROM tags
      WHERE user_id = ? AND id IN (?)
    `,
    [userId, tagIds]
  );

  if (tags.length !== tagIds.length) {
    throw httpError(400, "One or more selected tags are invalid", {
      code: "INVALID_TAGS"
    });
  }
}

function mapTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.due_at,
    reminderAt: task.reminder_at,
    isStarred: Boolean(task.is_starred),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    project: {
      id: task.project_id,
      name: task.project_name,
      colorHex: task.project_color_hex
    },
    subtaskCount: Number(task.subtask_count || 0),
    completedSubtaskCount: Number(task.completed_subtask_count || 0)
  };
}

function normalizeActivityMetadata(rawValue) {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === "object") {
    return rawValue;
  }

  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}

async function list(req, res) {
  const userId = req.user.user_id;
  const search = String(req.query.search || "").trim();
  const searchLike = `%${search}%`;

  const [rows] = await pool.query(
    `
      SELECT
        t.*,
        p.name AS project_name,
        p.color_hex AS project_color_hex,
        COUNT(st.id) AS subtask_count,
        SUM(CASE WHEN st.is_completed = 1 THEN 1 ELSE 0 END) AS completed_subtask_count
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN task_subtasks st ON st.task_id = t.id
      WHERE t.user_id = ?
        -- Match the keyword against the task name first, then fall back to the description text.
        AND (? = '' OR t.title LIKE ? OR COALESCE(t.description, '') LIKE ?)
      GROUP BY t.id, p.id
      ORDER BY
        FIELD(t.status, 'in_progress', 'todo', 'completed'),
        CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
        t.due_at ASC,
        t.updated_at DESC
    `,
    [userId, search, searchLike, searchLike]
  );

  res.json({
    tasks: rows.map(mapTask)
  });
}

async function detail(req, res) {
  const userId = req.user.user_id;
  const taskId = Number(req.params.taskId);

  const [tasks] = await pool.query(
    `
      SELECT
        t.*,
        p.name AS project_name,
        p.color_hex AS project_color_hex
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ? AND t.user_id = ?
      LIMIT 1
    `,
    [taskId, userId]
  );

  const task = tasks[0];

  if (!task) {
    throw httpError(404, "Task not found");
  }

  const [[subtasks], [activity], [tags]] = await Promise.all([
    pool.query(
      `
        SELECT id, title, is_completed, sort_order
        FROM task_subtasks
        WHERE task_id = ?
        ORDER BY sort_order ASC, id ASC
      `,
      [taskId]
    ),
    pool.query(
      `
        SELECT id, action_type, message, metadata_json, created_at
        FROM activity_logs
        WHERE user_id = ? AND entity_type = 'task' AND entity_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `,
      [userId, taskId]
    ),
    pool.query(
      `
        SELECT tg.id, tg.name, tg.color_type
        FROM task_tags tt
        INNER JOIN tags tg ON tg.id = tt.tag_id
        WHERE tt.task_id = ?
      `,
      [taskId]
    )
  ]);

  res.json({
    task: {
      ...mapTask(task),
      subtasks,
      activity: activity.map((item) => ({
        ...item,
        metadata: normalizeActivityMetadata(item.metadata_json)
      })),
      tags
    }
  });
}

async function create(req, res) {
  const userId = req.user.user_id;
  const {
    title,
    description,
    projectId,
    priority,
    dueAt,
    reminderAt,
    tagIds,
    subtasks
  } = req.body;

  if (!title || !String(title).trim()) {
    throw httpError(400, "Task title is required");
  }

  // Default to medium when the client omits priority or sends an unexpected value.
  const normalizedPriority = ["low", "medium", "high"].includes(priority) ? priority : "medium";
  // Trim out empty subtask rows so the API only persists intentional checklist items.
  const normalizedSubtasks = Array.isArray(subtasks)
    ? subtasks.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)
    : [];
  const normalizedTagIds = Array.isArray(tagIds) ? tagIds.map(Number).filter(Boolean) : [];
  const normalizedProjectId = projectId ? Number(projectId) : null;

  await ensureProjectOwnership(userId, normalizedProjectId);
  await ensureTagOwnership(userId, normalizedTagIds);

  const connection = await pool.getConnection();
  let taskId = null;

  try {
    // Create the task, its checklist items, tags, and activity log as one atomic API operation.
    await connection.beginTransaction();

    const [result] = await connection.query(
      `
        INSERT INTO tasks (
          user_id,
          project_id,
          title,
          description,
          priority,
          due_at,
          reminder_at,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'todo')
      `,
      [
        userId,
        normalizedProjectId,
        String(title).trim(),
        description ? String(description).trim() : null,
        normalizedPriority,
        dueAt || null,
        reminderAt || null
      ]
    );

    taskId = result.insertId;

    for (let index = 0; index < normalizedSubtasks.length; index += 1) {
      await connection.query(
        `
          INSERT INTO task_subtasks (task_id, title, sort_order)
          VALUES (?, ?, ?)
        `,
        [taskId, normalizedSubtasks[index], index + 1]
      );
    }

    for (const tagId of normalizedTagIds) {
      await connection.query(
        `
          INSERT INTO task_tags (task_id, tag_id)
          VALUES (?, ?)
        `,
        [taskId, tagId]
      );
    }

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'task', ?, 'created', ?)
      `,
      [userId, userId, taskId, `Created task "${String(title).trim()}"`]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.status(201).json({ taskId });
}

async function update(req, res) {
  const userId = req.user.user_id;
  const taskId = Number(req.params.taskId);
  const {
    title,
    description,
    projectId,
    priority,
    dueAt,
    reminderAt,
    tagIds,
    subtasks
  } = req.body;

  const normalizedPriority = ["low", "medium", "high"].includes(priority) ? priority : "medium";
  const normalizedSubtasks = Array.isArray(subtasks)
    ? subtasks.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)
    : [];
  const normalizedTagIds = Array.isArray(tagIds) ? tagIds.map(Number).filter(Boolean) : [];
  const normalizedProjectId = projectId ? Number(projectId) : null;

  await ensureProjectOwnership(userId, normalizedProjectId);
  await ensureTagOwnership(userId, normalizedTagIds);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [tasks] = await connection.query(
      `
        SELECT id, title
        FROM tasks
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [taskId, userId]
    );

    const task = tasks[0];

    if (!task) {
      throw httpError(404, "Task not found", {
        code: "TASK_NOT_FOUND"
      });
    }

    await connection.query(
      `
        UPDATE tasks
        SET
          project_id = ?,
          title = ?,
          description = ?,
          priority = ?,
          due_at = ?,
          reminder_at = ?
        WHERE id = ? AND user_id = ?
      `,
      [
        normalizedProjectId,
        String(title).trim(),
        description ? String(description).trim() : null,
        normalizedPriority,
        dueAt || null,
        reminderAt || null,
        taskId,
        userId
      ]
    );

    await connection.query("DELETE FROM task_subtasks WHERE task_id = ?", [taskId]);

    for (let index = 0; index < normalizedSubtasks.length; index += 1) {
      await connection.query(
        `
          INSERT INTO task_subtasks (task_id, title, sort_order)
          VALUES (?, ?, ?)
        `,
        [taskId, normalizedSubtasks[index], index + 1]
      );
    }

    await connection.query("DELETE FROM task_tags WHERE task_id = ?", [taskId]);

    for (const tagId of normalizedTagIds) {
      await connection.query(
        `
          INSERT INTO task_tags (task_id, tag_id)
          VALUES (?, ?)
        `,
        [taskId, tagId]
      );
    }

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'task', ?, 'updated', ?)
      `,
      [userId, userId, taskId, `Updated task "${String(title).trim()}"`]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.status(204).send();
}

async function updateStatus(req, res) {
  const userId = req.user.user_id;
  const taskId = Number(req.params.taskId);
  const { status } = req.body;

  if (!["todo", "in_progress", "completed"].includes(status)) {
    throw httpError(400, "Invalid task status");
  }

  const [result] = await pool.query(
    `
      UPDATE tasks
      SET
        status = ?,
        completed_at = CASE WHEN ? = 'completed' THEN NOW() ELSE NULL END
      WHERE id = ? AND user_id = ?
    `,
    [status, status, taskId, userId]
  );

  if (!result.affectedRows) {
    throw httpError(404, "Task not found");
  }

  await pool.query(
    `
      INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
      VALUES (?, ?, 'task', ?, 'status_changed', ?)
    `,
    [userId, userId, taskId, `Moved task to ${status}`]
  );

  res.status(204).send();
}

async function toggleSubtask(req, res) {
  const userId = req.user.user_id;
  const subtaskId = Number(req.params.subtaskId);

  const [subtasks] = await pool.query(
    `
      SELECT st.id, st.is_completed
      FROM task_subtasks st
      INNER JOIN tasks t ON t.id = st.task_id
      WHERE st.id = ? AND t.user_id = ?
      LIMIT 1
    `,
    [subtaskId, userId]
  );

  const subtask = subtasks[0];

  if (!subtask) {
    throw httpError(404, "Subtask not found");
  }

  await pool.query(
    `
      UPDATE task_subtasks
      SET is_completed = ?
      WHERE id = ?
    `,
    // Flip the completion flag so the same endpoint can mark done and undo done.
    [subtask.is_completed ? 0 : 1, subtaskId]
  );

  res.status(204).send();
}

async function setStarred(req, res) {
  const userId = req.user.user_id;
  const taskId = Number(req.params.taskId);
  const { isStarred } = req.body;

  const [result] = await pool.query(
    `
      UPDATE tasks
      SET is_starred = ?
      WHERE id = ? AND user_id = ?
    `,
    [isStarred ? 1 : 0, taskId, userId]
  );

  if (!result.affectedRows) {
    throw httpError(404, "Task not found", {
      code: "TASK_NOT_FOUND"
    });
  }

  await pool.query(
    `
      INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
      VALUES (?, ?, 'task', ?, 'star_updated', ?)
    `,
    [userId, userId, taskId, isStarred ? "Starred task" : "Unstarred task"]
  );

  res.status(204).send();
}

async function addActivity(req, res) {
  const userId = req.user.user_id;
  const taskId = Number(req.params.taskId);
  const {
    message,
    emoji,
    imageUrl,
    linkUrl,
    fileLabel
  } = req.body;

  const [tasks] = await pool.query(
    `
      SELECT id, title
      FROM tasks
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    [taskId, userId]
  );

  const task = tasks[0];

  if (!task) {
    throw httpError(404, "Task not found", {
      code: "TASK_NOT_FOUND"
    });
  }

  const metadata = {
    emoji: emoji || null,
    imageUrl: imageUrl || null,
    linkUrl: linkUrl || null,
    fileLabel: fileLabel || null
  };
  const hasAttachment = Boolean(metadata.imageUrl || metadata.linkUrl || metadata.fileLabel);
  const normalizedMessage = String(message || "").trim();
  const finalMessage = normalizedMessage
    || (hasAttachment ? `Added resources to "${task.title}"` : `${emoji || ""} Updated "${task.title}"`.trim());

  const [result] = await pool.query(
    `
      INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message, metadata_json)
      VALUES (?, ?, 'task', ?, 'commented', ?, ?)
    `,
    [
      userId,
      userId,
      taskId,
      finalMessage,
      JSON.stringify(metadata)
    ]
  );

  const [rows] = await pool.query(
    `
      SELECT id, action_type, message, metadata_json, created_at
      FROM activity_logs
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    [result.insertId, userId]
  );

  res.status(201).json({
    activity: {
      ...rows[0],
      metadata: normalizeActivityMetadata(rows[0]?.metadata_json)
    }
  });
}

async function remove(req, res) {
  const userId = req.user.user_id;
  const taskId = Number(req.params.taskId);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [tasks] = await connection.query(
      `
        SELECT id, title
        FROM tasks
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [taskId, userId]
    );

    const task = tasks[0];

    if (!task) {
      throw httpError(404, "Task not found", {
        code: "TASK_NOT_FOUND"
      });
    }

    await connection.query("DELETE FROM tasks WHERE id = ? AND user_id = ?", [taskId, userId]);

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'task', ?, 'deleted', ?)
      `,
      [userId, userId, taskId, `Deleted task "${task.title}"`]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.status(204).send();
}

module.exports = {
  addActivity,
  create,
  detail,
  list,
  remove,
  setStarred,
  toggleSubtask,
  update,
  updateStatus
};

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

async function list(req, res) {
  const userId = req.user.user_id;
  const search = String(req.query.search || "").trim();
  const searchLike = `%${search}%`;

  const [rows] = await pool.query(
    `
      SELECT
        n.id,
        n.project_id,
        n.title,
        n.body,
        n.category,
        n.is_pinned,
        n.updated_at,
        p.name AS project_name
      FROM notes n
      LEFT JOIN projects p ON p.id = n.project_id
      WHERE n.user_id = ?
        AND (? = '' OR n.title LIKE ? OR n.body LIKE ?)
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `,
    [userId, search, searchLike, searchLike]
  );

  res.json({
    notes: rows.map((note) => ({
      id: note.id,
      projectId: note.project_id || null,
      title: note.title,
      body: note.body,
      category: note.category,
      isPinned: Boolean(note.is_pinned),
      updatedAt: note.updated_at,
      projectName: note.project_name,
      excerpt: note.body.length > 180 ? `${note.body.slice(0, 180)}...` : note.body
    }))
  });
}

async function detail(req, res) {
  const userId = req.user.user_id;
  const noteId = Number(req.params.noteId);

  const [rows] = await pool.query(
    `
      SELECT
        n.id,
        n.project_id,
        n.title,
        n.body,
        n.category,
        n.is_pinned,
        n.created_at,
        n.updated_at,
        p.name AS project_name
      FROM notes n
      LEFT JOIN projects p ON p.id = n.project_id
      WHERE n.id = ? AND n.user_id = ?
      LIMIT 1
    `,
    [noteId, userId]
  );

  const note = rows[0];

  if (!note) {
    throw httpError(404, "Note not found");
  }

  const [tags] = await pool.query(
    `
      SELECT tg.id, tg.name, tg.color_type
      FROM note_tags nt
      INNER JOIN tags tg ON tg.id = nt.tag_id
      WHERE nt.note_id = ?
    `,
    [noteId]
  );

  res.json({
    note: {
      id: note.id,
      title: note.title,
      body: note.body,
      category: note.category,
      isPinned: Boolean(note.is_pinned),
      projectId: note.project_id || null,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      projectName: note.project_name,
      tags
    }
  });
}

async function create(req, res) {
  const userId = req.user.user_id;
  const { title, body, category, projectId, tagIds } = req.body;

  if (!title || !String(title).trim()) {
    throw httpError(400, "Note title is required");
  }

  const normalizedTagIds = Array.isArray(tagIds) ? tagIds.map(Number).filter(Boolean) : [];
  const normalizedProjectId = projectId ? Number(projectId) : null;

  await ensureProjectOwnership(userId, normalizedProjectId);
  await ensureTagOwnership(userId, normalizedTagIds);

  const connection = await pool.getConnection();
  let noteId = null;

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `
        INSERT INTO notes (user_id, project_id, title, body, category, is_pinned)
        VALUES (?, ?, ?, ?, ?, 0)
      `,
      [
        userId,
        normalizedProjectId,
        String(title).trim(),
        body ? String(body).trim() : "",
        category ? String(category).trim() : "General"
      ]
    );

    noteId = result.insertId;

    for (const tagId of normalizedTagIds) {
      await connection.query(
        `
          INSERT INTO note_tags (note_id, tag_id)
          VALUES (?, ?)
        `,
        [noteId, tagId]
      );
    }

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'note', ?, 'created', ?)
      `,
      [userId, userId, noteId, `Created note "${String(title).trim()}"`]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.status(201).json({ noteId });
}

async function update(req, res) {
  const userId = req.user.user_id;
  const noteId = Number(req.params.noteId);
  const { title, body, category, projectId, tagIds } = req.body;
  const normalizedTagIds = Array.isArray(tagIds) ? tagIds.map(Number).filter(Boolean) : [];
  const normalizedProjectId = projectId ? Number(projectId) : null;

  await ensureProjectOwnership(userId, normalizedProjectId);
  await ensureTagOwnership(userId, normalizedTagIds);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [notes] = await connection.query(
      `
        SELECT id, title
        FROM notes
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [noteId, userId]
    );

    const note = notes[0];

    if (!note) {
      throw httpError(404, "Note not found", {
        code: "NOTE_NOT_FOUND"
      });
    }

    await connection.query(
      `
        UPDATE notes
        SET
          project_id = ?,
          title = ?,
          body = ?,
          category = ?
        WHERE id = ? AND user_id = ?
      `,
      [
        normalizedProjectId,
        String(title).trim(),
        body ? String(body).trim() : "",
        category ? String(category).trim() : "General",
        noteId,
        userId
      ]
    );

    await connection.query("DELETE FROM note_tags WHERE note_id = ?", [noteId]);

    for (const tagId of normalizedTagIds) {
      await connection.query(
        `
          INSERT INTO note_tags (note_id, tag_id)
          VALUES (?, ?)
        `,
        [noteId, tagId]
      );
    }

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'note', ?, 'updated', ?)
      `,
      [userId, userId, noteId, `Updated note "${String(title).trim()}"`]
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

async function setPinned(req, res) {
  const userId = req.user.user_id;
  const noteId = Number(req.params.noteId);
  const { isPinned } = req.body;

  const [result] = await pool.query(
    `
      UPDATE notes
      SET is_pinned = ?
      WHERE id = ? AND user_id = ?
    `,
    [isPinned ? 1 : 0, noteId, userId]
  );

  if (!result.affectedRows) {
    throw httpError(404, "Note not found", {
      code: "NOTE_NOT_FOUND"
    });
  }

  await pool.query(
    `
      INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
      VALUES (?, ?, 'note', ?, 'pin_updated', ?)
    `,
    [userId, userId, noteId, isPinned ? "Pinned note" : "Unpinned note"]
  );

  res.status(204).send();
}

async function remove(req, res) {
  const userId = req.user.user_id;
  const noteId = Number(req.params.noteId);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [notes] = await connection.query(
      `
        SELECT id, title
        FROM notes
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [noteId, userId]
    );

    const note = notes[0];

    if (!note) {
      throw httpError(404, "Note not found", {
        code: "NOTE_NOT_FOUND"
      });
    }

    await connection.query("DELETE FROM notes WHERE id = ? AND user_id = ?", [noteId, userId]);

    await connection.query(
      `
        INSERT INTO activity_logs (user_id, actor_user_id, entity_type, entity_id, action_type, message)
        VALUES (?, ?, 'note', ?, 'deleted', ?)
      `,
      [userId, userId, noteId, `Deleted note "${note.title}"`]
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
  create,
  detail,
  list,
  remove,
  setPinned,
  update
};

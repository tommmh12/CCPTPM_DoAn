const { pool } = require("../config/database");

async function options(req, res) {
  const userId = req.user.user_id;

  const [[projects], [tags]] = await Promise.all([
    pool.query(
      `
        SELECT id, name, color_hex
        FROM projects
        WHERE user_id = ?
        ORDER BY is_default DESC, name ASC
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT id, name, color_type
        FROM tags
        WHERE user_id = ?
        ORDER BY name ASC
      `,
      [userId]
    )
  ]);

  res.json({ projects, tags });
}

module.exports = { options };


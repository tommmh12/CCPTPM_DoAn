const { pool } = require("../config/database");

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, diff));
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatSqlDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildScheduleRange(view, anchorDate) {
  if (view === "day") {
    const viewStart = startOfDay(anchorDate);
    const viewEnd = addDays(viewStart, 1);

    return {
      view,
      anchorDate: formatDate(viewStart),
      viewStart,
      viewEnd,
      fetchStart: viewStart,
      fetchEnd: viewEnd,
      label: anchorDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric"
      }),
      subtitle: "A focused timeline of what is due today."
    };
  }

  if (view === "week") {
    const viewStart = startOfWeek(anchorDate);
    const viewEnd = addDays(viewStart, 7);

    return {
      view,
      anchorDate: formatDate(viewStart),
      viewStart,
      viewEnd,
      fetchStart: viewStart,
      fetchEnd: viewEnd,
      label: `${viewStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${addDays(viewEnd, -1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      subtitle: "Your weekly cadence, grouped by day."
    };
  }

  const monthStart = startOfMonth(anchorDate);
  const monthEnd = addMonths(monthStart, 1);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(gridStart, 42);

  return {
    view: "month",
    anchorDate: formatDate(monthStart),
    viewStart: monthStart,
    viewEnd: monthEnd,
    fetchStart: gridStart,
    fetchEnd: gridEnd,
    label: monthStart.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    }),
    subtitle: "Scan the month and open any day to inspect scheduled tasks."
  };
}

function mapScheduleTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.due_at,
    isStarred: Boolean(task.is_starred),
    project: {
      id: task.project_id,
      name: task.project_name,
      colorHex: task.project_color_hex
    }
  };
}

async function list(req, res) {
  const userId = req.user.user_id;
  const view = req.query.view || "month";
  const anchorDate = req.query.date ? new Date(`${req.query.date}T00:00:00`) : new Date();
  const selectedDate = req.query.day || formatDate(anchorDate);
  const range = buildScheduleRange(view, anchorDate);

  const [[rows], [unscheduledRows]] = await Promise.all([
    pool.query(
      `
        SELECT
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_at,
          t.is_starred,
          t.project_id,
          p.name AS project_name,
          p.color_hex AS project_color_hex
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.user_id = ?
          AND t.due_at IS NOT NULL
          AND t.due_at >= ?
          AND t.due_at < ?
        ORDER BY
          t.due_at ASC,
          FIELD(t.priority, 'high', 'medium', 'low'),
          t.updated_at DESC
      `,
      [
        userId,
        formatSqlDateTime(range.fetchStart),
        formatSqlDateTime(range.fetchEnd)
      ]
    ),
    pool.query(
      `
        SELECT COUNT(*) AS unscheduled_count
        FROM tasks
        WHERE user_id = ?
          AND due_at IS NULL
          AND status <> 'completed'
      `,
      [userId]
    )
  ]);

  const items = rows.map(mapScheduleTask);
  const scheduledInView = items.filter((item) => {
    const dueAt = new Date(item.dueAt);
    return dueAt >= range.viewStart && dueAt < range.viewEnd;
  });
  const overdueCount = scheduledInView.filter((item) => item.status !== "completed" && new Date(item.dueAt) < new Date()).length;

  res.json({
    view: range.view,
    anchorDate: range.anchorDate,
    selectedDate,
    today: formatDate(new Date()),
    range: {
      label: range.label,
      subtitle: range.subtitle,
      viewStart: formatDate(range.viewStart),
      viewEnd: formatDate(addDays(range.viewEnd, -1)),
      fetchStart: formatDate(range.fetchStart),
      fetchEnd: formatDate(addDays(range.fetchEnd, -1))
    },
    summary: {
      scheduledCount: scheduledInView.length,
      completedCount: scheduledInView.filter((item) => item.status === "completed").length,
      openCount: scheduledInView.filter((item) => item.status !== "completed").length,
      overdueCount,
      unscheduledCount: Number((unscheduledRows[0] || {}).unscheduled_count || 0)
    },
    items
  });
}

module.exports = { list };

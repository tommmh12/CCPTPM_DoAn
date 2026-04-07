const { pool } = require("../config/database");

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
//
function startOfWeek(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, diff));
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

function formatSqlDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function percentageDelta(current, previous) {
  if (!previous && !current) {
    return "No change";
  }

  if (!previous) {
    return `+${current * 100}% vs previous`;
  }

  const delta = Math.round(((current - previous) / previous) * 100);

  if (delta === 0) {
    return "No change vs previous";
  }

  return `${delta > 0 ? "+" : ""}${delta}% vs previous`;
}

async function buildPulsePeriod(userId, config) {
  const { key, label, start, end, previousStart, previousEnd, buckets } =
    config;

  const [[currentRows], [previousRows]] = await Promise.all([
    pool.query(
      `
        SELECT
          SUM(CASE WHEN completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ? THEN 1 ELSE 0 END) AS completed_count,
          SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS created_count,
          SUM(CASE WHEN created_at < ? AND (completed_at IS NULL OR completed_at >= ?) THEN 1 ELSE 0 END) AS carry_over_count
        FROM tasks
        WHERE user_id = ?
      `,
      [
        formatSqlDateTime(start),
        formatSqlDateTime(end),
        formatSqlDateTime(start),
        formatSqlDateTime(end),
        formatSqlDateTime(start),
        formatSqlDateTime(start),
        userId,
      ],
    ),
    pool.query(
      `
        SELECT
          SUM(CASE WHEN completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ? THEN 1 ELSE 0 END) AS completed_count,
          SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS created_count,
          SUM(CASE WHEN created_at < ? AND (completed_at IS NULL OR completed_at >= ?) THEN 1 ELSE 0 END) AS carry_over_count
        FROM tasks
        WHERE user_id = ?
      `,
      [
        formatSqlDateTime(previousStart),
        formatSqlDateTime(previousEnd),
        formatSqlDateTime(previousStart),
        formatSqlDateTime(previousEnd),
        formatSqlDateTime(previousStart),
        formatSqlDateTime(previousStart),
        userId,
      ],
    ),
  ]);
  const currentRow = currentRows[0] || {};
  const previousRow = previousRows[0] || {};

  const completedCount = Number(currentRow.completed_count || 0);
  const createdCount = Number(currentRow.created_count || 0);
  const carryOverCount = Number(currentRow.carry_over_count || 0);
  const previousCompletedCount = Number(previousRow.completed_count || 0);
  const previousCreatedCount = Number(previousRow.created_count || 0);
  const previousCarryOverCount = Number(previousRow.carry_over_count || 0);
  const completionRate = createdCount
    ? Math.round((completedCount / createdCount) * 100)
    : 0;
  const focusScore =
    createdCount + carryOverCount
      ? Math.round((completedCount / (createdCount + carryOverCount)) * 100)
      : 0;
  const series = await Promise.all(
    buckets.map(async (bucket) => {
      const [rows] = await pool.query(
        `
          SELECT
            SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS created_count,
            SUM(CASE WHEN completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ? THEN 1 ELSE 0 END) AS completed_count,
            SUM(CASE WHEN created_at < ? AND (completed_at IS NULL OR completed_at >= ?) THEN 1 ELSE 0 END) AS carry_over_count
          FROM tasks
          WHERE user_id = ?
        `,
        [
          formatSqlDateTime(bucket.start),
          formatSqlDateTime(bucket.end),
          formatSqlDateTime(bucket.start),
          formatSqlDateTime(bucket.end),
          formatSqlDateTime(bucket.start),
          formatSqlDateTime(bucket.start),
          userId,
        ],
      );
      const row = rows[0] || {};

      const bucketCreated = Number(row.created_count || 0);
      const bucketCompleted = Number(row.completed_count || 0);
      const bucketCarryOver = Number(row.carry_over_count || 0);
      const bucketFocusScore =
        bucketCreated + bucketCarryOver
          ? Math.round(
              (bucketCompleted / (bucketCreated + bucketCarryOver)) * 100,
            )
          : 0;

      return {
        label: bucket.label,
        created: bucketCreated,
        completed: bucketCompleted,
        carryOver: bucketCarryOver,
        focusScore: bucketFocusScore,
      };
    }),
  );

  const previousFocusScore =
    previousCreatedCount + previousCarryOverCount
      ? Math.round(
          (previousCompletedCount /
            (previousCreatedCount + previousCarryOverCount)) *
            100,
        )
      : 0;

  return {
    key,
    label,
    metrics: {
      completed: {
        label: "Tasks Closed",
        value: completedCount,
        unit: "tasks",
        caption: `${createdCount} created and ${carryOverCount} carried into this ${key}`,
        deltaLabel: percentageDelta(completedCount, previousCompletedCount),
        seriesKey: "completed",
      },
      created: {
        label: "Tasks Created",
        value: createdCount,
        unit: "tasks",
        caption: `${completedCount} completed and ${carryOverCount} carried into this ${key}`,
        deltaLabel: percentageDelta(createdCount, previousCreatedCount),
        seriesKey: "created",
      },
      focus: {
        label: "Focus Score",
        value: focusScore,
        unit: "%",
        caption: "Completion efficiency based on new work plus carry-over",
        deltaLabel: percentageDelta(focusScore, previousFocusScore),
        seriesKey: "focusScore",
      },
    },
    summary: {
      created: createdCount,
      completed: completedCount,
      carryOver: carryOverCount,
      completionRate,
      focusScore,
    },
    secondary: {
      label: "Completion Rate",
      value: `${completionRate}%`,
      caption: createdCount
        ? `${completedCount} of ${createdCount} newly created tasks finished`
        : `No new tasks created in this ${key}`,
    },
    series,
  };
}

async function buildPulse(userId) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const nextDayStart = addDays(dayStart, 1);
  const weekStart = startOfWeek(now);
  const nextWeekStart = addDays(weekStart, 7);
  const monthStart = startOfMonth(now);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const yearStart = startOfYear(now);
  const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);

  return {
    defaultPeriod: "week",
    defaultMetric: "completed",
    periods: {
      day: await buildPulsePeriod(userId, {
        key: "day",
        label: "Today",
        start: dayStart,
        end: nextDayStart,
        previousStart: addDays(dayStart, -1),
        previousEnd: dayStart,
        buckets: Array.from({ length: 6 }, (_, index) => {
          const bucketStart = new Date(dayStart);
          bucketStart.setHours(index * 4, 0, 0, 0);
          const bucketEnd = new Date(dayStart);
          bucketEnd.setHours((index + 1) * 4, 0, 0, 0);
          return {
            label: `${String(index * 4).padStart(2, "0")}:00`,
            start: bucketStart,
            end: bucketEnd,
          };
        }),
      }),
      week: await buildPulsePeriod(userId, {
        key: "week",
        label: "This Week",
        start: weekStart,
        end: nextWeekStart,
        previousStart: addDays(weekStart, -7),
        previousEnd: weekStart,
        buckets: Array.from({ length: 7 }, (_, index) => {
          const bucketStart = addDays(weekStart, index);
          const bucketEnd = addDays(weekStart, index + 1);
          return {
            label: bucketStart.toLocaleDateString("en-US", {
              weekday: "short",
            }),
            start: bucketStart,
            end: bucketEnd,
          };
        }),
      }),
      month: await buildPulsePeriod(userId, {
        key: "month",
        label: "This Month",
        start: monthStart,
        end: nextMonthStart,
        previousStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        previousEnd: monthStart,
        buckets: Array.from({ length: 4 }, (_, index) => {
          const bucketStart = addDays(monthStart, index * 7);
          const bucketEnd =
            index === 3 ? nextMonthStart : addDays(monthStart, (index + 1) * 7);
          return {
            label: `W${index + 1}`,
            start: bucketStart,
            end: bucketEnd,
          };
        }),
      }),
      year: await buildPulsePeriod(userId, {
        key: "year",
        label: "This Year",
        start: yearStart,
        end: nextYearStart,
        previousStart: new Date(now.getFullYear() - 1, 0, 1),
        previousEnd: yearStart,
        buckets: Array.from({ length: 12 }, (_, index) => {
          const bucketStart = new Date(now.getFullYear(), index, 1);
          const bucketEnd = new Date(now.getFullYear(), index + 1, 1);
          return {
            label: bucketStart.toLocaleDateString("en-US", { month: "short" }),
            start: bucketStart,
            end: bucketEnd,
          };
        }),
      }),
    },
  };
}

async function summary(req, res) {
  const userId = req.user.user_id;

  const [
    [overviewRows],
    [upcomingRows],
    [recentNotesRows],
    [activityRows],
    pulse,
  ] = await Promise.all([
    pool.query(
      `
        SELECT
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
          SUM(CASE WHEN status IN ('todo', 'in_progress') THEN 1 ELSE 0 END) AS open_tasks,
          SUM(CASE WHEN DATE(due_at) = CURDATE() THEN 1 ELSE 0 END) AS due_today
        FROM tasks
        WHERE user_id = ?
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT
          id,
          title,
          due_at,
          status
        FROM tasks
        WHERE user_id = ? AND status IN ('todo', 'in_progress') AND due_at IS NOT NULL
        ORDER BY due_at ASC
        LIMIT 5
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT
          id,
          title,
          category,
          updated_at
        FROM notes
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT
          id,
          entity_type,
          entity_id,
          action_type,
          message,
          created_at
        FROM activity_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 6
      `,
      [userId],
    ),
    buildPulse(userId),
  ]);
  const overviewRow = overviewRows[0] || {};

  res.json({
    overview: {
      completedTasks: Number(overviewRow.completed_tasks || 0),
      openTasks: Number(overviewRow.open_tasks || 0),
      dueToday: Number(overviewRow.due_today || 0),
    },
    upcoming: upcomingRows,
    recentNotes: recentNotesRows,
    activity: activityRows,
    pulse,
  });
}

module.exports = { summary };

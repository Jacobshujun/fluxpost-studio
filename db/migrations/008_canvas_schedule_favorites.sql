CREATE TABLE IF NOT EXISTS canvas_schedule_favorites (
    owner_user_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL REFERENCES canvas_schedules(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (owner_user_id, schedule_id)
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_schedule_favorites_schedule
    ON canvas_schedule_favorites(schedule_id);

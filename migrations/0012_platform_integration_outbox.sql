-- Platform integration foundation. Golf keeps its operational records; the
-- State of Stick platform consumes this retry-safe outbox for analytics,
-- consent, retention, metering, and governed downstream integrations.
CREATE TABLE IF NOT EXISTS golf_platform_event_outbox (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  organization_id TEXT,
  course_id TEXT REFERENCES golf_courses(id) ON DELETE SET NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'forwarded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  forwarded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS golf_platform_outbox_status_idx
  ON golf_platform_event_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS golf_platform_outbox_org_idx
  ON golf_platform_event_outbox(organization_id, created_at);

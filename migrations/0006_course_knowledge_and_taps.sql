-- Phase 4: approved course knowledge and physical tap-point operations.
-- Published content is the only course context eligible for public guidance.

CREATE TABLE IF NOT EXISTS golf_course_knowledge (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('faq', 'local_rule', 'condition', 'service_info', 'event_info')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  source_identifier TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  approved_by_person_id TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_course_knowledge_public_idx
  ON golf_course_knowledge(course_id, status, content_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS golf_course_knowledge_org_idx
  ON golf_course_knowledge(organization_id, status, updated_at DESC);

ALTER TABLE golf_sticklink_locations ADD COLUMN hardware_id TEXT;
ALTER TABLE golf_sticklink_locations ADD COLUMN status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'needs_attention', 'retired'));
ALTER TABLE golf_sticklink_locations ADD COLUMN installed_at TEXT;
ALTER TABLE golf_sticklink_locations ADD COLUMN last_seen_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS golf_sticklink_hardware_idx
  ON golf_sticklink_locations(hardware_id) WHERE hardware_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS golf_tap_events (
  id TEXT PRIMARY KEY,
  tap_point_id TEXT NOT NULL REFERENCES golf_sticklink_locations(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  person_id TEXT,
  round_id TEXT REFERENCES golf_rounds(id) ON DELETE SET NULL,
  context TEXT NOT NULL CHECK (context IN ('hole', 'clubhouse', 'turn_house', 'sponsor', 'course')),
  client_event_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_tap_client_event_idx
  ON golf_tap_events(client_event_id) WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_tap_course_idx
  ON golf_tap_events(course_id, created_at DESC);

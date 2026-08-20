-- Phase 2: passport, verification, leagues, discovery, and operator history.
-- This migration keeps State of Stick person and organization ids as foreign-system
-- identifiers; it does not create a parallel identity system.

PRAGMA foreign_keys = OFF;
CREATE TABLE golf_rounds_phase2 (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id),
  league_id TEXT REFERENCES golf_leagues(id),
  format TEXT NOT NULL CHECK (format IN ('stroke_play', 'stableford', 'match_play', 'skins')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'submitted', 'verified', 'rejected')),
  state_of_stick_person_id TEXT NOT NULL,
  state_of_stick_organization_id TEXT,
  trust_level TEXT NOT NULL DEFAULT 'self_reported' CHECK (trust_level IN ('self_reported', 'partner_attested', 'commissioner_approved', 'course_confirmed', 'officially_integrated')),
  client_round_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO golf_rounds_phase2 (id, course_id, league_id, format, status, state_of_stick_person_id, state_of_stick_organization_id, trust_level, client_round_id, created_at, updated_at)
  SELECT id, course_id, league_id, format,
    CASE status WHEN 'open' THEN 'draft' WHEN 'approved' THEN 'verified' ELSE status END,
    state_of_stick_person_id, state_of_stick_organization_id, trust_level, client_round_id, created_at, updated_at
  FROM golf_rounds;
DROP TABLE golf_rounds;
ALTER TABLE golf_rounds_phase2 RENAME TO golf_rounds;
CREATE INDEX golf_rounds_course_idx_v2 ON golf_rounds(course_id, created_at DESC);
CREATE INDEX golf_rounds_person_idx_v2 ON golf_rounds(state_of_stick_person_id, created_at DESC);
CREATE UNIQUE INDEX golf_rounds_client_round_idx_v2 ON golf_rounds(client_round_id) WHERE client_round_id IS NOT NULL;
PRAGMA foreign_keys = ON;

ALTER TABLE golf_courses ADD COLUMN latitude REAL;
ALTER TABLE golf_courses ADD COLUMN longitude REAL;
ALTER TABLE golf_courses ADD COLUMN state_code TEXT NOT NULL DEFAULT 'MI';
ALTER TABLE golf_courses ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'moderate' CHECK (difficulty IN ('easy', 'moderate', 'challenging'));
ALTER TABLE golf_courses ADD COLUMN organization_id TEXT;
UPDATE golf_courses SET organization_id = 'org-' || id WHERE organization_id IS NULL;

ALTER TABLE golf_leagues ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));
ALTER TABLE golf_leagues ADD COLUMN cadence TEXT NOT NULL DEFAULT 'seasonal' CHECK (cadence IN ('weekly', 'seasonal'));
ALTER TABLE golf_leagues ADD COLUMN start_date TEXT;
ALTER TABLE golf_leagues ADD COLUMN end_date TEXT;
ALTER TABLE golf_leagues ADD COLUMN published_at TEXT;
ALTER TABLE golf_leagues ADD COLUMN organization_id TEXT;
ALTER TABLE golf_league_courses ADD COLUMN eligible_from TEXT;
ALTER TABLE golf_league_courses ADD COLUMN eligible_until TEXT;

CREATE TABLE IF NOT EXISTS golf_league_enrollments (
  league_id TEXT NOT NULL REFERENCES golf_leagues(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'withdrawn', 'banned')),
  enrolled_at TEXT NOT NULL,
  PRIMARY KEY (league_id, person_id)
);

CREATE TABLE IF NOT EXISTS golf_round_verification_events (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('tap_verification', 'witness_confirmation', 'operator_review', 'course_confirmation', 'round_rejected')),
  actor_person_id TEXT,
  organization_id TEXT,
  hole_number INTEGER CHECK (hole_number IS NULL OR hole_number BETWEEN 1 AND 18),
  note TEXT,
  created_at TEXT NOT NULL,
  client_event_id TEXT
);

CREATE TABLE IF NOT EXISTS golf_round_audit_events (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_person_id TEXT,
  organization_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS golf_course_announcements (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS golf_operator_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  course_id TEXT REFERENCES golf_courses(id) ON DELETE CASCADE,
  actor_person_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_verification_round_idx ON golf_round_verification_events(round_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS golf_verification_client_event_idx ON golf_round_verification_events(client_event_id) WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_round_audit_round_idx ON golf_round_audit_events(round_id, created_at);
CREATE INDEX IF NOT EXISTS golf_enrollment_person_idx ON golf_league_enrollments(person_id, status);
CREATE INDEX IF NOT EXISTS golf_announcements_course_idx ON golf_course_announcements(course_id, published, created_at DESC);
CREATE INDEX IF NOT EXISTS golf_operator_audit_course_idx ON golf_operator_audit_events(course_id, created_at DESC);

UPDATE golf_courses SET latitude = 44.7412, longitude = -85.9742, state_code = 'MI', difficulty = 'challenging' WHERE id = 'cedar-ridge';
UPDATE golf_courses SET latitude = 42.3275, longitude = -85.4930, state_code = 'MI', difficulty = 'moderate' WHERE id = 'bedford-valley';
UPDATE golf_courses SET latitude = 44.8451, longitude = -86.0587, state_code = 'MI', difficulty = 'challenging' WHERE id = 'arcadia-bluffs';
UPDATE golf_courses SET latitude = 42.4100, longitude = -83.5200, state_code = 'MI', difficulty = 'moderate' WHERE id = 'briar-hill';

INSERT OR IGNORE INTO golf_league_enrollments (league_id, person_id, status, enrolled_at) VALUES
  ('great-lakes-open-2026', 'sg-00a79234', 'active', CURRENT_TIMESTAMP),
  ('great-lakes-open-2026', 'sg-0031', 'active', CURRENT_TIMESTAMP),
  ('great-lakes-open-2026', 'sg-0068', 'active', CURRENT_TIMESTAMP),
  ('great-lakes-open-2026', 'sg-0084', 'active', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO golf_course_announcements (id, course_id, organization_id, title, body, published, created_at, updated_at)
  VALUES ('announcement-cedar-ridge-welcome', 'cedar-ridge', 'org-cedar-ridge', 'Welcome to Cedar Ridge', 'Hole 09 turn-house ordering is open for today''s round.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

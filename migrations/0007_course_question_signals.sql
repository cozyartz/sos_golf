-- Phase 4: privacy-preserving signals for improving approved course content.
-- Store category and answerability, never the golfer's raw question text.

CREATE TABLE IF NOT EXISTS golf_course_question_events (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  person_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('course_guidance', 'local_rule', 'service', 'event_league', 'conditions', 'other')),
  answered_from_approved_context INTEGER NOT NULL CHECK (answered_from_approved_context IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_course_question_signal_idx
  ON golf_course_question_events(course_id, category, created_at DESC);

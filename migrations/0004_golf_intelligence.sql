-- Phase 3: provenance for deterministic and future provider-backed intelligence.
CREATE TABLE IF NOT EXISTS golf_ai_insights (
  id TEXT PRIMARY KEY,
  insight_kind TEXT NOT NULL,
  person_id TEXT,
  organization_id TEXT,
  course_id TEXT REFERENCES golf_courses(id) ON DELETE SET NULL,
  league_id TEXT REFERENCES golf_leagues(id) ON DELETE SET NULL,
  interpretation TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'advisory')),
  rule_version TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  dismissed_at TEXT
);

CREATE TABLE IF NOT EXISTS golf_ai_source_references (
  id TEXT PRIMARY KEY,
  insight_id TEXT NOT NULL REFERENCES golf_ai_insights(id) ON DELETE CASCADE,
  source_ref TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  source_verified INTEGER NOT NULL DEFAULT 0 CHECK (source_verified IN (0, 1))
);

CREATE TABLE IF NOT EXISTS golf_ai_feedback (
  id TEXT PRIMARY KEY,
  insight_id TEXT NOT NULL REFERENCES golf_ai_insights(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL,
  organization_id TEXT,
  feedback TEXT NOT NULL CHECK (feedback IN ('useful', 'not_useful', 'incorrect', 'dismissed')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_ai_insights_person_idx ON golf_ai_insights(person_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS golf_ai_insights_org_idx ON golf_ai_insights(organization_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS golf_ai_sources_insight_idx ON golf_ai_source_references(insight_id);
CREATE INDEX IF NOT EXISTS golf_ai_feedback_insight_idx ON golf_ai_feedback(insight_id, created_at DESC);

-- Operator-controlled publication state for course profiles and SEO pages.
-- A course is not publicly discoverable merely because it exists in D1.
CREATE TABLE IF NOT EXISTS golf_course_publications (
  course_id TEXT PRIMARY KEY REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'unpublished')),
  title TEXT,
  description TEXT,
  approved_by_person_id TEXT,
  approved_at TEXT,
  published_at TEXT,
  unpublished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS golf_course_publications_org_idx
  ON golf_course_publications(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS golf_course_publications_status_idx
  ON golf_course_publications(status, published_at DESC);

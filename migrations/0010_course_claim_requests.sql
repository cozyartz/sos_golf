-- Free-first course onboarding requests. Approval is explicit and does not
-- automatically publish course facts or change organization ownership.

CREATE TABLE IF NOT EXISTS golf_course_claim_requests (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES golf_courses(id) ON DELETE SET NULL,
  requested_name TEXT NOT NULL,
  region TEXT NOT NULL,
  requested_by_person_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  requested_workflows_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_person_id TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_course_claim_org_idx
  ON golf_course_claim_requests(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS golf_course_claim_course_idx
  ON golf_course_claim_requests(course_id, status, created_at DESC);

-- Phase 5: portable league matches between golfers playing at different courses.
-- Handicap inputs remain provisional until an approved governing-body integration exists.

CREATE TABLE IF NOT EXISTS golf_league_matches (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES golf_leagues(id) ON DELETE CASCADE,
  player_a_id TEXT NOT NULL,
  player_b_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('stroke_play', 'stableford')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'complete', 'cancelled')),
  scheduled_for TEXT,
  result_json TEXT,
  created_by_person_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (player_a_id <> player_b_id)
);

CREATE TABLE IF NOT EXISTS golf_league_match_entries (
  match_id TEXT NOT NULL REFERENCES golf_league_matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  round_id TEXT NOT NULL UNIQUE REFERENCES golf_rounds(id),
  course_id TEXT NOT NULL REFERENCES golf_courses(id),
  tee_set_id TEXT NOT NULL REFERENCES golf_tee_sets(id),
  gross_strokes INTEGER NOT NULL CHECK (gross_strokes > 0),
  course_handicap INTEGER NOT NULL,
  stableford_points INTEGER,
  holes_completed INTEGER NOT NULL CHECK (holes_completed BETWEEN 0 AND 18),
  trust_level TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  submitted_at TEXT NOT NULL,
  verified_at TEXT,
  PRIMARY KEY (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS golf_matches_league_idx ON golf_league_matches(league_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS golf_match_entries_round_idx ON golf_league_match_entries(round_id);

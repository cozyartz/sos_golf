CREATE TABLE IF NOT EXISTS golf_courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  address TEXT NOT NULL,
  tap_points INTEGER NOT NULL DEFAULT 0 CHECK (tap_points >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS golf_holes (
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  name TEXT NOT NULL,
  par INTEGER NOT NULL CHECK (par BETWEEN 3 AND 5),
  handicap_index INTEGER NOT NULL CHECK (handicap_index BETWEEN 1 AND 18),
  yards INTEGER NOT NULL CHECK (yards > 0),
  challenge TEXT,
  PRIMARY KEY (course_id, hole_number)
);

CREATE TABLE IF NOT EXISTS golf_tee_sets (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  rating REAL NOT NULL,
  slope INTEGER NOT NULL,
  yardage INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS golf_leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'complete')),
  format TEXT NOT NULL CHECK (format IN ('stroke_play', 'stableford', 'match_play', 'skins')),
  region TEXT NOT NULL,
  sponsor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS golf_league_courses (
  league_id TEXT NOT NULL REFERENCES golf_leagues(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  PRIMARY KEY (league_id, course_id)
);

CREATE TABLE IF NOT EXISTS golf_rounds (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id),
  league_id TEXT REFERENCES golf_leagues(id),
  format TEXT NOT NULL CHECK (format IN ('stroke_play', 'stableford', 'match_play', 'skins')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'submitted', 'approved')),
  state_of_stick_person_id TEXT NOT NULL,
  state_of_stick_organization_id TEXT,
  trust_level TEXT NOT NULL DEFAULT 'self_reported' CHECK (trust_level IN ('self_reported', 'partner_attested', 'commissioner_approved', 'course_confirmed', 'officially_integrated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS golf_hole_scores (
  round_id TEXT NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes INTEGER NOT NULL CHECK (strokes BETWEEN 0 AND 12),
  tap_verified INTEGER NOT NULL DEFAULT 0 CHECK (tap_verified IN (0, 1)),
  witness_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (witness_confirmed IN (0, 1)),
  proof_note TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (round_id, hole_number)
);

CREATE TABLE IF NOT EXISTS golf_score_trust_events (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  from_level TEXT,
  to_level TEXT NOT NULL,
  actor_person_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS golf_league_standings (
  league_id TEXT NOT NULL REFERENCES golf_leagues(id) ON DELETE CASCADE,
  golfer_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  rounds INTEGER NOT NULL DEFAULT 0,
  courses_played INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  trust_level TEXT NOT NULL DEFAULT 'self_reported',
  trend TEXT NOT NULL DEFAULT 'new',
  PRIMARY KEY (league_id, golfer_id)
);

CREATE INDEX IF NOT EXISTS golf_rounds_course_idx ON golf_rounds(course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS golf_rounds_person_idx ON golf_rounds(state_of_stick_person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS golf_hole_scores_round_idx ON golf_hole_scores(round_id);

INSERT OR IGNORE INTO golf_courses (id, name, region, address, tap_points) VALUES
  ('cedar-ridge', 'Cedar Ridge Golf Club', 'Michigan', 'Maple City, Michigan', 22),
  ('bedford-valley', 'Bedford Valley Golf Club', 'Michigan', 'Michigan', 22),
  ('arcadia-bluffs', 'Arcadia Bluffs', 'Michigan', 'Michigan', 20),
  ('briar-hill', 'Briar Hill Golf Club', 'Michigan', 'Michigan', 19);

INSERT OR IGNORE INTO golf_holes (course_id, hole_number, name, par, handicap_index, yards, challenge) VALUES
  ('cedar-ridge', 1, 'The Opening', 4, 7, 382, NULL),
  ('cedar-ridge', 2, 'Pine Bend', 5, 3, 506, NULL),
  ('cedar-ridge', 3, 'Oak Run', 3, 15, 164, NULL),
  ('cedar-ridge', 4, 'The Shelf', 4, 1, 411, NULL),
  ('cedar-ridge', 5, 'Little Fox', 4, 11, 365, NULL),
  ('cedar-ridge', 6, 'The Crossing', 3, 17, 142, NULL),
  ('cedar-ridge', 7, 'Red Tail', 3, 13, 148, 'Closest-to-pin'),
  ('cedar-ridge', 8, 'The Narrows', 4, 5, 372, 'Local line'),
  ('cedar-ridge', 9, 'Turn House', 5, 9, 489, 'Order ahead'),
  ('cedar-ridge', 10, 'Long View', 4, 2, 406, NULL),
  ('cedar-ridge', 11, 'Briar', 4, 8, 391, NULL),
  ('cedar-ridge', 12, 'The Drop', 3, 18, 151, NULL),
  ('cedar-ridge', 13, 'Hickory', 4, 6, 405, NULL),
  ('cedar-ridge', 14, 'North Field', 5, 10, 520, NULL),
  ('cedar-ridge', 15, 'The Hollow', 4, 4, 414, NULL),
  ('cedar-ridge', 16, 'Wren', 3, 16, 177, NULL),
  ('cedar-ridge', 17, 'Home Stretch', 4, 12, 397, NULL),
  ('cedar-ridge', 18, 'Last Light', 4, 14, 387, NULL);

INSERT OR IGNORE INTO golf_tee_sets (id, course_id, name, color, rating, slope, yardage) VALUES
  ('cedar-ridge-blue', 'cedar-ridge', 'Blue', '#244f3a', 71.8, 132, 6421),
  ('cedar-ridge-white', 'cedar-ridge', 'White', '#f4f1e9', 69.6, 126, 5964),
  ('cedar-ridge-red', 'cedar-ridge', 'Red', '#e98745', 71.1, 128, 5298);

INSERT OR IGNORE INTO golf_leagues (id, name, season, status, format, region, sponsor) VALUES
  ('great-lakes-open-2026', 'Great Lakes Open', 'Summer 2026', 'active', 'stableford', 'Michigan · Play anywhere', 'State of Stick Community Fund');

INSERT OR IGNORE INTO golf_league_courses (league_id, course_id) VALUES
  ('great-lakes-open-2026', 'cedar-ridge'),
  ('great-lakes-open-2026', 'bedford-valley'),
  ('great-lakes-open-2026', 'arcadia-bluffs'),
  ('great-lakes-open-2026', 'briar-hill');

INSERT OR IGNORE INTO golf_league_standings (league_id, golfer_id, display_name, rounds, courses_played, points, trust_level, trend) VALUES
  ('great-lakes-open-2026', 'sg-00a79234', 'Andrea Cozart-Lundin', 5, 3, 74, 'partner_attested', 'up'),
  ('great-lakes-open-2026', 'sg-0031', 'Marcus Bell', 6, 4, 72, 'course_confirmed', 'steady'),
  ('great-lakes-open-2026', 'sg-0068', 'Tina Alvarez', 4, 2, 69, 'commissioner_approved', 'up'),
  ('great-lakes-open-2026', 'sg-0084', 'James Porter', 3, 3, 63, 'partner_attested', 'new');

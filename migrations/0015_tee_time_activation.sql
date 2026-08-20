-- Tee-time activation layer. The course's existing tee sheet remains the
-- reservation system of record; this stores only the integration reference and
-- the State of Stick experience attached to it.
CREATE TABLE IF NOT EXISTS golf_tee_time_reservations (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  external_reservation_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  player_count INTEGER NOT NULL CHECK (player_count BETWEEN 1 AND 8),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'activated', 'checked_in', 'completed', 'cancelled', 'no_show')),
  booking_url TEXT,
  activation_token_hash TEXT NOT NULL UNIQUE,
  activation_expires_at TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_tee_time_external_idx
  ON golf_tee_time_reservations(course_id, source_system, external_reservation_id);
CREATE INDEX IF NOT EXISTS golf_tee_time_course_start_idx
  ON golf_tee_time_reservations(course_id, starts_at, status);

CREATE TABLE IF NOT EXISTS golf_tee_time_events (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES golf_tee_time_reservations(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  actor_person_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('imported', 'updated', 'activated', 'checked_in', 'completed', 'cancelled', 'no_show')),
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_tee_time_events_reservation_idx
  ON golf_tee_time_events(reservation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS golf_tee_time_players (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES golf_tee_time_reservations(id) ON DELETE CASCADE,
  player_index INTEGER NOT NULL CHECK (player_index BETWEEN 1 AND 8),
  state_of_stick_person_id TEXT,
  assigned_at TEXT,
  UNIQUE(reservation_id, player_index)
);

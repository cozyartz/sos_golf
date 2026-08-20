CREATE TABLE IF NOT EXISTS golf_course_map_layers (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  layer_kind TEXT NOT NULL CHECK (layer_kind IN ('boundary', 'hole', 'tee', 'green', 'hazard', 'cart_path', 'sticklink', 'league_event')),
  label TEXT NOT NULL,
  geometry_json TEXT NOT NULL,
  source TEXT NOT NULL,
  source_identifier TEXT,
  geometry_version TEXT NOT NULL,
  organization_id TEXT,
  approved_by_operator INTEGER NOT NULL DEFAULT 0 CHECK (approved_by_operator IN (0, 1)),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS golf_course_holes_geometry (
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  geometry_json TEXT NOT NULL,
  source TEXT NOT NULL,
  source_identifier TEXT,
  geometry_version TEXT NOT NULL,
  organization_id TEXT,
  approved_by_operator INTEGER NOT NULL DEFAULT 0 CHECK (approved_by_operator IN (0, 1)),
  approved_at TEXT,
  PRIMARY KEY (course_id, hole_number, geometry_version)
);

CREATE TABLE IF NOT EXISTS golf_course_imagery (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  imagery_url TEXT,
  tile_source TEXT,
  capture_timestamp TEXT,
  resolution TEXT,
  cloud_cover REAL CHECK (cloud_cover IS NULL OR (cloud_cover >= 0 AND cloud_cover <= 100)),
  license TEXT,
  coverage_bounds_json TEXT,
  processing_status TEXT NOT NULL DEFAULT 'unavailable' CHECK (processing_status IN ('available', 'pending', 'unavailable')),
  source_identifier TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS golf_sticklink_locations (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('tee', 'green', 'clubhouse', 'turn_house', 'sponsor')),
  geometry_json TEXT NOT NULL,
  source TEXT NOT NULL,
  organization_id TEXT,
  approved_by_operator INTEGER NOT NULL DEFAULT 0 CHECK (approved_by_operator IN (0, 1)),
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS golf_map_layers_course_idx ON golf_course_map_layers(course_id, approved_by_operator, layer_kind);
CREATE INDEX IF NOT EXISTS golf_hole_geometry_course_idx ON golf_course_holes_geometry(course_id, approved_by_operator, hole_number);
CREATE INDEX IF NOT EXISTS golf_imagery_course_idx ON golf_course_imagery(course_id, processing_status);
CREATE INDEX IF NOT EXISTS golf_sticklink_course_idx ON golf_sticklink_locations(course_id, approved_by_operator);

ALTER TABLE golf_rounds ADD COLUMN client_round_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS golf_rounds_client_round_idx ON golf_rounds(client_round_id) WHERE client_round_id IS NOT NULL;

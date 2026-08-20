-- Read-only projection and usage ledger for the future State of Stick adapter.
-- State of Stick remains authoritative for identity, billing, entitlements, and
-- AI usage. Golf must not create rows here from a client request.
CREATE TABLE IF NOT EXISTS golf_player_entitlement_projection (
  person_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL CHECK (entitlement_key IN ('network_member', 'player_plus', 'pro_golfer', 'league_pass')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'past_due')),
  source TEXT NOT NULL CHECK (source IN ('state_of_stick', 'course_sponsor', 'league', 'demo')),
  source_id TEXT,
  valid_until TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (person_id, entitlement_key, source)
);

CREATE INDEX IF NOT EXISTS golf_player_entitlement_status_idx
  ON golf_player_entitlement_projection(person_id, status, valid_until);

CREATE TABLE IF NOT EXISTS golf_player_usage_ledger (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('golf_agent_questions')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  period_start TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_player_usage_period_idx
  ON golf_player_usage_ledger(person_id, metric, period_start);

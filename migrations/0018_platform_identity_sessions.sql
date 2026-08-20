-- Optional revocation projection for State of Stick sessions.
-- State of Stick remains authoritative; Golf only denies a session after a
-- signed platform sync records it as revoked or expired here.
CREATE TABLE IF NOT EXISTS golf_platform_identity_sessions (
  session_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_platform_identity_sessions_person_idx
  ON golf_platform_identity_sessions(person_id, expires_at, revoked_at);

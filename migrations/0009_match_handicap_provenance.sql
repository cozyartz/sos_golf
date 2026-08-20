-- Phase 5: make the handicap input and its trust boundary explicit.
-- A match must show whether the handicap came from an approved source.

ALTER TABLE golf_league_match_entries ADD COLUMN handicap_index REAL NOT NULL DEFAULT 0;
ALTER TABLE golf_league_match_entries ADD COLUMN handicap_source TEXT NOT NULL DEFAULT 'provisional_player_input' CHECK (handicap_source IN ('provisional_player_input', 'league_commissioner', 'approved_external_provider'));

CREATE INDEX IF NOT EXISTS golf_match_entry_handicap_source_idx
  ON golf_league_match_entries(handicap_source, match_id);

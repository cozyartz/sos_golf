-- Bind a claimed tee-time player slot to the golfer's round without changing
-- the external tee sheet's reservation authority.
ALTER TABLE golf_tee_time_players ADD COLUMN round_id TEXT REFERENCES golf_rounds(id);
ALTER TABLE golf_rounds ADD COLUMN tee_time_reservation_id TEXT REFERENCES golf_tee_time_reservations(id);

CREATE UNIQUE INDEX IF NOT EXISTS golf_tee_time_player_round_idx
  ON golf_tee_time_players(round_id)
  WHERE round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_rounds_tee_time_idx
  ON golf_rounds(tee_time_reservation_id, created_at DESC);

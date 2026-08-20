-- Preserve the tee-time context when a golfer requests an on-course service.
ALTER TABLE golf_service_requests ADD COLUMN tee_time_reservation_id TEXT REFERENCES golf_tee_time_reservations(id);

CREATE INDEX IF NOT EXISTS golf_service_requests_tee_time_idx
  ON golf_service_requests(tee_time_reservation_id, created_at DESC);

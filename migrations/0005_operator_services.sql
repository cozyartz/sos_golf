-- Operator-managed service catalog and golfer service requests.
-- This is a request/fulfillment foundation only; payment and POS settlement stay
-- in the State of Stick commerce boundary until an integration is approved.

CREATE TABLE IF NOT EXISTS golf_service_catalog (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('food_beverage', 'player_service', 'course_information', 'event_program', 'sponsor_activation')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  fulfillment_modes TEXT NOT NULL DEFAULT 'clubhouse' CHECK (length(fulfillment_modes) <= 500),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS golf_service_requests (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  service_id TEXT NOT NULL REFERENCES golf_service_catalog(id),
  person_id TEXT NOT NULL,
  round_id TEXT REFERENCES golf_rounds(id),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'in_progress', 'ready', 'completed', 'cancelled', 'rejected')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  note TEXT,
  fulfillment TEXT NOT NULL DEFAULT 'clubhouse' CHECK (fulfillment IN ('clubhouse', 'cart_delivery', 'pickup', 'digital')),
  total_cents INTEGER CHECK (total_cents IS NULL OR total_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS golf_service_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES golf_service_requests(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  actor_person_id TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS golf_service_catalog_course_idx ON golf_service_catalog(course_id, published, active, name);
CREATE INDEX IF NOT EXISTS golf_service_requests_course_idx ON golf_service_requests(course_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS golf_service_requests_person_idx ON golf_service_requests(person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS golf_service_request_events_request_idx ON golf_service_request_events(request_id, created_at);

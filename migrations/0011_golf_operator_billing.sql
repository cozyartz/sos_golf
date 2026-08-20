-- Stripe Billing state for Connected Course subscriptions.
-- Stripe remains the payment system of record; D1 stores references and
-- entitlements only after verified webhook events.

CREATE TABLE IF NOT EXISTS golf_billing_accounts (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_key TEXT NOT NULL CHECK (plan_key IN ('connected_course')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'incomplete')),
  current_period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_billing_course_plan_idx ON golf_billing_accounts(course_id, plan_key);
CREATE UNIQUE INDEX IF NOT EXISTS golf_billing_subscription_idx ON golf_billing_accounts(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS golf_billing_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subscription_id TEXT,
  payload_json TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'failed')),
  last_error TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS golf_entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL CHECK (entitlement_key IN ('connected_course')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  source_billing_account_id TEXT REFERENCES golf_billing_accounts(id) ON DELETE SET NULL,
  valid_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_entitlement_course_key_idx ON golf_entitlements(course_id, entitlement_key);

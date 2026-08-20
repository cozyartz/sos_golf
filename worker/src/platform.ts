import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

export type GolfPlatformEventName =
  | 'golf.course_claim_requested'
  | 'golf.round_submitted'
  | 'golf.tap_interaction'
  | 'golf.service_requested'
  | 'golf.service_status_changed'
  | 'golf.tee_time_status_changed'
  | 'golf.course_published'
  | 'golf.course_unpublished';

export type GolfPlatformEvent = {
  eventId: string;
  eventName: GolfPlatformEventName;
  organizationId?: string | null;
  courseId?: string | null;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

/**
 * Golf owns the operational record; State of Stick owns the platform event
 * stream, analytics, consent, retention, and metering. The outbox makes that
 * boundary retry-safe before a service binding/queue consumer is connected.
 */
export function platformEventStatement(db: D1Database, event: GolfPlatformEvent): D1PreparedStatement {
  return db.prepare(`INSERT OR IGNORE INTO golf_platform_event_outbox
    (event_id, event_name, organization_id, course_id, aggregate_type, aggregate_id, occurred_at, payload_json)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(event.eventId, event.eventName, event.organizationId ?? null, event.courseId ?? null, event.aggregateType, event.aggregateId, event.occurredAt, JSON.stringify(event.payload));
}

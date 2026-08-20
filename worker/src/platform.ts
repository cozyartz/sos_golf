import type { D1Database, D1PreparedStatement, Queue } from '@cloudflare/workers-types';

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

type PlatformAnalyticsQueueMessage = {
  version: 1;
  kind: 'analytics_event';
  event: {
    id: string;
    createdAt: string;
    eventName: 'product_action_click';
    organizationId: string | null;
    path: string;
    clientEventId: string;
    serverEventKey: string;
    ingestSource: 'server';
    metadataJson: string;
  };
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

/**
 * Forward pending Golf events through the existing State of Stick analytics
 * queue. The platform queue contract is intentionally used as an envelope:
 * the complete Golf event remains in metadata while the platform owns the
 * durable analytics, usage, consent, and retention path.
 */
export async function forwardPendingPlatformEvents(db: D1Database, queue: Queue<PlatformAnalyticsQueueMessage>): Promise<number> {
  const pending = await db.prepare(`SELECT event_id, event_name, organization_id, aggregate_type, aggregate_id, occurred_at, payload_json, attempts
    FROM golf_platform_event_outbox
    WHERE status IN ('pending', 'failed') AND attempts < 10
    ORDER BY created_at ASC LIMIT 50`).all<{
      event_id: string;
      event_name: string;
      organization_id: string | null;
      aggregate_type: string;
      aggregate_id: string;
      occurred_at: string;
      payload_json: string;
      attempts: number;
    }>();
  let forwarded = 0;
  for (const event of pending.results) {
    const attemptAt = new Date().toISOString();
    await db.prepare(`UPDATE golf_platform_event_outbox
      SET status = 'pending', attempts = attempts + 1, updated_at = ?1
      WHERE event_id = ?2 AND status IN ('pending', 'failed')`).bind(attemptAt, event.event_id).run();
    try {
      const metadataJson = JSON.stringify({
        source: 'sosgolf',
        golfEventName: event.event_name,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        payload: JSON.parse(event.payload_json) as Record<string, unknown>,
      }).slice(0, 4000);
      await queue.send({
        version: 1,
        kind: 'analytics_event',
        event: {
          id: event.event_id,
          createdAt: event.occurred_at,
          eventName: 'product_action_click',
          organizationId: event.organization_id,
          path: `/golf/${event.aggregate_type}/${event.aggregate_id}`.slice(0, 500),
          clientEventId: event.event_id,
          serverEventKey: event.event_id,
          ingestSource: 'server',
          metadataJson,
        },
      });
      await db.prepare(`UPDATE golf_platform_event_outbox SET status = 'forwarded', forwarded_at = ?1, updated_at = ?1, last_error = NULL WHERE event_id = ?2`).bind(attemptAt, event.event_id).run();
      forwarded += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Queue forwarding failed.';
      await db.prepare(`UPDATE golf_platform_event_outbox SET status = 'failed', last_error = ?1, updated_at = ?2 WHERE event_id = ?3`).bind(message.slice(0, 1000), new Date().toISOString(), event.event_id).run();
      console.error('[golf platform event forwarding]', cause);
    }
  }
  return forwarded;
}

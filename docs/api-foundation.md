# StickLink Golf API foundation

The golf site remains a Pages frontend. Golf-specific persistence and write
operations live in the separate `sticklink-golf-api` Worker.

## Local development

Copy `worker/.dev.vars.example` to `worker/.dev.vars` and replace the local
placeholder with a value you choose. The file is ignored by Git.

Run the API locally with:

```bash
npm run api:dev
```

Wrangler uses the local D1 database and local Durable Object storage. Apply the
local migration with:

```bash
npx wrangler d1 migrations apply sticklink-golf --local --config worker/wrangler.jsonc
```

The API currently exposes:

- `GET /health`
- `GET /api/v1/taps/:hardwareId`
- `GET /api/v1/courses`
- `GET /api/v1/courses/:courseId`
- `GET /api/v1/leagues/:leagueId`
- `GET /api/v1/rounds/:roundId`
- `GET /api/v1/live/rounds/:roundId`
- `POST /api/v1/rounds`
- `GET /api/v1/players/:personId/passport`
- `GET /api/v1/courses?state=MI&difficulty=moderate&leagueActive=true&page=1&pageSize=20`
- `GET /api/v1/courses/:courseId/announcements`
- `GET /api/v1/leagues/:leagueId`
- `GET /api/v1/leagues/:leagueId/live`
- `POST /api/v1/leagues/:leagueId/enroll`
- `POST /api/v1/rounds/:roundId/verification`
- `POST /api/v1/courses/:courseId/operator-review`
- `POST /api/v1/courses/:courseId/operator-profile`
- `POST /api/v1/courses/:courseId/announcements`
- `GET /api/v1/courses/:courseId/services`
- `POST /api/v1/courses/:courseId/services`
- `POST /api/v1/courses/:courseId/service-requests`
- `GET /api/v1/courses/:courseId/service-requests`
- `POST /api/v1/service-requests/:requestId/status`
- `POST /api/v1/leagues`
- `POST /api/v1/leagues/:leagueId/matches`
- `GET /api/v1/leagues/:leagueId/matches`
- `POST /api/v1/matches/:matchId/entries`
- `GET /api/v1/players/:personId/intelligence`
- `GET /api/v1/leagues/:leagueId/intelligence`
- `GET /api/v1/courses/:courseId/intelligence`
- `GET /api/v1/courses/:courseId/operator-metrics`
- `POST /api/v1/course-claims`
- `GET /api/v1/course-claims`
- `POST /api/v1/course-claims/:claimId/review`
- `GET /api/v1/operator-plans`
- `POST /api/v1/courses/:courseId/billing/checkout`
- `POST /api/v1/stripe/webhook`
- `GET /api/v1/courses/:courseId/publication`
- `POST /api/v1/courses/:courseId/publication` — operator-controlled publish/unpublish
- `GET /api/v1/public/courses/:slug` — public profile containing published records only
- `POST /api/v1/assistant`
- `POST /api/v1/intelligence/:insightId/feedback`
- `GET /api/v1/courses/:courseId/knowledge`
- `GET /api/v1/courses/:courseId/knowledge/manage`
- `POST /api/v1/courses/:courseId/knowledge`
- `POST /api/v1/courses/:courseId/assistant`
- `GET /api/v1/courses/:courseId/question-insights`
- `POST /api/v1/courses/:courseId/tap-points`
- `GET /api/v1/courses/:courseId/tap-points`
- `POST /api/v1/courses/:courseId/tap-points/:tapPointId/status`
- `POST /api/v1/courses/:courseId/tap-events`

Round creation requires `Authorization: Bearer <GOLF_WRITE_TOKEN>`. This is a
temporary service-auth seam for the persistent pilot. It is not the final
golfer identity system. Before production golfer writes are enabled, replace it
with a verified State of Stick identity and organization-membership check.

Service catalog reads expose only active, published operator services. Service
catalog writes and request status changes require the operator organization and
actor headers. A golfer service request requires the temporary write token plus
the requesting golfer identity. The current slice records requests and
fulfillment status but does not charge a card, settle funds, or claim a POS
integration; those remain State of Stick commerce boundaries.

Connected Course billing uses Stripe Checkout in subscription mode only when
the server-side `GOLF_CONNECTED_COURSE_PRICE_ID` is configured. The browser
cannot choose a price or amount. `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` remain Cloudflare secrets. The golf Worker stores only
Stripe references, verified billing events, and course entitlements; Stripe is
the payment system of record. Configure Stripe to send events to
`golf-api.stateofstick.co/api/v1/stripe/webhook`; webhook events are the only
path that activates or removes the Connected Course entitlement.

Course knowledge writes are operator-scoped. Only published knowledge records
are available to the course assistant, and every record keeps its source and
approval identity. Tap points begin as planned and unapproved; a separate
operator approval workflow must mark them active before tap events are accepted.

Course publication is a separate boundary from course existence. A public SEO
profile is unavailable until an authorized operator explicitly publishes it.
Unpublishing removes it from the public profile API without deleting the course
or its operational history. Publication, unpublication, claims, rounds, taps,
and service requests create retry-safe events for the State of Stick platform
outbox.

The course assistant uses Cloudflare Workers AI only after the deterministic
refusal and approved-context checks pass. If inference is unavailable, it falls
back to the deterministic provider; no course-facing request is allowed to
invent facts or perform a consequential action.

## Production boundary

The production D1 database and Worker binding are provisioned in the
Techflunky Cloudflare account. Migration `0001_golf_foundation.sql` has been
applied to database `sticklink-golf`, and the production Worker
`sticklink-golf-api-production` is deployed with `GOLF_WRITE_TOKEN` stored as
a Cloudflare secret.

The intended production shape is:

- Worker: `sticklink-golf-api-production`
- API hostname: `golf-api.stateofstick.co`
- D1 database: `sticklink-golf`
- Frontend origin: `https://golf.stateofstick.co`

The Worker route is configured in Wrangler, and Cloudflare DNS uses a proxied
`golf-api` record. This single-level hostname is intentional: it is covered
by the zone's active Universal SSL wildcard certificate. Verify `/health`,
`/api/v1/courses`, and the live-round endpoint through the custom hostname.

```text
golf.stateofstick.co              Pages frontend
golf-api.stateofstick.co          Golf API Worker
sticklink-golf                    Golf D1 database
RoundSession Durable Objects      Active-round/live coordination
```

State of Stick remains authoritative for identity, organizations, physical
StickLinks, commerce, payments, entitlements, and attribution. Golf owns
courses, holes, rounds, score context, leagues, events, and golf workflows.

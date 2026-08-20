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
- `GET /api/v1/players/:personId/intelligence`
- `GET /api/v1/leagues/:leagueId/intelligence`
- `GET /api/v1/courses/:courseId/intelligence`
- `POST /api/v1/assistant`
- `POST /api/v1/intelligence/:insightId/feedback`

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

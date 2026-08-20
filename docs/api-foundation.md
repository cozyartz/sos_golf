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

Round creation requires `Authorization: Bearer <GOLF_WRITE_TOKEN>`. This is a
temporary service-auth seam for the persistent pilot. It is not the final
golfer identity system. Before production golfer writes are enabled, replace it
with a verified State of Stick identity and organization-membership check.

## Production boundary

The production D1 database and Worker binding are provisioned in the
Techflunky Cloudflare account. Migration `0001_golf_foundation.sql` has been
applied to database `sticklink-golf`, and the production Worker
`sticklink-golf-api-production` is deployed with `GOLF_WRITE_TOKEN` stored as
a Cloudflare secret.

The intended production shape is:

- Worker: `sticklink-golf-api-production`
- API hostname: `api.golf.stateofstick.co`
- D1 database: `sticklink-golf`
- Frontend origin: `https://golf.stateofstick.co`

The Worker route is configured in Wrangler, and Cloudflare DNS now has a
proxied CNAME for `api.golf` targeting `stateofstick.pages.dev`. Allow
Cloudflare's certificate provisioning to complete, then verify `/health`,
`/api/v1/courses`, and the live-round endpoint through the custom hostname.

```text
golf.stateofstick.co              Pages frontend
api.golf.stateofstick.co          Golf API Worker
sticklink-golf                    Golf D1 database
RoundSession Durable Objects      Active-round/live coordination
```

State of Stick remains authoritative for identity, organizations, physical
StickLinks, commerce, payments, entitlements, and attribution. Golf owns
courses, holes, rounds, score context, leagues, events, and golf workflows.

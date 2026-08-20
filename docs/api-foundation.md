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

Do not run a remote migration or deploy the Worker until the production D1
database, Worker environment, secrets, and API hostname have been reviewed.
The current Wrangler file intentionally has no production database ID, so it
cannot accidentally write to a remote database.

The intended production shape is:

```text
golf.stateofstick.co              Pages frontend
api.golf.stateofstick.co          Golf API Worker
sticklink-golf                    Golf D1 database
RoundSession Durable Objects      Active-round/live coordination
```

State of Stick remains authoritative for identity, organizations, physical
StickLinks, commerce, payments, entitlements, and attribution. Golf owns
courses, holes, rounds, score context, leagues, events, and golf workflows.

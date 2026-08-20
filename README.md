# StickLink Golf

Standalone pilot application for the State of Stick golf vertical and the first implementation of the StickLink Golf Network.

## Product thesis

StickLink Golf is the physical identity and interaction layer for golf: a golfer-owned passport and a course-owned network of tap points that make rounds, achievements, collectibles, sponsor activations, and post-round relationships measurable.

The product is not a replacement for GHIN, a governing body, a bookmaker, or a course-management suite. It is the identity, physical-interaction, scoring-context, commerce, and provenance layer that can sit across those organizations.

## Pilot surface

- `/` — course landing and active-round entry
- `/passport/` — golfer passport, achievements, and collection
- `/course/cedar-ridge/` — hole-by-hole connected course experience
- `/operator/` — course-side activity and activation view
- `/round/cedar-ridge/` — working live scorecard with official, Stableford, and StickLink views
- `/network/` — golfer/course/physical-graph network view
- `/events/state-of-stick-invitational/` — event identity and live leaderboard concept
- `/league/anywhere/` — portable multi-course season and shared standings
- `/discover/` — provider-neutral course discovery with map and list views
- `/pitch/` — plain-language owner brief for the golf vertical

## Build boundary

The current build uses local mock data only. The scorecard demonstrates the product boundary: official strokes remain distinct from format points, physical verification, and passport history. No production claims, golfer tracking, sponsor attribution, or payment flows are implied by the demo.

## Platform boundary

Golf is the vertical experience, not a second platform. In a connected implementation, State of Stick remains the source of truth for identity, organizations, physical StickLinks, commerce, payments, entitlements, and attribution. This application owns golf-specific concepts such as courses, holes, rounds, rulesets, leagues, events, challenges, and score context.

The product is designed for participation, discovery, sponsor activation, and course commerce. It does not implement wagering, odds, prize pools, payout balances, or entry-fee-to-prize mechanics.

## Free-first architecture

The golf network is designed to feel national before it depends on paid infrastructure. The map contract supports course boundaries, holes, tees, greens, hazards, cart paths, StickLink points, league overlays, and dated imagery metadata. The default experience is a local SVG/GeoJSON-compatible course diagram, so a course remains useful when no satellite source is available.

Pending rounds use browser IndexedDB for offline score entry, tap verification, witness confirmation, retry, and duplicate-safe sync. No secrets are stored there. Deterministic round summaries and warnings are generated only from supplied scores and course data; trusted facts, suggestions, and unverified observations remain visibly separate.

Public course discovery and approved map, imagery, and StickLink reads are exposed by the existing Worker API. Write routes remain authenticated. Geometry is operator-approved context and never replaces official scoring, handicap, yardage, or league records. See [`docs/map-architecture.md`](docs/map-architecture.md) for attribution, licensing, and the future satellite-provider boundary.

## Phase 2 network foundation

The State of Stick Golf Network adds a derived player passport, explicit round verification events and audit history, public/private weekly or seasonal leagues, operator-seeded course discovery, organization-scoped operator actions, announcements, and D1-backed standings with Durable Object live-event overlays. The API keeps D1 authoritative when live coordination is cold. See [`docs/network-model.md`](docs/network-model.md), [`docs/league-rules.md`](docs/league-rules.md), and [`docs/migrations.md`](docs/migrations.md).

## AI-powered State of Stick Golf

State of Stick Golf Intelligence turns authorized round, league, and course records into useful explanations while keeping official facts separate from advisory interpretation. The first provider is a deterministic rules engine, so the product does not require a paid AI service. Every result includes source facts, confidence, timestamp, rule version, provider identifier, and provenance status. See [`docs/golf-intelligence.md`](docs/golf-intelligence.md) and [`docs/product-brand-architecture.md`](docs/product-brand-architecture.md).

## Implementation plan

The build sequence for the portable golf network is documented in [`docs/implementation-plan.md`](docs/implementation-plan.md). The first product slice is a multi-course season with explicit score trust levels and a player-owned passport.

## Owner thesis

The golf vertical should be led by someone who understands golfers and course operators. The opportunity is to make the game more playful and welcoming while giving courses measurable ways to earn through subscriptions, event programs, sponsor activations, commerce attribution, and physical course-linked products.

## Product guide: what is actually here

StickLink Golf is the first physical-world identity vertical in State of
Stick. It connects a golfer-owned passport to course-owned physical moments:
tee markers, flagsticks, carts, halfway houses, pro shops, tournament signs,
and service counters. A tap or course interaction gives the golfer useful
context at the moment it matters, then gives the course a permissioned record of
the interaction.

The product matters because golf is experienced in person, while much of the
context disappears when the round ends. The golfer may remember a score but
lose the course, hole, people, proof, collection, and reason to return. The
course may have loyal players and valuable physical assets but little visibility
into participation, repeat visits, service demand, or activation performance.
StickLink connects those pieces without asking the course to replace its tee
sheet, payment system, handicap authority, or course-management software.

### Golfer surfaces

- `/` tells the connected-fairway story and starts the active-round journey.
- `/round/cedar-ridge/` is the working scorecard surface for hole-by-hole
  scores, official strokes, format points, physical verification, witness
  confirmation, retry-safe sync, and round recovery.
- `/passport/` is the golfer-owned read model for rounds, courses, holes,
  verified rounds, personal bests, streaks, league memberships, and activity.
- `/course/cedar-ridge/` presents a course and its hole-by-hole connected
  experience.
- `/tap/cedar-ridge/turn-house/` demonstrates a physical touchpoint experience.
- `/network/`, `/discover/`, `/league/anywhere/`, and the invitational route
  show the network, discovery, portable competition, and event layers.
- `/course/cedar-ridge/services/` exposes the published service catalog and
  lets a golfer request an approved service without exposing payment ownership.
- `/tee-time/activate/` resolves a secure tee-time handoff, then connects an
  authenticated golfer slot to a round, services, leagues, and course context.
- `/intelligence/` explains how deterministic and future model-backed
  guidance stays separate from official records.

### Course and operator surfaces

- `/operator/`, `/operator/onboard/`, `/operator/rounds/`,
  `/operator/tee-times/`, `/operator/services/`, and `/operator/analytics/`
  cover course onboarding, round review, arrivals, fulfillment, and recorded
  activity metrics.
- Course claim requests require explicit review before management access.
- Operators can manage course profiles, publish/unpublish public profiles,
  maintain approved knowledge, create announcements, manage service catalogs,
  register and approve tap points, and record tap events.
- Tee-time operations support bounded import, activation tokens, player-slot
  claims, check-in/completion/cancellation transitions, and round binding.
- Metrics describe recorded D1 activity. They are not settled revenue, POS
  truth, sponsor attribution, or a claim that a reservation was independently
  validated.

### Network and competition

- Leagues can be public or private and weekly or seasonal.
- Round lifecycle is `draft → in_progress → submitted → verified` or
  `rejected`.
- Verification events and audit records preserve tap, witness, course, and
  operator context; a self-report cannot silently become an official result.
- Supported competition foundations include stroke play, Stableford, match
  play, and skins. Stableford points, course handicap, and tie ranking are
  deterministic.
- Portable matches let golfers submit verified 18-hole rounds from eligible
  courses. Handicap input and its source remain visible and provisional until
  an approved authority or commissioner workflow supplies the value.
- D1 is authoritative for rounds, verification, standings, and published
  results. Durable Objects provide live overlays and fall back to D1 when cold.

### Intelligence and AI

Golf Intelligence is provider-neutral. The current `rules-engine` provider
uses only authorized golf records and does not require a paid model. Results
include source facts, interpretation, confidence, timestamp, rule version,
provider identifier, and provenance status.

The bounded course assistant may use Cloudflare Workers AI only after approved
course-context and refusal checks pass. It treats course content as data, not
instructions, and cannot write scores, standings, prices, orders,
announcements, or staff actions. Unsupported, private-player, medical,
gambling, and unverified-official questions are refused. If inference is
unavailable, the deterministic path remains useful.

## Architecture and ownership

```text
State of Stick identity/platform
        │ signed identity assertions and organization authority
        ▼
Astro Pages frontend  ───────►  Cloudflare Worker API
golf.stateofstick.co             golf-api.stateofstick.co
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                   D1 authoritative   Durable Objects
                   golf records       live overlays
```

The frontend is static Astro output in `dist/`; browser JavaScript is public
by design and must never contain secrets. The Worker is server-side. D1
migrations are ordered from the golf foundation through network records,
intelligence, services, course knowledge, portable matches, billing,
publication, tee-time activation, and identity sessions.

State of Stick remains authoritative for person identity, organizations,
physical StickLinks, commerce, payments, entitlements, and attribution. Golf
stores references to those identities and owns courses, holes, rounds, score
context, leagues, events, matches, services, course knowledge, and golf
interpretation. This separation prevents a second password system and keeps
the Golf vertical portable.

## API capability map

The Worker provides health and public reads for approved course profiles,
course discovery, taps, announcements, and published services. Protected
capabilities include player passports and intelligence; round creation,
scores, submission, verification, audit, and live snapshots; league enrollment,
standings, intelligence, matches, and portable entries; course claims and
operator review; publication, knowledge, tap points, tap events, services,
requests, announcements, tee-time operations, metrics, assistant questions,
feedback, Connected Course checkout, and Stripe webhook processing.

The complete route inventory is maintained in
[`docs/api-foundation.md`](docs/api-foundation.md). The main integration
contracts are documented in [`docs/network-model.md`](docs/network-model.md),
[`docs/tee-time-activation.md`](docs/tee-time-activation.md),
[`docs/platform-identity-contract.md`](docs/platform-identity-contract.md),
and [`docs/platform-integration.md`](docs/platform-integration.md).

## Security boundary and preview protection

Production protected routes require a signed, time-bounded State of Stick
identity assertion and an active identity session. The Worker canonicalizes
legacy person and organization transport headers from that assertion before
protected handlers use them. Private league access additionally checks active
enrollment. Operator routes require verified organization membership and an
allowed operator role. Live round snapshots require the owning golfer or an
authorized operator for the round’s organization.

Public course facts and published service catalogs remain public intentionally.
Private responses are `no-store`; public caching is limited to explicitly
public records. Activation tokens are random and only their SHA-256 hashes are
stored. The Pages layer emits CSP, HSTS, clickjacking, MIME, referrer, and
browser-permission headers from [`public/_headers`](public/_headers).

Cloudflare Access is enabled for the `sticklink-golf` Pages preview
deployments. Unauthenticated preview URLs redirect to Access; authenticated
users can view the deployment. Production custom domains and production
`pages.dev` behavior are separate Zero Trust decisions and must not be inferred
from preview protection.

## Intentional non-goals

StickLink Golf is not GHIN, a governing-body handicap authority, a bookmaker,
wagering product, prize-pool ledger, payment wallet, POS, settlement system,
or replacement tee sheet. There are no entry fees, odds, prize payouts,
payout balances, or payment instructions in the league foundation.

A tap, witness, AI response, player note, or generated insight does not become
official proof by itself. Official scores, handicaps, yardage, course rules,
standings, prices, payments, and orders remain governed records or human-
approved actions. Proposed membership tiers and pricing ranges are internal
pilot hypotheses, not published prices or live entitlements.

## Release and validation checklist

Run the required checks from the repository root:

```bash
npm test
npm run check
npm run api:check
npm run build
git diff --check
```

The normal release boundary is: local validation → focused commit → GitHub
branch → Pages deployment → custom-domain verification. Keep those states
separate when reporting release evidence. Do not commit `dist/`, `.astro/`,
`.wrangler/`, `.dev.vars`, credentials, identity secrets, payment secrets, or
production environment files.

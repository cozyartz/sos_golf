# State of Stick Golf

**A physical-world network for golf — built on top of State of Stick.**

State of Stick Golf is the golf vertical of State of Stick, Co. It connects
golfers, courses, rounds, leagues, events, services, and physical course
touchpoints into one permissioned experience.

This repository is the golf-specific application and pilot. It is **not** the
State of Stick platform itself. The private State of Stick codebase contains
the important shared IP and authority for identity, organizations, roles,
entitlements, commerce, payments, physical identity, attribution, and governed
AI policy. Those implementation details are intentionally kept out of this
repository. Golf integrates with that platform through typed contracts and
verified assertions; it does not recreate the platform or expose its secrets.

> **IP boundary:** Treat this repository as a vertical product layer, not a
> copy of the State of Stick platform. Never add private platform source,
> credentials, internal algorithms, or production identity details here.

## The short version

Golf is played in a physical place, but the useful context of a round is often
scattered across a scorecard, tee sheet, clubhouse conversations, league
spreadsheets, sponsor materials, and personal memory. State of Stick Golf gives
those moments a shared structure:

```text
physical course moment
        ↓ tap, scan, service request, or verified interaction
golf context
        ↓ course, hole, round, event, league, or operator record
useful experience
        ↓ passport, score context, service, insight, or return visit
permissioned network memory
```

The central idea is simple: **a small physical object can become a doorway to
the right digital action at the right moment.**

## What this codebase does

The Astro frontend and Cloudflare Worker together provide the first golf
network slice:

- golfer passports for rounds, courses, achievements, collections, and season history;
- course pages with hole-by-hole context, approved knowledge, announcements, services, and connected touchpoints;
- round capture with official strokes kept separate from Stableford or other format points, tap verification, witness confirmation, and audit history;
- portable leagues and matches that can span multiple eligible courses;
- operator workflows for course claims, publication, tee-time activation, round review, services, tap points, announcements, and recorded activity;
- a provider-neutral intelligence layer for round summaries, trends, practice suggestions, course questions, and operator explanations;
- an offline-friendly round path using browser IndexedDB for pending work and retry-safe synchronization;
- D1-backed records with Durable Object overlays for live coordination;
- a platform outbox so golf events can be forwarded to State of Stick for downstream identity, analytics, entitlement, and commercial workflows.

The current pilot uses demonstration data and local/static surfaces in several
places. A route, course name, score, map, or operator screen is not evidence of
a live partner, production adoption, revenue, or independently validated golf
data.

## How golf works here

### 1. The course becomes interactive

State of Stick's physical identity layer, **StickLink**, can be represented by
small, numbered, course-specific objects: flagstick medallions, tee markers,
cart tags, halfway-house signs, pro-shop markers, tournament signage, or other
durable touchpoints.

The physical object is intentionally simple. The value comes from the context
behind it: the course, hole, operator-approved content, current round, service
catalog, event, or player permission. A tap can open a hole, record an
interaction, surface a local rule, request a service, save a memory, or connect
the golfer to the next useful action.

The application models the touchpoint and its audit trail. Fabrication,
materials, finishing, attachment, NFC encoding, and field installation remain
an external manufacturing and course-operations workflow. See
[`docs/physical-network-and-manufacturing.md`](docs/physical-network-and-manufacturing.md).

### 2. The golfer owns the ongoing story

The golfer's passport is a golf read model attached to a State of Stick person
identity. It can collect completed rounds, courses, holes, achievements,
verified moments, league participation, and physical objects encountered.

Golf does not create a second account or identity authority. The production
State of Stick session supplies the verified person, organization, role,
entitlement, and session context; Golf stores golf records and references to
those identities.

### 3. The round keeps different kinds of truth separate

| Record | Meaning |
| --- | --- |
| Official strokes | The recorded score or an approved external authority's result |
| Format points | Deterministic Stableford, match-play, skins, or other competition context |
| Physical proof | Tap, witness, course, operator, or verification events |
| Passport history | The golfer's durable memory of participation and achievement |
| Intelligence | Advisory interpretation of authorized records |

A tap, player note, AI response, or self-report never silently becomes an
official score, handicap, yardage, rule, standing, or payment outcome.

### 4. Courses and operators get a useful network layer

Operators can claim and review a course, approve content and geometry, publish
a course profile, manage service offerings, register touchpoints, review round
and tee-time activity, and understand recorded participation. The system is
designed to sit alongside a tee sheet, POS, handicap authority, and course
management suite — not replace them.

## The operator opportunity: an AI layer for the whole course

The operator console is more than an admin screen. It is the place where a
course can turn approved facts and recorded activity into better decisions and
faster service. The long-term opportunity is a golf operating layer that works
across a single course, a multi-course group, a league, an event, or a sponsor
program.

| Operator need | What Golf can provide | AI's bounded role |
| --- | --- | --- |
| Keep the course accurate | Review course facts, geometry, local guidance, services, and announcements before publication | Draft summaries, identify missing or stale coverage, and surface questions that need a human answer |
| Help golfers in the moment | Course questions, hole context, service requests, tee-time activation, and touchpoint destinations | Answer from approved course knowledge; refuse unsupported conditions or official claims |
| Run the daily operation | Round review, verification queues, service fulfillment, tee-time status, and audit history | Summarize queues, group repetitive requests, and highlight items needing attention without taking staff action |
| Understand demand | Taps, unique golfers, active rounds, service requests, completed services, questions, and unanswered topics | Explain recorded patterns and suggest where an operator may investigate next |
| Operate events and leagues | Announcements, portable matches, standings, check-in, course eligibility, and physical activations | Prepare event briefs and explain published records; never decide winners or alter standings |
| Measure partner value | Approved sponsor moments, physical touchpoints, participation, service activity, and attributable interactions | Produce provenance-backed activity summaries; never invent reach, revenue, or campaign performance |

That creates a global picture of the technology:

```text
golfer → course touchpoint → approved golf context → operator action
   ↑             ↓                    ↓                    ↓
passport     physical proof      Golf Intelligence     analytics
   ↑             ↓                    ↓                    ↓
league / event ← service layer ← course knowledge ← State of Stick platform
```

The same foundation can support public course discovery, a resort portfolio,
an amateur league, a tournament, a sponsor activation, a golf manufacturer, or
a connected destination. The vertical remains golf-specific while the private
State of Stick platform supplies the reusable identity, physical-object,
organization, entitlement, commerce, attribution, and AI-policy capabilities.

See [`docs/operator-ai-and-global-opportunity.md`](docs/operator-ai-and-global-opportunity.md)
for the fuller operator, partner, and expansion view.

## AI and golf intelligence

The intelligence layer is designed for useful, bounded assistance rather than
AI theater.

Today, the default provider is a deterministic `rules-engine`. It calculates
and explains only from authorized golf records and emits provenance with every
result:

- source facts and references;
- interpretation;
- confidence and verification status;
- timestamp;
- rule version and provider identifier.

The Worker also defines a bounded course assistant path for Cloudflare Workers
AI. It can use published course knowledge as data, answer a narrow course
question, and fall back to deterministic behavior when model access or approved
context is unavailable. It cannot write scores, standings, prices, orders,
announcements, or staff actions.

The assistant refuses private-player questions, medical or gambling advice,
unsupported live conditions, and unverified official claims. Prompt text is not
treated as authority and is not persisted as raw insight data. Read the full
boundary in [`docs/golf-intelligence.md`](docs/golf-intelligence.md).

## Manufacturing and the physical product

The physical layer is where the software meets the course. A practical
production loop looks like this:

```text
course / brand brief
        ↓
numbered StickLink object and approved destination
        ↓
material, finish, encoding, attachment, and installation plan
        ↓
operator approval and touchpoint registration
        ↓
golfer interaction → golf record → passport / service / insight
```

The product direction favors durable, manufacturable objects over complicated
installations: engraved or printed markers, metal or weather-resistant tags,
course emblems, cart or service identifiers, and event-specific pieces. The
manufacturing decision depends on the environment and run size — for example,
UV exposure, water, impact, adhesive or mechanical attachment, NFC/RFID
compatibility, cleanability, and replacement cost.

This repository supports the digital side of that loop: stable identifiers,
touchpoint records, approved destinations, verification events, organization
boundaries, and provenance. It does not claim that a material has been sourced,
a vendor selected, an object certified, or a course installation completed.

## Architecture and ownership

```text
                 private State of Stick platform
        identity · organizations · roles · entitlements
        commerce · payments · physical identity · policy
                              │
                 verified identity / platform contracts
                              ▼
       Astro Pages frontend ───────► Cloudflare Worker API
       static golf experience          golf-specific actions
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                        D1 authoritative              Durable Objects
                       golf records and audit          live overlays
```

Golf owns courses, holes, rounds, score context, leagues, events, matches,
course knowledge, services, tee-time activation, and golf intelligence.

State of Stick remains authoritative for person identity, organizations,
membership and roles, entitlements, billing, payments, physical identity,
attribution, and governed AI policy. The integration contract is documented in
[`docs/platform-integration.md`](docs/platform-integration.md) and
[`docs/platform-identity-contract.md`](docs/platform-identity-contract.md).

The current development seam uses `GOLF_WRITE_TOKEN` for controlled local/test
work. Production onboarding is not complete until the verified State of Stick
session or signed service assertion is connected and cross-tenant authorization
tests pass.

## Product surfaces

| Route | What it demonstrates |
| --- | --- |
| `/` | Connected-fairway product story |
| `/round/cedar-ridge/` | Live scorecard and round trust model |
| `/passport/` | Golfer-owned passport and achievements |
| `/course/cedar-ridge/` | Connected course experience |
| `/tap/cedar-ridge/turn-house/` | Physical touchpoint interaction |
| `/operator/` | Course-side operations |
| `/network/` | Golfer, course, and physical network |
| `/league/anywhere/` | Portable multi-course season |
| `/discover/` | Provider-neutral course discovery |
| `/intelligence/` | Provenance-first golf intelligence |
| `/pitch/` | Plain-language product brief |

## Repository map

- `src/pages/` — Astro product surfaces and route experiences
- `src/lib/` — golf domain logic, scoring, network, maps, services, AI, and contracts
- `worker/src/` — Cloudflare Worker API and platform adapters
- `migrations/` — ordered D1 schema and integration migrations
- `docs/` — architecture, identity, intelligence, maps, operations, and product notes
- `tests/` — deterministic regression tests for the golf domain and API foundations
- `public/` — brand assets, artwork, video, crawler files, and response headers

## Intentional non-goals

State of Stick Golf is not GHIN, a governing-body handicap authority, a
bookmaker, wagering software, a prize-pool ledger, a payment wallet, a POS, a
settlement system, or a replacement tee sheet. It does not create odds, entry
fees, payout balances, or prize mechanics.

It also does not expose the private State of Stick platform implementation.
That separation is part of the architecture and part of the IP strategy.

## Validate locally

From the repository root:

```bash
npm test
npm run check
npm run api:check
npm run build
git diff --check
```

Do not commit `dist/`, `.astro/`, `.wrangler/`, `.dev.vars`, credentials,
identity secrets, payment secrets, or production environment files.

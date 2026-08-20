# StickLink Golf implementation plan

## Product objective

Build a portable golf season where a player can compete with people playing at other participating courses while each course retains its own operations, identity, and scoring context.

The first product is a network layer, not a replacement for GHIN, Golf Genius, tee-sheet software, or club-management software.

## First vertical slice

The Great Lakes Open is the first product-shaped slice in the pilot:

- one Stableford season;
- multiple approved courses;
- player-owned passport identity;
- round records with explicit trust levels;
- live standings;
- course-linked StickLinks;
- no wagering or cash-prize mechanics;
- local mock data until the domain is validated.

## Build phases

### Phase 1 — Domain and experience (now)

- Model portable leagues, cross-course round records, standings, and trust levels.
- Make the player and course relationship visible in the UI.
- Keep official strokes, format points, physical evidence, and passport history separate.
- Validate the concept with golfers, commissioners, and course operators.

### Phase 2 — Persistent pilot

- Add authenticated golfer and operator accounts.
- Persist organizations, courses, leagues, rounds, scores, and interaction events.
- Add consent and privacy controls.
- Replace static standings with event-derived standings.
- Add a commissioner approval workflow and dispute history.

### Phase 3 — Physical network

- Register course and event StickLinks.
- Record signed tap events with course, hole, object, actor, and timestamp context.
- Use Standard StickLink for general participation and StickLink Verify for higher-trust events.
- Provide QR fallback and offline-safe submission behavior.

### Phase 4 — Partner integrations

- Start with CSV/manual imports and outbound webhooks.
- Add a narrow integration contract for event roster, round, score, and approval events.
- Approach Golf Genius and other providers after a live pilot has repeat usage.
- Treat GHIN/WHS as official handicap context, not a system to replace.

### Phase 5 — Network expansion

- Add regional seasons, course trails, teams, sponsor challenges, and charity programs.
- Add ranking and qualification rules only after trust and dispute workflows are proven.
- Keep entry fees, payouts, and regulated prize mechanics out of the first release.

## Core invariants

1. A StickLink interaction proves interaction context, not a golfer's exact strokes.
2. Every score has a visible trust level and immutable event history.
3. A course can participate without replacing its existing systems.
4. A golfer can export or carry their passport history across organizations.
5. State of Stick owns identity, physical links, consent, commerce, and attribution; Golf owns courses, rounds, leagues, events, and scoring context.

## Pilot success gates

- 3–5 participating courses;
- 50–100 golfers;
- 6-week season;
- 70% round-completion target;
- fewer than 5% disputed round records;
- at least 25% of players return for a second season or event;
- one commissioner and one course willing to pay for the next season.

## AI implementation track

AI is an orchestration layer over trusted golf data, not a replacement for course staff, rules officials, handicap authorities, or commissioners.

### First useful AI capabilities

- Answer course, event, league, and player questions from approved current sources.
- Recommend courses, leagues, playing partners, challenges, and next actions using consented passport context.
- Explain standings and identify incomplete or contradictory round records for human review.
- Surface live course conditions, safety notices, accessibility information, and event changes.
- Help commissioners create pairings, reminders, formats, and season communications.
- Summarize operator activity across tee sheets, events, physical touchpoints, feedback, and maintenance signals.

### AI guardrails

- Every answer must identify source and freshness where practical.
- AI recommendations must be distinguishable from official scores, rules decisions, and confirmed course information.
- No automatic score rejection, handicap change, prize decision, payment action, or safety override without an authorized human or system confirmation.
- Personal history and cross-course data require explicit consent and revocation support.
- Use retrieval and tool calls against approved course and State of Stick records; do not rely on ungrounded model memory for live golf operations.

## Current boundary

The current repository is a static Astro pilot. Phase 1 is intentionally local and demonstrative. No production claims, real golfer tracking, external integration, payment flow, or official score submission is implied until the persistent pilot is separately implemented and verified.

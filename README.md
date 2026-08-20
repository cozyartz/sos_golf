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
- `/pitch/` — plain-language owner brief for the golf vertical

## Build boundary

The current build uses local mock data only. The scorecard demonstrates the product boundary: official strokes remain distinct from format points, physical verification, and passport history. No production claims, golfer tracking, sponsor attribution, or payment flows are implied by the demo.

## Platform boundary

Golf is the vertical experience, not a second platform. In a connected implementation, State of Stick remains the source of truth for identity, organizations, physical StickLinks, commerce, payments, entitlements, and attribution. This application owns golf-specific concepts such as courses, holes, rounds, rulesets, leagues, events, challenges, and score context.

The product is designed for participation, discovery, sponsor activation, and course commerce. It does not implement wagering, odds, prize pools, payout balances, or entry-fee-to-prize mechanics.

## Implementation plan

The build sequence for the portable golf network is documented in [`docs/implementation-plan.md`](docs/implementation-plan.md). The first product slice is a multi-course season with explicit score trust levels and a player-owned passport.

## Owner thesis

The golf vertical should be led by someone who understands golfers and course operators. The opportunity is to make the game more playful and welcoming while giving courses measurable ways to earn through subscriptions, event programs, sponsor activations, commerce attribution, and physical course-linked products.

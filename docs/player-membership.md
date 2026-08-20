# Golfer membership and AI access

Golf should not require a paid subscription to start a round. The network
should use a free State of Stick identity for persistent play, then charge for
deeper personal intelligence, advanced competition, and league tools.

## Proposed levels

- **Network Member** — free identity, saved rounds, Golf Passport, public
  leagues, cross-course participation, basic Golf Agent, and basic personal
  insights.
- **Player Plus** — proposed paid tier for deeper round analysis, practice
  suggestions, season analytics, private leagues, and a larger Golf Agent
  allowance.
- **Pro Golfer** — proposed paid tier for advanced competition, custom
  challenges, expanded analytics, and higher AI usage.
- **League Pass** — proposed league or season access that may be paid by a
  commissioner, course, sponsor, or player group.

The definitions live in `src/lib/membership.ts`. They are product definitions,
not live entitlements or a price list.

## AI charging boundary

State of Stick should own golfer subscriptions, Stripe customers, entitlements,
AI usage meters, cancellation, and spend ceilings. Golf should request an
entitlement decision and provide golf-specific context. It should not create a
second golfer billing system.

The initial model should include an allowance rather than charge per prompt:

```text
Network Member → small monthly allowance
Player Plus    → larger allowance
Pro Golfer     → highest allowance
Course sponsor → basic course questions may be covered
```

Overage should be disabled by default until an explicit opt-in exists. AI
access must fail closed when the golfer is unauthenticated, the entitlement is
missing, or the usage ceiling is reached.

## Course-sponsored access

A Connected Course may sponsor basic course guidance for golfers who have not
paid for Player Plus or Pro. This is the adoption loop: the course pays for the
operator product, the golfer receives a useful first experience, and the
golfer can upgrade for personal depth.

Paid membership increases usage and personalization. It does not make the AI
more authoritative. Official scores, handicaps, standings, course rules,
prices, payments, and orders remain governed records or human-approved
actions.

All pricing and live assignments remain proposed until the State of Stick
commerce and entitlement integration is implemented and reviewed.

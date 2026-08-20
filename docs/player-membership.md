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

The current pricing test ranges are Player Plus at $5–$8 per month ($48–$72
per year) and Pro Golfer at $10–$15 per month ($96–$144 per year). These are
deliberately test ranges, not published prices. The first paid experiment
should test annual conversion and retention with a small group before adding
more tiers.

The recommended monetization order is:

1. **Connected Course revenue first.** Courses pay for the operator console,
   approved course content, tap/service workflows, analytics, and the ability
   to sponsor a basic golfer experience.
2. **Golfer depth second.** Keep scoring, passport, public participation, and
   a useful starter Golf Agent allowance free. Charge for deeper personal
   analytics, practice suggestions, season views, private leagues, and custom
   competition.
3. **League and event programs third.** Charge a commissioner, course, sponsor,
   or league for a defined season or event package rather than forcing every
   casual golfer into a subscription.

This gives courses a reason to help acquire members and reserves golfer
payments for durable personal value.

## Suggested operator pricing test

The current product contract can support this simple offer:

- **Network Course — $0:** public profile, approved course facts, discovery,
  and participation in the network.
- **Connected Course — test at $249–$499/month per location:** tap/QR
  touchpoints, service requests, operator analytics, Golf Agent context, and
  course-controlled publishing.
- **Implementation — test at $500–$2,500 one time:** course setup, approved
  content, touchpoint mapping, menu/services, and staff walkthrough.
- **Commerce — add only after proof:** consider a small transaction or
  activation fee when State of Stick demonstrably drives an order, event, or
  sponsor program. Do not make this the first purchasing objection.

These ranges are internal pilot hypotheses, not market facts or published
prices. The sales test should ask one course to choose between a lower monthly
price with a defined pilot scope and a higher price with more implementation
support. The decision metric is retained monthly revenue and measurable
operator value, not sign-ups alone.

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

The deterministic access evaluator in `src/lib/membership.ts` is a shared
product contract, not a billing lookup. It does not read Stripe or trust a
client-supplied plan. The future platform adapter should sync approved
assignments into the golf projection and record usage with an idempotent event
key.

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

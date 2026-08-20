# State of Stick platform integration

State of Stick Golf is a vertical product on the State of Stick SaaS platform.
Golf owns golf workflows and operational records. State of Stick remains the
authority for identity, organization membership, entitlements, billing,
consent, platform analytics, and governed AI policy.

## Ownership boundary

```text
State of Stick platform
  identity → organization → membership/role → entitlement → billing → analytics
                              ↓
Golf vertical
  course → approved content → tap points → rounds → leagues → services → Golf Agent
```

Golf must not create a second golfer identity, organization membership system,
platform billing ledger, or independent analytics policy.

## Current implementation status

Implemented in this repository:

- Golf records carry State of Stick person and organization identifiers.
- Course claims require an organization and actor context and remain review-only.
- Golf operational records remain in the golf D1 database.
- Migration `0012` creates a retry-safe platform event outbox.
- Course claims, round submissions, tap interactions, and service requests now
  write a corresponding outbox event in the same D1 transaction.
- Course publication is explicit: a course is not public or SEO-discoverable
  until an authorized operator publishes it.
- Event payloads deliberately avoid raw question text and retain only the
  minimum facts needed for platform routing and analytics.

Still required before production onboarding:

1. Replace the temporary `GOLF_WRITE_TOKEN` plus caller-supplied identity
   headers with a verified State of Stick session or service assertion.
2. Resolve organization membership and golf role permissions centrally.
3. Forward the outbox through the approved State of Stick Worker/Queue boundary
   and mark events forwarded only after an idempotent acknowledgement.
4. Replace golf-local billing activation with State of Stick entitlement checks.
5. Add cross-tenant authorization tests for every golf read, write, export,
   operator, AI, and billing path.
6. Confirm the Cloudflare account and service binding for the production domain
   before adding a Worker-to-Worker binding.

The typed contract for the verified identity and entitlement snapshot is now
defined in `src/lib/platform-contract.ts`, with the integration boundary
documented in `docs/platform-identity-contract.md`. This is a contract and
fail-closed decision layer, not proof that the central State of Stick session
service has been connected in production.

## Course onboarding

The production sequence is:

1. A person authenticated by State of Stick requests a course claim.
2. State of Stick confirms the organization and actor role.
3. Golf stores the pending claim and emits `golf.course_claim_requested`.
4. An authorized operator reviews facts, services, geometry, and publication.
5. Golf publishes only approved course content and creates the course SEO page.
6. Golf emits interaction, round, service, and agent events to the platform.
7. State of Stick calculates analytics, usage, entitlements, and commercial
   eligibility.

The current demo data is not evidence of a live course partnership, traffic,
revenue, or production adoption.

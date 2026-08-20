# State of Stick identity and entitlement contract

Golf must not treat caller-supplied identity headers or plan keys as proof of
access. The production adapter must verify a State of Stick session or signed
service assertion, then construct the typed claims in
`src/lib/platform-contract.ts`.

## Identity claims

The verified adapter supplies:

- `personId` — the State of Stick golfer identity.
- `organizationId` — present for operator or organization-scoped actions.
- `roles` — the central role set used for course/operator authorization.
- `sessionId` — correlation and revocation reference.
- `issuedAt` and `expiresAt` — replay and freshness boundary.

Golf should never accept an unsigned JSON object as these claims. The adapter
must verify the session/assertion with the central State of Stick authority,
check expiry and revocation, and then pass only the verified result to golf.

## Entitlement snapshot

State of Stick remains authoritative for the golfer's plan, status, feature
set, AI allowance, and synchronization time. Golf can use the snapshot to
make a deterministic feature decision, but cannot grant a plan from a browser
request or create a second Stripe subscription.

The fail-closed rule is simple:

```text
no verified identity          → deny
expired/revoked identity      → deny
missing entitlement snapshot  → deny
past_due/cancelled plan       → deny
AI allowance at zero          → deny AI request
```

The temporary `GOLF_WRITE_TOKEN` seam remains available for development and
controlled tests only. Production onboarding is not complete until the adapter
is connected and cross-tenant authorization tests pass.

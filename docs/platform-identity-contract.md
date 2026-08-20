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

## Signed assertion handoff

The current Worker includes a fail-closed HMAC handoff for the first State of
Stick adapter. State of Stick issues an assertion in the
`x-state-of-stick-identity-assertion` header using this compact format:

```text
base64url(JSON claims).base64url(HMAC-SHA256(payload, shared secret))
```

The shared secret is stored only as the Worker secret
`STATE_OF_STICK_IDENTITY_SECRET` and must be at least 32 characters. Golf
verifies the signature, issuer, claim shape, issued/expiry window, and any
caller identity headers before an API route runs. In production, a missing or
invalid assertion fails closed. The existing `GOLF_WRITE_TOKEN` path remains
development-only and is not an identity system.

The central adapter still needs to issue this assertion after verifying the
State of Stick session and revocation state. No browser-controlled plan,
person, organization, or role value is trusted by Golf.

Golf now canonicalizes the legacy identity headers from the verified claims
before route dispatch, and operator routes require an organization claim plus
an operator-capable central role (`operator`, `operator_admin`,
`organization_admin`, `owner`, or `staff`). A golfer service request remains a
player action and is not covered by that operator gate. Migration `0018`
provides an optional session-revocation projection; when State of Stick syncs
a session row, Golf denies it after expiry or revocation. Missing rows remain
valid because the signed assertion is the authority until the sync projection
is populated.

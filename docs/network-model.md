# State of Stick Golf Network model

Phase 2 extends the Phase 1 golf application without creating a second identity system.

## Identity and privacy

`state_of_stick_person_id` and `state_of_stick_organization_id` remain external identity and organization references. Golf stores golf records keyed to those references; it does not create passwords, accounts, or a parallel membership directory. Public player profiles are opt-in through the existing privacy boundary. Private league standings require the requesting person to be enrolled.

The player passport is a read model: rounds, courses, holes, verified rounds, personal bests, streaks, league memberships, and activity are derived from authoritative D1 records. The current API exposes passport details only to the matching verified golfer; a future shareable profile must use a separate explicit public projection and may not reuse the private passport query.

## Round trust

Round lifecycle is `draft → in_progress → submitted → verified` or `rejected`. Tap verification and witness confirmation are evidence events, not proof by themselves. A round can become `verified` only after a persisted `operator_review` or `course_confirmation` event. Every status transition is written to `golf_round_audit_events`; duplicate client submissions are rejected or reconciled by `client_round_id`.

## Courses and locations

Course coordinates are explicit operator-seeded records. Discovery does not require a geocoder. The `CourseLocation` contract leaves room for open references or later provider adapters while retaining the source label. Nearby results must be computed only when the requesting player explicitly shares location; course browsing does not require it.

## Live state

Durable Objects can carry live leaderboard, round status, event update, and check-in events. D1 remains authoritative for rounds, verification, standings, and published results. A cold or unavailable Durable Object returns the D1 standings as the safe fallback.

## Operator boundary

Operator writes require the existing Worker write-auth seam plus organization and actor headers. Map approval, announcement creation, score review, and future course editing all append operator audit events. Production authorization must replace the temporary service token with verified State of Stick organization membership before broad operator access is enabled.

## Portable matches

A league match is independent of the course. Each participant submits one
verified 18-hole round from an eligible league course, along with the tee set
and a handicap index whose source is recorded. The deterministic competition
engine applies course handicap and hole-by-hole handicap strokes before
comparing net stroke-play or Stableford results; it never asks AI to decide
who won. Player-entered handicaps remain provisional until an approved
governing-body provider or commissioner workflow supplies the value.

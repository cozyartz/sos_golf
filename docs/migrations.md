# Migration history

- `0001_golf_foundation.sql` — courses, holes, tees, rounds, scores, trust events, leagues, and seeded pilot records.
- `0002_free_first_map_foundation.sql` — provider-neutral course geometry, imagery metadata, StickLink locations, operator approval fields, and client round deduplication.
- `0003_state_of_stick_network.sql` — passport read-model inputs, explicit coordinates, round lifecycle expansion, verification/audit events, league enrollment and visibility, announcements, and operator audit history.
- `0004_golf_intelligence.sql` — deterministic/provider-neutral insight records, source references, and user feedback with organization scope.
- `0005_operator_services.sql` — operator-managed service catalog, golfer service requests, fulfillment states, and request event history. Payment/POS settlement remains outside this migration.
- `0006_course_knowledge_and_taps.sql` — approved course knowledge records, tap-point lifecycle fields, and tap-event ledger for grounded guidance and physical interaction.
- `0007_course_question_signals.sql` — privacy-preserving question categories and answerability signals for operator content improvement.
- `0008_portable_matches.sql` — cross-course league matches and verified round entries with provisional course-handicap normalization.
- `0009_match_handicap_provenance.sql` — explicit handicap index and source fields so competition trust is visible and auditable.
- `0010_course_claim_requests.sql` — free-first course onboarding requests with explicit operator review and no automatic publishing.

Wrangler applies all pending migrations in order. Review the complete pending set before applying against D1. Phase 2 changes are source-only until an operator explicitly approves local or remote migration application.

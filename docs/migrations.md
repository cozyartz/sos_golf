# Migration history

- `0001_golf_foundation.sql` — courses, holes, tees, rounds, scores, trust events, leagues, and seeded pilot records.
- `0002_free_first_map_foundation.sql` — provider-neutral course geometry, imagery metadata, StickLink locations, operator approval fields, and client round deduplication.
- `0003_state_of_stick_network.sql` — passport read-model inputs, explicit coordinates, round lifecycle expansion, verification/audit events, league enrollment and visibility, announcements, and operator audit history.

Wrangler applies all pending migrations in order. Review the complete pending set before applying against D1. Phase 2 changes are source-only until an operator explicitly approves local or remote migration application.

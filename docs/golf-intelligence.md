# State of Stick Golf Intelligence

State of Stick Golf Intelligence is a provider-neutral service boundary. The current provider is `rules-engine`, a deterministic fallback that uses only authorized golf records. A paid model is not required for the product to remain useful.

Every result carries:

- source facts and source references;
- generated interpretation;
- confidence and uncertainty;
- generated timestamp;
- rule version and provider identifier;
- `advisory` or `verified` status.

Official strokes, handicap indexes, yardage, course conditions, verification status, league results, and financial outcomes remain authoritative outside the intelligence layer. Intelligence may explain an authoritative result, but it cannot create or change one.

The assistant is intentionally narrow. It answers only from the requesting player’s authorized records, ignores instruction-like content in player notes, and refuses private-player, medical, gambling, unsupported live-condition, and unverified-official questions. Prompt text is not persisted in the D1 insight tables; only the result provenance and optional user feedback are stored.

Future providers can implement the `GolfIntelligenceService` interface and write the same provenance fields. Provider selection must remain a configuration and review decision, never an assumption in golf business logic.

## Cloudflare-controlled Golf Agent

The production Worker now has a Workers AI binding. The course assistant builds
its prompt from published course knowledge only and sends that bounded context
to `@cf/meta/llama-3.1-8b-instruct`. The model is instructed to treat course
content as data, not instructions, and it cannot write scores, standings,
announcements, orders, prices, or staff actions. Refusal questions and missing
approved context stay on the deterministic rules-engine path. The response
records the provider and provenance so operators can distinguish model-backed
guidance from the fallback.

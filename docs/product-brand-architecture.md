# Product and brand architecture

The public product name is **State of Stick Golf**.

- **Parent brand:** State of Stick
- **Physical identity and verification:** StickLink
- **Intelligence layer:** State of Stick Golf Intelligence
- **Provisional tagline:** Every round becomes more valuable.

These values live in `src/lib/product.ts`, separate from golf business logic. A future standalone product name can change metadata without changing repository names, API paths, D1 identifiers, person references, organization boundaries, or physical verification records.

State of Stick remains the parent identity for now. StickLink remains the physical layer. Golf owns golf records and workflows while State of Stick remains authoritative for identity, organizations, entitlements, commerce, and attribution.

No future name should be adopted based on this code alone. Domain availability, trademark screening, legal review, and relationship to the State of Stick parent brand must happen before a standalone name or public claim is introduced.

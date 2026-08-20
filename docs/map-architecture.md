# Map architecture

StickLink Golf uses a provider-neutral map contract in `src/lib/map.ts`. The pilot can render a lightweight SVG/GeoJSON-compatible course diagram without a commercial map key. A future MapLibre adapter can implement the same `MapProvider` interface without changing course or round records.

## Free and open source

- The fallback course diagram is local SVG rendered by the application.
- Course geometry is stored as validated GeoJSON-compatible JSON text in D1.
- IndexedDB stores only pending round records in the golfer’s browser; it stores no secrets.
- Public course reads are cacheable and expose only operator-approved geometry.

Any future OpenStreetMap or other public-data layer must retain the source and comply with that source’s attribution and license terms. Attribution is data-specific, so the source label is part of every map layer and imagery record.

## Intentionally deferred

Planet, Vantor/Maxar, BlackSky, Google, Mapbox, Esri, paid AI providers, and required satellite tiles are intentionally not dependencies. The application displays `Imagery unavailable — course diagram shown` when no source exists. Imagery is never called live unless a source explicitly guarantees that property; the UI should say `imagery captured on [date]` when a capture date is known.

An imagery adapter only needs to provide provider name, imagery or tile URL, capture timestamp, resolution, cloud cover, license, coverage bounds, and processing status. Operator-uploaded or public/open references can be recorded as metadata before a cloud upload workflow exists.

## Authority and ownership

Official strokes, handicap, yardage, rules, and league outcomes remain authoritative in their existing records or integrated governing systems. Map geometry, imagery, StickLink points, and generated summaries are contextual. Geometry can never silently override scoring or handicap data. Public map reads include only `approved_by_operator = 1`; writes remain authenticated and organization-scoped.

Player location is opt-in and precise player trails are not exposed by default.

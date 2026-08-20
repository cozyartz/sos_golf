# League rules foundation

The first implementation keeps league money out of the system. There are no entry fees, prize pools, payouts, balances, or payment instructions. Any future money flow requires separate legal and payment review.

## Supported formats

- **Stroke play:** authoritative strokes are compared after the league’s declared tee and course eligibility rules.
- **Stableford:** each completed hole earns deterministic points from the hole par and recorded strokes: 5 for three or more under, 4 for two under, 3 for one under, 2 for par, 1 for one over, and 0 otherwise.
- **Match play:** the league records hole outcomes and match result separately from stroke totals. The current foundation exposes the format contract; a match ruleset must be declared before publishing results.
- **Skins:** the foundation records eligible hole outcomes and physical verification context. A production skins ruleset must declare tie carry-forward behavior before publication.

## Cadence and visibility

Leagues are `weekly` or `seasonal`, and `public` or `private`. Public standings are cacheable. Private standings require an enrolled State of Stick person identity. Enrollment is a D1 record with active, pending, withdrawn, and banned states.

## Trust and publication

Only accepted/verified rounds should contribute to published results. Self-reported, partner-attested, commissioner-approved, course-confirmed, and officially-integrated trust levels remain visible. Ties use competition ranking (`1, 1, 3`) and must not be silently broken by display order. A live Durable Object snapshot is an experience layer; D1 standings are the authority and fallback.

Course eligibility belongs to the league-course relationship, not to a global course override. The course’s official par, tees, rating, slope, and yardage remain outside generated league suggestions.

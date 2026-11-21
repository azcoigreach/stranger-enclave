# Rebuild established buildings in place

November 21, 2026. Branch `fix/rebuild-original-sites`, based on merged dev commit `88d5af08753b02b871301329f298f567a69a7c3c`. This change is uncommitted and has not been promoted to shared branches.

The user reported that killed carriers/workers were replaced, the tower killed a spawned invader, and resources were no longer accumulating on the ground. These are user-reported manual checks, not newly instrumented recovery/defense scenarios. The remaining reported issue was that destroyed buildings were replaced at new locations.

## Behavior

The old planner retained a search cursor and structure counts, not building locations. Losing a structure therefore resumed the search at another tile. The new `planning.layout` module captures established types and coordinates every tick, including owned sites and accepted new placements. Missing buildings are recreated at their saved position before expansion resumes. Matching buildings/sites prevent duplicates. Saved data is plain, deduplicated, versioned, and retained through missing vision and global resets.

Reconstruction honors threat, site-cap, room-limit, and CPU gates. Engine construction errors retain the saved tile and report the failure instead of relocating. Existing layout capture continues even when optional planning is deferred. Last-spawn loss can create a replacement site without a live spawn anchor; surviving harvesters remain valid access origins so mining can fund rebuilding. Full recovery still requires a viable surviving workforce.

## Automated evidence

Failing regressions reproduced extension/tower relocation and absence of last-spawn reconstruction. A separate failing regression found that mining stopped when all spawn access origins disappeared. Tests now cover these cases plus accepted-site persistence, duplicate prevention, rejected-placement retention, ownership, neutral roads, missing vision, low-CPU observation, and RCL/threat/site/CPU gates.

`npm run validate` passed in staging and after installation: all **97 tests**, strict syntax/import/JSDoc checks for **21 modules**, and independent-process replay equivalence. Replay SHA-256: `c87981e1b96a880e31b54fcd5f63dc82febaee49a61f6874eabfea1cec7e11d5`. Existing expected replay actions were not regenerated. The added fixture explicitly materializes successful construction-site intents before later ticks; it does not simulate the full construction engine or creep lifetime budget.

The [official construction API](https://docs.screeps.com/api/#Room.createConstructionSite) is the authority for tile legality and controller/site limits. Return-code acceptance is not treated as completed construction; later observations determine whether a building/site exists.

## Live activation

The additive layout module and spawn-loss mining support were staged and validated, installed, and source-verified before planner/main callers were activated. At tick **43846**, the live `W6N8` colony had saved **22 positions: one spawn, one tower, and 20 extensions**, all matching observed structures. Layout version was 1; bot memory remains schema 2. There were no bot alerts. See the [live snapshot](2026-11-21-building-reconstruction-live.json) and [runtime source manifest](2026-11-21-building-reconstruction-modules.sha256).

No live building was destroyed to force this test, and no world or memory edits were used to seed the saved layout. Live evidence verifies adoption of the existing layout; exact destruction/reconstruction behavior is demonstrated by deterministic fixtures. Locations lost before tracking began cannot be inferred from the former cursor-only state. Deliberately removed saved sites are recreated; intentional redesign requires explicit plan revision. Engine/mod pinning and sustained destruction/recovery scenarios remain future validation work.

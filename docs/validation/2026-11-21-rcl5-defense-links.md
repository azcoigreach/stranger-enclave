# RCL 5 links, room envelope, and defensive clearance — November 21, 2026

Work is on `feature/rcl5-perimeter-links`, based on `e5e551902a9c010dd07b625a76292f6a4834ebd6`, with uncommitted runtime changes. `main` and `dev` were not modified. The [source manifest](2026-11-21-rcl5-modules.sha256) identifies the 38 installed root modules. The [revised layout map](2026-11-21-perimeter-proposal.png) uses the captured terrain fixture and observed layout at tick 114675. Future positions are reservations, not construction sites.

## Scope and corrections

This slice adds a storage/controller link pair, dedicated engineers, reserve-aware construction/repair budgets, rampart upkeep, and demand-sized adjacent remote operations. Returning carriers and ranged workers coordinate access; controller formations preserve short transit corridors. Empty controller workers can approach the receiver rather than waiting indefinitely for carrier delivery.

The first enclosure protected only 236 interior cells. User review rejected that restricted area and identified link-access obstruction. The replacement protects the broad viable interior first, then minimizes the barrier count for that protected area. Its 875 protected cells include 871 walkable cells plus enclosed natural objects. It uses 79 walls and nine private rampart passages. Friendly exit paths are bounded to four steps beyond their baseline; this is not a proof of globally optimal defense against every attack.

The initial mature footprint placed labs too close to the barrier. A deterministic regression failed at lab position (45,22). The revised planner and construction checks require new ordinary structures to be inside the enclosure, at least three Chebyshev tiles from every barrier and five tiles from room edges. These configurable planning setbacks leave two intervening cells between a building and a barrier at distance three. They are not assertions about engine-enforced minimums. Existing structures remain preserved.

The corrected live footprint reserves all 92 RCL 8 structure positions: 60 extensions, ten labs, three spawns, six towers, six links, storage, terminal, observer, power spawn, nuker, factory, and extractor. Its ten-lab group now occupies x33–36/y5–8. Both input labs are within reaction range of the outputs. The inset area contains 701 cells before subtracting resource working areas, routes, and occupied structures. Industry operation and higher-level source-link scheduling remain future work.

## Deterministic evidence

`npm run validate` passed in staging and the installed repository: **190 tests**, strict checks for **38 runtime modules**, and separate-process replay equivalence. Replay SHA-256:

`efe24576d1004d1fa0e56738651924bf8a9fc7292f5823fd5a890d38fa4883d9`

Historical expected action fixtures were not regenerated. Additive budget/layout fields change the complete-memory trace. Tests cover minimum-cut results against an independent exhaustive oracle, real-terrain access, current/future capacity, lab geometry, placement clearances, failed engine calls, link capacity/cooldown, delivery reservations, engineering reserves and strength tiers, remote resize hysteresis, ranged-worker yielding, and interrupted planning across resets. A further failing regression caught an adopted enclosure failing to resume a changed-clearance draft after its first tick; regeneration now continues to completion.

Migration tests require explicit matching approval and the current clearance policy. They cover outer construction before demolition, minimum barrier strength, funded nearby engineers, failed demolition retaining reconstruction coordinates, hostile/ownership/CPU/reserve/site-backlog gates, preservation of unrelated walls, and actual observed completion after serialization/global resets. A saved interior building position is rejected at construction time if it violates either clearance buffer. Mock action success does not simulate engine intent resolution, traffic, combat, or the passage-conversion gap.

## Live evidence and interventions

The observed home is W6N8 on the existing localhost world, RCL 5, with assigned CPU 100 and bucket 10,000. Runtime room and territory discovery remain dynamic. Engine/mod version pinning remains unresolved; these observations do not establish official-server equivalence. Observations span tick 106157 through tick 115344, across several staged code activations, not one unchanged-version soak.

| Observation | Recorded result |
| --- | --- |
| Before work, tick 106157 | Storage 225,160; 30 extensions, two towers; no links or barriers. |
| Tick 109267 | Both links observed built: hub (39,17), controller receiver (38,25). |
| Tick 109979 | Initial 34-tile enclosure observed complete. Its geometry was subsequently rejected in review. |
| After yielding correction, tick 112255 | Accepted transfer of 155 energy at tick 112207; completed 300-tick window harvested 6,000 and upgraded 3,167 energy. CPU average 7.19, p95 8.85; no alerts. |
| Corrected footprint, tick 114675 | `RESERVED`, policy `wall:3\|edge:5`, 92 buildings; every position meets setbacks. Barrier and retirement coordinates match the reviewed proposal exactly. |
| Approved migration, tick 115020 | User's explicit approval recorded through `approvePerimeter("W6N8",112976)`. |
| Tick 115093 | `BUILD_OUTER`, three queued rampart sites; 38 barriers present versus the original 34. All 23 approved interior walls retained; no conversion or retirement action yet. |
| Economy at tick 115093 | Storage 259,239; floor 18,000; target about 137,594; engineering target ten WORK. Last completed 300-tick window: harvested 5,830, upgraded 3,557 energy. One source left 170 energy in its last cycle; no claim of perfect collection. |
| Links/remote at tick 115093 | Last accepted transfer 155 at tick 115088. W6N9 remote delivered counter 378,081. Demand target two rooms, only one admitted; additional admission reports `NO_ECONOMIC_ROUTE`. |
| Performance at tick 115093 | 100 recent samples: average 6.85, p95 10.01, peak 11.06; bucket 10,000; no bot alerts. |

Interventions were code activation and the explicitly approved migration command. The command was queued through the user's game-console mechanism after checking the proposal identity, unchanged barrier/removal coordinates, and corrected clearance policy; it did not overwrite whole Memory. No server reset, resource injection, forced construction completion, or manual creep creation was used for this slice. Runtime source text was compared against the active server modules after activation.

At tick 115296, 61 of 88 exact-type outer barriers were observed, and the planner reported `WAIT_SAFE_ROOM` after a hostile appeared. Migration `lastAction` remained absent: no conversion or retirement had been requested. The old wall at (39,32) was missing and had a replacement construction site (`REBUILD_PLACED_constructedWall_39_32`); 22 of the 23 approved interior walls remained. The cause of that wall's loss was not observed. The hostile and wall loss are external events, not an assistant-injected test. This is live evidence of the hostile pause and established-position reconstruction, not a claim of raid survival. CPU average was 8.14, p95 10.38, peak 13.02, bucket 10,000, with no bot alerts.

By tick 115344 the hostile pause had cleared, outer construction resumed (`BUILDING_OUTER`), and all 23 old interior walls were again present. The outer ring had 67 of 88 exact-type barriers. No migration demolition request was recorded. This confirms the observed wall was rebuilt on its remembered tile.

## Migration status and limits

The approved scope retires 23 bot-planned interior walls and converts the wall at (16,2) to a rampart. The replacement still has the same 88 barrier coordinates after the building correction. Old protection stays until the outer ring reaches at least 5,000 hits. A funded engineer must be within build range before gate conversion, and the new gate must reach 5,000 hits before inner retirement. Existing inner ramparts remain passable and are not demolished. Nine new perimeter ramparts cost about 0.27 energy/tick in decay maintenance; retaining three interior ramparts makes eventual total upkeep about 0.36 energy/tick.

The engine cannot atomically exchange a wall for a completed rampart. Conversion has a short opening while construction resolves, restricted to peaceful conditions with an engineer present. The live migration is **in progress**, not yet evidence of successful conversion, complete retirement, 100,000-hit fortification, or raid survival. Later observations must confirm those outcomes. The 5,000-hit threshold is a staging safeguard, not a demonstrated combat target.

Milestones 2–3 remain open: threat-sized defenses and safe mode, sustained replacement-cycle profitability, interrupted remote recovery, mature industry operation, and claiming still need implementation or acceptance evidence. No commit, PR, or merge was created for this work.

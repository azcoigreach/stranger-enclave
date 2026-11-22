# Deterministic tests and regression gates

Use the Node version in `.node-version` and install the locked development dependencies with `npm ci --ignore-scripts`. Run `npm run validate` before activating game-code changes or submitting a PR. It runs:

1. Root-module syntax/import validation and strict JSDoc static checking.
2. Behavioral tests, fixture replays, and mutation checks through Node's test runner.
3. A separate-process replay comparison across timezones, insertion orders, and runtime resets.

The GitHub Actions workflow runs the same command on pushes and PRs targeting `dev` or `main`. The job is named `Deterministic regression`. The workflow must be committed and pushed before it can run remotely. Requiring that job for merges is a separate repository branch-protection setting; this change does not configure or claim that protection. Human review still owns approval and merging.

## What is controlled

Each harness instance owns a new VM, module cache, `Game`, and `Memory`. Tests specify `Game.time`, CPU readings, room objects, energy, and action return codes. Runtime code has no Node/network imports in the harness. Ambient `Math.random()`, `Date.now()`, `Date()`, and `new Date()` calls fail and are recorded, so a fault boundary cannot silently hide nondeterministic behavior from the replay assertions. If a future subsystem needs randomness, introduce an explicit reproducible seed and fixture expectations.

The replay fixtures supply tick inputs and expected outcomes; tests never derive expected outcomes from the implementation. After each fixture tick, memory is JSON-serialized and restored. A second mode also recreates the VM and reloads every game module, rebinding worker memory to the serialized state. This catches accidental dependence on disposable globals or stale memory references.

`npm run test:determinism` runs both fixtures in independent processes: UTC with ordinary insertion/order, and America/Phoenix with reversed fixture/worker insertion order and resets between ticks. It compares canonical traces containing intents, intent targets, spawn names/bodies, tasks, logs, and complete persisted memory. Object-key order is normalized; array order and values remain significant. It prints a diagnostic SHA-256 of the matching trace, not a golden digest to update blindly.

Execution-duration measurements in test output are not compared. Game CPU values are supplied by the fixture; no wall-clock performance thresholds decide whether these tests pass.

## Fixture scenarios

| Fixture | Behavior protected |
| --- | --- |
| `tests/fixtures/bootstrap-replay.json` | Initial rescue spawning, pending-spawn accounting, insufficient energy, full/empty worker transitions, action range errors followed by movement, failed-spawn retry, worker extinction, and dead-memory cleanup. |
| `tests/fixtures/priority-replay.json` | Delivery reservations shared within a tick and cleared on the next tick, upgrade/build allocation, urgent downgrade protection, and essential work under low CPU bucket. |
| `tests/fixtures/memory-v1.json` | Existing territory, colony state, worker memory, and counters survive schema migration. |

Replay input ticks can skip time. They are supplied observations, not an engine simulation. Successful action return codes do not automatically spend energy, complete movement, create creeps, or resolve construction. Each next-state change is explicit fixture data. Movement/path mocks and the constant subset are deliberately limited. Local engine scenarios remain required for real intent resolution, pathfinding, combat, CPU behavior, and sustained colony progression.

## Proving the assertions detect bugs

`tests/mutation.test.js` substitutes four faulty implementations in the test VM: oversized recovery bodies, disabled downgrade protection, duplicate delivery allocation, and falsely successful spawn reporting. Each must fail its intended behavior assertion. Syntax failures, missing source anchors, or unrelated runtime errors do not count as successfully detecting the bug.

Mutations never modify repository game files, including in this live-synchronized workspace. When a refactor changes a mutation's target, review and update that small sentinel explicitly. It must not silently stop running. These checks sample critical regressions; they are not a complete mutation-coverage claim.

## Rules for future changes

- For a bug fix, capture a minimal failing example before changing behavior, then keep that example as a regression test.
- Add assertions for observable outcomes and important failure paths. Prefer focused invariants over snapshots of incidental implementation details.
- When behavior intentionally changes, explain any fixture or expectation changes in the PR. Do not regenerate expectations from current bot output just to make tests pass.
- Keep fixtures independent of the active localhost world, network availability, wall time, unseeded randomness, and prior test execution.
- Preserve saved-memory fixtures when adding migrations. Compare behavior with and without a global reset for stateful systems.
- Add a saved local-server scenario when mock behavior cannot represent the bug accurately. Record engine/mod versions, code revision, seed where controllable, interventions, and outcomes.
- Stage changes outside the watched script directory. A passing unit suite is required evidence, not permission to skip appropriate local-server validation.

## Current evidence

On November 21, 2026, `npm run validate` passed all 47 tests and the separate-process trace comparison in both staging and the installed repository on `feature/core-bootstrap` (uncommitted work based on `ab1a8fe1485a15a957888bfe82678f8fbca0b7e4`). Both runs produced replay digest `81c738ba119bad671e0d4883b7b6eb34738e311346dbfe4b84ff34eb16a195af`. The four deliberately faulty variants were rejected by their intended assertions. All 12 game modules still matched the previous deployment manifest. The workflow was prepared locally; no remote CI result or protected-branch enforcement is claimed.

The subsequent [economy and controller-traffic validation](validation/2026-11-21-economy-throughput.md) expands installed checks to 66 passing tests across 19 game modules. `tests/throughput.test.js` covers measured-demand staffing, completed-event accounting, partial deliveries, and controller stations. `tests/controller-traffic.test.js` reproduces enclosed carriers and verifies coordinated escape, route exclusion, resets, fatigue, terrain/connectivity, and territory constraints. Its explicit position transitions do not substitute for the real engine. The replay digest after additive economy metrics is `b4ae49040f90cc0ef6031484830f1dc8a44bd473059e62462f304a16b0ac8adf`; fixture expected outcomes were not regenerated from runtime output.

The [tower refill correction](validation/2026-11-21-tower-refill.md) brings staging and installed validation to 72 passing tests. New cases reproduce both partial-fill cutoffs and cover capacity-derived top-ups, reset behavior, spawn/extension priority, full-tower fallback, shared reservations, and ownership.

[Mining-slot validation](validation/2026-11-21-mining-slots.md) expands staging and installed checks to 83 tests across 20 game modules. It covers one-slot contention for both mining roles, traveling reservations, occupancy, topology/connectivity changes, released slots, replacement staging/counting, and reset/insertion-order stability. Existing replay expectations and mutation assertions remain unchanged; the tower-ordering mock now supplies the real structure fields `id` and `pos` needed by geometry inspection.

The [controller corridor correction](validation/2026-11-21-controller-routing.md) raises staging and installed validation to 86 tests. A captured terrain fixture and independent eight-way search reproduce the 34-step detour, check a direct approach of at most 12 steps, and verify short delivery paths to eight occupied stations. Earlier fixed-square/range-two assertions were deliberately replaced by occupied-tile protection and legal upgrade-range assertions; trapped-carrier swap and reset checks remain.

[Building reconstruction](validation/2026-11-21-building-reconstruction.md) adds deterministic destruction/rebuild scenarios and brings validation to 97 tests across 21 game modules. Coverage includes saved-tile reconstruction after resets, last-spawn loss with continued mining, observation under low CPU, missing vision, site removal/deduplication, failed requests, RCL/threat/site/CPU gates, ownership, and rejected new placements. Existing replay expected actions remain unchanged.

### Expansion fixtures

`tests/expansion.test.js` covers storage placement and delivery priorities, observed intel and mining slots, complete-route admission, block restrictions, scouting targets across resets, optional-spawn budgets, remote crew sequencing, reservation actions, pause/retreat transitions, and resolved delivery accounting. The hostile fixture in `economy.test.js` now includes a real creep-body shape because intelligence observes hostile capabilities; its tower-before-worker outcome is unchanged. Partial storage delivery has a captured failing return-mode regression. Fixture movement and spawn calls are mocked; passing these tests does not prove engine travel or sustained remote income.

`tests/storage-buffer.test.js` reproduces storage starvation from continuous worker top-ups. It covers buffered deposits, low-worker refills followed by deposits across ticks/resets, demand-limited withdrawals, spawn/tower/builder/downgrade priorities, unavailable storage, and shared delivery reservations. Test actions remain mocked; live stored energy is checked separately after activation.

Storage distribution coverage also verifies autonomous distributor replacement/pending counts, source-drop-independent withdrawals, retained cargo between refills, storage loss, and shared tower/worker delivery priority. `controller-traffic.test.js` includes distributor escape from an enclosed upgrading formation. See [storage distribution evidence](validation/2026-11-21-storage-distribution.md).


### Perimeter, links, and defense budgets

`fortification.test.js` checks the minimum-cut solver against an independent exhaustive oracle, including diagonal lanes and the maximum-interior tie break. Captured terrain plus anonymized building/source positions test hostile exclusion, friendly exits, RCL 4 gating, reserve gating, saved coordinates and interrupted-search/global-reset behavior. `rcl5-economy.test.js` covers link cooldown/capacity and worker withdrawals, combined placement, rampart emergencies, tower attack priority, engineer reserves/replacement and shared strength tiers. `remote-budget.test.js` covers multi-operation migration, per-source delivery attribution, resize hysteresis, retirement, construction-time replacements, capacity diagnostics and frontier survey priority. Live engine observations remain separate from these mocked intent tests.

The RCL 5 terrain regression also reproduces a link-adjacent formation forcing a carrier detour. It requires five usable stations, at least one next to the receiver, a short through-route and identical station selection after reset. Engineers share existing carrier station avoidance and enclosed-formation recovery, covered by a separate regression.

`mature-envelope.test.js` verifies full future capacity, lab reaction distances, safe interior reservations, explicit wall/exit setbacks, construction rejection outside the allowed area, and layout regeneration across ticks, resets, and object insertion order. `yield-access.test.js` covers ranged-worker yielding, swaps, fatigue, reset behavior, and receiver approach. `perimeter-migration.test.js` exercises approval identity, clearance-policy checks, outer strength gates, funded engineer proximity, failed demolition, construction sequencing, unrelated-wall preservation, threat/ownership/CPU/reserve/backlog gates, and observed completion across resets. These are mocked safety transitions; they do not simulate engine combat or prove completed live migration. See [RCL 5 live evidence](validation/2026-11-21-rcl5-defense-links.md).

`layout-wall-policy.test.js` reproduces old-wall resurrection after manual deletion. It verifies approved/adopted perimeter filtering across resets, new off-plan wall observation, planned-wall and spawn reconstruction, unmatched approval protection, and wall-to-rampart type changes. The follow-up validation passes 196 tests.

The same reconstruction policy now covers ramparts: four additional tests check off-plan deletion before/after migration and resets, observation filtering, continued reconstruction of planned ramparts, and type matching. All 200 tests pass; the replay digest is unchanged.

`complete-route.test.js` uses captured oxygen-side terrain obstacles and an independent eight-way connectivity oracle. Supplied incomplete-search outcomes reproduce movement toward a dead end. Tests require a complete retry route, no movement for incomplete retries, cache/reset/fatigue behavior, retained boundary/occupied-worker restrictions, and recovery when vacant reservations plus displaced workers disconnect the route. The existing engineer formation test now inspects explicit search options and still verifies that normal movement cannot override escape. All 207 tests pass; the replay digest remains unchanged. See [oxygen-side routing evidence](validation/2026-11-21-oxygen-routing.md).

The engineer transit follow-up adds regressions for a distant temporary blocker, next-step occupancy and release, safe ranged-worker yielding without overridden intents, static fallback boundary/structure costs, and loaded movement capacity in engineer spawn requests at 300/550/800/1800 energy. All 212 tests pass; replay expectations and digest are unchanged. `tools/observe-local.py` now exposes actual fatigue and the last movement reason to distinguish expected waits from path failures.

See [engineer transit live evidence](validation/2026-11-21-engineer-transit.md) for the sampled movement outcomes and the distinction between existing fatigue-limited bodies and the tested new spawn design.

`defense-scale.test.js` verifies RCL 4–8 targets, actual hit caps, shared strength milestones, reserve-limited spending, active measured income, existing-engineer funding pauses, emergency bypass, and reset equivalence. Remote regressions cover profitable routes beyond the former cutoff, unprofitable routes, spawn headroom, and existing-route reevaluation. Scout regression rejects incomplete routes while preserving authorized destinations and threat retreat. The intentionally changed historical assertions now use the new RCL 5 goal/floor and a route beyond the new maximum; four distinct ramparts replace an impossible same-tile fixture, and zero delivery expects zero net income. Startup remotes cannot fund repairs before a measured delivery window. Staged and installed validation pass 226 tests.


`traffic-progress.test.js` reproduces controller-station transit reversal, remote crews accepting incomplete paths, opposing engineer blockage, and stalled carrier retries. Additional cases protect immobile/work-position occupants, verify holds across resets and check blocked cached-path rerouting. Existing movement tests now inspect checked-path options and explicit path destinations, with the same simulated search outcomes reinstalled after a global reset. Parking/reset and two-tile oscillation recovery add two further cases. Validation passes 234 tests; replay expectations were not regenerated. The new replay digest reflects persisted movement-goal diagnostics.

See [traffic progress live evidence](validation/2026-11-21-traffic-progress.md) for the observed controller oscillation, remote recovery, and final movement sample.


Link-starvation regressions reproduce continuous spawn deficits suppressing distributor hub refills. They cover the persisted 400/800 combined-buffer refill cycle, spawn recovery, tower emergencies, storage reserves, missing infrastructure/haulers, and shared link delivery reservations while source haulers keep spawn priority. Staged and installed validation pass 237 tests with the previous deterministic replay digest unchanged.

See [link feeding evidence](validation/2026-11-21-link-feeding.md) for observed sender/receiver energy and controller progress.


Remote reservation scheduling adds three regressions: an unreserved second operation precedes extra hauling in the first; banked reservation defers replacement until expiry approaches without duplicating pending reservers; missing essential remote transport/mining beats optional reservation across rooms. The existing sequence assertion intentionally changes to first hauler → miner → reserver → additional haulers. Staged and installed validation pass 240 tests; deterministic replay digest is unchanged. See [reservation evidence](validation/2026-11-21-remote-reservation.md).

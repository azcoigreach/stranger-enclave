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

# Source throughput and controller traffic

Date: November 21, 2026. Git branch: `feature/core-bootstrap`, uncommitted work based on `ab1a8fe1485a15a957888bfe82678f8fbca0b7e4`. No merge or remote CI result is claimed. Root modules run directly in the active localhost branch `stranger-enclave`.

## Problem and changes

The existing RCL 2 colony capped itself at four generalists while its spawn held 550 energy. Seven total WORK parts alternated harvesting, walking, refilling, and upgrading. Controller progress increased from 31,748 at tick 23173 to 35,020 at tick 24632: 3,272 energy over 1,459 ticks, approximately 2.24 per tick. Safe mode had expired before RCL 3. The original [snapshot](2026-11-21-economy-before.json) and [pre-activation snapshot](2026-11-21-economy-activation-before.json) retain the observations.

The bot now sizes stationary source miners from source capacity and regeneration, haulers from round-trip route estimates, and controller consumers from income after estimated specialist replacement costs. It protects affordable generalist recovery, spends partial deliveries, assigns separate controller stations, and records completed harvest/upgrade events. The ordinary two-source room targets ten mining WORK parts. Construction remains assigned to one generalist; haulers refill spawns/extensions and low towers before controller consumers.

A subsequent user screenshot showed a carrier enclosed by the upgrading formation. Station assignment alone did not constrain carrier routes. Hauler paths now block the inner range-2 controller area and refresh near the formation. A carrier already inside receives a coordinated escape step; an eligible adjacent upgrader swaps places when needed. Tick-local reservations prevent either role from overwriting the recovery intent. Fatigued/immobile/foreign creeps, walls, blocking structures, disconnected exits, home mismatches, and the saved territory boundary constrain this operation. No permanent room-specific positions are encoded.

## Activation and observations

Code was staged outside the watched directory and validated. New modules were installed and their server source verified before activating dependents. Dedicated spawn production began at tick 24666. Station assignment and partial-delivery refinements were verified by tick 26387, when the room was RCL 3. Controller traffic recovery was verified active at tick 33727. No world objects, controller levels, creep populations, energy, or server speed were manually changed for these checks.

| Observation | Completed 300-tick harvest | Completed 300-tick upgrade energy |
| --- | ---: | ---: |
| Tick 25637, dedicated roles staffed | 6,000 (3,000/source) | 1,778 |
| Tick 26387, RCL 3 observed | 6,000 (3,000/source) | 2,742 |
| Tick 35638, after traffic activation | 6,000 (3,000/source) | 4,725 |

The final window represents 20 harvested energy/tick and 15.75 controller energy/tick. Windows are observations under differing construction and replacement loads, not a controlled performance benchmark. The last rate is about seven times the original sampled upgrade rate, but should not be interpreted as a guaranteed steady-state gain.

Twelve read-only snapshots from tick 34391 through 35638 span 1,247 game ticks. All observed non-spawning haulers were outside range 2 of the controller; carrier positions changed through pickup and delivery routes. RCL 3 controller progress increased from 78,345 to 93,583 across those observations, approximately 12.22 progress/tick. No bot alerts were recorded. See [carrier observations](2026-11-21-controller-traffic-observations.json) and the [final runtime snapshot](2026-11-21-economy-after.json). These sparse observations cannot prove every intermediate tick was congestion-free. No trapped carrier was deliberately injected into the live world; the enclosed-formation swap is covered by deterministic tests, not claimed as a separately captured live swap.

## Automated validation

`npm run validate` passed staged syntax/import/type checks, 64 behavior tests before activation, and the independent-process deterministic trace comparison. Two additional obstacle/boundary tests brought installed validation to 66 passing tests. The replay SHA-256 was `b4ae49040f90cc0ef6031484830f1dc8a44bd473059e62462f304a16b0ac8adf`. All 19 root modules are recorded in the [deployment manifest](2026-11-21-economy-modules.sha256).

Before each relevant fix, failing regressions reproduced the idle four-worker cap, lack of protected controller spending, partial-delivery waiting, hidden source regeneration timer, enclosed carrier without escape, unblocked carrier routes, and missing recovery wait behavior. Retained tests also cover full source-cycle mining, route-based carrying demand, pending/replacement staffing, failed routes, pickup/delivery reservations, generalist-loss recovery, bounded completed-event metrics, distinct stations, serialized memory/global resets, fatigue, walls, disconnected exits, and home/block policy. The movement fixture resolves only the explicitly asserted swap and next step; it is not a general collision engine. Existing four mutation sentinels still fail for their intended behavioral regressions.

## Limits and next evidence

The local service reports protocol 14; engine package/mod versions remain unverified. Assigned CPU is 100 in the captured account snapshot. Local results are not official-shard CPU or performance guarantees. Source piles can still accumulate, dropped energy decays, and route sizing does not yet measure actual delivery-trip latency. General traffic arbitration, roads, and containers remain future work.

This proves improved behavior in the existing live colony and observed RCL 3 progression. It does not complete milestones 0–1: reproducible fresh-world progression, engine pinning, deliberate worker-loss recovery across three cycles, and the required soak remain open. Source-cycle harvesting is distinct from energy successfully transported and spent.

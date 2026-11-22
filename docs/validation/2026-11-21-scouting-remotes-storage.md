# Scouting, remote mining and storage — first slice

November 21, 2026. Branch `feature/scouting-remotes-storage`, based on dev `88d5af08753b02b871301329f298f567a69a7c3c`. The preceding uncommitted building-reconstruction fix remains included. No commit, push, pull request, or merge was performed for this feature; main and dev remain unchanged.

## Delivered behavior

Root CommonJS modules implement a single block scout, observation-based intelligence, RCL 4 storage construction and surplus handling, and one adjacent source operation per home. Local replacements, tower refills, controller survival, established construction and reconstruction, CPU, storage reserves, fresh observations and route cost gate optional spending. Remote requests share the home spawn coordinator. A collector is funded first, followed by its miner, remaining hauling capacity and a two-CLAIM reserver. Collectors wait near storage until the producer reaches the source, or recover existing visible source drops. Remote actors are dispatched independently of local home-only workers.

Complete two-room terrain routes are required before commitment; all high-level and tile routes stay inside the initial saved block. Foreign controllers/reservations, NPC threats, stale observations, inaccessible sources and lost storage pause the operation. Remote roles retreat with cargo and can resume after safe fresh observations. Loss of home ownership stops their work explicitly. Optional route planning runs after critical home actions in a separate fault boundary. Actual room transfer events count deliveries; gross crew spawn costs are reported separately without a profitability claim.

Memory changes are additive to schema 2 and preserve established territory/layout. New dependencies were staged outside the watched directory, tested, then copied before callers. All 26 live modules were compared byte-for-byte against the local source after synchronization. The first immediate comparison ran before synchronization completed; the later comparison confirmed all modules match.

## Deterministic checks

`npm run validate` passes in staging and the deployed working tree: **127 tests**, strict JSDoc/type and root-import checks for **26 modules**, and independent-process deterministic replay. Replay SHA-256: `0f9ef580cbf92e309d05e32ff68b06ac47f6b484282388ac71ec530bbc8b0103`. The replay digest changed because observed intelligence and colony expansion records are now richer; historical expected action fixtures were not regenerated.

Thirty expansion tests cover placement, priorities, source slots, threat capabilities, unknown/stale intelligence, ownership/reservations, source-route rejection, block boundaries, scout persistence/retreat, pending crew counts, replacement timing, home-first spawn arbitration, energy/CPU/construction gates, remote roles, route recovery, delivery reservations, full storage, and resolved event counting. A dedicated operation trace matches across serialized memory/global resets. Failing regressions were captured before fixing partial-delivery return mode, lost-home work, early outbound collector staging, and optional-planner exceptions suppressing emergency spawning. The existing tower-order fixture gained a valid hostile body; its behavior assertion is unchanged.

The movement, action, path and spawn APIs in these fixtures are mocked. They demonstrate policy/state outcomes, not complete engine mechanics, sustained hauling or automatic recovery from every terrain obstruction.

## Live evidence

The live home remains W6N8, discovered automatically. The scout spawned at tick **47394**. At tick **48113**, intelligence contained **19 observed rooms including home**, and the scout was in W6N3 heading toward W5N3. This verifies actual cross-room travel and autonomous observations within the saved block. The RCL 4 home automatically placed storage at **(40,17)**; its construction progress was **4,668 / 30,000**. The tower held **1,000 energy**. No bot alerts were present; the 100-tick CPU sample averaged **3.55**, with **p95 4.31**, peak **13.61**, and bucket **10,000** against assigned CPU 100.

The operation correctly reports `WAIT_STORAGE`. **Remote spawning, live mining/delivery and reservation are not yet observed**: they remain gated until storage finishes and holds 2,000 energy. No world reset, resource injection, forced construction, manual creep spawning, destructive test, or bot-memory edit was used. Read-only observer snapshots include actual persisted scout intel; administrative room inspection never populates the bot's observations.

Evidence: [live snapshot](2026-11-21-scouting-remotes-storage-live.json), [runtime source manifest](2026-11-21-scouting-remotes-storage-modules.sha256). Engine/mod version pinning remains unresolved, as in the earlier validation records.

## Remaining acceptance work

Observe storage completion, autonomous remote commissioning, a completed energy delivery and controller reservation; then measure delivery/upkeep over replacement cycles and exercise threat/route-loss recovery on the engine. This first slice does not complete milestones 2–3 or establish official-server readiness. Automatic alternate-source selection for long-paused operations, multiple remotes, guarded keeper operations, remote roads/containers, mature layouts and claiming remain later work. Scouting cannot promise vision of inaccessible/contested rooms.

Mechanics reference: [official Screeps API](https://docs.screeps.com/api/) for route callbacks, PathFinder, storage, controller reservations and resolved room transfer events, checked November 21, 2026.

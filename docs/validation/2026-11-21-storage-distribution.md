# Storage deposits and home distribution

November 21, 2026. Uncommitted work on `feature/scouting-remotes-storage`; shared branches remain unchanged.

## Diagnosis and changes

At tick 53495, completed storage held zero energy while the spawn was full, home mining/hauling/worker staffing met demand, and carriers held substantial cargo. The delivery list treated every point of free worker capacity as higher priority than storage. Continuously upgrading workers therefore kept attracting small refills, preventing carriers from banking remaining loads and returning to sources.

With usable owned storage, upgrader demand now uses separate low/high buffers: request energy below 15 ticks of active WORK consumption, replenish toward 30 ticks, capped by carry capacity. Low threshold is additionally capped at half capacity. Builders and urgent controller protection retain full refills; absent, foreign or full storage preserves previous full-consumer behavior. Spawns/extensions and towers retain priority. Shared reservations cap deliveries to current demand.

The first live deposit check reached 1,380 stored energy at tick 55571. Further observation exposed a complementary supply gap: source carriers prioritize source pickups, so stored energy could accumulate while workers waited. At tick 56222 storage held 3,282, but the latest controller window recorded only 338 upgrade energy. This intermediate result was not accepted as completion.

A dedicated local distributor now withdraws storage directly, regardless of source drops, and supplies spawn/extensions, towers, then low workers. It loads a batch when demand exists and retains spare cargo between refills, avoiding unnecessary trips back to storage. It scales to six CARRY/MOVE pairs. One viable or pending distributor suppresses duplicates; replacements have spawn/travel lead time. Emergency generalists, first source transport and mining retain priority. Additional controller consumers and remote spawning follow distribution needs. Source carriers continue collecting and depositing; their fallback storage withdrawals remain demand-limited.

The new role participates in home snapshots, dead-memory cleanup, the local action dispatcher, station-aware paths and formation escape. It cannot leave home, harvest, upgrade, or adopt an unrelated source assignment. Missing storage produces an explicit wait task. The original economy and remote implementation remain otherwise in place.

## Deterministic validation

Failing tests captured bank starvation, perpetual top-ups, oversized fallback withdrawals, missing distribution, and unnecessary return of spare distributor cargo. Fifteen storage tests cover these behaviors, across-tick/reset refills, unavailable storage, spawn/tower/builder/downgrade priority, shared reservations, pending/replacement distributors and storage loss. A further traffic test verifies that distributors escape an enclosed controller formation without ordinary role movement overriding the swap.

`npm run validate` passed in staging and the deployed root: **146 tests**, strict checks for **26 runtime modules**, and independent-process replay equivalence. Replay SHA-256 remains `0f9ef580cbf92e309d05e32ff68b06ac47f6b484282388ac71ec530bbc8b0103`. No historical action fixtures were regenerated. Fixture actions and movement remain mocked; engine evidence is recorded separately below.

## Live evidence

The bot autonomously spawned distributor-W6N8-57707-488. At tick 58057 storage held 19,012 energy, the spawn energy pool was full, and all five then-active workers were upgrading. At tick **58907**, storage held **24,400 energy**, the distributor carried **300**, and the latest completed 300-tick economy window recorded **5,980 harvested energy and 3,681 controller upgrade energy**. Worker replacements were underway. There were no bot alerts; average sampled CPU was 4.68, p95 5.94, peak 16.30, bucket 10,000 against assigned CPU 100.

Storage funding also allowed the first remote to start autonomously in W6N9. Its resolved delivery counter reached **23,186 energy**, and cumulative remote crew spawning cost was **11,600** at tick 58907. Earlier live observations showed its miner harvesting and reserver executing `REMOTE_RESERVE`. These observations establish initial delivery operation, not full profitability, reservation-duration or three-cycle milestone acceptance. Deposits include local and remote income; the storage delta is not attributable solely to this carrier fix.

All 26 live modules were compared against the tested local sources after synchronization. No manual spawning, resource injection, world reset, or memory edits were used. Evidence: [live snapshot](2026-11-21-storage-distribution-live.json), [source manifest](2026-11-21-storage-distribution-modules.sha256). Sustained balancing and remote resilience remain ongoing acceptance work.

## PR checkpoint

Implementation and regression tests are committed as `231333ccf8e87d6df217ff130cf5fc175818c6fe` for a feature PR targeting `dev`. Historical observations above describe their capture-time state. The full 146-test validation gate passed again before this commit; the recorded final source manifest matches these runtime modules. Human review and merge remain pending.

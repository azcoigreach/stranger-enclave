# Defense strength and remote funding — November 21, 2026

Barrier goals now scale from 100,000 hits at RCL 4, through 1 million / 5 million / 20 million at RCL 5 / 6 / 7, to each structure's actual maximum at RCL 8. Standard RCL 8 walls and ramparts permit 300 million hits. Shared repair milestones advance the weakest unfinished barriers before stronger ones. Approved migration guards and temporary legacy barriers retain their existing safety rules; off-plan barriers are not adopted as ordinary fortification targets.

Reserve floors scale from 20k to 200k and targets from 75k to 500k across RCL 4–8. Desired engineer WORK caps are 5 / 15 / 25 / 40 / 60. Actual funding subtracts controller demand, replacements, rampart decay and active tower demand from observed local harvesting and measured remote deliveries, with controlled spending of reserves above target. New remotes have no funding credit before a measured delivery window. Existing unfunded engineers pause routine withdrawals; emergency gate work retains priority. Whole-creep allocation can exceed the numerical WORK allowance by the remainder of the last selected body.

Demand now requests additional safe adjacent remotes using estimated net income after miner, hauling and reservation replacement costs. Complete routes up to cost 200 must predict at least 2 net energy/tick and keep estimated total replacement spawn load below 80%. Existing routes are reevaluated. Territory, threat, freshness, reserve and resize gates remain. Current scope is one source per room and at most four adjacent rooms; high demand does not guarantee enough eligible sources.

## Verification

New deterministic regressions first reproduced missing level scaling, incorrect funding credit and incomplete scout travel. Coverage includes actual structure caps, completed low-cap barriers, shared milestones, reserve draw, measured income, engineer funding pauses and emergency exceptions, reset equivalence, profitable longer routes, rejected loss-making routes, spawn headroom and existing-route reevaluation. Scout travel requires a complete static route and cannot follow an incomplete search endpoint.

Historical assertions deliberately changed for the RCL 5 target/floor and new route ceiling. Four ramparts now occupy distinct tiles in the decay fixture. Zero measured delivery no longer expects positive net income. Replay expected actions were not regenerated.

Staged and installed `npm run validate` pass **226 tests**, strict checks for **39 runtime modules**, and independent-process deterministic replay with SHA-256 `efe24576d1004d1fa0e56738651924bf8a9fc7292f5823fd5a890d38fa4883d9`. The sandbox prevented the installed replay from spawning Node; the full authorized validation rerun passed outside that restriction.

## Live observations

At tick 123366 the RCL 5 colony was running the 1M-hit goal, 50k reserve floor and 150k target, funding 15 engineer WORK. Its sole existing remote supplied a measured net estimate of 6.02 energy/tick. Further admission was blocked by stale neighboring intel. A scout had an empty cached route near the mineral-side terrain pocket. After the complete-route correction it progressed toward the exit, surveyed the neighboring room and allowed normal admission without injected intel or forced movement.

At tick 123966 a second remote was active and staffing: route cost 123, predicted net 2.95 energy/tick and total estimated spawn load 76.28%. It had delivered no energy yet. At tick **124242**, final installed source matched the server for all 39 modules:

| Observation | Value |
| --- | --- |
| Stored energy | 230,002 |
| Reserve floor / target | 50,000 / 150,000 |
| Barrier goal / current shared milestone | 1,000,000 / 25,000 hits |
| Desired / funded engineer WORK | 15 / 15 |
| Active remotes | 2; second still starting |
| Measured remote income credited | 4.23 energy/tick |
| Desired remote income / remaining shortfall | 18.49 / 14.26 energy/tick |
| Remote room target | 4, subject to admission gates |
| CPU average / p95 / peak | 8.72 / 12.16 / 25.22 |
| CPU bucket / bot alerts | 10,000 / none |

The newer remote's predicted income was correctly excluded from current repair funding. Repairs currently rely partly on surplus reserves; these observations do not demonstrate a sustainably funded full defense workforce, successful deliveries from the new remote, or maximum barriers. Longer delivery and replacement-cycle monitoring remains necessary.

No world reset, resource injection, forced movement or destructive test was used. Changes remain uncommitted on `feature/rcl5-perimeter-links`, based on `e5e551902a9c010dd07b625a76292f6a4834ebd6`. The [runtime manifest](2026-11-21-defense-scale-modules.sha256) identifies the installed code.

## Mechanics and remaining defense work

The [official constants](https://raw.githubusercontent.com/screeps/common/master/lib/constants.js) were checked on November 21, 2026 for barrier caps, repair cost and rampart decay. Rampart passive upkeep depends on tile count, not current hit points. Runtime existing-structure goals honor actual `hitsMax`, including private-server limits.

These changes build and fund stronger barriers; they do not implement complete player-raid defense. The [official defense guide](https://docs.screeps.com/defense.html) explains why barriers must be combined with active defense. Boost-aware targeting, defensive creeps, safe-mode decisions and realistic raid acceptance tests remain open. RCL 6–8 policies have deterministic coverage, not live progression acceptance.

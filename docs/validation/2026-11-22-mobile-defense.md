# Mobile defense — Issue #14

Date: November 22, 2026 (America/Phoenix). [Issue #14](https://github.com/azcoigreach/stranger-enclave/issues/14).

Code revision: `5c06cf3254b8234e04f449b6d9dc7388bf9d53e4`, built on `dev` at `a8796df9d353ddfc14a6bf4ec2dcb398bc5c6a66`. Changes were developed in an isolated `/tmp` clone, never in the watched script directory. The following documentation commit does not change the tested game modules.

## Gates run

- `npm run validate`: **279/279 passing tests**, root syntax/import checks for 46 game modules, strict JSDoc/types, four in-memory mutation sentinels, and independent-process deterministic replays. Node `v22.22.1`; development dependencies from the repository lockfile.
- Peaceful replay SHA-256: `92697bcdb6d9b0daca9acecdbaad426e7affd6cb27f7a30ebf3c6b228ef07cd5`. The additive defense state and hostile-profile arrays change persisted traces; no previous expected action/fixture outcomes were regenerated.
- **27 new defense tests**, including a 32-tick defense/evacuation replay with identical output after serialized Memory, global resets and reversed object insertion order.
- `node tools/check-defense-engine.js <installed @screeps/engine directory>`: **five passing processor scenarios** against installed engine **4.3.0**. See the [reviewed results and root module hashes](2026-11-22-mobile-defense-engine.json).
- `git diff --check`: passed.

Node subprocesses require execution outside this environment's restricted sandbox. A sandboxed determinism invocation returned `EPERM`; the complete gate above was rerun with subprocess execution enabled and passed.

## Acceptance coverage

| Requirement/scenario | Observed result |
| --- | --- |
| Tower-solvable invader | Dispatcher chooses `tower` without a defender request. Actual maximum-falloff tower processors remove an ATTACK/MOVE invader in two ticks using 20 energy. Tests also reject insufficient tower bank, hostile ramparts, foreign towers and healing beyond tower fire. |
| Unguarded remote raid | When spawn plus travel exceeds time to civilian contact, the dispatcher chooses withdrawal with an escort request. Civilian role issues no harvest intent; the actual movement processor resolves the supplied westbound escape step into the safe home room. Unsafe home and incomplete/forbidden escape routes are rejected. |
| Affordable melee/ranged/healing bodies | An unarmed WORK/CARRY/MOVE raider receives an ATTACK/MOVE counter. Installed processors resolve its defeat in ten ticks with the defender intact. Against an ATTACK/MOVE invader, the affordable ranged/self-healing counter wins in 20 ticks with 600 hits remaining. |
| Healing player | Active boosted combat/heal/MOVE/TOUGH multipliers are checked independently. A ranged/healing player within budget is defeated by the selected ranged/healing counter in 35 processor ticks with 600 hits remaining. An oversized healing/ranged player produces evacuation and no replacement request across repeated reset samples. |
| Simultaneous home/remote threats | Only home receives the sponsor's reinforcement request. Remote crews cannot select threatened home as refuge. Critical local miners, first transport and the two recovery workers retain spawning priority; optional engineers yield to defense. Evacuated recovery workers are counted rather than replaced. |
| Defender loss | Two accepted spawns are removed from the fixture after their expected completion. Loss/spending state survives resets; subsequent requests stop at `INCIDENT_BUDGET_EXHAUSTED`. Pending names prevent duplicates and failed spawn intents consume no incident budget. |
| Existing defense and return | A viable existing fighter is reused; short lifetime, destroyed combat parts and low original-health fraction reject coverage. Escorting fighters follow withdrawing civilians. Missing vision cannot clear an incident; 25 consecutive safe observations release the cooldown, and return still requires a complete fresh-safe route. |
| Ownership/boundary/runtime safety | Captured home ownership cannot change the bot's identity or authorize entry. Keeper/core and foreign-ownership targets are rejected. Paths exclude outside-block rooms, live occupants and civilian firing lanes. Low CPU still runs evacuation. Later traffic cannot overwrite its movement; dead defender memory is cleaned. |

## Fixture and intervention details

Deterministic fixtures use synthetic adjacent `W5N1`/`W4N1` rooms in a discovered `W1N1`–`W9N9` block; these are fixture coordinates, not deployment settings or observations. The synthetic sponsor is RCL 5 with 1,800 available/capacity energy and 80,000 stored energy. CPU readings are supplied by the harness (100 limit, 10,000 bucket, plus an explicit zero-bucket case); GCL is not modeled. Hostile bodies, TTL, damage, deaths, missing vision, ownership changes, successful/failed action returns, and most paths are explicit inputs. Tests never modify live modules or server state.

The installed-engine tool loads real attack, ranged attack, heal, tower, damage/body and movement processors. Its driver has constants and no-op notifications, and its bulk updates modify only process-local objects. Engine mods/config/database/network are not loaded. Combatants start adjacent and remain at fixed positions during those combat checks; no favorable kiting or rampart advantage is assumed. The escape check supplies one complete path step and verifies the engine's actual inter-room exit result. The tool does not claim to test PathFinder, full server scheduling, spawn resolution or a sustained raid.

An initial processor-fixture failure was traced to retained `_oldHits`: production processors receive newly loaded objects each tick, while this fixture reuses them. Clearing that transient field restored the correct active-part lifecycle. Melee retaliation is included in the bot's conservative estimate. Later review bugs (dead role memory, original-health fitness, escort execution, occupancy avoidance, recovery-worker protection and captured-home identity) were recorded with failing regressions before their fixes.

## Remaining gate

**No live activation or live raid was performed.** The user's world, infrastructure, memory and active branch were not changed. Whole-world interception, multi-creep congestion, combat under real CPU pressure, actual spawn timing, blocked-route recovery and sustained live raid/return behavior remain to be observed after deliberate activation. These results do not complete milestone 3 or certify a release. Approval and merge remain human-owned, and Issue #14 stays open for that review/live evidence.

# Mechanics ledger

Reviewed against the [official Screeps API](https://docs.screeps.com/api/) on November 21, 2026. The local HTTP server reports protocol 14; its engine package version and enabled mods are not yet pinned or verified. HTTP protocol is not an engine version.

| Assumption used by the core | Official reference | Validation and limits |
| --- | --- | --- |
| Initial owned spawns can be discovered from `Game.spawns`; runtime room names determine the starting sector. | [Game.spawns](https://docs.screeps.com/api/#Game.spawns), [Game.map](https://docs.screeps.com/api/#Game.map) | Fresh-start integration tests in all quadrants; sector membership/border tests at multiple offsets. No private-server API is used by game code. |
| Spawning draws from room spawns/extensions and accepts body/name/memory options. | [StructureSpawn.spawnCreep](https://docs.screeps.com/api/#StructureSpawn.spawnCreep) | Emergency-body and arbitration tests; local smoke observation recorded separately. |
| Creep actions report range errors; movement is a separate intent. | [Creep](https://docs.screeps.com/api/#Creep) | Worker tests exercise action selection; actual movement requires server observation. |
| A path endpoint must satisfy the requested range; a partial route is not arrival. | [PathFinder.search](https://docs.screeps.com/api/#PathFinder.search), [RoomPosition.findPathTo](https://docs.screeps.com/api/#RoomPosition.findPathTo) | Partial-path regression test. The core uses room-local paths only. |
| `moveTo` supports `maxRooms`, path reuse, and a room cost-matrix callback. | [Creep.moveTo](https://docs.screeps.com/api/#Creep.moveTo) | Movement policy test and static API check. Blocked callbacks return a fully blocked matrix. |
| Construction can fail on legality, ownership, structure limits, or the global site cap. | [Room.createConstructionSite](https://docs.screeps.com/api/#Room.createConstructionSite) | Site-cap, failed-placement, and connectivity tests. Return codes remain visible. |
| Assigned CPU, tick limit, bucket, and current usage are separate values. | [Game.cpu](https://docs.screeps.com/api/#Game.cpu) | Low-bucket test preserves essential work. Local CPU measurements are comparative only. |

| Ordinary owned-source demand is derived from energy capacity, `ENERGY_REGEN_TIME` (300), and `HARVEST_POWER` (2); a miner without CARRY drops harvested energy. | [Constants](https://docs.screeps.com/api/#Constants), [Creep.harvest](https://docs.screeps.com/api/#Creep.harvest) | Deterministic full-cycle test plus completed local engine events showing 3,000 harvested per source per 300 ticks. |
| Harvest and controller-upgrade event logs describe resolved actions; an accepted intent alone is not throughput. | [Room.getEventLog](https://docs.screeps.com/api/#Room.getEventLog) | Bounded-window tests, actor filtering, regeneration boundary checks, and live snapshots. |
| Direct movement is a separate intent; coordinated movement must not be overwritten by a later role call. | [Creep.move](https://docs.screeps.com/api/#Creep.move), [simultaneous actions](https://docs.screeps.com/simultaneous-actions.html) | Enclosed-carrier swap tests, explicit next-state/reset fixtures, fatigue/obstacle checks, and live route observations. The fixture is not a full engine collision resolver. |

No live-server performance or progression acceptance gate is implied by the mock tests. Late-game APIs and behavior have not been validated for this slice.


## Defensive combat — November 22, 2026

Verified active part/boost multipliers, MOVE fatigue removal, 50-part bodies, attack/heal ranges, tower falloff and energy cost against the [official constants/API](https://docs.screeps.com/api/#Constants), [attack API](https://docs.screeps.com/api/#Creep.attack), [tower API](https://docs.screeps.com/api/#StructureTower.attack), and [simultaneous actions](https://docs.screeps.com/simultaneous-actions.html). Ranged attack plus self-healing is a legal combination; melee bodies do not attempt simultaneous direct healing. Melee receives attack-back damage in addition to an enemy attack intent. The installed `@screeps/engine` 4.3.0 processors were exercised directly in isolated fixtures, including damage/boost effectiveness, body attrition, healing, tower bank depletion and a border exit. No running-server mods, GCL/CPU profile, or live combat result is inferred from these isolated checks.

# Core bot v0.1

This is the first bootstrap slice of milestones 0–1, not completion of either milestone. Game modules live directly in the repository root and run without a build step.

## Local operation

On a fresh deployment, the bot discovers the room containing its initial owned spawn, derives that room's 9×9 sector interior, and persists `home` and `block` in `Memory.enclave`. No room names, spawn names, account IDs, or shard names need to be edited in game code. `core.config.js` contains only behavior/CPU tuning.

Discovery supports all four map quadrants and sector offsets, excluding the surrounding highway rooms. Multiple initial spawns in the same sector use a stable room-name ordering for the home label. With no spawn, initialization waits and retries; with initial spawns in multiple sectors and no saved territory, it reports `AMBIGUOUS_START_BLOCK` instead of guessing. Nonstandard room names such as `sim` and highway starts do not establish a sector.

Once saved, the territory does not change when more colonies appear, spawns are renamed or lost, or globals reset. The saved home and block must describe the same sector. A deliberate new empire with retained old memory needs an explicit memory transition; a new spawn elsewhere never silently replaces an existing territory.

The initial dev home was `W5N1`; after the user reset the world, the home is `W6N8`, inside `W1N1`–`W9N9`. These are observations of this world, not deployment configuration.

The user confirmed that this dev server contains one block. A read-only server inventory on November 21, 2026, at tick 1899 verified 121 rooms total: the 81-room interior plus 40 surrounding highway rooms (`W0`/`W10` or `N0`/`N10`). The interior contains 72 controller rooms, eight keeper rooms, and the controllerless center `W5N5`. This matches the configured ownership boundary.

At that observation, four other colonies occupied `W9N9`, `W9N1`, `W1N9`, and `W1N1`, each at RCL 2; home `W5N1` was RCL 1. An invader core existed in `W6N5`. These are dated development-world observations, not permanent assumptions or in-game scouting results. Administrative inspection does not populate bot intelligence; autonomous operations must still acquire their own vision. The current world has no additional rooms beyond this block and its highway ring.

**This repository is the active localhost Screeps script directory. Editing root JavaScript files changes the running bot when the client synchronizes them.** Stage and validate coordinated changes outside the watched directory before copying them in. For initial installation, copy dependency modules first and `main.js` last. Future incompatible updates need a deliberate activation/rollback procedure; replacing several live files is not an atomic deployment.

The initial spawn is already placed. The bot discovers owned rooms within its boundary, bootstraps with generalists, then adds source miners and haulers as room capacity reaches 550 energy. Generalists become controller consumers, with one builder while sites exist. Home workers stay in their home room; explicitly assigned scouts and remote crews use bounded inter-room travel. Unknown or unrelated creeps are not adopted or given orders.

At RCL 2, the bootstrap planner starts extensions. At RCL 3, it prioritizes a tower before remaining extensions. It searches terrain incrementally, preserves source/controller working space, and checks connectivity before requesting a site. Existing towers attack visible hostiles. Established building positions are saved and missing buildings are reconstructed on their saved tiles before new expansion sites are considered. At RCL 4, storage is placed before additional extensions. Advanced defense, home evacuation, safe mode, roads, containers, repairs, and mature layouts remain future work.

## Console commands

- `status()` — CPU sample summary, schema, home, block, and recent alerts.
- `roomReport('W5N1')` — staffing, energy, spawn decision, placement status, and observation age.
- `territoryReport()` — all 81 rooms with observed ownership and vision age; unknown rooms remain unknown.
- `explain('creep-name')` — the worker's assignment, current task, and last action return code. A room name returns its colony report.

Summaries print every 100 ticks. Repeated errors are throttled, and history is capped at 50 alert keys and 100 CPU samples. These samples are diagnostic measurements, not verified live CPU capacity or the planned 1,000-tick trends. `roomReport(home).expansion` reports the remote operation, its current gate, resolved delivered energy, and total energy spent spawning its crews.

## Tick and ownership contracts

| Module | Inputs, outputs, memory, scheduling, failure behavior |
| --- | --- |
| `main.js` | Initializes state, observes rooms, runs essential colony systems, then scheduled planning and reporting. Isolates systems and workers; initialization failure stops that tick. |
| `core.config.js` | Server-independent behavior/CPU tuning; no intents or memory writes. |
| `core.memory.js` | Discovers home/sector on first start, migrates schema 1 to 2, and cleans dead managed creep records. Runs every tick. Rejects unknown versions and inconsistent saved bounds without overwriting them. |
| `core.runtime.js` | Owns bounded alert history, fault boundaries, and optional-work CPU gates. Essential work continues at low bucket. |
| `territory.policy.js` | Pure signed-coordinate conversion, sector derivation, block validation, enumeration, and membership checks. Invalid names fail closed. |
| `territory.intel.js` | Observes visible in-block rooms: source positions/capacities/slots, controller ownership/reservations, mineral, exits, hostile active parts and NPC structures. Stores timestamps and a threat cooldown. |
| `movement.remote.js` | Validates block and route permissions before inter-room travel. Restricts tile paths to current/next authorized rooms; remote economics require a complete two-room terrain path. |
| `operations.scout.js` | One survey role from the original home visits unknown/old reachable rooms, persists its destination, avoids known hazards, and retreats on new threats. Bounds failed route retries and optional CPU work. |
| `operations.remote.js` | Maintains one adjacent source operation per colony. Supplies optional spawn requests after home deficits; tracks resolved deliveries and gross spawn spending. |
| `operations.roles.js` | Executes remote mining, hauling to storage, reservations, and retreat. Dispatches separately from home workers, with shared remote pickup/storage reservations. |
| `colony.snapshot.js` | Produces tick-local game-object snapshots for owned rooms. Never persists objects. |
| `economy.spawn.js` | Owns one spawn intent per room/tick, decision records, and name sequence. Protects two recovery generalists, counts pending roles and replacement lead time, and waits for affordable target bodies. |
| `economy.demand.js` | Derives source WORK, route CARRY, and consumer WORK demand from runtime constants/capacity. Caches complete local routes for 100 ticks in colony memory. |
| `economy.production.js` | Creates priority requests for mining, transport, then consumer deficits. Counts active/pending parts, limits simultaneous viable miners to usable slots, and excludes creeps approaching replacement deadlines. |
| `economy.mining.js` | Surveys walkable, reachable source-adjacent slots; assigns exact tiles to miners and bootstrap gatherers. Occupants and valid saved reservations take priority. Geometry cache holds plain positions; tick-local assignments coordinate traveling workers. |
| `economy.miner.js` | Moves to its reserved tile and harvests. Reassigns through mining allocation when its source is full; waits near its source when no useful slot is free. Miners without CARRY drop energy for haulers. |
| `economy.hauler.js` | Owns source pickup and delivery to spawns/extensions, towers to capacity, then consumers and surplus storage. Withdraws storage during source gaps with home demand. Shares tick-local amount reservations. |
| `economy.stations.js` | Assigns distinct stations within controller upgrade range, ordered by actual supply-path length. Reserves delivery paths so later stations cannot close those lanes. Disposable coordinate cache; rebuilt after resets, workforce/topology changes, or 100 ticks. |
| `economy.metrics.js` | Reads completed harvest/upgrade events, retains current and previous 300-tick windows, and records unused source energy at regeneration. |
| `economy.worker.js` | Dispatches managed roles and owns generalist actions and task/assignment memory. Uses shared tick-local delivery reservations. Faults are isolated per creep. |
| `movement.local.js` | Owns ordinary movement and stuck history. Restricts paths to the home room, blocks borders, blocks reserved/current worker tiles while keeping delivery lanes open, and refreshes carrier paths near the controller. |
| `movement.controller.js` | Before role execution, coordinates escape steps/swaps for carriers enclosed by upgraders. Checks terrain, structures, occupancy, fatigue, home/boundary, and an external exit route. Reserves both creeps for that tick so role movement cannot overwrite recovery. |
| `defense.basic.js` | Issues tower attack intents before economy work. No persistent state or outside-room attacks. |
| `planning.layout.js` | Captures established building/site types and coordinates every tick in a versioned colony layout. Recreates missing positions before new placement; failures retain the saved tile and report the API/limit reason. |
| `planning.bootstrap.js` | Owns colony planner cursor/status and schedules reconstruction before new placements. Runs once per 25 ticks per room, staggered by coordinates, with CPU gating. Checks up to 12 candidates and requests at most one site per run. |
| `reporting.console.js` | Installs console helpers, owns CPU samples, emits scheduled summaries. Reads current memory rather than retaining stale objects. |

`Memory.enclave` schema 2 stores `home`, `block`, `colonies`, `intel`, `alerts`, `samples`, and `sequence`. Schema 1 migrates in place by locating an owned spawn within its saved block, or a saved colony if the spawn was lost. The migration validates the sector before changing any fields and preserves the block, workforce, plans, metrics, and sequence. If several legacy candidates exist, the first sorted spawn room (then saved colony) becomes the home label; schema 1 did not record historical spawn order. Worker memory stores `role`, `home`, `working`, `sourceId`, optional plain-coordinate `miningSpot`, `task`, `lastAction`, and `motion`. Native movement may also use its own creep-memory path cache. Missing vision preserves the last observation with its timestamp. Global caches are disposable. Each colony may also hold `layout: {version: 1, buildings: [{type, x, y}]}`; this additive schema-2 field stores established positions independently of structure IDs.

For compatible live rollout, install the additive territory helpers first, then the schema-2 memory reader/migration, then reporting, and remove the old location configuration last. Verify each dependent phase has synchronized. The old schema-1-only reader cannot read migrated memory; a rollback must retain the schema-2 reader and territory helpers or use a separately validated reverse migration. Never overwrite live progress with a stale memory snapshot as an incidental rollback.

Below specialist capacity, the bootstrap workforce target remains two generalists per source, with a floor of two and cap of six. Loss of viable generalists triggers affordable 200-energy recovery bodies (`WORK`, `CARRY`, `MOVE`). Once capacity reaches 550, demand uses source energy capacity / regeneration interval / harvest power: an ordinary owned source requires five WORK parts. Its miner stays at the source; haulers collect dropped energy or container stores.

Harvesters reserve distinct source-adjacent tiles, including while traveling. Walls, blocking structures, disconnected paths, occupied tiles, and routes through stationary harvesters are excluded. An incumbent retains its tile; a displaced miner can use another source with a free slot and unmet mining demand. Bootstrap gatherers use the same slot allocator. If no useful slot is free, a replacement retains its source and approaches range two to wait for takeover. Exhaustion alone does not move a dedicated miner away from its source. Assignments rebuild from current vision and saved coordinates after global resets; there is no room-specific layout.

`roomReport(home).miningSources` reports usable `slots`, `assigned` harvesters (including travelers/pending miners with reservations), and `waiting` miners per source. The fresh-world home was observed at `W6N8` after the user reset; its sources have three and one usable slots. See the [mining-slot validation](validation/2026-11-21-mining-slots.md).

Transport demand uses the longest complete source-to-spawn/controller route, terrain-dependent loaded travel, empty return travel, and four handling ticks. Haulers use equal CARRY/MOVE parts. Generalist WORK demand deducts estimated specialist replacement upkeep from income; bodies scale up to three WORK/CARRY/MOVE units. These are initial sizing estimates, not proof of delivered throughput. Source piles can still accumulate through transport delays and dropped energy decays. Containers, roads, and measured delivery-trip sizing remain future work.

In a fed colony, generalists spend partial deliveries immediately and stay at distinct controller stations; only the final generalist builds while sites exist. Haulers refill spawns/extensions first, then owned towers to their actual energy capacity, before supplying consumers. Generalists use the same full-tower target when providing fallback delivery; existing downgrade protection and the dedicated consumer role remain in place. Delivery paths block individual reserved stations and current nearby worker tiles; they do not block a blanket square around the controller. Upgraders can use the full three-tile upgrade range, with station choices ranked by actual approach-path length. Each chosen station preserves a supply lane that cannot become another station. Path reuse is disabled near the controller. A carrier with an open exit can transit normally; an enclosed carrier, or one occupying a reserved station, gets a coordinated escape step/swap toward reachable space outside upgrade range. Ordinary roles cannot overwrite either participant’s recovery movement that tick. If a mobile friendly worker and connected exit cannot be found, recovery waits with `WAIT_CONTROLLER_EXIT`. This is controller-specific recovery, not a general room traffic solver.

`roomReport(home).economy` exposes actual event-based harvest and upgrade energy, the latest complete 300-tick window, and unused source energy on regeneration. `staffing` compares active part totals with targets. At tick 26387 the current dev colony had reached RCL 3; a completed window recorded 6,000 harvested energy and 2,742 upgrade energy. This is observed progression in the existing world, not a fresh-seed milestone run. See the [economy validation record](validation/2026-11-21-economy-throughput.md).

## Building reconstruction

The bot adopts existing owned structures and owned construction sites, plus neutral roads, containers, and walls in its owned room. New planner sites are saved immediately when accepted. Layout observation runs even when low CPU or hostiles defer construction; missing vision never deletes saved positions. Saved entries are deduplicated by type and tile and survive serialization/global resets.

On scheduled planning ticks, reconstruction precedes new placements, with spawn, tower, then extension priority. A matching building or site satisfies that position, so rebuilding is not duplicated. Site caps, threats, room limits, and CPU gates remain in force. The engine checks tile legality; a rejected request leaves the saved position intact and reports `REBUILD_FAILED_*`. A current structure-count/RCL limit reports `REBUILD_LIMIT_*`. Pending reconstruction takes precedence over new expansion, including when blocked; there is no automatic relocation or demolition.

The original spawn can receive a replacement site even when no spawn remains. Surviving harvesters provide mining-access origins during that interval. Completing reconstruction still requires enough surviving workers, energy, and lifetime; this does not recover a completely extinct colony automatically.

Tracking starts with the layout present at activation. It cannot infer positions destroyed before they were recorded, or recover plans after Memory is deliberately cleared. Removing a saved construction site is treated as missing infrastructure and recreates it; intentional redesign requires an explicit layout revision. See the [reconstruction validation](validation/2026-11-21-building-reconstruction.md).

## Development validation

Use the pinned Node version in `.node-version`:

```sh
npm ci
npm run validate
```

With the localhost CLI enabled, `python3 tools/observe-local.py --room W5N1` prints a read-only runtime snapshot for the specified development room, including saved territory, active module names, worker tasks, alerts, and recent CPU samples. Supply the actual room name for other worlds. The tool does not modify the world, code, or memory and is not a runtime dependency for official-server deployment.

Dependencies are development-only and pinned in `package-lock.json`. `npm run check` validates root-module syntax/imports and statically checks JSDoc JavaScript against Screeps types. `npm test` runs isolated fake-world behavioral tests, including the actual `main.loop`, tick replays, and known-bug mutation checks. `npm run test:determinism` compares full replay traces across independent processes, timezones, insertion orders, and runtime resets. All three are part of `npm run validate`; see the [testing guide](TESTING.md). Test fixtures do not reproduce the full engine or prove autonomous RCL progression.

Tests cover sector discovery in all quadrants, fresh deployment in multiple sectors, boundary persistence after spawn loss, schema-1 migration, ambiguous starts, deployment-literal regressions, emergency spawning, replacement timing, duplicate-spawn prevention, delivery reservations, worker priorities, partial-path rejection, fault isolation, low-bucket scheduling, bounded reporting, and basic placement connectivity.

## Remaining milestone work

- Pin and document the actual local server/engine and mods; provide repeatable seed, snapshot, restore, deployment, and scenario commands.
- Record unassisted RCL 1–3 progression, worker-loss recovery across three replacement cycles, and the milestone soak.
- Extend the planner across the difficult-terrain corpus. The bootstrap planner is deliberately conservative about disconnected exits and existing structures; some rooms may remain blocked until the full planner exists.
- Measure remote profitability and delivery trips across replacement cycles; extend mature construction, stronger defense, multiple remotes, and claiming.

The current code reserves eligible remote controllers. Claiming, unclaiming, automated demolition, and shard-setting changes remain outside this implementation.

## Scouting, remote mining, and storage

This is the first slice of milestones 2–3, not completion of those milestones. `territoryReport()` exposes observations only; administrative inspection never seeds scout intelligence. New memory is additive to schema 2. Each colony may hold `expansion: {reason, remote}`; its remote record persists the chosen room/source, route estimate, hauling demand, state, resolved delivered total, gross spawn spending, and bounded actor IDs for event attribution. Traveler creep memory adds `targetRoom`, a scout destination timestamp, and per-room retry deadlines. Resetting JavaScript globals preserves these assignments.

Local haulers retain spawn/extensions → tower priority, then refill low worker buffers and bank remaining cargo. With usable owned storage, an upgrader requests energy below 15 ticks of active WORK consumption and receives up to 30 ticks, capped by carry capacity. This gap prevents continuous small worker top-ups from starving storage. Builders and urgent controller protection retain full refills; without usable storage, the former full-consumer policy remains. These thresholds live in `core.config.js`. During a source-output gap, an empty hauler can withdraw from owned storage for actual outstanding home demand, without withdrawing merely to top up buffered workers. One local distributor withdraws batches from storage and supplies spawn/extensions, towers, and low worker buffers even while source drops remain available. It retains spare cargo between refills. Source carriers continue collecting and bank surplus; the distributor uses the same delivery reservations and controller-formation traffic protections. Its body scales to six CARRY/MOVE pairs, and spawning/pending replacements are counted. Critical source mining/first transport and emergency workers keep priority; distribution precedes additional controller consumers and remote spending. Storage participates in established-layout reconstruction.

After home staffing is satisfied, one 50-energy MOVE scout surveys the block. Tower energy deficits, urgent controller downgrade, missing planned spawns/towers, and low CPU defer scout spawning. Ordinary construction, including storage, does not suppress scout replacement. Costly remote crews still wait for all established construction/reconstruction. Scouts prefer unseen nearby rooms, then old observations. Routes never cross the saved boundary, even as an intermediate step. Known foreign ownership/reservations, keeper lairs, invader cores, and recent hostile sightings prevent entry. New threats cause retreat; disconnected rooms remain unknown and are retried later. Intelligence records source slots, sources' observed capacities, controller/reservation facts, mineral, exits, and active hostile parts.

With owned storage holding at least 2,000 energy, an eligible adjacent neutral controller room can supply one remote source. The planner requires an observation no older than 500 ticks, an available source slot, no foreign ownership/reservation or NPC threat, and a complete terrain path costing at most 100 from storage. Hauling is sized conservatively for a fully reserved source at 10 energy/tick and the estimated round trip, with bodies capped at 12 CARRY/MOVE pairs. The bot commissions a collector first, then a five-WORK/five-MOVE drop miner, the remaining transport capacity, and a two-CLAIM/two-MOVE reserver when 1,300 spawn capacity permits it. The last increases reservation time faster than natural decay. Existing active crews continue when the storage reserve dips; new optional crew spending waits. Collectors wait near home storage until their producer reaches the source, avoiding early congestion at narrow source entrances. Loss of home ownership stops remote work with an explicit task reason. Local replacement requests always win arbitration. There is still just one room spawn coordinator; optional route surveys run afterward in their own fault boundary.

Every visible-room observation refreshes safety. Threats, stale vision, lost storage, unusable source slots, or a failed periodic route check pause the operation. Crews retreat and loaded haulers try to return their cargo to home storage. Fresh safe observations after the 1,500-tick threat cooldown permit resumption. Paused operations retain their identity; automatic alternate-source selection after a long pause is future work. Scouts can restore stale vision. No keeper mining, guards, remote containers, roads, claiming, or expansion of the saved block is enabled.

`remote.delivered` counts resolved energy transfer events into home storage, including a previous-tick actor that has since died. It does not count accepted transfer intents as successful deliveries. `remote.spawnEnergy` is cumulative gross crew spawning cost; these two counters are diagnostic, not amortized profit or proof of sustainable remote throughput. Initial live delivery has now been observed; sustained reservation, raid recovery, and replacement-cycle validation remain. The [expansion validation record](validation/2026-11-21-scouting-remotes-storage.md) distinguishes deterministic test coverage from observed engine behavior.

Mechanics checked against the [official Screeps API](https://docs.screeps.com/api/) on November 21, 2026: `Game.map.findRoute` supports Infinity route exclusion; PathFinder callbacks reject unauthorized rooms; reserveController uses adjacent CLAIM parts; storage unlocks at RCL 4; room event logs report completed transfers. The local observer is development tooling, not a game dependency.

The [storage distribution validation](validation/2026-11-21-storage-distribution.md) records the later deposit fix, dedicated distributor, and initial live remote deliveries. It supersedes the initial rollout's pending-storage observation without declaring the wider milestones complete.

# Stranger Enclave implementation plan

Repository: https://github.com/azcoigreach/stranger-enclave

Planning baseline: November 21, 2026. This is the implementation specification; milestones below are planned, not completed. Development and validation begin on a local server. Public shard selection follows evidence from those runs.

Implementation update: the first [core bootstrap slice](CORE_BOT.md) targets the existing localhost colony in `W5N1`, within `W1N1`–`W9N9`. It adds root game modules, behavioral tests, static checking, and basic placement/reporting. The dev colony now runs dedicated source miners, route-sized haulers, controller consumers, event-based economy measurements, and controller traffic recovery, and has reached RCL 3. See the [economy validation](validation/2026-11-21-economy-throughput.md). Milestones 0–1 remain open pending reproducible server tooling and sustained progression/recovery evidence.

Existing dev-world inventory was verified at tick 1899 on November 21, 2026: one 9×9 interior with 72 controller rooms, eight keeper rooms, and center `W5N5`, surrounded by 40 highway rooms (121 rooms total). Four other colonies occupy the interior corners. Future reproducible fixtures should account for this existing world; additional hostile staging rooms are not currently present outside its highway ring. See the [core bot guide](CORE_BOT.md#local-operation) for the dated observations.

## Objective and fixed requirements

Stranger Enclave autonomously builds and manages colonies throughout one fixed 9×9 sector interior. It develops every claimable room, secures the keeper rooms and center, defends against players and NPCs, and removes competing players from its territory. Codex handles development, documentation, tests, and deployment preparation; ordinary colony operation requires no manual building placement, flags, workforce settings, or tactical orders.

- Permanent expansion stays inside the starting sector's 81 interior rooms. Discover the block from the initial owned spawn and persist it; do not hardcode deployment coordinates. The saved boundary cannot drift as colonies expand or spawns are lost/rebuilt.
- Every controller room is a long-term colony target. Poor terrain or low source count changes priority and layout, not eligibility.
- In a standard sector interior, the expected inventory is 72 controller rooms, eight keeper rooms, and one center room. Validate the actual generated map and room objects before relying on this inventory.
- Controllerless rooms receive guarded resource outposts and permitted infrastructure; they cannot become owned spawn colonies.
- Early versions keep creep travel and military operations within the block. Future highway Power expeditions are a narrowly scoped exception, with no highway colonies or general outside expansion.
- No automatic abandonment of owned rooms or destructive base redesign. Recovery and support take precedence.
- One-time setup places the initial spawn; the bot derives the enclosing sector automatically. The local harness performs spawn placement automatically. With no saved territory and owned spawns in multiple sectors, report ambiguity instead of guessing. Total extinction with no surviving spawn or support colony requires a respawn/setup action and is reported explicitly; it does not silently move saved territory.

## Capacity and success definitions

The supplied account screenshot shows GCL 24, GPL 1, 260 CPU, and six rooms displayed on shard0. These are reference values, not a verified live allocation or inventory. Claim capacity depends on account-wide existing ownership; runtime CPU depends on the assigned shard limit. See the [control rules](https://docs.screeps.com/control.html) and [CPU API](https://docs.screeps.com/api/#Game.cpu).

Test both a fresh account profile and a GCL 24 reference profile. Full ownership of a standard block's 72 controller rooms requires at least GCL 72 if no other rooms consume ownership capacity. Reservations and defended remotes bridge that gap. A separate elevated-GCL fixture will exercise the full-colony architecture without pretending that the reference account already supports it.

Track three outcomes separately: all rooms surveyed, all accessible territory secured, and all claimable rooms colonized. A scouted room is not automatically secured. An occupied room is not automatically economically sustainable. Contested or inaccessible rooms remain explicit unfinished objectives.

## Local development environment

Use the official standalone Screeps server as the initial compatibility baseline. Its [current README](https://github.com/screeps/screeps#server-launch) lists Node.js 22 LTS or higher, Python 3, and build tools. Select and pin a verified server release, engine dependencies, and supported Node version during setup. Do not use the older Ubuntu/Node 8 tutorial as the installation recipe.

Keep the server, world snapshots, credentials, and generated logs separate from bot source. Bind the development service locally. Supply credentials through local ignored configuration. Provide repeatable commands to start/stop, seed a world, upload the bot, run scenarios, save snapshots, restore fixtures, and export reports. Snapshot restoration only affects the named test world.

Generate the 9×9 interior plus surrounding highways and hostile staging rooms. Preserve ordinary exits, source keepers, center behavior, and NPC mechanics where supported. Record engine version and enabled mods in each report. Compare important mechanics with the current API and engine behavior; document local/live differences rather than assuming parity.

Use accelerated development fixtures for late-game features, plus unassisted progression runs. Fixture resources and elevated controller levels never count as proof of autonomous growth. CPU results on local hardware are comparative evidence, not a guarantee of identical live CPU consumption.

## Code organization and contracts

Keep all working game code directly in the repository root as Screeps-ready JavaScript modules with JSDoc contracts and static checking. `main.js` exports the core tick loop through `module.exports.loop`. Use CommonJS modules and exact Screeps module names for imports, for example `require('economy.mining')` for root file `economy.mining.js`. Organize subsystems with filename prefixes rather than source directories. No compilation, bundling, module renaming, or directory-flattening step is required to run the bot.

The repository root is the working Screeps script directory. Keep tests, fixtures, local server tooling, and documentation in their own subdirectories outside the game module set. Upload tooling, when needed, sends root game modules unchanged and validates that their imports resolve within that set. Game modules must not depend on tooling, Node-only APIs, or files in subdirectories. Keep the game-facing main module readable.

| Root module pattern or support directory | Responsibility |
| --- | --- |
| `main.js` | Core tick sequence and top-level fault boundary |
| `core.*.js` | Configuration, scheduling, memory migration, CPU budgets |
| `territory.*.js` | Coordinates, fixed boundary, room classification, intelligence |
| `colony.*.js` | Colony state, priorities, support between colonies |
| `economy.*.js` | Mining, hauling, spawning, replacement, upgrades |
| `planning.*.js` | Terrain analysis, layout generation, validation, construction |
| `movement.*.js` | Route policy, path caching, traffic and stuck recovery |
| `defense.*.js` | Threat assessment, towers, safe mode, evacuation |
| `operations.*.js` | Claiming, remote mining, keeper outposts, combat campaigns |
| `industry.*.js` | Minerals, reactions, boosts, terminal logistics; later factories |
| `reporting.*.js` | Metrics, reason codes, alerts, console commands, visuals |
| `power.*.js` | Deferred Power Bank, processing, and Power Creep functionality |
| `tests/` and `tools/` | Behavioral tests, server harness, fixtures, upload and import validation |
| `docs/` | Architecture, memory schema, mechanics ledger, operations guide |

Aim for 100–250 lines per module; review files above approximately 300 lines for mixed responsibilities. Avoid giant role registries, broad prototype patches, hidden global dependencies, and premature generic frameworks. Each module documents inputs, outputs, memory ownership, scheduling, and failure behavior.

Systems produce requests and plans. One coordinator owns each creep's final intents, while respecting legal combinations of Screeps actions. Spawn requests have stable keys, priority, deadline, body constraints, and owning operation so that repeated planning cannot duplicate orders. Pure decision functions are kept separate from game actions where useful for testing.

## Tick execution and persistence

The main loop initializes/migrates memory, builds a tick snapshot, assesses threats, allocates budgets, executes critical defense and survival work, runs scheduled development and operations, resolves movement, and records results. Allocation reconciles competing tasks before orders are issued.

Defense, spawn survival, energy delivery, and controller downgrade prevention run first. Construction planning, market scans, and strategic analysis are staggered and resumable. A low CPU bucket disables optional work without disabling the colony's essential loop. Catch faults at colony/system boundaries so one bad room does not stop every colony; repeated failures are visible, throttled, and isolated.

Persistent memory stores schema version, block definition, colony plans, assignments, operations, intelligence timestamps, and bounded metric summaries. Persist IDs and positions rather than game objects. Global caches are disposable and rebuildable. Missing vision means unknown, not destroyed. Old assignments and stale intelligence expire through explicit rules. Migrations are versioned and tested against saved memory fixtures.

## Dynamic placement in every claimable room

No fixed full-base footprint is required. Plan structures individually or in small constraint groups that can be translated, rotated, separated, and connected through roads. Compact layouts are preferred where feasible; distributed layouts remain first-class valid results.

1. Survey terrain, exits, resources, controller, existing structures, legal tiles, and reachable components.
2. Reserve access and working positions for sources and controller. Identify routes that must remain open and space needed for future structures.
3. Score several possible spawn/storage locations for travel cost, connectivity, buildable area, and defensive exposure. Include the existing spawn in bootstrap plans.
4. Generate alternative placements for spawn infrastructure, extensions, towers, storage, links, terminal, and industry. Place labs according to actual reaction range constraints; do not assume that scattering labs is valid.
5. Connect positions with a road network. Validate creep access to work positions, structure interactions, exits, and future construction stages.
6. Build a defensive perimeter around viable clusters. Allow multiple defended clusters in fragmented rooms, with explicit transport exposure between them.
7. Produce RCL-specific construction phases and future reserved tiles. Complete survival infrastructure before optional industry or expensive defenses.
8. Validate legality, structure limits, connectivity, and critical ranges before placing construction sites. Respect the global construction-site limit.

Store plan version, selected candidate, score components, validation results, and unmet requirements. Planning runs incrementally with a CPU cap and resumes after resets. Replan on meaningful terrain/structure constraints or an explicit revision, not every tick.

If a complete preferred layout does not fit, try distributed and reduced optional infrastructure layouts while retaining a functioning colony. Report genuine impossibilities with the failed constraints. Never silently remove a room from the colonization list. Do not destroy the sole spawn or functioning infrastructure to implement a new plan; relocation requires a separately tested staged procedure.

Planner fixtures cover open rooms, swamp-heavy rooms, narrow corridors, fragmented terrain, awkward controller/source positions, existing structures, and all quadrant coordinate boundaries. Acceptance requires legal, reachable layouts across the fixture corpus, with failures explained rather than hidden.

## Economy and construction autonomy

Begin with a small emergency worker capable of harvesting, refilling, building, and upgrading. Transition to dedicated miners, haulers, builders, and upgraders as capacity grows. Select creep bodies from available energy, route terrain, travel distance, and replacement deadlines.

Workforce demand comes from measured throughput and outstanding work. Hauling capacity includes round-trip time and loading delays. Replacement planning includes spawn time and travel to the assignment. A dead miner must not leave the room waiting for an unaffordable large body.

Budget energy in this order: immediate survival and defense, critical replacements, sustainable transport, controller protection, essential construction, then expansion and optional upgrading. Use explicit reserves and hysteresis so priorities do not oscillate every tick. Shared haulers reserve jobs to prevent duplicate deliveries. Repair targets reflect actual threat and available income rather than unbounded wall growth.

New colonies receive temporary construction and transport support from parents. Support has a budget, route, expiry, and reassessment rule. Claiming is gated by capacity, route safety, ability to build the first spawn, replacement funding, defense capacity, and CPU headroom. All controller rooms remain eventual targets even when some need permanent net imports.

## Intelligence, movement, and expansion

Implement a single signed-coordinate conversion with tests at E/W and N/S boundaries. All claim, reserve, travel, harvest, and combat decisions consult the same territory policy. Pathfinding cannot silently route through forbidden rooms. Incomplete paths are treated as incomplete.

Scout the full block and store observation age, ownership, sources, mineral, exit connectivity, hostile capabilities, and NPC structures. Revisit frontier and contested rooms more frequently. Preserve uncertainty when vision is lost. Evaluate targets using current information or dispatch reconnaissance before committing a costly force.

Expand through connected supportable rooms. Cache paths, invalidate on material changes, resolve traffic conflicts, and detect repeated lack of progress. If a room cannot currently be reached within policy, mark it blocked with its reason and retry when evidence changes.

## Defense, keeper rooms, and warfare

Assess active body parts, boosts, healing, tower influence, terrain, and reinforcement distance. Separate player threats, source keepers, NPC raids, lesser invader cores, and strongholds. Current [NPC documentation](https://docs.screeps.com/invaders.html) describes strongholds and lesser cores, including cores in reserved rooms; reservation alone is not treated as security.

Home defense coordinates tower targeting, defender spawning, repairs, evacuation, and safe mode when legal and justified. Workers retreat to validated safe positions. Colony-wide allocation prevents simultaneous threats from consuming every replacement slot.

Keeper operations require guard coverage, lair timing awareness, an evacuation route, and haulers that avoid active danger. Dispatch workers only after the area is secured. Resume after threat clearance. Stronghold combat is a later independent capability, not an assumption of the first keeper implementation.

Offense progresses from disrupting enemy miners and haulers to sustained resource denial, then coordinated sieges and controller pressure. Each operation follows scout, assess, assemble, travel, engage, secure, and recover states, with cancellation and retreat transitions. Track budget, losses, reinforcements, target progress, and intelligence age. Preserve economic staffing and do not pursue enemies outside policy. Enemy outside support means local resource denial cannot guarantee total starvation.

## Reporting and operator controls

Console summaries default to every 100 ticks, with longer 1,000-tick trends. Events emit immediate messages on meaningful state changes; repeated alerts are deduplicated. These intervals are initial defaults, tunable from observed overhead.

| Category | Measurements and decisions exposed |
| --- | --- |
| Economy | Harvested and delivered energy, storage delta, spawn/build/repair/upgrade spending, imports and exports |
| Staffing | Required versus active workers, replacement deadlines, spawn utilization, queue delays |
| Planning | Layout validity, phase, blocked placements, access failures |
| Defense | Hostile assessment, tower reserves, losses, retreat and safe-mode reasons |
| Territory | Owned/reserved/contested/unknown rooms, intelligence age, next targets and blockers |
| Operations | State, budget consumed, delivered resources, casualties, progress and abort reason |
| Runtime | Average, p95 and peak CPU, bucket trend, memory size, errors and deferred work |

Use rolling bounded aggregates. Distinguish measured delivery from estimates and account for transfers so imports are not confused with production. Report energy sustainability together with spending: healthy construction may intentionally draw down reserves. Report remote profitability after amortized creep, transport, and defense costs.

Provide status(), roomReport(name), territoryReport(), operationReport(id), and explain(name). Add room/map visuals for construction plans, threatened routes, and territory status. Operational overrides are optional troubleshooting tools; ordinary operation must not require them. Every pause has a reason and a measurable resume condition.

## Implementation sequence and acceptance gates

| Milestone | Deliverables | Exit evidence |
| --- | --- | --- |
| 0 Local foundation | Pinned server, test world, direct root-module upload tooling, import validation, static checks, mechanics ledger | Reproducible setup, working core loop, reset recovery, verified block coordinates |
| 1 Survival and reporting | Bootstrap economy, spawn priorities, bounded metrics, initial dynamic placements | Unassisted RCL 1–3 growth; recovery from miner/hauler loss; no manual building placement |
| 2 Dynamic colony development | Full terrain planner, construction phases, transport, towers, links/storage as unlocked | Fixture layouts valid; unassisted path to RCL 6; difficult terrain handled explicitly |
| 3 Resilience and remotes | Defense, reservations, route safety, support logistics | Raids, energy shortage, route blockage, lost vision, and CPU pressure pass recovery scenarios |
| 4 Multiple colonies | Claiming, first-spawn building, shared budgets, RCL 8 infrastructure | At least three colonies on contrasting terrain develop without manual intervention; GCL cap respected |
| 5 Center and keepers | Secure outposts, guards, evacuation, remote profitability | Positive measured delivery after operating costs over three replacement cycles; guard loss triggers safe retreat |
| 6 Industry and campaigns | Boost supply, coordinated squads, denial, siege, staged stronghold capability | Defined opponents defeated within scenario budgets; unfavorable operations retreat; home economy survives |
| 7 Full block scale | GCL 24 reference run, elevated-GCL 72-colony fixture, distributed support | All 81 rooms accounted for; all legal colony targets planned; scaling limits and unresolved contests reported |
| 8 Deferred Power | Highway expeditions, power processing, Power Creeps | Separate profitability, timing, safety, and CPU tests before enabling |
| 9 Live readiness | Server compatibility review, candidate block/shard assessment, release and rollback package | Local gates pass; measured capacity and remaining risks guide deployment decision |

Milestone 8 remains a future priority and does not block initial live readiness. Milestone ordering is dependency-based, not a calendar promise. First deliverable is milestones 0–1, including the earliest planner and reporting slice; combat does not precede a reliable bootstrap economy.

## Validation and release discipline

Unit tests cover boundary arithmetic, budgets, replacement timing, spawn arbitration, layout legality, and operation transitions. Tick-level tests cover intent arbitration, missing objects, errors, memory migration, and global resets. Local server scenarios exercise actual movement, spawning, construction, combat, and recovery.

Keep regression tests deterministic: explicit game ticks and CPU inputs, isolated runtimes, saved state fixtures, and no network, wall-time, or unseeded-random dependencies. For bug fixes, retain a failing reproduction before changing code. `npm run validate` includes tick-replay equivalence and targeted mutation checks; the prepared CI workflow runs the same gate on pushes and PRs. See [testing discipline](TESTING.md) for fixture contracts and the distinction between mock evidence and engine scenarios.

Use saved terrain fixtures and seeded test inputs where controllable; record randomized engine behavior rather than promise deterministic combat. Run sustained scenarios for at least three worker replacement cycles and a 50,000-tick milestone soak, extending when controller progression or combat objectives require it. These are initial acceptance windows, not claims that RCL 8 can be reached in 50,000 ticks.

Initial performance target: peaceful average CPU below 70% of assigned budget, p95 below 90%, no unexplained sustained bucket decline, no unbounded memory growth, and no CPU-caused loss of critical staffing. Stress tests verify graceful degradation. Tune thresholds from measurements, preserving documented headroom for combat.

Every report records code revision, engine version, fixture, GCL/CPU profile, starting state, duration, interventions, outcomes, and failures. No manual intervention may be hidden in an autonomous-success claim. Capture regressions before changing behavior. A milestone is complete only when its exit evidence exists.

Use `feature → dev → main` as the branch flow. `main` holds the most stable, validated version; `dev` integrates ongoing development and stabilization. Create short-lived `feature/`, `fix/`, or `docs/` branches from the latest `dev`, keep changes small and reviewable, and target their PRs at `dev`. Do not commit or push directly to either shared branch, or rewrite their history. Initial creation of `dev` uses the current `main` baseline.

Feature PRs include relevant checks and scenario evidence for their scope. Promote `dev` to `main` through a separate release PR only when the included scope passes its applicable milestone acceptance gates, regressions are resolved, and the validation evidence identifies the tested revision. If `dev` changes after validation, validate the new release candidate before promotion. Human review owns approval and merging for both feature and release PRs; passing checks alone do not authorize a merge. Until the first implementation passes its gates, `main` remains the planning baseline rather than a claim of a working bot.

Maintain a known-good deployment artifact and memory compatibility policy; test rollback against migrations before release. Record the promoted revision and its evidence so the stable version can be reproduced. Live deployment, shard choice, and disposition of existing colonies are later decisions.

## Deferred Power scope

Power development includes discovery of highway Power Banks near the block, attack/heal/haul planning, timed resource collection, transport home, processing through Power Spawns, and useful Power Creep operations. Power is an end-to-end resource system rather than merely an attack role.

A separate expedition permit constrains destination rooms, maximum distance, expiry, and return route. It permits highway travel and collection without widening the ownership boundary or enabling unrelated warfare outside it. Start only when bank lifetime, available damage/healing, spawning and travel time, hauling capacity, hostile risk, and home reserves support the operation. Record failed collection as a loss.

Reserve lawful Power Spawn space in mature dynamic layouts now. Implement processing and Power Creep management later, including energy budgets, spawn/renew lifecycle, ops supply, and explicit selection of useful powers. GPL 1 in the screenshot is a reference, not a reason to require Power for bootstrap success.

## Mechanics and documentation maintenance

For each subsystem maintain a short ledger of API assumptions, official source URL, verification date, local engine version, and tests that exercise consequential behavior. Consult the [current API](https://docs.screeps.com/api/), [official changelogs](https://blog.screeps.com/categories/Changelogs/), and relevant official engine code. Verify behavior when sources conflict. Documentation age alone is not a diagnosis of the previous bots' failures.

Keep the README focused on setup and operation; document module contracts, memory fields, planner constraints, recovery behavior, and report definitions beside the implementation. Update this plan as measured results change priorities, preserving the fixed territory and autonomy requirements.

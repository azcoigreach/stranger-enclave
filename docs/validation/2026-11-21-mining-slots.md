# Mining slots and source reassignment

November 21, 2026. Uncommitted work on `feature/core-bootstrap`, based on `ab1a8fe1485a15a957888bfe82678f8fbca0b7e4`; no branch promotion or remote CI result is claimed.

The user reported multiple harvesters competing for a source with only one usable tile after resetting the world. The old assignment stored only a source ID and approached at range one; it neither counted available tiles nor reserved distinct positions. This affected both dedicated miners and early bootstrap harvesters.

`economy.mining.js` now surveys adjacent terrain, structures/sites, and complete local paths; preserves working occupants; reserves exact tiles for incoming harvesters; and redirects excess miners to another source with available space and unmet mining demand. Candidate routes block stationary harvesters. Geometry caches contain plain coordinates and rebuild after topology changes or 100 ticks; assignments are tick-local and saved creep coordinates are revalidated after resets. Transient occupancy affects availability, not the permanent slot count. Shared tile reservations also prevent collisions if adjacent sources share a usable tile.

Spawn requests respect usable slot capacity while retaining one aging replacement through existing viable-body accounting. When no productive slot is free, a replacement retains its source, approaches range two, and waits instead of contesting the occupied tile or oversupplying an already fully staffed source. A released slot becomes eligible on the next tick. No creep is destroyed or forcibly displaced. The room report exposes per-source slot, assigned, and waiting counts.

## Evidence

The initial three regression cases failed before the implementation: dedicated miner reassignment, bootstrap reassignment, and distinct incoming reservations. Additional failing cases captured waiting too far from the source and paths through stationary harvesters before those fixes. The final suite also tests walls, containers versus blocking structures, disconnected tiles, foreign occupancy, slot release, limited-body staffing, pending replacements, fully staffed alternate sources, resets, and insertion-order stability.

`npm run validate` passes strict root syntax/import/type checks, all **83 tests**, and the independent-process deterministic replay comparison. Replay SHA-256 is `9701bca21bbcfccc0e5a165867e83f9a4696b71812883b0d795c3b0118b1acc2`. Existing replay expected actions were retained. The tower-ordering test fixture gained `id` and `pos`, matching fields present on real structures; its ordering assertion was not weakened. The trace changes reflect additive mining diagnostics and coordinate reservations.

After the reset, the former home had no spawn. Read-only discovery found the active bot in `W6N8`. At tick 31120 the live room reported three usable slots at source `(16,7)` and one at `(32,13)`, one miner assigned to each, and no alerts. At tick 31293 the three-slot source held two reservations during a normal replacement overlap, while the one-slot source retained one. By tick 31472 the sources again had one reservation each, with no waiting miners or bot alerts. The final [live snapshot](2026-11-21-mining-slots-live.json) records positions/tasks and saved assignments.

All 20 active runtime module sources were verified against installed files after dependencies and callers were activated in compatible phases. See the [source manifest](2026-11-21-mining-slots-modules.sha256). Development code remains in the repository root. No room identity, source ID, or mining coordinates are hardcoded into game modules. No world objects or bot memory were manually edited to create the observed outcome.

The exact one-slot contention/reassignment case is proven by deterministic fixtures, not by injecting extra miners into the user's live world. Live snapshots verify real slot geometry, assignments, replacement overlap, and absence of recorded errors; they do not constitute a full movement-engine simulation or sustained recovery soak. This change does not add general traffic arbitration or alter the established controller/building/tower delivery priorities.

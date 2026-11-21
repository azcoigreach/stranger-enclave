# Scout replacement during storage construction

November 21, 2026, feature/scouting-remotes-storage (uncommitted).

At tick 50400, the live account had no scout, home staffing met its targets, and storage remained a construction site at 15,799/30,000 progress. The general incomplete-layout check returned before the scout request, suppressing replacement for the duration of construction. The original scout's exact disappearance cause was not recorded.

The scout request now precedes the ordinary construction gate. Local production deficits, hostiles, tower energy deficits, controller downgrade urgency, CPU pressure and missing planned spawn/tower structures still take priority. Remote crew spending continues to wait for all established construction. There are no room-specific exceptions.

Two failing deterministic regressions reproduced missing and aging scout suppression during storage construction. A third test preserves remote crew construction gating; existing tests retain critical construction and home recovery priority. Pending scouts are counted, including after memory serialization/global reset. Full staged validation passed: 130 tests, strict checks for 26 modules, and unchanged independent-process replay digest 0f9ef580cbf92e309d05e32ff68b06ac47f6b484282388ac71ec530bbc8b0103.

After activation, the bot autonomously spawned scout-W6N8-50522-416 at tick 50522. At tick 50528 it was alive, moving through home toward W5N9 via W5N8, with task SCOUT_W5N9 and no bot alerts. No manual spawning, resource injection, or memory edits were used. The deployed operations.remote module was source-verified against the tested file.

Module SHA-256: 351dd845195fc56182362c8351a4eb31730dc8ce541dcf03c5e645bee5b02a8a

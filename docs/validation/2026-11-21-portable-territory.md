# Automatic territory discovery — November 21, 2026

The bot now derives its home and sector from the initial owned spawn, then retains the saved territory through expansion, resets, and spawn loss. Root game modules contain no deployment-specific room literals. This change removes location configuration; it does not establish full official-server readiness for the remaining bot systems.

## Revision and checks

- Branch: `feature/core-bootstrap`, uncommitted changes based on `ab1a8fe1485a15a957888bfe82678f8fbca0b7e4`.
- [Exact root-module SHA-256 manifest](2026-11-21-portable-territory-modules.json).
- `npm run validate`: passed in staging and in the installed repository, including strict static checking, root-import checks, and 37 behavioral tests.
- Sector membership tests exercise 144 starting-room combinations across all quadrants and multiple offsets, enumerating each 81-room interior and checking highway exclusions.
- Fresh-start integration fixtures run the actual tick loop in `E23S47`, `W73N12`, `E91N89`, and `W19S31` with unchanged configuration. These are mocked official-style room coordinates, not runs on the official service.
- Additional checks cover empty starts, multiple same-sector spawns, ambiguous multi-sector starts, hostile spawns, spawn loss, global resets, legacy migration, invalid saved boundaries, and accidental fixed-room literals in game code.

## Local activation and migration

The pre-migration observation at tick 2162 contained schema 1, four active workers, and the existing W1N1–W9N9 bounds. The new additive territory module was installed and verified against the server's active source before the memory migration was installed. Reporting was then synchronized and verified before removing the old location settings. This sequence kept intermediate module combinations compatible.

At tick 2204, memory had migrated to schema 2 with home W5N1. The block was identical, all four worker names matched the pre-migration observation, and the bot error history was empty. No manual memory edits, worker resets, world changes, or resource injections were used.

The [final runtime snapshot](2026-11-21-portable-territory-smoke.json), read at server tick 2226, showed:

- Schema 2, discovered home W5N1, retained 81-room boundary.
- Four active workers and `WORKFORCE_READY`.
- RCL 2, with an extension placement recorded at (17,26).
- No recorded bot errors; CPU bucket 10,000.

The current server profile remains assigned CPU 100 with stored GCL progress 0. Engine version/mods remain unverified; the earlier HTTP response reported protocol 14. Runtime observations span ticks 2162–2226, not a sustained progression or recovery acceptance run. The latest CPU window also includes earlier ticks across this deployment and is not a clean benchmark of the new revision.

## Persistence and rollback limits

Fresh deployment uses `Game.spawns` and room names only; no private-server service is needed by game modules. Saved territory takes precedence forever unless explicitly transitioned for a new empire. A fresh account with spawns already spread across sectors reports ambiguity rather than selecting an arbitrary block.

Schema 1 is migrated in place without resetting colony data. The saved-fixture tests establish field preservation and idempotence. A code rollback must keep the schema-2-compatible memory reader and territory helpers; the original schema-1-only reader cannot read upgraded memory. A reverse memory migration has not been implemented or validated.

# Core bootstrap validation — November 21, 2026

Result: the first core bot slice passed static checks and 22 behavioral tests, synchronized to the active localhost branch, and spawned working harvesters. This is smoke-test evidence, not completion of milestones 0–1.

## Code and environment

- Git branch: `feature/core-bootstrap`, uncommitted implementation based on `ab1a8fe1485a15a957888bfe82678f8fbca0b7e4`.
- Exact root-module contents: [SHA-256 manifest](2026-11-21-core-modules.json). Installed files matched the tested staging files byte-for-byte.
- Local server: `127.0.0.1:21025`; read-only observations through its CLI on port 21026. HTTP API protocol 14. Engine release and enabled mods are not yet verified or pinned.
- Active game-code branch: `stranger-enclave`; all 12 root modules confirmed present.
- Starting world: existing `W5N1` colony, RCL 1, `Spawn1` at (20,27) with 300 energy, no bot workers. The world was not reseeded or restored for this run.
- Account profile: assigned CPU 100; stored GCL progress 0. This is not the earlier GCL 24 reference fixture.
- Development checks: Node 22.22.1, TypeScript 7.0.2, Screeps types 3.4.0, pinned lockfile.

## Automated checks

`npm run validate` passed both in staging and in the installed repository:

- Syntax/import validation for 12 root modules and strict JSDoc static checking.
- 22 behavioral tests, zero failures, covering boundaries, persistence, recovery spawning, intent arbitration, worker tasks, movement restrictions, CPU deferral, bounded reporting, and basic placement.

Mocks exercise the actual tick entry point but do not reproduce engine intent resolution, travel timing, or full controller progression. A test's initial scheduling fixture used the wrong staggered tick; it was corrected before installation, and the complete suite then passed.

## Local observations

Activation began at tick 1673. The final stored observation is through bot tick 1795, a 123-tick observation window. [Raw runtime snapshot](2026-11-21-core-smoke.json) was read at server tick 1796; database objects and memory may differ by one tick because the simulation continued during reads.

- The first 200-energy worker spawned at tick 1673 and was observed harvesting successfully with 44 carried energy at tick 1717.
- A second worker spawned at tick 1744. At the final snapshot, both workers were active: one returning with 50 energy for spawn refill and the other harvesting a different source with 46 energy.
- Bot error history was empty in the observed snapshots. Persisted territory bounds matched the configured 81-room block.
- The latest 100 recorded ticks showed average CPU 0.921, p95 1.535, peak 17.018, and bucket 10,000. These early local measurements are diagnostic only and do not establish scale or live-shard performance.
- The controller remained RCL 1 with zero upgrade progress at the final snapshot; startup staffing/refilling was still in progress. Construction and upgrading were tested with mocks but not yet demonstrated in this live observation window.

Interventions: installed the tested code, dependencies first and `main.js` last; queried read-only state afterward. No resources were injected, workers killed, structures manually placed, memory edited, or server settings changed during observation. The spawn and room ownership predated the run.

## Outstanding evidence

Still required: reproducible server/version/mod configuration; terrain fixture coverage beyond the basic planner tests; actual construction and RCL 1–3 progression; recovery over three worker replacement cycles; the 50,000-tick milestone soak; and deeper CPU/memory stress scenarios. No milestone is marked complete by this report.

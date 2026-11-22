# Controller supply corridor correction

November 21, 2026. Uncommitted work on `feature/core-bootstrap`, based on `ab1a8fe1485a15a957888bfe82678f8fbca0b7e4`. No branch promotion or remote CI result is claimed.

The user observed carriers traveling around the large terrain obstruction south/east of the controller in the fresh-world home `W6N8`. The previous trap-prevention policy blocked every tile within range two of the controller. On captured terrain, an independent eight-way search found an 11-step spawn-to-worker approach without this exclusion and a 34-step approach with it. This is a terrain/policy comparison, not a measured live round trip including fatigue and traffic.

Carrier movement now blocks individual reserved stations and current nearby worker tiles. Other controller-side corridor tiles remain legal. Station planning uses all legal upgrade-range tiles and ranks candidates by actual path length from the spawn. Each accepted station reserves a supply path; later stations cannot occupy that path. The layout rebuilds after workforce/topology changes or 100 ticks and contains only plain coordinates.

Recovery still handles trapped carriers and clears carriers occupying reserved worker stations. An open exit now permits ordinary delivery/transit near the controller, instead of forcibly evacuating every carrier that enters the old square. Coordinated swap intents remain protected from role overrides. This is still a local controller solution, not a complete room traffic solver.

## Validation

Both new regression cases failed against the original implementation: the carrier took the 34-step detour, and the old fixed formation could not provide eight suitable stations in the captured terrain. The retained fixture in `tests/fixtures/controller-corridor.json` uses a neutral test room name and real terrain. The independent grid helper applies terrain walls and runtime cost callbacks but does not simulate full Screeps movement, fatigue, or collisions.

The final tests require a direct carrier approach of at most 12 steps, eight unique stations within upgrade range, and a complete supply route of at most 12 steps to every station with all station tiles blocked. Reset results must match. Another regression verifies that an unobstructed carrier near the controller is not assigned forced recovery. Existing enclosure, coordinated swap, fatigue, obstruction, and boundary tests still pass.

Earlier tests asserting a fully blocked range-two square and exactly range-two stations were deliberately updated to assert occupied-tile protection and legal upgrade range. Those old policy assumptions caused this detour. The independent terrain tests strengthen route/access assertions rather than merely changing expected output to match the implementation.

`npm run validate` passed in staging and after installation: 20 root modules passed syntax/import/type checks, all **86 tests passed**, and independent-process replay traces matched SHA-256 `9701bca21bbcfccc0e5a165867e83f9a4696b71812883b0d795c3b0118b1acc2`.

## Live observations

Deployment installed the expanded station API first, verified carrier movement no longer depended on the removed blanket-exclusion API, and then activated lane-aware recovery. All three changed runtime modules were individually verified against active server sources. The [module manifest](2026-11-21-controller-routing-modules.sha256) records the final code.

At tick 32803, workers had begun occupying the spawn-facing controller approach. Six read-only snapshots from tick 32838 through 32879 show workers along `(36..40,20)` receiving energy and upgrading, with carriers approaching through the north-side delivery area. No bot alerts were recorded. At tick 32846, all five observed upgraders held energy and were upgrading. See the [position and progress observations](2026-11-21-controller-routing-observations.json).

No server/world/creep/memory edits were used to force the result. Live observations confirm relocation and resumed deliveries; the exact 34-versus-11 path comparison comes from the captured terrain fixture, not from instrumented live travel time. Sustained congestion and replacement-cycle throughput remain separate validation work.

# Link feeding during continuous spawning — November 21, 2026

At tick 129821, both owned links were empty while storage held 242,835 energy. The last recorded link transfer was at tick 126543. Every carrier, including the storage distributor, chose spawn/extension deficits before the hub. Continuous replacement spawning therefore starved the controller supply despite available stored energy.

Storage distributors now start a link-service cycle below 400 combined hub/receiver energy and continue until at least 800 is buffered. The cycle persists in `feedingLink` across resets. Source haulers retain normal spawn/tower priority. Service requires storage above the configured/current budget reserve floor, a complete active link pair, and a mobile source hauler. An idle spawn with an energy deficit, a tower below 500 energy, or tower demand during hostiles interrupts priority service. Existing delivery reservations prevent overbooking link capacity. These gates restore ordinary logistics rather than disable all link delivery.

## Validation

The continuous-spawning regression failed before the fix. Tests cover buffer hysteresis, reset midway through refill, interrupted service for recovery/threat/reserve/infrastructure conditions, shared distributor reservations, and continued spawn-first source hauling.

Staged and installed `npm run validate` pass **237 tests**, checks for **39 root modules**, and independent-process deterministic replay. Replay SHA-256 remains `221f793ab30346881ce44e1305ad52fc3b46eba6d093bcf3f3129652b6f8ddf8`. Fixture expectations were not regenerated. `git diff --check` passes.

## Live outcome

All installed runtime module texts matched the localhost server. Observations over ticks **130153–130204** showed actual energy changes:

- The hub reached 800 energy, sent 800 at tick 130155, and the receiver held 776 at tick 130156.
- Receiver energy then fell in worker-sized withdrawals; subsequent sends included 300, 333 and 160 energy.
- At tick 130204 the receiver held 795 energy and the hub retained 107.
- Controller progress increased from 511,041 to 511,666, a gain of 625 over 51 ticks.
- The distributor resumed spawn and extension deliveries after filling the buffer.

CPU average/p95/peak were 12.73 / 17.17 / 34.45, bucket 10,000, with no bot alerts. This demonstrates the supply loop operating after the fix; it is not a long-term throughput acceptance test. No resources, creep orders or memory were injected. Changes remain uncommitted alongside the traffic follow-up on `feature/rcl5-perimeter-links`. The [runtime manifest](2026-11-21-link-feeding-modules.sha256) identifies the deployed code.

# Tower refill correction

November 21, 2026; uncommitted work on `feature/core-bootstrap`, based on `ab1a8fe1485a15a957888bfe82678f8fbca0b7e4`. Feature/dev/main promotion has not occurred.

At tick 52373, the owned tower held 500/1,000 energy. Haulers excluded towers at or above 500 energy, and fallback generalists excluded them at or above 700. These thresholds left a partially filled defensive reserve even when the economy could supply more.

Both delivery paths now use the tower's actual free energy capacity. Spawn/extension refills retain priority; towers follow, then normal consumer/build/upgrade work according to each role's existing policy. Existing tick-local reservations limit aggregate delivery to available capacity. No tower capacity or room identity is hardcoded.

The regressions failed against the unchanged staged implementation before the fix. `npm run validate` passed all 72 tests, strict syntax/import/type checks, and independent-process replay comparisons in staging and after installation. Replay SHA-256 remains `b4ae49040f90cc0ef6031484830f1dc8a44bd473059e62462f304a16b0ac8adf`. Tests cover both roles above old cutoffs, capacities other than 1,000, a one-energy deficit, global resets, spawn/extension priority, full-tower fallback, aggregate delivery reservations, and ownership.

Only the two compatible economy modules changed at runtime. Both synchronized sources were verified before observing the result. The tower reached 800 energy at tick 53089 and **1,000/1,000 at tick 53233**, with no bot alerts. Energy was delivered autonomously; no world or memory edits were used to fill it. The read-only observer now includes towers and storage capacities so this condition is visible in future reports.

See the [before/after observations](2026-11-21-tower-observations.json) and [runtime source manifest](2026-11-21-tower-modules.sha256). Filling a tower verifies fuel logistics; it does not prove combat readiness, automatic safe mode, or sustained attack recovery. Engine/mod pinning and broader defense validation remain open.

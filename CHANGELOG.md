# Changelog

Changes are tracked by GitHub issue and summarized here for each release. Versions use MAJOR.MINOR.PATCH; the runtime source of truth is `version.js`. A version is released only when its tag and GitHub Release are published.

## [Unreleased]

- Mobile defense classifies observed threats, sizes affordable melee or ranged/healing defenders, preserves critical economy spawning, and escorts or evacuates civilians along validated in-block routes. Incident budgets and fresh-vision clearance prevent repeated replacement losses and premature returns ([#14](https://github.com/azcoigreach/stranger-enclave/issues/14)).

- [#9](https://github.com/azcoigreach/stranger-enclave/issues/9) ranks eligible adjacent remote sources by estimated net energy delivered. Multiple sources can share one room reservation. Source crews, deposits and measured losses are tracked separately.
- Scouts and other travelers can pass an engineer waiting for defense funding or reserves ([#21](https://github.com/azcoigreach/stranger-enclave/issues/21)).

## [0.1.0]

First versioned release candidate. Release tracking: [#5](https://github.com/azcoigreach/stranger-enclave/issues/5).

### Added

- Automatic discovery and persistence of the starting 9×9 block, root-only Screeps modules, and colony diagnostics.
- Dedicated mining/hauling, storage, scouting, adjacent remote mining and reservation.
- Terrain-based perimeters, future RCL 8 building reservations, RCL 5 links, and reserve-aware engineering with RCL 4–8 barrier goals.
- A startup version banner, metadata consistency checks, issue templates, release branches and automated publication from reviewed `main` promotions.

### Fixed

- Reconstruction at remembered building positions while allowing removal of off-plan walls/ramparts.
- Controller formation transit reversals, incomplete remote paths, creep congestion and idle storage obstruction.
- Link starvation during continuous spawning and reservation starvation behind extra remote haulers.

### Known limitations

- Remote selection is first-eligible, adjacent-only, and one source per room; it does not rank all candidates by profitability.
- Claiming, full player-raid defense, industry operation and complete sector colonization are not implemented.
- RCL 6–8 policies have deterministic coverage; live progression acceptance remains open.

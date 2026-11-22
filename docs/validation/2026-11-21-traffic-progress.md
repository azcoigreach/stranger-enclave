# Colony traffic recovery — November 21, 2026

Read-only observations confirmed persistent failures rather than normal fatigue. Between ticks 128638 and 128655, an engineer alternated between (41,23) and (42,22), with `ENGINEER_FORTIFY` and `EXIT_CONTROLLER` alternating. Formation recovery was reversing legitimate travel across a reserved worker station. Other engineers waited behind this traffic. A remote miner repeatedly visited the mineral-side partial-path endpoint at (4,18)/(5,19); its inter-room movement still used unchecked `moveTo`, unlike scouts. A scout remained blocked at (37,19).

## Changes

- Persist plain movement destinations so formation recovery respects active transit. Idle/no-route enclosure recovery remains available.
- Share tick-local holds between formation escape and yielding. Coordinated moves cannot be overwritten by later role movement.
- Allow mobile travelers with recent unfinished goals to yield a legal adjacent tile or swap. Protect stationary mining/reservation work, fatigued creeps and completed work positions; ranged-work displacement retains work range.
- Extend checked complete-route recovery to stalled home roles. Detect two-tile oscillation and retain recovery for 100 ticks after movement resumes.
- Require complete inter-room paths for all remote roles. Prefer paths avoiding occupants, retry static geometry when necessary, inspect the next tile, and invalidate blocked cached paths.
- Give waiting remote haulers reserved parking away from storage access. Check open terrain, infrastructure/resource setbacks, adopted interior membership and complete approach paths. Release parking when travel resumes.
- Expose current movement goals and traveler fatigue through the read-only observer.

The first deployment cleared the controller loop and remote dead end. Follow-up observation exposed waiting haulers crowding storage and carriers alternating between two tiles. The parking and persistent-recovery changes address those additional cases. No creep was suicided or manually moved; no world state, energy or intel was injected.

## Regression validation

Four initial tests failed before the first fix. Parking and oscillation cases also failed before their follow-up. Coverage includes reset-equivalent transit ownership, incomplete remote routes, opposing engineers, protected workers and fatigue, blocked cached paths, persistent recovery, and parking across resets. Historical movement assertions now inspect explicit path destinations and complete-search options. Remote replay reinstalls the same mocked search service after reset; expected fixture actions were not regenerated.

Staged and installed `npm run validate` pass **234 tests**, strict checking for **39 runtime modules**, and independent-process deterministic replay. Final replay SHA-256 is `221f793ab30346881ce44e1305ad52fc3b46eba6d093bcf3f3129652b6f8ddf8`; persisted movement-goal/history diagnostics change the trace from the prior commit. Python observer syntax and `git diff --check` pass.

## Live verification

All 39 installed module texts matched the active server after both deployments. In the final sampled window, ticks **129467–129518**:

| Workforce | Observed result |
| --- | --- |
| Distributor | 23 distinct positions; continued deliveries |
| Four active engineers | 18–30 distinct positions each; two ended issuing successful repairs |
| Five source haulers | 21–27 distinct positions each; pickup/delivery/storage work continued |
| Home miners | Both harvesting successfully at their source positions |
| Scout | 27 distinct home-room positions, continuing its survey route |
| Three returning remote haulers | 23–29 distinct home-room positions, carrying 600, 600 and 128 energy at sample end |

The formerly trapped remote miner was observed harvesting in its target room at tick 129435. The other remote's hauler was also checked across room transitions: it returned, deposited, departed and reached pickup range again, rather than bouncing at an exit.

Two engineers were intentionally paused by funding, upgraders were waiting for energy, and one remote creep was spawning. These stationary states are distinct from movement failure. CPU average/p95/peak were **9.04 / 11.61 / 38.24**, bucket **10,000**, with no bot alerts. The sample demonstrates restored progress, not indefinite deadlock freedom or a general optimal traffic scheduler. Parking has deterministic coverage; the waiting crew had already departed once its producer arrived, so this final window is not a sustained live parking acceptance test.

Changes are uncommitted on `feature/rcl5-perimeter-links`, following commits `6f53443` and `57596a5`. The [runtime manifest](2026-11-21-traffic-progress-modules.sha256) identifies the installed follow-up.

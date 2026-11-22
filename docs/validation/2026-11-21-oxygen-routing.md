# Oxygen-side engineer routing — November 21, 2026

Engineers were oscillating near the oxygen mineral while targeting the western wall at (2,37). At tick 120117 two engineers remained at (4,18) and (5,19), with their energy untouched. The terrain has no direct passage south from that pocket: an independent eight-direction search on the observed obstacles finds a 103-step route from (5,18) to repair range, initially going north and then around the room.

Two behaviors combined. `moveTo` could follow partial search output without the bot checking its endpoint. Separately, controller station costs blocked both vacant reserved positions and actual worker positions; together those sets disconnected a route that remained open when only occupied positions were blocked. The captured fixture reproduces this exact connectivity difference. Increasing the search allowance alone cannot cross a false obstacle. An initial activation with complete-route checking alone made the engineers stop with `ERR_NO_PATH`; the final retry policy corrected the reservation conflict.

Engineers now check path endpoints against the requested interaction range. An incomplete 1,500-operation search retries at 10,000. If still incomplete, a final bounded retry permits vacant station positions while keeping actual workers blocked. Every search retains room-edge and territory restrictions and engine structure costs. Only complete routes reach `moveByPath`; incomplete retries issue no movement. The short cache expires using the existing reuse window, is invalidated when a creep cannot join its cached path, and regenerates after global reset. Fatigued engineers do not search. Other roles' routing, barrier geometry, and manual wall/rampart removal policy are unchanged.

The [official PathFinder documentation](https://docs.screeps.com/api/#PathFinder.search) explicitly says incomplete searches can return partial paths. [Room.findPath](https://docs.screeps.com/api/#Room.findPath) documents operation limits and cost callbacks. Neither fixture mocks nor this observation claim bit-for-bit reproduction of native search expansion counts.

## Validation

Seven focused deterministic tests were added. The initial route tests failed before complete-path handling; two additional tests then reproduced the vacant-reservation disconnect. The captured terrain/obstacle fixture has no account IDs or runtime memory. It supplies geometric facts; an independent flood search checks reachability and the direction away from the dead end, while search exhaustion is a supplied API result.

Staged and installed `npm run validate` pass **207 tests**, strict checks across **38 runtime modules**, and independent-process replay equivalence. Replay digest remains `efe24576d1004d1fa0e56738651924bf8a9fc7292f5823fd5a890d38fa4883d9`. No expected historical action trace was regenerated. The existing formation test was adapted to the explicit path-search API and still requires station protection and exclusive escape intents.

## Live evidence

Both changed runtime modules matched the active localhost server after activation. At tick 120411, the two previously trapped engineers were at (14,4) and (12,5), proceeding north out of the oxygen pocket; the third was at (32,6). They retained their original repair target. Recent CPU samples averaged 7.57 with p95 10.25 and peak 25.70, bucket 10,000, and no bot alerts. These observations prove departure from the observed trap, not completion of the entire perimeter or universal congestion recovery.

The work is uncommitted on `feature/rcl5-perimeter-links`. The [runtime manifest](2026-11-21-oxygen-routing-modules.sha256) identifies the installed code. No world reset, resource injection, manual creep movement, or demolition was used to test this fix. Complete-route checks and traffic behavior remain subject to later topology and occupancy changes; engineer targets can still be deferred if every legal path is physically blocked.

A follow-up at tick 120550 found engineers at (43,11), (43,9), (41,25); bot alerts remained 0.

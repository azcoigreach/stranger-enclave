# Intermittent engineer travel — November 21, 2026

The previous complete-route fix was too strict about temporary occupancy. At tick 120717, two engineers reported `ERR_NO_PATH` near (42,17) and (42,15), while a third could move through the controller corridor. A later read at tick 120812 distinguished actual fatigue (one engineer had fatigue 10) from a zero-fatigue engineer with seven stalled ticks and `ERR_NO_PATH`.

Engineers still require a complete geometric route to their requested work range. When ordinary and vacant-station retries cannot find one, a final bounded search ignores temporary creeps and station reservations while preserving terrain, structure costs, room edges, and territory restrictions. A distant passing creep no longer prevents travel across the whole room. Before following each step, the bot checks actual next-tile occupancy, yields a ranged worker when legal, or waits locally. It never follows an incomplete search endpoint. The existing short cache and stuck-path retries remain. This is not a complete general traffic scheduler; an immovable immediate obstruction can still require waiting.

The read-only observer now exposes actual fatigue and the latest movement reason: `FOLLOW_ROUTE`, `WAIT_TRAFFIC`, `YIELD_TRAFFIC`, `FATIGUE`, `IN_RANGE`, or `NO_COMPLETE_ROUTE`. Movement diagnostics are from the last movement request and can be stale while the engineer is already working; compare the task/action and movement tick as well.

New engineer bodies use WORK/CARRY/MOVE/MOVE units, costing 250 energy each, capped at five WORK. This supplies sufficient movement recovery for a fully loaded intact creep to move every tick on plains. Existing creeps retain their bodies and are replaced through ordinary staffing. Swamp fatigue and traffic still apply. Body mechanics were checked against [official movement documentation](https://docs.screeps.com/creeps.html#Movement); no live creep was suicided or replaced manually.

## Deterministic verification

New regressions first reproduced distant-occupancy stalls, missing next-step waiting/yield behavior, and the loaded body movement deficit. Tests cover a full route behind a temporary distant blocker, immediate occupancy and release, ranged-worker yielding without overridden intents, preserved static obstacles and room borders, and affordable mobile engineer bodies at 300/550/800/1800 room capacity. Existing incomplete-route and formation-escape assertions remain in force. The formation test now inspects an actual non-static search callback rather than assuming that the last search uses the normal occupancy mask.

Staged and installed `npm run validate` pass **212 tests**, strict checking for **38 root runtime modules**, and separate-process replay equivalence. Replay SHA-256 remains `efe24576d1004d1fa0e56738651924bf8a9fc7292f5823fd5a890d38fa4883d9`. Historical fixture outcomes were not regenerated.

## Live verification

The two modified runtime modules matched the active localhost server. Thirty read-only observations spanning ticks 121205–121250 showed all three engineers progressing:

| Engineer body at observation | Starting tile | Ending tile | Distinct observed positions |
| --- | --- | --- | --- |
| 1 WORK / 1 CARRY / 1 MOVE | (36,39) | (34,45) | 10 |
| 5 WORK / 5 CARRY / 5 MOVE | (39,31) | (31,46) | 18 |
| 4 WORK / 4 CARRY / 4 MOVE | (39,32) | (33,46) | 16 |

There were no fresh `NO_COMPLETE_ROUTE` movement reports in this sample. Fresh movement reports contained fatigue, following a route, and two brief local traffic waits across the sampled creeps. The one-WORK engineer also issued successful repair actions at (36,45). All three observed bodies predated the new spawn design; faster-body behavior is regression evidence, not yet a live replacement observation.

At the end of the sample, CPU average was 8.46, p95 10.78, peak 28.30, bucket 10,000, with no bot alerts. The sample demonstrates continued travel and repair after the change, not a long-term traffic soak. No world reset, resource injection, forced movement, or destructive test was used. Work remains uncommitted on `feature/rcl5-perimeter-links`; the [runtime manifest](2026-11-21-engineer-transit-modules.sha256) identifies this follow-up.

# Respect manually removed off-plan walls — November 21, 2026

The user requested manual removal of obsolete walls without automatic reconstruction. The established-layout ledger remembered every wall, so deleting an old wall immediately produced a replacement site while perimeter migration waited for outer fortification.

`planning.layout` now limits wall reconstruction to the adopted version-2 perimeter, or a version-2 proposal with a matching explicit migration approval. Historical off-plan wall entries are ignored and newly observed off-plan walls are not enrolled. Other structures retain established-position reconstruction. A planned rampart position is not rebuilt as a wall. Unapproved or mismatched proposals do not change wall reconstruction.

This change issues no demolition requests and adds no movement changes. It respects the user's manual deletions even before the automatic migration's fortification threshold is met. The existing authorized migration still controls its own automatic removals.

Six deterministic regressions were added; five failed before the fix. Staging and installed `npm run validate` pass **196 tests**, strict checking, and independent-process replay equivalence with unchanged digest `efe24576d1004d1fa0e56738651924bf8a9fc7292f5823fd5a890d38fa4883d9`. Tests cover deletion across resets, newly observed off-plan walls, adopted plans, unmatched approval, correct wall/rampart type, and preservation of planned-wall and spawn reconstruction.

The installed `planning.layout` source matched the active server after the file-watcher delay. At tick 118084, the read-only snapshot showed no bot alerts. No wall was destroyed as an assistant test; deletion outcomes are deterministic mock evidence, not a claimed live destruction experiment. No off-plan wall construction sites were present at the activation observation. The [source manifest](2026-11-21-wall-policy-modules.sha256) supersedes the previous runtime manifest for this follow-up. Work remains uncommitted on `feature/rcl5-perimeter-links`.

## Rampart follow-up

The user clarified that manual deletion must also apply to off-plan ramparts. The barrier predicate now matches both type and position for walls and ramparts. Four additional regression tests were added; three reproduced the missing behavior before the fix. Staging and installed validation pass **200 tests**, with the same replay digest. The installed module matched the active server, and a read-only check at tick 118365 reported 0 bot alerts. No destructive live test was performed. The updated [barrier policy manifest](2026-11-21-barrier-policy-modules.sha256) identifies this follow-up runtime.

# Remote reservation scheduling — November 21, 2026

At tick 130394 the newer remote was unreserved with 1,500 source capacity, despite its operation requesting hauling for reserved output (52 CARRY). The spawn was already producing that room's first reserver. The previous request order filled the whole hauling target before reservation; earlier operations could also consume every optional request before a later remote was considered.

The existing reserver traveled autonomously and began reserving before this scheduling change was deployed. At tick 130622 the new remote had an owned reservation, successful reserve intents and source capacity 3,000. This arrival is not attributed to the new scheduler.

## Policy change

Eligible remote requests now compare across operations: first transport/missing miner recovery, then due reservation, then extra hauling. Home production, survey, threat, freshness, territory, storage and construction gates remain. Spawning and viable creeps count toward staffing. Reservations are requested only when no viable reserver exists and observed owned reservation has at most the greater of 1,000 ticks or source travel plus spawn time plus 20 ticks remaining. Long-lived banked reservation can therefore outlive a reserver without causing an unnecessary immediate replacement.

This corrects the dependency between reserved source output and the transport fleet sized for it. It does not guarantee uninterrupted reservation during prolonged home emergency or spawn starvation, and source-route travel remains an estimate for replacement lead time.

## Verification

Three new regressions failed before the change. They cover second-remote reservation ahead of extra transport, expiry-aware replacement/pending crew accounting, essential remote recovery across rooms, and reset equivalence. The prior spawn-sequence assertion intentionally changes to first hauler → miner → reserver → additional hauling; it retains pending and replacement checks.

Staged and installed `npm run validate` pass **240 tests**, checks for **39 runtime modules**, and independent-process replay with unchanged SHA-256 `221f793ab30346881ce44e1305ad52fc3b46eba6d093bcf3f3129652b6f8ddf8`. No fixture expectations were regenerated. All installed module texts matched the server.

At tick **130711**, the newer remote's reservation had grown to **192 remaining ticks**, and its source capacity was **3,000**. The older remote retained **3,951 ticks** of owned reservation. There were no bot alerts; CPU average/p95/peak were 12.37 / 17.60 / 39.97, bucket 10,000. No world, creep, energy or intel injection was used. Future scheduler ordering is regression evidence; the live observation verifies ongoing reservation by the already-spawned creep.

Changes remain uncommitted on `feature/rcl5-perimeter-links` alongside the traffic and link-feeding follow-ups. The [runtime manifest](2026-11-21-reservation-modules.sha256) identifies the installed code.

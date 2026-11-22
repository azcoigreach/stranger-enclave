# v0.1.0 versioning validation — November 21, 2026

Tracking: [issue #5](https://github.com/azcoigreach/stranger-enclave/issues/5).

## Automated evidence

- Three startup regressions failed before implementation. The completed staged and installed code passes `npm run validate`: syntax/import checks for 40 root modules, strict type checking, 244 tests, and deterministic replay in two isolated processes.
- Gameplay replay SHA-256 remains `221f793ab30346881ce44e1305ad52fc3b46eba6d093bcf3f3129652b6f8ddf8`; expected fixtures were not regenerated. Only the explicitly tested runtime startup banner is excluded from reset-frequency replay comparison.
- Coverage verifies first-tick announcement, no repeat on ordinary ticks/Memory serialization, reannouncement after global reset, preserved persistent state, startup before failed home initialization, deployed version selection, and inconsistent package metadata rejection.
- Workflow/issue-template YAML parses; the publication shell script passes `bash -n`. An isolated publication dry run with stubbed Git/GitHub commands exercised new release, matching existing tag, mismatched tag rejection, and already-published release. It verified the ZIP contains exactly the 40 root JavaScript modules and that its checksum matches. No GitHub tag or release was created by these checks. Actual hosted publication remains pending human promotion.

## Localhost observation

Dependencies were installed before their callers into the synchronized workspace. Read-only server comparison confirmed all 40 active module texts match the workspace.

A console subscription captured `[enclave:startup] Stranger Enclave v0.1.0 (tick 133961)` and another announcement at tick 133962 during the multi-file upload/reload window. Subsequent captured console events contained no startup banner. Separate deterministic tests verify one announcement per runtime and reannouncement on reset; this live observation does not claim a single atomic upload.

The read-only snapshot at tick 133977 showed normal colony processing through tick 133976, RCL 5, and preserved Memory schema 2/home/block. No world reset, Memory clearing, game console mutation, or creep intervention was used. Raw snapshots and logs remain outside the repository.

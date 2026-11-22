# Versioning and release procedure

`version.js` is the Screeps-compatible source of the software version. Versions use stable `MAJOR.MINOR.PATCH`: patch for compatible fixes, minor for added behavior, major for incompatible changes. During 0.x development, describe compatibility changes explicitly. Software versions do not replace Memory or planner schema numbers.

## Track changes

Open a GitHub issue for new problems and planned work. Record reproduction/desired behavior, affected version, acceptance checkboxes, dependencies and relevant validation. Link the issue from commits and PRs; update its progress as evidence arrives. Do not mark acceptance complete merely because code exists. Issue templates support bugs and work items. Issue #5 tracks v0.1.0.

Add user-visible changes under `Unreleased` in `CHANGELOG.md`. When preparing a release, assign them to the selected version and write `docs/releases/<version>.md`, including deployment, compatibility and known limitations. Keep `version.js`, `package.json`, and both root version entries in `package-lock.json` identical. `npm run validate` checks consistency and requires the changelog/release notes entry.

## Review and promote

1. Integrate normal feature/fix PRs into `dev` and validate the intended release scope.
2. Create `release/<version>` from that revision. Release-preparation fixes target this branch; feature work continues separately.
3. Run deterministic validation and relevant live checks. Review the release-preparation PR before merging it into the release branch.
4. Review a separate `release/<version> → main` promotion PR. A dependent promotion PR stays draft until preparation is merged and the resulting release revision passes checks.
5. After the human merges promotion, the publication workflow validates that exact `main` commit again. It creates `v<version>` pointing to that commit and publishes notes, a ZIP of root `.js` modules, and its SHA-256 checksum. The workflow never merges a PR or pushes a branch.
6. Confirm the published tag, assets and notes, then close the release tracking issue after acceptance is met. Back-merge the release changes into `dev` through a PR before starting the next version.

For v0.1.0, the preparation branch is `feature/version-0.1.0` and the release branch is `release/0.1.0`. Publishing is pending until reviewed promotion lands; a startup banner does not imply the GitHub release has already been published.

## Publication and recovery

The workflow runs only on `main` (push or manual dispatch), with publication dependent on validation. A retry skips an already-published release without moving its tag or replacing its assets. If a tag exists without a release, its commit must match the validated commit; otherwise publication fails rather than attaching mismatched files. Tags are immutable. Fix a published problem with a new version.

GitHub must allow the workflow's `contents: write` permission. If publication fails after merge, fix its reported cause and rerun the same workflow/commit; do not retag a different revision. The [GitHub CLI release command](https://cli.github.com/manual/gh_release_create) creates a missing tag at the explicit commit and supports verification of existing tags. See [workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) for push/manual behavior.

Only root JavaScript files are deployed to Screeps. Deploy a compatible set; this workspace synchronizes root edits immediately. Install new dependencies before modules requiring them or use atomic upload where available. Preserve Memory for compatible updates. A code rollback does not reverse prior building demolition, construction, or incompatible memory migrations. Record the release, revision and observed outcome in the tracking issue.

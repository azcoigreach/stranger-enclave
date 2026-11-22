# Stranger Enclave

An autonomous Screeps bot for terrain-adaptive colonies, coordinated defense, and complete control of one fixed 9×9 sector interior.

## Status

The v0.1.0 release candidate includes bootstrap, dedicated mining/hauling, scouting and adjacent remotes, storage/controller links, defensive planning and reserve-aware engineering. The localhost colony has reached RCL 5. Full player-raid defense, claiming, industry operation and complete sector control remain future work; plans are not milestone completion evidence.

The bot discovers its starting 9×9 sector from the initial owned spawn and persists that boundary. Runtime modules contain no deployment room/account/shard configuration. `version.js` defines the software version and the Screeps console prints it once after each runtime/global restart. See [CHANGELOG.md](CHANGELOG.md), [release notes](docs/releases/0.1.0.md), and [GitHub Issues](https://github.com/azcoigreach/stranger-enclave/issues) for scope and progress.

Read the [implementation plan](docs/IMPLEMENTATION_PLAN.md) for architecture, milestones, and acceptance criteria.

Read the [core bot guide](docs/CORE_BOT.md) for module contracts, console commands, limitations, and validation. Run `npm ci` and `npm run validate` for development checks. Game modules run directly without a build step.

The [testing guide](docs/TESTING.md) defines deterministic fixtures, regression checks, and the CI gate. Validation includes replay equivalence across fresh runtimes and checks that deliberately introduced bugs are detected.

The initial [validation report](docs/validation/2026-11-21-core-smoke.md) records automated checks and the localhost smoke test.

The [automatic territory validation](docs/validation/2026-11-21-portable-territory.md) records quadrant coverage, saved-memory migration, and activation on the current colony.

The [economy and controller-traffic validation](docs/validation/2026-11-21-economy-throughput.md) records source-cycle throughput, RCL 3 progress, and carrier-trap regressions.

This repository is the active local Screeps script directory: root JavaScript edits synchronize to the server. Stage and test coordinated changes outside the watched directory before activation.

## Project requirements

- Build and manage a colony in every claimable room inside the block as GCL and resources permit.
- Discover the starting block automatically and retain it through expansion and resets; keep game modules independent of deployment room, account, and shard names.
- Generate layouts dynamically from terrain, access, and structure constraints; no fixed full-base footprint.
- Secure keeper rooms and the center through guarded resource outposts.
- Automate construction, staffing, logistics, expansion, defense, and recovery.
- Expose colony health, bottlenecks, and decision reasons through useful console reporting.
- Keep modules small and documented, with `main.js` owning the core tick sequence.
- Keep all game code as Screeps-ready JavaScript modules in the repository root. Use subsystem filename prefixes such as `economy.mining.js`; no build or directory-flattening step is required to run the bot.
- Develop and validate on a repeatable local server before choosing a live shard.

## First delivery

A pinned local server setup, repeatable test world, deployment tooling, core loop, colony reporting, and autonomous growth through RCL 3 with recovery from critical worker loss.

## Future priority

Highway Power Bank expeditions, power processing, and Power Creeps are deferred. These bounded expeditions will not expand the permanent 9×9 ownership boundary.

## Development workflow

The repository root is the working Screeps script directory. Keep tests, local server tooling, and documentation in `tests/`, `tools/`, and `docs/`; only root game modules belong in the Screeps module set.

Use `feature → dev → release/<version> → main`:

- Feature/fix branches normally start from and target `dev`.
- Cut a release branch from validated `dev`; preparation/stabilization PRs may target that release branch.
- Promote the reviewed release branch into `main`. Back-merge its changes into `dev` through a separate PR.
- Human review owns approval and merging; do not push directly to shared branches or rewrite their history.

Use a GitHub issue for each problem or planned change, with acceptance criteria and validation evidence. Link issues from commits and PRs. Keep user-visible changes in the changelog; the release tag identifies the final promoted commit.

After promotion, the release workflow revalidates the exact `main` commit, creates `v<version>`, and publishes notes plus a ZIP of all root game modules and a checksum. Existing published releases are left unchanged. See [release procedure](docs/RELEASING.md) and [validation discipline](docs/IMPLEMENTATION_PLAN.md#validation-and-release-discipline).

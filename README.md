# Stranger Enclave

An autonomous Screeps bot for terrain-adaptive colonies, coordinated defense, and complete control of one fixed 9×9 sector interior.

## Status

Core bootstrap implementation is running on the localhost server. On a fresh deployment, it derives its 9×9 sector from the initial owned spawn and persists that boundary. After the fresh-world reset, the current dev colony is in `W6N8`, inside `W1N1`–`W9N9`; the earlier colony was in `W5N1`. These names are observations, not game-code configuration. Milestones 0–1 are in progress; the existing dev colony has reached RCL 3 with dedicated mining/hauling, while a reproducible fresh-start progression run and sustained recovery remain unvalidated. Public shard selection follows measured results.

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

Use the branch flow `feature → dev → main`:

- `main` holds the most stable, validated version. Promote changes through a reviewed PR from `dev` only after the relevant acceptance gates pass.
- `dev` is the integration branch for ongoing development and stabilization.
- Create short-lived `feature/`, `fix/`, or `docs/` branches from the latest `dev`, and target their PRs at `dev`.

Do not commit or push directly to `main` or `dev`, or force-push either shared branch. Keep PRs focused and include relevant checks and recorded test evidence. Human review owns approval and merging. Plans are not proof of implemented behavior; `main` currently contains the planning baseline, not a working bot.

See the implementation plan's [validation and release discipline](docs/IMPLEMENTATION_PLAN.md#validation-and-release-discipline) for promotion requirements.

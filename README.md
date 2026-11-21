# Stranger Enclave

An autonomous Screeps bot for terrain-adaptive colonies, coordinated defense, and complete control of one fixed 9×9 sector interior.

## Status

Planning stage. The bot and local test server are not implemented yet. Development starts locally; public shard selection follows measured results.

Read the [implementation plan](docs/IMPLEMENTATION_PLAN.md) for architecture, milestones, and acceptance criteria.

## Project requirements

- Build and manage a colony in every claimable room inside the block as GCL and resources permit.
- Generate layouts dynamically from terrain, access, and structure constraints; no fixed full-base footprint.
- Secure keeper rooms and the center through guarded resource outposts.
- Automate construction, staffing, logistics, expansion, defense, and recovery.
- Expose colony health, bottlenecks, and decision reasons through useful console reporting.
- Keep modules small and documented, with `main.js` owning the core tick sequence.
- Develop and validate on a repeatable local server before choosing a live shard.

## First delivery

A pinned local server setup, repeatable test world, deployment tooling, core loop, colony reporting, and autonomous growth through RCL 3 with recovery from critical worker loss.

## Future priority

Highway Power Bank expeditions, power processing, and Power Creeps are deferred. These bounded expeditions will not expand the permanent 9×9 ownership boundary.

## Development workflow

Use feature branches and pull requests. Each milestone requires recorded test evidence; plans are not proof of implemented behavior. Human review owns approval and merging.

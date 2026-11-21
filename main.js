'use strict';

const config = require('core.config');
const memorySystem = require('core.memory');
const runtime = require('core.runtime');
const territory = require('territory.policy');
const snapshot = require('colony.snapshot');
const spawning = require('economy.spawn');
const workers = require('economy.worker');
const defense = require('defense.basic');
const planning = require('planning.bootstrap');
const reporting = require('reporting.console');
const economyMetrics = require('economy.metrics');
const controllerTraffic = require('movement.controller');

/** Tick entry point. Critical work runs for every visible owned in-block room before
 * optional planning. Each system/worker is fault-isolated; game objects stay tick-local.
 */
module.exports.loop = function loop() {
  reporting.install();
  /** @type {BotMemory} */
  let memory;
  try { memory = memorySystem.initialize(); } catch (error) {
    // Memory may have an unknown schema: do not write into it just to report failure.
    if (Game.time % config.reportInterval === 0) console.log(`[enclave:init] ${String(error)}`);
    return;
  }
  /** @type {ColonySnapshot[]} */
  const colonies = [];
  for (const room of Object.values(Game.rooms).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!territory.contains(room.name, memory.block)) continue;
    runtime.guard(memory, `observe:${room.name}`, () => {
      const controller = room.controller;
      memory.intel[room.name] = {
        lastSeen: Game.time, kind: controller ? (controller.my ? 'owned' : 'controller') : 'controllerless',
        owner: controller && controller.owner && controller.owner.username,
        reservation: controller && controller.reservation && controller.reservation.username,
      };
      if (controller && controller.my) colonies.push(snapshot.create(room));
    });
  }
  for (const colony of colonies) {
    const name = colony.room.name;
    const previous = memory.colonies[name];
    const record = memory.colonies[name] = {
      ...previous, lastSeen: Game.time, level: colony.controller.level,
      energy: colony.room.energyAvailable, capacity: colony.room.energyCapacityAvailable,
      workers: colony.workers.length, desired: 0, reason: 'TICK_STARTED',
    };
    runtime.guard(memory, `defense:${name}`, () => defense.run(colony));
    runtime.guard(memory, `economy-metrics:${name}`, () => economyMetrics.record(colony, record));
    runtime.guard(memory, `spawn:${name}`, () => spawning.run(colony, memory, record));
    const deliveries = new Map();
    runtime.guard(memory, `controller-traffic:${name}`, () => controllerTraffic.run(colony, memory.block, deliveries));
    for (const creep of colony.workers) {
      runtime.guard(memory, `worker:${creep.name}`, () => workers.run(creep, colony, memory.block, deliveries));
    }
  }
  const spawns = colonies.reduce((sum, colony) => sum + colony.spawns.length, 0);
  if (!spawns) runtime.alert(memory, 'no-spawn', 'NO_SPAWN: bootstrap support is unavailable; setup/respawn is required if extinct');
  for (const colony of colonies) {
    const record = memory.colonies[colony.room.name];
    const offset = Math.abs(territory.coordinates(colony.room.name).x * 31 + territory.coordinates(colony.room.name).y);
    if ((Game.time + offset) % config.planningInterval !== 0) continue;
    if (!runtime.optionalWorkAllowed()) { record.planning = 'DEFERRED_CPU'; continue; }
    runtime.guard(memory, `planning:${colony.room.name}`, () => planning.run(colony, record, runtime.optionalWorkAllowed));
  }
  runtime.guard(memory, 'reporting', () => reporting.record(memory));
};

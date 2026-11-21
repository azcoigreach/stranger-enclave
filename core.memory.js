'use strict';

const territory = require('territory.policy');

/** Owned spawn rooms in stable order; no assumption about spawn names or server identity. */
function spawnRooms() {
  return [...new Set(Object.values(Game.spawns).filter(spawn => spawn.my &&
    spawn.room.controller && spawn.room.controller.my).map(spawn => spawn.room.name))].sort();
}

/** Fresh starts need one unambiguous sector. Do not guess between existing empires. */
function discover() {
  const rooms = spawnRooms();
  if (!rooms.length) throw new Error('WAITING_FOR_INITIAL_SPAWN: place your first spawn to establish territory');
  const home = rooms[0], block = territory.blockFor(home);
  if (rooms.some(name => !territory.sameBlock(territory.blockFor(name), block))) {
    throw new Error('AMBIGUOUS_START_BLOCK: owned spawns occupy multiple sectors and no territory is saved');
  }
  return { home, block };
}

/** Schema 1 did not store home. Infer an anchor inside its saved block, preserving all state.
 * If the spawn was lost, an existing saved colony can anchor the same sector.
 * @param {BotMemory} memory
 */
function migrate(memory) {
  territory.validate(memory.block);
  const candidates = spawnRooms().filter(name => territory.contains(name, memory.block));
  const saved = Object.keys(memory.colonies).filter(name => territory.contains(name, memory.block)).sort();
  const home = memory.home || candidates[0] || saved[0];
  if (!home) throw new Error('LEGACY_HOME_UNKNOWN: no spawn or saved colony inside the existing block');
  if (!territory.sameBlock(territory.blockFor(home), memory.block)) {
    throw new Error('Saved territory does not match its home sector; refusing boundary drift');
  }
  // Validate everything before publishing either migration field.
  memory.home = home;
  memory.version = 2;
}

/** Owns Memory.enclave schema v2 and dead bot-creep cleanup. Runs each tick.
 * Discovers territory only with empty bot memory; resets and spawn loss preserve it.
 * Rejects unsupported versions and inconsistent saved bounds without rewriting them.
 * @returns {BotMemory}
 */
function initialize() {
  if (!Memory.enclave) {
    const start = discover();
    Memory.enclave = {
      version: 2, home: start.home, block: start.block, colonies: {}, intel: {},
      alerts: {}, samples: [], sequence: 0,
    };
  }
  const memory = Memory.enclave;
  if (memory.version !== 1 && memory.version !== 2) throw new Error(`Unsupported memory schema: ${memory.version}`);
  if (memory.version === 1) migrate(memory);
  territory.validate(memory.block);
  if (typeof memory.home !== 'string' || !territory.sameBlock(territory.blockFor(memory.home), memory.block)) {
    throw new Error('Saved territory does not match its home sector; refusing boundary drift');
  }
  if (!Memory.creeps) Memory.creeps = {};
  const spawning = new Set(Object.values(Game.spawns).filter(s => s.spawning).map(s => s.spawning && s.spawning.name));
  for (const name of Object.keys(Memory.creeps)) {
    if (['bootstrap', 'miner', 'hauler', 'distributor', 'scout', 'remoteMiner', 'remoteHauler', 'reserver'].includes(Memory.creeps[name].role || '') && !Game.creeps[name] && !spawning.has(name)) {
      delete Memory.creeps[name];
    }
  }
  return memory;
}

module.exports = { initialize };

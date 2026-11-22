'use strict';

/** Tick-local room facts. Never persist game objects. Missing vision is handled by the caller.
 * @param {Room} room @returns {ColonySnapshot}
 */
function create(room) {
  if (!room.controller || !room.controller.my) throw new Error('Colony is not owned');
  return {
    room, controller: room.controller,
    spawns: Object.values(Game.spawns).filter(s => s.room.name === room.name).sort((a, b) => a.name.localeCompare(b.name)),
    structures: room.find(FIND_STRUCTURES), sources: room.find(FIND_SOURCES),
    sites: room.find(FIND_MY_CONSTRUCTION_SITES), hostiles: room.find(FIND_HOSTILE_CREEPS),
    workers: Object.values(Game.creeps).filter(c => ['bootstrap', 'miner', 'hauler', 'distributor', 'engineer'].includes(c.memory.role || '') &&
      c.memory.home === room.name && c.room.name === room.name).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

module.exports = { create };

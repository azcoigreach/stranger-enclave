'use strict';
const territory = require('territory.policy');

/** Persist only observed facts. Unknown rooms never acquire invented safety or sources.
 * @param {Room} room @param {BotMemory} memory
 */
function observe(room, memory) {
  if (!territory.contains(room.name, memory.block)) return;
  const controller = room.controller, structures = room.find(FIND_STRUCTURES);
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  /** @type {Record<string,number>} */
  const hostileParts = {};
  for (const creep of hostiles) for (const part of creep.body) if (part.hits > 0) hostileParts[part.type] = (hostileParts[part.type] || 0) + 1;
  const npc = structures.some(s => s.structureType === STRUCTURE_KEEPER_LAIR || s.structureType === STRUCTURE_INVADER_CORE);
  const previous = memory.intel[room.name];
  const terrain = room.getTerrain();
  memory.intel[room.name] = {
    lastSeen: Game.time, kind: controller ? (controller.my ? 'owned' : 'controller') : 'controllerless',
    owner: controller && controller.owner && controller.owner.username,
    reservation: controller && controller.reservation && controller.reservation.username,
    reservationUntil: controller && controller.reservation ? Game.time + controller.reservation.ticksToEnd : undefined,
    controller: controller ? {x:controller.pos.x, y:controller.pos.y} : undefined,
    exits: Object.values(Game.map.describeExits(room.name) || {}).sort(),
    mineral: room.find(FIND_MINERALS)[0] && room.find(FIND_MINERALS)[0].mineralType,
    hostileParts, npc,
    unsafeUntil: hostiles.length || npc ? Game.time + 1500 : (previous && previous.unsafeUntil || 0),
    sources: room.find(FIND_SOURCES).map(source => {
      const slots = [];
      for (let x = Math.max(1,source.pos.x-1); x <= Math.min(48,source.pos.x+1); x++) {
        for (let y = Math.max(1,source.pos.y-1); y <= Math.min(48,source.pos.y+1); y++) {
          if (x === source.pos.x && y === source.pos.y || terrain.get(x,y) & TERRAIN_MASK_WALL) continue;
          if (structures.some(s => s.pos.x === x && s.pos.y === y && s.structureType !== STRUCTURE_ROAD &&
            s.structureType !== STRUCTURE_CONTAINER && !(s.structureType === STRUCTURE_RAMPART && s.my))) continue;
          slots.push({x,y});
        }
      }
      return {id:source.id, x:source.pos.x, y:source.pos.y, capacity:source.energyCapacity, slots};
    }).sort((a,b) => a.id.localeCompare(b.id)),
  };
}
/** @param {IntelRecord | undefined} intel @param {string} username @param {boolean} fresh */
function safe(intel, username, fresh = true) {
  return Boolean(intel && (!fresh || Game.time - intel.lastSeen <= 500) && !intel.npc &&
    !(intel.unsafeUntil && intel.unsafeUntil > Game.time) &&
    (!intel.owner || intel.owner === username) &&
    (!intel.reservation || intel.reservation === username || (intel.reservationUntil || 0) <= Game.time));
}
module.exports = { observe, safe };

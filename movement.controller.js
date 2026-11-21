'use strict';
const territory = require('territory.policy');

const stations = require('economy.stations');

/** Recover carriers already enclosed by a formation (including old cached paths).
 * Before role execution, reserve one step toward an externally reachable range-4
 * tile. A stationary, mobile generalist may swap with the carrier. Both intents
 * are owned here for this tick; reservations never survive a reset.
 * @param {ColonySnapshot} colony @param {BlockBounds} block @param {Map<string, number>} reservations
 */
function run(colony, block, reservations) {
  if (!territory.contains(colony.room.name, block)) return;
  const center = colony.controller.pos, terrain = colony.room.getTerrain(), origin = colony.spawns[0]?.pos;
  if (!origin) return;
  const carriers = colony.workers.filter(c => !c.spawning && (c.memory.role === 'hauler' || c.memory.role === 'distributor') &&
    c.memory.home === colony.room.name && c.pos.inRangeTo(center, 3)).sort((a, b) => a.name.localeCompare(b.name));
  if (!carriers.length) return;
  const key = (/** @type {{x: number, y: number}} */ p) => `${p.x},${p.y}`;
  const occupied = new Map(colony.room.find(FIND_CREEPS).map(c => [key(c.pos), c]));
  // Also include the owned snapshot: fixtures and newly spawning creeps may differ.
  for (const creep of colony.workers) occupied.set(key(creep.pos), creep);
  const blocked = new Set([...colony.structures, ...colony.sites].filter(s => s.structureType !== STRUCTURE_ROAD &&
    s.structureType !== STRUCTURE_CONTAINER && !(s.structureType === STRUCTURE_RAMPART && 'my' in s && s.my)).map(s => key(s.pos)));
  for (const object of [...colony.sources, colony.controller, ...colony.room.find(FIND_MINERALS)]) blocked.add(key(object.pos));
  for (const creep of colony.room.find(FIND_POWER_CREEPS)) blocked.add(key(creep.pos));
  const reserved = new Set();
  for (const carrier of carriers) {
    if (carrier.fatigue || !carrier.getActiveBodyparts(MOVE)) continue;
    const reservedStations = new Set(stations.layout(colony).positions.map(key));
    const search = (/** @type {boolean} */ allowSwap) => {
      const queue = [{ x: carrier.pos.x, y: carrier.pos.y, first: /** @type {{x:number, y:number} | null} */ (null) }];
      const seen = new Set([key(carrier.pos)]);
      let step = null;
      for (let index = 0; index < queue.length && !step; index++) {
        const current = queue[index];
        if (center.getRangeTo(current.x, current.y) === 4) {
          const path = origin.findPathTo(current.x, current.y, { range: 0, maxRooms: 1, maxOps: 1500, ignoreCreeps: true,
            costCallback(roomName, matrix) { stations.blockStations(colony, matrix); return matrix; } });
          const end = path[path.length - 1];
          if (origin.getRangeTo(current.x, current.y) === 0 ||
              (end && end.x === current.x && end.y === current.y)) step = current.first;
          continue;
        }
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const next = { x: current.x + dx, y: current.y + dy }, tile = key(next);
          if (seen.has(tile) || reserved.has(tile) || blocked.has(tile) || next.x <= 0 || next.y <= 0 || next.x >= 49 || next.y >= 49 ||
              center.getRangeTo(next.x, next.y) > 4 || (terrain.get(next.x, next.y) & TERRAIN_MASK_WALL)) continue;
          const occupant = occupied.get(tile);
          if (!allowSwap && (occupant || reservedStations.has(tile))) continue;
          if (occupant && (!colony.workers.includes(occupant) ||
              occupant.memory.role !== 'bootstrap' || occupant.memory.home !== colony.room.name || occupant.spawning ||
              occupant.fatigue || !occupant.getActiveBodyparts(MOVE) || reservations.has(`traffic:${occupant.id}`))) continue;
          seen.add(tile); queue.push({ ...next, first: current.first || next });
        }
      }
      return step;
    };
    const openStep = search(false);
    // Transit through an open lane is legal; recovery is only for an enclosed
    // carrier or one currently occupying a reserved worker station.
    if (openStep && !reservedStations.has(key(carrier.pos))) continue;
    reservations.set(`traffic:${carrier.id}`, 1); carrier.memory.task = 'WAIT_CONTROLLER_EXIT';
    const step = openStep || search(true);
    if (!step) continue;
    const target = colony.room.getPositionAt(step.x, step.y);
    if (!target) continue;
    const occupant = occupied.get(key(step));
    if (occupant) {
      reservations.set(`traffic:${occupant.id}`, 1);
      occupant.memory.task = 'YIELD_CONTROLLER_EXIT';
      occupant.memory.lastAction = occupant.move(occupant.pos.getDirectionTo(carrier.pos));
    }
    carrier.memory.task = 'EXIT_CONTROLLER';
    carrier.memory.lastAction = carrier.move(carrier.pos.getDirectionTo(target));
    reserved.add(key(carrier.pos)); reserved.add(key(step));
  }
}
module.exports = { run };

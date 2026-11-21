'use strict';

/** Geometry caches contain plain positions only. Assignments live on the tick snapshot. */
/** @type {Map<string, {tick:number, key:string, slots:Map<string, Array<{x:number,y:number}>>}>} */
const cache = new Map();
/** @param {{x:number,y:number}} p */
const tile = p => `${p.x},${p.y}`;

/** Count usable source-adjacent tiles, including access from colony infrastructure.
 * Static blockers affect capacity; creeps affect this tick's assignments only.
 * @param {ColonySnapshot} colony @returns {Map<string, Array<{x:number,y:number}>>}
 */
function slots(colony) {
  const structures = [...colony.structures, ...colony.sites];
  const key = [...structures.map(s => `${s.id}:${s.structureType}:${tile(s.pos)}:${'my' in s && s.my}`),
    ...colony.sources.map(s => `${s.id}:${tile(s.pos)}`), ...colony.spawns.map(s => tile(s.pos))].sort().join('|');
  const saved = cache.get(colony.room.name);
  if (saved && saved.key === key && Game.time - saved.tick < 100) return saved.slots;
  const blocked = new Set(structures.filter(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER &&
    !(s.structureType === STRUCTURE_RAMPART && 'my' in s && s.my)).map(s => tile(s.pos)));
  for (const object of [...colony.sources, colony.controller, ...colony.room.find(FIND_MINERALS)]) blocked.add(tile(object.pos));
  const terrain = colony.room.getTerrain(), result = new Map();
  for (const source of colony.sources) {
    const positions = [];
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
      if (x <= 0 || y <= 0 || x >= 49 || y >= 49 || blocked.has(`${x},${y}`) || (terrain.get(x, y) & TERRAIN_MASK_WALL)) continue;
      const reachable = colony.spawns.some(spawn => {
        const path = spawn.pos.findPathTo(x, y, { range: 0, maxRooms: 1, ignoreCreeps: true, maxOps: 3000 });
        const end = path[path.length - 1];
        return spawn.pos.getRangeTo(x, y) === 0 || Boolean(end && end.x === x && end.y === y);
      });
      if (reachable) positions.push({ x, y });
    }
    result.set(source.id, positions);
  }
  if (cache.size >= 81) cache.clear();
  cache.set(colony.room.name, { tick: Game.time, key, slots: result });
  return result;
}

/** Reserve exact harvesting tiles for active miners and bootstrap gatherers.
 * Occupants win, then saved reservations, then stable name order. Replacements keep
 * their source when all productive slots are full, so spawning counts them once.
 * @param {ColonySnapshot} colony @returns {Map<string, MiningAssignment>}
 */
function assign(colony) {
  if (colony.mining) return colony.mining;
  const geometry = slots(colony), assignments = new Map(), taken = new Set(), load = new Map();
  /** @type {Map<string,string>} */
  const occupied = new Map(colony.room.find(FIND_CREEPS).map(c => [tile(c.pos), c.id]));
  for (const creep of colony.workers.filter(c => !c.spawning)) occupied.set(tile(creep.pos), creep.id);
  for (const creep of colony.room.find(FIND_POWER_CREEPS)) occupied.set(tile(creep.pos), creep.id);
  const fed = colony.workers.some(c => !c.spawning && c.memory.role === 'miner') &&
    colony.workers.some(c => !c.spawning && c.memory.role === 'hauler');
  const harvesters = colony.workers.filter(c => c.getActiveBodyparts(WORK) > 0 &&
    (c.memory.role === 'miner' || (!fed && !c.spawning && c.memory.role === 'bootstrap' &&
      c.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && (!c.memory.working || c.store.getUsedCapacity(RESOURCE_ENERGY) === 0))));
  const rank = (/** @type {Creep} */ creep) => {
    const positions = geometry.get(creep.memory.sourceId || '') || [];
    return !creep.spawning && positions.some(p => tile(p) === tile(creep.pos)) ? 0 : creep.memory.miningSpot ? 1 : 2;
  };
  harvesters.sort((a, b) => rank(a) - rank(b) || Number(a.spawning) - Number(b.spawning) || a.name.localeCompare(b.name));
  for (const creep of harvesters) {
    const sources = colony.sources.filter(s => creep.memory.role === 'miner' || s.energy > 0).slice();
    sources.sort((a, b) => Number(b.id === creep.memory.sourceId) - Number(a.id === creep.memory.sourceId) ||
      (load.get(a.id) || 0) - (load.get(b.id) || 0) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) || a.id.localeCompare(b.id));
    for (const source of sources) {
      // Reassign excess dedicated miners only where additional harvesting is useful.
      if (creep.memory.role === 'miner' && source.id !== creep.memory.sourceId &&
          harvesters.filter(other => other !== creep && other.memory.role === 'miner' && other.memory.sourceId === source.id)
            .reduce((sum, other) => sum + other.getActiveBodyparts(WORK), 0) >= Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER)) continue;
      const positions = (geometry.get(source.id) || []).slice().sort((a, b) =>
        Number(tile(b) === tile(creep.pos)) - Number(tile(a) === tile(creep.pos)) ||
        Number(source.id === creep.memory.sourceId && tile(b) === tile(creep.memory.miningSpot || { x: -1, y: -1 })) -
        Number(source.id === creep.memory.sourceId && tile(a) === tile(creep.memory.miningSpot || { x: -1, y: -1 })) ||
        creep.pos.getRangeTo(a.x, a.y) - creep.pos.getRangeTo(b.x, b.y) || a.x - b.x || a.y - b.y);
      for (const pos of positions) {
        if (taken.has(tile(pos)) || (occupied.has(tile(pos)) && occupied.get(tile(pos)) !== creep.id)) continue;
        if (!creep.spawning && creep.pos.getRangeTo(pos.x, pos.y) !== 0) {
          const path = creep.pos.findPathTo(pos.x, pos.y, { range: 0, maxRooms: 1, ignoreCreeps: true, maxOps: 1500,
            costCallback(roomName, matrix) {
              for (const other of harvesters) {
                if (other !== creep && rank(other) === 0) matrix.set(other.pos.x, other.pos.y, 255);
              }
              return matrix;
            },
          });
          const end = path[path.length - 1];
          if (!end || end.x !== pos.x || end.y !== pos.y) continue;
        }
        assignments.set(creep.name, { source, pos }); taken.add(tile(pos));
        load.set(source.id, (load.get(source.id) || 0) + creep.getActiveBodyparts(WORK));
        creep.memory.sourceId = source.id; creep.memory.miningSpot = { ...pos };
        break;
      }
      if (assignments.has(creep.name)) break;
    }
    if (!assignments.has(creep.name)) delete creep.memory.miningSpot;
  }
  colony.mining = assignments;
  return assignments;
}
module.exports = { slots, assign };

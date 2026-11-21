'use strict';

/** Plain-coordinate layout cache. Each chosen worker tile preserves a complete
 * delivery path, whose tiles cannot become later worker stations. */
/** @type {Map<string, {tick:number, key:string, positions:Array<{x:number,y:number}>, lanes:Array<{x:number,y:number}>}>} */
const cache = new Map();
/** @param {{x:number,y:number}} p */
const keyOf = p => `${p.x},${p.y}`;

/** @param {ColonySnapshot} colony */
function layout(colony) {
  const workers = colony.workers.filter(c => !c.spawning && c.memory.role === 'bootstrap');
  const structures = [...colony.structures, ...colony.sites];
  const key = workers.map(c => c.name).sort().join(',') + '|' + structures.map(s => `${s.id}:${s.structureType}:${keyOf(s.pos)}`).sort().join(',');
  const saved = cache.get(colony.room.name);
  if (saved && saved.key === key && Game.time - saved.tick < 100) return saved;
  const origin = colony.spawns[0]?.pos, center = colony.controller.pos, terrain = colony.room.getTerrain();
  const blocked = new Set(structures.filter(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER &&
    !(s.structureType === STRUCTURE_RAMPART && 'my' in s && s.my)).map(s => keyOf(s.pos)));
  for (const object of [...colony.sources, colony.controller, ...colony.room.find(FIND_MINERALS)]) blocked.add(keyOf(object.pos));
  /** @type {Array<{x:number,y:number}>} */
  const positions = [], lanes = [];
  const laneKeys = new Set();
  const walkable = (/** @type {{x:number,y:number}} */ p) => p.x > 0 && p.y > 0 && p.x < 49 && p.y < 49 &&
    !(terrain.get(p.x, p.y) & TERRAIN_MASK_WALL) && !blocked.has(keyOf(p));
  /** @param {{x:number,y:number}} spot @returns {Array<{x:number,y:number}> | null} */
  const approach = spot => {
    if (!origin) return null;
    if (origin.getRangeTo(spot.x, spot.y) <= 1) return [{ x: origin.x, y: origin.y }];
    const path = origin.findPathTo(spot.x, spot.y, { range: 1, maxRooms: 1, maxOps: 3000, ignoreCreeps: true,
      costCallback(roomName, matrix) {
        for (const p of positions) matrix.set(p.x, p.y, 255);
        matrix.set(spot.x, spot.y, 255);
        return matrix;
      },
    });
    const last = path[path.length - 1];
    if (!last || Math.max(Math.abs(last.x - spot.x), Math.abs(last.y - spot.y)) > 1 || !walkable(last) ||
        path.some(p => keyOf(p) === keyOf(spot) || positions.some(s => keyOf(p) === keyOf(s)))) return null;
    return path;
  };
  const candidates = [];
  for (let x = center.x - 3; x <= center.x + 3; x++) for (let y = center.y - 3; y <= center.y + 3; y++) {
    const spot = { x, y };
    if (!walkable(spot)) continue;
    const path = approach(spot);
    if (path) candidates.push({ ...spot, distance: path.length });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
  for (const candidate of candidates) {
    if (positions.length >= workers.length) break;
    if (laneKeys.has(keyOf(candidate))) continue;
    const path = approach(candidate);
    if (!path) continue;
    positions.push({ x: candidate.x, y: candidate.y });
    for (const p of path) {
      if (center.getRangeTo(p.x, p.y) <= 4 && !laneKeys.has(keyOf(p))) {
        laneKeys.add(keyOf(p)); lanes.push({ x: p.x, y: p.y });
      }
    }
  }
  const entry = { tick: Game.time, key, positions, lanes };
  if (cache.size >= 81) cache.clear();
  cache.set(colony.room.name, entry);
  return entry;
}

/** Block reserved stations and current worker positions, leaving delivery lanes open.
 * @param {ColonySnapshot} colony @param {CostMatrix} matrix
 */
function blockStations(colony, matrix) {
  for (const pos of layout(colony).positions) matrix.set(pos.x, pos.y, 255);
  for (const worker of colony.workers) {
    if (!worker.spawning && worker.memory.role === 'bootstrap' && worker.pos.inRangeTo(colony.controller, 3)) {
      matrix.set(worker.pos.x, worker.pos.y, 255);
    }
  }
}

/** @param {Creep} creep @param {ColonySnapshot} colony @returns {RoomPosition | null} */
function forWorker(creep, colony) {
  const workers = colony.workers.filter(c => !c.spawning && c.memory.role === 'bootstrap').sort((a, b) => a.name.localeCompare(b.name));
  const spot = layout(colony).positions[workers.findIndex(c => c.name === creep.name)];
  return spot ? colony.room.getPositionAt(spot.x, spot.y) : null;
}
module.exports = { forWorker, layout, blockStations };

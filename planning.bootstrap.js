'use strict';
const layout = require('planning.layout');

/** Incremental bootstrap extension/tower placement, not the full mature planner.
 * Stores cursor/status plus the established layout in the colony record. At most 12 candidates and one site
 * per scheduled run. Preserves reachable tiles around all critical objects/exits.
 */

/** @param {ColonySnapshot} colony @param {number} x @param {number} y */
function preservesAccess(colony, x, y) {
  const terrain = colony.room.getTerrain();
  const blocked = new Set([`${x},${y}`]);
  for (const item of [...colony.structures, ...colony.sites]) {
    if (item.structureType !== STRUCTURE_ROAD && item.structureType !== STRUCTURE_CONTAINER &&
        !(item.structureType === STRUCTURE_RAMPART && 'my' in item && item.my)) blocked.add(`${item.pos.x},${item.pos.y}`);
  }
  for (const item of [...colony.sources, colony.controller, ...colony.room.find(FIND_MINERALS)]) blocked.add(`${item.pos.x},${item.pos.y}`);
  const walkable = (/** @type {number} */ px, /** @type {number} */ py) => px >= 0 && py >= 0 && px < 50 && py < 50 &&
    !(terrain.get(px, py) & TERRAIN_MASK_WALL) && !blocked.has(`${px},${py}`);
  const anchor = colony.spawns[0].pos;
  /** @type {Array<[number, number]>} */
  const starts = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (walkable(anchor.x + dx, anchor.y + dy)) starts.push([anchor.x + dx, anchor.y + dy]);
  }
  if (!starts.length) return false;
  const seen = new Set([starts[0].join(',')]);
  const queue = [starts[0]];
  for (let i = 0; i < queue.length; i++) {
    const [px, py] = queue[i];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = px + dx, ny = py + dy, key = `${nx},${ny}`;
      if (walkable(nx, ny) && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); }
    }
  }
  const critical = [...colony.sources, colony.controller, ...colony.spawns];
  for (const object of critical) {
    let reachable = false;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (seen.has(`${object.pos.x + dx},${object.pos.y + dy}`)) reachable = true;
    }
    if (!reachable) return false;
  }
  // Conservatively preserve all naturally walkable exits, including fragmented terrain.
  for (const exit of colony.room.find(FIND_EXIT)) if (!seen.has(`${exit.x},${exit.y}`)) return false;
  // New and existing planned structures must have an accessible interaction tile.
  for (const position of [{ x, y }, ...colony.structures.map(s => s.pos), ...colony.sites.map(s => s.pos)]) {
    let reachable = false;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (seen.has(`${position.x + dx},${position.y + dy}`)) reachable = true;
    }
    if (!reachable) return false;
  }
  return true;
}

/** @param {ColonySnapshot} colony @param {ColonyRecord} record @param {() => boolean} allowed */
function run(colony, record, allowed) {
  layout.observe(colony, record);
  if (colony.hostiles.length) { record.planning = 'HOSTILES_PRESENT'; return; }
  if (colony.sites.length >= 3 || Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES) {
    record.planning = 'CONSTRUCTION_BACKLOG'; return;
  }
  if (layout.rebuild(colony, record, allowed)) return;
  if (!colony.spawns.length) { record.planning = 'NO_ANCHOR_SPAWN'; return; }
  const existing = [...colony.structures, ...colony.sites];
  const type = [STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_EXTENSION].find(t =>
    existing.filter(s => s.structureType === t).length < (CONTROLLER_STRUCTURES[t][colony.controller.level] || 0));
  if (!type) { record.planning = 'BOOTSTRAP_PHASE_COMPLETE'; return; }
  const anchor = colony.spawns[0].pos;
  const terrain = colony.room.getTerrain();
  // Parity spacing leaves walkways; ordered by distance without assuming a fixed footprint.
  const candidates = [];
  for (let x = 3; x <= 46; x++) for (let y = 3; y <= 46; y++) {
    if ((x + y) % 2 === (anchor.x + anchor.y) % 2) candidates.push({ x, y });
  }
  candidates.sort((a, b) => Math.max(Math.abs(a.x - anchor.x), Math.abs(a.y - anchor.y)) -
    Math.max(Math.abs(b.x - anchor.x), Math.abs(b.y - anchor.y)) || a.x - b.x || a.y - b.y);
  for (let attempt = 0; attempt < 12 && allowed(); attempt++) {
    const index = (record.plannerCursor || 0) % candidates.length;
    record.plannerCursor = index + 1;
    const { x, y } = candidates[index];
    if (terrain.get(x, y) & TERRAIN_MASK_WALL) continue;
    if (existing.some(s => s.pos.x === x && s.pos.y === y)) continue;
    if ([...colony.sources, colony.controller, ...colony.room.find(FIND_MINERALS), ...colony.spawns].some(s =>
      Math.max(Math.abs(s.pos.x - x), Math.abs(s.pos.y - y)) <= 2)) continue;
    if (!preservesAccess(colony, x, y)) continue;
    const result = colony.room.createConstructionSite(x, y, type);
    if (result === OK) layout.rememberSite(record, { type, x, y });
    record.planning = result === OK ? `PLACED_${type}_${x}_${y}` : `SITE_FAILED_${result}`;
    return;
  }
  record.planning = 'SEARCHING_FOR_ACCESSIBLE_PLACEMENT';
}

module.exports = { run, preservesAccess };

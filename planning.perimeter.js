'use strict';
const grid = require('planning.grid');
const cut = require('planning.cut');
const layout = require('planning.layout');
/** @type {Map<string,{key:string,search:ReturnType<typeof cut.create>}>} */
const pending = new Map();
/** @param {{x:number,y:number}} pos */
const cell = pos => pos.y * 50 + pos.x;
/** @param {ColonySnapshot} colony */
function geometry(colony) {
  const terrain = colony.room.getTerrain();
  const walk = Array.from({length:2500},(_,i) => !(terrain.get(i % 50,Math.floor(i / 50)) & TERRAIN_MASK_WALL));
  for (const object of [...colony.sources,colony.controller,...colony.room.find(FIND_MINERALS)]) walk[cell(object.pos)] = false;
  const protectedCells = new Array(2500).fill(false);
  const buildings = [...colony.structures,...colony.sites].filter(s => ![STRUCTURE_WALL,STRUCTURE_RAMPART,STRUCTURE_ROAD,STRUCTURE_CONTAINER].some(t => t === s.structureType));
  for (const object of [...buildings,...colony.sources,colony.controller]) {
    const radius = object === colony.controller ? 3 : 2;
    for (let x = Math.max(2,object.pos.x - radius); x <= Math.min(47,object.pos.x + radius); x++) {
      for (let y = Math.max(2,object.pos.y - radius); y <= Math.min(47,object.pos.y + radius); y++) if (walk[y * 50 + x]) protectedCells[y * 50 + x] = true;
    }
  }
  const exits = walk.map((open,i) => open && (i % 50 === 0 || i % 50 === 49 || i < 50 || i >= 2450) ? i : -1).filter(i => i >= 0);
  const friendly = walk.slice();
  for (const object of [...colony.structures,...colony.sites]) {
    if (![STRUCTURE_ROAD,STRUCTURE_CONTAINER,STRUCTURE_RAMPART].some(t => t === object.structureType)) friendly[cell(object.pos)] = false;
  }
  const starts = colony.spawns.length ? grid.neighbors(cell(colony.spawns[0].pos)).filter(i => friendly[i]) : [];
  return {walk,protectedCells,exits,friendly,starts};
}
/** Validate hostile enclosure AND friendly exits/interactions before saving any build orders.
 * @param {ColonySnapshot} colony @param {number[]} cells @returns {PerimeterPlan | null}
 */
function finish(colony,cells) {
  const {walk,protectedCells,exits,friendly,starts} = geometry(colony), barriers = new Set(cells);
  if (!starts.length || cells.some(i => !walk[i] || protectedCells[i])) return null;
  const outside = grid.flood(walk,exits,barriers);
  if ([...outside].some(i => protectedCells[i])) return null;
  const original = grid.flood(friendly,starts), gates = new Set();
  for (const object of [...colony.structures,...colony.sites]) if (barriers.has(cell(object.pos)) &&
    [STRUCTURE_ROAD,STRUCTURE_CONTAINER,STRUCTURE_RAMPART].some(t => t === object.structureType)) gates.add(cell(object.pos));
  // A gate path to every originally reachable exit component preserves all existing room connections.
  const remaining = new Set(exits.filter(i => original.has(i)));
  while (remaining.size) {
    const first = [...remaining].sort((a,b) => a-b)[0], group = grid.flood(walk,[first],new Set(walk.map((_,i) => i).filter(i => !remaining.has(i))));
    for (const i of group) remaining.delete(i);
    const path = grid.route(friendly,starts,group,barriers,gates);if (!path) return null;
    for (const i of path) if (barriers.has(i)) gates.add(i);
  }
  for (const object of [...colony.sources,colony.controller,...colony.structures,...colony.sites]) {
    if ('structureType' in object && object.structureType === STRUCTURE_WALL) continue;
    const goals = new Set(grid.neighbors(cell(object.pos)).filter(i => original.has(i)));
    if (!goals.size) continue;
    const accessible = grid.flood(friendly,starts,new Set(cells.filter(i => !gates.has(i))));
    if ([...goals].some(i => accessible.has(i))) continue;
    const path = grid.route(friendly,starts,goals,barriers,gates);if (!path) return null;
    for (const i of path) if (barriers.has(i)) gates.add(i);
  }
  const walls = new Set(cells.filter(i => !gates.has(i))), reachable = grid.flood(friendly,starts,walls);
  if (exits.some(i => original.has(i) && !reachable.has(i))) return null;
  for (const object of [...colony.sources,colony.controller,...colony.structures,...colony.sites]) {
    if ('structureType' in object && object.structureType === STRUCTURE_WALL) continue;
    const adjacent = grid.neighbors(cell(object.pos));
    if (adjacent.some(i => original.has(i)) && !adjacent.some(i => reachable.has(i))) return null;
  }
  return {version:1,status:'PLANNED',plannedAt:Game.time,
    tiles:cells.map(i => ({x:i%50,y:Math.floor(i/50),type:gates.has(i) ? STRUCTURE_RAMPART : STRUCTURE_WALL})),
    inside:walk.map((open,i) => open && !outside.has(i) && !barriers.has(i) ? i : -1).filter(i => i >= 0),
    gates:gates.size,cutSize:cells.length};
}
/** Plan from RCL4. Persist only the validated result; a reset recomputes an unfinished search.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record @param {() => boolean} allowed
 */
function plan(colony,record,allowed) {
  if (colony.controller.level < 4 || record.perimeter || !colony.spawns.length || !allowed()) return;
  const facts = geometry(colony), key = facts.protectedCells.map(x => x ? '1' : '0').join('');
  let work = pending.get(colony.room.name);
  if (!work || work.key !== key) {
    if (!work && pending.size >= 4) {record.planning='PERIMETER_PLANNER_BUSY';return;}
    work = {key,search:cut.create(facts.walk,facts.protectedCells)};pending.set(colony.room.name,work);
  }
  const result = cut.advance(work.search,allowed);
  record.planning='PERIMETER_SEARCH';
  if (work.search.failed) {record.planning='NO_FINITE_PERIMETER';pending.delete(colony.room.name);return;}
  if (result) {
    const plan = finish(colony,result);pending.delete(colony.room.name);
    if (plan) record.perimeter=plan;
    else record.planning='PERIMETER_ACCESS_INVALID';
  }
}
/** At most one new barrier site per run. Gates first; keep private ramparts traversable by our creeps.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record @param {() => boolean} allowed
 */
function build(colony,record,allowed) {
  if (!record.perimeter || colony.controller.level < 4 || !allowed()) return false;
  const existing = [...colony.structures,...colony.sites];
  const missing = record.perimeter.tiles.filter(b => !existing.some(s => s.structureType === b.type && cell(s.pos) === cell(b)));
  if (!missing.length) {record.perimeter.status=record.perimeter.tiles.every(b=>colony.structures.some(s=>s.structureType===b.type && cell(s.pos)===cell(b))) ? 'ENCLOSED' : 'BUILDING';return false;}
  const bank = colony.room.storage;
  if (!bank || bank.store.getUsedCapacity(RESOURCE_ENERGY) < (record.budget?.reserveFloor || 10000)) {record.perimeter.status='WAIT_DEFENSE_RESERVE';return false;}
  missing.sort((a,b) => Number(b.type === STRUCTURE_RAMPART)-Number(a.type === STRUCTURE_RAMPART) || cell(a)-cell(b));
  const target = missing[0], result = colony.room.createConstructionSite(target.x,target.y,target.type);
  if (result === OK) layout.rememberSite(record,target);
  record.perimeter.status=result === OK ? 'BUILDING' : `SITE_FAILED_${result}`;
  record.planning=`PERIMETER_${record.perimeter.status}`;return true;
}
module.exports = {plan,build,geometry,finish};

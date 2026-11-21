'use strict';

/** Persistent, additive building layout. Remember types/coordinates, never object IDs.
 * Existing owned buildings and owned sites become established positions; neutral
 * roads, containers, and walls in an owned colony are retained too. */
/** @param {BuildingPosition} building */
const key = building => `${building.type}:${building.x}:${building.y}`;
/** @param {BuildingPosition} building */
const priority = building => building.type === STRUCTURE_SPAWN ? 0 : building.type === STRUCTURE_TOWER ? 1 :
  building.type === STRUCTURE_EXTENSION ? 2 : 3;
/** @param {ColonyRecord} record */
function initialize(record) {
  if (!record.layout) record.layout = { version: 1, buildings: [] };
  if (record.layout.version !== 1) throw new Error(`Unsupported layout version: ${record.layout.version}`);
  return record.layout;
}
/** @param {ColonyRecord} record @param {BuildingPosition} building */
function rememberSite(record, building) {
  const layout = initialize(record);
  if (layout.buildings.some(b => key(b) === key(building))) return;
  layout.buildings.push({ ...building });
  layout.buildings.sort((a, b) => priority(a) - priority(b) || a.type.localeCompare(b.type) || a.x - b.x || a.y - b.y);
}

/** Capture visible layout every tick, even when construction is CPU/threat deferred.
 * Coordinates survive destruction, missing vision, and serialized-memory resets.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record
 */
function observe(colony, record) {
  const known = new Set(initialize(record).buildings.map(key));
  /** @type {Set<RoomObject>} */
  const ownSites = new Set(colony.sites);
  for (const object of [...colony.structures, ...colony.sites]) {
    if (!(object.structureType in CONTROLLER_STRUCTURES)) continue;
    const neutral = object.structureType === STRUCTURE_ROAD || object.structureType === STRUCTURE_CONTAINER ||
      object.structureType === STRUCTURE_WALL;
    const owned = 'my' in object ? object.my : ownSites.has(object);
    if (!owned && !neutral) continue;
    const building = { type: /** @type {BuildableStructureConstant} */ (object.structureType), x: object.pos.x, y: object.pos.y };
    if (!known.has(key(building))) { rememberSite(record, building); known.add(key(building)); }
  }
}

/** Restore one missing position before considering new placements. The normal
 * scheduled planner owns threat/site/CPU gates. Engine return codes adjudicate
 * tile legality; failures retain the original plan instead of relocating it.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record @param {() => boolean} allowed
 * @returns {boolean} True means missing infrastructure took this planning turn.
 */
function rebuild(colony, record, allowed) {
  const layout = initialize(record), existing = [...colony.structures, ...colony.sites];
  const own = (/** @type {AnyStructure | ConstructionSite} */ object) => !('my' in object) || object.my;
  for (const building of layout.buildings) {
    if (existing.some(s => own(s) && s.structureType === building.type && s.pos.x === building.x && s.pos.y === building.y)) continue;
    if (!allowed()) { record.planning = 'REBUILD_DEFERRED_CPU'; return true; }
    const limit = CONTROLLER_STRUCTURES[building.type][colony.controller.level] || 0;
    if (existing.filter(s => own(s) && s.structureType === building.type).length >= limit) {
      record.planning = `REBUILD_LIMIT_${building.type}_${building.x}_${building.y}`;
      return true;
    }
    const result = colony.room.createConstructionSite(building.x, building.y, building.type);
    record.planning = result === OK ? `REBUILD_PLACED_${building.type}_${building.x}_${building.y}` :
      `REBUILD_FAILED_${result}_${building.type}_${building.x}_${building.y}`;
    return true;
  }
  return false;
}
module.exports = { observe, rememberSite, rebuild };

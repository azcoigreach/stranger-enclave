'use strict';
const mining = require('economy.mining');

/** Production/transport demand, independent of desired creep counts. Routes are cached
 * in the colony record for 100 ticks. No game intents; failed routes remain explicit.
 * @param {ColonySnapshot} colony
 */
function specialized(colony) {
  return colony.room.energyCapacityAvailable >= 5 * BODYPART_COST[WORK] + BODYPART_COST[MOVE] ||
    colony.workers.some(c => c.memory.role === 'miner' || c.memory.role === 'hauler');
}

/** @param {Creep} creep @param {BodyPartConstant} type */
function parts(creep, type) { return creep.getActiveBodyparts(type); }

/** @param {ColonySnapshot} colony @param {Source} source @param {ColonyRecord} record */
function route(colony, source, record) {
  if (!record.routes) record.routes = {};
  const cached = record.routes[source.id];
  if (cached && Game.time - cached.tick < 100) return cached;
  const terrain = colony.room.getTerrain();
  const roads = new Set(colony.structures.filter(s => s.structureType === STRUCTURE_ROAD).map(s => `${s.pos.x},${s.pos.y}`));
  const goals = [...colony.spawns.map(s => ({ pos: s.pos, range: 1 })), { pos: colony.controller.pos, range: 3 }];
  let roundTrip = 0, minerTravel = 0, reachable = Boolean(colony.spawns.length);
  for (const goal of goals) {
    const path = source.pos.findPathTo(goal.pos, { range: goal.range, maxRooms: 1, ignoreCreeps: true, maxOps: 3000 });
    const end = path[path.length - 1];
    if (!source.pos.inRangeTo(goal.pos, goal.range) && (!end ||
        Math.max(Math.abs(end.x - goal.pos.x), Math.abs(end.y - goal.pos.y)) > goal.range)) { reachable = false; break; }
    const loaded = path.reduce((sum, step) => sum + (roads.has(`${step.x},${step.y}`) ? 1 :
      (terrain.get(step.x, step.y) & TERRAIN_MASK_SWAMP ? 5 : 1)), 0);
    roundTrip = Math.max(roundTrip, path.length + loaded + 4);
    minerTravel = Math.max(minerTravel, loaded * 5);
  }
  return record.routes[source.id] = { tick: Game.time, roundTrip, minerTravel, reachable };
}

/** @param {ColonySnapshot} colony @param {ColonyRecord} record @returns {EconomyDemand} */
function plan(colony, record) {
  const enabled = specialized(colony);
  const assignments = mining.assign(colony), geometry = mining.slots(colony);
  record.miningSources = Object.fromEntries(colony.sources.map(source => [source.id, {
    slots: (geometry.get(source.id) || []).length,
    assigned: [...assignments.values()].filter(a => a.source.id === source.id).length,
    waiting: colony.workers.filter(c => c.memory.role === 'miner' && c.memory.sourceId === source.id && !assignments.has(c.name)).length,
  }]));
  if (!enabled) return { specialized: false, sources: [], workerWork: 0, income: 0 };
  const sources = colony.sources.map(source => {
    const transport = route(colony, source, record);
    const income = source.energyCapacity / ENERGY_REGEN_TIME;
    return { id: source.id, work: Math.ceil(income / HARVEST_POWER),
      carry: Math.max(2, Math.ceil(income * transport.roundTrip / CARRY_CAPACITY)),
      travel: transport.minerTravel, slots: (geometry.get(source.id) || []).length,
      reachable: transport.reachable && (geometry.get(source.id) || []).length > 0, income };
  });
  const income = sources.filter(s => s.reachable).reduce((sum, source) => sum + source.income, 0);
  const infrastructureCost = sources.reduce((sum, s) => sum + s.work * BODYPART_COST[WORK] +
    BODYPART_COST[MOVE] + s.carry * (BODYPART_COST[CARRY] + BODYPART_COST[MOVE]), 0);
  // Generalist WORK costs 200 energy per WORK/CARRY/MOVE unit, amortized over lifespan.
  const workerWork = Math.max(2, Math.floor((income - infrastructureCost / CREEP_LIFE_TIME) /
    (UPGRADE_CONTROLLER_POWER + 200 / CREEP_LIFE_TIME)));
  return { specialized: true, sources, workerWork, income };
}

module.exports = { specialized, parts, plan };

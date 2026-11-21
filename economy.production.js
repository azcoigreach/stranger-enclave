'use strict';
const demand = require('economy.demand');

/** Specialized spawn requests; bootstrap recovery remains in economy.spawn.
 * All targets use body-part throughput, pending creeps, and replacement lead time.
 * @param {ColonySnapshot} colony @param {EconomyDemand} plan
 * @returns {SpawnRequest | null}
 */
function request(colony, plan) {
  const capacity = colony.room.energyCapacityAvailable;
  const viable = (/** @type {Creep} */ c, /** @type {number} */ travel) =>
    c.spawning || (c.ticksToLive || 0) > c.body.length * CREEP_SPAWN_TIME + travel + 10;
  const assigned = (/** @type {string} */ role, /** @type {SourceDemand} */ source) =>
    colony.workers.filter(c => c.memory.role === role && c.memory.sourceId === source.id && viable(c, source.travel));
  /** @type {SpawnRequest[]} */
  const requests = [];
  for (const source of plan.sources.filter(s => s.reachable)) {
    const miners = assigned('miner', source), haulers = assigned('hauler', source);
    const work = miners.reduce((sum, c) => sum + demand.parts(c, WORK), 0);
    const carry = haulers.reduce((sum, c) => sum + demand.parts(c, CARRY), 0);
    if (work < source.work && miners.length < source.slots) {
      const count = Math.min(source.work - work, Math.floor((capacity - BODYPART_COST[MOVE]) / BODYPART_COST[WORK]));
      if (count > 0) requests.push({ role: 'miner', sourceId: source.id, priority: 2,
        body: [...Array(count).fill(WORK), MOVE], reason: 'SOURCE_WORK_DEFICIT' });
    }
    if (work > 0 && carry < source.carry) {
      const count = Math.min(source.carry - carry, Math.floor(capacity / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])));
      /** @type {BodyPartConstant[]} */
      const body = [];
      for (let i = 0; i < count; i++) body.push(CARRY, MOVE);
      requests.push({ role: 'hauler', sourceId: source.id, body, priority: carry === 0 ? 1 : 3, reason: 'SOURCE_HAUL_DEFICIT' });
    }
  }
  const workers = colony.workers.filter(c => c.memory.role === 'bootstrap' && viable(c, 50));
  const workerWork = workers.reduce((sum, c) => sum + demand.parts(c, WORK), 0);
  if (workerWork < plan.workerWork) {
    const units = Math.min(3, Math.floor(capacity / 200));
    /** @type {BodyPartConstant[]} */
    const body = [];
    for (let i = 0; i < units; i++) body.push(WORK, CARRY, MOVE);
    requests.push({ role: 'bootstrap', body, priority: 4, reason: 'CONTROLLER_WORK_DEFICIT' });
  }
  requests.sort((a, b) => a.priority - b.priority || (a.sourceId || '').localeCompare(b.sourceId || ''));
  return requests[0] || null;
}
module.exports = { request };

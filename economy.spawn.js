'use strict';

const config = require('core.config');
const demand = require('economy.demand');
const production = require('economy.production');
const operations = require('operations.remote');

/** Pure bootstrap body selection. The first two workers always use the 200-energy rescue body.
 * @param {number} energy @param {number} active @returns {BodyPartConstant[]}
 */
function bodyFor(energy, active) {
  const units = Math.min(active < 2 ? 1 : config.maxWorkerUnits, Math.floor(energy / 200));
  /** @type {BodyPartConstant[]} */
  const body = [];
  for (let i = 0; i < units; i++) body.push(WORK, CARRY, MOVE);
  return body;
}

/** One coordinator issues at most one spawn intent per room/tick.
 * Owns sequence and colony spawn status. Counts spawning and near-death workers explicitly.
 * @param {ColonySnapshot} colony @param {BotMemory} memory @param {ColonyRecord} record
 */
function run(colony, memory, record) {
  const plan = colony.demand = demand.plan(colony, record);
  const generalists = colony.workers.filter(c => c.memory.role === 'bootstrap');
  const active = generalists.filter(c => !c.spawning);
  const desired = Math.max(2, Math.min(6, colony.sources.length * 2));
  let body = bodyFor(colony.room.energyAvailable, active.length);
  const leadTime = config.maxWorkerUnits * 3 * CREEP_SPAWN_TIME + 50;
  const viable = generalists.filter(c => c.spawning || (c.ticksToLive || 0) > leadTime).length;
  const pending = colony.spawns.filter(s => s.spawning && !Game.creeps[s.spawning.name]).length;
  record.workers = colony.workers.filter(c => !c.spawning).length;
  record.desired = plan.specialized ? undefined : desired;
  record.staffing = plan.specialized ? {
    minerWork: colony.workers.filter(c => c.memory.role === 'miner').reduce((sum, c) => sum + demand.parts(c, WORK), 0),
    haulCarry: colony.workers.filter(c => c.memory.role === 'hauler').reduce((sum, c) => sum + demand.parts(c, CARRY), 0),
    workerWork: generalists.reduce((sum, c) => sum + demand.parts(c, WORK), 0),
    requiredMinerWork: plan.sources.reduce((sum, s) => sum + s.work, 0),
    requiredHaulCarry: plan.sources.reduce((sum, s) => sum + s.carry, 0),
    requiredWorkerWork: plan.workerWork,
  } : undefined;
  record.spawnResult = undefined;
  if (!colony.spawns.length) { record.reason = 'NO_SPAWN_SUPPORT_REQUIRED'; return; }
  /** @type {SpawnRequest | null} */
  let request = null;
  if (plan.specialized && viable + pending >= 2) {
    request = production.request(colony, plan) || operations.request(colony, memory, record);
    if (!request) { record.reason = 'THROUGHPUT_READY'; return; }
    body = request.body;
  } else if (viable + pending >= desired) { record.reason = 'WORKFORCE_READY'; return; }
  const spawn = colony.spawns.find(s => !s.spawning);
  if (!spawn) { record.reason = 'SPAWN_BUSY'; return; }
  if (!body.length) { record.reason = 'WAITING_FOR_200_ENERGY'; return; }
  const cost = body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
  if (cost > colony.room.energyAvailable) { record.reason = `WAITING_FOR_${cost}_ENERGY_${request && request.role}`; return; }
  const role = request ? request.role : 'bootstrap';
  const name = `${role === 'bootstrap' ? 'worker' : role}-${colony.room.name}-${Game.time}-${memory.sequence++}`;
  const result = spawn.spawnCreep(body, name, {
    memory: { role, home: colony.room.name, working: false, ...(request && request.targetRoom ? {targetRoom:request.targetRoom} : {}), ...(request && request.sourceId ? { sourceId: request.sourceId } : {}) },
  });
  if (result === OK && request && request.targetRoom && record.expansion && record.expansion.remote) {
    const state=record.expansion;
    const op=(state.remotes || (state.remote ? [state.remote] : [])).find(o=>o.room===request.targetRoom && o.sourceId===request.sourceId);
    if(op) op.spawnEnergy += cost;
  }
  record.spawnResult = result;
  record.reason = result === OK ? (request ? `SPAWNING_${request.role.toUpperCase()}_${request.reason}` :
    (active.length < 2 ? 'SPAWNING_RECOVERY_WORKER' : 'SPAWNING_WORKER')) : `SPAWN_FAILED_${result}`;
}

module.exports = { bodyFor, run };

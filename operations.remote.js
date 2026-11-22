'use strict';
const intel = require('territory.intel');
const movement = require('movement.remote');
const territory = require('territory.policy');
const runtime = require('core.runtime');
const config = require('core.config');
const economics = require('economy.budget');
const ranking = require('operations.ranking');

/** @param {string} home @param {string} role @param {string} [target] @param {string} [sourceId] */
function population(home,role,target,sourceId) {
  return Object.values(Game.creeps).filter(c => c.memory.home === home && c.memory.role === role &&
    (!target || c.memory.targetRoom === target) && (!sourceId || c.memory.sourceId === sourceId));
}
/** @param {Creep} creep @param {number} travel */
function viable(creep,travel) {
  return creep.spawning || (creep.ticksToLive || 0) > creep.body.length * CREEP_SPAWN_TIME + travel + 20;
}
/** @param {number} pairs @returns {BodyPartConstant[]} */
function carryBody(pairs) {
  /** @type {BodyPartConstant[]} */
  const body = [];
  for (let i=0;i<pairs;i++) body.push(CARRY,MOVE);
  return body;
}
/** Update state independently of spawn arbitration. One operation per source, bounded by the colony budget.
 * Metrics count resolved transfer events, never accepted intents as deliveries.
 * @param {ColonySnapshot} colony @param {BotMemory} memory @param {ColonyRecord} record
 */
function update(colony,memory,record) {
  const state = record.expansion || (record.expansion = {reason:'WAIT_STORAGE'});
  const home = colony.room.name, storage = colony.room.storage;
  const ops=state.remotes || (state.remotes=state.remote ? [state.remote] : []);
  // Restore the compatibility alias after JSON serialization; never duplicate operation state.
  state.remote=ops[0];
  for (const op of ops) {
    if (op.measuredTick !== Game.time) {
      const actors = new Set(op.actors || []);
      for (const event of colony.room.getEventLog()) {
        if (event.event === EVENT_TRANSFER && actors.has(event.objectId) && storage && event.data.targetId === storage.id &&
          event.data.resourceType === RESOURCE_ENERGY) op.delivered += event.data.amount;
      }
      op.measuredTick = Game.time;
      op.actors = population(home,'remoteHauler',op.room,op.sourceId).map(c => c.id);
      const sample=op.deliverySample;
      if(!sample) op.deliverySample={tick:Game.time,delivered:op.delivered,rate:-1};
      else if(Game.time-sample.tick>=500) op.deliverySample={tick:Game.time,delivered:op.delivered,
        rate:(op.delivered-sample.delivered)/(Game.time-sample.tick)};
    }
    const observation = memory.intel[op.room];
    const adjacent = Object.values(Game.map.describeExits(home) || {}).includes(op.room);
    if(op.retiring) op.reason='RETIRING_SURPLUS';
    else if (ranking.sponsor(memory,op.room)!==home) op.reason='OTHER_SPONSOR';
    else if (!adjacent || !territory.contains(op.room,memory.block)) op.reason = 'INVALID_REMOTE_BOUNDARY';
    else if (!storage || !storage.my) op.reason = 'WAIT_STORAGE';
    else if (colony.hostiles.length) op.reason = 'HOME_THREAT';
    else if (!observation || Game.time-observation.lastSeen > 500) op.reason = 'STALE_INTEL';
    else if (observation.kind !== 'controller' || !intel.safe(observation,(colony.controller.owner && colony.controller.owner.username || ''))) op.reason = 'UNSAFE_REMOTE';
    else if (!observation.sources || !observation.sources.some(s => s.id === op.sourceId && s.slots.length)) op.reason = 'SOURCE_UNAVAILABLE';
    else {
      if (Game.time-op.checked >= 100 && runtime.optionalWorkAllowed()) {
        const source = observation.sources.find(s => s.id === op.sourceId);
        const distance = source && storage && movement.distance(storage.pos,new RoomPosition(source.x,source.y,op.room),source.slots);
        op.routeValid = distance !== null && distance !== undefined && distance <= config.maxRemoteTravel;
        if (source && op.routeValid && distance !== null && distance !== undefined) {
          op.reserve=colony.room.energyCapacityAvailable>=1300;
          op.grossIncome=ranking.income(source,op.reserve);
          op.travel=distance;op.carry=Math.ceil((distance*2+10)*op.grossIncome/CARRY_CAPACITY);
          const sharesReservation=ops.some(peer=>peer!==op && peer.room===op.room && peer.reason==='ACTIVE' && !peer.retiring && peer.reserve);
          op.routeValid=economics.remoteNet({...op,reservationShare:sharesReservation ? 0 : 1,deliverySample:undefined})>=config.minimumRemoteNet;
        }
        op.checked=Game.time;
      }
      op.reason = op.routeValid === false ? 'NO_ECONOMIC_ROUTE' : 'ACTIVE';
    }
    state.reason = op.reason;
  }
  const target=record.budget ? record.budget.remoteTarget : 1;
  const active=ops.filter(op=>!op.retiring);
  if(active.length>target && Game.time-(state.capacityChanged||0)>=config.remoteResizeInterval) {
    // Retire the least productive route. Crews return cargo and are not replaced.
    const excess=active.slice().sort((a,b)=>(a.netIncome??6)-(b.netIncome??6)||b.travel-a.travel)[0];
    excess.retiring=true;excess.reason='RETIRING_SURPLUS';state.capacityChanged=Game.time;
  }
  for(let i=ops.length-1;i>=0;i--) if(ops[i].retiring && !Object.values(Game.creeps).some(c=>c.memory.home===home && c.memory.targetRoom===ops[i].room && c.memory.sourceId===ops[i].sourceId)) ops.splice(i,1);
  state.remote=ops[0];
  if(ops.filter(op=>!op.retiring).length>=target) {state.capacityReason='TARGET_MET';return;}
  if(ops.length && Game.time-(state.capacityChanged||0)<config.remoteResizeInterval) return;
  if (!storage || !storage.my) {state.reason=state.capacityReason='WAIT_STORAGE';return;}
  if (colony.hostiles.length) {state.reason=state.capacityReason='HOME_THREAT';return;}
  if (storage.store.getUsedCapacity(RESOURCE_ENERGY) < (record.budget ? record.budget.reserveFloor+2000 : 2000)) {state.reason=state.capacityReason='WAIT_STORAGE_RESERVE';return;}
  if (!runtime.optionalWorkAllowed()) {state.reason=state.capacityReason='DEFERRED_CPU';return;}
  // Bound expensive path searches; keep failed surveys visible without retrying every tick.
  if ((Game.time + home.length) % 25 !== 0) return;
  const result=ranking.survey(colony,memory,ops);
  if(!result){state.capacityReason='DEFERRED_CPU';return;}
  state.surveyedAt=Game.time;
  state.ranking=result.ranking;
  state.resurvey=result.resurvey;
  state.candidate=result.best;
  if(!result.operation || !result.best){
    state.reason=state.capacityReason=result.best?.reason ?? 'WAIT_SAFE_ADJACENT_INTEL';
    return;
  }
  result.best.reason='ADMITTED';
  ops.push(result.operation);
  state.remote=ops[0];
  state.capacityChanged=Game.time;
  state.reason=state.capacityReason='ACTIVE';
}
/** Called only after local production has no outstanding request. No separate spawn intents.
 * @param {ColonySnapshot} colony @param {BotMemory} memory @param {ColonyRecord} record
 * @returns {SpawnRequest | null}
 */
function request(colony,memory,record) {
  if (!runtime.optionalWorkAllowed() || colony.hostiles.length || colony.controller.level < 2) return null;
  if (colony.structures.some(s => s.structureType === STRUCTURE_TOWER && s.my && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)) return null;
  if (colony.controller.ticksToDowngrade < 5000) return null;
  const missingBuildings = record.layout ? record.layout.buildings.filter(b => !colony.structures.some(s =>
    s.structureType === b.type && s.pos.x === b.x && s.pos.y === b.y)) : [];
  // Keep essential spawn/tower construction ahead of scouting, but ordinary development must not
  // suppress the cheap survey role for an entire creep lifetime (for example while building storage).
  if (missingBuildings.some(b => b.type === STRUCTURE_SPAWN || b.type === STRUCTURE_TOWER)) return null;
  const home=colony.room.name, state=record.expansion;
  // Only the original home launches the shared block survey.
  if (home === memory.home && Object.keys(Game.map.describeExits(home) || {}).length && !population(home,'scout').some(c => viable(c,50))) {
    return {role:'scout',body:[MOVE],priority:10,reason:'BLOCK_SURVEY'};
  }
  const ops=state && (state.remotes || (state.remote ? [state.remote] : [])) || [];
  const storage=colony.room.storage;
  if(!storage || !storage.my || storage.store.getUsedCapacity(RESOURCE_ENERGY)<2000) return null;
  /** @type {SpawnRequest[]} */
  const requests=[];
  for(const op of ops) {
  if(op.reason!=='ACTIVE' || op.retiring || ranking.sponsor(memory,op.room)!==home) continue;
  // Existing income must survive lengthy barricade work. A new operation still waits for ordinary buildings.
  const established=op.delivered>0 || population(home,'remoteMiner',op.room,op.sourceId).length>0;
  if(!established && missingBuildings.some(b=>b.type!==STRUCTURE_WALL && b.type!==STRUCTURE_RAMPART)) continue;
  // Spawn arbitration precedes optional state updates; validate today's safety observations directly.
  const observation=memory.intel[op.room];
  if (!observation || Game.time-observation.lastSeen>500 || observation.kind !== 'controller' || !intel.safe(observation,colony.controller.owner && colony.controller.owner.username || '')) continue;
  const assigned = (/** @type {string} */ role) => population(home,role,op.room,role==='reserver' ? undefined : op.sourceId).filter(c => viable(c,op.travel));
  const miners=assigned('remoteMiner'), haulers=assigned('remoteHauler'), reservers=assigned('reserver');
  const capacity=colony.room.energyCapacityAvailable;
  const common={targetRoom:op.room,sourceId:op.sourceId,priority:11};
  const carry=haulers.reduce((sum,c) => sum+c.getActiveBodyparts(CARRY),0);
  // Bootstrap transport and production before optional reservation, across all rooms.
  if (carry > 0 && !miners.length && capacity >= 750) {
    requests.push({...common,role:'remoteMiner',body:[WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,MOVE,MOVE],reason:'REMOTE_SOURCE'});continue;
  }
  if(carry===0){
    const pairs=Math.min(op.carry,12,Math.floor(capacity/100));
    if(pairs)requests.push({...common,role:'remoteHauler',body:carryBody(pairs),reason:'REMOTE_TRANSPORT'});
    continue;
  }
  const username=colony.controller.owner?.username;
  const remaining=observation.reservation===username ? Math.max(0,(observation.reservationUntil||0)-Game.time) : 0;
  const lead=Math.max(config.reservationLeadTicks,op.travel+4*CREEP_SPAWN_TIME+20);
  // Hauling demand assumes reserved output. Do not wait to fill that whole fleet
  // before enabling the source output it was sized for. Banked reservation lasts
  // beyond a reserver's lifetime, so replacements follow expiry, not presence alone.
  if (miners.length && op.reserve!==false && !reservers.length && capacity >= 1300 && remaining<=lead) {
    requests.push({...common,priority:12,role:'reserver',body:[CLAIM,CLAIM,MOVE,MOVE],reason:'REMOTE_RESERVATION'});continue;
  }
  if (carry < op.carry) {
    const pairs=Math.min(op.carry-carry,12,Math.floor(capacity/100));
    if (pairs) requests.push({...common,priority:13,role:'remoteHauler',body:carryBody(pairs),reason:'REMOTE_TRANSPORT'});
  }
  }
  requests.sort((a,b)=>a.priority-b.priority || (a.targetRoom||'').localeCompare(b.targetRoom||''));
  return requests[0] || null;
}

module.exports = {update,request,population};

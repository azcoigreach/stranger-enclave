'use strict';
const intel = require('territory.intel');
const movement = require('movement.remote');
const territory = require('territory.policy');
const runtime = require('core.runtime');
const config = require('core.config');
const economics = require('economy.budget');

/** @param {string} home @param {string} role @param {string} [target] */
function population(home,role,target) {
  return Object.values(Game.creeps).filter(c => c.memory.home === home && c.memory.role === role &&
    (!target || c.memory.targetRoom === target));
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
/** Update state independently of spawn arbitration. One source per adjacent room, bounded by the colony budget.
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
      op.actors = population(home,'remoteHauler',op.room).map(c => c.id);
      const sample=op.deliverySample;
      if(!sample) op.deliverySample={tick:Game.time,delivered:op.delivered,rate:-1};
      else if(Game.time-sample.tick>=500) op.deliverySample={tick:Game.time,delivered:op.delivered,
        rate:(op.delivered-sample.delivered)/(Game.time-sample.tick)};
    }
    const observation = memory.intel[op.room];
    const adjacent = Object.values(Game.map.describeExits(home) || {}).includes(op.room);
    if(op.retiring) op.reason='RETIRING_SURPLUS';
    else if (!adjacent || !territory.contains(op.room,memory.block)) op.reason = 'INVALID_REMOTE_BOUNDARY';
    else if (!storage || !storage.my) op.reason = 'WAIT_STORAGE';
    else if (colony.hostiles.length) op.reason = 'HOME_THREAT';
    else if (!observation || Game.time-observation.lastSeen > 500) op.reason = 'STALE_INTEL';
    else if (observation.kind !== 'controller' || !intel.safe(observation,(colony.controller.owner && colony.controller.owner.username || ''))) op.reason = 'UNSAFE_REMOTE';
    else if (!observation.sources || !observation.sources.some(s => s.id === op.sourceId && s.slots.length)) op.reason = 'SOURCE_UNAVAILABLE';
    else {
      if (Game.time-op.checked >= 100 && runtime.optionalWorkAllowed()) {
        const source = observation.sources.find(s => s.id === op.sourceId);
        const distance = source && storage && movement.distance(storage.pos,new RoomPosition(source.x,source.y,op.room));
        op.routeValid = distance !== null && distance !== undefined && distance <= config.maxRemoteTravel;
        if (op.routeValid && distance !== null && distance !== undefined) {
          op.reserve=colony.room.energyCapacityAvailable>=1300;
          op.grossIncome=op.reserve ? 10 : (source?.capacity || 1500)/ENERGY_REGEN_TIME;
          op.travel=distance;op.carry=Math.ceil((distance*2+10)*op.grossIncome/CARRY_CAPACITY);
          op.routeValid=economics.remoteNet({...op,deliverySample:undefined})>=config.minimumRemoteNet;
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
    const excess=active.slice().sort((a,b)=>(a.netIncome||6)-(b.netIncome||6)||b.travel-a.travel)[0];
    excess.retiring=true;excess.reason='RETIRING_SURPLUS';state.capacityChanged=Game.time;
  }
  for(let i=ops.length-1;i>=0;i--) if(ops[i].retiring && !Object.values(Game.creeps).some(c=>c.memory.home===home && c.memory.targetRoom===ops[i].room)) ops.splice(i,1);
  state.remote=ops[0];
  if(ops.filter(op=>!op.retiring).length>=target) {state.capacityReason='TARGET_MET';return;}
  if(ops.length && Game.time-(state.capacityChanged||0)<config.remoteResizeInterval) return;
  if (!storage || !storage.my) {state.reason=state.capacityReason='WAIT_STORAGE';return;}
  if (colony.hostiles.length) {state.reason=state.capacityReason='HOME_THREAT';return;}
  if (storage.store.getUsedCapacity(RESOURCE_ENERGY) < (record.budget ? record.budget.reserveFloor+2000 : 2000)) {state.reason=state.capacityReason='WAIT_STORAGE_RESERVE';return;}
  if (!runtime.optionalWorkAllowed()) {state.reason=state.capacityReason='DEFERRED_CPU';return;}
  // Bound expensive path searches; keep failed surveys visible without retrying every tick.
  if ((Game.time + home.length) % 25 !== 0) return;
  state.reason=state.capacityReason='WAIT_SAFE_ADJACENT_INTEL';
  const neighbors = Object.values(Game.map.describeExits(home) || {}).sort();
  for (const name of neighbors) {
    if(ops.some(op=>op.room===name)) continue;
    const observation = memory.intel[name];
    if (!territory.contains(name,memory.block) || !observation || Game.time-observation.lastSeen>500 || observation.kind !== 'controller' ||
      !intel.safe(observation,(colony.controller.owner && colony.controller.owner.username || ''))) continue;
    for (const source of observation.sources || []) {
      if (!runtime.optionalWorkAllowed()) {state.reason=state.capacityReason='DEFERRED_CPU';return;}
      if (!source.slots.length) continue;
      const distance = movement.distance(storage.pos,new RoomPosition(source.x,source.y,name));
      state.candidate={room:name,sourceId:source.id,travel:distance,reason:'EVALUATING'};
      if(distance===null || distance>config.maxRemoteTravel){state.reason=state.capacityReason=state.candidate.reason='NO_ECONOMIC_ROUTE';continue;}
      const reserve=colony.room.energyCapacityAvailable>=1300,grossIncome=reserve ? 10 : source.capacity/ENERGY_REGEN_TIME;
      /** @type {RemoteOperation} */
      const candidate={room:name,sourceId:source.id,reason:'ACTIVE',travel:distance,carry:Math.ceil((distance*2+10)*grossIncome/CARRY_CAPACITY),
        grossIncome,reserve,checked:Game.time,delivered:0,spawnEnergy:0};
      candidate.netIncome=economics.remoteNet(candidate);state.candidate.netIncome=candidate.netIncome;
      if(candidate.netIncome<config.minimumRemoteNet){state.reason=state.capacityReason=state.candidate.reason='UNPROFITABLE_REMOTE';continue;}
      const homeSpawnLoad=colony.workers.reduce((sum,c)=>sum+c.body.length*CREEP_SPAWN_TIME/Math.max(300,CREEP_LIFE_TIME-50),0);
      const spawnLoad=homeSpawnLoad+ops.filter(op=>!op.retiring).reduce((sum,op)=>sum+economics.remoteSpawnLoad(op),0)+economics.remoteSpawnLoad(candidate);
      state.candidate.spawnLoad=spawnLoad;
      if(spawnLoad>colony.spawns.length*config.maxSpawnUtilization){state.reason=state.capacityReason=state.candidate.reason='SPAWN_CAPACITY';continue;}
      state.candidate.reason='ADMITTED';ops.push(candidate);
      state.remote=ops[0];state.capacityChanged=Game.time;
      state.reason=state.capacityReason='ACTIVE';
      return;
    }
  }
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
  for(const op of ops) {
  if(op.reason!=='ACTIVE' || op.retiring) continue;
  // Existing income must survive lengthy barricade work. A new operation still waits for ordinary buildings.
  const established=op.delivered>0 || population(home,'remoteMiner',op.room).length>0;
  if(!established && missingBuildings.some(b=>b.type!==STRUCTURE_WALL && b.type!==STRUCTURE_RAMPART)) continue;
  // Spawn arbitration precedes optional state updates; validate today's safety observations directly.
  const observation=memory.intel[op.room];
  if (!observation || Game.time-observation.lastSeen>500 || observation.kind !== 'controller' || !intel.safe(observation,colony.controller.owner && colony.controller.owner.username || '')) continue;
  const assigned = (/** @type {string} */ role) => population(home,role,op.room).filter(c => viable(c,op.travel));
  const miners=assigned('remoteMiner'), haulers=assigned('remoteHauler'), reservers=assigned('reserver');
  const capacity=colony.room.energyCapacityAvailable;
  const common={targetRoom:op.room,sourceId:op.sourceId,priority:11};
  const carry=haulers.reduce((sum,c) => sum+c.getActiveBodyparts(CARRY),0);
  // A collector first, then its producer; don't drop an entire source while the first hauler spawns.
  if (carry > 0 && !miners.length && capacity >= 750) return {...common,role:'remoteMiner',body:[WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,MOVE,MOVE],reason:'REMOTE_SOURCE'};
  if (carry < op.carry) {
    const pairs=Math.min(op.carry-carry,12,Math.floor(capacity/100));
    if (pairs) return {...common,role:'remoteHauler',body:carryBody(pairs),reason:'REMOTE_TRANSPORT'};
  }
  if (op.reserve!==false && !reservers.length && capacity >= 1300) return {...common,role:'reserver',body:[CLAIM,CLAIM,MOVE,MOVE],reason:'REMOTE_RESERVATION'};
  }
  return null;
}
module.exports = {update,request,population};

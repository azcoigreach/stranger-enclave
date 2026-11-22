'use strict';
const economics = require('economy.budget');
const movement = require('movement.remote');
const territory = require('territory.policy');
const intel = require('territory.intel');
const runtime = require('core.runtime');
const config = require('core.config');

/** @param {ColonyRecord} record */
function operations(record) {
  const state = record.expansion;
  return state?.remotes ?? (state?.remote ? [state.remote] : []);
}

/** One sponsor supplies the room-level reservation and arbitrates all its sources.
 * Resolve overlapping legacy records in stable home order.
 * @param {BotMemory} memory @param {string} room */
function sponsor(memory, room) {
  return Object.keys(memory.colonies).sort().find(home =>
    Game.rooms[home]?.controller?.my &&
    operations(memory.colonies[home]).some(op => op.room === room));
}

/** @param {IntelSource} source @param {boolean} reserve */
function income(source, reserve) {
  return (reserve ? SOURCE_ENERGY_CAPACITY : Math.min(source.capacity,SOURCE_ENERGY_NEUTRAL_CAPACITY)) / ENERGY_REGEN_TIME;
}

/** Keep completed path work across CPU deferrals; never commit a partial ranking.
 * @type {Map<string,{tick:number, distances:Map<string,number|null>}>} */
const pending = new Map();

/** @param {ColonySnapshot} colony @param {BotMemory} memory @param {RemoteOperation[]} ops */
function survey(colony, memory, ops) {
  const storage = colony.room.storage;
  if (!storage) return;
  const home = colony.room.name;
  const key = storage.id;
  let cache = pending.get(key);
  if (!cache || Game.time-cache.tick>150) {
    cache = {tick:Game.time, distances:new Map()};
    pending.set(key,cache);
  }
  const localLoad = colony.workers.reduce((sum,c)=>sum+c.body.length*CREEP_SPAWN_TIME/(CREEP_LIFE_TIME-50),0);
  const existingLoad = ops.filter(op=>!op.retiring).reduce((sum,op)=>sum+economics.remoteSpawnLoad(op),localLoad);
  /** @type {RemoteCandidate[]} */ const ranking = [];
  /** @type {string[]} */ const resurvey = [];
  /** @type {Map<string,RemoteOperation>} */ const proposals = new Map();
  for (const room of Object.values(Game.map.describeExits(home) || {}).sort()) {
    if (!territory.contains(room,memory.block)) continue;
    const owner = sponsor(memory,room);
    if (owner && owner !== home) continue;
    const info = memory.intel[room];
    if (!info || Game.time-info.lastSeen>500 || !info.sources?.length) {
      resurvey.push(room);
      continue;
    }
    if (info.kind !== 'controller' || !intel.safe(info,colony.controller.owner?.username || '')) continue;
    const shared = ops.some(op=>op.room===room && !op.retiring && op.reason==='ACTIVE' && op.reserve!==false);
    for (const source of info.sources) {
      if (ops.some(op=>op.room===room && op.sourceId===source.id)) continue;
      /** @type {RemoteCandidate} */
      const result = {room,sourceId:source.id,travel:null,reason:'NO_MINING_SPACE'};
      ranking.push(result);
      if (!source.slots.length) continue;
      const routeKey = source.id + JSON.stringify(source.slots);
      let travel = cache.distances.get(routeKey);
      if (travel === undefined) {
        if (!runtime.optionalWorkAllowed()) return;
        travel = movement.distance(storage.pos,new RoomPosition(source.x,source.y,room),source.slots);
        cache.distances.set(routeKey,travel);
      }
      result.travel = travel;
      if (travel===null || travel>config.maxRemoteTravel) {
        result.reason='NO_ECONOMIC_ROUTE';
        continue;
      }
      const reserve = colony.room.energyCapacityAvailable>=1300;
      const grossIncome = income(source,reserve);
      const carry = Math.ceil((2*travel+10)*grossIncome/CARRY_CAPACITY);
      /** @type {RemoteOperation} */
      const op = {room,sourceId:source.id,travel,carry,grossIncome,reserve,reservationShare:shared ? 0 : 1,
        checked:Game.time,delivered:0,spawnEnergy:0,reason:'ACTIVE'};
      result.costs = economics.costBreakdown(op);
      result.grossIncome = grossIncome;
      result.netIncome = op.netIncome = economics.remoteNet(op);
      result.spawnLoad = existingLoad + economics.remoteSpawnLoad(op);
      if (result.netIncome<config.minimumRemoteNet) result.reason='UNPROFITABLE_REMOTE';
      else if (result.spawnLoad>colony.spawns.length*config.maxSpawnUtilization) result.reason='SPAWN_CAPACITY';
      else {
        result.reason='ELIGIBLE';
        proposals.set(source.id,op);
      }
    }
  }
  pending.delete(key);
  ranking.sort((a,b)=>Number(b.reason==='ELIGIBLE')-Number(a.reason==='ELIGIBLE') ||
    (b.netIncome ?? -Infinity)-(a.netIncome ?? -Infinity) || a.room.localeCompare(b.room) || a.sourceId.localeCompare(b.sourceId));
  const best = ranking[0];
  return {ranking,resurvey,best,operation:best && proposals.get(best.sourceId)};
}
module.exports = {operations,sponsor,income,survey};

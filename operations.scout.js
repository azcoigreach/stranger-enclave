'use strict';
const territory = require('territory.policy');
const movement = require('movement.remote');
const intel = require('territory.intel');

/** Visit the oldest reachable rooms, favoring short routes among unseen rooms. A target persists until
 * actually observed; blocked routes and stuck targets get a bounded, per-room retry delay.
 * @param {Creep} creep @param {BotMemory} memory
 */
function run(creep,memory) {
  if (creep.spawning) return;
  const home=creep.memory.home || '', username=memory.intel[home] && memory.intel[home].owner || '';
  const current=memory.intel[creep.room.name];
  if (creep.room.name !== home && current && !intel.safe(current,username,false)) {
    creep.memory.task='SCOUT_RETREAT';
    movement.travel(creep,home,memory,true); return;
  }
  const blocked=creep.memory.scoutBlocked || (creep.memory.scoutBlocked={});
  for (const name of Object.keys(blocked)) if (blocked[name] <= Game.time) delete blocked[name];
  let target=creep.memory.targetRoom;
  if (target && Game.time-(creep.memory.scoutSince || 0) > 300) {blocked[target]=Game.time+500;target=undefined;}
  if (target === creep.room.name || target && !movement.route(creep.room.name,target,memory,home,true)) target=undefined;
  if (!target) {
    if (!require('core.runtime').optionalWorkAllowed()) {creep.memory.task='SCOUT_DEFERRED_CPU';return;}
    const here=territory.coordinates(creep.room.name);
    const distance=(/** @type {string} */ name) => {const p=territory.coordinates(name);return Math.abs(p.x-here.x)+Math.abs(p.y-here.y);};
    const candidates=territory.rooms(memory.block).filter(name => name !== creep.room.name && !blocked[name] &&
      (!memory.intel[name] || intel.safe(memory.intel[name],username,false)))
      .sort((a,b) => (memory.intel[a] ? memory.intel[a].lastSeen : -1000000) -
        (memory.intel[b] ? memory.intel[b].lastSeen : -1000000) || distance(a)-distance(b) || a.localeCompare(b));
    // Prefer nearby unseen rooms without doing 81 expensive tile searches.
    let bestLength=Infinity;
    for (const name of candidates.slice(0,12)) {
      if (target && memory.intel[name]) break;
      const route=movement.route(creep.room.name,name,memory,home,true);
      if (!route) {blocked[name]=Game.time+500;continue;}
      if (route.length < bestLength) {target=name;bestLength=route.length;}
      if (memory.intel[name] || bestLength === 1) break;
    }
    creep.memory.targetRoom=target;
    creep.memory.scoutSince=Game.time;
  }
  if (!target) {creep.memory.task='SCOUT_WAIT_ROUTE';return;}
  creep.memory.task=`SCOUT_${target}`;
  movement.travel(creep,target,memory,true);
}
module.exports={run};

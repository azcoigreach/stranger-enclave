'use strict';
const threat=require('defense.threat');
const movement=require('defense.movement');
/** A self-sufficient fighter never chases beyond its assigned room. A lost
 * advantage causes retreat; pending reinforcements are not counted as cover.
 * @param {Creep} creep @param {BotMemory} memory */
function run(creep,memory){
  if(creep.spawning||!require('territory.policy').contains(creep.room.name,memory.block))return;
  const name=creep.memory.defenseRoom,incident=name&&memory.defense?.rooms[name];
  const profile=threat.profile(creep);
  if(profile.heal>0&&creep.hits<creep.hitsMax)creep.memory.lastAction=creep.heal(creep);
  if(!name||!incident||incident.mode==='clear'){
    delete creep.memory.defenseRoom;creep.memory.task='DEFENSE_RESERVE';retreat(creep,memory);return;
  }
  const info=memory.intel[name],room=Game.rooms[name],target=room&&threat.targets(room.find(FIND_HOSTILE_CREEPS))[0];
  if(!target){
    if(info?.hostiles?.length&&!threat.holds(profile,info.hostiles,50)){creep.memory.task='DEFENSE_RETREAT';retreat(creep,memory);return;}
    creep.memory.task='DEFENSE_VERIFY_CLEARANCE';
    if(creep.room.name!==name)creep.memory.lastMove=movement.move(creep,new RoomPosition(25,25,name),20,memory,true);
    return;
  }
  if(!incident.assigned.includes(creep.name)||!threat.holds(profile,info?.hostiles||[],0)){
    creep.memory.task='DEFENSE_RETREAT';retreat(creep,memory);return;
  }
  creep.memory.task=creep.room.name===name?'DEFENSE_ENGAGE':'DEFENSE_INTERCEPT';
  const range=profile.ranged?3:1;
  if(creep.room.name===name&&creep.pos.inRangeTo(target,range))
    creep.memory.lastAction=profile.ranged?creep.rangedAttack(target):creep.attack(target);
  const civilian=incident.mode==='escort'&&Object.values(Game.creeps).filter(c=>c.memory.evacuation&&c.room.name===name&&!c.spawning)
    .sort((a,b)=>creep.pos.getRangeTo(a)-creep.pos.getRangeTo(b)||a.name.localeCompare(b.name))[0];
  if(civilian&&creep.room.name===name){
    creep.memory.task='DEFENSE_ESCORT';
    if(profile.heal>0&&creep.hits===creep.hitsMax&&civilian.hits<civilian.hitsMax&&creep.pos.inRangeTo(civilian,1))creep.memory.lastAction=creep.heal(civilian);
    creep.memory.lastMove=movement.move(creep,civilian.pos,1,memory,true);
  }else creep.memory.lastMove=movement.move(creep,target.pos,range,memory,true);
}
/** @param {Creep} creep @param {BotMemory} memory */
function retreat(creep,memory){
  const home=creep.memory.home||'',username=memory.intel[home]?.owner||'';
  const room=[home,...Object.values(Game.map.describeExits(creep.room.name)||{}).sort()]
    .find(n=>movement.safe(n,memory,username));
  if(room&&room!==creep.room.name)creep.memory.lastMove=movement.move(creep,new RoomPosition(25,25,room),20,memory);
  else if(room===creep.room.name){const anchor=creep.room.storage?.pos||Object.values(Game.spawns).find(s=>s.room.name===room)?.pos;
    if(anchor)require('movement.remote').park(creep,anchor,memory);}
  else require('defense.civilian').flee(creep,memory);
}
module.exports={run};

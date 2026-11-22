'use strict';
const movement=require('defense.movement');
const roles=['bootstrap','miner','hauler','distributor','engineer','remoteMiner','remoteHauler','reserver'];
/** Own the entire civilian turn during evacuation/return. Persist the original
 * work room across resets; a fallback becoming threatened forces reassessment.
 * @param {Creep} creep @param {BotMemory} memory @returns {boolean} */
function run(creep,memory){
  if(creep.spawning||!roles.includes(creep.memory.role||''))return false;
  const home=creep.memory.home||'',username=memory.intel[home]?.owner||'';
  const work=creep.memory.targetRoom||home,states=memory.defense?.rooms||{};
  const blocked=(/** @type {string} */ name)=>states[name]&&states[name].mode!=='clear'&&states[name].mode!=='tower';
  const nearbyTowerThreat=states[creep.room.name]?.mode==='tower'&&creep.room.find(FIND_HOSTILE_CREEPS).some(c=>creep.pos.inRangeTo(c,5));
  const incident=nearbyTowerThreat?creep.room.name:blocked(creep.room.name)?creep.room.name:blocked(work)?work:blocked(home)?home:undefined;
  if(incident&&!creep.memory.evacuation)creep.memory.evacuation={room:work,incident};
  const evacuation=creep.memory.evacuation;if(!evacuation)return false;
  if(!incident&&!blocked(evacuation.incident)&&movement.safe(evacuation.room,memory,username)){
    if(creep.room.name===evacuation.room){delete creep.memory.evacuation;return false;}
    creep.memory.task='DEFENSE_SAFE_RETURN';
    creep.memory.lastMove=movement.move(creep,new RoomPosition(25,25,evacuation.room),20,memory);return true;
  }
  const currentSafe=movement.safe(creep.room.name,memory,username)&&!blocked(creep.room.name);
  if(currentSafe){
    evacuation.fallback=creep.room.name;creep.memory.task='DEFENSE_WAIT_CLEARANCE';
    const anchor=creep.room.storage?.pos||Object.values(Game.spawns).find(s=>s.room.name===creep.room.name)?.pos;
    if(anchor)require('movement.remote').park(creep,anchor,memory);
  }else{
    const choices=[home,...Object.values(Game.map.describeExits(creep.room.name)||{}).sort()]
      .filter((n,i,a)=>a.indexOf(n)===i&&movement.safe(n,memory,username)&&!blocked(n));
    delete evacuation.fallback;
    for(const name of choices){
      const target=new RoomPosition(25,25,name),path=movement.path(creep.pos,target,20,memory,username);
      if(!path?.path.length)continue;
      evacuation.fallback=name;creep.memory.task='DEFENSE_EVACUATE';
      creep.memory.lastMove=movement.move(creep,target,20,memory);break;
    }
    if(!evacuation.fallback){creep.memory.task='DEFENSE_NO_SAFE_FALLBACK';flee(creep,memory);}
  }
  const s=states[incident||evacuation.incident];
  if(s&&evacuation.fallback&&!s.fallbacks.includes(evacuation.fallback))s.fallbacks.push(evacuation.fallback);
  return true;
}
/** No safe room is not permission to continue mining. Make a local escape from
 * immediate combat range, rejecting incomplete searches and forbidden rooms.
 * @param {Creep} creep @param {BotMemory} memory */
function flee(creep,memory){
  if(creep.fatigue||!require('territory.policy').contains(creep.room.name,memory.block))return;
  const hostiles=creep.room.find(FIND_HOSTILE_CREEPS);if(!hostiles.length)return;
  const result=PathFinder.search(creep.pos,hostiles.map(c=>({pos:c.pos,range:5})),{flee:true,maxRooms:1,maxOps:2000,
    roomCallback:name=>{
      if(name!==creep.room.name)return false;const matrix=new PathFinder.CostMatrix();
      for(const s of creep.room.find(FIND_STRUCTURES))if(s.structureType!==STRUCTURE_ROAD&&s.structureType!==STRUCTURE_CONTAINER&&!(s.structureType===STRUCTURE_RAMPART&&s.my))matrix.set(s.pos.x,s.pos.y,255);
      for(const s of [...creep.room.find(FIND_SOURCES),...creep.room.find(FIND_MINERALS),...(creep.room.controller?[creep.room.controller]:[])])matrix.set(s.pos.x,s.pos.y,255);
      for(let i=0;i<50;i++){matrix.set(0,i,255);matrix.set(49,i,255);matrix.set(i,0,255);matrix.set(i,49,255);}return matrix;
    }});
  if(!result.incomplete&&result.path.length)creep.memory.lastMove=creep.moveByPath(result.path);
}
module.exports={run,flee};

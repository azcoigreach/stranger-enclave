'use strict';
const territory=require('territory.policy');
const intel=require('territory.intel');

/** Never infer our identity from a home controller that may have been captured.
 * @param {Creep} creep @param {BotMemory} memory */
function username(creep,memory){
  const home=memory.intel[creep.memory.home||''];
  return creep.owner?.username||(home?.kind==='owned'?home.owner||'':'');
}

/** Defensive permits are narrow: a safe observed corridor plus the threatened
 * destination for combat, or a threatened origin for evacuation. No home bypass.
 * @param {string} name @param {BotMemory} memory @param {string} username */
function safe(name,memory,username){
  const info=memory.intel[name];
  return territory.contains(name,memory.block)&&Boolean(info&&Game.time-info.lastSeen<=25&&
    !info.hostiles?.length&&intel.safe(info,username)&&memory.defense?.rooms[name]?.mode!=='evacuate');
}
/** Complete two-room tile route. Current operations are adjacent; no speculative
 * route across unknown rooms or unobserved hostile structures is admitted.
 * @param {RoomPosition} origin @param {RoomPosition} target @param {number} range
 * @param {BotMemory} memory @param {string} username @param {boolean} combat */
function path(origin,target,range,memory,username,combat=false){
  if(!territory.contains(origin.roomName,memory.block)||!territory.contains(target.roomName,memory.block))return null;
  if(origin.roomName!==target.roomName && !Object.values(Game.map.describeExits(origin.roomName)||{}).includes(target.roomName))return null;
  if(!combat&&!safe(target.roomName,memory,username))return null;
  const info=memory.intel[target.roomName];
  if(combat&&(!info||info.npc||info.owner&&info.owner!==username||info.reservation&&info.reservation!==username&&(info.reservationUntil||0)>Game.time))return null;
  const allowed=new Set([origin.roomName,target.roomName]);
  const result=PathFinder.search(origin,{pos:target,range},{maxRooms:allowed.size,maxOps:10000,plainCost:2,swampCost:10,
    roomCallback:name=>{
      if(!allowed.has(name))return false;
      const matrix=new PathFinder.CostMatrix(),room=Game.rooms[name];
      if(room){
        for(const s of room.find(FIND_STRUCTURES)){
          if(s.structureType===STRUCTURE_ROAD)matrix.set(s.pos.x,s.pos.y,1);
          else if(s.structureType!==STRUCTURE_CONTAINER&&!(s.structureType===STRUCTURE_RAMPART&&s.my))matrix.set(s.pos.x,s.pos.y,255);
        }
        for(const s of [...room.find(FIND_SOURCES),...room.find(FIND_MINERALS),...(room.controller?[room.controller]:[])])matrix.set(s.pos.x,s.pos.y,255);
        for(const c of [...room.find(FIND_CREEPS),...room.find(FIND_POWER_CREEPS),...Object.values(Game.creeps).filter(c=>c.room.name===name)]){
          if(c.pos.roomName!==origin.roomName||c.pos.x!==origin.x||c.pos.y!==origin.y)matrix.set(c.pos.x,c.pos.y,255);
        }
        if(!combat)for(const hostile of room.find(FIND_HOSTILE_CREEPS)){
          const reach=hostile.getActiveBodyparts(RANGED_ATTACK)>0?4:2;
          for(let x=Math.max(0,hostile.pos.x-reach);x<=Math.min(49,hostile.pos.x+reach);x++)
            for(let y=Math.max(0,hostile.pos.y-reach);y<=Math.min(49,hostile.pos.y+reach);y++)matrix.set(x,y,255);
        }
      }
      return matrix;
    }});
  return result.incomplete?null:result;
}
/** @param {Creep} creep @param {RoomPosition} target @param {number} range @param {BotMemory} memory @param {boolean} combat */
function move(creep,target,range,memory,combat=false){
  if(creep.fatigue){creep.memory.moveReason='FATIGUE';return ERR_TIRED;}
  if(creep.pos.roomName===target.roomName&&creep.pos.inRangeTo(target,range))return OK;
  const result=path(creep.pos,target,range,memory,username(creep,memory),combat);
  creep.memory.moveGoal={x:target.x,y:target.y,roomName:target.roomName,range,tick:Game.time};
  if(!result||!result.path.length){creep.memory.moveReason='NO_COMPLETE_ROUTE';return ERR_NO_PATH;}
  creep.memory.moveReason='FOLLOW_ROUTE';return creep.moveByPath(result.path);
}
module.exports={safe,path,move,username};

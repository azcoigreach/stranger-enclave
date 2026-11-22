'use strict';

const territory = require('territory.policy');
const stations = require('economy.stations');
const snapshot = require('colony.snapshot');
const yielding = require('movement.yield');

/** Disposable short-lived route cache: only paths confirmed to reach work range.
 * @type {Map<string,{tick:number,goal:string,path:PathStep[]}>} */
const workPaths = new Map();
/** Engineers can cross the whole room for fortification. A partial search may end
 * in a cul-de-sac; never mistake that for a route to the requested work area.
 * @param {Creep} creep @param {RoomPosition} target @param {MoveToOpts} options @param {MoveToOpts} transitOptions @param {MoveToOpts} staticOptions */
function moveToWork(creep,target,options,transitOptions,staticOptions) {
  if(creep.fatigue){creep.memory.moveReason='FATIGUE';return ERR_TIRED;}
  const range=options.range || 0;
  if(creep.pos.inRangeTo(target,range)){creep.memory.moveReason='IN_RANGE';return OK;}
  const goal=`${target.roomName}:${target.x},${target.y}:${range}`;
  /** Follow a complete geometric route, reacting to occupancy at the next step.
   * A creep elsewhere in a corridor must not freeze travel across the whole room.
   * @param {PathStep[]} path */
  const follow=path=>{
    const index=path.findIndex(p=>p.x===creep.pos.x && p.y===creep.pos.y);
    const next=path[index+1];
    if(!next || creep.pos.getRangeTo(next.x,next.y)!==1)return ERR_NOT_FOUND;
    const occupants=[...creep.room.find(FIND_CREEPS),...creep.room.find(FIND_POWER_CREEPS),
      ...Object.values(Game.creeps).filter(c=>c.room.name===creep.room.name)];
    const blocker=occupants.find(c=>c!==creep && c.pos.x===next.x && c.pos.y===next.y);
    if(blocker){
      const step=creep.room.getPositionAt(next.x,next.y);
      if(step && yielding.access(creep,step,0,snapshot.create(creep.room))){creep.memory.moveReason='YIELD_TRAFFIC';return OK;}
      creep.memory.moveReason='WAIT_TRAFFIC';return ERR_BUSY;
    }
    creep.memory.moveReason='FOLLOW_ROUTE';return creep.moveByPath(path);
  };
  const saved=workPaths.get(creep.name);
  if(saved && saved.goal===goal && (options.reusePath || 0)>0 && Game.time-saved.tick<=(options.reusePath || 0)){
    const result=follow(saved.path);
    if(result!==ERR_NOT_FOUND)return result;
  }
  workPaths.delete(creep.name);
  const complete=(/** @type {PathStep[]} */ path)=>{
    const last=path[path.length-1];return Boolean(last && target.getRangeTo(last.x,last.y)<=range);
  };
  let path=creep.pos.findPathTo(target,options);
  if(!complete(path))path=creep.pos.findPathTo(target,{...options,maxOps:10000});
  // Vacant reservations must not combine with displaced workers into a false wall.
  // Keep real occupants blocked; relax only the empty reserved work positions.
  if(!complete(path))path=creep.pos.findPathTo(target,{...transitOptions,maxOps:10000});
  if(!complete(path))path=creep.pos.findPathTo(target,{...staticOptions,maxOps:10000,ignoreCreeps:true});
  if(!complete(path)){creep.memory.moveReason='NO_COMPLETE_ROUTE';return ERR_NO_PATH;}
  if(workPaths.size>=256)workPaths.clear();
  workPaths.set(creep.name,{tick:Game.time,goal,path});
  return follow(path);
}

/** Single movement owner for the bootstrap worker. Room-local paths only; edge tiles
 * are blocked, cached paths expire quickly, and stalled creeps retry with fresh paths.
 * @param {Creep} creep @param {RoomPosition} target @param {number} range @param {BlockBounds} block
 */
function move(creep, target, range, block) {
  if (!territory.contains(creep.room.name, block) || !territory.contains(target.roomName, block) ||
      target.roomName !== creep.room.name || creep.memory.home !== creep.room.name) {
    creep.memory.task = 'MOVEMENT_OUTSIDE_HOME_BLOCKED';
    return ERR_NO_PATH;
  }
  if(yielding.held(creep)) return OK;
  if(range<=1 && yielding.access(creep,target,range,snapshot.create(creep.room))) return OK;
  const last = creep.memory.motion;
  const stuck = last && last.tick === Game.time - 1 && last.x === creep.pos.x && last.y === creep.pos.y && !creep.fatigue
    ? last.stuck + 1 : 0;
  creep.memory.motion = { x: creep.pos.x, y: creep.pos.y, tick: Game.time, stuck };
  const controller = creep.room.controller;
  const carrier = (creep.memory.role === 'hauler' || creep.memory.role === 'distributor' || creep.memory.role === 'engineer' || creep.memory.role === 'remoteHauler') && controller && controller.my;
  const nearFormation = carrier && creep.pos.inRangeTo(controller, 4);
  /** @param {string} roomName @param {CostMatrix} matrix @param {boolean} [occupiedOnly] @param {boolean} [staticRoute] */
  const costs = (roomName,matrix,occupiedOnly=false,staticRoute=false) => {
      if (roomName !== creep.room.name || !territory.contains(roomName, block)) {
        for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) matrix.set(x, y, 255);
        return matrix;
      }
      for (let i = 0; i < 50; i++) {
        matrix.set(i, 0, 255); matrix.set(i, 49, 255);
        matrix.set(0, i, 255); matrix.set(49, i, 255);
      }
      if (carrier && !staticRoute) stations.blockStations(snapshot.create(creep.room), matrix, occupiedOnly);
      return matrix;
  };
  /** @type {MoveToOpts} */
  const options = {range,maxRooms:1,maxOps:1500,reusePath:stuck>=2 || nearFormation ? 0 : 5,
    ignoreCreeps:!carrier && stuck<2,costCallback:costs};
  const result=creep.memory.role==='engineer' ? moveToWork(creep,target,options,{...options,costCallback:(room,matrix)=>costs(room,matrix,true)},
    {...options,ignoreCreeps:true,costCallback:(room,matrix)=>costs(room,matrix,true,true)}) : creep.moveTo(target,options);
  creep.memory.lastMove=result;
  return result;
}

module.exports = { move };

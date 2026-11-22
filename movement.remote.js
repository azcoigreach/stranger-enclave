'use strict';
const territory = require('territory.policy');
const intel = require('territory.intel');
/** @type {Map<string,{tick:number,key:string,path:RoomPosition[]}>} */ const scoutPaths=new Map();

/** Route permits never extend the saved block. Unknown rooms are scout-only.
 * @param {string} from @param {string} to @param {BotMemory} memory @param {string} home @param {boolean} scout
 * @returns {Array<{room:string; exit:ExitConstant}> | null}
 */
function route(from, to, memory, home, scout) {
  if (!territory.contains(from,memory.block) || !territory.contains(to,memory.block)) return null;
  if (from === to) return [];
  const username = memory.intel[home] && memory.intel[home].owner || '';
  const allowed = (/** @type {string} */ name) => territory.contains(name,memory.block) &&
    (name === home || (scout ? !memory.intel[name] || intel.safe(memory.intel[name],username,false) :
      (name === to || name === from) && intel.safe(memory.intel[name],username)));
  const path = Game.map.findRoute(from,to,{routeCallback:name => allowed(name) ? 1 : Infinity});
  return Array.isArray(path) && path.every(step => allowed(step.room)) ? path : null;
}
/** Movement is restricted to the current room and the next authorized room. Targets two tiles inside
 * the next room to clear borders instead of trying to stand on its potentially walled center.
 * @param {Creep} creep @param {string} destination @param {BotMemory} memory @param {boolean} scout
 */
function travel(creep,destination,memory,scout = false) {
  const path = route(creep.room.name,destination,memory,creep.memory.home || '',scout);
  if (!path || !path.length) { creep.memory.task = path ? 'AT_DESTINATION' : 'NO_SAFE_ROUTE'; return ERR_NO_PATH; }
  const next = path[0].room;
  if(scout){
    if(creep.fatigue)return ERR_TIRED;
    const key=`${creep.room.name}:${next}`,saved=scoutPaths.get(creep.name);
    if(saved && saved.key===key && Game.time-saved.tick<=5){
      const result=creep.moveByPath(saved.path);if(result!==ERR_NOT_FOUND)return result;
    }
    scoutPaths.delete(creep.name);
    const result=search(creep.pos,new RoomPosition(25,25,next),23);
    if(result.incomplete || !result.path.length){creep.memory.lastMove=ERR_NO_PATH;return ERR_NO_PATH;}
    if(scoutPaths.size>=81)scoutPaths.clear();
    scoutPaths.set(creep.name,{tick:Game.time,key,path:result.path});
    creep.memory.lastMove=creep.moveByPath(result.path);return creep.memory.lastMove;
  }
  return creep.moveTo(new RoomPosition(25,25,next),{range:23,reusePath:5,maxRooms:2,maxOps:20000,
    costCallback:(name,matrix) => {
      if (name !== creep.room.name && name !== next) for (let x=0;x<50;x++) for (let y=0;y<50;y++) matrix.set(x,y,255);
      return matrix;
    }});
}
/** Local movement for explicitly permitted traveling roles. Never inherits another room via pathfinding.
 * @param {Creep} creep @param {RoomPosition} target @param {number} range @param {BotMemory} memory
 */
function approach(creep,target,range,memory) {
  if (target.roomName !== creep.room.name || !territory.contains(target.roomName,memory.block)) return ERR_NO_PATH;
  if(creep.room.name===creep.memory.home && creep.room.controller?.my) return require('movement.local').move(creep,target,range,memory.block);
  return creep.moveTo(target,{range,maxRooms:1,reusePath:3,ignoreCreeps:false});
}
/** Actual terrain route, used before committing a remote. Impassable structures affect the estimate.
 * @param {RoomPosition} origin @param {RoomPosition} target @param {number} range
 */
function search(origin,target,range) {
  const allowed = new Set([origin.roomName,target.roomName]);
  return PathFinder.search(origin,{pos:target,range},{maxRooms:2,maxOps:20000,plainCost:1,swampCost:5,
    roomCallback:name => {
      if (!allowed.has(name)) return false;
      const matrix = new PathFinder.CostMatrix(), room = Game.rooms[name];
      if (room) {
        for (const s of room.find(FIND_STRUCTURES)) {
          if (s.structureType === STRUCTURE_ROAD) matrix.set(s.pos.x,s.pos.y,1);
          else if (s.structureType !== STRUCTURE_CONTAINER && !(s.structureType === STRUCTURE_RAMPART && s.my)) matrix.set(s.pos.x,s.pos.y,255);
        }
        for (const s of [...room.find(FIND_SOURCES),...room.find(FIND_MINERALS)]) matrix.set(s.pos.x,s.pos.y,255);
        if (room.controller) matrix.set(room.controller.pos.x,room.controller.pos.y,255);
      }
      return matrix;
    }});
}
/** @param {RoomPosition} origin @param {RoomPosition} target @returns {number|null} */
function distance(origin,target){
  const result=search(origin,target,1);
  return result.incomplete || !result.path.length ? null : Math.max(result.cost,result.path.length);
}
module.exports = {route,travel,approach,distance};

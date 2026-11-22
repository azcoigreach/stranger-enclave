'use strict';
const territory = require('territory.policy');
const intel = require('territory.intel');
const yielding=require('movement.yield');
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
  if(yielding.held(creep))return OK;
  if(creep.fatigue){creep.memory.moveReason='FATIGUE';return ERR_TIRED;}
  const target=new RoomPosition(25,25,next);
  creep.memory.moveGoal={x:25,y:25,roomName:next,range:23,tick:Game.time};
  const key=`${creep.room.name}:${next}`,saved=scoutPaths.get(creep.name);
  /** @param {RoomPosition[]} steps */
  const follow=steps=>{
    const at=steps.findIndex(p=>p.roomName===creep.pos.roomName&&p.x===creep.pos.x&&p.y===creep.pos.y),step=steps[at+1];
    if(!step)return ERR_NOT_FOUND;
    if(step.roomName===creep.room.name){
      const occupants=[...creep.room.find(FIND_CREEPS),...creep.room.find(FIND_POWER_CREEPS),...Object.values(Game.creeps).filter(c=>c.room.name===creep.room.name)];
      if(occupants.some(c=>c!==creep&&c.pos.x===step.x&&c.pos.y===step.y)){
        if(creep.room.controller?.my && yielding.access(creep,step,0,require('colony.snapshot').create(creep.room)) || yielding.pass(creep,step)){
          creep.memory.moveReason='YIELD_TRAFFIC';return OK;
        }
        creep.memory.moveReason='WAIT_TRAFFIC';return ERR_BUSY;
      }
    }
    creep.memory.moveReason='FOLLOW_ROUTE';return creep.moveByPath(steps);
  };
  if(saved && saved.key===key && Game.time-saved.tick<=5){
    const result=follow(saved.path);if(result!==ERR_NOT_FOUND && result!==ERR_BUSY){creep.memory.lastMove=result;return result;}
  }
  scoutPaths.delete(creep.name);
  let result=search(creep.pos,target,23,true);
  if(result.incomplete)result=search(creep.pos,target,23);
  if(result.incomplete || !result.path.length){creep.memory.moveReason='NO_COMPLETE_ROUTE';creep.memory.lastMove=ERR_NO_PATH;return ERR_NO_PATH;}
  if(scoutPaths.size>=256)scoutPaths.clear();
  scoutPaths.set(creep.name,{tick:Game.time,key,path:result.path});
  creep.memory.lastMove=follow(result.path);return creep.memory.lastMove;
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
 * @param {RoomPosition} origin @param {RoomPosition} target @param {number} range @param {boolean} [occupied] @param {{x:number,y:number}[]} [slots]
 */
function search(origin,target,range,occupied=false,slots) {
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
        if(occupied)for(const c of [...room.find(FIND_CREEPS),...room.find(FIND_POWER_CREEPS),...Object.values(Game.creeps).filter(c=>c.room.name===name)]){
          if(c.pos.roomName!==origin.roomName||c.pos.x!==origin.x||c.pos.y!==origin.y)matrix.set(c.pos.x,c.pos.y,255);
        }
      }
      // A recently scouted but invisible room still has known mining obstacles.
      if (slots && name===target.roomName) {
        for(let x=Math.max(0,target.x-1);x<=Math.min(49,target.x+1);x++){
          for(let y=Math.max(0,target.y-1);y<=Math.min(49,target.y+1);y++){
            if(!slots.some(p=>p.x===x && p.y===y)) matrix.set(x,y,255);
          }
        }
      }
      return matrix;
    }});
}
/** @param {RoomPosition} origin @param {RoomPosition} target @param {{x:number,y:number}[]} [slots] @returns {number|null} */
function distance(origin,target,slots){
  const result=search(origin,target,1,false,slots);
  return result.incomplete || !result.path.length ? null : Math.max(result.cost,result.path.length);
}
/** Keep waiting crews off storage access and narrow work corridors. Parking is
 * disposable plain-coordinate memory; occupied or newly blocked tiles are replaced.
 * @param {Creep} creep @param {RoomPosition} anchor @param {BotMemory} memory */
function park(creep,anchor,memory){
  if(yielding.held(creep))return;
  const room=creep.room,terrain=room.getTerrain();
  const structures=[...room.find(FIND_STRUCTURES),...room.find(FIND_MY_CONSTRUCTION_SITES)];
  const blocked=new Set(structures.filter(s=>s.structureType!==STRUCTURE_ROAD&&s.structureType!==STRUCTURE_CONTAINER&&!(s.structureType===STRUCTURE_RAMPART&&'my' in s&&s.my)).map(s=>`${s.pos.x},${s.pos.y}`));
  const natural=[...room.find(FIND_SOURCES),...room.find(FIND_MINERALS),...(room.controller?[room.controller]:[])];
  for(const s of natural)blocked.add(`${s.pos.x},${s.pos.y}`);
  const peers=Object.values(Game.creeps).filter(c=>c!==creep&&c.room.name===room.name);
  const inside=memory.colonies[room.name]?.perimeter?.inside;
  const walk=(/** @type {number} */ x,/** @type {number} */ y)=>x>0&&x<49&&y>0&&y<49&&!(terrain.get(x,y)&TERRAIN_MASK_WALL)&&!blocked.has(`${x},${y}`);
  const valid=(/** @type {{x:number,y:number,roomName:string}} */ p)=>{
    if(p.roomName!==room.name||!walk(p.x,p.y)||anchor.getRangeTo(p.x,p.y)<3||anchor.getRangeTo(p.x,p.y)>7)return false;
    if(inside&&!inside.includes(p.y*50+p.x))return false;
    if(peers.some(c=>c.pos.x===p.x&&c.pos.y===p.y || c.memory.parkingSpot?.x===p.x&&c.memory.parkingSpot?.y===p.y&&c.memory.parkingSpot?.roomName===room.name))return false;
    if([...natural,...structures.filter(s=>(s.structureType===STRUCTURE_SPAWN||s.structureType===STRUCTURE_STORAGE||s.structureType===STRUCTURE_LINK||s.structureType===STRUCTURE_RAMPART))].some(s=>s.pos.getRangeTo(p.x,p.y)<=2))return false;
    let open=0;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if((dx||dy)&&walk(p.x+dx,p.y+dy))open++;
    return open>=5;
  };
  let spot=creep.memory.parkingSpot;
  if(!spot||!valid(spot)){
    const choices=[];
    for(let x=anchor.x-7;x<=anchor.x+7;x++)for(let y=anchor.y-7;y<=anchor.y+7;y++){
      const p={x,y,roomName:room.name};if(valid(p))choices.push(p);
    }
    choices.sort((a,b)=>creep.pos.getRangeTo(a.x,a.y)-creep.pos.getRangeTo(b.x,b.y)||a.x-b.x||a.y-b.y);
    spot=choices.find(p=>{if(creep.pos.getRangeTo(p.x,p.y)===0)return true;
      const path=creep.pos.findPathTo(p.x,p.y,{range:0,maxRooms:1,maxOps:10000,ignoreCreeps:true}),end=path[path.length-1];
      return end&&end.x===p.x&&end.y===p.y;});
    creep.memory.parkingSpot=spot;
  }
  if(spot)approach(creep,new RoomPosition(spot.x,spot.y,spot.roomName),0,memory);
}
module.exports = {route,travel,approach,distance,park};

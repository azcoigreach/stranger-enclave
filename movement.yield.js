'use strict';
/** Higher-priority adjacent access can displace owned ranged workers. Reservations are
 * tick-local; the displaced worker cannot overwrite its move later in role execution. */
let tick=-1;
/** @type {Set<string>} */ let heldNames=new Set();
/** @type {Set<string>} */ let reservedTiles=new Set();
function reset() {if(tick!==Game.time){tick=Game.time;heldNames=new Set();reservedTiles=new Set();}}
/** @param {Creep} creep */
function held(creep) {reset();return heldNames.has(creep.name);}
/** @param {RoomPosition} p */
const key=p=>`${p.roomName}:${p.x},${p.y}`;
/** @param {Creep} creep @param {RoomPosition} target @param {number} range @param {ColonySnapshot} colony */
function access(creep,target,range,colony) {
  reset();
  if(range>1 || creep.fatigue || !creep.getActiveBodyparts(MOVE) || held(creep) || creep.pos.inRangeTo(target,range))return false;
  const nearby=colony.workers.filter(c=>c!==creep && !c.spawning && !c.fatigue && c.getActiveBodyparts(MOVE)>0 &&
    (c.memory.role==='bootstrap' || c.memory.role==='engineer') && c.pos.inRangeTo(creep,1) && !held(c) &&
    !['EXIT_CONTROLLER','YIELD_CONTROLLER_EXIT'].includes(c.memory.task||''));
  if(!nearby.length)return false;
  const path=creep.pos.findPathTo(target,{range,maxRooms:1,maxOps:1500,ignoreCreeps:true});
  const first=path[0];if(!first)return false;
  const worker=nearby.find(c=>c.pos.x===first.x && c.pos.y===first.y);if(!worker)return false;
  // Only displace a worker doing ranged work, not one harvesting or collecting energy.
  const task=worker.memory.task||'';
  const upgrading=worker.memory.role==='bootstrap' && ['UPGRADE','WAIT_HAUL_DELIVERY','MOVE_UPGRADE_STATION','PREVENT_DOWNGRADE'].includes(task);
  const targetObject=worker.memory.workTarget && [...colony.structures,...colony.sites].find(s=>s.id===worker.memory.workTarget);
  const work=upgrading ? colony.controller : targetObject || (task==='BUILD' ? colony.sites.find(s=>worker.pos.inRangeTo(s,3)) : undefined);
  if(!work || !worker.pos.inRangeTo(work,3))return false;
  const blocked=new Set([...colony.structures,...colony.sites].filter(s=>s.structureType!==STRUCTURE_ROAD && s.structureType!==STRUCTURE_CONTAINER &&
    !(s.structureType===STRUCTURE_RAMPART && 'my' in s && s.my)).map(s=>key(s.pos)));
  for(const s of [...colony.sources,colony.controller,...colony.room.find(FIND_MINERALS)])blocked.add(key(s.pos));
  const occupants=colony.room.find(FIND_CREEPS), own=colony.workers;
  const terrain=colony.room.getTerrain(), candidates=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    const x=worker.pos.x+dx,y=worker.pos.y+dy;
    if((!dx&&!dy)||x<=0||y<=0||x>=49||y>=49||(terrain.get(x,y)&TERRAIN_MASK_WALL))continue;
    const p=colony.room.getPositionAt(x,y);if(!p||blocked.has(key(p))||reservedTiles.has(key(p))||!p.inRangeTo(work,3))continue;
    if([...occupants,...own].some(c=>c!==creep && c!==worker && c.pos.x===x && c.pos.y===y))continue;
    const swap=creep.pos.x===x && creep.pos.y===y;
    // Clear the access approach rather than move one square closer to the same destination.
    if(!swap && p.inRangeTo(target,1))continue;
    candidates.push({p,swap});
  }
  candidates.sort((a,b)=>Number(a.swap)-Number(b.swap)||b.p.getRangeTo(target)-a.p.getRangeTo(target)||a.p.x-b.p.x||a.p.y-b.p.y);
  const choice=candidates[0];if(!choice || reservedTiles.has(key(worker.pos)))return false;
  heldNames.add(creep.name);
  heldNames.add(worker.name);reservedTiles.add(key(choice.p));reservedTiles.add(key(worker.pos));
  worker.memory.yieldUntil=Game.time+5;worker.memory.task='YIELD_ADJACENT_ACCESS';
  worker.memory.lastMove=worker.move(worker.pos.getDirectionTo(choice.p));
  creep.memory.lastMove=creep.move(creep.pos.getDirectionTo(worker.pos));
  return true;
}
/** Reserve externally coordinated movement against later role intents.
 * @param {Creep} creep */
function hold(creep){reset();heldNames.add(creep.name);}
/** Let mobile travelers pass one another without displacing stationary miners,
 * reservers, fatigued creeps or ranged workers outside their work range.
 * @param {Creep} creep @param {RoomPosition} next */
function pass(creep,next){
  reset();
  if(held(creep)||creep.fatigue||!creep.getActiveBodyparts(MOVE)||reservedTiles.has(key(next))||!creep.pos.inRangeTo(next,1))return false;
  const own=Object.values(Game.creeps).filter(c=>c.room.name===creep.room.name);
  const other=own.find(c=>c!==creep && c.pos.x===next.x && c.pos.y===next.y);
  if(!other||other.spawning||other.fatigue||held(other)||!other.getActiveBodyparts(MOVE))return false;
  const goal=other.memory.moveGoal;
  if(!goal || Game.time-goal.tick>2 || ['miner','remoteMiner','reserver'].includes(other.memory.role||'') ||
    other.pos.inRangeTo(new RoomPosition(goal.x,goal.y,goal.roomName),goal.range))return false;
  const room=creep.room,terrain=room.getTerrain();
  const blocked=new Set([...room.find(FIND_STRUCTURES),...room.find(FIND_MY_CONSTRUCTION_SITES)].filter(s=>
    s.structureType!==STRUCTURE_ROAD&&s.structureType!==STRUCTURE_CONTAINER&&!(s.structureType===STRUCTURE_RAMPART&&'my' in s&&s.my)).map(s=>key(s.pos)));
  for(const s of [...room.find(FIND_SOURCES),...room.find(FIND_MINERALS),...(room.controller?[room.controller]:[])])blocked.add(key(s.pos));
  const occupants=[...own,...room.find(FIND_CREEPS),...room.find(FIND_POWER_CREEPS)],choices=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    const x=next.x+dx,y=next.y+dy;if((!dx&&!dy)||x<=0||y<=0||x>=49||y>=49||(terrain.get(x,y)&TERRAIN_MASK_WALL))continue;
    const p=room.getPositionAt(x,y);if(!p||blocked.has(key(p))||reservedTiles.has(key(p)))continue;
    if(occupants.some(c=>c!==other&&c!==creep&&c.pos.x===x&&c.pos.y===y))continue;
    choices.push(p);
  }
  choices.sort((a,b)=>Number(a.inRangeTo(creep,0))-Number(b.inRangeTo(creep,0))||a.getRangeTo(goal.x,goal.y)-b.getRangeTo(goal.x,goal.y)||a.x-b.x||a.y-b.y);
  const p=choices[0];if(!p)return false;
  hold(creep);hold(other);reservedTiles.add(key(p));reservedTiles.add(key(next));
  other.memory.lastMove=other.move(other.pos.getDirectionTo(p));other.memory.moveReason='YIELD_TRANSIT';
  creep.memory.lastMove=creep.move(creep.pos.getDirectionTo(next));return true;
}
module.exports={held,hold,access,pass};

'use strict';
const grid=require('planning.grid');
const config=require('core.config');
function policyKey(){return `wall:${config.buildingWallClearance}|edge:${config.buildingExitClearance}`;}
/** Mandatory setbacks for NEW ordinary buildings; barriers themselves are exempt.
 * @param {{x:number,y:number}} p @param {PerimeterPlan} [perimeter] */
function safePosition(p,perimeter){
  const edge=config.buildingExitClearance;
  return p.x>=edge && p.y>=edge && p.x<=49-edge && p.y<=49-edge && (!perimeter ||
    perimeter.inside.includes(p.y*50+p.x) && perimeter.tiles.every(b=>Math.max(Math.abs(b.x-p.x),Math.abs(b.y-p.y))>=config.buildingWallClearance));
}
/** @param {{x:number,y:number}} p */ const cell=p=>p.y*50+p.x;
/** @param {ColonySnapshot} colony @param {BuildingPosition[]} buildings */
function access(colony,buildings) {
  const terrain=colony.room.getTerrain(),walk=Array.from({length:2500},(_,i)=>!(terrain.get(i%50,Math.floor(i/50))&TERRAIN_MASK_WALL));
  const natural=[...colony.sources,colony.controller,...colony.room.find(FIND_MINERALS)];
  for(const p of [...natural.map(s=>s.pos),...buildings])walk[cell(p)]=false;
  const start=grid.neighbors(cell(colony.spawns[0].pos)).find(i=>walk[i]);if(start===undefined)return false;
  const reachable=grid.flood(walk,[start]);
  for(const p of [...natural.map(s=>s.pos),...buildings])if(!grid.neighbors(cell(p)).some(i=>reachable.has(i)))return false;
  return colony.room.find(FIND_EXIT).every(p=>reachable.has(cell(p)));
}
/** Reserve a complete legal RCL8 footprint before approving an enclosure. Small lab
 * constraint groups are translated over terrain; the rest remains distributed and connected.
 * Drafts are plain coordinates and can resume across serialization/global resets.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record @param {PerimeterPlan} perimeter @param {()=>boolean} allowed */
function run(colony,record,perimeter,allowed) {
  const types=[STRUCTURE_SPAWN,STRUCTURE_STORAGE,STRUCTURE_TOWER,STRUCTURE_TERMINAL,STRUCTURE_LAB,STRUCTURE_LINK,
    STRUCTURE_OBSERVER,STRUCTURE_POWER_SPAWN,STRUCTURE_NUKER,STRUCTURE_FACTORY,STRUCTURE_EXTENSION,...(colony.room.find(FIND_MINERALS).length ? [STRUCTURE_EXTRACTOR] : [])];
  const actual=[...colony.structures,...colony.sites].filter(s=>types.some(t=>t===s.structureType))
    .map(s=>({type:/** @type {BuildableStructureConstant} */(s.structureType),x:s.pos.x,y:s.pos.y}));
  if(record.links)actual.push({...record.links.hub,type:STRUCTURE_LINK},{...record.links.controller,type:STRUCTURE_LINK});
  const unique=[...new Map(actual.map(b=>[`${b.type}:${b.x},${b.y}`,b])).values()].sort((a,b)=>a.type.localeCompare(b.type)||a.x-b.x||a.y-b.y);
  const footprint=unique.map(b=>`${b.type}:${b.x},${b.y}`).sort().join('|');
  let plan=record.mature;
  if(!plan || plan.version!==2 || plan.policyKey!==policyKey() || plan.footprint!==footprint)plan=record.mature={version:2,policyKey:policyKey(),status:'RESERVING',buildings:unique,cursor:0,labCursor:0,footprint,insideTiles:perimeter.inside.length,
    buildingArea:perimeter.inside.filter(i=>safePosition({x:i%50,y:Math.floor(i/50)},perimeter))};
  if(plan.status==='RESERVED' || !allowed())return;
  const inside=new Set(perimeter.inside),lanes=new Set((perimeter.routes||[]).map(cell)),terrain=colony.room.getTerrain();
  const anchor=colony.room.storage?.pos || colony.spawns[0].pos;
  const blocked=new Set(plan.buildings.map(cell));
  const candidates=[];
  for(const i of plan.buildingArea || []){const x=i%50,y=Math.floor(i/50);if(!(terrain.get(x,y)&TERRAIN_MASK_WALL))candidates.push({x,y});}
  candidates.sort((a,b)=>anchor.getRangeTo(a.x,a.y)-anchor.getRangeTo(b.x,b.y)||a.x-b.x||a.y-b.y);
  const available=(/** @type {{x:number,y:number}} */ p)=>safePosition(p,perimeter) && !blocked.has(cell(p)) && !lanes.has(cell(p)) &&
    !(terrain.get(p.x,p.y)&TERRAIN_MASK_WALL) && ![...colony.sources,...colony.room.find(FIND_MINERALS)].some(s=>s.pos.getRangeTo(p.x,p.y)<=2) && colony.controller.pos.getRangeTo(p.x,p.y)>3;
  const labCount=plan.buildings.filter(b=>b.type===STRUCTURE_LAB).length,labLimit=CONTROLLER_STRUCTURES[STRUCTURE_LAB][8]||0;
  if(labCount<labLimit){
    if(labCount){plan.status='EXISTING_LABS_NEED_LAYOUT_REVIEW';return;}
    const offsets=[[1,1],[2,2],[0,0],[2,0],[0,2],[3,1],[1,3],[3,3],[0,1],[3,2]];
    for(let tries=0;tries<64 && plan.labCursor<candidates.length && allowed();tries++){
      const origin=candidates[plan.labCursor++],group=offsets.map(([dx,dy])=>({type:STRUCTURE_LAB,x:origin.x+dx,y:origin.y+dy}));
      if(!group.every(available) || !access(colony,[...plan.buildings,...group]))continue;
      plan.buildings.push(...group);plan.labInputs=group.slice(0,2).map(p=>({x:p.x,y:p.y}));plan.cursor=0;return;
    }
    plan.status=plan.labCursor>=candidates.length?'NO_ROOM_FOR_TEN_LABS':'RESERVING_LABS';return;
  }
  const type=types.find(t=>plan.buildings.filter(b=>b.type===t).length<(CONTROLLER_STRUCTURES[t][8]||0));
  if(!type){plan.status=access(colony,plan.buildings)?'RESERVED':'FINAL_ACCESS_FAILED';return;}
  if(type===STRUCTURE_EXTRACTOR){
    const mineral=colony.room.find(FIND_MINERALS)[0],p={type,x:mineral.pos.x,y:mineral.pos.y};
    if(!safePosition(p,perimeter)){plan.status='FIXED_MINERAL_CLEARANCE_REQUIRED';return;}
    plan.buildings.push(p);plan.cursor=0;return;
  }
  // Checkerboard spacing is only a candidate preference; connectivity is the acceptance condition.
  candidates.sort((a,b)=>Number((a.x+a.y)%2!==(anchor.x+anchor.y)%2)-Number((b.x+b.y)%2!==(anchor.x+anchor.y)%2)||anchor.getRangeTo(a.x,a.y)-anchor.getRangeTo(b.x,b.y)||a.x-b.x||a.y-b.y);
  for(let tries=0;tries<24 && plan.cursor<candidates.length && allowed();tries++){
    const p=candidates[plan.cursor++];if(!available(p))continue;
    const building={...p,type};if(!access(colony,[...plan.buildings,building]))continue;
    plan.buildings.push(building);plan.cursor=0;plan.status='RESERVING';return;
  }
  plan.status=plan.cursor>=candidates.length?`NO_SPACE_${type}`:'RESERVING';
}
module.exports={run,access,safePosition,policyKey};

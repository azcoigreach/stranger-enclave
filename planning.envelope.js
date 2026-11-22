'use strict';
const grid=require('planning.grid');
const cut=require('planning.cut');
const geometry=require('planning.perimeter');
const mature=require('planning.mature');
/** @type {Map<string,ReturnType<typeof cut.create>>} */ const pending=new Map();
/** @param {{x:number,y:number}} p */ const cell=p=>p.y*50+p.x;
/** Protect the viable room interior, rather than only the current buildings. The exit
 * buffer remains outside the protected set; min-cut exploits natural choke points there.
 * @param {ColonySnapshot} colony */
function facts(colony) {
  const base=geometry.geometry(colony);
  const protectedCells=base.walk.map((open,i)=>open && (base.protectedCells[i] ||
    i%50>=3 && i%50<=46 && i>=150 && i<2350));
  return {...base,protectedCells};
}
/** Shortest-path access from storage/spawn to every exit and current work site defines
 * rampart crossings. Walls never force local mining or building traffic onto long detours.
 * Legacy inner barriers are excluded from this replacement design, not destroyed here.
 * @param {ColonySnapshot} colony @param {number[]} cells @returns {PerimeterPlan|null} */
function finish(colony,cells) {
  const {walk,protectedCells,exits}=facts(colony),barriers=new Set(cells);
  const outside=grid.flood(walk,exits,barriers);
  if([...outside].some(i=>protectedCells[i]))return null;
  const friendly=walk.slice();
  for(const s of [...colony.structures,...colony.sites])if(![STRUCTURE_WALL,STRUCTURE_RAMPART,STRUCTURE_ROAD,STRUCTURE_CONTAINER].some(t=>t===s.structureType))friendly[cell(s.pos)]=false;
  const anchor=colony.room.storage?.pos || colony.spawns[0]?.pos;if(!anchor)return null;
  const start=grid.neighbors(cell(anchor)).find(i=>friendly[i]);if(start===undefined)return null;
  const tree=(/** @type {Set<number>} */ blocked)=>{
    const parent=new Int32Array(2500).fill(-1),distance=new Int32Array(2500).fill(-1),queue=[start];distance[start]=0;
    for(let i=0;i<queue.length;i++)for(const n of grid.neighbors(queue[i]))if(friendly[n] && !blocked.has(n) && distance[n]<0){parent[n]=queue[i];distance[n]=distance[queue[i]]+1;queue.push(n);}
    return {parent,distance};
  };
  const baseline=tree(new Set()),goals=[];
  for(const s of [...colony.sources,colony.controller,...colony.room.find(FIND_MINERALS),...colony.structures,...colony.sites]){
    if('structureType' in s && (s.structureType===STRUCTURE_WALL || s.structureType===STRUCTURE_RAMPART))continue;
    const goal=grid.neighbors(cell(s.pos)).filter(i=>baseline.distance[i]>=0).sort((a,b)=>baseline.distance[a]-baseline.distance[b]||a-b)[0];
    if(goal!==undefined)goals.push(goal);
  }
  const gates=new Set();
  const crossing=(/** @type {number} */ goal)=>{for(let i=goal;i>=0;i=baseline.parent[i])if(barriers.has(i))gates.add(i);};
  for(const goal of goals)crossing(goal);
  for(const s of [...colony.structures,...colony.sites])if(barriers.has(cell(s.pos)) && [STRUCTURE_ROAD,STRUCTURE_CONTAINER,STRUCTURE_RAMPART].some(t=>t===s.structureType))gates.add(cell(s.pos));
  const exitGoals=exits.filter(i=>baseline.distance[i]>=0).sort((a,b)=>baseline.distance[a]-baseline.distance[b]||a-b);
  let permitted=tree(new Set(cells.filter(i=>!gates.has(i))));
  // Add passages wherever existing gates would impose more than four extra steps.
  // This bounds exit detours without turning every border-facing tile into a rampart.
  for(const goal of exitGoals){
    if(permitted.distance[goal]>=0 && permitted.distance[goal]<=baseline.distance[goal]+4)continue;
    crossing(goal);permitted=tree(new Set(cells.filter(i=>!gates.has(i))));
  }
  if([...goals,...exitGoals].some(i=>permitted.distance[i]<0))return null;
  const routes=new Set();
  for(const goal of [...goals,...exitGoals])for(let i=goal;i>=0;i=permitted.parent[i])routes.add(i);
  const inside=walk.map((open,i)=>open&&!outside.has(i)&&!barriers.has(i)?i:-1).filter(i=>i>=0);
  for(const object of [...colony.sources,colony.controller,...colony.room.find(FIND_MINERALS)]) {
    const adjacent=grid.neighbors(cell(object.pos)).filter(i=>walk[i]);
    if(adjacent.length && adjacent.every(i=>!outside.has(i)&&!barriers.has(i)))inside.push(cell(object.pos));
  }
  return {version:2,status:'CAPACITY_VALIDATION',plannedAt:Game.time,cutSize:cells.length,gates:gates.size,inside:inside.sort((a,b)=>a-b),
    tiles:cells.map(i=>({x:i%50,y:Math.floor(i/50),type:gates.has(i)?STRUCTURE_RAMPART:STRUCTURE_WALL})),
    routes:[...routes].sort((a,b)=>a-b).filter(i=>!outside.has(i)).map(i=>({x:i%50,y:Math.floor(i/50)})),
    legacyWalls:colony.structures.filter(s=>s.structureType===STRUCTURE_WALL && !barriers.has(cell(s.pos))).map(s=>({x:s.pos.x,y:s.pos.y})).sort((a,b)=>cell(a)-cell(b))};
}
/** An existing perimeter requires a reviewable migration proposal. Fresh rooms can adopt
 * the validated design automatically. No structures are destroyed by this planner.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record @param {()=>boolean} allowed */
function run(colony,record,allowed) {
  if(record.perimeterProposal?.status==='MIGRATION_REVIEW' && record.mature?.policyKey===mature.policyKey())return;
  if(record.perimeterProposal && record.mature?.policyKey!==mature.policyKey()){delete record.mature;record.perimeterProposal.status='CAPACITY_VALIDATION';}
  if(record.perimeter?.version===2 && (record.mature?.policyKey!==mature.policyKey() || record.mature?.status!=='RESERVED')){mature.run(colony,record,record.perimeter,allowed);return;}
  if(colony.controller.level<4 || !colony.room.storage || !colony.spawns.length || !allowed() || record.perimeter?.version===2)return;
  if(!record.perimeterProposal){
    let search=pending.get(colony.room.name);
    if(!search){if(pending.size>=4)return;const map=facts(colony);search=cut.create(map.walk,map.protectedCells);pending.set(colony.room.name,search);}
    const result=cut.advance(search,allowed);
    if(search.failed){record.planning='ROOM_ENVELOPE_IMPOSSIBLE';pending.delete(colony.room.name);return;}
    if(!result){record.planning='ROOM_ENVELOPE_SEARCH';return;}
    const proposal=finish(colony,result);pending.delete(colony.room.name);
    if(!proposal){record.planning='ROOM_ENVELOPE_ACCESS_INVALID';return;}
    record.perimeterProposal=proposal;
  }
  if(!record.links)require('planning.links').run(colony,record,(c,x,y)=>mature.access(c,[
    ...[...c.structures,...c.sites].filter(s=>![STRUCTURE_WALL,STRUCTURE_RAMPART,STRUCTURE_ROAD,STRUCTURE_CONTAINER].some(t=>t===s.structureType))
      .map(s=>({type:/** @type {BuildableStructureConstant} */(s.structureType),x:s.pos.x,y:s.pos.y})),{type:STRUCTURE_LINK,x,y}]),allowed,true);
  for(let i=0;i<4 && allowed() && record.mature?.status!=='RESERVED';i++) mature.run(colony,record,record.perimeterProposal,allowed);
  if(record.mature?.status!=='RESERVED'){record.perimeterProposal.status=record.mature?.status || 'CAPACITY_VALIDATION';return;}
  if(record.perimeter){record.perimeterProposal.status='MIGRATION_REVIEW';return;}
  record.perimeter=record.perimeterProposal;record.perimeter.status='PLANNED';delete record.perimeterProposal;
}
module.exports={run,facts,finish};

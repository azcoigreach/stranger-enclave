'use strict';
const grid=require('planning.grid');
const links=require('economy.links');
/** Validate worker stations against short transit to existing buildings, sources and exits.
 * A candidate may add at most four steps to any previously reachable interaction. This
 * preserves narrow supply corridors without permanently reserving every shortest-path tile.
 * Geometry and baseline distances exist only for this disposable station-layout rebuild.
 * @param {ColonySnapshot} colony */
function guard(colony) {
  const origin=colony.spawns[0]?.pos,terrain=colony.room.getTerrain(),receiver=links.network(colony).controller;
  const structures=[...colony.structures,...colony.sites];
  const natural=[...colony.sources,colony.controller,...colony.room.find(FIND_MINERALS)];
  const walk=Array.from({length:2500},(_,i)=>!(terrain.get(i%50,Math.floor(i/50))&TERRAIN_MASK_WALL));
  for(const s of [...structures,...natural]) {
    if('structureType' in s && (s.structureType===STRUCTURE_ROAD || s.structureType===STRUCTURE_CONTAINER || s.structureType===STRUCTURE_RAMPART && 'my' in s && s.my))continue;
    walk[s.pos.y*50+s.pos.x]=false;
  }
  const starts=origin ? grid.neighbors(origin.y*50+origin.x).filter(i=>walk[i]) : [];
  const adjacency=walk.map((open,i)=>open ? grid.neighbors(i).filter(n=>walk[n]) : []);
  const distances=(/** @type {Array<{x:number,y:number}>} */ spots)=>{
    const blocked=new Set(spots.map(p=>p.y*50+p.x)),distance=new Int32Array(2500).fill(-1);
    const start=starts.find(i=>!blocked.has(i));if(start===undefined)return distance;
    const queue=[start];distance[start]=0;
    for(let i=0;i<queue.length;i++)for(const n of adjacency[queue[i]])if(distance[n]<0&&!blocked.has(n)){
      distance[n]=distance[queue[i]]+1;queue.push(n);
    }
    return distance;
  };
  const baseline=distances([]),goals=[];
  for(const object of [...structures,...natural]) {
    if(object===colony.controller || object===receiver)continue;
    if('structureType' in object && (object.structureType===STRUCTURE_WALL || object.structureType===STRUCTURE_ROAD))continue;
    goals.push(grid.neighbors(object.pos.y*50+object.pos.x).filter(i=>baseline[i]>=0));
  }
  for(const p of colony.room.find(FIND_EXIT))if(baseline[p.y*50+p.x]>=0)goals.push([p.y*50+p.x]);
  const checks=goals.filter(g=>g.length).map(g=>({tiles:g,limit:Math.min(...g.map(i=>baseline[i]))+4}));
  return (/** @type {Array<{x:number,y:number}>} */ spots)=>{
    const current=distances(spots);
    return checks.every(g=>g.tiles.some(i=>current[i]>=0 && current[i]<=g.limit));
  };
}
module.exports={guard};

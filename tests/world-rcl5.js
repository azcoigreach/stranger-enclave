'use strict';
const {harness,position,store}=require('./harness');
const terrain=require('./fixtures/controller-corridor.json'),footprint=require('./fixtures/rcl5-layout.json');
function world() {
 const h=harness(),home=h.addRoom(terrain.room,{level:5}),at=(x,y)=>position(x,y,home.room.name);
 home.room.getTerrain=()=>({get:(x,y)=>Number(terrain.terrain[y]?.[x]||1)});
 home.spawn.pos=at(...terrain.spawn);home.controller.pos=at(...terrain.controller);
 home.objects[h.constants.FIND_SOURCES]=footprint.sources.map(([x,y],i)=>({id:`source${i}`,pos:at(x,y),energyCapacity:3000}));
 home.objects[h.constants.FIND_STRUCTURES]=footprint.buildings.map((b,i)=>b.type==='spawn'?home.spawn:{id:`structure${i}`,my:true,structureType:b.type,pos:at(b.x,b.y),store:store(b.type==='storage'?220000:1000,b.type==='storage'?1000000:1000)});
 home.objects[h.constants.FIND_MINERALS]=[{id:'mineral',pos:at(...footprint.mineral)}];
 home.room.storage=home.objects[h.constants.FIND_STRUCTURES].find(s=>s.structureType==='storage');
 const exits=[];for(let i=0;i<2500;i++)if(!(Number(terrain.terrain[Math.floor(i/50)][i%50])&1)&&(i%50===0||i%50===49||i<50||i>=2450))exits.push(at(i%50,Math.floor(i/50)));
 home.objects[h.constants.FIND_EXIT]=exits;
 const memory=h.load('core.memory').initialize();memory.colonies[home.room.name]={level:5,reason:'TEST'};
 return {h,...home,memory,record:memory.colonies[home.room.name],colony:()=>h.load('colony.snapshot').create(home.room)};
}
module.exports={world};

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position}=require('./harness');
const terrain=require('./fixtures/controller-corridor.json').terrain,fixture=require('./fixtures/oxygen-detour.json');
// Independent unweighted oracle checks connectivity and the direction out of the
// captured cul-de-sac. Search-budget exhaustion is supplied as an API outcome.
function route(start,goal,range,extra=[]){
 const blocked=new Set([...fixture.obstacles,...extra].map(p=>p.join(','))),seen=new Map([[start.join(','),null]]),queue=[start];
 for(let i=0;i<queue.length;i++){
  const p=queue[i];
  if(Math.max(Math.abs(p[0]-goal[0]),Math.abs(p[1]-goal[1]))<=range){
   const result=[];let cursor=p;
   while(seen.get(cursor.join(','))!==null){result.unshift({x:cursor[0],y:cursor[1]});cursor=seen.get(cursor.join(','));}return result;
  }
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const x=p[0]+dx,y=p[1]+dy,key=`${x},${y}`;
   if(x<=0||y<=0||x>=49||y>=49||Number(terrain[y][x])&1||blocked.has(key)||seen.has(key))continue;
   seen.set(key,p);queue.push([x,y]);
  }
 }
 return [];
}
function world(){
 const h=harness(),home=h.addRoom('E21S31',{level:5}),c=h.addWorker(home.room,'engineer',50);c.memory.role='engineer';
 c.pos=position(...fixture.origin,home.room.name);home.room.getTerrain=()=>({get:(x,y)=>Number(terrain[y][x])});
 const goal=position(...fixture.target,home.room.name),full=route(fixture.origin,fixture.target,fixture.range),searches=[];
 c.pos.findPathTo=(target,opts)=>{searches.push(opts.maxOps);return searches.length===1?[{x:5,y:19}]:full;};
 c.moveByPath=path=>{c.calls.push({action:'path',path:JSON.parse(JSON.stringify(path))});return 0;};
 h.load('economy.stations').blockStations=()=>{};
 const run=()=>h.load('movement.local').move(c,goal,fixture.range,h.load('territory.policy').blockFor(home.room.name));
 return{h,...home,c,goal,full,searches,run};
}
test('engineer retries an incomplete oxygen-side route and leaves the dead end on a complete path',()=>{
 const w=world();assert.ok(w.full.length>80);assert.ok(w.full[0].y<fixture.origin[1]);w.run();
 const move=w.c.calls.find(c=>c.action==='path');assert.ok(move,'must issue a checked complete route, not an unchecked moveTo');
 assert.deepEqual(move.path,w.full);assert.equal(w.searches.length,2);assert.ok(w.searches[1]>w.searches[0]);
});
test('an incomplete retry never becomes a movement command and an in-range engineer needs no search',()=>{
 const w=world();w.c.pos.findPathTo=()=>[{x:5,y:19}];assert.equal(w.run(),-2);assert.equal(w.c.calls.length,0);
 w.c.pos=position(5,35,w.room.name);assert.equal(w.run(),0);assert.equal(w.c.calls.length,0);
});
test('complete routes are reused briefly and rebuilt after global reset without changing the chosen route',()=>{
 const w=world();w.run();w.h.Game.time++;w.c.calls=[];w.run();assert.equal(w.searches.length,2);assert.deepEqual(w.c.calls[0].path,w.full);
 w.h.reset();w.h.load('economy.stations').blockStations=()=>{};w.c.calls=[];w.run();assert.deepEqual(w.c.calls[0].path,w.full);assert.equal(w.searches.length,3);
});
test('fatigue does not spend search CPU and an expired or invalid cached route is recalculated',()=>{
 const w=world();w.c.fatigue=1;assert.equal(w.run(),-11);assert.equal(w.searches.length,0);
 w.c.fatigue=0;w.run();w.h.Game.time+=6;w.run();assert.equal(w.searches.length,3);
 w.c.moveByPath=path=>{w.c.calls.push({action:'path'});return w.c.calls.length===1?-5:0;};w.c.calls=[];w.h.Game.time++;assert.equal(w.run(),0);assert.equal(w.searches.length,4);
});
test('complete-route movement keeps the room boundary and station restrictions in both searches',()=>{
 const w=world();let callbacks=0;
 w.h.load('economy.stations').blockStations=(colony,m)=>m.set(40,24,255);
 w.c.pos.findPathTo=(target,opts)=>{const costs=new Map();opts.costCallback(w.room.name,{set:(x,y,v)=>costs.set(`${x},${y}`,v)});callbacks++;
  assert.equal(opts.maxRooms,1);assert.equal(costs.get('0,18'),255);assert.equal(costs.get('40,24'),255);return callbacks===1?[{x:5,y:19}]:w.full;};
 w.run();assert.equal(callbacks,2);
});

test('engineers can cross vacant station reservations when the combined reservation and worker mask seals the route',()=>{
 const w=world(),physical=fixture.workers.map(p=>[p.x,p.y]),reserved=fixture.stations.map(p=>[p.x,p.y]);
 assert.equal(route(fixture.origin,fixture.target,fixture.range,[...physical,...reserved]).length,0);
 assert.ok(route(fixture.origin,fixture.target,fixture.range,physical).length>80);
 w.h.load('economy.stations').blockStations=(colony,matrix,occupiedOnly)=>{
  for(const p of physical)matrix.set(...p,255);
  if(!occupiedOnly)for(const p of reserved)matrix.set(...p,255);
 };
 w.c.pos.findPathTo=(target,opts)=>{const blocks=[];opts.costCallback(w.room.name,{set:(x,y,cost)=>{if(cost===255)blocks.push([x,y]);}});return route(fixture.origin,fixture.target,fixture.range,blocks);};
 assert.equal(w.run(),0);const issued=w.c.calls.find(c=>c.action==='path');assert.ok(issued);
 assert.ok(issued.path.every(p=>!physical.some(b=>b[0]===p.x&&b[1]===p.y)));
});
test('occupied-only station costs protect actual workers while leaving vacant reservations traversable',()=>{
 const {world}=require('./world-rcl5'),w=world();
 for(let i=0;i<4;i++)w.h.addWorker(w.room,`worker${i}`);
 const stations=w.h.load('economy.stations'),colony=w.colony(),spots=stations.layout(colony).positions;
 assert.ok(spots.length);const vacant=spots.find(p=>!colony.workers.some(c=>c.pos.x===p.x&&c.pos.y===p.y));assert.ok(vacant);
 const worker=colony.workers[0];worker.pos=position(w.controller.pos.x+1,w.controller.pos.y,w.room.name);
 const costs=new Map();stations.blockStations(colony,{set:(x,y,v)=>costs.set(`${x},${y}`,v)},true);
 assert.equal(costs.get(`${worker.pos.x},${worker.pos.y}`),255);
 if(worker.pos.x!==vacant.x||worker.pos.y!==vacant.y)assert.notEqual(costs.get(`${vacant.x},${vacant.y}`),255);
});

test('a temporary creep farther down the route does not stop an engineer before the blockage',()=>{
 const w=world(),blocker=w.h.addWorker(w.room,'passing',0),p=w.full[20];blocker.memory.role='hauler';blocker.pos=position(p.x,p.y,w.room.name);
 w.objects[w.h.constants.FIND_CREEPS]=[w.c,blocker];
 w.c.pos.findPathTo=(target,opts)=>opts.ignoreCreeps?w.full:[{x:5,y:19}];
 assert.equal(w.run(),0);assert.deepEqual(w.c.calls.find(c=>c.action==='path')?.path,w.full);
});
test('a physically occupied next step waits locally and resumes when that tile clears',()=>{
 const w=world(),blocker=w.h.addWorker(w.room,'passing',0),p=w.full[0];blocker.memory.role='hauler';blocker.pos=position(p.x,p.y,w.room.name);
 w.objects[w.h.constants.FIND_CREEPS]=[w.c,blocker];w.c.pos.findPathTo=(target,opts)=>opts.ignoreCreeps?w.full:[];
 assert.equal(w.run(),-4);assert.equal(w.c.calls.length,0);assert.equal(w.c.memory.moveReason,'WAIT_TRAFFIC');
 blocker.pos=position(24,25,w.room.name);w.h.Game.time++;assert.equal(w.run(),0);assert.ok(w.c.calls.some(c=>c.action==='path'));
});
test('an engineer following a static route can ask a ranged worker on its next tile to yield',()=>{
 const w=world(),worker=w.h.addWorker(w.room,'consumer',50),p=w.full[0];worker.pos=position(p.x,p.y,w.room.name);worker.memory.task='UPGRADE';
 w.controller.pos=position(7,17,w.room.name);w.objects[w.h.constants.FIND_CREEPS]=[w.c,worker];
 w.c.pos.findPathTo=(target,opts)=>target.x===p.x&&target.y===p.y?[p]:opts.ignoreCreeps?w.full:[];
 assert.equal(w.run(),0);assert.equal(w.c.calls.at(-1).action,'step');assert.equal(worker.calls.at(-1).action,'step');assert.equal(w.c.memory.moveReason,'YIELD_TRAFFIC');
 const count=worker.calls.length;w.h.load('economy.worker').run(worker,w.h.load('colony.snapshot').create(w.room),w.h.load('territory.policy').blockFor(w.room.name),new Map());assert.equal(worker.calls.length,count);
});
test('static fallback retains borders and terrain/structure costs while removing only creep reservations',()=>{
 const w=world();let found=false;
 w.c.pos.findPathTo=(target,opts)=>{
  if(!opts.ignoreCreeps)return [];
  found=true;const costs=new Map([['10,10',255]]);opts.costCallback(w.room.name,{set:(x,y,v)=>costs.set(`${x},${y}`,v)});
  assert.equal(opts.maxRooms,1);assert.equal(costs.get('0,17'),255);assert.equal(costs.get('10,10'),255);return w.full;
 };
 assert.equal(w.run(),0);assert.ok(found);
});

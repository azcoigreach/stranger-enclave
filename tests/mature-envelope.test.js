'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {world}=require('./world-rcl5');
const plain=x=>JSON.parse(JSON.stringify(x));
function finish(w,reset=false){
 for(let i=0;i<600 && !w.h.Memory.enclave.colonies[w.room.name].perimeter?.version;i++){
  if(reset && (i===1 || i>100 && i%7===6))w.h.reset();
  w.h.load('planning.envelope').run(w.colony(),w.h.Memory.enclave.colonies[w.room.name],()=>true);
 }
 return w.h.Memory.enclave.colonies[w.room.name];
}
test('room-wide enclosure reserves the full RCL8 footprint and a valid ten-lab reaction group',()=>{
 const w=world(),record=finish(w),plan=record.perimeter,mature=record.mature;
 assert.equal(mature?.status,'RESERVED',JSON.stringify({mature,proposal:record.perimeterProposal?.status}));
 assert.equal(plan.version,2);assert.ok(plan.inside.length>600,`expected broad usable interior, got ${plan.inside.length}`);
 const counts=Object.fromEntries([...new Set(mature.buildings.map(b=>b.type))].map(t=>[t,mature.buildings.filter(b=>b.type===t).length]));
 assert.equal(counts.extension,60);assert.equal(counts.lab,10);assert.equal(counts.spawn,3);assert.equal(counts.tower,6);assert.equal(counts.link,6);
 for(const type of ['storage','terminal','observer','powerSpawn','nuker','factory'])assert.equal(counts[type],1);
 for(const b of mature.buildings)assert.ok(plan.inside.includes(b.y*50+b.x));
 const inputs=mature.labInputs;assert.equal(inputs.length,2);
 for(const lab of mature.buildings.filter(b=>b.type==='lab'))for(const input of inputs)assert.ok(Math.max(Math.abs(lab.x-input.x),Math.abs(lab.y-input.y))<=2);
 assert.ok(w.h.load('planning.mature').access(w.colony(),mature.buildings));
 assert.equal(counts.extractor,1);
 assert.ok(plan.gates>3 && plan.gates<plan.cutSize/2);
});
test('existing inner walls produce a migration proposal without automatic demolition or outside construction',()=>{
 const w=world();w.record.perimeter={version:1,tiles:[],inside:[],status:'ENCLOSED'};
 for(let i=0;i<600 && w.record.perimeterProposal?.status!=='MIGRATION_REVIEW';i++)w.h.load('planning.envelope').run(w.colony(),w.record,()=>true);
 assert.equal(w.record.perimeter.version,1);assert.equal(w.record.perimeterProposal.status,'MIGRATION_REVIEW');
 assert.equal(w.room.siteCalls.length,0);
});
test('mature layout drafts resume after serialization and interrupted searches without changing reservations',()=>{
 const a=world(),b=world(),first=finish(a),second=finish(b,true);
 assert.equal(first.mature.status,'RESERVED');assert.deepEqual(plain(first.mature),plain(second.mature));assert.deepEqual(plain(first.perimeter),plain(second.perimeter));
});

test('mature reservations are independent of room-object insertion order',()=>{
 const a=world(),b=world();
 b.objects[b.h.constants.FIND_STRUCTURES].reverse();b.objects[b.h.constants.FIND_SOURCES].reverse();
 const x=finish(a),y=finish(b);assert.deepEqual(plain(x.mature),plain(y.mature));assert.deepEqual(plain(x.perimeter),plain(y.perimeter));
});
test('new extensions use reserved interior positions and reject a position outside the protected boundary',()=>{
 for(const unsafe of [false,true]){
  const w=world(),record=finish(w);w.controller.level=6;
  w.h.constants.CONTROLLER_STRUCTURES.extension[6]=40;w.h.constants.CONTROLLER_STRUCTURES.tower[6]=2;w.h.constants.CONTROLLER_STRUCTURES.storage[6]=1;
  const existing=w.colony().structures,first=record.mature.buildings.find(b=>b.type==='extension'&&!existing.some(s=>s.structureType===b.type&&s.pos.x===b.x&&s.pos.y===b.y));
  if(unsafe)record.perimeter.inside=record.perimeter.inside.filter(i=>i!==first.y*50+first.x);
  w.h.load('planning.bootstrap').run(w.colony(),record,()=>true);
  if(unsafe){assert.equal(w.room.siteCalls.length,0);assert.equal(record.planning,'NO_SAFE_RESERVED_POSITION');}
  else {assert.deepEqual(w.room.siteCalls[0],plain(first));assert.ok(record.perimeter.inside.includes(first.y*50+first.x));}
 }
});

test('the mature footprint keeps every new building inside the defensive setback and away from exits',()=>{
 const w=world(),record=finish(w),perimeter=record.perimeter;
 for(const building of record.mature.buildings){
  assert.ok(building.x>=5 && building.y>=5 && building.x<=44 && building.y<=44,`exit clearance for ${building.type} at ${building.x},${building.y}`);
  const clearance=Math.min(...perimeter.tiles.map(p=>Math.max(Math.abs(p.x-building.x),Math.abs(p.y-building.y))));
  assert.ok(clearance>=3,`wall clearance ${clearance} for ${building.type} at ${building.x},${building.y}`);
 }
});

test('an adopted enclosure finishes a renewed clearance plan across subsequent ticks',()=>{
 const w=world(),record=finish(w);record.mature.policyKey='obsolete';
 for(let i=0;i<400 && (record.mature.policyKey==='obsolete'||record.mature.status!=='RESERVED');i++)w.h.load('planning.envelope').run(w.colony(),record,()=>true);
 assert.equal(record.mature.status,'RESERVED');assert.equal(record.mature.policyKey,'wall:3|edge:5');
 assert.equal(record.mature.buildings.length,92);
});

test('construction rechecks wall and exit setbacks even when a saved position is inside the enclosure',()=>{
 for(const mode of ['wall','edge']){
  const w=world(),record=finish(w);w.controller.level=6;
  w.h.constants.CONTROLLER_STRUCTURES.extension[6]=40;w.h.constants.CONTROLLER_STRUCTURES.tower[6]=2;w.h.constants.CONTROLLER_STRUCTURES.storage[6]=1;
  const existing=w.colony().structures,first=record.mature.buildings.find(b=>b.type==='extension'&&!existing.some(s=>s.structureType===b.type&&s.pos.x===b.x&&s.pos.y===b.y));
  if(mode==='wall')record.perimeter.tiles.push({type:'constructedWall',x:first.x+1,y:first.y});
  else {first.x=4;first.y=30;record.perimeter.inside.push(first.y*50+first.x);}
  assert.ok(record.perimeter.inside.includes(first.y*50+first.x));
  w.h.load('planning.bootstrap').run(w.colony(),record,()=>true);
  assert.equal(w.room.siteCalls.length,0,mode);assert.equal(record.planning,'NO_SAFE_RESERVED_POSITION',mode);
 }
});

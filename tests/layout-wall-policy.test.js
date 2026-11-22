'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position}=require('./harness');
function world(type='constructedWall'){
 const h=harness(),home=h.addRoom('E21S31',{level:5}),record=h.load('core.memory').initialize().colonies[home.room.name]={};
 const inner={id:'inner',my:true,structureType:type,pos:position(20,20,home.room.name),hits:5000,hitsMax:300000000};
 const outer={id:'outer',my:true,structureType:type,pos:position(30,20,home.room.name),hits:5000,hitsMax:300000000};
 home.objects[h.constants.FIND_STRUCTURES].push(inner,outer);
 const colony=()=>h.load('colony.snapshot').create(home.room),getRecord=()=>h.Memory.enclave.colonies[home.room.name];
 h.load('planning.layout').observe(colony(),record);
 const proposal={version:2,status:'MIGRATION_REVIEW',plannedAt:50,tiles:[{type,x:30,y:20},{type:'rampart',x:31,y:20}],inside:[],gates:1,cutSize:2};
 const approve=()=>{record.perimeterProposal=proposal;record.perimeterMigration={plannedAt:50,approvedAt:1,phase:'BUILD_OUTER',legacyWalls:[{x:20,y:20}],conversions:[]};};
 const remove=s=>{home.objects[h.constants.FIND_STRUCTURES]=home.objects[h.constants.FIND_STRUCTURES].filter(o=>o!==s);};
 const rebuild=()=>h.load('planning.layout').rebuild(colony(),getRecord(),()=>true);
 return{h,...home,record,proposal,inner,outer,colony,getRecord,approve,remove,rebuild};
}
test('manually removed old walls stay removed under the approved perimeter across resets',()=>{
 const w=world();w.approve();w.remove(w.inner);w.h.reset();
 w.h.load('planning.layout').observe(w.colony(),w.getRecord());w.rebuild();
 assert.equal(w.room.siteCalls.length,0,'the previous wall must not be rebuilt');
});
test('newly observed off-plan walls are not enrolled for reconstruction after approval',()=>{
 const w=world();w.approve();const extra={id:'extra',structureType:'constructedWall',pos:position(22,22,w.room.name)};
 w.objects[w.h.constants.FIND_STRUCTURES].push(extra);w.h.load('planning.layout').observe(w.colony(),w.getRecord());w.remove(extra);w.rebuild();
 assert.equal(w.room.siteCalls.length,0);assert.ok(!w.getRecord().layout.buildings.some(b=>b.type==='constructedWall'&&b.x===22));
});
test('the new perimeter still reconstructs its walls and other buildings on their original tiles',()=>{
 for(const kind of ['wall','spawn']){
  const w=world();w.approve();w.remove(w.inner);const target=kind==='wall'?w.outer:w.spawn;w.remove(target);w.rebuild();
  assert.deepEqual(w.room.siteCalls,[{type:target.structureType,x:target.pos.x,y:target.pos.y}]);
 }
});
test('a proposal without matching approval does not disable existing wall reconstruction',()=>{
 for(const stale of [false,true]){
  const w=world();w.record.perimeterProposal=w.proposal;
  if(stale)w.record.perimeterMigration={plannedAt:49,phase:'BUILD_OUTER'};
  w.remove(w.inner);w.rebuild();assert.deepEqual(w.room.siteCalls,[{type:'constructedWall',x:20,y:20}]);
 }
});
test('the adopted perimeter keeps obsolete walls excluded after migration finishes',()=>{
 const w=world();w.record.perimeter=w.proposal;w.record.perimeter.status='ENCLOSED';w.remove(w.inner);w.h.reset();w.rebuild();assert.equal(w.room.siteCalls.length,0);
});
test('a wall at a planned rampart passage is not reconstructed as a wall',()=>{
 const w=world();w.approve();w.record.layout.buildings.push({type:'constructedWall',x:31,y:20});w.rebuild();assert.equal(w.room.siteCalls.length,0);
});

test('manually removed off-plan ramparts stay removed across resets during and after migration',()=>{
 for(const adopted of [false,true]){
  const w=world('rampart');
  if(adopted)w.record.perimeter=w.proposal;else w.approve();
  w.remove(w.inner);w.h.reset();w.h.load('planning.layout').observe(w.colony(),w.getRecord());w.rebuild();
  assert.equal(w.room.siteCalls.length,0);
 }
});
test('newly observed off-plan ramparts are not enrolled for reconstruction',()=>{
 const w=world('rampart');w.approve();const extra={id:'extra',my:true,structureType:'rampart',pos:position(22,22,w.room.name)};
 w.objects[w.h.constants.FIND_STRUCTURES].push(extra);w.h.load('planning.layout').observe(w.colony(),w.getRecord());w.remove(extra);w.rebuild();
 assert.equal(w.room.siteCalls.length,0);assert.ok(!w.getRecord().layout.buildings.some(b=>b.type==='rampart'&&b.x===22));
});
test('planned ramparts and ramparts without a matching approved replacement retain reconstruction',()=>{
 for(const approved of [false,true]){
  const w=world('rampart');w.record.perimeterProposal=w.proposal;if(approved)w.approve();
  const target=approved?w.outer:w.inner;w.remove(target);w.h.reset();w.rebuild();
  assert.deepEqual(w.room.siteCalls,[{type:'rampart',x:target.pos.x,y:target.pos.y}]);
 }
});
test('obsolete ramparts cannot override a planned wall at the same position',()=>{
 const w=world();w.approve();w.record.layout.buildings.push({type:'rampart',x:30,y:20});w.rebuild();assert.equal(w.room.siteCalls.length,0);
});

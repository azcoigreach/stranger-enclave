'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');
const plain=x=>JSON.parse(JSON.stringify(x));
function world(){
 const h=harness(),home=h.addRoom('W3N3',{level:5}),c=h.constants,actions=[];
 const record=h.load('core.memory').initialize().colonies[home.room.name]={level:5,reason:'TEST'};
 home.room.storage={id:'bank',my:true,structureType:'storage',pos:position(25,26,home.room.name),store:store(200000,1000000)};
 home.objects[c.FIND_STRUCTURES].push(home.room.storage);
 const wall=(x,y,hits=5000,type='constructedWall')=>{const s={id:`${type}:${x},${y}`,my:true,structureType:type,pos:position(x,y,home.room.name),hits,hitsMax:300000000,result:0,destroy(){actions.push([this.id,this.result]);return this.result;}};home.objects[c.FIND_STRUCTURES].push(s);return s;};
 const inner=wall(20,20),gate=wall(10,10);
 record.perimeter={version:1,status:'ENCLOSED',tiles:[{x:20,y:20,type:'constructedWall'},{x:10,y:10,type:'constructedWall'}],inside:[],plannedAt:1,cutSize:2,gates:0};
 record.perimeterProposal={version:2,status:'MIGRATION_REVIEW',plannedAt:50,tiles:[{x:10,y:10,type:'rampart'},{x:11,y:10,type:'constructedWall'}],inside:[],legacyWalls:[{x:20,y:20},{x:30,y:30}],gates:1,cutSize:2};
 record.mature={status:'RESERVED',policyKey:'wall:3|edge:5'};
 h.load('planning.layout').observe(h.load('colony.snapshot').create(home.room),record);
 const getRecord=()=>h.Memory.enclave.colonies[home.room.name];
 const run=(allowed=true)=>{h.Game.time++;h.load('planning.migration').run(h.load('colony.snapshot').create(home.room),getRecord(),()=>allowed);};
 const approve=()=>h.load('planning.migration').approve(home.room.name,50);
 const remove=s=>{home.objects[c.FIND_STRUCTURES]=home.objects[c.FIND_STRUCTURES].filter(o=>o!==s);};
 const engineer=()=>{const e=h.addWorker(home.room,'engineer',50);e.memory.role='engineer';e.pos=position(12,12,home.room.name);return e;};
 return {h,...home,c,actions,wall,inner,gate,getRecord,run,approve,remove,engineer};
}
test('migration requires explicit matching approval and a current clearance policy',()=>{
 const w=world();w.run();assert.equal(w.actions.length,0);assert.equal(w.room.siteCalls.length,0);
 assert.throws(()=>w.h.load('planning.migration').approve(w.room.name,49),/matching/);
 w.getRecord().mature.policyKey='old';assert.throws(w.approve,/matching/);
 w.getRecord().mature.policyKey='wall:3|edge:5';w.approve();
 assert.deepEqual(plain(w.getRecord().perimeterMigration.legacyWalls),[{x:20,y:20}]);
 w.getRecord().perimeterProposal.plannedAt=51;w.run();assert.equal(w.getRecord().perimeterMigration.reason,'APPROVAL_PLAN_MISMATCH');assert.equal(w.actions.length,0);
});
test('outer barriers are built and strengthened before any demolition',()=>{
 const w=world();w.approve();w.run();assert.deepEqual(w.room.siteCalls,[{x:11,y:10,type:'constructedWall'}]);assert.equal(w.actions.length,0);
 const outer=w.wall(11,10,4999);w.run();assert.equal(w.getRecord().perimeterMigration.reason,'FORTIFY_OUTER_MINIMUM');assert.equal(w.actions.length,0);
 outer.hits=5000;w.run();assert.equal(w.getRecord().perimeterMigration.reason,'WAIT_GATE_ENGINEER');assert.equal(w.actions.length,0);
});
test('conversion needs a nearby funded engineer and retries failures without losing the old layout',()=>{
 const w=world();w.wall(11,10);w.approve();const e=w.engineer();e.pos=position(25,25,w.room.name);w.run();assert.equal(w.actions.length,0);
 e.pos=position(12,12,w.room.name);e.store.energy=0;w.run();assert.equal(w.actions.length,0);
 e.store.energy=50;w.room.storage.store.energy=0;w.run();assert.equal(w.actions.length,0);
 w.room.storage.store.energy=200000;w.gate.result=-7;w.run();assert.equal(w.getRecord().perimeterMigration.reason,'GATE_CONVERSION_FAILED_-7');
 assert.ok(w.getRecord().layout.buildings.some(b=>b.type==='constructedWall'&&b.x===10));
 w.gate.result=0;w.run();assert.equal(w.actions.at(-1)[0],w.gate.id);assert.equal(w.getRecord().perimeterMigration.phase,'CONVERT_GATES');
 assert.ok(!w.getRecord().layout.buildings.some(b=>b.type==='constructedWall'&&b.x===10));
});
function trace(reset){
 const w=world();w.wall(11,10);const unrelated=w.wall(30,30);w.engineer();w.approve();w.run();
 w.remove(w.gate);if(reset)w.h.reset();w.run();assert.deepEqual(w.room.siteCalls.at(-1),{x:10,y:10,type:'rampart'});
 const gate=w.wall(10,10,4999,'rampart');w.run();assert.equal(w.actions.length,1);
 gate.hits=5000;w.run();assert.equal(w.actions.length,2);assert.equal(w.getRecord().perimeterMigration.phase,'RETIRE_INNER');
 assert.equal(w.getRecord().perimeter.version,1,'accepted destroy intent is not completion');
 w.remove(w.inner);if(reset)w.h.reset();w.run();assert.equal(w.getRecord().perimeterMigration.phase,'COMPLETE');assert.equal(w.getRecord().perimeter.version,2);
 assert.ok(w.objects[w.c.FIND_STRUCTURES].includes(unrelated));assert.equal(w.actions.length,2);assert.equal(w.getRecord().perimeterProposal,undefined);
 return plain({record:w.getRecord(),actions:w.actions,sites:w.room.siteCalls});
}
test('converted gate must be strong before inner retirement; observed completion survives resets',()=>assert.deepEqual(trace(false),trace(true)));
test('hostiles, ownership loss, CPU limits, reserves and site backlog pause replacement',()=>{
 for(const reason of ['hostile','ownership','cpu','reserve','sites']){
  const w=world();w.approve();
  if(reason==='hostile')w.objects[w.c.FIND_HOSTILE_CREEPS]=[{body:[]}];
  const snapshot=w.h.load('colony.snapshot').create(w.room);
  if(reason==='ownership')w.controller.my=false;
  if(reason==='reserve')w.room.storage.store.energy=0;
  if(reason==='sites')w.objects[w.c.FIND_MY_CONSTRUCTION_SITES]=Array.from({length:3},(_,i)=>({structureType:'road',pos:position(i,1,w.room.name)}));
  if(reason==='ownership')w.h.load('planning.migration').run(snapshot,w.getRecord(),()=>true);else w.run(reason!=='cpu');assert.equal(w.actions.length,0,reason);assert.equal(w.room.siteCalls.length,0,reason);
 }
});
test('weak outer barriers stop retirement and failed demolition preserves reconstruction coordinates',()=>{
 const w=world(),outer=w.wall(11,10);w.remove(w.gate);w.wall(10,10,5000,'rampart');
 w.getRecord().layout.buildings=w.getRecord().layout.buildings.filter(b=>b.x!==10);w.approve();
 outer.hits=4999;w.run();assert.equal(w.actions.length,0);
 outer.hits=5000;w.inner.result=-7;w.run();assert.equal(w.getRecord().perimeterMigration.reason,'RETIRE_FAILED_-7');assert.ok(w.getRecord().layout.buildings.some(b=>b.x===20));
 outer.hits=4999;w.run();assert.equal(w.actions.length,1);assert.equal(w.getRecord().perimeterMigration.reason,'REPAIR_OUTER_BEFORE_RETIREMENT');
});

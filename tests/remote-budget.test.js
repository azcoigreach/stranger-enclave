'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');
function world(twoSources=false) {
 const h=harness(),home=h.addRoom('E23S47',{level:5}),a=h.addRoom('E24S47'),b=h.addRoom('E22S47');
 for(const away of [a,b]){if(!twoSources)away.objects[h.constants.FIND_SOURCES].splice(1);delete h.Game.spawns[away.spawn.name];away.controller.my=false;delete away.controller.owner;away.objects[h.constants.FIND_STRUCTURES]=[];}
 home.room.energyAvailable=home.room.energyCapacityAvailable=1800;
 home.room.storage={id:'bank',my:true,structureType:'storage',pos:position(24,24,home.room.name),store:store(220000,1000000)};
 home.objects[h.constants.FIND_STRUCTURES].push(home.room.storage);
 h.Game.map.describeExits=name=>name===home.room.name?{3:a.room.name,7:b.room.name}:{3:home.room.name};
 h.context.PathFinder.search=()=>({incomplete:false,cost:25,path:[{}]});
 const mem=h.load('core.memory').initialize();for(const x of [home,a,b])h.load('territory.intel').observe(x.room,mem);
 const record=mem.colonies[home.room.name]={level:5,reason:'TEST',budget:{remoteTarget:2,reserveFloor:18000}};
 const colony=()=>h.load('colony.snapshot').create(home.room);
 const role=(name,type,op,room=home.room)=>{const c=h.addWorker(room,name);c.memory.role=type;c.memory.home=home.room.name;c.memory.targetRoom=op.room;c.memory.sourceId=op.sourceId;return c;};
 const update=t=>{h.context.PathFinder.search=()=>({incomplete:false,cost:25,path:[{}]});h.Game.time=t;for(const x of [home,a,b])h.load('territory.intel').observe(x.room,h.Memory.enclave);h.load('operations.remote').update(colony(),h.Memory.enclave,h.Memory.enclave.colonies[home.room.name]);};
 return {h,home,a,b,mem,record,colony,role,update};
}
test('remote fleet grows one room at a time, obeys reserve gates and survives legacy migration',()=>{
 const {h,home,record,update}=world();update(19);assert.equal(record.expansion.remotes.length,1);
 const first=record.expansion.remote;update(44);assert.equal(record.expansion.remotes.length,1);
 // A legacy singleton must migrate without losing delivered energy or duplicating its source.
 first.delivered=12345;delete record.expansion.remotes;h.reset();
 home.room.storage.store.energy=19999;update(1019);let state=h.Memory.enclave.colonies[home.room.name].expansion;
 assert.equal(state.remotes.length,1);assert.equal(state.remote.delivered,12345);
 home.room.storage.store.energy=220000;update(1044);assert.equal(state.remotes.length,2);
 assert.notEqual(state.remotes[0].room,state.remotes[1].room);assert.equal(state.remote,state.remotes[0]);
});
test('multiple operations attribute deliveries exactly once and route roles by their assigned source',()=>{
 const {h,home,record,colony,role,update}=world();update(19);update(1019);
 const [one,two]=record.expansion.remotes,ha=role('ha','remoteHauler',one),hb=role('hb','remoteHauler',two);
 update(1020);home.room.getEventLog=()=>[{event:12,objectId:ha.id,data:{targetId:'bank',resourceType:'energy',amount:50}},
 {event:12,objectId:hb.id,data:{targetId:'bank',resourceType:'energy',amount:75}}];
 update(1021);update(1021);assert.equal(one.delivered,50);assert.equal(two.delivered,75);
 const remoteRoom=h.Game.rooms[two.room],miner=role('miner','remoteMiner',two,remoteRoom);miner.pos=position(21,20,two.room);
 h.reset();h.load('operations.roles').run(miner,h.Memory.enclave,new Map());assert.equal(miner.calls[0].action,'harvest');assert.equal(miner.calls[0].target.id,two.sourceId);
});
test('established remote replacements continue through barrier and link construction',()=>{
 const {h,home,mem,record,colony,role,update}=world();update(19);const op=record.expansion.remote;
 const scout=h.addWorker(home.room,'scout');scout.memory.role='scout';
 op.delivered=1000;record.layout={version:1,buildings:[{type:'constructedWall',x:10,y:10},{type:'link',x:20,y:20}]};
 const req=h.load('operations.remote').request(colony(),mem,record);assert.equal(req.role,'remoteHauler');assert.equal(req.targetRoom,op.room);
 record.layout.buildings.push({type:'tower',x:21,y:21});assert.equal(h.load('operations.remote').request(colony(),mem,record),null);
});
test('surplus operations retire after hysteresis, bring cargo home and receive no replacement',()=>{
 const {h,home,record,colony,role,update}=world();update(19);update(1019);
 const [one,two]=record.expansion.remotes;one.netIncome=6;two.netIncome=2;
 const c=role('returner','remoteHauler',two,h.Game.rooms[two.room]);c.store.energy=25;
 record.budget.remoteTarget=1;update(1044);assert.equal(two.retiring,undefined);update(2019);assert.equal(two.retiring,true);
 // At home a retiring collector deposits its cargo and stays retired after reset.
 c.room=home.room;c.pos=position(25,24,home.room.name);h.reset();h.load('operations.roles').run(c,h.Memory.enclave,new Map());
 assert.equal(c.calls[0].action,'transfer');assert.equal(c.calls[0].target.id,'bank');assert.equal(c.memory.task,'REMOTE_RETREAT');
});
test('remote budget uses delivered rates and includes replacement and reservation costs',()=>{
 const h=harness(),net=h.load('economy.budget').remoteNet,op={travel:25,carry:12};
 const estimate=net(op);assert.ok(estimate>5&&estimate<10);
 op.deliverySample={rate:7};assert.ok(net(op)<estimate);assert.ok(net(op)<7);
 op.deliverySample.rate=0;assert.ok(net(op)<0);
});

test('remote capacity failures remain visible between survey ticks',()=>{
 const {h,record,update}=world();update(19);h.Game.map.describeExits=()=>({3:record.expansion.remote.room});
 update(1019);const reason=record.expansion.capacityReason;assert.equal(reason,'WAIT_SAFE_ADJACENT_INTEL');
 update(1020);assert.equal(record.expansion.capacityReason,reason);
});
test('an unmet remote budget prioritizes an old adjacent survey over the wider block',()=>{
 const {h,home,mem,record,update}=world();update(19);const active=record.expansion.remote.room;
 const next=Object.values(h.Game.map.describeExits(home.room.name)).find(n=>n!==active);
 h.Game.time=1000;mem.intel[next].lastSeen=1;
 // Make all block routes available so the general survey has many older unknown choices.
 h.Game.map.findRoute=(from,to)=>[{room:to,exit:3}];
 const scout=h.addWorker(home.room,'scout');scout.memory.role='scout';
 h.load('operations.scout').run(scout,mem);assert.equal(scout.memory.targetRoom,next);
});

test('profitable longer adjacent routes can fund defenses without bypassing safety or spawn capacity',()=>{
 const w=world();w.h.load('movement.remote').distance=()=>120;w.update(19);
 assert.equal(w.record.expansion.remotes.length,1);assert.equal(w.record.expansion.remote.travel,120);
 assert.ok(w.record.expansion.remote.netIncome>=2);
});
test('remote expansion rejects an uneconomic route with an explicit income estimate',()=>{
 const w=world();w.h.load('movement.remote').distance=()=>190;w.update(19);
 assert.equal(w.record.expansion.remotes.length,0);assert.equal(w.record.expansion.capacityReason,'UNPROFITABLE_REMOTE');assert.ok(w.record.expansion.candidate.netIncome<2);
});
test('remote admission preserves spawn headroom for the home colony',()=>{
 const w=world();w.h.load('movement.remote').distance=()=>120;
 for(let i=0;i<12;i++){const c=w.h.addWorker(w.home.room,`home${i}`);c.body=Array.from({length:25},()=>({type:'move',hits:100}));}
 w.update(19);assert.equal(w.record.expansion.remotes.length,0);assert.equal(w.record.expansion.capacityReason,'SPAWN_CAPACITY');
});

test('an established remote pauses when a longer replacement route becomes uneconomic',()=>{
 const w=world();w.update(19);const op=w.record.expansion.remote;
 w.h.load('movement.remote').distance=()=>190;w.update(119);
 assert.equal(op.routeValid,false);assert.equal(op.reason,'NO_ECONOMIC_ROUTE');
});

function reservationWorld(){
 const w=world();w.update(19);w.update(1019);
 const scout=w.h.addWorker(w.home.room,'scout');scout.memory.role='scout';
 for(const [i,op] of w.record.expansion.remotes.entries()){
  op.reserve=true;op.carry=52;op.delivered=100;
  w.role(`miner${i}`,'remoteMiner',op);const haul=w.role(`hauler${i}`,'remoteHauler',op);
  haul.body=Array.from({length:12},()=>({type:'carry',hits:100}));
 }
 const request=()=>w.h.load('operations.remote').request(w.colony(),w.h.Memory.enclave,w.h.Memory.enclave.colonies[w.home.room.name]);
 return {...w,request};
}
test('an unreserved established remote gets its reserver before filling the reserved-output hauling fleet',()=>{
 const w=reservationWorld(),[first,second]=w.record.expansion.remotes;
 w.mem.intel[first.room].reservation='test';w.mem.intel[first.room].reservationUntil=w.h.Game.time+3000;
 assert.equal(w.request().role,'reserver');assert.equal(w.request().targetRoom,second.room);
 w.h.reset();assert.equal(w.request().targetRoom,second.room);
});
test('reservation surplus defers replacement while an expiring buffer requests one without duplicating pending crews',()=>{
 const w=reservationWorld(),op=w.record.expansion.remotes[0];w.record.expansion.remotes=[op];
 const info=w.mem.intel[op.room];info.reservation='test';info.reservationUntil=w.h.Game.time+3000;
 assert.equal(w.request().role,'remoteHauler');
 op.carry=12;assert.equal(w.request(),null);
 info.reservationUntil=w.h.Game.time+100;assert.equal(w.request().role,'reserver');
 const c=w.role('pending','reserver',op);c.spawning=true;assert.equal(w.request(),null);
});
test('missing remote transport or miner recovery precedes optional reservation elsewhere',()=>{
 const w=reservationWorld(),[one,two]=w.record.expansion.remotes;
 delete w.h.Game.creeps.hauler1;assert.equal(w.request().role,'remoteHauler');assert.equal(w.request().targetRoom,two.room);
 const c=w.role('newHauler','remoteHauler',two);c.body=[{type:'carry',hits:100}];delete w.h.Game.creeps.miner1;
 assert.equal(w.request().role,'remoteMiner');assert.equal(w.request().targetRoom,two.room);
});

test('rank all eligible sources before admitting the most profitable route',()=>{
 const w=world(true);
 w.h.load('movement.remote').distance=(_,p)=>p.roomName===w.b.room.name ? 90 : p.x===35 ? null : 20;
 w.update(19);
 const state=w.record.expansion;
 assert.equal(state.remote.room,w.a.room.name);
 assert.equal(state.ranking.length,4);
 assert.equal(state.ranking[0].sourceId,state.remote.sourceId);
 assert.ok(state.ranking[0].netIncome>state.ranking[1].netIncome);
 assert.ok(state.ranking.some(c=>c.travel===null && c.reason==='NO_ECONOMIC_ROUTE'));
});
test('a shared reservation makes the second source preferable and both crews stay independent',()=>{
 const w=world(true);w.update(19);w.update(1019);
 const [one,two]=w.record.expansion.remotes;
 assert.equal(one.room,two.room);assert.notEqual(one.sourceId,two.sourceId);
 assert.equal(w.record.expansion.candidate.costs.reservation,0);
 const haul=w.role('haul','remoteHauler',one);w.role('miner','remoteMiner',one);
 w.role('reserve','reserver',one);w.h.addWorker(w.home.room,'scout').memory.role='scout';
 const request=w.h.load('operations.remote').request(w.colony(),w.mem,w.record);
 assert.equal(request.sourceId,two.sourceId);assert.equal(request.role,'remoteHauler');
 w.update(1020);w.home.room.getEventLog=()=>[{event:12,objectId:haul.id,data:{targetId:'bank',resourceType:'energy',amount:75}}];
 w.update(1021);assert.equal(one.delivered,75);assert.equal(two.delivered,0);
});
test('equal scores sort stably across reset and a foreign sponsor owns its remote room',()=>{
 const run=reset=>{
  const w=world(true);
  w.h.addRoom('E23S46');
  w.mem.colonies.E23S46={expansion:{remote:{room:w.b.room.name,sourceId:'existing'}}};
  if(reset) {w.a.objects[w.h.constants.FIND_SOURCES].reverse();w.h.reset();}
  w.update(19);
  const state=w.h.Memory.enclave.colonies[w.home.room.name].expansion;
  assert.equal(state.remote.room,w.a.room.name);
  return state.remote.sourceId;
 };
 assert.equal(run(true),run(false));
});
test('an incomplete CPU-limited survey resumes without admitting a partial winner',()=>{
 const w=world(true);
 const runtime=w.h.load('core.runtime');
 let paths=0;
 w.h.load('movement.remote').distance=(_,p)=>{paths++;return p.roomName===w.a.room.name ? 20 : 80;};
 runtime.optionalWorkAllowed=()=>paths<1;
 w.update(19);
 assert.equal(w.record.expansion.remotes.length,0);
 assert.equal(w.record.expansion.capacityReason,'DEFERRED_CPU');
 runtime.optionalWorkAllowed=()=>true;
 w.update(44);
 assert.equal(paths,4);
 assert.equal(w.record.expansion.remote.room,w.a.room.name);
});
test('the scout is asked to refresh missing intel and unreserved income uses neutral capacity',()=>{
 const w=world();w.home.room.energyCapacityAvailable=1000;
 w.h.Game.time=19; delete w.mem.intel[w.b.room.name];
 w.h.load('operations.remote').update(w.colony(),w.mem,w.record);
 assert.deepEqual(Array.from(w.record.expansion.resurvey),[w.b.room.name]);
 assert.equal(w.record.expansion.remote.grossIncome,5);
 assert.equal(w.record.expansion.candidate.costs.reservation,0);
});
test('a room reserver keeps working when its original source retires',()=>{
 const w=world(true);w.update(19);w.update(1019);
 const [one,two]=w.record.expansion.remotes;
 one.retiring=true;one.reason='RETIRING_SURPLUS';
 const c=w.role('keeper','reserver',one,w.h.Game.rooms[two.room]);
 w.h.load('operations.roles').run(c,w.mem,new Map());
 assert.equal(c.calls[0].action,'reserveController');
});

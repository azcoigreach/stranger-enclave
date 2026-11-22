'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');

function setup() {
  const h=harness(), home=h.addRoom('E23S47',{level:4}), away=h.addRoom('E24S47');
  delete h.Game.spawns[away.spawn.name]; away.objects[h.constants.FIND_STRUCTURES]=[];
  away.controller.my=false; delete away.controller.owner;
  for (const source of away.objects[h.constants.FIND_SOURCES]) source.energyCapacity=1500;
  const exits={E23S47:{3:'E24S47',7:'E22S47'},E24S47:{7:'E23S47'},E22S47:{3:'E23S47'}};
  h.Game.map.describeExits=name=>exits[name] || {};
  h.Game.map.findRoute=(from,to,opts)=> {
    const queue=[{name:from,path:[]}],seen=new Set([from]);
    while(queue.length) {
      const next=queue.shift();
      for(const [exit,name] of Object.entries(exits[next.name]||{})) {
        if(seen.has(name) || opts.routeCallback(name,next.name)===Infinity) continue;
        const path=[...next.path,{room:name,exit:Number(exit)}];
        if(name===to) return path;
        seen.add(name);queue.push({name,path});
      }
    }
    return -2;
  };
  home.room.energyAvailable=home.room.energyCapacityAvailable=1300;
  home.room.storage={id:'bank',my:true,structureType:'storage',store:store(5000,1000000),pos:position(26,26,home.room.name)};
  home.objects[h.constants.FIND_STRUCTURES].push(home.room.storage);
  h.context.PathFinder.search=(origin,goal)=>({incomplete:false,cost:45,path:[position(19,20,goal.pos.roomName)]});
  const memory=h.load('core.memory').initialize();
  h.load('territory.intel').observe(home.room,memory);h.load('territory.intel').observe(away.room,memory);
  const record=memory.colonies[home.room.name]={lastSeen:1,level:4,energy:1300,capacity:1300,workers:0,reason:'TEST'};
  const colony=()=>h.load('colony.snapshot').create(home.room);
  const activate=()=>{h.Game.time=19;h.load('operations.remote').update(colony(),h.Memory.enclave,h.Memory.enclave.colonies[home.room.name]);return h.Memory.enclave.colonies[home.room.name].expansion.remote;};
  const role=(name,type,room=home.room,energy=0)=> {
    const c=h.addWorker(room,name,energy);c.memory.role=type;c.memory.home=home.room.name;c.memory.targetRoom=away.room.name;
    c.memory.sourceId=away.objects[h.constants.FIND_SOURCES][0].id;
    c.body=(type==='remoteMiner'?['work','work','work','work','work','move','move','move','move','move']:type==='reserver'?['claim','claim','move','move']:['carry','move']).map(type=>({type,hits:100}));
    return c;
  };
  return {h,home,away,memory,record,colony,activate,role,exits};
}

test('storage unlocks at RCL4 and uses the remembered construction layout',()=> {
  const {h,home,colony,record}=setup();delete home.room.storage;
  home.objects[h.constants.FIND_STRUCTURES]=[home.spawn,{id:'tower',structureType:'tower',my:true,pos:position(30,30,home.room.name)}];
  for(let i=0;i<10 && !home.room.siteCalls.length;i++) h.load('planning.bootstrap').run(colony(),record,()=>true);
  assert.equal(home.room.siteCalls[0].type,'storage');
  assert.ok(record.layout.buildings.some(b=>b.type==='storage'));
});

test('home haulers bank surplus but keep consumers and spawn ahead of storage',()=> {
  const {h,home,colony,role,memory}=setup();const c=role('hauler','hauler',home.room,50);
  c.memory.sourceId=home.objects[h.constants.FIND_SOURCES][0].id;
  const run=()=>h.load('economy.hauler').run(c,colony(),memory.block,new Map());
  run();assert.equal(c.calls[0].target.id,'bank');
  c.calls=[];const worker=h.addWorker(home.room,'worker',0);run();assert.equal(c.calls[0].target,worker);
  c.calls=[];home.spawn.store.energy=200;run();assert.equal(c.calls[0].target,home.spawn);
});

test('home haulers withdraw storage only during a source gap with home demand',()=> {
  const {h,home,colony,role,memory}=setup();const c=role('hauler','hauler');
  c.memory.sourceId=home.objects[h.constants.FIND_SOURCES][0].id;
  const worker=h.addWorker(home.room,'worker',0);
  const run=()=>h.load('economy.hauler').run(c,colony(),memory.block,new Map());
  run();assert.equal(c.calls[0].action,'withdraw');assert.equal(c.calls[0].target.id,'bank');
  c.calls=[];c.store.energy=50;run();assert.equal(c.calls[0].target,worker);
  c.calls=[];c.store.energy=0;worker.store.energy=50;run();assert.ok(!c.calls.some(x=>x.action==='withdraw'));
});

test('intel records actual slots, exits, reservation expiry and hostile capabilities',()=> {
  const {h,away,memory}=setup();away.room.getTerrain=()=>({get:(x,y)=>x===19&&y===20?0:1});
  away.controller.reservation={username:'rival',ticksToEnd:200};
  away.objects[h.constants.FIND_HOSTILE_CREEPS]=[{body:[{type:'attack',hits:100},{type:'heal',hits:0}]}];
  h.load('territory.intel').observe(away.room,memory);
  const info=memory.intel[away.room.name];
  assert.equal(info.sources[0].slots.length,1);assert.equal(info.sources[0].capacity,1500);
  assert.equal(info.reservationUntil,201);assert.equal(info.hostileParts.attack,1);assert.equal(info.hostileParts.heal,undefined);
  assert.equal(info.exits[0],homeName());assert.equal(memory.intel.E22S47,undefined);
});
function homeName(){return 'E23S47';}

test('remote commitment waits for storage reserves and accepts only complete bounded routes',()=> {
  const {h,home,colony,record,activate}=setup();home.room.storage.store.energy=1999;
  assert.equal(activate(),undefined);assert.equal(record.expansion.reason,'WAIT_STORAGE_RESERVE');
  home.room.storage.store.energy=5000;h.context.PathFinder.search=()=>({incomplete:true,path:[],cost:10});
  assert.equal(activate(),undefined);assert.equal(record.expansion.reason,'NO_ECONOMIC_ROUTE');
  h.context.PathFinder.search=()=>({incomplete:false,path:[{}],cost:201});assert.equal(activate(),undefined);
  h.context.PathFinder.search=()=>({incomplete:false,path:[{}],cost:45});const op=activate();
  assert.equal(op.room,'E24S47');assert.equal(op.carry,20);
  h.load('operations.remote').update(colony(),h.Memory.enclave,record);assert.equal(record.expansion.remote,op);
});

for(const danger of ['hostile','keeper','owner','reservation','stale','noSlots','outside']) test(`remote selection rejects ${danger}`,()=> {
  const {h,away,memory,activate,exits}=setup();const info=memory.intel[away.room.name];
  if(danger==='hostile')info.unsafeUntil=2000;
  if(danger==='keeper')info.npc=true;
  if(danger==='owner')info.owner='rival';
  if(danger==='reservation'){info.reservation='rival';info.reservationUntil=2000;}
  if(danger==='stale')info.lastSeen=-1000;
  if(danger==='noSlots')for(const source of info.sources)source.slots=[];
  if(danger==='outside'){exits.E23S47={3:'E30S47'};memory.intel.E30S47=info;}
  assert.equal(activate(),undefined);
});

test('routes and movement reject every out-of-block intermediate and remote unknown rooms',()=> {
  const {h,memory,role}=setup(),m=h.load('movement.remote'),c=role('scout','scout');
  assert.equal(m.route('E23S47','E30S47',memory,'E23S47',true),null);
  assert.equal(m.route('E23S47','E22S47',memory,'E23S47',false),null);
  assert.ok(m.route('E23S47','E22S47',memory,'E23S47',true));
  h.Game.map.findRoute=()=>[{room:'E30S47',exit:3},{room:'E24S47',exit:3}];
  assert.equal(m.travel(c,'E24S47',memory,true),-2);assert.equal(c.calls.length,0);
});

test('scout visits unseen neighboring rooms and retains its target through a reset',()=> {
  const {h,home,away,role,memory}=setup();delete h.Game.rooms[away.room.name];delete memory.intel[away.room.name];
  const c=role('scout','scout');delete c.memory.targetRoom;h.load('operations.scout').run(c,memory);
  assert.equal(c.memory.targetRoom,'E22S47');assert.equal(c.calls[0].path[0].roomName,'E22S47');
  const target=c.memory.targetRoom;h.reset();h.context.PathFinder.search=(origin,goal,opts)=>{assert.equal(opts.maxRooms,2);return {incomplete:false,cost:45,path:[position(19,20,goal.pos.roomName)]};};h.Game.time++;c.calls=[];
  h.load('operations.scout').run(c,h.Memory.enclave);assert.equal(c.memory.targetRoom,target);
  assert.equal(c.calls[0].path[0].roomName,target);assert.equal(c.memory.home,home.room.name);
});

test('scout retreats on newly observed threats and does not count unseen rooms as surveyed',()=> {
  const {h,away,role,memory}=setup();const c=role('scout','scout',away.room);
  memory.intel[away.room.name].unsafeUntil=2000;
  h.load('operations.scout').run(c,memory);assert.equal(c.calls[0].path[0].roomName,'E23S47');
  assert.equal(memory.intel.E22S47,undefined);
});

test('spawn requests fund first transport, mining, reservation, then extra transport, counting pending creeps',()=> {
  const {h,home,role,colony,record,memory,activate}=setup();activate();role('scout','scout');
  const req=()=>h.load('operations.remote').request(colony(),memory,record);
  assert.equal(req().role,'remoteHauler');assert.equal(req().body.length,24);
  const first=role('haul','remoteHauler');first.spawning=true;first.body=Array.from({length:12},()=>({type:'carry',hits:100}));
  assert.equal(req().role,'remoteMiner');role('miner','remoteMiner');assert.equal(req().role,'reserver');
  const reserver=role('reserve','reserver');assert.equal(req().body.length,16);
  const second=role('haul2','remoteHauler');second.body=Array.from({length:8},()=>({type:'carry',hits:100}));
  assert.equal(req(),null);reserver.ticksToLive=60;assert.equal(req().role,'reserver');
  home.room.storage.store.energy=1999;assert.equal(req(),null);
});

test('home recovery wins spawn arbitration even with an active funded remote',()=> {
  const {h,home,activate}=setup();activate();h.tick();
  assert.equal(home.spawn.calls.length,1);assert.equal(home.spawn.calls[0].opts.memory.role,'bootstrap');
  assert.equal(h.Memory.enclave.colonies[home.room.name].expansion.remote.spawnEnergy,0);
});

test('threat, stale vision and storage loss pause the operation without losing its source',()=> {
  const {h,home,away,memory,colony,record,activate}=setup();const op=activate();
  memory.intel[away.room.name].unsafeUntil=2000;h.load('operations.remote').update(colony(),memory,record);assert.equal(op.reason,'UNSAFE_REMOTE');
  h.Game.time=2001;h.load('operations.remote').update(colony(),memory,record);assert.equal(op.reason,'STALE_INTEL');
  h.load('territory.intel').observe(away.room,memory);h.load('operations.remote').update(colony(),memory,record);assert.equal(op.reason,'ACTIVE');
  delete home.room.storage;h.load('operations.remote').update(colony(),memory,record);assert.equal(op.reason,'WAIT_STORAGE');assert.equal(op.room,away.room.name);
});

test('remote roles harvest, collect, deliver and reserve without claiming',()=> {
  const {h,home,away,memory,role,activate}=setup();activate();
  const run=c=>h.load('operations.roles').run(c,memory,new Map());
  const miner=role('miner','remoteMiner',away.room);miner.pos=position(21,20,away.room.name);run(miner);assert.equal(miner.calls[0].action,'harvest');
  const reserver=role('reserver','reserver',away.room);run(reserver);assert.equal(reserver.calls[0].action,'reserveController');
  const haul=role('haul','remoteHauler',away.room);const source=away.objects[h.constants.FIND_SOURCES][0];
  away.objects[h.constants.FIND_DROPPED_RESOURCES]=[{id:'drop',amount:50,resourceType:'energy',pos:position(source.pos.x+1,source.pos.y,away.room.name)}];
  run(haul);assert.equal(haul.calls[0].action,'pickup');haul.calls=[];haul.store.energy=50;
  run(haul);assert.equal(haul.calls[0].path.at(-1).roomName,home.room.name);
  haul.room=home.room;haul.pos=position(27,26,home.room.name);haul.calls=[];run(haul);assert.equal(haul.calls[0].action,'transfer');assert.equal(haul.calls[0].target.id,'bank');
  haul.store.energy=0;haul.calls=[];run(haul);assert.equal(haul.calls[0].path.at(-1).roomName,away.room.name);
});

test('paused miners retreat and haulers bring cargo home, including after serialization',()=> {
  const {h,away,home,memory,role,activate}=setup();const op=activate();op.reason='UNSAFE_REMOTE';memory.intel[away.room.name].unsafeUntil=2000;
  const miner=role('miner','remoteMiner',away.room),hauler=role('haul','remoteHauler',away.room,25);
  h.reset();h.context.PathFinder.search=(origin,goal)=>({incomplete:false,cost:45,path:[position(19,20,goal.pos.roomName)]});for(const c of [miner,hauler]) {h.load('operations.roles').run(c,h.Memory.enclave,new Map());assert.equal(c.calls[0].path.at(-1).roomName,home.room.name);assert.ok(!c.calls.some(x=>x.action==='harvest'));}
  hauler.room=home.room;hauler.pos=position(27,26,home.room.name);hauler.calls=[];
  h.load('operations.roles').run(hauler,h.Memory.enclave,new Map());assert.equal(hauler.calls[0].action,'transfer');
});

test('delivery counters use resolved storage events exactly once, including dead actors',()=> {
  const {h,home,record,colony,memory,role,activate}=setup();const op=activate(),c=role('haul','remoteHauler',home.room,50);
  h.Game.time++;h.load('operations.remote').update(colony(),memory,record);
  h.load('operations.roles').run(c,memory,new Map());assert.equal(op.delivered,0);
  delete h.Game.creeps.haul;home.room.getEventLog=()=>[{event:12,objectId:'haul',data:{targetId:'bank',resourceType:'energy',amount:50}},
    {event:12,objectId:'unrelated',data:{targetId:'bank',resourceType:'energy',amount:500}}];
  h.Game.time++;h.load('operations.remote').update(colony(),memory,record);assert.equal(op.delivered,50);
  h.load('operations.remote').update(colony(),memory,record);assert.equal(op.delivered,50);
  h.reset();h.load('operations.remote').update(colony(),h.Memory.enclave,h.Memory.enclave.colonies[home.room.name]);assert.equal(h.Memory.enclave.colonies[home.room.name].expansion.remote.delivered,50);
});

test('a full remote hauler retains return mode after a partial storage transfer',()=> {
  const {h,home,away,memory,role,activate}=setup();activate();const c=role('haul','remoteHauler',away.room,50);c.memory.working=false;
  h.load('operations.roles').run(c,memory,new Map());
  c.room=home.room;c.pos=position(27,26,home.room.name);c.store.energy=25;c.calls=[];
  h.load('operations.roles').run(c,memory,new Map());assert.equal(c.calls[0].action,'transfer');
});

test('home tower refills, CPU pressure and downgrade urgency defer optional spawning',()=> {
  const {h,home,colony,record,memory,activate}=setup();activate();
  const request=()=>h.load('operations.remote').request(colony(),memory,record);
  home.objects[h.constants.FIND_STRUCTURES].push({id:'tower',structureType:'tower',my:true,pos:position(30,30,home.room.name),store:store(999,1000)});
  assert.equal(request(),null);home.objects[h.constants.FIND_STRUCTURES].pop();
  h.Game.cpu.bucket=10;assert.equal(request(),null);h.Game.cpu.bucket=10000;
  home.controller.ticksToDowngrade=100;assert.equal(request(),null);
});

test('remote roles stop work when their home is no longer owned',()=> {
  const {h,home,away,memory,role,activate}=setup();activate();const c=role('miner','remoteMiner',away.room);
  home.controller.my=false;home.controller.owner={username:'rival'};
  h.load('operations.roles').run(c,memory,new Map());assert.equal(c.calls.length,0);assert.equal(c.memory.task,'REMOTE_HOME_UNAVAILABLE');
});

test('periodic remote route failure pauses crews until a complete route returns',()=> {
  const {h,away,memory,record,colony,activate}=setup();const op=activate();
  h.Game.time=119;h.load('territory.intel').observe(away.room,memory);
  h.context.PathFinder.search=()=>({incomplete:true,cost:0,path:[]});h.load('operations.remote').update(colony(),memory,record);
  assert.equal(op.reason,'NO_ECONOMIC_ROUTE');
  h.Game.time++;h.load('operations.remote').update(colony(),memory,record);assert.equal(op.reason,'NO_ECONOMIC_ROUTE');
  h.Game.time=219;h.context.PathFinder.search=()=>({incomplete:false,cost:40,path:[{}]});h.load('operations.remote').update(colony(),memory,record);
  assert.equal(op.reason,'ACTIVE');assert.equal(op.carry,18);
});

test('construction and reconstruction keep priority over optional crews',()=> {
  const {h,colony,memory,record,activate}=setup();activate();record.layout={version:1,buildings:[{type:'tower',x:30,y:30}]};
  assert.equal(h.load('operations.remote').request(colony(),memory,record),null);
});

test('remote haulers respect pickup reservations and a full home storage',()=> {
  const {h,home,away,memory,role,activate}=setup();activate();const a=role('a','remoteHauler',away.room),b=role('b','remoteHauler',away.room);
  away.objects[h.constants.FIND_DROPPED_RESOURCES]=[{id:'drop',amount:50,resourceType:'energy',pos:position(21,20,away.room.name)}];
  const jobs=new Map();h.load('operations.roles').run(a,memory,jobs);h.load('operations.roles').run(b,memory,jobs);
  assert.equal(a.calls[0].action,'pickup');assert.ok(!b.calls.some(c=>c.action==='pickup'));
  a.room=home.room;a.store.energy=50;a.calls=[];home.room.storage.store.energy=1000000;
  h.load('operations.roles').run(a,memory,new Map());assert.equal(a.calls.length,0);assert.equal(a.memory.task,'REMOTE_STORAGE_FULL');
});

function resetReplay(reset) {
  const {h,home,away,memory,role,activate,colony}=setup();activate();const c=role('haul','remoteHauler',away.room);
  const trace=[];
  for(let i=0;i<6;i++) {
    h.Game.time=20+i;
    if(reset) h.reset();
    h.context.PathFinder.search=(origin,goal)=>({incomplete:false,cost:45,path:[position(19,20,goal.pos.roomName)]});
    const mem=h.Memory.enclave,rec=mem.colonies[home.room.name];
    if(i===2)mem.intel[away.room.name].unsafeUntil=100;
    if(i===3){c.room=home.room;c.store.energy=25;}
    if(i===4)c.store.energy=0;
    h.load('operations.remote').update(colony(),mem,rec);c.calls=[];
    h.load('operations.roles').run(c,mem,new Map());
    trace.push(JSON.parse(JSON.stringify({memory:mem,creep:c.memory,actions:c.calls.map(call=>({action:call.action,target:call.target?.id||call.target?.roomName||call.path?.at(-1)?.roomName,amount:call.amount}))})));
  }
  return trace;
}
test('remote operation traces match across serialized memory and global resets',()=>assert.deepEqual(resetReplay(false),resetReplay(true)));

test('outbound collectors wait near storage until a miner reaches the remote source',()=> {
  const {h,home,away,memory,role,activate}=setup();activate();const c=role('haul','remoteHauler');
  h.load('operations.roles').run(c,memory,new Map());assert.equal(c.memory.task,'REMOTE_WAIT_PRODUCER');assert.equal(c.calls[0].target.roomName,home.room.name);
  const miner=role('miner','remoteMiner',away.room);miner.pos=position(21,20,away.room.name);c.calls=[];
  h.load('operations.roles').run(c,memory,new Map());assert.equal(c.calls[0].path.at(-1).roomName,away.room.name);
});

test('a failed optional remote survey cannot suppress emergency home spawning',()=> {
  const {h,home}=setup();h.load('operations.remote').update=()=>{throw new Error('fixture route failure');};
  h.tick();assert.equal(home.spawn.calls.length,1);assert.equal(home.spawn.calls[0].opts.memory.role,'bootstrap');
  assert.equal(h.Memory.enclave.alerts['operations:E23S47'].count,1);
});


test('ordinary storage construction does not suppress a missing scout',()=> {
  const {h,colony,memory,record}=setup();
  record.layout={version:1,buildings:[{type:'storage',x:40,y:17}]};
  const request=h.load('operations.remote').request(colony(),memory,record);
  assert.equal(request && request.role,'scout');
  assert.deepEqual(Array.from(request.body),['move']);
});

test('storage construction allows aging scout replacement but counts pending scouts',()=> {
  const {h,colony,memory,record,role}=setup();
  record.layout={version:1,buildings:[{type:'storage',x:40,y:17}]};
  const scout=role('scout','scout');scout.body=[{type:'move',hits:100}];scout.ticksToLive=70;
  const request=()=>h.load('operations.remote').request(colony(),h.Memory.enclave,h.Memory.enclave.colonies.E23S47);
  assert.equal(request()?.role,'scout');
  h.reset();assert.equal(request()?.role,'scout');
  scout.spawning=true;assert.equal(request(),null);
});

test('ordinary construction still defers remote crew spending after the scout is covered',()=> {
  const {h,colony,memory,record,role,activate}=setup();activate();role('scout','scout');
  record.layout={version:1,buildings:[{type:'storage',x:40,y:17}]};
  assert.equal(h.load('operations.remote').request(colony(),memory,record),null);
});

test('scouts do not follow an incomplete route into a cul-de-sac while refreshing remote intel',()=>{
 const {h,memory,role}=setup(),c=role('scout','scout');
 h.context.PathFinder.search=()=>({incomplete:true,cost:25,path:[position(5,18,c.room.name)]});
 assert.equal(h.load('movement.remote').travel(c,'E24S47',memory,true),-2);assert.equal(c.calls.length,0);
});

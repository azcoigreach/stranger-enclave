'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');

const {world,enemy,defender}=require('./defense-fixture');

test('an unguarded remote raid withdraws civilians and publishes a bounded reinforcement plan',()=>{
  const w=world();enemy(w,w.remote);const miner=w.h.addWorker(w.remote.room,'miner');
  Object.assign(miner.memory,{home:w.home.room.name,role:'remoteMiner',targetRoom:w.remote.room.name,sourceId:w.remote.objects[2][0].id});
  w.update();const m=w.h.Memory.enclave,s=m.defense.rooms[w.remote.room.name];
  assert.equal(s.mode,'escort');assert.equal(s.reason,'WITHDRAW_UNTIL_COVERED');
  assert.ok(s.request.body.includes('ranged_attack'));assert.ok(s.request.body.includes('heal'));assert.ok(s.eta>s.contactIn);
  assert.equal(w.h.load('defense.civilian').run(miner,m),true);
  assert.equal(miner.memory.evacuation.fallback,w.home.room.name);
  assert.ok(miner.calls.some(c=>c.action==='path'));assert.equal(miner.calls.some(c=>c.action==='harvest'),false);
});

test('tower-solvable invaders use coordinated towers without a defender request',()=>{
  const w=world(),e=enemy(w,w.home);const calls=[];
  w.home.objects[1].push({id:'tower',isActive:()=>true,my:true,structureType:'tower',pos:position(25,25,w.home.room.name),store:store(1000,1000),attack:t=>calls.push(t.id)});
  w.update();const s=w.h.Memory.enclave.defense.rooms[w.home.room.name];
  assert.equal(s.mode,'tower');assert.equal(s.request,undefined);
  w.h.load('defense.basic').run(w.h.load('colony.snapshot').create(w.home.room));assert.deepEqual(calls,[e.id]);
});

test('classification records active boosted combat, healing, tough and movement by owner',()=>{
  const w=world();enemy(w,w.remote,[{type:'attack',hits:100,boost:'XUH2O'},{type:'heal',hits:100,boost:'XLHO2'},{type:'move',hits:100,boost:'XZHO2'},{type:'tough',hits:100,boost:'XGHO2'},{type:'ranged_attack',hits:0}],{owner:{username:'player'}});
  w.observe();const p=w.h.Memory.enclave.intel[w.remote.room.name].hostiles[0];
  assert.equal(p.kind,'player');assert.equal(p.attack,120);assert.equal(p.heal,48);assert.equal(p.ranged,0);
  assert.equal(p.move,8);assert.ok(p.effectiveHits>600);assert.equal(p.boosts.XGHO2,1);
});

test('a healing player beyond affordable power evacuates without feeding replacements',()=>{
  const w=world();enemy(w,w.remote,[...Array(10).fill('heal'),...Array(10).fill('ranged_attack'),...Array(20).fill('move')],{owner:{username:'player'}});
  w.update();const s=w.h.Memory.enclave.defense.rooms[w.remote.room.name];assert.equal(s.mode,'evacuate');assert.equal(s.request,undefined);
  for(let i=0;i<5;i++){w.h.Game.time+=100;w.reset();w.update();assert.equal(w.h.load('defense.dispatch').request(w.h.load('colony.snapshot').create(w.home.room),w.h.Memory.enclave),null);}
});

test('existing viable defenders are reused; short lifetime and destroyed combat parts are rejected',()=>{
  const w=world();enemy(w,w.remote);const c=defender(w,[...Array(8).fill('attack'),...Array(8).fill('move')]);
  w.update();let s=w.h.Memory.enclave.defense.rooms[w.remote.room.name];assert.deepEqual([...s.assigned],[c.name]);assert.equal(s.request,undefined);
  c.ticksToLive=5;w.h.Game.time++;w.reset();w.update();s=w.h.Memory.enclave.defense.rooms[w.remote.room.name];assert.ok(s.request);assert.equal(s.assigned.length,0);
});

test('simultaneous home and remote threats keep reinforcements at home',()=>{
  const w=world();enemy(w,w.home);enemy(w,w.remote);w.update();const m=w.h.Memory.enclave;
  assert.ok(m.defense.rooms[w.home.room.name].request);
  assert.equal(m.defense.rooms[w.remote.room.name].request,undefined);
  assert.equal(m.defense.rooms[w.remote.room.name].reason,'HOME_DEFENSE_FIRST');
});

test('successful spawn spending and losses persist across resets and stop replacement streams',()=>{
  const w=world();enemy(w,w.remote);w.update();let m=w.h.Memory.enclave;
  const snap=()=>w.h.load('colony.snapshot').create(w.home.room);
  for(let i=0;i<2;i++){
    const req=w.h.load('defense.dispatch').request(snap(),m);assert.ok(req);
    w.h.load('defense.dispatch').spawned(req,`lost-${i}`,m);
    w.h.Game.time+=160;w.reset();w.update();m=w.h.Memory.enclave;
  }
  assert.equal(m.defense.rooms[w.remote.room.name].losses,2);
  assert.equal(w.h.load('defense.dispatch').request(snap(),m),null);
  assert.equal(m.defense.rooms[w.remote.room.name].reason,'INCIDENT_BUDGET_EXHAUSTED');
  assert.ok(m.defense.rooms[w.remote.room.name].spent<=3600);
});

test('missing vision cannot clear an incident; continuous fresh safety restores the route after reset',()=>{
  const w=world();enemy(w,w.remote);w.update();delete w.h.Game.rooms[w.remote.room.name];
  w.h.Game.time+=100;w.reset();w.update();assert.notEqual(w.h.Memory.enclave.defense.rooms[w.remote.room.name].mode,'clear');
  w.h.Game.rooms[w.remote.room.name]=w.remote.room;w.remote.objects[4]=[];
  for(let i=0;i<26;i++){w.h.Game.time++;w.reset();w.update();}
  const m=w.h.Memory.enclave;assert.equal(m.defense.rooms[w.remote.room.name].mode,'clear');
  assert.equal(w.h.load('territory.intel').safe(m.intel[w.remote.room.name],'test'),true);
});


test('affordable melee handles unarmed raiders while ranged threats require a healing ranged body',()=>{
  const w=world(),t=w.h.load('defense.threat');
  const raider=enemy(w,w.remote,['work','carry','move']);w.observe();
  const body=t.bodyFor(300,w.h.Memory.enclave.intel[w.remote.room.name].hostiles,10);
  assert.deepEqual([...body],['attack','move']);
  raider.body=['ranged_attack','move'].map(type=>({type,hits:100}));raider.hits=200;w.observe();
  const ranged=t.bodyFor(1800,w.h.Memory.enclave.intel[w.remote.room.name].hostiles,10);
  assert.ok(ranged.includes('ranged_attack'));assert.ok(ranged.includes('heal'));
  assert.equal(t.bodyFor(150,w.h.Memory.enclave.intel[w.remote.room.name].hostiles,10),null);
});

test('an injured fighter and a fighter missing combat parts do not count as cover',()=>{
  const w=world();enemy(w,w.remote);const c=defender(w,[...Array(8).fill('attack'),...Array(8).fill('move')]);
  c.hits=100;w.update();assert.equal(w.h.Memory.enclave.defense.rooms[w.remote.room.name].assigned.length,0);
  c.hits=c.hitsMax;for(const p of c.body)if(p.type==='attack')p.hits=0;
  w.h.Game.time++;w.update();assert.equal(w.h.Memory.enclave.defense.rooms[w.remote.room.name].assigned.length,0);
});

test('new threats require enough remaining enemy life to justify spawning',()=>{
  const w=world();enemy(w,w.remote,undefined,{ticksToLive:10});w.update();
  const s=w.h.Memory.enclave.defense.rooms[w.remote.room.name];assert.equal(s.request,undefined);assert.equal(s.reason,'TOO_LATE_TO_REINFORCE');
});

test('tower bank, ownership, hostile ramparts and healing prevent a false tower-only decision',()=>{
  const w=world();enemy(w,w.home,['heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','move']);
  const tower={id:'tower',my:true,isActive:()=>true,structureType:'tower',pos:position(25,25,w.home.room.name),store:store(1000,1000)};
  w.home.objects[1].push(tower);w.update();assert.notEqual(w.h.Memory.enclave.defense.rooms[w.home.room.name].mode,'tower');
  enemy(w,w.home);tower.store.energy=10;w.h.Game.time++;w.update();assert.notEqual(w.h.Memory.enclave.defense.rooms[w.home.room.name].mode,'tower');
  tower.store.energy=1000;tower.my=false;w.h.Game.time++;w.update();assert.notEqual(w.h.Memory.enclave.defense.rooms[w.home.room.name].mode,'tower');
  tower.my=true;w.home.objects[1].push({structureType:'rampart',my:false,pos:position(19,19,w.home.room.name)});w.h.Game.time++;w.update();assert.notEqual(w.h.Memory.enclave.defense.rooms[w.home.room.name].mode,'tower');
});

test('a threatened home is not an evacuation destination and forbidden rooms remain excluded',()=>{
  const w=world();enemy(w,w.home);enemy(w,w.remote);
  const c=w.h.addWorker(w.remote.room,'civilian');Object.assign(c.memory,{role:'remoteHauler',home:w.home.room.name,targetRoom:w.remote.room.name});
  w.update();let searched=false;
  w.h.context.PathFinder.search=(origin,goals,opts)=>{searched=true;assert.equal(opts.roomCallback('W0N1'),false);return {incomplete:true,path:[],cost:0};};
  assert.equal(w.h.load('defense.civilian').run(c,w.h.Memory.enclave),true);
  assert.equal(c.memory.task,'DEFENSE_NO_SAFE_FALLBACK');assert.equal(c.memory.evacuation.fallback,undefined);assert.equal(c.calls.length,0);assert.ok(searched);
  assert.equal(w.h.load('defense.movement').path(c.pos,position(25,25,'W0N1'),1,w.h.Memory.enclave,'test',true),null);
});

test('fresh alternate refuge beats unsafe home and incomplete tile paths never issue movement',()=>{
  const w=world();enemy(w,w.home);enemy(w,w.remote);const refuge=w.h.addRoom('W4N2');
  w.h.Game.map.describeExits=name=>name===w.remote.room.name?{3:w.home.room.name,5:refuge.room.name}:{};
  const c=w.h.addWorker(w.remote.room,'civilian');Object.assign(c.memory,{role:'remoteMiner',home:w.home.room.name,targetRoom:w.remote.room.name});
  w.update();w.h.load('defense.civilian').run(c,w.h.Memory.enclave);assert.equal(c.memory.evacuation.fallback,refuge.room.name);
  c.calls=[];w.h.context.PathFinder.search=()=>({incomplete:true,path:[position(20,20,refuge.room.name)],cost:2});
  w.h.load('defense.civilian').run(c,w.h.Memory.enclave);assert.equal(c.calls.length,0);assert.equal(c.memory.task,'DEFENSE_NO_SAFE_FALLBACK');
});

test('pending defender survives serialization without a duplicate request; failed spawns spend nothing',()=>{
  const w=world();enemy(w,w.remote);w.update();let m=w.h.Memory.enclave;
  const req=w.h.load('defense.dispatch').request(w.h.load('colony.snapshot').create(w.home.room),m);
  w.h.load('defense.dispatch').spawned(req,'pending',m);w.home.spawn.spawning={name:'pending',remainingTime:req.body.length*3};
  w.h.Game.time++;w.reset();w.update();m=w.h.Memory.enclave;
  assert.equal(m.defense.rooms[w.remote.room.name].reason,'REINFORCEMENT_SPAWNING');assert.equal(m.defense.rooms[w.remote.room.name].losses,0);
  assert.equal(w.h.load('defense.dispatch').request(w.h.load('colony.snapshot').create(w.home.room),m),null);
});

test('the shared spawn arbiter protects source mining and first transport, then chooses defense',()=>{
  const w=world();enemy(w,w.remote);for(let i=0;i<2;i++)w.h.addWorker(w.home.room,`worker${i}`);
  w.update();const m=w.h.Memory.enclave,snap=()=>w.h.load('colony.snapshot').create(w.home.room),record=m.colonies[w.home.room.name];
  const production=w.h.load('economy.production'),demand=w.h.load('economy.demand');
  demand.plan=()=>({specialized:true,sources:[],workerWork:2,income:10});
  for(const [role,priority] of [['miner',2],['hauler',1]]){
    production.request=()=>({role,priority,reason:'CRITICAL',body:['work','carry','move']});
    w.h.load('economy.spawn').run(snap(),m,record);assert.equal(w.home.spawn.calls.at(-1).opts.memory.role,role);
  }
  production.request=()=>({role:'engineer',priority:3.5,body:['work','carry','move'],reason:'OPTIONAL'});
  w.home.spawn.result=-6;w.h.load('economy.spawn').run(snap(),m,record);assert.equal(m.defense.rooms[w.remote.room.name].spent,0);
  w.home.spawn.result=0;w.h.load('economy.spawn').run(snap(),m,record);const call=w.home.spawn.calls.at(-1);
  assert.equal(call.opts.memory.role,'defender');assert.equal(call.opts.memory.defenseRoom,w.remote.room.name);
  assert.equal(m.defense.rooms[w.remote.room.name].spawned,1);
});

test('melee and ranged/healing execution stay in the assigned room and retreat on lost advantage',()=>{
  const w=world(),e=enemy(w,w.remote);const c=defender(w,[...Array(8).fill('attack'),...Array(8).fill('move')],'guard',w.remote);
  c.pos=position(21,20,w.remote.room.name);w.update();w.h.load('defense.roles').run(c,w.h.Memory.enclave);
  assert.equal(c.calls.filter(x=>x.action==='attack').length,1);assert.equal(c.calls.some(x=>x.action==='heal'),false);
  c.calls=[];c.body=['ranged_attack','ranged_attack','heal','heal','move','move','move','move'].map(type=>({type,hits:100}));c.hitsMax=800;c.hits=790;
  w.h.Game.time++;w.update();w.h.load('defense.roles').run(c,w.h.Memory.enclave);
  assert.ok(c.calls.some(x=>x.action==='heal'&&x.target===c));assert.ok(c.calls.some(x=>x.action==='rangedAttack'&&x.target===e));
  c.calls=[];c.hits=1;w.h.Game.time++;w.update();w.h.load('defense.roles').run(c,w.h.Memory.enclave);
  assert.equal(c.memory.task,'DEFENSE_RETREAT');assert.equal(c.calls.some(x=>x.action==='rangedAttack'),false);
});

test('return to work requires clearance and a safe complete route, including after a reset',()=>{
  const w=world();enemy(w,w.remote);const c=w.h.addWorker(w.remote.room,'civilian');Object.assign(c.memory,{role:'remoteMiner',home:w.home.room.name,targetRoom:w.remote.room.name});
  w.update();w.h.load('defense.civilian').run(c,w.h.Memory.enclave);c.room=w.home.room;c.pos=position(20,20,w.home.room.name);
  w.remote.objects[4]=[];
  for(let i=0;i<26;i++){w.h.Game.time++;w.reset();w.update();}
  assert.equal(w.h.load('defense.civilian').run(c,w.h.Memory.enclave),true);assert.equal(c.memory.task,'DEFENSE_SAFE_RETURN');
  c.room=w.remote.room;c.pos=position(20,20,w.remote.room.name);w.h.Game.time++;w.reset();w.update();
  assert.equal(w.h.load('defense.civilian').run(c,w.h.Memory.enclave),false);assert.equal(c.memory.evacuation,undefined);
});

test('full tick evacuation preempts civilian work and later traffic under low CPU',()=>{
  const w=world();enemy(w,w.remote);const c=w.h.addWorker(w.remote.room,'civilian');
  Object.assign(c.memory,{role:'remoteMiner',home:w.home.room.name,targetRoom:w.remote.room.name,sourceId:w.remote.objects[2][0].id});
  w.h.Game.cpu.bucket=0;w.h.tick();assert.equal(c.memory.task,'DEFENSE_EVACUATE');
  assert.equal(c.calls.filter(x=>x.action==='path').length,1);assert.equal(c.calls.some(x=>x.action==='harvest'),false);
  assert.equal(w.h.load('movement.yield').held(c),true);
  assert.deepEqual(Object.keys(w.h.Memory.enclave.alerts),[]);
});

test('NPC structures and foreign-owned rooms are never admitted as defense expeditions',()=>{
  const w=world();enemy(w,w.remote);w.remote.controller.owner={username:'foreign'};w.update();
  assert.equal(w.h.Memory.enclave.defense.rooms[w.remote.room.name].request,undefined);
  delete w.remote.controller.owner;w.remote.objects[1].push({structureType:'invaderCore',pos:position(19,19,w.remote.room.name)});w.h.Game.time++;w.update();
  assert.equal(w.h.Memory.enclave.defense.rooms[w.remote.room.name].reason,'UNSUPPORTED_NPC');
});

test('dead defender memory is cleaned without erasing pending spawn memory or incident losses',()=>{
  const w=world();const c=defender(w,['attack','move']);delete w.h.Game.creeps[c.name];
  w.h.Memory.creeps.pending={role:'defender',home:w.home.room.name};w.home.spawn.spawning={name:'pending'};
  w.h.load('core.memory').initialize();assert.equal(w.h.Memory.creeps.guard,undefined);assert.ok(w.h.Memory.creeps.pending);
});

test('realistic damaged body totals and boosted tough use original health to judge fitness',()=>{
  const w=world(),c=defender(w,[...Array(10).fill('attack'),...Array(10).fill('move')]);enemy(w,w.remote);w.observe();
  c.body.slice(0,5).forEach(p=>p.hits=0);c.hits=1500;
  assert.equal(w.h.load('defense.threat').holds(w.h.load('defense.threat').profile(c),w.h.Memory.enclave.intel[w.remote.room.name].hostiles,0),false);
});

test('escorting fighters stay with withdrawing civilians while using legal ranged fire and healing',()=>{
  const w=world();enemy(w,w.remote);const c=defender(w,['ranged_attack','ranged_attack','heal','heal','move','move','move','move'],'escort',w.remote);
  c.pos=position(25,20,w.remote.room.name);
  const civilian=w.h.addWorker(w.remote.room,'civilian');civilian.pos=position(22,20,w.remote.room.name);
  civilian.memory={role:'remoteHauler',home:w.home.room.name,targetRoom:w.remote.room.name,evacuation:{room:w.remote.room.name,incident:w.remote.room.name,fallback:w.home.room.name}};
  w.update();w.h.load('defense.roles').run(c,w.h.Memory.enclave);
  assert.equal(c.memory.task,'DEFENSE_ESCORT');assert.ok(c.calls.some(call=>call.action==='path'));
  assert.equal(c.memory.moveGoal.x,civilian.pos.x);
});

test('defensive paths avoid live occupancy and civilian paths exclude hostile firing lanes',()=>{
  const w=world();const e=enemy(w,w.remote,['ranged_attack','move']);w.observe();
  const c=w.h.addWorker(w.remote.room,'civilian');c.pos=position(40,20,w.remote.room.name);c.memory.home=w.home.room.name;
  const blocker=w.h.addWorker(w.remote.room,'blocker');blocker.pos=position(39,20,w.remote.room.name);
  w.h.context.PathFinder.search=(origin,goal,opts)=>{
    const matrix=opts.roomCallback(w.remote.room.name);assert.equal(matrix.get(blocker.pos.x,blocker.pos.y),255);
    assert.equal(matrix.get(e.pos.x+3,e.pos.y),255);assert.equal(opts.roomCallback('W0N1'),false);
    return {incomplete:true,path:[],cost:0};
  };
  const result=w.h.load('defense.movement').move(c,position(25,25,w.home.room.name),20,w.h.Memory.enclave);
  assert.equal(result,-2);assert.equal(c.calls.length,0);
});

test('home defense preserves the two recovery workers and counts evacuees rather than replacing them',()=>{
  const w=world();enemy(w,w.home);w.h.addWorker(w.home.room,'only-worker');w.h.tick();
  assert.equal(w.home.spawn.calls.at(-1).opts.memory.role,'bootstrap');
  const extra=w.h.addWorker(w.home.room,'second');extra.room=w.remote.room;extra.pos=position(30,30,w.remote.room.name);
  extra.memory.evacuation={room:w.home.room.name,incident:w.home.room.name,fallback:w.remote.room.name};
  w.h.Game.time++;w.h.tick();assert.equal(w.home.spawn.calls.at(-1).opts.memory.role,'defender');
});

test('defense decisions and evacuation memory replay identically across resets and insertion order',()=>{
  function replay(reset,reverse){
    const w=world();const c=w.h.addWorker(w.remote.room,'civilian');Object.assign(c.memory,{role:'remoteMiner',home:w.home.room.name,targetRoom:w.remote.room.name});
    const trace=[];
    for(let tick=1;tick<=32;tick++){
      w.h.Game.time=tick;if(reset)w.reset();
      if(tick<=5)enemy(w,w.remote);else w.remote.objects[4]=[];
      if(reverse){w.h.Game.creeps=Object.fromEntries(Object.entries(w.h.Game.creeps).reverse());w.h.Game.rooms=Object.fromEntries(Object.entries(w.h.Game.rooms).reverse());}
      w.update();w.h.load('defense.civilian').run(c,w.h.Memory.enclave);
      const s=w.h.Memory.enclave.defense.rooms[w.remote.room.name];
      if(tick===1)assert.equal(s.mode,'escort');if(tick===30)assert.notEqual(s.mode,'clear');if(tick===31)assert.equal(s.mode,'clear');
      trace.push(JSON.parse(JSON.stringify({defense:w.h.Memory.enclave.defense,civilian:c.memory})));
      w.h.persistMemory();
    }
    return trace;
  }
  assert.deepEqual(replay(true,true),replay(false,false));
});

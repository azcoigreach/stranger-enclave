'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');
function world() {
 const h=harness(),home=h.addRoom('E23S47',{level:5});home.room.energyAvailable=home.room.energyCapacityAvailable=1800;
 const at=(x,y)=>position(x,y,home.room.name),structures=home.objects[h.constants.FIND_STRUCTURES];
 const bank={id:'bank',my:true,structureType:'storage',pos:at(24,24),store:store(220000,1000000)};
 home.room.storage=bank;structures.push(bank);
 const memory=h.load('core.memory').initialize(),record=memory.colonies[home.room.name]={level:5,reason:'TEST',staffing:{requiredWorkerWork:15}};
 const colony=()=>h.load('colony.snapshot').create(home.room);
 const barrier=(id,type,hits,x=30,y=30)=>{const s={id,structureType:type,my:true,hits,hitsMax:10000000,pos:at(x,y)};structures.push(s);return s;};
 const engineer=(name,energy=0)=>{const c=h.addWorker(home.room,name,energy);c.memory.role='engineer';return c;};
 const link=(id,x,y,energy=0)=>{const s={id,my:true,structureType:'link',pos:at(x,y),store:store(energy,800),cooldown:0,calls:[],transferEnergy(t,a){this.calls.push({target:t,amount:a});return 0;}};structures.push(s);return s;};
 return {h,...home,at,bank,record,memory,colony,barrier,engineer,link};
}
test('defense budget accounts for rampart decay and grows remote demand with fortification work',()=>{
 const {h,colony,record,barrier,bank,room}=world(),budget=h.load('economy.budget');
 for(let i=0;i<5;i++){const c=h.addWorker(room,`worker${i}`);c.body=Array(3).fill(['work','carry','move']).flat().map(type=>({type,hits:100}));}
 for(let i=0;i<2;i++){const c=h.addWorker(room,`haul${i}`);c.memory.role='hauler';c.body=Array(10).fill(['carry','move']).flat().map(type=>({type,hits:100}));}
 budget.update(colony(),record);const idle=record.budget;
 for(let i=0;i<40;i++)barrier(`wall${i}`,'constructedWall',1);
 for(let i=0;i<4;i++)barrier(`gate${i}`,'rampart',1,31+i,31);
 budget.update(colony(),record);const work=record.budget;
 assert.equal(work.rampartUpkeep,0.12);assert.equal(work.fortificationHits,1000000);
 assert.equal(work.desiredEngineerWork,15);assert.ok(work.engineerWork>0 && work.engineerWork<=15);assert.ok(work.remoteTarget>idle.remoteTarget);
 assert.ok(work.remoteTarget<=4);assert.equal(work.reserveFloor,50000);
 bank.store.energy=17000;budget.update(colony(),record);assert.equal(record.budget.engineerWork,1);
 assert.equal(record.budget.reason,'RESERVE_RECOVERY');assert.ok(record.budget.reserveRecovery>0);
 for(const s of colony().structures)if(s.structureType==='rampart')s.hits=100000;
 budget.update(colony(),record);assert.equal(record.budget.engineerWork,0);
});
test('engineers save fragile ramparts before sites and retain a wall target through memory reset',()=>{
 const {h,colony,record,barrier,engineer,memory,objects,room}=world();
 const wall=barrier('wall','constructedWall',10000),gate=barrier('gate','rampart',1),c=engineer('engineer',50);
 objects[h.constants.FIND_MY_CONSTRUCTION_SITES]=[{id:'site',structureType:'extension',pos:position(20,21,room.name),progress:0,progressTotal:3000}];
 h.load('economy.budget').update(colony(),record);
 const run=()=>h.load('economy.engineer').run(c,colony(),h.Memory.enclave.block,new Map());
 run();assert.equal(c.calls[0].action,'repair');assert.equal(c.calls[0].target,gate);
 gate.hits=100000;c.calls=[];run();assert.equal(c.calls[0].action,'build');
 objects[h.constants.FIND_MY_CONSTRUCTION_SITES]=[];c.calls=[];run();assert.equal(c.memory.workTarget,wall.id);
 barrier('new-wall','constructedWall',9000);h.reset();c.calls=[];run();assert.equal(c.calls[0].target,wall);
});
test('engineer storage withdrawals share reservations and routine repairs pause at reserve floor',()=>{
 const {h,colony,record,barrier,engineer,memory,bank}=world();barrier('wall','constructedWall',1000);
 h.load('economy.budget').update(colony(),record);bank.store.energy=record.budget.reserveFloor+25;
 const a=engineer('a'),b=engineer('b'),reservations=new Map();
 const run=c=>h.load('economy.engineer').run(c,colony(),memory.block,reservations);
 run(a);run(b);assert.equal(a.calls[0].amount,25);assert.equal(b.calls.length,0);assert.equal(b.memory.task,'ENGINEER_RESERVE_PAUSE');
 barrier('gate','rampart',1);run(b);assert.equal(b.calls[0].action,'withdraw');
});
test('tower attacks beat emergency repairs and repairs retain a tower energy reserve',()=>{
 const {h,colony,barrier,objects}=world(),gate=barrier('gate','rampart',1),calls=[];
 const tower={id:'tower',my:true,structureType:'tower',store:store(1000,1000),attack:t=>calls.push(['attack',t.id]),repair:t=>calls.push(['repair',t.id])};
 objects[h.constants.FIND_STRUCTURES].push(tower);
 h.load('defense.basic').run(colony());assert.deepEqual(calls,[['repair','gate']]);
 calls.length=0;objects[h.constants.FIND_HOSTILE_CREEPS]=[{id:'enemy',hits:100}];h.load('defense.basic').run(colony());assert.deepEqual(calls,[['attack','enemy']]);
 calls.length=0;objects[h.constants.FIND_HOSTILE_CREEPS]=[];tower.store.energy=499;h.load('defense.basic').run(colony());assert.equal(calls.length,0);
});
test('link transfer respects cooldown, receiver capacity, and survives serialized plan reset',()=>{
 const {h,colony,record,link,room}=world(),hub=link('hub',24,23,800),receiver=link('receiver',11,10,700);
 record.links={hub:{x:24,y:23},controller:{x:11,y:10},status:'BUILT'};
 h.load('economy.links').run(colony(),record);assert.equal(hub.calls[0].amount,100);assert.equal(hub.calls[0].target,receiver);
 hub.calls=[];hub.cooldown=1;h.load('economy.links').run(colony(),record);assert.equal(hub.calls.length,0);
 hub.cooldown=0;receiver.store.energy=800;h.load('economy.links').run(colony(),record);assert.equal(hub.calls.length,0);
 h.reset();receiver.store.energy=0;h.load('economy.links').run(colony(),h.Memory.enclave.colonies[room.name]);assert.equal(hub.calls[0].amount,800);
});
test('distributor supplies hub after spawn and tower demand; adjacent workers withdraw receiver energy once',()=>{
 const {h,colony,record,link,room,spawn,memory,at}=world(),hub=link('hub',24,23),receiver=link('receiver',11,10,80);
 record.links={hub:{x:24,y:23},controller:{x:11,y:10},status:'BUILT'};
 const distributor=h.addWorker(room,'distributor',50);distributor.memory.role='distributor';
 const run=()=>h.load('economy.hauler').run(distributor,colony(),memory.block,new Map());
 run();assert.equal(distributor.calls[0].target,hub);
 spawn.store.energy=0;distributor.calls=[];run();assert.equal(distributor.calls[0].target,spawn);
 spawn.store.energy=300;
 for(const role of ['miner','hauler']){const c=h.addWorker(room,role);c.memory.role=role;}
 h.load('economy.stations').forWorker=()=>null;
 const a=h.addWorker(room,'a'),b=h.addWorker(room,'b');a.pos=at(11,11);b.pos=at(12,10);
 const reservations=new Map();h.load('economy.worker').run(a,colony(),memory.block,reservations);h.load('economy.worker').run(b,colony(),memory.block,reservations);
 assert.equal(a.memory.task,'LINK_WITHDRAW');assert.equal(a.calls[0].amount,50);assert.equal(b.calls[0].amount,30);
});
test('RCL5 link planner places at most two links and checks their combined access',()=>{
 const {h,colony,record,room,controller,link}=world();let combined=false;
 const legal=(c,x,y)=>{if(c.sites.some(s=>s.structureType==='link'))combined=true;return true;};
 controller.level=4;assert.equal(h.load('planning.links').run(colony(),record,legal,()=>true),false);
 controller.level=5;h.load('planning.links').run(colony(),record,legal,()=>true);assert.equal(room.siteCalls.length,1);assert.ok(combined);
 const p=room.siteCalls[0];link('hub',p.x,p.y);h.load('planning.links').run(colony(),record,legal,()=>true);
 const q=room.siteCalls[1];link('receiver',q.x,q.y);h.load('planning.links').run(colony(),record,legal,()=>true);
 assert.equal(room.siteCalls.length,2);assert.equal(record.links.status,'BUILT');
});
test('engineering spawn demand counts pending WORK and preserves emergency source hauling priority',()=>{
 const {h,colony,record,engineer}=world();record.budget={engineerWork:5};
 const plan={sources:[],workerWork:0};const req=()=>h.load('economy.production').request(colony(),plan);
 // Cover the distributor before checking engineer requests.
 const distributor=engineer('distributor');distributor.memory.role='distributor';
 assert.equal(req().role,'engineer');assert.equal(req().body.filter(p=>p==='work').length,5);
 const c=engineer('engineer');c.body=Array.from({length:5},()=>({type:'work',hits:100}));c.spawning=true;
 assert.equal(req(),null);
 plan.sources=[{id:'source',reachable:true,work:5,carry:4,travel:10,slots:1}];
 const miner=engineer('miner');miner.memory.role='miner';miner.memory.sourceId='source';miner.body=Array.from({length:5},()=>({type:'work',hits:100}));
 assert.equal(req().role,'hauler');
});
test('reserve trend and budget output match across memory serialization and global resets',()=>{
 const run=reset=>{const {h,colony,record,bank,room}=world();const trace=[];
 for(let i=0;i<4;i++){h.Game.time=1+i*500;bank.store.energy-=1000;if(reset)h.reset();h.load('economy.budget').update(colony(),h.Memory.enclave.colonies[room.name]);trace.push(JSON.parse(JSON.stringify(h.Memory.enclave.colonies[room.name].budget)));}return trace;};
 assert.deepEqual(run(false),run(true));assert.equal(run(false)[3].stockDeltaPerTick,-2);
});

test('engineers bring every new wall to a minimum tier before deeply fortifying one wall',()=>{
 const {h,colony,record,barrier,engineer,memory}=world();
 const a=barrier('a','constructedWall',4999),b=barrier('b','constructedWall',1),c=engineer('engineer',50);
 c.memory.workTarget=a.id;h.load('economy.budget').update(colony(),record);
 const run=()=>h.load('economy.engineer').run(c,colony(),memory.block,new Map());
 run();assert.equal(c.calls[0].target,a);a.hits=5000;c.calls=[];run();assert.equal(c.calls[0].target,b);
 b.hits=5000;c.calls=[];run();assert.equal(c.calls[0].target,b); // Continue to the next common tier.
});

test('indestructible system walls never poison defense budgets or become engineer targets',()=>{
 const {h,colony,record,barrier,engineer,memory}=world();
 const system=barrier('system','constructedWall',undefined);delete system.hits;delete system.hitsMax;
 const wall=barrier('normal','constructedWall',1000),c=engineer('engineer',50);
 h.load('economy.budget').update(colony(),record);assert.ok(Number.isFinite(record.budget.fortificationEnergy));
 h.load('economy.engineer').run(c,colony(),memory.block,new Map());assert.equal(c.calls[0].target,wall);
});

test('empty upgraders approach the receiver and do not bounce back to their station before withdrawing',()=>{
 const {h,colony,record,link,room,memory,at}=world();link('hub',24,23,800);const receiver=link('receiver',11,10,800);
 record.links={hub:{x:24,y:23},controller:{x:11,y:10},status:'BUILT'};
 for(const role of ['miner','hauler']){const c=h.addWorker(room,role);c.memory.role=role;}
 const c=h.addWorker(room,'consumer');c.pos=at(12,12);c.actionResults.withdraw=-9;
 h.load('economy.stations').forWorker=()=>at(12,12);
 const run=()=>h.load('economy.worker').run(c,colony(),memory.block,new Map());
 run();assert.equal(c.memory.task,'LINK_WITHDRAW');assert.equal(c.calls[0].action,'withdraw');assert.equal(c.calls[0].target,receiver);
 c.pos=at(11,11);c.calls=[];c.actionResults.withdraw=0;run();assert.equal(c.calls[0].action,'withdraw');assert.ok(!c.calls.some(a=>a.action==='move'));
});

test('new engineers can sustain loaded movement on plains within the available spawn budget',()=>{
 for(const capacity of [300,550,800,1800]){
  const {h,colony,record,engineer,room}=world();room.energyCapacityAvailable=capacity;record.budget={engineerWork:5};
  engineer('distributor').memory.role='distributor';
  const request=h.load('economy.production').request(colony(),{sources:[],workerWork:0});assert.equal(request.role,'engineer');
  const count=part=>request.body.filter(p=>p===part).length;
  const loadedWeight=count('work')+count('carry'),recovery=count('move')*2;
  assert.ok(recovery>=loadedWeight*2,`loaded plains movement at capacity ${capacity}`);
  assert.ok(count('work')>0 && count('work')<=5);assert.equal(count('carry'),count('work'));
  assert.ok(request.body.reduce((sum,p)=>sum+h.constants.BODYPART_COST[p],0)<=capacity);
 }
});

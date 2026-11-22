'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position, store } = require('./harness');

function setup() {
  const h = harness(), home = h.addRoom('E23S47', {level:4});
  const storage = home.room.storage = {id:'bank',my:true,structureType:'storage',pos:position(27,25,home.room.name),store:store(0,1000000)};
  home.objects[h.constants.FIND_STRUCTURES].push(storage);
  const worker = h.addWorker(home.room,'worker',90);
  worker.body = ['work','work','work','carry','carry','carry','move','move','move'].map(type=>({type,hits:100}));
  worker.store = store(90,150);
  const hauler = h.addWorker(home.room,'hauler',500);
  hauler.memory.role='hauler';hauler.memory.sourceId=home.objects[h.constants.FIND_SOURCES][0].id;
  hauler.store=store(500,550);
  const run=(creep=hauler,jobs=new Map())=>h.load('economy.hauler').run(creep,h.load('colony.snapshot').create(home.room),h.Memory.enclave.block,jobs);
  h.load('core.memory').initialize();
  return {h,home,storage,worker,hauler,run};
}

test('haulers bank loads while upgraders still have a working energy buffer',()=>{
  const {storage,hauler,run}=setup();run();
  assert.equal(hauler.calls[0].action,'transfer');assert.equal(hauler.calls[0].target,storage);assert.equal(hauler.calls[0].amount,500);
});

test('a low upgrader gets a bounded refill, then the remaining cargo reaches storage across ticks and reset',()=>{
  const {h,storage,worker,hauler,run}=setup();worker.store.energy=40;run();
  assert.equal(hauler.calls[0].target,worker);assert.equal(hauler.calls[0].amount,50);
  worker.store.energy+=hauler.calls[0].amount;hauler.store.energy-=hauler.calls[0].amount;
  for(let i=0;i<3;i++){
    worker.store.energy-=3;h.Game.time++;h.reset();hauler.calls=[];hauler.actionResults.transfer=-9;run();
    assert.equal(hauler.calls[0].target,storage,'normal controller spending must not retarget the load back to its consumer');
  }
  hauler.calls=[];hauler.actionResults.transfer=0;run();assert.equal(hauler.calls[0].amount,450);
});

test('storage is not withdrawn merely to top up a buffered upgrader',()=>{
  const {storage,hauler,run}=setup();storage.store.energy=1000;hauler.store.energy=0;run();
  assert.ok(!hauler.calls.some(c=>c.action==='withdraw'));
});

test('source gaps withdraw only current home demand and still supply an empty worker',()=>{
  const {storage,worker,hauler,run}=setup();storage.store.energy=1000;worker.store.energy=0;hauler.store.energy=0;run();
  assert.equal(hauler.calls[0].action,'withdraw');assert.equal(hauler.calls[0].amount,90);
  hauler.store.energy=90;hauler.calls=[];run();assert.equal(hauler.calls[0].target,worker);assert.equal(hauler.calls[0].amount,90);
});

test('spawn and tower deficits remain ahead of storage',()=>{
  const {h,home,hauler,run}=setup();home.spawn.store.energy=250;run();assert.equal(hauler.calls[0].target,home.spawn);
  home.spawn.store.energy=300;hauler.calls=[];
  const tower={id:'tower',structureType:'tower',my:true,pos:position(26,26,home.room.name),store:store(999,1000)};
  home.objects[h.constants.FIND_STRUCTURES].push(tower);run();assert.equal(hauler.calls[0].target,tower);assert.equal(hauler.calls[0].amount,1);
});

test('builders and urgent controller protection retain full consumer refills',()=>{
  const {h,home,worker,hauler,run}=setup();
  home.objects[h.constants.FIND_MY_CONSTRUCTION_SITES]=[{id:'site',structureType:'extension',pos:position(28,27,home.room.name)}];
  run();assert.equal(hauler.calls[0].target,worker);assert.equal(hauler.calls[0].amount,60);
  home.objects[h.constants.FIND_MY_CONSTRUCTION_SITES]=[];home.controller.ticksToDowngrade=100;hauler.calls=[];
  run();assert.equal(hauler.calls[0].target,worker);assert.equal(hauler.calls[0].amount,60);
});

for(const condition of ['absent','unowned','full']) test(`without usable storage (${condition}), haulers retain full worker refills`,()=>{
  const {home,storage,worker,hauler,run}=setup();
  if(condition==='absent')delete home.room.storage;
  if(condition==='unowned')storage.my=false;
  if(condition==='full')storage.store.energy=1000000;
  run();assert.equal(hauler.calls[0].target,worker);assert.equal(hauler.calls[0].amount,60);
});

test('multiple carriers reserve only the worker buffer and bank the next load',()=>{
  const {h,home,storage,worker,hauler,run}=setup();worker.store.energy=40;
  const other=h.addWorker(home.room,'hauler2',50);other.memory.role='hauler';other.memory.sourceId=hauler.memory.sourceId;
  const jobs=new Map();run(hauler,jobs);run(other,jobs);
  assert.equal(hauler.calls[0].amount,50);assert.equal(other.calls[0].target,storage);
});


test('a distributor withdraws storage for workers even while both sources have dropped energy',()=>{
  const {h,home,storage,worker,hauler}=setup();
  hauler.memory.role='distributor';delete hauler.memory.sourceId;hauler.store.energy=0;storage.store.energy=3000;worker.store.energy=0;
  home.objects[h.constants.FIND_DROPPED_RESOURCES]=[{id:'source-drop',resourceType:'energy',amount:500,pos:position(20,20,home.room.name)}];
  const run=()=>h.load('economy.worker').run(hauler,h.load('colony.snapshot').create(home.room),h.Memory.enclave.block,new Map());
  run();assert.equal(hauler.calls[0].action,'withdraw');assert.equal(hauler.calls[0].target,storage);
  hauler.store.energy=hauler.calls[0].amount;hauler.calls=[];h.reset();run();
  assert.equal(hauler.calls[0].action,'transfer');assert.equal(hauler.calls[0].target,worker);assert.equal(hauler.calls[0].amount,90);
});

test('owned storage requests one distributor and counts pending replacements',()=>{
  const {h,home,storage,hauler}=setup();home.room.energyCapacityAvailable=1300;storage.store.energy=3000;
  const request=()=>h.load('economy.production').request(h.load('colony.snapshot').create(home.room),{sources:[],workerWork:0});
  assert.equal(request()?.role,'distributor');assert.equal(request().body.length,12);
  hauler.memory.role='distributor';hauler.spawning=true;assert.equal(request(),null);
  hauler.spawning=false;hauler.ticksToLive=1;assert.equal(request()?.role,'distributor');
});

test('a distributor idles safely after storage loss and never harvests a source',()=>{
  const {h,home,hauler}=setup();hauler.memory.role='distributor';delete hauler.memory.sourceId;hauler.store.energy=0;delete home.room.storage;
  h.load('economy.worker').run(hauler,h.load('colony.snapshot').create(home.room),h.Memory.enclave.block,new Map());
  assert.ok(!hauler.calls.some(c=>['harvest','upgradeController','pickup'].includes(c.action)));
  assert.equal(hauler.memory.task,'DISTRIBUTOR_WAIT_STORAGE');
});


test('storage distributors refill spawn and tower before workers and avoid duplicate withdrawals',()=>{
  const {h,home,storage,worker,hauler,run}=setup();hauler.memory.role='distributor';delete hauler.memory.sourceId;
  home.spawn.store.energy=250;run();assert.equal(hauler.calls[0].target,home.spawn);
  home.spawn.store.energy=300;hauler.calls=[];
  const tower={id:'tower',structureType:'tower',my:true,pos:position(26,26,home.room.name),store:store(900,1000)};
  home.objects[h.constants.FIND_STRUCTURES].push(tower);run();assert.equal(hauler.calls[0].target,tower);
  tower.store.energy=1000;worker.store.energy=0;storage.store.energy=1000;hauler.store.energy=0;hauler.calls=[];
  const other=h.addWorker(home.room,'distributor2',0);other.memory.role='distributor';
  const jobs=new Map();run(hauler,jobs);run(other,jobs);
  assert.equal(hauler.calls[0].amount,550);assert.ok(!other.calls.some(c=>c.action==='withdraw'));
});


test('a distributor keeps spare cargo ready between worker refills instead of returning it to storage',()=>{
  const {worker,hauler,run}=setup();hauler.memory.role='distributor';delete hauler.memory.sourceId;
  run();assert.ok(!hauler.calls.some(c=>c.action==='transfer'));assert.equal(hauler.memory.task,'DISTRIBUTOR_WAIT_DEMAND');
  worker.store.energy=40;hauler.calls=[];run();assert.equal(hauler.calls[0].target,worker);assert.equal(hauler.calls[0].amount,50);
});

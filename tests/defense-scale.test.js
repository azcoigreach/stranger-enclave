'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');
function world(level=5){
 const h=harness(),home=h.addRoom('E21S31',{level});home.room.energyCapacityAvailable=1800;
 const bank={id:'bank',my:true,structureType:'storage',pos:position(24,24,home.room.name),store:store(300000,1000000)};
 home.room.storage=bank;home.objects[h.constants.FIND_STRUCTURES].push(bank);
 const mem=h.load('core.memory').initialize(),record=mem.colonies[home.room.name]={staffing:{requiredWorkerWork:15}};
 const colony=()=>h.load('colony.snapshot').create(home.room);
 const barrier=(id,hits,type='constructedWall',hitsMax=300000000)=>{const s={id,my:true,structureType:type,hits,hitsMax,pos:position(30+home.objects[h.constants.FIND_STRUCTURES].length,30,home.room.name)};home.objects[h.constants.FIND_STRUCTURES].push(s);return s;};
 const budget=()=>h.load('economy.budget').update(colony(),h.Memory.enclave.colonies[home.room.name]);
 return{h,...home,bank,record,colony,barrier,budget,mem};
}
test('RCL4-8 defense targets increase toward the engine maximum with rising reserves',()=>{
 let previous=0,previousReserve=0;
 for(const [level,goal] of [[4,100000],[5,1000000],[6,5000000],[7,20000000],[8,300000000]]){
  const w=world(level);w.barrier('wall',1);w.budget();const b=w.record.budget;
  assert.equal(b.fortificationHits,goal);assert.ok(b.fortificationHits>previous);assert.ok(b.reserveFloor>=previousReserve);assert.ok(b.reserveTarget>b.reserveFloor);
  previous=b.fortificationHits;previousReserve=b.reserveFloor;
 }
});
test('higher wall targets do not authorize spending energy needed for reserves and home consumption',()=>{
 const w=world(8);w.barrier('wall',1);w.record.economy={lastWindow:{ticks:300,harvested:3000}};w.budget();
 w.bank.store.energy=w.record.budget.reserveFloor+1;w.budget();
 assert.equal(w.record.budget.engineerWork,0);assert.ok(w.record.budget.desiredEngineerWork>0);
 assert.ok(w.record.budget.remoteTarget>1);assert.ok(w.record.budget.remoteShortfall>0);
});
test('a weak barrier is raised through shared milestones before repairing a stronger saved target',()=>{
 const w=world(6),weak=w.barrier('weak',500001),high=w.barrier('high',1200000),c=w.h.addWorker(w.room,'engineer',50);
 c.memory.role='engineer';c.memory.workTarget=high.id;w.budget();w.h.load('economy.engineer').run(c,w.colony(),w.mem.block,new Map());
 assert.equal(c.calls[0].target.id,weak.id);
});
test('RCL8 repairs continue toward actual structure hitsMax and stop at it',()=>{
 const w=world(8),wall=w.barrier('wall',300000000,'constructedWall',350000000),c=w.h.addWorker(w.room,'engineer',50);c.memory.role='engineer';w.budget();
 w.h.load('economy.engineer').run(c,w.colony(),w.mem.block,new Map());assert.equal(c.calls[0]?.action,'repair');assert.equal(c.calls[0].target,wall);
 wall.hits=wall.hitsMax;c.calls=[];w.budget();w.h.load('economy.engineer').run(c,w.colony(),w.mem.block,new Map());assert.equal(c.calls.length,0);
});
test('rampart targets respect actual RCL hit limits and decay is budgeted independently of strength',()=>{
 const w=world(6),ramp=w.barrier('ramp',999999,'rampart',1000000);w.budget();assert.equal(w.record.budget.fortificationEnergy,0.01);assert.equal(w.record.budget.rampartUpkeep,0.03);
 ramp.hits=1000000;w.budget();assert.equal(w.record.budget.fortificationEnergy,0);assert.equal(w.record.budget.rampartUpkeep,0.03);
});
test('only active measured remote income funds spending and zero delivery is not positive profit',()=>{
 const w=world();w.barrier('wall',1);w.record.expansion={remotes:[{room:'E22S31',reason:'ACTIVE',travel:25,carry:12,deliverySample:{rate:8}},{room:'E20S31',reason:'UNSAFE_REMOTE',travel:25,carry:12,deliverySample:{rate:10}}]};w.budget();
 assert.ok(w.record.budget.activeRemoteIncome>0&&w.record.budget.activeRemoteIncome<8);
 assert.ok(w.h.load('economy.budget').remoteNet({travel:25,carry:12,deliverySample:{rate:0}})<0);
});
test('defense funding is stable across serialized memory and global resets',()=>{
 const run=reset=>{const w=world(7);w.barrier('wall',100000);const trace=[];
  for(let i=0;i<3;i++){w.h.Game.time=1+i*500;w.bank.store.energy-=10000;if(reset)w.h.reset();w.budget();trace.push(JSON.parse(JSON.stringify(w.h.Memory.enclave.colonies[w.room.name].budget)));}return trace;};
 assert.deepEqual(run(false),run(true));
});

test('existing engineers pause routine withdrawals when defense funding is zero but still save fragile ramparts',()=>{
 const w=world(8);w.barrier('wall',1);w.record.economy={lastWindow:{ticks:300,harvested:3000}};w.budget();w.bank.store.energy=w.record.budget.reserveFloor+10000;w.budget();
 const c=w.h.addWorker(w.room,'engineer');c.memory.role='engineer';assert.equal(w.record.budget.engineerWork,0);
 const run=()=>w.h.load('economy.engineer').run(c,w.colony(),w.mem.block,new Map());
 run();assert.equal(c.calls.length,0);assert.equal(c.memory.task,'ENGINEER_FUNDING_PAUSE');
 w.barrier('gate',1,'rampart');run();assert.equal(c.calls[0]?.action,'withdraw');
});

test('new remote income estimates drive expansion but do not fund spending before measured delivery',()=>{
 const w=world();w.barrier('wall',1);w.record.expansion={remotes:[{room:'E22S31',reason:'ACTIVE',travel:25,carry:12,deliverySample:{rate:-1}}]};w.budget();
 assert.ok(w.record.expansion.remotes[0].netIncome>0);assert.equal(w.record.budget.activeRemoteIncome,0);
});

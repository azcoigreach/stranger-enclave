'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position}=require('./harness');
function world(){const h=harness(),home=h.addRoom('E23S47',{level:5});return {h,...home,block:h.load('territory.policy').blockFor(home.room.name)};}
test('formation recovery does not reverse a traveler crossing a reserved controller station',()=>{
 for(const reset of [false,true]){
  const w=world(),c=w.h.addWorker(w.room,'engineer',50);c.memory.role='engineer';c.pos=position(11,11,w.room.name);
  c.memory.moveGoal={x:15,y:20,roomName:w.room.name,range:3,tick:w.h.Game.time-1};
  if(reset)w.h.reset();
  w.h.load('economy.stations').layout=()=>({positions:[{x:11,y:11}],lanes:[]});
  const reservations=new Map();w.h.load('movement.controller').run(w.h.load('colony.snapshot').create(w.room),w.block,reservations);
  assert.equal(c.calls.length,0);assert.equal(reservations.has(`traffic:${c.id}`),false);
 }
});
test('all remote crews reject partial routes instead of walking into their endpoint',()=>{
 for(const role of ['remoteMiner','remoteHauler','reserver']){
  const w=world(),c=w.h.addWorker(w.room,role);c.memory.role=role;
  const memory={block:w.block,intel:{[w.room.name]:{owner:'test'},E24S47:{lastSeen:1,hostileUntil:0,owner:null}},colonies:{}};
  w.h.Game.map.findRoute=()=>[{room:'E24S47',exit:3}];
  w.h.context.PathFinder.search=()=>({incomplete:true,path:[position(5,19,w.room.name)],cost:30});
  assert.equal(w.h.load('movement.remote').travel(c,'E24S47',memory),-2);assert.equal(c.calls.length,0);
 }
});
test('opposing mobile engineers coordinate a passage without overwriting the displaced move',()=>{
 const w=world(),a=w.h.addWorker(w.room,'a',50),b=w.h.addWorker(w.room,'b',50);
 a.memory.role=b.memory.role='engineer';a.pos=position(20,20,w.room.name);b.pos=position(21,20,w.room.name);
 a.memory.task=b.memory.task='ENGINEER_FORTIFY';b.memory.moveGoal={x:10,y:20,roomName:w.room.name,range:3,tick:1};
 w.objects[w.h.constants.FIND_CREEPS]=[a,b];w.h.load('economy.stations').blockStations=()=>{};
 a.pos.findPathTo=(target,opts)=>opts.ignoreCreeps?[{x:21,y:20},{x:22,y:20},{x:23,y:20}]:[];
 const movement=w.h.load('movement.local');assert.equal(movement.move(a,position(26,20,w.room.name),3,w.block),0);
 assert.ok(b.calls.some(c=>c.action==='step'));
 const count=b.calls.length;movement.move(b,position(10,20,w.room.name),3,w.block);assert.equal(b.calls.length,count);
});
test('a stalled carrier gets a checked complete route rather than repeatedly accepting partial moveTo paths',()=>{
 const w=world(),c=w.h.addWorker(w.room,'carrier',50);c.memory.role='hauler';c.pos=position(20,20,w.room.name);
 c.memory.motion={x:20,y:20,tick:0,stuck:2};
 c.pos.findPathTo=()=>[{x:21,y:20},{x:22,y:20},{x:23,y:20}];w.h.load('economy.stations').blockStations=()=>{};
 assert.equal(w.h.load('movement.local').move(c,position(24,20,w.room.name),1,w.block),0);
 assert.ok(c.calls.some(c=>c.action==='path'));
});
test('transit yielding preserves immobile workers, owned work stations, and global-reset behavior',()=>{
 for(const blocked of ['fatigue','miner','atGoal','held','reset']){
  const w=world(),a=w.h.addWorker(w.room,'a',50),b=w.h.addWorker(w.room,'b',50);
  a.pos=position(20,20,w.room.name);b.pos=position(21,20,w.room.name);b.memory.role='engineer';
  b.memory.moveGoal={x:10,y:20,roomName:w.room.name,range:3,tick:1};
  if(blocked==='fatigue')b.fatigue=1;
  if(blocked==='miner')b.memory.role='miner';
  if(blocked==='atGoal')b.memory.moveGoal.x=21;
  if(blocked==='held')w.h.load('movement.yield').hold(b);
  if(blocked==='reset')w.h.reset();
  const result=w.h.load('movement.yield').pass(a,b.pos);
  assert.equal(result,blocked==='reset');assert.equal(b.calls.length,blocked==='reset'?1:0);
 }
});
test('remote paths avoid a stationary creep and recalculate when a cached next step becomes blocked',()=>{
 const w=world(),c=w.h.addWorker(w.room,'scout'),b=w.h.addWorker(w.room,'stationary');c.memory.role='scout';
 c.pos=position(20,20,w.room.name);b.pos=position(21,20,w.room.name);
 const memory={block:w.block,intel:{},colonies:{}};w.h.Game.map.findRoute=()=>[{room:'E24S47',exit:3}];
 let searches=0;
 w.h.context.PathFinder.search=(origin,goal,opts)=>{
  searches++;const matrix=opts.roomCallback(w.room.name);assert.equal(matrix.get(b.pos.x,b.pos.y),255);
  return {incomplete:false,cost:10,path:[position(21,19,w.room.name),position(2,20,'E24S47')]};
 };
 const movement=w.h.load('movement.remote');assert.equal(movement.travel(c,'E24S47',memory,true),0);
 assert.equal(c.calls[0].path[0].y,19);w.h.Game.time++;b.pos=position(21,19,w.room.name);
 w.h.context.PathFinder.search=(origin,goal,opts)=>{searches++;assert.equal(opts.roomCallback(w.room.name).get(21,19),255);return {incomplete:false,cost:12,path:[position(21,21,w.room.name),position(2,20,'E24S47')]};};
 assert.equal(movement.travel(c,'E24S47',memory,true),0);assert.equal(searches,2);assert.equal(c.calls.at(-1).path[0].y,21);
});
test('waiting remote crews park away from storage approaches and retain parking across resets',()=>{
 for(const reset of [false,true]){
  const w=world(),c=w.h.addWorker(w.room,'waiting');c.memory.role='remoteHauler';c.pos=position(25,24,w.room.name);
  const anchor=position(25,25,w.room.name),memory={block:w.block,colonies:{},intel:{}};
  if(reset)w.h.reset();
  w.h.load('movement.remote').park(c,anchor,memory);
  const target=c.calls.at(-1)?.target;assert.ok(target);assert.ok(target.getRangeTo(anchor)>=3);
  const first={x:target.x,y:target.y};w.h.reset();c.calls=[];w.h.load('movement.remote').park(c,anchor,memory);
  assert.deepEqual({x:c.calls.at(-1).target.x,y:c.calls.at(-1).target.y},first);
 }
});
test('two-tile oscillation triggers complete routing and recovery persists after a successful step',()=>{
 const w=world(),c=w.h.addWorker(w.room,'hauler',50);c.memory.role='hauler';w.h.load('economy.stations').blockStations=()=>{};
 const movement=w.h.load('movement.local'),goal=position(25,20,w.room.name);
 const put=x=>{c.pos=position(x,20,w.room.name);c.pos.findPathTo=()=>Array.from({length:24-x},(_,i)=>({x:x+i+1,y:20}));};
 for(const x of [20,21,20,21]){put(x);movement.move(c,goal,1,w.block);w.h.Game.time++;}
 assert.equal(c.calls.at(-1).action,'path');
 put(22);movement.move(c,goal,1,w.block);assert.equal(c.calls.at(-1).action,'path');
});

test('a scout can leave a one-tile passage blocked by a funding-paused engineer',()=>{
  const w=world();
  const scout=w.h.addWorker(w.room,'scout'), engineer=w.h.addWorker(w.room,'engineer');
  scout.memory.role='scout';
  engineer.memory.role='engineer';
  engineer.memory.task='ENGINEER_FUNDING_PAUSE';
  engineer.memory.moveGoal={x:30,y:20,roomName:w.room.name,range:1,tick:1};
  w.h.Game.time=150;
  scout.pos=position(20,22,w.room.name);
  engineer.pos=position(21,22,w.room.name);
  w.objects[w.h.constants.FIND_CREEPS]=[scout,engineer];
  w.room.getTerrain=()=>({get:(x,y)=>y===22 && x<=21 ? 0 : 1});
  w.h.Game.map.findRoute=()=>[{room:'E24S47',exit:3}];
  w.h.context.PathFinder.search=(_origin,_goal,opts)=>{
    const occupied=opts.roomCallback(w.room.name).get(21,22)===255;
    return {incomplete:occupied,cost:10,path:occupied?[]:[engineer.pos,position(2,20,'E24S47')]};
  };
  const memory={block:w.block,intel:{},colonies:{}};
  const travel=()=>w.h.load('movement.remote').travel(scout,'E24S47',memory,true);
  engineer.fatigue=1;
  assert.equal(travel(),w.h.constants.ERR_BUSY);
  assert.equal(engineer.calls.length,0);
  engineer.fatigue=0;
  w.h.Game.time++;
  assert.equal(travel(),w.h.constants.OK);
  assert.equal(scout.calls.at(-1).action,'step');
  assert.equal(engineer.calls.at(-1).action,'step');
  assert.ok(w.h.load('movement.yield').held(engineer));
});

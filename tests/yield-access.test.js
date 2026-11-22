'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');
function setup(){
 const h=harness(),home=h.addRoom('E23S47',{level:5}),at=(x,y)=>position(x,y,home.room.name);
 home.controller.pos=at(12,12);
 const link={id:'hub',my:true,structureType:'link',pos:at(12,10),store:store(0,800)};
 home.objects[h.constants.FIND_STRUCTURES].push(link);
 const carrier=h.addWorker(home.room,'carrier',50);carrier.memory.role='distributor';carrier.pos=at(10,10);
 carrier.pos.findPathTo=()=>[{x:11,y:10},{x:11,y:9}];
 const worker=h.addWorker(home.room,'worker',50);worker.pos=at(11,10);worker.memory.task='UPGRADE';
 const mem=h.load('core.memory').initialize();mem.colonies[home.room.name]={};
 const colony=()=>h.load('colony.snapshot').create(home.room);
 return{h,...home,at,link,carrier,worker,colony,mem};
}
test('a ranged worker yields while retaining work range, and cannot overwrite the coordinated access move',()=>{
 const {h,carrier,worker,link,colony,mem,controller}=setup();
 h.load('movement.local').move(carrier,link.pos,1,mem.block);
 assert.equal(carrier.calls[0].action,'step');assert.equal(worker.calls[0].action,'step');
 assert.equal(worker.memory.task,'YIELD_ADJACENT_ACCESS');
 const before=worker.calls.length;h.load('economy.worker').run(worker,colony(),mem.block,new Map());assert.equal(worker.calls.length,before);
 assert.ok(worker.memory.yieldUntil>h.Game.time);
});
test('fatigued workers and miners retain their tiles rather than receiving conflicting yield intents',()=>{
 for(const kind of ['fatigue','miner']){const {h,carrier,worker,link,mem}=setup();
 if(kind==='fatigue')worker.fatigue=1;else worker.memory.role='miner';
 h.load('movement.local').move(carrier,link.pos,1,mem.block);assert.ok(!worker.calls.some(c=>c.action==='step'));
 }
});
test('an engineer repairing from range yields to adjacent access without abandoning its repair target',()=>{
 const {h,carrier,worker,link,colony,mem,objects,at}=setup();
 const wall={id:'wall',structureType:'constructedWall',pos:at(12,12),hits:1000,hitsMax:300000000};objects[h.constants.FIND_STRUCTURES].push(wall);
 worker.memory.role='engineer';worker.memory.task='ENGINEER_FORTIFY';worker.memory.workTarget=wall.id;
 h.load('movement.local').move(carrier,link.pos,1,mem.block);assert.equal(worker.calls[0].action,'step');assert.equal(worker.memory.workTarget,'wall');
});
test('yield coordination permits a legal swap and does not survive the next tick or a global reset',()=>{
 const {h,carrier,worker,link,mem,room}=setup();room.getTerrain=()=>({get:(x,y)=>(x===10&&y===10)||(x===11&&y===10)?0:1});
 h.load('movement.local').move(carrier,link.pos,1,mem.block);assert.equal(worker.calls[0].direction,7);assert.equal(carrier.calls[0].direction,3);
 assert.equal(h.load('movement.yield').held(worker),true);h.Game.time++;assert.equal(h.load('movement.yield').held(worker),false);
 h.reset();assert.equal(h.load('movement.yield').held(worker),false);
});

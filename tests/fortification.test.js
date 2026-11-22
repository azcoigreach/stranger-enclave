'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,position,store}=require('./harness');
const terrain=require('./fixtures/controller-corridor.json'),footprint=require('./fixtures/rcl5-layout.json');
const plain=x=>JSON.parse(JSON.stringify(x));
function solve(h,walk,protect,width=50,height=50) {
 const cut=h.load('planning.cut'),search=cut.create(walk,protect,width,height);let result;
 for(let i=0;i<1000 && !search.done;i++) result=cut.advance(search,()=>true);
 assert.ok(search.done);return {search,result};
}
// Independent exhaustive oracle for small maps: enumerate every allowed barrier subset.
function reachable(walk,blocked,width,height) {
 const seen=new Set(),queue=[];
 for(let i=0;i<walk.length;i++) if(walk[i] && (i%width===0||i%width===width-1||i<width||i>=width*(height-1))) {seen.add(i);queue.push(i);}
 for(let i=0;i<queue.length;i++) {const p=queue[i];for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
  const x=p%width+dx,y=Math.floor(p/width)+dy,n=y*width+x;
  if(x<0||x>=width||y<0||y>=height||!walk[n]||blocked.has(n)||seen.has(n)) continue;
  seen.add(n);queue.push(n);
 }}return seen;
}
test('minimum cut matches exhaustive cardinality and maximum interior, including diagonal lanes',()=>{
 for(const rows of [[4],[3,4],[3,5]]) {
  const h=harness(),w=9,walk=Array(81).fill(false),protect=Array(81).fill(false);
  for(const y of rows) for(let x=0;x<=6;x++) walk[y*w+x]=true;
  for(const y of rows) protect[y*w+6]=true;
  const candidates=walk.flatMap((v,i)=>v&&!protect[i]&&i%w>=2&&i%w<7&&i>=18&&i<63?[i]:[]);
  let best=Infinity,outside=Infinity;
  for(let bits=0;bits<2**candidates.length;bits++) {
   const blocked=new Set(candidates.filter((_,i)=>bits&(1<<i)));if(blocked.size>best)continue;
   const seen=reachable(walk,blocked,w,w);if([...seen].some(i=>protect[i]))continue;
   if(blocked.size<best){best=blocked.size;outside=seen.size;}else outside=Math.min(outside,seen.size);
  }
  const {result}=solve(h,walk,protect,w,w);
  assert.equal(result.length,best);assert.equal(reachable(walk,new Set(result),w,w).size,outside);
 }
});
test('uncuttable protected exits fail safely; CPU deferral emits no partial cut',()=>{
 const h=harness(),cut=h.load('planning.cut'),walk=Array(81).fill(false),protect=Array(81).fill(false);
 for(let x=0;x<7;x++)walk[36+x]=true;protect[42]=true;
 const search=cut.create(walk,protect,9,9);assert.equal(cut.advance(search,()=>false),null);assert.equal(search.flow,0);
 const result=cut.advance(search,()=>true);assert.deepEqual(Array.from(result),[38]);
 protect[36]=true;assert.equal(solve(h,walk,protect,9,9).search.failed,true);
});
const {world}=require('./world-rcl5');
test('real terrain perimeter blocks all hostile approaches and preserves friendly exits and buildings',()=>{
 const {h,colony,record}=world(),p=h.load('planning.perimeter'),c=colony();
 for(let i=0;i<100&&!record.perimeter;i++)p.plan(c,record,()=>true);
 assert.ok(record.perimeter,'a valid perimeter must exist');
 const plan=record.perimeter,facts=p.geometry(c),barriers=new Set(plan.tiles.map(p=>p.y*50+p.x));
 const outside=reachable(facts.walk,barriers,50,50);assert.ok(![...outside].some(i=>facts.protectedCells[i]));
 const grid=h.load('planning.grid'),walls=new Set(plan.tiles.filter(p=>p.type==='constructedWall').map(p=>p.y*50+p.x));
 const original=grid.flood(facts.friendly,facts.starts),friendly=grid.flood(facts.friendly,facts.starts,walls);
 for(const exit of facts.exits.filter(i=>original.has(i)))assert.ok(friendly.has(exit));
 assert.ok(plan.gates>0 && plan.gates<plan.cutSize);assert.ok(plan.cutSize<60);
 assert.equal(plan.cutSize,solve(h,facts.walk,facts.protectedCells).search.flow);
 for(const p of plan.tiles)assert.ok(p.x>=2&&p.x<=47&&p.y>=2&&p.y<=47);
});
test('perimeter starts at RCL4, survives memory reset, builds gates first and respects reserve floor',()=>{
 const {h,controller,colony,record,room}=world();controller.level=3;
 h.load('planning.perimeter').plan(colony(),record,()=>true);assert.equal(record.perimeter,undefined);
 controller.level=4;for(let i=0;i<100&&!record.perimeter;i++)h.load('planning.perimeter').plan(colony(),record,()=>true);
 const before=plain(record.perimeter);h.reset();const saved=h.Memory.enclave.colonies[room.name];
 h.load('planning.perimeter').plan(colony(),saved,()=>true);assert.deepEqual(plain(saved.perimeter),before);
 room.storage.store.energy=9999;assert.equal(h.load('planning.perimeter').build(colony(),saved,()=>true),false);
 room.storage.store.energy=200000;h.load('planning.perimeter').build(colony(),saved,()=>true);
 assert.equal(room.siteCalls.length,1);assert.equal(room.siteCalls[0].type,'rampart');
 assert.ok(saved.layout.buildings.some(b=>b.x===room.siteCalls[0].x&&b.y===room.siteCalls[0].y));
});
test('unfinished search restarts after global reset without changing the final plan',()=>{
 const a=world(),b=world();a.h.load('planning.perimeter').plan(a.colony(),a.record,()=>true);a.h.reset();
 const ar=a.h.Memory.enclave.colonies[a.room.name];
 for(let i=0;i<100&&!ar.perimeter;i++)a.h.load('planning.perimeter').plan(a.colony(),ar,()=>true);
 for(let i=0;i<100&&!b.record.perimeter;i++)b.h.load('planning.perimeter').plan(b.colony(),b.record,()=>true);
 assert.deepEqual(plain(ar.perimeter),plain(b.record.perimeter));
});

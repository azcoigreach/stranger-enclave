'use strict';
/** Optional, isolated real-engine intent checks. All world objects and bulk writes
 * live in this process. Never connects to the user's server or loads its config.
 * node tools/check-defense-engine.js /path/to/node_modules/@screeps/engine
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engine=path.resolve(process.argv[2]||'');
if(!fs.existsSync(path.join(engine,'src/processor/intents/creeps/attack.js')))throw new Error('Supply an installed @screeps/engine package directory');
process.env.ENCLAVE_ENGINE_ROOT=engine;
process.env.DRIVER_MODULE=require.resolve('./defense-engine-driver.cjs');
const C=require('./defense-engine-driver.cjs').constants;
const intent=name=>require(path.join(engine,'src/processor/intents',name));
const movement=intent('movement');
const {world,enemy}=require('../tests/defense-fixture');
const {position}=require('../tests/harness');
const results=[];
function scope(objects){
  let id=0;const roomObjects=Object.fromEntries(objects.map(o=>[o._id,o]));
  const s={roomObjects,roomTerrain:'0'.repeat(2500),gameTime:1,eventLog:[],roomInfo:{},
    bulk:{update(o,data){if(typeof o==='string')o=roomObjects[o];for(const [k,v] of Object.entries(data))o[k]=v&&typeof v==='object'&&!Array.isArray(v)?{...o[k],...v}:v;},remove(k){delete roomObjects[k];},insert(o){o._id=`created-${id++}`;roomObjects[o._id]=o;}}};
  return s;
}
function creep(id,body,user,x=20,y=20){return {_id:id,name:id,type:'creep',room:'W4N1',user,x,y,
  body:body.map(type=>({type,hits:100})),hits:body.length*100,hitsMax:body.length*100,store:{},storeCapacity:0,
  fatigue:0,ageTime:1501,_ticksToLive:1500,actionLog:{}};}
function begin(s){
  // Real processors receive new database objects each tick; transient effectiveness
  // fields must not survive our in-memory object reuse.
  for(const c of Object.values(s.roomObjects)){if(c.body)for(const p of c.body)delete p._oldHits;delete c._oldFatigue;}
  movement.init(s.roomObjects,s.roomTerrain);
}
function resolve(s){
  movement.check();for(const c of Object.values(s.roomObjects))if(c.type==='creep')intent('creeps/tick')(c,s);
  s.gameTime++;
}
// Tower decision uses the bot's actual observation/dispatcher; damage/energy are
// resolved by the installed engine, including falloff and creep body attrition.
{
  const w=world();enemy(w,w.home);w.home.objects[1].push({id:'tower',my:true,isActive:()=>true,structureType:'tower',pos:position(25,25,w.home.room.name),store:{getUsedCapacity:()=>1000}});
  w.update();assert.equal(w.h.Memory.enclave.defense.rooms[w.home.room.name].mode,'tower');
  const foe=creep('foe',['attack','move'],'2',45,45),tower={_id:'tower',type:'tower',user:'friendly',x:25,y:25,store:{energy:1000},actionLog:{}};
  const s=scope([foe,tower]);let ticks=0;
  while(s.roomObjects.foe&&ticks<10){begin(s);intent('towers/attack')(tower,{id:'foe'},s);resolve(s);ticks++;}
  assert.equal(s.roomObjects.foe,undefined);assert.equal(tower.store.energy,980);
  results.push({scenario:'tower-solvable invader',decision:'tower',resolvedTicks:ticks,energySpent:1000-tower.store.energy,hostileDestroyed:true});
}
// Exercise the bot's affordable counters against actual simultaneous hostile
// fire/healing. Conservative worst case: adjacent, no ramparts, no kiting credit.
for(const [label,foeBody] of [['unarmed raider',['work','carry','move']],['melee invader',['attack','move']],['healing player',['ranged_attack','heal','move','move']]]){
  const w=world();enemy(w,w.remote,foeBody,{owner:{username:label==='healing player'?'player':'Invader'}});w.observe();
  const profiles=w.h.Memory.enclave.intel[w.remote.room.name].hostiles;
  const body=w.h.load('defense.threat').bodyFor(1800,profiles,10);assert.ok(body,`${label}: affordable counter`);
  const guard=creep('guard',body,'friendly',21,20),foe=creep('foe',foeBody,'enemy');
  const s=scope([guard,foe]);let ticks=0;
  while(s.roomObjects.foe&&s.roomObjects.guard&&ticks<200){
    begin(s);
    // The actual role chooses intents using resolved damage/body state each tick.
    const actor=w.h.addWorker(w.remote.room,'guard');actor.body=guard.body;actor.hits=guard.hits;actor.hitsMax=guard.hitsMax;
    actor.pos=position(guard.x,guard.y,w.remote.room.name);actor.memory={role:'defender',home:w.home.room.name,defenseRoom:w.remote.room.name};
    actor.ticksToLive=1500-ticks;
    const hostile=w.remote.objects[4][0];hostile.body=foe.body;hostile.hits=foe.hits;
    w.h.Game.time=ticks+1;w.update();w.h.load('defense.roles').run(actor,w.h.Memory.enclave);
    for(const call of actor.calls){if(['attack','rangedAttack','heal'].includes(call.action))intent(`creeps/${call.action}`)(guard,{id:call.action==='heal'?'guard':'foe'},s);}
    if(foeBody.includes('attack'))intent('creeps/attack')(foe,{id:'guard'},s);
    if(foeBody.includes('ranged_attack'))intent('creeps/rangedAttack')(foe,{id:'guard'},s);
    if(foeBody.includes('heal'))intent('creeps/heal')(foe,{id:'foe'},s);
    resolve(s);ticks++;
  }
  assert.ok(s.roomObjects.guard,`${label}: defender survived`);assert.equal(s.roomObjects.foe,undefined,`${label}: threat removed`);
  results.push({scenario:label,body:[...body],resolvedTicks:ticks,defenderHits:guard.hits,hostileDestroyed:true});
}
// Resolve one actual evacuation border crossing. The fixture supplies a complete
// one-step escape path; pathfinding and whole-world travel are not simulated here.
{
  const w=world();enemy(w,w.remote);const c=w.h.addWorker(w.remote.room,'miner');c.pos=position(1,25,w.remote.room.name);
  Object.assign(c.memory,{home:w.home.room.name,role:'remoteMiner',targetRoom:w.remote.room.name});w.update();
  w.h.context.PathFinder.search=()=>({incomplete:false,path:[position(0,25,w.remote.room.name)],cost:2});
  w.h.load('defense.civilian').run(c,w.h.Memory.enclave);assert.equal(c.memory.evacuation.fallback,w.home.room.name);
  assert.equal(c.calls[0].action,'path');
  const raw=creep('miner',['work','move'],'friendly',1,25),s=scope([raw]);begin(s);
  intent('creeps/move')(raw,{direction:7},s);resolve(s);
  assert.deepEqual(raw.interRoom,{room:w.home.room.name,x:49,y:25});
  results.push({scenario:'unguarded remote withdrawal',fallback:c.memory.evacuation.fallback,resolvedExit:raw.interRoom,civilianWorkIntents:0});
}
console.log(JSON.stringify({engine:require(path.join(engine,'package.json')).version,node:process.version,
  isolation:'in-memory engine processors; no server connection, database, world reset, or activation',
  limits:'Supplied paths and hostiles, fixed positions during combat; not a live-server raid, full-world simulation, or CPU benchmark.',results},null,2));

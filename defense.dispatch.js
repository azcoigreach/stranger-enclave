'use strict';
const threat=require('defense.threat');
const movement=require('defense.movement');
const territory=require('territory.policy');
const CLEAR_TICKS=25,MAX_SPAWNS=2;

/** One bounded incident per defended room. Cleared records are reused; they do not
 * retain historical arrays. Invisible rooms never silently become safe.
 * @param {ColonySnapshot[]} colonies @param {BotMemory} memory */
function update(colonies,memory){
  const state=memory.defense||(memory.defense={tick:Game.time,rooms:{}});state.tick=Game.time;
  const wanted=new Set(colonies.map(c=>c.room.name));
  for(const c of colonies){const e=memory.colonies[c.room.name]?.expansion;
    for(const op of e?.remotes||(e?.remote?[e.remote]:[]))if(!op.retiring)wanted.add(op.room);
  }
  for(const creep of Object.values(Game.creeps))if(creep.my!==false&&creep.memory.home&&creep.memory.role!=='scout')wanted.add(creep.room.name);
  for(const name of [...wanted].sort()){
    if(!territory.contains(name,memory.block))continue;
    const info=memory.intel[name],old=state.rooms[name];
    if(info?.lastSeen===Game.time&&info.hostiles?.length){
      if(!old||old.mode==='clear')state.rooms[name]={since:Game.time,lastThreat:Game.time,mode:'evacuate',reason:'ASSESSING',
        assigned:[],roster:[],spawned:0,spent:0,losses:0,clearance:'25_CONSECUTIVE_SAFE_OBSERVATIONS',fallbacks:[]};
      const s=state.rooms[name];s.lastThreat=Game.time;delete s.clearSince;delete s.lastClear;
    }
  }
  const busy=new Set();
  const rooms=Object.keys(state.rooms).sort((a,b)=>{
    const owned=(/** @type {string} */ n)=>Number(memory.intel[n]?.kind==='owned');
    const income=(/** @type {string} */ n)=>colonies.reduce((sum,c)=>sum+(memory.colonies[c.room.name]?.expansion?.remotes||[])
      .filter(o=>o.room===n&&!o.retiring).reduce((v,o)=>v+(o.deliverySample?.rate||o.netIncome||0),0),0);
    return owned(b)-owned(a)||income(b)-income(a)||a.localeCompare(b);
  });
  for(const name of rooms){
    const s=state.rooms[name],info=memory.intel[name],profiles=info?.hostiles||[];
    s.age=Game.time-s.lastThreat;s.assigned=[];s.fallbacks=[];delete s.request;delete s.eta;delete s.contactIn;
    for(const entry of s.roster){
      if(entry.lost)continue;
      const creep=Game.creeps[entry.name],pending=Object.values(Game.spawns).some(p=>p.spawning?.name===entry.name);
      if(!creep&&!pending&&Game.time>entry.readyAt+5){entry.lost=true;s.losses++;}
    }
    if(s.mode==='clear')continue;
    const username=colonies[0]?.controller.owner?.username||Object.values(Game.creeps).find(c=>c.owner)?.owner.username||'';
    if(info?.lastSeen===Game.time&&!profiles.length&&!info.npc&&(!info.owner||info.owner===username)&&
      (!info.reservation||info.reservation===username||(info.reservationUntil||0)<=Game.time)){
      if(s.lastClear!==Game.time-1)s.clearSince=Game.time;
      s.lastClear=Game.time;
      if(Game.time-(s.clearSince??Game.time)>=CLEAR_TICKS){s.mode='clear';s.reason='FRESH_SAFE_ROUTE';info.unsafeUntil=0;continue;}
      s.mode='escort';s.reason='VERIFYING_CLEARANCE';continue;
    }
    delete s.clearSince;delete s.lastClear;
    if(!info||info.lastSeen!==Game.time){s.mode='evacuate';s.reason='AWAIT_FRESH_VISION';continue;}
    const colony=colonies.find(c=>c.room.name===name);
    if(colony&&threat.towersHold(colony,profiles)){s.mode='tower';s.reason='TOWERS_SUFFICIENT';continue;}
    s.mode='evacuate';s.reason='NO_AFFORDABLE_COUNTER';
    if(info.npc||profiles.some(p=>p.kind==='keeper')){s.reason='UNSUPPORTED_NPC';continue;}
    if(info.owner&&info.owner!==username){s.reason='FOREIGN_OWNERSHIP';continue;}
    const hostiles=Game.rooms[name]?.find(FIND_HOSTILE_CREEPS)||[];
    const target=threat.targets(hostiles)[0];if(!target)continue;
    const civilians=Object.values(Game.creeps).filter(c=>c.room.name===name&&c.memory.home&&c.memory.role!=='defender');
    s.contactIn=civilians.length?Math.min(...civilians.flatMap(c=>profiles.map(p=>{
      const range=Math.max(Math.abs(c.pos.x-p.x),Math.abs(c.pos.y-p.y));
      return p.move?Math.max(0,range-(p.ranged?3:1)):range<=(p.ranged?3:1)?0:CREEP_LIFE_TIME;
    }))):CREEP_LIFE_TIME;
    const available=Object.values(Game.creeps).filter(c=>c.memory.role==='defender'&&!c.spawning&&!busy.has(c.name)&&
      (!c.memory.defenseRoom||c.memory.defenseRoom===name||state.rooms[c.memory.defenseRoom]?.mode==='clear')&&
      (c.memory.home===name||!state.rooms[c.memory.home||'']||state.rooms[c.memory.home||''].mode==='clear'));
    const reuse=available.map(c=>{
      const path=movement.path(c.pos,target.pos,1,memory,username,true);
      const travel=path?Math.max(path.path.length,Math.ceil(path.cost/2)):Infinity;
      return {c,travel};
    }).filter(({c,travel})=>Number.isFinite(travel)&&threat.holds(threat.profile(c),profiles,travel))
      .sort((a,b)=>a.travel-b.travel||a.c.name.localeCompare(b.c.name))[0];
    if(reuse){
      reuse.c.memory.defenseRoom=name;s.assigned=[reuse.c.name];busy.add(reuse.c.name);s.eta=reuse.travel;
      s.mode=reuse.travel<=s.contactIn?'intercept':'escort';s.reason=reuse.travel<=s.contactIn?'EXISTING_COVER':'WITHDRAW_UNTIL_COVERED';continue;
    }
    const pending=s.roster.filter(r=>!r.lost&&(Game.creeps[r.name]?.spawning||Object.values(Game.spawns).some(p=>p.spawning?.name===r.name)||!Game.creeps[r.name]&&Game.time<=r.readyAt+5));
    if(pending.length){s.assigned=pending.map(r=>r.name);s.mode='escort';s.reason='REINFORCEMENT_SPAWNING';continue;}
    if(s.spawned>=MAX_SPAWNS||Game.time-s.since>CREEP_LIFE_TIME){s.reason='INCIDENT_BUDGET_EXHAUSTED';continue;}
    for(const source of colonies.slice().sort((a,b)=>Number(b.room.name===name)-Number(a.room.name===name)||a.room.name.localeCompare(b.room.name))){
      const home=source.room.name;
      if(home!==name&&source.hostiles.length){s.reason='HOME_DEFENSE_FIRST';continue;}
      if(busy.has(home))continue;
      const spawn=source.spawns.find(p=>!p.spawning);if(!spawn)continue;
      const path=movement.path(spawn.pos,target.pos,1,memory,username,true);if(!path)continue;
      const travel=Math.max(path.path.length,Math.ceil(path.cost/2));
      const body=threat.bodyFor(source.room.energyAvailable,profiles,travel);if(!body)continue;
      const eta=travel+body.length*CREEP_SPAWN_TIME;
      if(threat.strength(profiles).ttl<=eta+50){s.reason='TOO_LATE_TO_REINFORCE';continue;}
      if(s.spent+threat.cost(body)>source.room.energyCapacityAvailable*MAX_SPAWNS){s.reason='INCIDENT_BUDGET_EXHAUSTED';continue;}
      s.request={role:'defender',body,priority:2.5,reason:'ROOM_DEFENSE',targetRoom:name,defenseRoom:name,sponsor:home};
      s.eta=eta;s.mode=eta<=s.contactIn?'intercept':'escort';s.reason=eta<=s.contactIn?'TIMELY_REINFORCEMENT':'WITHDRAW_UNTIL_COVERED';
      busy.add(home);break;
    }
  }
}
/** All intents still pass through economy.spawn. Critical miners and first
 * transport win, followed by defense before optional consumers/expansion.
 * @param {ColonySnapshot} colony @param {BotMemory} memory @returns {SpawnRequest|null} */
function request(colony,memory){
  if(memory.defense?.tick!==Game.time)return null;
  return Object.values(memory.defense.rooms).map(s=>s.request).find(r=>r?.sponsor===colony.room.name)||null;
}
/** Account only accepted spawn intents, never failed attempts. @param {SpawnRequest} request @param {string} name @param {BotMemory} memory */
function spawned(request,name,memory){
  const s=memory.defense?.rooms[request.defenseRoom||''];if(!s)return;
  s.spawned++;s.spent+=threat.cost(request.body);s.roster.push({name,readyAt:Game.time+request.body.length*CREEP_SPAWN_TIME});
  s.assigned.push(name);delete s.request;
}
module.exports={update,request,spawned};

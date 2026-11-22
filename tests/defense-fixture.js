'use strict';
const {harness,position,store}=require('./harness');
function world(){
  const h=harness(),home=h.addRoom('W5N1',{level:5}),remote=h.addRoom('W4N1',{level:1});
  remote.controller.my=false;delete remote.controller.owner;delete h.Game.spawns[remote.spawn.name];remote.objects[h.constants.FIND_STRUCTURES]=[];
  home.room.energyAvailable=home.room.energyCapacityAvailable=1800;
  home.room.storage={id:'storage',my:true,pos:position(24,24,home.room.name),store:store(80000,1000000)};
  home.objects[h.constants.FIND_STRUCTURES].push({...home.room.storage,structureType:'storage'});
  h.Game.map.describeExits=name=>name===home.room.name?{3:remote.room.name}:{7:home.room.name};
  h.Game.map.findRoute=(from,to,opts)=>opts.routeCallback(to)<Infinity?[{room:to,exit:to===home.room.name?7:3}]:-2;
  const path=()=>{h.context.PathFinder.search=(origin,goal,opts)=>{
    if(opts.roomCallback(goal.pos.roomName)===false)return {incomplete:true,path:[],cost:0};
    return {incomplete:false,path:[position(goal.pos.x,goal.pos.y,goal.pos.roomName)],cost:20};
  };};path();
  h.load('core.memory').initialize();
  h.Memory.enclave.colonies[home.room.name]={lastSeen:1,level:5,energy:1800,capacity:1800,workers:4,reason:'READY',expansion:{reason:'ACTIVE',remotes:[{room:remote.room.name,sourceId:remote.objects[2][0].id,reason:'ACTIVE',travel:20,carry:8,checked:1,delivered:1000,spawnEnergy:0,routeValid:true}]}};
  const observe=()=>{for(const room of Object.values(h.Game.rooms))h.load('territory.intel').observe(room,h.Memory.enclave);};
  const update=()=>{observe();h.load('defense.dispatch').update([h.load('colony.snapshot').create(home.room)],h.Memory.enclave);};
  const reset=()=>{h.reset();path();};
  return {h,home,remote,observe,update,reset};
}
function enemy(w,room,body=['attack','move'],extra={}){
  const e={id:'enemy',owner:{username:'Invader'},pos:position(20,20,room.room.name),body:body.map(type=>typeof type==='string'?{type,hits:100}:type),hits:body.length*100,hitsMax:body.length*100,ticksToLive:1000,fatigue:0,getActiveBodyparts(type){return this.body.filter(p=>p.type===type&&p.hits>0).length;},...extra};
  room.objects[w.h.constants.FIND_HOSTILE_CREEPS]=[e];return e;
}
function defender(w,body,name='guard',room=w.home){
  const c=w.h.addWorker(room.room,name);c.memory.role='defender';c.memory.home=w.home.room.name;
  c.body=body.map(type=>({type,hits:100}));c.hits=c.hitsMax=body.length*100;return c;
}

module.exports={world,enemy,defender};

'use strict';
const config=require('core.config');
const movement=require('movement.local');
const policy=require('defense.policy');

/** Persistent targets prevent engineers constantly chasing whichever distant wall is weakest.
 * Critical ramparts bypass the reserve floor; routine work never does.
 * @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block @param {Map<string,number>} reservations */
function run(creep,colony,block,reservations) {
  const record=Memory.enclave && Memory.enclave.colonies[colony.room.name], budget=record && record.budget;
  const storage=colony.room.storage;
  if (!record || !budget || !storage || !storage.my) {creep.memory.task='ENGINEER_WAIT_STORAGE';return;}
  const barriers=colony.structures.filter(s => (s.structureType===STRUCTURE_WALL || s.structureType===STRUCTURE_RAMPART && s.my) && policy.goal(colony,record,s)>0);
  const critical=barriers.filter(s=>s.structureType===STRUCTURE_RAMPART && s.hits<config.defenseEmergencyHits)
    .sort((a,b)=>a.hits-b.hits || a.id.localeCompare(b.id)).find(()=>true);
  const energy=creep.store.getUsedCapacity(RESOURCE_ENERGY);
  if (!energy) {
    const guard=record.perimeterMigration?.guard;
    const assigned=colony.workers.filter(c=>c.memory.role==='engineer' && !c.spawning).sort((a,b)=>a.name.localeCompare(b.name));
    const index=assigned.findIndex(c=>c.name===creep.name);
    const workAhead=assigned.slice(0,Math.max(0,index)).reduce((sum,c)=>sum+c.getActiveBodyparts(WORK),0);
    if(!critical && guard?.creep!==creep.name && workAhead>=budget.engineerWork){creep.memory.task='ENGINEER_FUNDING_PAUSE';return;}

    const reserved=reservations.get(`pickup:${storage.id}`)||0;
    const available=storage.store.getUsedCapacity(RESOURCE_ENERGY)-reserved-(critical ? 0 : budget.reserveFloor);
    const amount=Math.min(available,creep.store.getFreeCapacity(RESOURCE_ENERGY));
    if (amount<=0) {creep.memory.task='ENGINEER_RESERVE_PAUSE';return;}
    reservations.set(`pickup:${storage.id}`,reserved+amount);
    creep.memory.task='ENGINEER_WITHDRAW';creep.memory.lastAction=creep.withdraw(storage,RESOURCE_ENERGY,amount);
    if (creep.memory.lastAction===ERR_NOT_IN_RANGE) movement.move(creep,storage.pos,1,block);
    return;
  }
  const guard=record?.perimeterMigration?.guard;
  if(guard && guard.creep===creep.name && !critical){
    const site=colony.sites.find(s=>s.structureType===STRUCTURE_RAMPART && s.pos.x===guard.x && s.pos.y===guard.y);
    const target=colony.room.getPositionAt(guard.x,guard.y);
    creep.memory.task=site ? 'ENGINEER_BUILD_CONVERTED_GATE' : 'ENGINEER_GUARD_CONVERSION';
    if(site)creep.memory.lastAction=creep.build(site);
    if(target && !creep.pos.inRangeTo(target,3))movement.move(creep,target,3,block);
    return;
  }
  const goal=(/** @type {AnyStructure} */ s)=>policy.goal(colony,record,s);
  const tier=policy.tier(colony,record,barriers);
  const repairable=barriers.filter(s=>s.hits<Math.min(tier,goal(s),s.hitsMax));
  const saved=repairable.find(s=>s.id===creep.memory.workTarget);
  const site=colony.sites.slice().sort((a,b)=>{
    const priority=(/** @type {BuildableStructureConstant} */ t)=>t===STRUCTURE_RAMPART ? 0 : t===STRUCTURE_WALL ? 2 : 1;
    return priority(a.structureType)-priority(b.structureType)||a.id.localeCompare(b.id);
  }).find(()=>true);
  const target=critical || site || saved || repairable.sort((a,b)=>a.hits-b.hits || creep.pos.getRangeTo(a)-creep.pos.getRangeTo(b) || a.id.localeCompare(b.id))[0];
  if (!target) {delete creep.memory.workTarget;creep.memory.task='ENGINEER_READY';return;}
  creep.memory.workTarget=target.id;
  const building=target===site;
  creep.memory.task=building ? 'ENGINEER_BUILD' : critical ? 'ENGINEER_SAVE_RAMPART' : 'ENGINEER_FORTIFY';
  creep.memory.lastAction=building ? creep.build(/** @type {ConstructionSite} */ (/** @type {unknown} */ (target))) : creep.repair(/** @type {Structure} */ (target));
  if (creep.memory.lastAction===ERR_NOT_IN_RANGE) movement.move(creep,target.pos,3,block);
}
module.exports={run};

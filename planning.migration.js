'use strict';
const config=require('core.config');
const layout=require('planning.layout');
const mature=require('planning.mature');
/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
const same=(a,b)=>a.x===b.x && a.y===b.y;
/** Explicit approval is tied to the exact reviewed proposal, never inferred by the bot.
 * @param {string} name @param {number} plannedAt */
function approve(name,plannedAt) {
  const record=Memory.enclave?.colonies[name],room=Game.rooms[name],proposal=record?.perimeterProposal;
  if(!record || !room?.controller?.my || !proposal || proposal.plannedAt!==plannedAt ||
    proposal.status!=='MIGRATION_REVIEW' || (record.mature?.status!=='RESERVED' || record.mature.policyKey!==mature.policyKey()) || record.perimeter?.version!==1)throw new Error('No matching reviewed perimeter proposal');
  if(record.perimeterMigration)return record.perimeterMigration;
  const structures=room.find(FIND_STRUCTURES);
  const conversions=proposal.tiles.filter(p=>p.type===STRUCTURE_RAMPART && structures.some(s=>s.structureType===STRUCTURE_WALL && same(s.pos,p)))
    .map(p=>({x:p.x,y:p.y}));
  record.perimeterMigration={approvedAt:Game.time,plannedAt,phase:'BUILD_OUTER',reason:'APPROVED',
    legacyWalls:(proposal.legacyWalls||[]).filter(p=>record.perimeter?.tiles.some(t=>t.type===STRUCTURE_WALL && same(t,p))),conversions};
  return record.perimeterMigration;
}
/** @param {ColonySnapshot} colony @param {BuildingPosition} p @param {boolean} [exact] */
function barrier(colony,p,exact=false) {
  return colony.structures.find(s=>same(s.pos,p) && (s.structureType===p.type || !exact &&
    (s.structureType===STRUCTURE_WALL || s.structureType===STRUCTURE_RAMPART && s.my)));
}
/** @param {ColonyRecord} record @param {{x:number,y:number}} p */
function forgetWall(record,p) {
  if(record.layout)record.layout.buildings=record.layout.buildings.filter(b=>b.type!==STRUCTURE_WALL || !same(b,p));
}
/** At most one construction/demolition request per call. Approved barriers are removed
 * only after the outer ring is present and strong; all progress is confirmed from later vision.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record @param {()=>boolean} allowed */
function run(colony,record,allowed) {
  const migration=record.perimeterMigration,proposal=record.perimeterProposal;
  if(!migration || migration.phase==='COMPLETE')return;
  if(!proposal || proposal.plannedAt!==migration.plannedAt || (record.mature?.status!=='RESERVED' || record.mature.policyKey!==mature.policyKey())) {migration.reason='APPROVAL_PLAN_MISMATCH';return;}
  if(colony.hostiles.length || !colony.controller.my){migration.reason='WAIT_SAFE_ROOM';return;}
  if(!allowed()){migration.reason='WAIT_CPU';return;}
  const funded=colony.room.storage && colony.room.storage.store.getUsedCapacity(RESOURCE_ENERGY)>(record.budget?.reserveFloor||config.reserveFloor);
  const roomForSite=colony.sites.length<3 && Object.keys(Game.constructionSites).length<MAX_CONSTRUCTION_SITES;
  // Keep reconstruction ahead of optional new walls. Converted/retired wall records are removed only after approved demolition.
  if(roomForSite && layout.rebuild(colony,record,allowed)){migration.reason='RECONSTRUCTING';return;}
  const strong=(/** @type {BuildingPosition} */ p,/** @type {boolean} */ exact=false)=>{
    const structure=barrier(colony,p,exact);return Boolean(structure && structure.hits>=config.defenseEmergencyHits);
  };
  if(migration.phase==='BUILD_OUTER'){
    const missing=proposal.tiles.filter(p=>!barrier(colony,p) && !colony.sites.some(s=>same(s.pos,p)));
    missing.sort((a,b)=>Number(b.type===STRUCTURE_RAMPART)-Number(a.type===STRUCTURE_RAMPART)||a.y-b.y||a.x-b.x);
    if(missing.length){
      if(!funded || !roomForSite){migration.reason=!funded?'WAIT_RESERVE':'CONSTRUCTION_BACKLOG';return;}
      const p=missing[0],result=colony.room.createConstructionSite(p.x,p.y,p.type);
      if(result===OK)layout.rememberSite(record,p);
      migration.reason=result===OK?'BUILDING_OUTER':`OUTER_SITE_FAILED_${result}`;return;
    }
    if(!proposal.tiles.every(p=>strong(p))){migration.reason='FORTIFY_OUTER_MINIMUM';return;}
    migration.phase='CONVERT_GATES';
  }
  if(migration.phase==='CONVERT_GATES'){
    const p=migration.conversions.find(p=>!strong({...p,type:STRUCTURE_RAMPART},true));
    if(p){
      if(!proposal.tiles.filter(t=>!same(t,p)).every(t=>strong(t))){migration.reason='REPAIR_OUTER_BEFORE_CONVERSION';return;}
      const engineers=colony.workers.filter(c=>c.memory.role==='engineer' && !c.spawning && c.getActiveBodyparts(WORK)>0)
        .sort((a,b)=>a.pos.getRangeTo(p.x,p.y)-b.pos.getRangeTo(p.x,p.y)||a.name.localeCompare(b.name));
      const oldGuard=migration.guard && engineers.find(c=>c.name===migration.guard?.creep),engineer=oldGuard||engineers[0];
      migration.guard={...p,creep:engineer?.name};
      const wall=colony.structures.find(s=>s.structureType===STRUCTURE_WALL && same(s.pos,p));
      if(wall){
        if(!funded || !engineer || engineer.pos.getRangeTo(p.x,p.y)>3 || engineer.store.getUsedCapacity(RESOURCE_ENERGY)<1 || !roomForSite){migration.reason='WAIT_GATE_ENGINEER';return;}
        const result=wall.destroy();migration.lastAction={tick:Game.time,x:p.x,y:p.y,action:'convert',result};
        if(result===OK){forgetWall(record,p);layout.rememberSite(record,{...p,type:STRUCTURE_RAMPART});}
        migration.reason=result===OK?'GATE_CONVERSION_OPEN':`GATE_CONVERSION_FAILED_${result}`;return;
      }
      // Layout reconstruction places the new gate on the next tick; its engineer stays in work range.
      migration.reason='FORTIFY_CONVERTED_GATE';return;
    }
    delete migration.guard;migration.phase='RETIRE_INNER';
  }
  if(migration.phase==='RETIRE_INNER'){
    if(!proposal.tiles.every(p=>strong(p,true))){migration.reason='REPAIR_OUTER_BEFORE_RETIREMENT';return;}
    const p=migration.legacyWalls.find(p=>colony.structures.some(s=>s.structureType===STRUCTURE_WALL && same(s.pos,p)) ||
      colony.sites.some(s=>s.structureType===STRUCTURE_WALL && same(s.pos,p)));
    if(p){
      const wall=colony.structures.find(s=>s.structureType===STRUCTURE_WALL && same(s.pos,p));
      const site=colony.sites.find(s=>s.structureType===STRUCTURE_WALL && same(s.pos,p));
      const result=wall ? wall.destroy() : site ? site.remove() : OK;
      migration.lastAction={tick:Game.time,x:p.x,y:p.y,action:'retire',result};
      if(result===OK)forgetWall(record,p);
      migration.reason=result===OK?'RETIRING_INNER_WALL':`RETIRE_FAILED_${result}`;return;
    }
    for(const p of migration.legacyWalls)forgetWall(record,p);
    record.perimeter=proposal;record.perimeter.status='ENCLOSED';delete record.perimeterProposal;
    migration.phase='COMPLETE';migration.reason='OBSERVED_COMPLETE';migration.completedAt=Game.time;
  }
}
module.exports={approve,run};

'use strict';
const config=require('core.config');
/** @param {ColonyRecord} record */
function plan(record){return record.perimeterMigration && record.perimeterMigration.phase!=='COMPLETE' && record.perimeterProposal?.plannedAt===record.perimeterMigration.plannedAt ? record.perimeterProposal : record.perimeter;}
/** @param {number} level @param {ColonyRecord} record */
function target(level,record){
  if(record.perimeter?.version===1 && record.perimeterProposal && !record.perimeterMigration)return config.defenseEmergencyHits;
  return level===8 ? WALL_HITS_MAX : config.defenseHits[level] || 0;
}
/** @param {ColonySnapshot} colony @param {ColonyRecord} record @param {AnyStructure} structure */
function goal(colony,record,structure){
  if(!Number.isFinite(structure.hits) || !(structure.hitsMax>0))return 0;
  const p=plan(record),migration=record.perimeterMigration;
  if(p?.version===2 && !p.tiles.some(t=>t.type===structure.structureType && t.x===structure.pos.x && t.y===structure.pos.y)){
    const temporary=structure.structureType===STRUCTURE_WALL && migration && migration.phase!=='COMPLETE' &&
      [...migration.legacyWalls,...migration.conversions].some(t=>t.x===structure.pos.x && t.y===structure.pos.y);
    return temporary ? Math.min(config.defenseEmergencyHits,structure.hitsMax) : 0;
  }
  return colony.controller.level===8 ? structure.hitsMax : Math.min(target(colony.controller.level,record),structure.hitsMax);
}
/** @param {ColonySnapshot} colony @param {ColonyRecord} record @param {AnyStructure[]} barriers */
function tier(colony,record,barriers){
  const unfinished=barriers.filter(s=>s.hits<goal(colony,record,s));
  if(!unfinished.length)return target(colony.controller.level,record);
  const weakest=Math.min(...unfinished.map(s=>s.hits));
  return config.defenseTiers.find(h=>h>weakest) || Math.max(...unfinished.map(s=>goal(colony,record,s)));
}
module.exports={plan,target,goal,tier};

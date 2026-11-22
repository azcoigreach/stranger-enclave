'use strict';
const config=require('core.config');

/** Coordinated tower fire; mobile defense shares target ordering.
 * Uses no persistent state; caller isolates errors. Never targets outside the room.
 * @param {ColonySnapshot} colony
 */
function run(colony) {
  const target = require('defense.threat').targets(colony.hostiles)[0];
  const critical=colony.structures.filter(s=>s.structureType===STRUCTURE_RAMPART && s.my && s.hits<config.defenseEmergencyHits)
    .sort((a,b)=>a.hits-b.hits || a.id.localeCompare(b.id))[0];
  for (const structure of colony.structures) {
    if (structure.structureType === STRUCTURE_TOWER && structure.my &&
        structure.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_ENERGY_COST) {
      if(target) structure.attack(target);
      else if(critical && structure.store.getUsedCapacity(RESOURCE_ENERGY)>=500) structure.repair(critical);
    }
  }
}

module.exports = { run };

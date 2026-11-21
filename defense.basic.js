'use strict';

/** Basic tower fire only; threat sizing, safe mode, and evacuation are future work.
 * Uses no persistent state; caller isolates errors. Never targets outside the room.
 * @param {ColonySnapshot} colony
 */
function run(colony) {
  const target = colony.hostiles.slice().sort((a, b) => a.hits - b.hits || a.id.localeCompare(b.id))[0];
  if (!target) return;
  for (const structure of colony.structures) {
    if (structure.structureType === STRUCTURE_TOWER && structure.my &&
        structure.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_ENERGY_COST) structure.attack(target);
  }
}

module.exports = { run };

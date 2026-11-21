'use strict';
const movement = require('movement.local');

/** Source-assigned hauling. Per-tick reservations coordinate both pickup and delivery.
 * Carries energy to spawn/extensions, then towers to capacity, then working consumers.
 * @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block
 * @param {Map<string, number>} reservations
 */
function run(creep, colony, block, reservations) {
  if (creep.spawning) return;
  const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  if (!energy) creep.memory.working = false;
  if (!creep.store.getFreeCapacity(RESOURCE_ENERGY)) creep.memory.working = true;
  const source = colony.sources.find(s => s.id === creep.memory.sourceId);
  if (!source) { creep.memory.task = 'HAUL_SOURCE_MISSING'; return; }
  if (!creep.memory.working) {
    const drops = colony.room.find(FIND_DROPPED_RESOURCES).filter(r => r.resourceType === RESOURCE_ENERGY &&
      r.pos.inRangeTo(source, 2) && r.amount > (reservations.get(`pickup:${r.id}`) || 0));
    drops.sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) || a.id.localeCompare(b.id));
    const drop = drops[0];
    if (drop) {
      reservations.set(`pickup:${drop.id}`, (reservations.get(`pickup:${drop.id}`) || 0) +
        Math.min(drop.amount - (reservations.get(`pickup:${drop.id}`) || 0), creep.store.getFreeCapacity(RESOURCE_ENERGY)));
      creep.memory.task = 'HAUL_PICKUP';
      creep.memory.lastAction = creep.pickup(drop);
      if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.move(creep, drop.pos, 1, block);
      return;
    }
    const container = colony.structures.find(s => s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(source, 2) && s.store.getUsedCapacity(RESOURCE_ENERGY) > (reservations.get(`pickup:${s.id}`) || 0));
    if (container && container.structureType === STRUCTURE_CONTAINER) {
      const amount = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY),
        container.store.getUsedCapacity(RESOURCE_ENERGY) - (reservations.get(`pickup:${container.id}`) || 0));
      reservations.set(`pickup:${container.id}`, (reservations.get(`pickup:${container.id}`) || 0) + amount);
      creep.memory.task = 'HAUL_WITHDRAW';
      creep.memory.lastAction = creep.withdraw(container, RESOURCE_ENERGY, amount);
      if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.move(creep, container.pos, 1, block);
      return;
    }
    if (energy > 0) creep.memory.working = true; // Deliver partial loads rather than wait on an empty source.
    else {
      creep.memory.task = 'WAIT_MINER_OUTPUT';
      const miner = colony.workers.find(c => !c.spawning && c.memory.role === 'miner' && c.memory.sourceId === source.id);
      movement.move(creep, miner ? miner.pos : source.pos, miner ? 1 : 2, block);
      return;
    }
  }
  /** @type {Array<StructureSpawn | StructureExtension | StructureTower | Creep>} */
  const targets = [];
  for (const structure of colony.structures) {
    if ((structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) && structure.my) targets.push(structure);
  }
  const towers = colony.structures.filter(s => s.structureType === STRUCTURE_TOWER && s.my && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
  for (const tower of towers) if (tower.structureType === STRUCTURE_TOWER) targets.push(tower);
  // Starved consumers before partially filled ones; persistent name order breaks ties.
  targets.push(...colony.workers.filter(c => !c.spawning && c.memory.role === 'bootstrap').sort((a, b) =>
    a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY) || a.name.localeCompare(b.name)));
  const target = targets.find(t => t.store.getFreeCapacity(RESOURCE_ENERGY) > (reservations.get(t.id) || 0));
  if (!target) { creep.memory.task = 'WAIT_ENERGY_DEMAND'; return; }
  const amount = Math.min(energy, target.store.getFreeCapacity(RESOURCE_ENERGY) - (reservations.get(target.id) || 0));
  reservations.set(target.id, (reservations.get(target.id) || 0) + amount);
  creep.memory.task = 'HAUL_DELIVER';
  creep.memory.lastAction = creep.transfer(target, RESOURCE_ENERGY, amount);
  if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.move(creep, target.pos, 1, block);
}
module.exports = { run };

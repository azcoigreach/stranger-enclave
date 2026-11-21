'use strict';
const movement = require('movement.local');
const config = require('core.config');

/** Consumer refill hysteresis leaves time to bank cargo between worker deliveries.
 * Builders and controller emergencies keep full refills. Without usable storage, retain bootstrap behavior.
 * @param {StructureSpawn | StructureExtension | StructureTower | StructureStorage | Creep} target
 * @param {ColonySnapshot} colony
 */
function deliveryNeed(target, colony) {
  const free = target.store.getFreeCapacity(RESOURCE_ENERGY);
  if (!('body' in target)) return free;
  const storage = colony.room.storage;
  const generalists = colony.workers.filter(c => !c.spawning && c.memory.role === 'bootstrap');
  const builder = colony.sites.length > 0 && generalists[generalists.length - 1]?.name === target.name;
  if (!storage || !storage.my || !storage.store.getFreeCapacity(RESOURCE_ENERGY) || builder ||
    colony.controller.ticksToDowngrade < config.downgradeUrgency) return free;
  const energy = target.store.getUsedCapacity(RESOURCE_ENERGY), capacity = energy + free;
  const work = target.getActiveBodyparts(WORK);
  const low = Math.min(capacity / 2, work * config.storageWorkerRefillTicks);
  const desired = Math.min(capacity, work * config.storageWorkerBufferTicks);
  return energy < low ? Math.max(0, desired - energy) : 0;
}

/** @param {ColonySnapshot} colony
 * @returns {Array<StructureSpawn | StructureExtension | StructureTower | Creep>}
 */
function recipients(colony) {
  /** @type {Array<StructureSpawn | StructureExtension | StructureTower | Creep>} */
  const targets = [];
  for (const structure of colony.structures) {
    if ((structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) && structure.my) targets.push(structure);
  }
  for (const structure of colony.structures) {
    if (structure.structureType === STRUCTURE_TOWER && structure.my) targets.push(structure);
  }
  targets.push(...colony.workers.filter(c => !c.spawning && c.memory.role === 'bootstrap').sort((a, b) =>
    a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY) || a.name.localeCompare(b.name)));
  return targets;
}

/** Source carriers withdraw only outstanding home demand during output gaps;
 * distributors load a batch when demand exists, retaining spare cargo for upcoming refills.
 * A full source never prevents distributor deliveries.
 * @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block @param {Map<string,number>} reservations
 */
function withdrawForDemand(creep, colony, block, reservations) {
  const storage = colony.room.storage;
  if (!storage || !storage.my) return false;
  const neededEnergy = recipients(colony).reduce((sum, target) =>
    sum + Math.max(0, deliveryNeed(target, colony) - (reservations.get(target.id) || 0)), 0);
  const reserved = reservations.get(`pickup:${storage.id}`) || 0;
  if (neededEnergy <= reserved) return false;
  const amount = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY),
    storage.store.getUsedCapacity(RESOURCE_ENERGY) - reserved,
    creep.memory.role === 'distributor' ? Infinity : neededEnergy - reserved);
  if (amount <= 0) return false;
  reservations.set(`pickup:${storage.id}`, reserved + amount);
  creep.memory.task = creep.memory.role === 'distributor' ? 'DISTRIBUTE_WITHDRAW' : 'HAUL_STORAGE_WITHDRAW';
  creep.memory.lastAction = creep.withdraw(storage, RESOURCE_ENERGY, amount);
  if (creep.memory.lastAction === OK) creep.memory.working = true;
  if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.move(creep, storage.pos, 1, block);
  return true;
}

/** Source-assigned hauling. Per-tick reservations coordinate both pickup and delivery.
 * Carries energy to spawn/extensions, then towers to capacity, then low worker buffers and storage.
 * @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block
 * @param {Map<string, number>} reservations
 */
function run(creep, colony, block, reservations) {
  if (creep.spawning) return;
  const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  if (!energy) creep.memory.working = false;
  if (!creep.store.getFreeCapacity(RESOURCE_ENERGY)) creep.memory.working = true;
  if (creep.memory.role === 'distributor') {
    if (energy > 0) return deliver(creep, colony, block, reservations);
    if (withdrawForDemand(creep, colony, block, reservations)) return;
    const storage = colony.room.storage;
    creep.memory.task = storage && storage.my ? 'DISTRIBUTOR_WAIT_DEMAND' : 'DISTRIBUTOR_WAIT_STORAGE';
    if (storage && storage.my) movement.move(creep, storage.pos, 2, block);
    return;
  }
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
    if (!energy && withdrawForDemand(creep, colony, block, reservations)) return;
    if (energy > 0) creep.memory.working = true; // Deliver partial loads rather than wait on an empty source.
    else {
      creep.memory.task = 'WAIT_MINER_OUTPUT';
      const miner = colony.workers.find(c => !c.spawning && c.memory.role === 'miner' && c.memory.sourceId === source.id);
      movement.move(creep, miner ? miner.pos : source.pos, miner ? 1 : 2, block);
      return;
    }
  }
  return deliver(creep, colony, block, reservations);
}

/** @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block @param {Map<string,number>} reservations */
function deliver(creep, colony, block, reservations) {
  const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  /** @type {Array<StructureSpawn | StructureExtension | StructureTower | StructureStorage | Creep>} */
  const targets = recipients(colony);
  if (creep.memory.role !== 'distributor' && colony.room.storage && colony.room.storage.my) targets.push(colony.room.storage);
  const target = targets.find(t => deliveryNeed(t, colony) > (reservations.get(t.id) || 0));
  if (!target) { creep.memory.task = creep.memory.role === 'distributor' ? 'DISTRIBUTOR_WAIT_DEMAND' : 'WAIT_ENERGY_DEMAND'; return; }
  const amount = Math.min(energy, deliveryNeed(target, colony) - (reservations.get(target.id) || 0));
  reservations.set(target.id, (reservations.get(target.id) || 0) + amount);
  creep.memory.task = target === colony.room.storage ? 'HAUL_STORAGE_DEPOSIT' :
    (creep.memory.role === 'distributor' ? 'DISTRIBUTE_DELIVER' : 'HAUL_DELIVER');
  creep.memory.lastAction = creep.transfer(target, RESOURCE_ENERGY, amount);
  if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.move(creep, target.pos, 1, block);
}
module.exports = { run };

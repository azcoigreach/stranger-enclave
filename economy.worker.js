'use strict';

const config = require('core.config');
const movement = require('movement.local');
const demand = require('economy.demand');
const miner = require('economy.miner');
const hauler = require('economy.hauler');
const stations = require('economy.stations');
const mining = require('economy.mining');
const engineer = require('economy.engineer');
const links = require('economy.links');
const yielding = require('movement.yield');

/** Issue one work/carry intent and, if needed, one movement intent.
 * @param {Creep} creep @param {{pos: RoomPosition}} target @param {number} range
 * @param {string} task @param {() => number} action @param {BlockBounds} block
 */
function perform(creep, target, range, task, action, block) {
  creep.memory.task = task;
  const result = action();
  creep.memory.lastAction = result;
  if (result === ERR_NOT_IN_RANGE) movement.move(creep, target.pos, range, block);
}

/** Returns a reachable target, ignoring temporary creep congestion.
 * @template {{pos: RoomPosition}} T @param {Creep} creep @param {T[]} targets @param {number} range
 * @returns {T | null}
 */
function reachable(creep, targets, range) {
  const ordered = targets.slice().sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
  for (const target of ordered) {
    if (creep.pos.inRangeTo(target, range)) return target;
    const path = creep.pos.findPathTo(target.pos, { range, maxRooms: 1, ignoreCreeps: true, maxOps: 1500 });
    const end = path[path.length - 1];
    if (end && Math.max(Math.abs(end.x - target.pos.x), Math.abs(end.y - target.pos.y)) <= range) return target;
  }
  return null;
}

/** Worker gathers from salvage/containers before harvesting. Only source ID is persisted.
 * @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block
 */
function gather(creep, colony, block) {
  const drop = reachable(creep, colony.room.find(FIND_DROPPED_RESOURCES).filter(r =>
    r.resourceType === RESOURCE_ENERGY && r.amount >= 20), 1);
  if (drop) return perform(creep, drop, 1, 'PICKUP', () => creep.pickup(drop), block);
  const stores = [
    ...colony.room.find(FIND_TOMBSTONES), ...colony.room.find(FIND_RUINS),
    ...colony.structures.filter(s => s.structureType === STRUCTURE_CONTAINER ||
      (s.structureType === STRUCTURE_STORAGE && s.my)),
  ].filter(s => 'store' in s && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
  const store = reachable(creep, stores, 1);
  if (store) return perform(creep, store, 1, 'WITHDRAW', () => creep.withdraw(store, RESOURCE_ENERGY), block);

  const assignment = mining.assign(colony).get(creep.name);
  if (!assignment) {
    creep.memory.task = 'NO_REACHABLE_ENERGY';
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.memory.working = true;
    delete creep.memory.sourceId;
    delete creep.memory.miningSpot;
    return;
  }
  creep.memory.task = 'HARVEST';
  creep.memory.lastAction = creep.harvest(assignment.source);
  if (creep.memory.lastAction === ERR_NOT_IN_RANGE) {
    const target = colony.room.getPositionAt(assignment.pos.x, assignment.pos.y);
    if (target) movement.move(creep, target, 0, block);
  }
}

/** Bootstrap coordinator owns each worker's final intents and CreepMemory fields.
 * Runs every tick even at low bucket. No inter-room travel or military behavior yet.
 * @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block
 * @param {Map<string, number>} deliveries Tick-local reservations, shared by the colony.
 */
function run(creep, colony, block, deliveries) {
  if (yielding.held(creep)) return;
  if (creep.spawning || deliveries.has(`traffic:${creep.id}`)) return;
  if (creep.room.name !== creep.memory.home) { creep.memory.task = 'OUTSIDE_HOME'; return; }
  if (creep.memory.role === 'miner') return miner.run(creep, colony, block);
  if (creep.memory.role === 'hauler' || creep.memory.role === 'distributor') return hauler.run(creep, colony, block, deliveries);
  if (creep.memory.role === 'engineer') return engineer.run(creep,colony,block,deliveries);
  const generalists = colony.workers.filter(c => !c.spawning && c.memory.role === 'bootstrap');
  const developed = demand.specialized(colony);
  const fed = colony.workers.some(c => !c.spawning && c.memory.role === 'miner') &&
    colony.workers.some(c => !c.spawning && c.memory.role === 'hauler');
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) creep.memory.working = false;
  else if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) creep.memory.working = true;
  if (fed && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.memory.working = true;
  const builder = fed && generalists[generalists.length - 1]?.name === creep.name && colony.sites.length > 0;
  const station = fed && !builder ? stations.forWorker(creep, colony) : null;
  const receiver=fed ? links.network(colony).controller : undefined;
  const seekingLink=!creep.memory.working && receiver && receiver.store.getUsedCapacity(RESOURCE_ENERGY)>(deliveries.get(`pickup:${receiver.id}`)||0);
  if (station && !seekingLink && !(creep.memory.yieldUntil && creep.memory.yieldUntil>=Game.time && creep.pos.inRangeTo(colony.controller,3)) && !creep.pos.inRangeTo(station, 0)) {
    creep.memory.task = 'MOVE_UPGRADE_STATION';
    movement.move(creep, station, 0, block);
    if (creep.memory.working && creep.pos.inRangeTo(colony.controller, 3)) {
      creep.memory.lastAction = creep.upgradeController(colony.controller);
    }
    return;
  }
  if (!creep.memory.working) {
    if (!fed) return gather(creep, colony, block);
    if (receiver) {
      const reserved=deliveries.get(`pickup:${receiver.id}`)||0;
      const amount=Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY),receiver.store.getUsedCapacity(RESOURCE_ENERGY)-reserved);
      if(amount>0) {deliveries.set(`pickup:${receiver.id}`,reserved+amount);
        return perform(creep,receiver,1,'LINK_WITHDRAW',()=>creep.withdraw(receiver,RESOURCE_ENERGY,amount),block);}
    }
    const nearby = reachable(creep, colony.room.find(FIND_DROPPED_RESOURCES).filter(r =>
      r.resourceType === RESOURCE_ENERGY && creep.pos.inRangeTo(r, 3)), 1);
    if (nearby) return perform(creep, nearby, 1, 'PICKUP', () => creep.pickup(nearby), block);
    const anchor = generalists[generalists.length - 1]?.name === creep.name && colony.sites.length ? colony.sites[0] : colony.controller;
    creep.memory.task = 'WAIT_HAUL_DELIVERY';
    if (!station) movement.move(creep, anchor.pos, 3, block);
    return;
  }

  const controller = colony.controller;
  if (controller.ticksToDowngrade < config.downgradeUrgency) {
    return perform(creep, controller, 3, 'PREVENT_DOWNGRADE', () => creep.upgradeController(controller), block);
  }
  // Established haulers own refilling. Consumers stay at work and spend partial loads.
  if (fed) {
    const site = builder ? reachable(creep, colony.sites, 3) : null;
    if (site) return perform(creep, site, 3, 'BUILD', () => creep.build(site), block);
    return perform(creep, controller, 3, 'UPGRADE', () => creep.upgradeController(controller), block);
  }
  // Once a colony can support dedicated mining, reserve one consumer for progress
  // while other workers/haulers fund replacements. Recovery still has two generalists.
  if (developed && generalists.length >= 2 && generalists[0].name === creep.name) {
    return perform(creep, controller, 3, 'UPGRADE', () => creep.upgradeController(controller), block);
  }
  const recipients = colony.structures.filter(s =>
    (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.my &&
    s.store.getFreeCapacity(RESOURCE_ENERGY) > (deliveries.get(s.id) || 0));
  const recipient = reachable(creep, recipients, 1);
  if (recipient && 'store' in recipient) {
    const amount = Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY),
      recipient.store.getFreeCapacity(RESOURCE_ENERGY) - (deliveries.get(recipient.id) || 0));
    deliveries.set(recipient.id, (deliveries.get(recipient.id) || 0) + amount);
    return perform(creep, recipient, 1, 'REFILL', () => creep.transfer(recipient, RESOURCE_ENERGY, amount), block);
  }
  const tower = reachable(creep, colony.structures.filter(s => s.structureType === STRUCTURE_TOWER && s.my &&
    s.store.getFreeCapacity(RESOURCE_ENERGY) > (deliveries.get(s.id) || 0)), 1);
  if (tower && 'store' in tower) {
    const amount = Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY),
      tower.store.getFreeCapacity(RESOURCE_ENERGY) - (deliveries.get(tower.id) || 0));
    deliveries.set(tower.id, (deliveries.get(tower.id) || 0) + amount);
    return perform(creep, tower, 1, 'REFILL_TOWER', () => creep.transfer(tower, RESOURCE_ENERGY, amount), block);
  }
  // One worker always upgrades after refilling so construction cannot starve progression.
  if (generalists[0]?.name !== creep.name && (!fed || generalists[generalists.length - 1]?.name === creep.name)) {
    const site = reachable(creep, colony.sites, 3);
    if (site) return perform(creep, site, 3, 'BUILD', () => creep.build(site), block);
  }
  perform(creep, controller, 3, 'UPGRADE', () => creep.upgradeController(controller), block);
}

module.exports = { run, reachable };

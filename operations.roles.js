'use strict';
const movement=require('movement.remote');
const scout=require('operations.scout');
const territory=require('territory.policy');

/** @param {Creep} creep @param {BotMemory} memory @param {Map<string,number>} reservations */
function run(creep,memory,reservations) {
  if (creep.spawning || require('movement.yield').held(creep)) return;
  if (creep.memory.role === 'scout') {scout.run(creep,memory);return;}
  const home=creep.memory.home || '', record=memory.colonies[home];
  const state=record && record.expansion;
  const op=state && (state.remotes || (state.remote ? [state.remote] : [])).find(o=>o.room===creep.memory.targetRoom && o.sourceId===creep.memory.sourceId);
  const homeRoom=Game.rooms[home];
  if (!homeRoom || !homeRoom.controller || !homeRoom.controller.my) {creep.memory.task='REMOTE_HOME_UNAVAILABLE';return;}
  const storage=homeRoom.storage;
  const energy=creep.store.getUsedCapacity(RESOURCE_ENERGY);
  if (creep.memory.role === 'remoteHauler' && !creep.store.getFreeCapacity(RESOURCE_ENERGY)) creep.memory.working=true;
  const returning=creep.memory.role === 'remoteHauler' && (creep.memory.working || !creep.store.getFreeCapacity(RESOURCE_ENERGY));
  const active=op && op.reason === 'ACTIVE' && op.room === creep.memory.targetRoom && op.sourceId === creep.memory.sourceId &&
    territory.contains(op.room,memory.block);
  if (!active || returning) {
    creep.memory.task=active ? 'REMOTE_RETURN' : 'REMOTE_RETREAT';
    if (creep.room.name !== home) {movement.travel(creep,home,memory);return;}
    if (energy && storage && storage.my) {
      const amount=Math.min(energy,storage.store.getFreeCapacity(RESOURCE_ENERGY)-(reservations.get(storage.id)||0));
      if (amount <= 0) {creep.memory.task='REMOTE_STORAGE_FULL';return;}
      reservations.set(storage.id,(reservations.get(storage.id)||0)+amount);
      creep.memory.lastAction=creep.transfer(storage,RESOURCE_ENERGY,amount);
      if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.approach(creep,storage.pos,1,memory);
      return;
    }
    if (!energy) creep.memory.working=false;
    if (!active) return;
  }
  if (!op) return;
  if (creep.room.name !== op.room) {
    // Keep collectors out of a narrow source approach until its producer is in position.
    // They wait away from the spawn, and may still recover drops after a miner dies.
    if (creep.memory.role === 'remoteHauler' && creep.room.name === home) {
      const room=Game.rooms[op.room], source=room && room.find(FIND_SOURCES).find(s => s.id === op.sourceId);
      const ready=source && (Object.values(Game.creeps).some(c => !c.spawning && c.memory.role === 'remoteMiner' &&
        c.memory.home === home && c.memory.sourceId === source.id && c.room.name === op.room && c.pos.inRangeTo(source,1)) ||
        room && room.find(FIND_DROPPED_RESOURCES).some(r => r.resourceType === RESOURCE_ENERGY && r.pos.inRangeTo(source,2)));
      if (!ready) {
        creep.memory.task='REMOTE_WAIT_PRODUCER';
        if (storage) movement.park(creep,storage.pos,memory);
        return;
      }
    }
    delete creep.memory.parkingSpot;
    creep.memory.task='REMOTE_TRAVEL';movement.travel(creep,op.room,memory);return;
  }
  const source=creep.room.find(FIND_SOURCES).find(s => s.id === op.sourceId);
  if (!source) {creep.memory.task='REMOTE_SOURCE_MISSING';return;}
  if (creep.memory.role === 'reserver') {
    const controller=creep.room.controller;
    if (!controller || controller.owner || controller.reservation && controller.reservation.username !== (memory.intel[home] && memory.intel[home].owner)) return;
    creep.memory.task='REMOTE_RESERVE';creep.memory.lastAction=creep.reserveController(controller);
    if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.approach(creep,controller.pos,1,memory);
  } else if (creep.memory.role === 'remoteMiner') {
    const info=memory.intel[op.room], slots=info && info.sources && info.sources.find(s => s.id === source.id);
    const occupants=Object.values(Game.creeps).filter(c => c.name !== creep.name && c.room.name === op.room);
    const slot=slots && slots.slots.find(p => creep.pos.x === p.x && creep.pos.y === p.y) ||
      slots && slots.slots.find(p => !occupants.some(c => c.pos.x === p.x && c.pos.y === p.y));
    if (!slot) {creep.memory.task='REMOTE_WAIT_MINING_SPACE';return;}
    creep.memory.task='REMOTE_HARVEST';creep.memory.lastAction=creep.harvest(source);
    if (creep.pos.x !== slot.x || creep.pos.y !== slot.y) movement.approach(creep,new RoomPosition(slot.x,slot.y,op.room),0,memory);
  } else if (creep.memory.role === 'remoteHauler') {
    const drops=creep.room.find(FIND_DROPPED_RESOURCES).filter(r => r.resourceType === RESOURCE_ENERGY && r.pos.inRangeTo(source,2) &&
      r.amount > (reservations.get(r.id)||0)).sort((a,b) => creep.pos.getRangeTo(a)-creep.pos.getRangeTo(b) || a.id.localeCompare(b.id));
    const drop=drops[0];
    if (drop) {
      reservations.set(drop.id,(reservations.get(drop.id)||0)+Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY),drop.amount-(reservations.get(drop.id)||0)));
      creep.memory.task='REMOTE_PICKUP';creep.memory.lastAction=creep.pickup(drop);
      if (creep.memory.lastAction === ERR_NOT_IN_RANGE) movement.approach(creep,drop.pos,1,memory);
    } else if (energy) {creep.memory.working=true;creep.memory.task='REMOTE_RETURN';movement.travel(creep,home,memory);}
    else {creep.memory.task='REMOTE_WAIT_OUTPUT';movement.approach(creep,source.pos,2,memory);}
  }
}
module.exports={run};

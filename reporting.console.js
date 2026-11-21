'use strict';

const territory = require('territory.policy');
const config = require('core.config');

/** Console functions read current Memory at call time, surviving reloads without stale captures. */
function status() {
  const memory = Memory.enclave;
  if (!memory) return { reason: 'NOT_INITIALIZED' };
  const samples = memory.samples.map(s => s.cpu).sort((a, b) => a - b);
  return {
    tick: Game.time, schema: memory.version, home: memory.home, block: memory.block,
    colonies: Object.keys(memory.colonies).length, cpuBucket: Game.cpu.bucket,
    cpu: samples.length ? {
      average: samples.reduce((sum, n) => sum + n, 0) / samples.length,
      p95: samples[Math.ceil(samples.length * 0.95) - 1], peak: samples[samples.length - 1],
      windowTicks: samples.length,
    } : null,
    alerts: memory.alerts,
  };
}

/** @param {string} name */
function roomReport(name) {
  const memory = Memory.enclave;
  const record = memory && memory.colonies[name];
  return record ? { room: name, ...record, observationAge: Game.time - record.lastSeen } : { room: name, reason: 'UNKNOWN_ROOM' };
}

function territoryReport() {
  const memory = Memory.enclave;
  if (!memory) return { reason: 'NOT_INITIALIZED' };
  return {
    total: 81,
    rooms: territory.rooms(memory.block).map(name => ({
      name, ...(memory.intel[name] || { kind: 'unknown' }),
      observationAge: memory.intel[name] ? Game.time - memory.intel[name].lastSeen : null,
      visible: Boolean(Game.rooms[name]),
    })),
  };
}

/** @param {string} name */
function explain(name) {
  const creep = Game.creeps[name];
  return creep ? { creep: name, ...creep.memory } : roomReport(name);
}

function install() {
  global.status = status;
  global.roomReport = roomReport;
  global.territoryReport = territoryReport;
  global.explain = explain;
}

/** Owns the bounded 100-tick CPU sample window. Called after all scheduled work.
 * @param {BotMemory} memory
 */
function record(memory) {
  memory.samples.push({ tick: Game.time, cpu: Game.cpu.getUsed(), bucket: Game.cpu.bucket });
  if (memory.samples.length > 100) memory.samples.splice(0, memory.samples.length - 100);
  if (Game.time % config.reportInterval === 0) {
    const colonies = Object.entries(memory.colonies).map(([name, room]) =>
      `${name} RCL${room.level} ${room.workers}${room.desired === undefined ? '' : '/' + room.desired} creeps ${room.energy}/${room.capacity} energy ${room.reason}`);
    console.log(`[enclave] ${colonies.join(' | ') || 'No owned colonies in configured block'}`);
  }
}

module.exports = { install, record, status, roomReport, territoryReport, explain };

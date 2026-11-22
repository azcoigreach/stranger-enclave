'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness');

test('coordinates round-trip all quadrant boundaries and enumerate only the fixed block', () => {
  const h = harness(), policy = h.load('territory.policy'), block = policy.blockFor('W5N1');
  for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) {
    const p = policy.coordinates(policy.roomName(x, y));
    assert.equal(p.x, x); assert.equal(p.y, y);
  }
  assert.equal(policy.coordinates('W0N0').x, -1);
  assert.equal(policy.coordinates('E0S0').x, 0);
  const rooms = policy.rooms(block);
  assert.equal(new Set(rooms).size, 81);
  for (const name of ['W1N1', 'W9N9', 'W5N1']) assert.ok(rooms.includes(name));
  for (const name of ['W0N1', 'W10N1', 'W5N0', 'E1S1', 'sim']) assert.equal(policy.contains(name, block), false);
  assert.throws(() => policy.validate({ minX: 0, maxX: 9, minY: 0, maxY: 8 }));
});

test('memory cleanup preserves spawning workers and unrelated creep records', () => {
  const h = harness({ creeps: { dead: { role: 'bootstrap' }, spawning: { role: 'bootstrap' }, other: { role: 'other' } } });
  const { spawn } = h.addRoom(); spawn.spawning = { name: 'spawning' };
  h.load('core.memory').initialize();
  assert.equal(h.Memory.creeps.dead, undefined);
  assert.ok(h.Memory.creeps.spawning); assert.ok(h.Memory.creeps.other);
  const persisted = JSON.parse(JSON.stringify(h.Memory));
  const reloaded = harness(persisted); reloaded.addRoom().spawn.spawning = { name: 'spawning' };
  reloaded.load('core.memory').initialize();
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.Memory.enclave)), JSON.parse(JSON.stringify(h.Memory.enclave)));
});

test('unsupported schemas and boundary changes fail without replacing memory', () => {
  const h = harness(); h.addRoom(); const initialize = h.load('core.memory').initialize;
  const memory = initialize(); memory.version = 99;
  assert.throws(initialize, /Unsupported memory/); assert.equal(memory.version, 99);
  memory.version = 2; memory.block.minX++; memory.block.maxX++;
  assert.throws(initialize, /boundary drift/); assert.equal(h.Memory.enclave, memory);
});

test('low bucket defers planning while spawning and workers continue', () => {
  const h = harness(); const { room, spawn } = h.addRoom(); const worker = h.addWorker(room);
  h.Game.cpu.bucket = 0; h.Game.time = 12; // W5N1 planner slot.
  h.load('main').loop();
  assert.equal(spawn.calls.length, 1);
  assert.equal(worker.calls[0].action, 'harvest');
  assert.equal(h.Memory.enclave.colonies.W5N1.planning, 'DEFERRED_CPU');
});

test('a worker fault does not suppress another worker or another colony', () => {
  const h = harness(); const first = h.addRoom(), second = h.addRoom('W4N1');
  const broken = h.addWorker(first.room, 'broken'); const healthy = h.addWorker(first.room, 'healthy');
  broken.harvest = () => { throw new Error('simulated worker fault'); };
  h.load('main').loop();
  assert.ok(healthy.calls.some(call => call.action === 'harvest'));
  assert.equal(second.spawn.calls.length, 1);
  assert.ok(h.Memory.enclave.alerts['worker:broken']);
});

test('unseen room intelligence persists and outside-block colonies receive no intents', () => {
  const h = harness(); h.addRoom(); h.load('core.memory').initialize();
  const outside = h.addRoom('W11N1'); const worker = h.addWorker(outside.room);
  const loop = h.load('main').loop; loop();
  assert.equal(outside.spawn.calls.length, 0); assert.equal(worker.calls.length, 0);
  const observed = h.Memory.enclave.intel.W5N1.lastSeen;
  delete h.Game.rooms.W5N1; h.Game.time++; loop();
  assert.equal(h.Memory.enclave.intel.W5N1.lastSeen, observed);
  const report = h.context.territoryReport();
  assert.equal(report.rooms.length, 81);
  assert.equal(report.rooms.find(r => r.name === 'W5N1').visible, false);
});

test('metrics and alerts stay bounded over repeated ticks and errors', () => {
  const h = harness(); h.addRoom(); const memory = h.load('core.memory').initialize();
  for (let tick = 1; tick <= 250; tick++) {
    h.Game.time = tick;
    h.load('core.runtime').alert(memory, `fault-${tick}`, 'failure');
    h.load('reporting.console').record(memory);
  }
  assert.equal(memory.samples.length, 100); assert.equal(Object.keys(memory.alerts).length, 50);
  const before = h.logs.length;
  for (let i = 0; i < 20; i++) h.load('core.runtime').alert(memory, 'same', 'failure');
  assert.equal(h.logs.length, before + 1);
});

test('a persisted snapshot runs after a global reset and reports missing spawns explicitly', () => {
  const h = harness(); h.addRoom(); h.load('main').loop();
  const restarted = harness(JSON.parse(JSON.stringify(h.Memory)));
  restarted.Game.time = 2; restarted.addRoom(); restarted.Game.spawns = {};
  restarted.load('main').loop();
  assert.equal(restarted.Memory.enclave.colonies.W5N1.reason, 'NO_SPAWN_SUPPORT_REQUIRED');
  assert.ok(restarted.Memory.enclave.alerts['no-spawn']);
  assert.equal(typeof restarted.context.status, 'function');
});

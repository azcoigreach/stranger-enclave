'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position, store } = require('./harness');

function developed() {
  const h = harness(); const home = h.addRoom('E23S47', { level: 2 });
  home.room.energyCapacityAvailable = 550; home.room.energyAvailable = 550;
  for (let i = 0; i < 4; i++) h.addWorker(home.room, `worker${i}`, 50);
  return { h, ...home };
}

test('a developed room keeps investing in source throughput beyond four generalists', () => {
  const { h, spawn } = developed(); h.tick();
  assert.equal(spawn.calls.length, 1, 'full spawn must not sit idle while source mining is understaffed');
  assert.equal(spawn.calls[0].opts.memory.role, 'miner');
  assert.equal(spawn.calls[0].body.filter(part => part === 'work').length, 5);
});

test('a developed room protects controller work while its other workers refill', () => {
  const { h, room, spawn } = developed(); room.energyAvailable = 200; spawn.store.energy = 0;
  h.tick();
  assert.equal(h.Game.creeps.worker0.calls[0].action, 'upgradeController');
  assert.ok(Object.values(h.Game.creeps).slice(1).some(c => c.calls.some(call => call.action === 'transfer')));
});

function specialist(h, room, role, source, body, name = role) {
  const creep = h.addWorker(room, name);
  creep.memory.role = role; creep.memory.sourceId = source.id;
  creep.body = body.map(type => ({ type, hits: 100 }));
  creep.store = store(0, body.filter(type => type === 'carry').length * 50);
  return creep;
}

test('five stationary WORK parts harvest a complete 3000-energy cycle without hauling trips', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  const miner = specialist(h, room, 'miner', source, ['work', 'work', 'work', 'work', 'work', 'move']);
  miner.pos = position(source.pos.x + 1, source.pos.y, room.name);
  let harvested = 0;
  miner.harvest = target => {
    assert.equal(target, source); assert.equal(miner.pos.getRangeTo(source), 1);
    const amount = Math.min(source.energy, miner.getActiveBodyparts('work') * 2);
    harvested += amount; source.energy -= amount; return 0;
  };
  for (let tick = 1; tick <= 300; tick++) {
    h.Game.time = tick;
    h.load('economy.worker').run(miner, h.load('colony.snapshot').create(room), h.load('territory.policy').blockFor(room.name), new Map());
  }
  assert.equal(harvested, 3000); assert.equal(source.energy, 0); assert.equal(miner.calls.length, 0);
  h.load('economy.miner').run(miner, h.load('colony.snapshot').create(room), h.load('territory.policy').blockFor(room.name));
  assert.equal(miner.memory.task, 'WAIT_SOURCE_REGEN');
});

test('hauling demand covers round-trip travel rather than using a fixed creep count', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  source.pos.findPathTo = goal => Array.from({ length: 30 }, () => ({ x: goal.x - 1, y: goal.y }));
  const snapshot = h.load('colony.snapshot').create(room);
  const plan = h.load('economy.demand').plan(snapshot, {});
  assert.equal(plan.sources[0].work, 5);
  assert.equal(plan.sources[0].carry, 13); // 10 energy/tick * (30 out + 30 back + 4 handling) / 50.
  room.getTerrain = () => ({ get: () => 2 });
  const swampPlan = h.load('economy.demand').plan(snapshot, {});
  assert.ok(swampPlan.sources[0].carry > plan.sources[0].carry);
});

test('a miner gets transport before another source is staffed, and pending miners are counted', () => {
  const { h, room, spawn, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  const miner = specialist(h, room, 'miner', source, ['work', 'work', 'work', 'work', 'work', 'move']);
  miner.spawning = true;
  h.tick();
  assert.equal(spawn.calls[0].opts.memory.role, 'hauler');
  assert.equal(spawn.calls[0].opts.memory.sourceId, source.id);
});

test('source routes that fail to reach the goal do not dispatch specialized crews', () => {
  const { h, room, objects } = developed();
  for (const source of objects[h.constants.FIND_SOURCES]) source.pos.findPathTo = () => [];
  const plan = h.load('economy.demand').plan(h.load('colony.snapshot').create(room), {});
  assert.ok(plan.sources.every(s => !s.reachable));
  assert.equal(plan.income, 0);
});

test('haulers reserve pickup amounts and deliver to hungry consumers when spawn stores are full', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  const first = specialist(h, room, 'hauler', source, ['carry', 'carry', 'move', 'move'], 'haul1');
  const second = specialist(h, room, 'hauler', source, ['carry', 'carry', 'move', 'move'], 'haul2');
  const drop = { id: 'drop', pos: position(source.pos.x + 1, source.pos.y, room.name), amount: 100, resourceType: 'energy' };
  objects[h.constants.FIND_DROPPED_RESOURCES] = [drop];
  const snapshot = h.load('colony.snapshot').create(room), block = h.load('territory.policy').blockFor(room.name), jobs = new Map();
  h.load('economy.hauler').run(first, snapshot, block, jobs);
  h.load('economy.hauler').run(second, snapshot, block, jobs);
  assert.equal(first.calls[0].action, 'pickup'); assert.ok(!second.calls.some(c => c.action === 'pickup'));
  first.calls = []; first.store.energy = 100; h.Game.creeps.worker0.store.energy = 0;
  h.load('economy.hauler').run(first, snapshot, block, new Map());
  assert.equal(first.calls[0].action, 'transfer'); assert.equal(first.calls[0].target.name, 'worker0');
});

test('fed consumers stay by their work instead of walking back to mine', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  specialist(h, room, 'miner', source, ['work', 'move']);
  specialist(h, room, 'hauler', source, ['carry', 'move']);
  h.Game.creeps.worker0.store.energy = 0;
  h.Game.creeps.worker0.pos = h.load('economy.stations').forWorker(h.Game.creeps.worker0, h.load('colony.snapshot').create(room));
  h.tick();
  assert.equal(h.Game.creeps.worker0.memory.task, 'WAIT_HAUL_DELIVERY');
  assert.ok(!h.Game.creeps.worker0.calls.some(c => c.action === 'harvest'));
});

test('losing all generalists still requests the affordable 200-energy recovery body', () => {
  const { h, room, spawn, objects } = developed();
  h.Game.creeps = {}; room.energyAvailable = 200;
  specialist(h, room, 'miner', objects[h.constants.FIND_SOURCES][0], ['work', 'work', 'work', 'work', 'work', 'move']);
  h.tick();
  assert.equal(spawn.calls[0].opts.memory.role, 'bootstrap');
  assert.deepEqual(spawn.calls[0].body, ['work', 'carry', 'move']);
});

test('source and upgrade metrics count completed events and track unused energy at regeneration', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  const snapshot = h.load('colony.snapshot').create(room), record = {};
  source.energy = 10; source.ticksToRegeneration = 1;
  h.load('economy.metrics').record(snapshot, record);
  assert.equal(record.economy.harvested, 0); // No assumption that successful intents resolve.
  h.Game.time++; source.energy = 3000; source.ticksToRegeneration = 300;
  room.getEventLog = () => [
    { event: 5, objectId: 'worker0', data: { targetId: source.id, amount: 10 } },
    { event: 9, objectId: 'worker1', data: { amount: 2, energySpent: 2 } },
  ];
  h.load('economy.metrics').record(snapshot, record);
  assert.equal(record.economy.harvested, 10); assert.equal(record.economy.upgradeEnergy, 2);
  assert.equal(record.economy.sources[source.id].unusedLastCycle, 0);
  for (let i = 0; i < 300; i++) { h.Game.time++; h.load('economy.metrics').record(snapshot, record); }
  assert.equal(record.economy.lastWindow.ticks, 300);
  assert.ok(record.economy.ticks <= 300); assert.ok(!('samples' in record.economy));
});

test('specialized production decisions survive reset without duplicate source staffing', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  specialist(h, room, 'miner', source, ['work', 'work', 'work', 'work', 'work', 'move']);
  h.tick(); const before = JSON.parse(JSON.stringify(h.Memory.enclave.colonies[room.name].staffing));
  h.reset(); h.Game.time++; h.tick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.Memory.enclave.colonies[room.name].staffing)), before);
  assert.deepEqual(JSON.parse(JSON.stringify(h.Memory.enclave.alerts)), {});
});

test('fed consumers immediately use partial deliveries instead of waiting for a full carry', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  specialist(h, room, 'miner', source, ['work', 'move']);
  specialist(h, room, 'hauler', source, ['carry', 'move']);
  const worker = h.Game.creeps.worker0; worker.store = store(20, 100); worker.memory.working = false;
  worker.pos = h.load('economy.stations').forWorker(worker, h.load('colony.snapshot').create(room));
  h.tick();
  assert.ok(worker.calls.some(c => c.action === 'upgradeController'), 'a partial delivery must produce controller progress');
});

test('regeneration records unused energy even when a full source hides its timer', () => {
  const { h, room, objects } = developed(); const source = objects[h.constants.FIND_SOURCES][0];
  const snapshot = h.load('colony.snapshot').create(room), record = {};
  source.energy = 500; source.ticksToRegeneration = 1;
  h.load('economy.metrics').record(snapshot, record);
  h.Game.time++; source.energy = 3000; source.ticksToRegeneration = undefined;
  room.getEventLog = () => [{ event: 5, objectId: 'worker0', data: { targetId: source.id, amount: 10 } }];
  h.load('economy.metrics').record(snapshot, record);
  assert.equal(record.economy.sources[source.id].unusedLastCycle, 490);
});

test('controller workers receive distinct positions in upgrade range with reserved delivery access', () => {
  const { h, room, spawn, controller } = developed(); const snapshot = h.load('colony.snapshot').create(room);
  const stations = h.load('economy.stations');
  const spots = snapshot.workers.map(worker => stations.forWorker(worker, snapshot));
  assert.equal(new Set(spots.map(p => `${p.x},${p.y}`)).size, 4);
  assert.ok(spots.every(p => p.getRangeTo(controller) >= 1 && p.getRangeTo(controller) <= 3));
  h.reset();
  assert.deepEqual(snapshot.workers.map(worker => {
    const p = h.load('economy.stations').forWorker(worker, snapshot); return [p.x, p.y];
  }), spots.map(p => [p.x, p.y]));
  spawn.pos.findPathTo = () => []; h.Game.time += 100;
  assert.equal(h.load('economy.stations').forWorker(snapshot.workers[0], snapshot), null);
});

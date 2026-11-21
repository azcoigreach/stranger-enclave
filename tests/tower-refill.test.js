'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position, store } = require('./harness');

function setup(role, energy = 800, capacity = 1000) {
  const h = harness(), home = h.addRoom('E23S47', { level: 3 });
  const consumer = h.addWorker(home.room, 'consumer', 0);
  const supplier = h.addWorker(home.room, 'supplier', 50);
  supplier.memory.role = role;
  supplier.memory.sourceId = home.objects[h.constants.FIND_SOURCES][0].id;
  const tower = { id: 'tower', my: true, structureType: 'tower', pos: position(24, 24, home.room.name), store: store(energy, capacity) };
  home.objects[h.constants.FIND_STRUCTURES].push(tower);
  const run = (creep = supplier, reservations = new Map()) => h.load('economy.worker').run(creep,
    h.load('colony.snapshot').create(home.room), h.load('territory.policy').blockFor(home.room.name), reservations);
  return { h, ...home, consumer, supplier, tower, run };
}

for (const role of ['hauler', 'bootstrap']) {
  test(`${role} refills towers beyond the old cutoffs to actual capacity, including after reset`, () => {
    for (const [energy, capacity] of [[500, 1000], [700, 1000], [999, 1000], [1200, 1500]]) {
      const { h, supplier, tower, run } = setup(role, energy, capacity);
      h.reset(); run();
      assert.equal(supplier.calls[0].action, 'transfer');
      assert.equal(supplier.calls[0].target.id, tower.id);
      assert.equal(supplier.calls[0].amount, Math.min(50, capacity - energy));
    }
  });

  test(`${role} keeps spawn/extension refill priority and resumes ordinary work once towers are full`, () => {
    const { h, room, objects, spawn, supplier, tower, consumer, run } = setup(role);
    spawn.store.energy = 290; run();
    assert.equal(supplier.calls[0].target.id, spawn.id);
    spawn.store.energy = 300; supplier.calls = [];
    const extension = { id: 'extension', my: true, structureType: 'extension', pos: position(24, 24, room.name), store: store(40, 50) };
    objects[h.constants.FIND_STRUCTURES].push(extension); run();
    assert.equal(supplier.calls[0].target.id, extension.id);
    extension.store.energy = 50; supplier.calls = []; tower.store.energy = 1000; run();
    assert.equal(supplier.calls[0].action, role === 'hauler' ? 'transfer' : 'upgradeController');
    if (role === 'hauler') assert.equal(supplier.calls[0].target.id, consumer.id);
  });
}

test('tower top-up reservations limit two haulers to the remaining capacity', () => {
  const { h, room, supplier, tower, run } = setup('hauler', 925);
  const second = h.addWorker(room, 'supplier2', 50); second.memory.role = 'hauler';
  second.memory.sourceId = supplier.memory.sourceId;
  const reservations = new Map(); run(supplier, reservations); run(second, reservations);
  assert.equal(supplier.calls[0].target.id, tower.id); assert.equal(supplier.calls[0].amount, 50);
  assert.equal(second.calls[0].target.id, tower.id); assert.equal(second.calls[0].amount, 25);
  assert.equal(reservations.get(tower.id), 75);
});

test('haulers never top up an unowned tower', () => {
  const { supplier, tower, consumer, run } = setup('hauler'); tower.my = false; run();
  assert.equal(supplier.calls[0].target.id, consumer.id);
});

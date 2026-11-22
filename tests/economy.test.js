'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position, store } = require('./harness');

test('worker extinction spawns a 200-energy rescue body even with high room capacity', () => {
  const h = harness(); const { room, spawn } = h.addRoom(); room.energyAvailable = 200; room.energyCapacityAvailable = 800;
  h.load('main').loop();
  assert.deepEqual(spawn.calls[0].body, ['work', 'carry', 'move']);
  assert.equal(h.Memory.enclave.colonies.W5N1.reason, 'SPAWNING_RECOVERY_WORKER');
});

test('insufficient energy waits with a reason, and only one room spawn receives an order', () => {
  const h = harness(); const { room, spawn } = h.addRoom();
  const extra = { ...spawn, name: 'SecondSpawn', calls: [] }; h.Game.spawns.SecondSpawn = extra;
  room.energyAvailable = 199; h.load('main').loop();
  assert.equal(spawn.calls.length + extra.calls.length, 0);
  assert.equal(h.Memory.enclave.colonies.W5N1.reason, 'WAITING_FOR_200_ENERGY');
  room.energyAvailable = 400; h.Game.time++; h.load('main').loop();
  assert.equal(spawn.calls.length + extra.calls.length, 1);
});

test('pending and healthy workers suppress duplicates; aging workers trigger replacement', () => {
  const h = harness(); const { room, spawn } = h.addRoom();
  for (let i = 0; i < 4; i++) h.addWorker(room, `worker${i}`);
  h.load('main').loop(); assert.equal(spawn.calls.length, 0);
  h.Game.creeps.worker0.ticksToLive = 60; h.Game.time++; h.load('main').loop();
  assert.equal(spawn.calls.length, 1);
  spawn.calls = []; spawn.spawning = { name: 'pending' }; h.Game.time++; h.load('main').loop();
  assert.equal(spawn.calls.length, 0); assert.equal(h.Memory.enclave.colonies.W5N1.reason, 'WORKFORCE_READY');
});

test('delivery reservations prevent two workers from overfilling the same structure', () => {
  const h = harness(); const { room, spawn } = h.addRoom(); spawn.store.energy = 250;
  const first = h.addWorker(room, 'first', 50), second = h.addWorker(room, 'second', 50);
  h.load('main').loop();
  assert.equal(first.calls[0].action, 'transfer'); assert.equal(first.calls[0].amount, 50);
  assert.equal(second.calls[0].action, 'upgradeController');
});

test('empty/full transitions choose harvest then refill; urgent downgrade beats construction', () => {
  const h = harness(); const { room, spawn, controller, objects } = h.addRoom();
  const creep = h.addWorker(room); creep.memory.working = true;
  h.load('main').loop(); assert.equal(creep.calls[0].action, 'harvest'); assert.equal(creep.memory.working, false);
  creep.calls = []; creep.store.energy = 50; spawn.store.energy = 200;
  h.Game.time++; h.load('main').loop(); assert.equal(creep.calls[0].action, 'transfer');
  creep.calls = []; controller.ticksToDowngrade = 100;
  objects[h.constants.FIND_MY_CONSTRUCTION_SITES] = [{ id: 'site', pos: position(25, 26), structureType: 'extension' }];
  h.Game.time++; h.load('main').loop(); assert.equal(creep.calls[0].action, 'upgradeController');
  assert.equal(creep.memory.task, 'PREVENT_DOWNGRADE');
});

test('builders develop sites while one worker keeps upgrading', () => {
  const h = harness(); const { room, objects } = h.addRoom();
  objects[h.constants.FIND_MY_CONSTRUCTION_SITES] = [{ id: 'site', pos: position(25, 26), structureType: 'extension' }];
  const first = h.addWorker(room, 'first', 50), second = h.addWorker(room, 'second', 50);
  h.load('main').loop();
  assert.equal(first.calls[0].action, 'upgradeController'); assert.equal(second.calls[0].action, 'build');
});

test('salvage is collected before harvesting and sources are balanced between workers', () => {
  const h = harness(); const { room, objects } = h.addRoom();
  const first = h.addWorker(room, 'first'), second = h.addWorker(room, 'second');
  h.load('main').loop(); assert.notEqual(first.memory.sourceId, second.memory.sourceId);
  first.calls = []; second.calls = [];
  objects[h.constants.FIND_DROPPED_RESOURCES] = [{ pos: position(24, 24), amount: 50, resourceType: 'energy' }];
  h.Game.time++; h.load('main').loop(); assert.equal(first.calls[0].action, 'pickup');
});

test('partial paths are not accepted as reachable work targets', () => {
  const h = harness(); const { room } = h.addRoom(); const creep = h.addWorker(room);
  creep.pos.findPathTo = () => [{ x: 2, y: 2 }];
  h.load('main').loop();
  assert.equal(creep.calls.length, 0); assert.equal(creep.memory.task, 'NO_REACHABLE_ENERGY');
});

test('movement rejects cross-room targets and blocks edges on local paths', () => {
  const h = harness(); const { room } = h.addRoom(); const creep = h.addWorker(room);
  const movement = h.load('movement.local'), block = h.load('territory.policy').blockFor(room.name);
  assert.equal(movement.move(creep, position(25, 25, 'W4N1'), 1, block), -2);
  assert.equal(creep.calls.length, 0);
  movement.move(creep, position(20, 20), 1, block);
  const opts = creep.calls[0].opts; assert.equal(opts.maxRooms, 1);
  const matrix = new Map(); opts.costCallback('W5N1', { set: (x, y, cost) => matrix.set(`${x},${y}`, cost) });
  assert.equal(matrix.get('0,25'), 255); assert.equal(matrix.get('49,25'), 255);
  h.Game.time++; movement.move(creep, position(20, 20), 1, block);
  const searches=[];creep.pos.findPathTo=(target,options)=>{searches.push(options);return [{x:23,y:24},{x:22,y:23},{x:21,y:22},{x:21,y:21}];};
  h.Game.time++; movement.move(creep, position(20, 20), 1, block);
  assert.equal(searches[0].reusePath,0);assert.equal(creep.calls[2].action,'path');
});

test('tower fire precedes worker actions against a hostile', () => {
  const h = harness(); const { room, objects } = h.addRoom();
  const order = [], enemy = { id: 'enemy', body: [{type:'attack',hits:100}], hits: 100, pos: position(30, 30) };
  objects[h.constants.FIND_HOSTILE_CREEPS] = [enemy];
  objects[h.constants.FIND_STRUCTURES].push({ id: 'tower', isActive:()=>true, pos: position(26, 25), structureType: 'tower', my: true, store: store(1000, 1000),
    attack: target => { assert.equal(target, enemy); order.push('tower'); } });
  h.addWorker(room).harvest = () => { order.push('worker'); return 0; };
  h.load('main').loop(); assert.deepEqual(order, ['tower', 'worker']);
});

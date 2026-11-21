'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position } = require('./harness');

function formation() {
  const h = harness(), home = h.addRoom('E23S47', { level: 3 });
  home.room.energyCapacityAvailable = 550;
  const carrier = h.addWorker(home.room, 'carrier'); carrier.memory.role = 'hauler';
  carrier.memory.sourceId = home.objects[h.constants.FIND_SOURCES][0].id;
  carrier.pos = position(10, 9, home.room.name);
  carrier.body = [{ type: 'carry', hits: 100 }, { type: 'move', hits: 100 }];
  const ring = [];
  for (let x = 8; x <= 12; x++) for (let y = 8; y <= 12; y++) {
    if (Math.max(Math.abs(x - 10), Math.abs(y - 10)) !== 2) continue;
    const worker = h.addWorker(home.room, `worker-${x}-${y}`, 20);
    worker.pos = position(x, y, home.room.name); ring.push(worker);
  }
  return { h, ...home, carrier, ring };
}

const offsets = { 1: [0, -1], 2: [1, -1], 3: [1, 0], 4: [1, 1], 5: [0, 1], 6: [-1, 1], 7: [-1, 0], 8: [-1, -1] };
function directMove(creep) { return creep.calls.filter(c => c.action === 'step'); }
function destination(creep, call) {
  const [dx, dy] = offsets[call.direction]; return [creep.pos.x + dx, creep.pos.y + dy];
}

test('a carrier enclosed by upgraders escapes via a coordinated swap, including after reset', () => {
  for (const reset of [false, true]) {
    const { h, carrier, ring, controller } = formation();
    if (reset) h.reset();
    h.tick();
    assert.equal(directMove(carrier).length, 1, 'trapped carrier needs an escape intent');
    const next = destination(carrier, directMove(carrier)[0]);
    const yielding = ring.find(c => c.pos.x === next[0] && c.pos.y === next[1]);
    assert.ok(yielding, 'the occupied ring must open');
    assert.equal(directMove(yielding).length, 1);
    assert.deepEqual(destination(yielding, directMove(yielding)[0]), [carrier.pos.x, carrier.pos.y]);
    assert.ok(![carrier, yielding].some(c => c.calls.some(call => call.action === 'move')), 'normal role must not overwrite swap');
    // Resolve only the explicit two-creep swap; this is not an engine simulation.
    const old = carrier.pos; carrier.pos = yielding.pos; yielding.pos = old;
    for (const creep of Object.values(h.Game.creeps)) creep.calls = [];
    h.Game.time++; h.reset(); h.tick();
    assert.equal(directMove(carrier).length, 1);
    const outside = destination(carrier, directMove(carrier)[0]);
    assert.equal(controller.pos.getRangeTo(outside[0], outside[1]), 3);
  }
});

test('carrier paths block occupied worker tiles and discard cached paths near the formation', () => {
  const { h, room, carrier } = formation(); carrier.pos = position(10, 7, room.name);
  h.load('movement.local').move(carrier, position(10, 8, room.name), 1, h.load('territory.policy').blockFor(room.name));
  const options = carrier.calls[0].opts;
  const costs = new Map(); options.costCallback(room.name, { set(x, y, cost) { costs.set(`${x},${y}`, cost); } });
  for (let x = 8; x <= 12; x++) for (let y = 8; y <= 12; y++) {
    if (Math.max(Math.abs(x - 10), Math.abs(y - 10)) === 2) assert.equal(costs.get(`${x},${y}`), 255);
  }
  assert.equal(options.reusePath, 0); assert.equal(options.ignoreCreeps, false);
});

test('escape waits rather than moving a fatigued upgrader or entering an impassable ring', () => {
  const { h, carrier, ring } = formation();
  for (const worker of ring) worker.fatigue = 10;
  h.tick();
  assert.equal(directMove(carrier).length, 0);
  assert.equal(carrier.memory.task, 'WAIT_CONTROLLER_EXIT');
  assert.ok(ring.every(c => directMove(c).length === 0));
});

test('escape refuses walls and exits disconnected from the colony', () => {
  for (const obstacle of ['wall', 'disconnected']) {
    const { h, room, spawn, carrier, ring } = formation();
    if (obstacle === 'wall') room.getTerrain = () => ({ get: (x, y) => Math.max(Math.abs(x - 10), Math.abs(y - 10)) === 2 ? 1 : 0 });
    else spawn.pos.findPathTo = () => [];
    h.tick();
    assert.equal(carrier.memory.task, 'WAIT_CONTROLLER_EXIT');
    assert.equal(directMove(carrier).length, 0);
    assert.ok(ring.every(c => directMove(c).length === 0));
  }
});

test('traffic recovery respects the persisted block and creep home', () => {
  const { h, room, carrier, ring } = formation();
  const traffic = h.load('movement.controller'), snapshot = h.load('colony.snapshot').create(room);
  traffic.run(snapshot, h.load('territory.policy').blockFor('W25N47'), new Map());
  assert.equal(directMove(carrier).length, 0);
  carrier.memory.home = 'E24S47';
  traffic.run(snapshot, h.load('territory.policy').blockFor(room.name), new Map());
  assert.equal(directMove(carrier).length, 0);
  assert.ok(ring.every(c => directMove(c).length === 0));
});


test('storage distributors receive the same formation escape protection as source haulers',()=>{
  const {h,carrier,ring}=formation();carrier.memory.role='distributor';delete carrier.memory.sourceId;
  h.tick();assert.equal(directMove(carrier).length,1);
  const next=destination(carrier,directMove(carrier)[0]);
  const yielding=ring.find(c=>c.pos.x===next[0] && c.pos.y===next[1]);
  assert.ok(yielding);assert.equal(directMove(yielding).length,1);
  assert.ok(!carrier.calls.some(c=>c.action==='move'),'distributor must not overwrite its escape');
});

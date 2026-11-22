'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position, store } = require('./harness');

function setup(role = 'miner') {
  const h = harness(), home = h.addRoom('E23S47');
  const [first, second] = home.objects[h.constants.FIND_SOURCES];
  home.room.getTerrain = () => ({ get(x, y) {
    return Math.max(Math.abs(x - first.pos.x), Math.abs(y - first.pos.y)) === 1 && !(x === 21 && y === 20) ? 1 : 0;
  } });
  const incumbent = h.addWorker(home.room, 'z-incumbent'), incoming = h.addWorker(home.room, 'a-incoming');
  for (const creep of [incumbent, incoming]) {
    creep.memory.role = role; creep.memory.sourceId = first.id;
    if (role === 'miner') { creep.body = [{ type: 'work', hits: 100 }, { type: 'move', hits: 100 }]; creep.store = store(0, 0); }
  }
  incumbent.pos = position(21, 20, home.room.name);
  incoming.actionResults.harvest = -9;
  const run = () => {
    const colony = h.load('colony.snapshot').create(home.room), reservations = new Map();
    for (const creep of colony.workers) h.load('economy.worker').run(creep, colony, h.load('territory.policy').blockFor(home.room.name), reservations);
  };
  return { h, ...home, first, second, incumbent, incoming, run };
}

for (const role of ['miner', 'bootstrap']) test(`${role} keeps the occupant of a one-slot source and redirects the incoming harvester`, () => {
  const { h, first, second, incumbent, incoming, run } = setup(role);
  run();
  assert.equal(incumbent.memory.sourceId, first.id);
  assert.ok(incumbent.calls.some(c => c.action === 'harvest' && c.target.id === first.id));
  assert.equal(incoming.memory.sourceId, second.id, 'do not queue two harvesters for one usable tile');
  assert.ok(incoming.memory.miningSpot);
  const move = incoming.calls.find(c => c.action === 'move');
  assert.ok(move); assert.equal(move.opts.range, 0);
  const spot = JSON.parse(JSON.stringify(incoming.memory.miningSpot));
  h.Game.time++; h.reset(); incumbent.calls = []; incoming.calls = []; run();
  assert.deepEqual(JSON.parse(JSON.stringify(incoming.memory.miningSpot)), spot);
});

test('two incoming miners reserve different tiles before either reaches the source', () => {
  const { first, incumbent, incoming, run, room } = setup();
  room.getTerrain = () => ({ get: () => 0 }); incumbent.pos = position(24, 25, room.name);
  run();
  assert.equal(incumbent.memory.sourceId, first.id); assert.equal(incoming.memory.sourceId, first.id);
  assert.ok(incumbent.memory.miningSpot); assert.ok(incoming.memory.miningSpot);
  assert.notDeepEqual(JSON.parse(JSON.stringify(incumbent.memory.miningSpot)), JSON.parse(JSON.stringify(incoming.memory.miningSpot)));
});

test('geometry excludes walls and blocking structures, accepts containers, and rejects disconnected tiles', () => {
  const { h, room, objects, spawn, first } = setup();
  const mining = h.load('economy.mining');
  const geometry = () => mining.slots(h.load('colony.snapshot').create(room)).get(first.id);
  assert.equal(geometry().length, 1);
  const building = { id: 'building', pos: position(21, 20, room.name), structureType: 'container', my: true };
  objects[h.constants.FIND_STRUCTURES].push(building); assert.equal(geometry().length, 1);
  building.structureType = 'extension'; assert.equal(geometry().length, 0);
  objects[h.constants.FIND_STRUCTURES].pop(); spawn.pos.findPathTo = () => []; h.Game.time += 100;
  assert.equal(geometry().length, 0);
});

test('a blocked source never assigns the tile occupied by another creep', () => {
  const { h, room, objects, first, second, incumbent, incoming, run } = setup();
  delete h.Game.creeps[incumbent.name];
  objects[h.constants.FIND_CREEPS] = [{ id: 'outsider', pos: position(21, 20, room.name) }];
  run(); assert.equal(incoming.memory.sourceId, second.id);
  assert.notEqual(incoming.memory.sourceId, first.id);
});

test('when all slots are occupied the extra miner waits and takes the released slot next tick', () => {
  const { h, room, objects, first, incumbent, incoming, run } = setup();
  objects[h.constants.FIND_SOURCES] = [first];
  run(); assert.equal(incoming.memory.task, 'WAIT_MINING_SLOT');
  assert.ok(!incoming.calls.some(c => c.action === 'harvest'));
  assert.equal(incoming.calls[0].opts.range, 2); assert.equal(incoming.memory.miningSpot, undefined);
  delete h.Game.creeps[incumbent.name]; h.Game.time++; h.reset(); incoming.calls = []; run();
  assert.equal(incoming.memory.sourceId, first.id);
  assert.deepEqual(JSON.parse(JSON.stringify(incoming.memory.miningSpot)), { x: 21, y: 20 });
  assert.equal(incoming.calls[0].opts.range, 0);
});

test('slot-limited production does not add a second weak miner but allows one aging replacement', () => {
  const { h, room, objects, first, incumbent, incoming } = setup();
  objects[h.constants.FIND_SOURCES] = [first]; delete h.Game.creeps[incoming.name];
  room.energyCapacityAvailable = 300;
  const request = () => {
    const colony = h.load('colony.snapshot').create(room);
    const plan = h.load('economy.demand').plan(colony, {});
    assert.equal(plan.sources[0].slots, 1);
    return h.load('economy.production').request(colony, plan);
  };
  assert.notEqual(request()?.role, 'miner');
  incumbent.ticksToLive = 1; h.Game.time++;
  assert.equal(request()?.role, 'miner');
  const replacement = h.addWorker(room, 'replacement'); replacement.memory.role = 'miner';
  replacement.memory.sourceId = first.id; replacement.spawning = true;
  h.Game.time++; assert.notEqual(request()?.role, 'miner');
});

test('replacement waits instead of oversupplying another fully staffed source', () => {
  const { h, room, first, second, incumbent, incoming, run } = setup();
  const other = h.addWorker(room, 'other'); other.memory.role = 'miner'; other.memory.sourceId = second.id;
  other.body = Array.from({ length: 5 }, () => ({ type: 'work', hits: 100 }));
  other.pos = position(second.pos.x + 1, second.pos.y, room.name);
  run();
  assert.equal(incoming.memory.sourceId, first.id); assert.equal(incoming.memory.task, 'WAIT_MINING_SLOT');
  assert.equal(incumbent.memory.sourceId, first.id);
});

test('slot assignments do not depend on creep insertion order or global caches', () => {
  const results = [];
  for (const reverse of [false, true]) {
    const { h, incoming, incumbent, run } = setup();
    if (reverse) { h.Game.creeps = Object.fromEntries(Object.entries(h.Game.creeps).reverse()); h.reset(); }
    run(); results.push(JSON.stringify([incoming.memory, incumbent.memory]));
  }
  assert.equal(results[0], results[1]);
});

test('a waiting replacement approaches range two so it can take over without another long trip', () => {
  const { h, room, objects, first, incoming, run } = setup();
  objects[h.constants.FIND_SOURCES] = [first]; run();
  assert.equal(incoming.memory.task, 'WAIT_MINING_SLOT');
  const move = incoming.calls.find(c => c.action === 'move');
  assert.ok(move); assert.equal(move.opts.range, 2);
  assert.equal(move.target.x, first.pos.x); assert.equal(move.target.y, first.pos.y);
  assert.ok(!incoming.calls.some(c => c.action === 'harvest'));
});

test('routes to free tiles cannot pass through a stationary harvester', () => {
  const { incumbent, incoming, run } = setup();
  let checked = false;
  incoming.pos.findPathTo = (x, y, options) => {
    const costs = new Map();
    if (options.costCallback) options.costCallback(incoming.room.name, { set: (a, b, cost) => costs.set(`${a},${b}`, cost) });
    assert.equal(costs.get(`${incumbent.pos.x},${incumbent.pos.y}`), 255);
    checked = true; return [{ x, y }];
  };
  run(); assert.ok(checked);
});

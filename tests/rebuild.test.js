'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position, store } = require('./harness');

function setup(type = 'extension') {
  const h = harness(), home = h.addRoom('E23S47', { level: 3 });
  const structure = { id: 'original', structureType: type, my: true, pos: position(29, 26, home.room.name), store: store(1000, 1000) };
  home.objects[h.constants.FIND_STRUCTURES].push(structure);
  // Explicitly materialize accepted site intents for subsequent fixture ticks.
  home.room.createConstructionSite = (x, y, type) => {
    home.room.siteCalls.push({ x, y, type });
    const site = { id: `site-${type}-${x}-${y}`, structureType: type, my: true, pos: position(x, y, home.room.name) };
    if (!home.objects[h.constants.FIND_MY_CONSTRUCTION_SITES]) home.objects[h.constants.FIND_MY_CONSTRUCTION_SITES] = [];
    home.objects[h.constants.FIND_MY_CONSTRUCTION_SITES].push(site);
    return 0;
  };
  const run = record => h.load('planning.bootstrap').run(h.load('colony.snapshot').create(home.room), record, () => true);
  return { h, ...home, structure, run };
}

for (const type of ['extension', 'tower']) test(`destroyed ${type} is rebuilt on its original tile after memory/global reset`, () => {
  const { h, room, objects, structure, run } = setup(type);
  const record = {}; run(record);
  objects[h.constants.FIND_STRUCTURES] = objects[h.constants.FIND_STRUCTURES].filter(s => s !== structure);
  room.siteCalls = []; h.reset();
  const saved = JSON.parse(JSON.stringify(record)); saved.plannerCursor = 300;
  run(saved);
  assert.deepEqual(room.siteCalls, [{ x: 29, y: 26, type }]);
});

test('the initial spawn location can be restored after the last spawn is destroyed', () => {
  const { h, room, objects, spawn, run } = setup();
  const record = {}; run(record);
  h.Game.spawns = {}; objects[h.constants.FIND_STRUCTURES] = objects[h.constants.FIND_STRUCTURES].filter(s => s !== spawn);
  room.siteCalls = []; h.reset(); run(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(room.siteCalls, [{ x: 25, y: 25, type: 'spawn' }]);
});

test('surviving miners keep harvesting while the missing spawn is being rebuilt', () => {
  const { h, room, objects, spawn } = setup();
  const source = objects[h.constants.FIND_SOURCES][0];
  const miner = h.addWorker(room, 'survivor'); miner.memory.role = 'miner'; miner.memory.sourceId = source.id;
  miner.pos = position(source.pos.x + 1, source.pos.y, room.name);
  delete h.Game.spawns[spawn.name]; objects[h.constants.FIND_STRUCTURES] = objects[h.constants.FIND_STRUCTURES].filter(s => s !== spawn);
  h.load('economy.miner').run(miner, h.load('colony.snapshot').create(room), h.load('territory.policy').blockFor(room.name));
  assert.ok(miner.calls.some(c => c.action === 'harvest'));
});

test('layout capture runs despite low CPU and persists through missing vision', () => {
  const { h, room } = setup(); h.Game.cpu.bucket = 0; h.Game.time = 15; h.tick();
  const layout = JSON.parse(JSON.stringify(h.Memory.enclave.colonies[room.name].layout));
  assert.ok(layout.buildings.some(b => b.type === 'extension' && b.x === 29 && b.y === 26));
  assert.equal(h.Memory.enclave.colonies[room.name].planning, 'DEFERRED_CPU');
  delete h.Game.rooms[room.name]; h.Game.time++; h.reset(); h.tick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.Memory.enclave.colonies[room.name].layout)), layout);
  assert.ok(layout.buildings.every(b => Object.keys(b).sort().join(',') === 'type,x,y'));
});

test('successful planned sites are remembered immediately and restored if removed', () => {
  const { h, room, objects, run } = setup(); const record = {};
  for (let i = 0; i < 10 && !room.siteCalls.length; i++) run(record);
  assert.equal(room.siteCalls.length, 1);
  const first = { ...room.siteCalls[0] };
  assert.ok(record.layout.buildings.some(b => b.type === first.type && b.x === first.x && b.y === first.y));
  objects[h.constants.FIND_MY_CONSTRUCTION_SITES] = []; room.siteCalls = []; h.reset(); run(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(room.siteCalls, [first]);
});

test('existing reconstruction sites prevent duplicate placement at the saved tile', () => {
  const { h, room, objects, structure, run } = setup('tower'), record = {};
  h.load('planning.layout').observe(h.load('colony.snapshot').create(room), record);
  objects[h.constants.FIND_STRUCTURES] = objects[h.constants.FIND_STRUCTURES].filter(s => s !== structure);
  run(record); room.siteCalls = []; h.Game.time++; h.reset(); run(JSON.parse(JSON.stringify(record)));
  assert.ok(room.siteCalls.every(site => site.x !== 29 || site.y !== 26 || site.type !== 'tower'));
});

test('failed reconstruction retains its original tile and does not advance the placement search', () => {
  const { h, room, objects, structure, run } = setup('tower'), record = { plannerCursor: 73 };
  h.load('planning.layout').observe(h.load('colony.snapshot').create(room), record);
  objects[h.constants.FIND_STRUCTURES] = objects[h.constants.FIND_STRUCTURES].filter(s => s !== structure);
  room.createConstructionSite = (x, y, type) => { room.siteCalls.push({ x, y, type }); return -7; };
  run(record);
  assert.deepEqual(room.siteCalls, [{ x: 29, y: 26, type: 'tower' }]);
  assert.equal(record.plannerCursor, 73); assert.equal(record.planning, 'REBUILD_FAILED_-7_tower_29_26');
  room.siteCalls = []; h.reset(); run(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(room.siteCalls, [{ x: 29, y: 26, type: 'tower' }]);
});

test('rebuilding honors room limits, threats, global site cap, and CPU without losing the layout', () => {
  for (const gate of ['rcl', 'hostiles', 'siteCap', 'cpu']) {
    const { h, room, objects, structure, controller } = setup('tower'), record = {};
    h.load('planning.layout').observe(h.load('colony.snapshot').create(room), record);
    objects[h.constants.FIND_STRUCTURES] = objects[h.constants.FIND_STRUCTURES].filter(s => s !== structure);
    if (gate === 'rcl') controller.level = 2;
    if (gate === 'hostiles') objects[h.constants.FIND_HOSTILE_CREEPS] = [{}];
    if (gate === 'siteCap') for (let i = 0; i < 100; i++) h.Game.constructionSites[i] = {};
    h.load('planning.bootstrap').run(h.load('colony.snapshot').create(room), record, () => gate !== 'cpu');
    assert.equal(room.siteCalls.length, 0); assert.ok(record.layout.buildings.some(b => b.type === 'tower'));
    assert.equal(record.planning, { rcl: 'REBUILD_LIMIT_tower_29_26', hostiles: 'HOSTILES_PRESENT', siteCap: 'CONSTRUCTION_BACKLOG', cpu: 'REBUILD_DEFERRED_CPU' }[gate]);
  }
});

test('layout capture is idempotent and excludes enemy buildings while retaining neutral roads', () => {
  const { h, room, objects } = setup(), record = {};
  objects[h.constants.FIND_STRUCTURES].push(
    { id: 'enemy', structureType: 'tower', my: false, pos: position(30, 30, room.name) },
    { id: 'road', structureType: 'road', pos: position(30, 31, room.name) });
  const observe = () => h.load('planning.layout').observe(h.load('colony.snapshot').create(room), record);
  observe(); const saved = JSON.stringify(record.layout); observe();
  assert.equal(JSON.stringify(record.layout), saved);
  assert.ok(record.layout.buildings.some(b => b.type === 'road'));
  assert.ok(!record.layout.buildings.some(b => b.type === 'tower'));
});

test('a rejected new placement is not saved as established infrastructure', () => {
  const { room, run } = setup(), record = {};
  room.createConstructionSite = () => -7;
  for (let i = 0; i < 10 && !String(record.planning).startsWith('SITE_FAILED'); i++) run(record);
  assert.equal(record.planning, 'SITE_FAILED_-7');
  assert.equal(record.layout.buildings.length, 2);
});

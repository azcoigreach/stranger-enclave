'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness } = require('./harness');

const plain = value => JSON.parse(JSON.stringify(value));

test('sector discovery works across all quadrants and multiple sector offsets', () => {
  const policy = harness().load('territory.policy');
  for (const horizontal of ['E', 'W']) for (const vertical of ['N', 'S']) {
    for (const xBase of [0, 10, 40, 120]) for (const yBase of [0, 20, 90]) {
      for (const offset of [1, 5, 9]) {
        const home = `${horizontal}${xBase + offset}${vertical}${yBase + offset}`;
        const block = policy.blockFor(home), rooms = new Set(policy.rooms(block));
        assert.equal(rooms.size, 81);
        for (let x = 1; x <= 9; x++) for (let y = 1; y <= 9; y++) {
          assert.ok(rooms.has(`${horizontal}${xBase + x}${vertical}${yBase + y}`), home);
        }
        for (const x of [xBase, xBase + 10]) assert.equal(policy.contains(`${horizontal}${x}${vertical}${yBase + offset}`, block), false);
        for (const y of [yBase, yBase + 10]) assert.equal(policy.contains(`${horizontal}${xBase + offset}${vertical}${y}`, block), false);
      }
    }
  }
});

test('highways, malformed names, and simulation names never establish a sector', () => {
  const policy = harness().load('territory.policy');
  for (const name of ['W0N1', 'E10S25', 'E11N0', 'W34N90', 'W0N0', 'sim', 'E01S1', 'N4W5', 'E1S-1']) {
    assert.throws(() => policy.blockFor(name), undefined, name);
  }
});

for (const home of ['E23S47', 'W73N12', 'E91N89', 'W19S31']) {
  test(`fresh deployment in ${home} initializes and runs without configuration edits`, () => {
    const h = harness(); const { room, spawn } = h.addRoom(home); const worker = h.addWorker(room);
    const outside = h.load('territory.policy').roomName(
      h.load('territory.policy').blockFor(home).maxX + 2,
      h.load('territory.policy').blockFor(home).minY,
    );
    h.load('main').loop();
    assert.equal(h.Memory.enclave.home, home);
    assert.equal(h.Memory.enclave.version, 2);
    assert.equal(h.context.status().home, home);
    assert.equal(spawn.calls.length, 1);
    assert.ok(worker.calls.some(call => call.action === 'harvest'));
    assert.equal(h.context.territoryReport().rooms.length, 81);
    const other = h.addRoom(outside); const ignored = h.addWorker(other.room, 'outside-worker');
    h.Game.time++; h.load('main').loop();
    assert.equal(other.spawn.calls.length, 0); assert.equal(ignored.calls.length, 0);
    assert.equal(h.Memory.enclave.home, home);
  });
}

test('empty memory waits for a spawn and retries automatically once one exists', () => {
  const h = harness(); const initialize = h.load('core.memory').initialize;
  assert.throws(initialize, /WAITING_FOR_INITIAL_SPAWN/);
  assert.equal(h.Memory.enclave, undefined);
  h.addRoom('E23S47'); assert.equal(initialize().home, 'E23S47');
});

test('spawn enumeration order and names do not affect same-sector selection', () => {
  const homes = [];
  for (const order of [['E29S49', 'E21S41'], ['E21S41', 'E29S49']]) {
    const h = harness(); order.forEach(name => h.addRoom(name));
    homes.push(h.load('core.memory').initialize().home);
  }
  assert.deepEqual(homes, ['E21S41', 'E21S41']);
});

test('multiple fresh sectors are ambiguous and cause no game intents or memory initialization', () => {
  const h = harness(); const first = h.addRoom('W5N1'), second = h.addRoom('E23S47');
  assert.throws(() => h.load('core.memory').initialize(), /AMBIGUOUS_START_BLOCK/);
  h.load('main').loop();
  assert.equal(first.spawn.calls.length, 0); assert.equal(second.spawn.calls.length, 0);
  assert.equal(h.Memory.enclave, undefined);
});

test('hostile or unowned spawns cannot determine home', () => {
  const h = harness(); h.addRoom('E23S47'); const other = h.addRoom('W5N1'); other.spawn.my = false;
  assert.equal(h.load('core.memory').initialize().home, 'E23S47');
});

test('spawn loss, rebuilding elsewhere, and global resets preserve the original boundary', () => {
  const h = harness(); h.addRoom('E23S47'); const original = plain(h.load('core.memory').initialize());
  h.Game.spawns = {}; h.Game.rooms = {};
  assert.equal(h.load('core.memory').initialize().home, original.home);
  const restarted = harness(plain(h.Memory)); restarted.addRoom('W5N1');
  restarted.load('main').loop();
  assert.equal(restarted.Memory.enclave.home, original.home);
  assert.deepEqual(plain(restarted.Memory.enclave.block), original.block);
  assert.equal(Object.values(restarted.Game.spawns)[0].calls.length, 0);
});

test('schema 1 fixture migrates without resetting territory, economy, or worker memory', () => {
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/memory-v1.json'), 'utf8'));
  const before = plain(saved), h = harness(saved); h.addRoom();
  h.Game.creeps.legacyWorker = { memory: saved.creeps.legacyWorker };
  const migrated = h.load('core.memory').initialize();
  assert.equal(migrated.version, 2); assert.equal(migrated.home, 'W5N1');
  assert.deepEqual(plain(migrated), { ...before.enclave, version: 2, home: 'W5N1' });
  assert.deepEqual(plain(h.Memory.creeps), before.creeps);
  h.load('core.memory').initialize(); // Migration is idempotent.
  assert.deepEqual(plain(migrated), { ...before.enclave, version: 2, home: 'W5N1' });
});

test('legacy migration uses saved territory even if only an outside spawn survives', () => {
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/memory-v1.json'), 'utf8'));
  const h = harness(saved); h.addRoom('E23S47');
  const memory = h.load('core.memory').initialize();
  assert.equal(memory.home, 'W5N1'); assert.equal(memory.block.minX, -10);
});

test('invalid legacy boundaries fail migration without partial writes', () => {
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/memory-v1.json'), 'utf8'));
  saved.enclave.block.minX++; saved.enclave.block.maxX++;
  const before = plain(saved), h = harness(saved); h.addRoom();
  assert.throws(() => h.load('core.memory').initialize(), /boundary drift/);
  assert.deepEqual(plain(h.Memory), before);
});

test('root game modules contain no deployment-specific room literals', () => {
  const root = path.join(__dirname, '..');
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, name), 'utf8'), /['"`][WE]\d+[NS]\d+['"`]/, name);
  }
});

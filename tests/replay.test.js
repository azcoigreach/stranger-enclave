'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./harness');
const { replay } = require('./replay');

for (const name of ['bootstrap-replay', 'priority-replay']) {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
  test(`${fixture.name}: expected outcomes and identical repeated traces`, () => {
    assert.deepEqual(replay(fixture), replay(fixture));
  });
  test(`${fixture.name}: resets and insertion order preserve intents and saved state`, () => {
    const normal = replay(fixture);
    assert.deepEqual(replay(fixture, { resetEveryTick: true, reverseInsertion: true }), normal);
  });
}

test('fixture runtime rejects ambient clock, random numbers, and external imports', () => {
  const h = harness();
  for (const expression of ['Date.now()', 'new Date()', 'Date()', 'Math.random()']) {
    assert.throws(() => vm.runInContext(expression, h.context), /Nondeterministic API/);
  }
  assert.equal(h.violations.length, 4);
  assert.throws(() => h.load('node:fs'), /Non-game import/);
  assert.throws(() => h.load('../main'), /Non-game import/);
});

test('runtime reset discards globals/modules and rebinds workers to serialized memory', () => {
  const h = harness(); const { room } = h.addRoom(); const worker = h.addWorker(room);
  h.tick(); const oldModule = h.load('main'); const oldMemory = worker.memory;
  h.context.fixtureLeak = 123; h.Memory.discarded = undefined;
  h.reset();
  assert.equal(h.context.fixtureLeak, undefined); assert.notEqual(h.load('main'), oldModule);
  assert.notEqual(worker.memory, oldMemory); assert.equal(worker.memory, h.Memory.creeps.worker);
  assert.equal('discarded' in h.Memory, false);
  h.Game.time++; h.tick(); assert.deepEqual(h.violations, []);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { replay } = require('./replay');

/** These small, explicit mutations prove the regression assertions reject known bugs.
 * Sources are replaced only in a test VM. Nothing writes to live game modules.
 */
const mutations = [
  {
    name: 'oversized emergency bodies', module: 'economy.spawn', fixture: 'bootstrap-replay',
    from: 'active < 2 ? 1 : config.maxWorkerUnits', to: 'config.maxWorkerUnits',
    failure: /spawnBodies at tick 30/,
  },
  {
    name: 'lost downgrade protection', module: 'economy.worker', fixture: 'priority-replay',
    from: 'controller.ticksToDowngrade < config.downgradeUrgency', to: 'false',
    failure: /tasks at tick 4/,
  },
  {
    name: 'duplicate delivery allocation', module: 'economy.worker', fixture: 'priority-replay',
    from: '> (deliveries.get(s.id) || 0)', to: '> 0',
    failure: /actions at tick 1/,
  },
  {
    name: 'spawn results falsely reported as success', module: 'economy.spawn', fixture: 'bootstrap-replay',
    from: "result === OK ? (request ?", to: "true ? (request ?",
    failure: /spawnReason at tick 13/,
  },
];

for (const mutation of mutations) {
  test(`regression sentinel catches ${mutation.name}`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', `${mutation.module}.js`), 'utf8');
    assert.ok(source.includes(mutation.from), 'Mutation target changed; review/update this sentinel, do not silently skip it');
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${mutation.fixture}.json`), 'utf8'));
    assert.throws(() => replay(fixture, { sources: { [mutation.module]: source.replace(mutation.from, mutation.to) } }), error => {
      assert.equal(error.code, 'ERR_ASSERTION', 'A crash is not proof that the behavior assertion caught the bug');
      assert.match(error.message, mutation.failure);
      return true;
    });
  });
}

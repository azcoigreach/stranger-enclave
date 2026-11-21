'use strict';

const assert = require('node:assert/strict');
const { harness, position } = require('./harness');
const clone = value => JSON.parse(JSON.stringify(value));

/** Replay recorded INPUT states through the real tick loop. This is not an engine:
 * action results, energy changes, deaths, and spawn completions are explicit inputs.
 * The fixture owns expected outcomes; it never regenerates them from the bot.
 */
function replay(fixture, options = {}) {
  const h = harness({}, { sources: options.sources });
  const { room, spawn, controller, objects } = h.addRoom(fixture.room);
  const trace = [];
  const allowedStepKeys = new Set(['tick', 'energy', 'spawnEnergy', 'spawnResult', 'spawning', 'workers', 'bucket', 'downgrade', 'site', 'expect']);
  for (const [index, step] of fixture.steps.entries()) {
    for (const key of Object.keys(step)) assert.ok(allowedStepKeys.has(key), `Unknown fixture field: ${key}`);
    assert.ok(Number.isInteger(step.tick) && (index === 0 || step.tick > fixture.steps[index - 1].tick), 'Fixture ticks must increase');
    if (options.resetEveryTick && index) h.reset();
    h.Game.time = step.tick;
    if ('energy' in step) room.energyAvailable = step.energy;
    if ('spawnEnergy' in step) spawn.store.energy = step.spawnEnergy;
    if ('spawnResult' in step) spawn.result = step.spawnResult;
    if ('spawning' in step) spawn.spawning = step.spawning ? { name: step.spawning } : null;
    if ('bucket' in step) h.Game.cpu.bucket = step.bucket;
    if ('downgrade' in step) controller.ticksToDowngrade = step.downgrade;
    if ('site' in step) objects[h.constants.FIND_MY_CONSTRUCTION_SITES] = step.site
      ? [{ id: 'fixture-site', pos: position(25, 26, room.name), structureType: 'extension' }] : [];
    const changes = Object.entries(step.workers || {});
    if (options.reverseInsertion) changes.reverse();
    for (const [name, state] of changes) {
      for (const key of Object.keys(state)) assert.ok(['remove', 'energy', 'spawning', 'actionResults'].includes(key), `Unknown worker field: ${key}`);
      if (state.remove) { delete h.Game.creeps[name]; continue; }
      const worker = h.Game.creeps[name] || h.addWorker(room, name, state.energy || 0);
      if ('energy' in state) worker.store.energy = state.energy;
      if ('spawning' in state) worker.spawning = state.spawning;
      if ('actionResults' in state) worker.actionResults = { ...state.actionResults };
    }
    spawn.calls = [];
    for (const worker of Object.values(h.Game.creeps)) worker.calls = [];
    h.tick();
    assert.deepEqual(h.violations, [], `${fixture.name}: nondeterministic API`);
    const colony = h.Memory.enclave?.colonies[fixture.room];
    assert.ok(colony, `${fixture.name}: missing colony at tick ${step.tick}`);
    assert.deepEqual(clone(h.Memory.enclave.alerts), {}, `${fixture.name}: unexpected bot fault at tick ${step.tick}`);
    const workers = Object.values(h.Game.creeps).sort((a, b) => a.name.localeCompare(b.name));
    const actual = {
      tick: step.tick, spawnReason: colony.reason, spawnBodies: spawn.calls.map(c => c.body),
      actions: Object.fromEntries(workers.map(w => [w.name, w.calls.map(c => c.action)])),
      tasks: Object.fromEntries(workers.map(w => [w.name, w.memory.task || null])),
      transfers: workers.flatMap(w => w.calls.filter(c => c.action === 'transfer').map(c => ({ worker: w.name, amount: c.amount }))),
      creepMemory: Object.keys(h.Memory.creeps).sort(), planning: colony.planning || null,
    };
    for (const [key, expected] of Object.entries(step.expect)) {
      assert.ok(key in actual, `Unknown assertion field: ${key}`);
      assert.deepEqual(actual[key], expected, `${fixture.name}: ${key} at tick ${step.tick}`);
    }
    // Include intent targets/names and full persisted memory in replay equivalence.
    trace.push(clone({ ...actual, spawnIntents: spawn.calls,
      intents: workers.map(w => ({ worker: w.name, calls: w.calls.map(c => ({
        action: c.action, target: c.target.id || c.target.name || c.target.pos || c.target,
        amount: c.amount, range: c.opts?.range, maxRooms: c.opts?.maxRooms,
      })) })), memory: h.Memory, logs: h.logs,
    }));
    h.persistMemory();
  }
  return trace;
}

module.exports = { replay };

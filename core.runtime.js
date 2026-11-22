'use strict';

const config = require('core.config');
const version = require('version');
let announced = false;

/** Runtime-local marker: every global reset announces the deployed version again.
 * Never use persistent Memory to suppress a restart banner. */
function startup() {
  if (announced) return;
  console.log(`[enclave:startup] Stranger Enclave v${version} (tick ${Game.time})`);
  announced = true;
}


/** Bounded, deduplicated fault/event history. Owns only memory.alerts.
 * @param {BotMemory} memory @param {string} key @param {string} message
 */
function alert(memory, key, message) {
  const previous = memory.alerts[key];
  const emit = !previous || previous.message !== message || Game.time - previous.last >= 100;
  memory.alerts[key] = {
    count: (previous ? previous.count : 0) + 1,
    last: emit ? Game.time : previous.last,
    message: message.slice(0, 500),
  };
  const keys = Object.keys(memory.alerts);
  if (keys.length > 50) {
    keys.sort((a, b) => memory.alerts[a].last - memory.alerts[b].last);
    delete memory.alerts[keys[0]];
  }
  if (emit) console.log(`[enclave:${key}] ${message.slice(0, 500)}`);
}

/** Isolates a system/creep fault without cancelling other colonies.
 * @param {BotMemory} memory @param {string} key @param {() => void} action
 */
function guard(memory, key, action) {
  try { action(); } catch (error) {
    alert(memory, key, error instanceof Error ? error.message : String(error));
  }
}

/** Optional systems must check immediately before work; critical work is never bucket-gated. */
function optionalWorkAllowed() {
  return Game.cpu.bucket >= config.minimumBucket &&
    Game.cpu.getUsed() < Math.min(Game.cpu.limit * config.optionalCpuFraction, Game.cpu.tickLimit - 5);
}

module.exports = { startup, alert, guard, optionalWorkAllowed };

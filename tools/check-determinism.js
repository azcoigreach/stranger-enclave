'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const runs = [
  { timezone: 'UTC', args: [] },
  { timezone: 'America/Phoenix', args: ['--reverse', '--reset'] },
];
const traces = runs.map(run => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'replay-trace.js'), ...run.args], {
    env: { ...process.env, TZ: run.timezone, LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${run.timezone} replay failed:\n${result.stderr}`);
  assert.ok(result.stdout.length > 0, 'Missing replay output');
  JSON.parse(result.stdout); // Reject truncated or diagnostic-contaminated output.
  return result.stdout;
});
assert.equal(traces[0], traces[1], 'Replay diverged across process/timezone/order/reset variants');
const digest = createHash('sha256').update(traces[0]).digest('hex');
console.log(`Deterministic replay passed: 2 fixtures, 2 isolated processes, matching SHA-256 ${digest}`);

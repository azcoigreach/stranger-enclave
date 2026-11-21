'use strict';

// Worker process for the deterministic replay check; stdout contains only a canonical trace.
const fs = require('node:fs');
const path = require('node:path');
const { replay } = require('../tests/replay');
const fixtures = ['bootstrap-replay', 'priority-replay'];
if (process.argv.includes('--reverse')) fixtures.reverse();
const traces = {};
for (const name of fixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures', `${name}.json`), 'utf8'));
  traces[name] = replay(fixture, {
    resetEveryTick: process.argv.includes('--reset'),
    reverseInsertion: process.argv.includes('--reverse'),
  });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
process.stdout.write(JSON.stringify(canonical(traces)));

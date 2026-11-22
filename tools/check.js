'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter(file => file.endsWith('.js'));
const modules = new Set(files.map(file => file.slice(0, -3)));
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  new vm.Script(source, { filename: file });
  for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    if (!modules.has(match[1])) throw new Error(`${file} imports a non-game module: ${match[1]}`);
  }
}
if (!modules.has('main')) throw new Error('Missing main.js');
const version=require('./check-version').check(root);
console.log(`Validated release version ${version}.`);
console.log(`Validated syntax and root imports for ${files.length} game modules.`);

'use strict';
const fs=require('node:fs'),path=require('node:path');
function validateVersions(version,pkg,lock){
  if(typeof version!=='string'||!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version))throw new Error('version.js must export a stable MAJOR.MINOR.PATCH version');
  if(pkg.version!==version||lock.version!==version||lock.packages?.['']?.version!==version)throw new Error('Version mismatch: version.js, package.json and package-lock.json must agree');
  return version;
}
function check(root){
  const version=validateVersions(require(path.join(root,'version.js')),JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8')));
  const changelog=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
  if(!changelog.includes(`## [${version}]`))throw new Error(`Missing CHANGELOG.md entry for ${version}`);
  if(!fs.existsSync(path.join(root,'docs','releases',`${version}.md`)))throw new Error(`Missing release notes for ${version}`);
  return version;
}
if(require.main===module)console.log(check(path.resolve(__dirname,'..')));
module.exports={validateVersions,check};

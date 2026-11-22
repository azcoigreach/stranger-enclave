'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness');
const banners=h=>h.logs.filter(line=>line.startsWith('[enclave:startup] '));
test('runtime announces its version once on the first tick, not every tick or Memory serialization',()=>{
 const h=harness();h.addRoom();h.tick();
 assert.deepEqual(banners(h),['[enclave:startup] Stranger Enclave v0.1.0 (tick 1)']);
 for(let i=0;i<3;i++){h.Game.time++;h.persistMemory();h.tick();}
 assert.equal(banners(h).length,1);
});
test('a global restart announces the same version again without clearing persistent state',()=>{
 const h=harness();h.addRoom();h.tick();h.Memory.userNote='keep';
 h.reset();h.Game.time=10;h.tick();assert.equal(banners(h).length,2);
 assert.equal(banners(h)[1],'[enclave:startup] Stranger Enclave v0.1.0 (tick 10)');assert.equal(h.Memory.userNote,'keep');
});
test('startup version is visible even when initialization fails and uses the deployed module',()=>{
 const h=harness({}, {sources:{version:"module.exports='0.2.3';"}});
 h.tick();h.Game.time++;h.tick();assert.deepEqual(banners(h),['[enclave:startup] Stranger Enclave v0.2.3 (tick 1)']);
 assert.equal(h.Memory.enclave,undefined);
});

const {validateVersions}=require('../tools/check-version');
test('release metadata matches the runtime version and rejects mismatches in every metadata field',()=>{
 const make=()=>({version:'0.1.0',packages:{'':{version:'0.1.0'}}});
 assert.equal(validateVersions('0.1.0',make(),make()),'0.1.0');
 for(const field of ['package','lock','root']){
  const pkg=make(),lock=make();if(field==='package')pkg.version='0.2.0';if(field==='lock')lock.version='0.2.0';if(field==='root')lock.packages[''].version='0.2.0';
  assert.throws(()=>validateVersions('0.1.0',pkg,lock),/Version mismatch/);
 }
 for(const invalid of ['v0.1.0','01.1.0','0.1','0.1.0\n',2,null])assert.throws(()=>validateVersions(invalid,make(),make()),/stable MAJOR/);
});

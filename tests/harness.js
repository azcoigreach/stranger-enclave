'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function store(energy = 0, capacity = 50) {
  return { energy, getUsedCapacity() { return this.energy; }, getFreeCapacity() { return capacity - this.energy; } };
}

function position(x, y, roomName = 'W5N1') {
  return {
    x, y, roomName,
    getRangeTo(target, ty) { const p = typeof target === 'number' ? { x: target, y: ty } : target.pos || target; return Math.max(Math.abs(x - p.x), Math.abs(y - p.y)); },
    getDirectionTo(target) {
      const p = target.pos || target, dx = Math.sign(p.x - x), dy = Math.sign(p.y - y);
      return ({ '0,-1': 1, '1,-1': 2, '1,0': 3, '1,1': 4, '0,1': 5, '-1,1': 6, '-1,0': 7, '-1,-1': 8 })[`${dx},${dy}`];
    },
    inRangeTo(target, range) { return this.getRangeTo(target) <= range; },
    findPathTo(target, ty, opts) {
      const p = typeof target === 'number' ? { x: target, y: ty } : target;
      const options = typeof target === 'number' ? opts : ty;
      return [{ x: p.x - (options?.range === 0 ? 0 : 1), y: p.y }];
    },
  };
}

function harness(savedMemory = {}, options = {}) {
  const logs = [];
  const violations = [];
  const constants = {
    OK: 0, ERR_BUSY: -4, ERR_TIRED: -11, ERR_NOT_FOUND: -5, ERR_NOT_IN_RANGE: -9, ERR_NO_PATH: -2, ERR_NOT_ENOUGH_ENERGY: -6,
    TOUGH:'tough', ATTACK_POWER:30, RANGED_ATTACK_POWER:10, HEAL_POWER:12, DISMANTLE_POWER:50, TOWER_POWER_ATTACK:600, TOWER_FALLOFF:0.75,
    BOOSTS:{attack:{XUH2O:{attack:4}},heal:{XLHO2:{heal:4}},move:{XZHO2:{fatigue:4}},tough:{XGHO2:{damage:0.3}}},
    CLAIM: 'claim', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', WORK: 'work', CARRY: 'carry', MOVE: 'move', RESOURCE_ENERGY: 'energy',
    STRUCTURE_LINK: 'link', STRUCTURE_LAB:'lab', STRUCTURE_TERMINAL:'terminal', STRUCTURE_OBSERVER:'observer', STRUCTURE_POWER_SPAWN:'powerSpawn', STRUCTURE_NUKER:'nuker', STRUCTURE_FACTORY:'factory', STRUCTURE_EXTRACTOR:'extractor', STRUCTURE_KEEPER_LAIR: 'keeperLair', STRUCTURE_INVADER_CORE: 'invaderCore', STRUCTURE_SPAWN: 'spawn', STRUCTURE_EXTENSION: 'extension', STRUCTURE_TOWER: 'tower',
    STRUCTURE_WALL: 'constructedWall', STRUCTURE_CONTAINER: 'container', STRUCTURE_STORAGE: 'storage', STRUCTURE_ROAD: 'road', STRUCTURE_RAMPART: 'rampart',
    CREEP_SPAWN_TIME: 3, TOWER_ENERGY_COST: 10, MAX_CONSTRUCTION_SITES: 100, TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2,
    BODYPART_COST: { attack:80, ranged_attack:150, heal:250, tough:10, work: 100, carry: 50, move: 50, claim: 600 }, ENERGY_REGEN_TIME: 300, HARVEST_POWER: 2,
    WALL_HITS_MAX: 300000000, RAMPART_HITS_MAX:{2:300000,3:1000000,4:3000000,5:10000000,6:30000000,7:100000000,8:300000000},
    BUILD_POWER: 5, REPAIR_POWER: 100, REPAIR_COST: 0.01, RAMPART_DECAY_AMOUNT: 300, RAMPART_DECAY_TIME: 100, LINK_LOSS_RATIO: 0.03, CREEP_CLAIM_LIFE_TIME: 600,
    CONSTRUCTION_COST: {spawn:15000,extension:3000,tower:5000,storage:30000,link:5000,constructedWall:1,rampart:1},
    SOURCE_ENERGY_CAPACITY: 3000, SOURCE_ENERGY_NEUTRAL_CAPACITY: 1500, CARRY_CAPACITY: 50, CREEP_LIFE_TIME: 1500, UPGRADE_CONTROLLER_POWER: 1,
    EVENT_BUILD: 4, EVENT_REPAIR: 7, EVENT_TRANSFER: 12, EVENT_HARVEST: 5, EVENT_UPGRADE_CONTROLLER: 9,
    FIND_STRUCTURES: 1, FIND_SOURCES: 2, FIND_MY_CONSTRUCTION_SITES: 3, FIND_HOSTILE_CREEPS: 4,
    FIND_DROPPED_RESOURCES: 5, FIND_TOMBSTONES: 6, FIND_RUINS: 7, FIND_MINERALS: 8, FIND_EXIT: 9, FIND_CREEPS: 10, FIND_POWER_CREEPS: 11,
    CONTROLLER_STRUCTURES: { link:{1:0,2:0,3:0,4:0,5:2,6:3,7:4,8:6}, constructedWall:{1:0,2:2500,3:2500,4:2500,5:2500}, rampart:{1:0,2:2500,3:2500,4:2500,5:2500}, storage: {1:0,2:0,3:0,4:1,5:1}, spawn: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, road: { 1: 2500, 2: 2500, 3: 2500 }, container: { 1: 5, 2: 5, 3: 5 }, extension: { 1: 0, 2: 5, 3: 10, 4: 20, 5: 30 }, tower: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 } },
  };
  for(const [type,count] of Object.entries({spawn:3,extension:60,tower:6,storage:1,link:6,lab:10,terminal:1,observer:1,powerSpawn:1,nuker:1,factory:1,extractor:1})) {
    constants.CONTROLLER_STRUCTURES[type] ||= {};constants.CONTROLLER_STRUCTURES[type][8]=count;
  }
  const Game = { time: 1, creeps: {}, rooms: {}, spawns: {}, constructionSites: {},
    map: { describeExits: () => ({}), findRoute: () => -2 },
    cpu: { bucket: 10000, limit: 100, tickLimit: 500, getUsed: () => 1 } };
  const cache = new Map();
  function createContext() {
    const next = vm.createContext({ ...constants, Game, Memory: savedMemory, RoomPosition: function(x,y,roomName) {return position(x,y,roomName);},
      PathFinder: {search: () => ({incomplete:true,path:[],cost:0}), CostMatrix: class {constructor(){this.values=new Map();} set(x,y,value){this.values.set(`${x},${y}`,value);} get(x,y){return this.values.get(`${x},${y}`)||0;} }},
      console: { log: message => logs.push(message) },
      nondeterministic(api) { violations.push(api); throw new Error(`Nondeterministic API in fixture: ${api}`); },
    });
    next.global = next;
    vm.runInContext(`
      Math.random = () => nondeterministic('Math.random');
      const NativeDate = Date;
      function FixtureDate(...args) {
        if (!new.target || !args.length) return nondeterministic('Date');
        return new NativeDate(...args);
      }
      Object.setPrototypeOf(FixtureDate, NativeDate);
      FixtureDate.prototype = NativeDate.prototype;
      FixtureDate.now = () => nondeterministic('Date.now');
      Date = FixtureDate;
    `, next);
    return next;
  }
  let context = createContext();
  function load(name) {
    if (!/^[a-z][a-z0-9.]*$/.test(name)) throw new Error(`Non-game import in fixture: ${name}`);
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} };
    cache.set(name, module);
    // Source overrides support in-memory mutation tests; never edit watched game files.
    const source = options.sources?.[name] ?? fs.readFileSync(path.join(__dirname, '..', `${name}.js`), 'utf8');
    vm.runInContext(`(function(require, module, exports) {${source}\n})`, context, { filename: `${name}.js` })(load, module, module.exports);
    return module.exports;
  }
  function addRoom(name = 'W5N1', options = {}) {
    const objects = {};
    const controller = { my: true, level: options.level || 1, ticksToDowngrade: 20000, pos: position(10, 10, name), owner: { username: 'test' } };
    const room = { name, controller, energyAvailable: 300, energyCapacityAvailable: 300,
      find: kind => objects[kind] || [], getTerrain: () => ({ get: () => 0 }), getEventLog: () => [],
      getPositionAt: (x, y) => position(x, y, name),
      siteCalls: [], createConstructionSite(x, y, type) { this.siteCalls.push({ x, y, type }); return 0; } };
    const spawn = { id: `spawn-${name}`, name: `Spawn-${name}`, my: true, structureType: 'spawn',
      room, pos: position(25, 25, name), store: store(300, 300), spawning: null, calls: [],
      result: 0,
      spawnCreep(body, creepName, opts) { this.calls.push({ body: [...body], name: creepName, opts }); return this.result; } };
    objects[constants.FIND_STRUCTURES] = [spawn];
    objects[constants.FIND_SOURCES] = [{ id: `source-${name}`, energy: 3000, energyCapacity: 3000, ticksToRegeneration: 300, pos: position(20, 20, name) },
      { id: `source2-${name}`, energy: 3000, energyCapacity: 3000, ticksToRegeneration: 300, pos: position(35, 35, name) }];
    Game.rooms[name] = room; Game.spawns[spawn.name] = spawn;
    return { room, spawn, objects, controller };
  }
  function addWorker(room, name = 'worker', energy = 0) {
    const memory = { role: 'bootstrap', home: room.name, working: energy > 0 };
    if (!savedMemory.creeps) savedMemory.creeps = {};
    savedMemory.creeps[name] = memory;
    const creep = { id: name, name, room, pos: position(24, 25, room.name), store: store(energy), actionResults: {},
      body: ['work', 'carry', 'move'].map(type => ({ type, hits: 100 })),
      getActiveBodyparts(type) { return this.body.filter(part => part.type === type && part.hits > 0).length; },
      ticksToLive: 1000, fatigue: 0, spawning: false, calls: [],
      moveByPath(path) { this.calls.push({ action: 'path', path }); return 0; },
      move(direction) { this.calls.push({ action: 'step', direction }); return 0; },
      moveTo(target, opts) { this.calls.push({ action: 'move', target, opts }); return 0; } };
    for (const action of ['attack','rangedAttack','heal','rangedHeal','repair', 'reserveController', 'pickup', 'withdraw', 'harvest', 'upgradeController', 'transfer', 'build']) {
      creep[action] = function(target, resource, amount) { this.calls.push({ action, target, resource, amount }); return this.actionResults[action] ?? 0; };
    }
    Object.defineProperty(creep, 'memory', { get: () => savedMemory.creeps[name], set: value => { savedMemory.creeps[name] = value; } });
    Game.creeps[name] = creep;
    return creep;
  }
  function persistMemory() {
    savedMemory = JSON.parse(JSON.stringify(savedMemory));
    context.Memory = savedMemory;
  }
  function reset() {
    persistMemory();
    cache.clear();
    context = createContext();
  }
  function tick() {
    context.fixtureLoop = load('main').loop;
    vm.runInContext('fixtureLoop()', context, { timeout: 1000 });
    delete context.fixtureLoop;
  }
  return { load, Game, get Memory() { return savedMemory; }, logs, get context() { return context; },
    constants, addRoom, addWorker, cache, violations, persistMemory, reset, tick };
}

module.exports = { harness, position, store };

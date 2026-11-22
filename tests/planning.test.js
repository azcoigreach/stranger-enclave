'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position } = require('./harness');

test('RCL1 creates no sites; RCL2 gradually finds a legal extension without occupying work positions', () => {
  const h = harness(); const { room, controller, objects } = h.addRoom();
  const planner = h.load('planning.bootstrap'); const snapshot = h.load('colony.snapshot'); const record = {};
  planner.run(snapshot.create(room), record, () => true);
  assert.equal(room.siteCalls.length, 0);
  controller.level = 2;
  for (let i = 0; i < 10 && !room.siteCalls.length; i++) planner.run(snapshot.create(room), record, () => true);
  assert.equal(room.siteCalls.length, 1); const site = room.siteCalls[0]; assert.equal(site.type, 'extension');
  for (const critical of [controller, ...objects[h.constants.FIND_SOURCES]]) assert.ok(critical.pos.getRangeTo(site) > 2);
});

test('planner pauses for site caps, threats, and CPU pressure', () => {
  const h = harness(); const { room, objects } = h.addRoom('W5N1', { level: 3 });
  const planner = h.load('planning.bootstrap'), snapshot = h.load('colony.snapshot'), record = {};
  for (let i = 0; i < 100; i++) h.Game.constructionSites[i] = {};
  planner.run(snapshot.create(room), record, () => true);
  assert.equal(record.planning, 'CONSTRUCTION_BACKLOG'); assert.equal(room.siteCalls.length, 0);
  h.Game.constructionSites = {}; objects[h.constants.FIND_HOSTILE_CREEPS] = [{}];
  planner.run(snapshot.create(room), record, () => true); assert.equal(record.planning, 'HOSTILES_PRESENT');
  objects[h.constants.FIND_HOSTILE_CREEPS] = [];
  planner.run(snapshot.create(room), record, () => false); assert.equal(room.siteCalls.length, 0);
});

test('planner rejects cutting the only corridor connecting the spawn and sources', () => {
  const h = harness(); const { room, spawn, controller, objects } = h.addRoom();
  spawn.pos = position(10, 24); controller.pos = position(35, 24);
  objects[h.constants.FIND_SOURCES] = [{ id: 'source', pos: position(40, 24), energy: 3000 }];
  room.getTerrain = () => ({ get: (x, y) => y === 25 || (x === 10 && y === 24) || (x === 35 && y === 24) || (x === 40 && y === 24) ? 0 : 1 });
  assert.equal(h.load('planning.bootstrap').preservesAccess(h.load('colony.snapshot').create(room), 25, 25), false);
});

test('planner never builds on existing structures and reports API failures without deleting anything', () => {
  const h = harness(); const { room } = h.addRoom('W5N1', { level: 2 });
  room.createConstructionSite = () => -7;
  const planner = h.load('planning.bootstrap'), snapshot = h.load('colony.snapshot'), record = {};
  for (let i = 0; i < 10 && !String(record.planning).startsWith('SITE_FAILED'); i++) planner.run(snapshot.create(room), record, () => true);
  assert.equal(record.planning, 'SITE_FAILED_-7');
});

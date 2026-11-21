'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, position } = require('./harness');
const fixture = require('./fixtures/controller-corridor.json');

// Independent eight-way grid search: honors fixture walls and the production cost
// callback, but intentionally omits fatigue and engine collision resolution.
function world() {
  const h = harness(), home = h.addRoom(fixture.room);
  const terrain = fixture.terrain.join('');
  const at = (x, y) => {
    const p = position(x, y, home.room.name);
    p.findPathTo = (target, ty, options) => {
      const goal = typeof target === 'number' ? { x: target, y: ty } : target.pos || target;
      const opts = typeof target === 'number' ? options : ty;
      const costs = new Map();
      opts?.costCallback?.(home.room.name, { set: (a, b, cost) => costs.set(`${a},${b}`, cost) });
      const queue = [{ x, y, path: [] }], seen = new Set([`${x},${y}`]);
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        if (Math.max(Math.abs(current.x - goal.x), Math.abs(current.y - goal.y)) <= (opts?.range ?? 1)) return current.path;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const nx = current.x + dx, ny = current.y + dy, key = `${nx},${ny}`;
          if (nx <= 0 || ny <= 0 || nx >= 49 || ny >= 49 || seen.has(key) || (Number(terrain[ny * 50 + nx]) & 1) || costs.get(key) === 255 ||
              (nx === fixture.controller[0] && ny === fixture.controller[1])) continue;
          seen.add(key); queue.push({ x: nx, y: ny, path: [...current.path, { x: nx, y: ny }] });
        }
      }
      return [];
    };
    return p;
  };
  home.room.getTerrain = () => ({ get: (x, y) => Number(terrain[y * 50 + x]) });
  home.room.getPositionAt = at; home.spawn.pos = at(...fixture.spawn); home.controller.pos = at(...fixture.controller);
  const carrier = h.addWorker(home.room, 'carrier', 50); carrier.memory.role = 'hauler'; carrier.pos = at(...fixture.spawn);
  return { h, ...home, carrier, at };
}

test('carrier route keeps the direct controller-side corridor open', () => {
  const { h, room, carrier, at } = world();
  const worker = h.addWorker(room, 'consumer'); worker.pos = at(...fixture.target);
  h.load('movement.local').move(carrier, worker.pos, 1, h.load('territory.policy').blockFor(room.name));
  const path = carrier.pos.findPathTo(worker.pos, carrier.calls[0].opts);
  assert.ok(path.length > 0 && path.length <= 12, `direct approach expected, got ${path.length} steps`);
});

test('controller stations have short supply routes with all assigned workers in place', () => {
  const { h, room, spawn, controller, at } = world();
  for (let i = 0; i < 8; i++) h.addWorker(room, `worker${i}`);
  const colony = h.load('colony.snapshot').create(room), stations = h.load('economy.stations');
  const spots = colony.workers.filter(c => c.memory.role === 'bootstrap').map(c => stations.forWorker(c, colony));
  assert.ok(spots.every(Boolean));
  assert.equal(new Set(spots.map(p => `${p.x},${p.y}`)).size, spots.length);
  for (const spot of spots) {
    assert.ok(spot.inRangeTo(controller, 3));
    const path = spawn.pos.findPathTo(spot, { range: 1, costCallback(name, matrix) {
      for (const other of spots) matrix.set(other.x, other.y, 255);
      return matrix;
    } });
    assert.ok(path.length > 0 && path.length <= 12, `station ${spot.x},${spot.y} needs ${path.length} steps`);
  }
  h.reset();
  assert.deepEqual(colony.workers.filter(c => c.memory.role === 'bootstrap').map(c => {
    const p = h.load('economy.stations').forWorker(c, colony); return [p.x, p.y];
  }), spots.map(p => [p.x, p.y]));
});


test('an unobstructed carrier can transit near the controller without forced evacuation', () => {
  const { h, room, carrier, at } = world();
  const worker = h.addWorker(room, 'consumer'); worker.pos = at(...fixture.target);
  carrier.pos = at(39, 24);
  const reservations = new Map();
  h.load('movement.controller').run(h.load('colony.snapshot').create(room), h.load('territory.policy').blockFor(room.name), reservations);
  assert.equal(reservations.has(`traffic:${carrier.id}`), false);
  assert.equal(carrier.calls.length, 0);
});

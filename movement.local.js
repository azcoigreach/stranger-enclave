'use strict';

const territory = require('territory.policy');
const stations = require('economy.stations');
const snapshot = require('colony.snapshot');

/** Single movement owner for the bootstrap worker. Room-local paths only; edge tiles
 * are blocked, cached paths expire quickly, and stalled creeps retry with fresh paths.
 * @param {Creep} creep @param {RoomPosition} target @param {number} range @param {BlockBounds} block
 */
function move(creep, target, range, block) {
  if (!territory.contains(creep.room.name, block) || !territory.contains(target.roomName, block) ||
      target.roomName !== creep.room.name || creep.memory.home !== creep.room.name) {
    creep.memory.task = 'MOVEMENT_OUTSIDE_HOME_BLOCKED';
    return ERR_NO_PATH;
  }
  const last = creep.memory.motion;
  const stuck = last && last.tick === Game.time - 1 && last.x === creep.pos.x && last.y === creep.pos.y && !creep.fatigue
    ? last.stuck + 1 : 0;
  creep.memory.motion = { x: creep.pos.x, y: creep.pos.y, tick: Game.time, stuck };
  const controller = creep.room.controller;
  const carrier = creep.memory.role === 'hauler' && controller && controller.my;
  const nearFormation = carrier && creep.pos.inRangeTo(controller, 4);
  return creep.moveTo(target, {
    range, maxRooms: 1, maxOps: 1500, reusePath: stuck >= 2 || nearFormation ? 0 : 5,
    ignoreCreeps: !carrier && stuck < 2,
    costCallback(roomName, matrix) {
      if (roomName !== creep.room.name || !territory.contains(roomName, block)) {
        for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) matrix.set(x, y, 255);
        return matrix;
      }
      for (let i = 0; i < 50; i++) {
        matrix.set(i, 0, 255); matrix.set(i, 49, 255);
        matrix.set(0, i, 255); matrix.set(49, i, 255);
      }
      if (carrier) stations.blockStations(snapshot.create(creep.room), matrix);
      return matrix;
    },
  });
}

module.exports = { move };

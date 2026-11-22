'use strict';
const movement = require('movement.local');
const mining = require('economy.mining');

/** Stationary drop miner: WORK stays on its assigned source; transport is separate.
 * No CARRY is required: harvested energy falls on the miner's tile. Never hauls.
 * @param {Creep} creep @param {ColonySnapshot} colony @param {BlockBounds} block
 */
function run(creep, colony, block) {
  if (creep.spawning) return;
  const assignment = mining.assign(colony).get(creep.name);
  if (!assignment) {
    creep.memory.task = 'WAIT_MINING_SLOT';
    const waitingSource = colony.sources.find(s => s.id === creep.memory.sourceId);
    if (waitingSource && !creep.pos.inRangeTo(waitingSource, 2)) movement.move(creep, waitingSource.pos, 2, block);
    return;
  }
  const { source, pos } = assignment;
  creep.memory.task = source.energy ? 'MINE' : 'WAIT_SOURCE_REGEN';
  if (creep.pos.getRangeTo(pos.x, pos.y) !== 0) {
    const target = colony.room.getPositionAt(pos.x, pos.y);
    if (target) movement.move(creep, target, 0, block);
    return;
  }
  if (source.energy > 0) creep.memory.lastAction = creep.harvest(source);
}
module.exports = { run };

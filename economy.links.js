'use strict';
/** Tick-local hub/controller pair. Adopt owned existing links when no saved roles exist.
 * @param {ColonySnapshot} colony
 */
function network(colony) {
  const plan = Memory.enclave?.colonies[colony.room.name]?.links;
  const links = colony.structures.filter((/** @type {AnyStructure} */ s) => s.structureType === STRUCTURE_LINK && s.my)
    .filter(s => s.structureType === STRUCTURE_LINK && (!s.isActive || s.isActive()));
  const at = (/** @type {{x:number,y:number}} */ p) => links.find(s => s.pos.x === p.x && s.pos.y === p.y);
  const hub = plan ? at(plan.hub) : links.slice().sort((a,b) =>
    (colony.room.storage?.pos.getRangeTo(a) || 50) - (colony.room.storage?.pos.getRangeTo(b) || 50) || a.id.localeCompare(b.id))[0];
  const controller = plan ? at(plan.controller) : links.filter(s => s !== hub && s.pos.inRangeTo(colony.controller,3))
    .sort((a,b) => a.pos.getRangeTo(colony.controller) - b.pos.getRangeTo(colony.controller) || a.id.localeCompare(b.id))[0];
  return {hub:hub?.structureType === STRUCTURE_LINK ? hub : undefined,
    controller:controller?.structureType === STRUCTURE_LINK ? controller : undefined};
}
/** One sender, one transfer intent, conservative receiving-space accounting (loss is handled by engine).
 * @param {ColonySnapshot} colony @param {ColonyRecord} record
 */
function run(colony,record) {
  const {hub,controller} = network(colony);
  if (!hub || !controller || hub === controller || hub.cooldown > 0 || colony.controller.level < 5) return;
  const amount = Math.min(hub.store.getUsedCapacity(RESOURCE_ENERGY),controller.store.getFreeCapacity(RESOURCE_ENERGY));
  if (amount < 50) return;
  const result = hub.transferEnergy(controller,amount);
  if (record.links) record.links.transfer = {tick:Game.time,amount,result}; // Intent, not a delivered-energy counter.
}
module.exports = {network,run};

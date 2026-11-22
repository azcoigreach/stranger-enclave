'use strict';

/** Read completed engine events, never count an OK intent as delivered work.
 * Owns a current 300-tick window, previous window, and one observation per source.
 * Missing observations restart the window instead of implying zero usage.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record
 */
function record(colony, record) {
  const previous = record.economy;
  const contiguous = previous && previous.lastTick === Game.time - 1;
  /** @type {EconomyMetrics} */
  const stats = contiguous ? previous : {
    lastTick: Game.time, ticks: 0, harvested: 0, upgradeEnergy: 0, bySource: {}, sources: {}, actors: [],
  };
  if (stats.ticks >= ENERGY_REGEN_TIME) {
    stats.lastWindow = { ticks: stats.ticks, harvested: stats.harvested, upgradeEnergy: stats.upgradeEnergy, bySource: { ...stats.bySource } };
    stats.ticks = 0; stats.harvested = 0; stats.upgradeEnergy = 0; stats.bySource = {};
  }
  const actors = new Set([...stats.actors, ...colony.workers.map(c => c.id)]);
  /** @type {Record<string, number>} */
  const allHarvest = {};
  for (const event of colony.room.getEventLog()) {
    if (event.event === EVENT_HARVEST) {
      allHarvest[event.data.targetId] = (allHarvest[event.data.targetId] || 0) + event.data.amount;
      if (actors.has(event.objectId)) {
        stats.harvested += event.data.amount;
        stats.bySource[event.data.targetId] = (stats.bySource[event.data.targetId] || 0) + event.data.amount;
      }
    }
    if (event.event === EVENT_UPGRADE_CONTROLLER && actors.has(event.objectId)) stats.upgradeEnergy += event.data.energySpent;
  }
  for (const source of colony.sources) {
    const old = stats.sources[source.id];
    const regen = source.ticksToRegeneration || 0;
    const unused = contiguous && old && old.regen > 0 && (regen > old.regen || (regen === 0 && source.energy > old.energy))
      ? Math.max(0, old.energy - (allHarvest[source.id] || 0)) : old?.unusedLastCycle;
    stats.sources[source.id] = { energy: source.energy, capacity: source.energyCapacity, regen,
      requiredPerTick: source.energyCapacity / ENERGY_REGEN_TIME, unusedLastCycle: unused };
  }
  stats.actors = colony.workers.map(c => c.id);
  stats.lastTick = Game.time; stats.ticks++;
  record.economy = stats;
}
module.exports = { record };

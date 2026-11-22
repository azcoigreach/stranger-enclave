'use strict';
const layout = require('planning.layout');
const network = require('economy.links');
/** Plan a storage hub and controller receiver within RCL limits. Placement uses the existing
 * connectivity validator, including both planned link obstacles, rather than a room-specific footprint.
 * @param {ColonySnapshot} colony @param {ColonyRecord} record @param {(colony:ColonySnapshot,x:number,y:number)=>boolean} legal @param {()=>boolean} allowed @param {boolean} [planOnly]
 */
function run(colony,record,legal,allowed,planOnly=false) {
  const limit = CONTROLLER_STRUCTURES[STRUCTURE_LINK]?.[planOnly ? 8 : colony.controller.level] || 0;
  if (limit < 2 || !colony.room.storage || !allowed()) return false;
  const existing = [...colony.structures,...colony.sites], terrain = colony.room.getTerrain();
  if (!record.links) {
    const current = network.network(colony);
    if (current.hub && current.controller) {
      record.links = {hub:{x:current.hub.pos.x,y:current.hub.pos.y},controller:{x:current.controller.pos.x,y:current.controller.pos.y},status:'ADOPTED'};
    } else {
      const candidates = (/** @type {RoomPosition} */ origin) => {
        const result = [];
        for (let x = Math.max(2,origin.x - 2); x <= Math.min(47,origin.x + 2); x++) for (let y = Math.max(2,origin.y - 2); y <= Math.min(47,origin.y + 2); y++) {
          if (terrain.get(x,y) & TERRAIN_MASK_WALL || existing.some(s => s.pos.x === x && s.pos.y === y)) continue;
          if ([...colony.sources,colony.controller,...colony.room.find(FIND_MINERALS)].some(s => s.pos.x === x && s.pos.y === y)) continue;
          if (colony.sources.some(s => s.pos.getRangeTo(x,y) <= 1)) continue;
          if (!require('planning.mature').safePosition({x,y},record.perimeterProposal || record.perimeter)) continue;
          result.push({x,y});
        }
        return result.sort((a,b) => origin.getRangeTo(a.x,a.y)-origin.getRangeTo(b.x,b.y) || a.x-b.x || a.y-b.y);
      };
      const hubs = current.hub ? [{x:current.hub.pos.x,y:current.hub.pos.y}] : candidates(colony.room.storage.pos);
      const receivers = candidates(colony.controller.pos);
      for (const hub of hubs) {
        if (!allowed()) return false;
        if (!current.hub && !legal(colony,hub.x,hub.y)) continue;
        const site = /** @type {ConstructionSite} */ (/** @type {unknown} */ ({structureType:STRUCTURE_LINK,pos:colony.room.getPositionAt(hub.x,hub.y),my:true}));
        const withHub = {...colony,sites:current.hub ? colony.sites : [...colony.sites,site]};
        const receiver = receivers.find(p => (p.x !== hub.x || p.y !== hub.y) && allowed() && legal(withHub,p.x,p.y));
        if (receiver) {record.links = {hub,controller:receiver,status:'PLANNED'};break;}
      }
      if (!record.links) {record.planning='LINK_LAYOUT_UNAVAILABLE';return false;}
    }
  }
  if(planOnly)return true;
  for (const pos of [record.links.hub,record.links.controller]) {
    if (existing.some(s => s.structureType === STRUCTURE_LINK && s.pos.x === pos.x && s.pos.y === pos.y)) continue;
    if (existing.filter(s => s.structureType === STRUCTURE_LINK).length >= limit) {record.links.status='RCL_LIMIT';return false;}
    if (!allowed()) return false;
    const result = colony.room.createConstructionSite(pos.x,pos.y,STRUCTURE_LINK);
    if (result === OK) layout.rememberSite(record,{...pos,type:STRUCTURE_LINK});
    record.links.status=result === OK ? 'BUILDING' : `SITE_FAILED_${result}`;record.planning=`LINK_${record.links.status}`;return true;
  }
  record.links.status=[record.links.hub,record.links.controller].every(p=>colony.structures.some(s=>s.structureType===STRUCTURE_LINK && s.pos.x===p.x && s.pos.y===p.y)) ? 'BUILT' : 'BUILDING';return false;
}
module.exports = {run};

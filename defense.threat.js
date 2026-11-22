'use strict';

/** Active capabilities only. Boosted TOUGH is conservatively applied to incoming
 * healing too; no unobserved reinforcements or tower refills are assumed.
 * @param {Creep} creep @returns {CombatProfile} */
function profile(creep) {
  /** @type {Record<string,number>} */ const parts={};
  /** @type {Record<string,number>} */ const boosts={};
  let attack=0,ranged=0,heal=0,dismantle=0,move=0,effectiveHits=0,reduction=1,weight=0;
  for(const part of creep.body){
    if(part.hits<=0)continue;
    parts[part.type]=(parts[part.type]||0)+1;
    if(part.boost)boosts[part.boost]=(boosts[part.boost]||0)+1;
    const effects=part.boost ? /** @type {Record<string,number>} */ ((/** @type {Record<string,Record<string,Record<string,number>>>} */ (BOOSTS))[part.type]?.[part.boost]||{}) : {};
    if(part.type===ATTACK)attack+=ATTACK_POWER*(effects.attack||1);
    if(part.type===RANGED_ATTACK)ranged+=RANGED_ATTACK_POWER*(effects.rangedAttack||1);
    if(part.type===HEAL)heal+=HEAL_POWER*(effects.heal||1);
    if(part.type===WORK)dismantle+=DISMANTLE_POWER*(effects.dismantle||1);
    if(part.type===MOVE)move+=2*(effects.fatigue||1);else weight++;
    const damage=effects.damage||1;reduction=Math.min(reduction,damage);effectiveHits+=part.hits/damage;
  }
  const owner=creep.owner?.username||'';
  return {id:creep.id,owner,kind:owner==='Invader'?'invader':owner==='Source Keeper'?'keeper':'player',
    x:creep.pos.x,y:creep.pos.y,parts,boosts,attack,ranged,heal,dismantle,move,weight,reduction,effectiveHits,
    maxHits:creep.hitsMax??creep.body.length*100,hits:creep.hits??creep.body.reduce((n,p)=>n+p.hits,0),ttl:creep.ticksToLive??CREEP_LIFE_TIME,fatigue:creep.fatigue||0};
}
/** @param {CombatProfile[]} profiles */
function strength(profiles){
  const sum=(/** @type {keyof CombatProfile} */ key)=>profiles.reduce((s,p)=>s+Number(p[key]),0);
  return {damage:sum('attack')+sum('ranged'),heal:sum('heal')/Math.min(1,...profiles.map(p=>p.reduction)),
    hits:sum('effectiveHits'),ranged:sum('ranged'),ttl:Math.max(0,...profiles.map(p=>p.ttl))};
}
/** Prefer healers, then fragile targets; towers and mobile combat share the order.
 * @param {Creep[]} hostiles */
function targets(hostiles){return hostiles.slice().sort((a,b)=>profile(b).heal-profile(a).heal || a.hits-b.hits || a.id.localeCompare(b.id));}
/** Guaranteed lower-bound fire at maximum falloff with currently banked shots.
 * A hostile rampart or active power effect makes this estimate unsupported.
 * @param {ColonySnapshot} colony @param {CombatProfile[]} profiles */
function towersHold(colony,profiles){
  if(colony.structures.some(s=>s.structureType===STRUCTURE_RAMPART&&!s.my))return false;
  const towers=colony.structures.filter(s=>s.structureType===STRUCTURE_TOWER&&s.my&&s.isActive()&&
    !s.effects?.length&&s.store.getUsedCapacity(RESOURCE_ENERGY)>=TOWER_ENERGY_COST);
  if(!towers.length)return false;
  const power=towers.length*TOWER_POWER_ATTACK*(1-TOWER_FALLOFF),foe=strength(profiles);
  const ticks=Math.ceil(foe.hits/Math.max(1,power-foe.heal));
  return power>foe.heal && towers.every(t=>t.structureType===STRUCTURE_TOWER&&t.store.getUsedCapacity(RESOURCE_ENERGY)>=ticks*TOWER_ENERGY_COST);
}
/** Survival margin accounts for closing distance, damage and attrition. Ranged
 * bodies self-heal; melee bodies deliberately do not combine attack with heal.
 * @param {CombatProfile} own @param {CombatProfile[]} profiles @param {number} travel */
function holds(own,profiles,travel){
  const foe=strength(profiles),damage=own.ranged||own.attack;
  if(own.move<own.weight*2 || damage<=foe.heal || own.hits<own.maxHits*0.8)return false;
  const fight=Math.ceil(foe.hits/(damage-foe.heal))+10;
  return own.ttl>travel+fight+25 && own.effectiveHits*0.65>Math.max(0,foe.damage*(own.ranged?1:2)-own.heal)*(fight+3);
}
/** Smallest affordable complete fighter, with one MOVE per other part. Ranged
 * healing is preferred for ranged enemies; pure melee is never sent after them.
 * @param {number} energy @param {CombatProfile[]} profiles @param {number} travel
 * @returns {BodyPartConstant[] | null} */
function bodyFor(energy,profiles,travel){
  /** @type {BodyPartConstant[][]} */ const choices=[];
  const foe=strength(profiles);
  if(!foe.ranged)for(let n=1;n<=25;n++)choices.push([...Array(n).fill(ATTACK),...Array(n).fill(MOVE)]);
  for(let r=1;r<=20;r++)for(let h=1;h+r<=25;h++)choices.push([...Array(r).fill(RANGED_ATTACK),...Array(r+h).fill(MOVE),...Array(h).fill(HEAL)]);
  const affordable=choices.map(body=>({body,cost:cost(body)})).filter(c=>c.cost<=energy)
    .sort((a,b)=>a.cost-b.cost||a.body.length-b.body.length);
  for(const {body} of affordable){
    const own=profile(/** @type {Creep} */ ({body:body.map(type=>({type,hits:100})),pos:{x:0,y:0},hits:body.length*100,ticksToLive:CREEP_LIFE_TIME}));
    if(holds(own,profiles,travel))return body;
  }
  return null;
}
/** @param {BodyPartConstant[]} body */
function cost(body){return body.reduce((sum,p)=>sum+BODYPART_COST[p],0);}
module.exports={profile,strength,targets,towersHold,holds,bodyFor,cost};

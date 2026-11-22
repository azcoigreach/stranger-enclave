'use strict';
const config=require('core.config');
const policy=require('defense.policy');
/** @param {RemoteOperation} op */
function costBreakdown(op){
  // Travel reduces the productive lifetime available to repay each replacement.
  const life = Math.max(1, CREEP_LIFE_TIME - op.travel);
  const claimLife = Math.max(1, CREEP_CLAIM_LIFE_TIME - op.travel);
  const share = op.reserve === false ? 0 : op.reservationShare ?? 1;
  return {
    mining: 750 / life,
    hauling: op.carry * 100 / life,
    reservation: share * 1300 / claimLife,
    // Drop mining uses no maintained structures. Guarded routes are ineligible.
    infrastructure: 0, guard: 0,
  };
}
/** @param {RemoteOperation} op */
function remoteCosts(op){
  return Object.values(costBreakdown(op)).reduce((sum,cost)=>sum+cost,0);
}
/** @param {RemoteOperation} op */
function remoteNet(op){
  const expected = op.grossIncome ?? 10;
  const gross = op.deliverySample && op.deliverySample.rate >= 0 ? op.deliverySample.rate : expected;
  return gross - remoteCosts(op);
}
/** Conservative fraction of one spawn needed for a remote's replacements.
 * @param {RemoteOperation} op */
function remoteSpawnLoad(op){return (10+op.carry*2)*CREEP_SPAWN_TIME/Math.max(300,CREEP_LIFE_TIME-op.travel)+
  (op.reserve===false ? 0 : (op.reservationShare ?? 1)*4*CREEP_SPAWN_TIME/Math.max(100,CREEP_CLAIM_LIFE_TIME-op.travel));}
/** @param {ColonySnapshot} colony @param {ColonyRecord} record */
function update(colony,record){
  const storage=colony.room.storage,level=colony.controller.level;
  if(!storage || !storage.my || level<config.defenseMinimumLevel)return;
  const stored=storage.store.getUsedCapacity(RESOURCE_ENERGY),old=record.budget;
  const reserveFloor=Math.max(config.reserveFloor,colony.room.energyCapacityAvailable*10,config.defenseReserveFloor[level]||0);
  const fortificationHits=policy.target(level,record);
  const barriers=colony.structures.filter(s=>(s.structureType===STRUCTURE_WALL || s.structureType===STRUCTURE_RAMPART && s.my) && policy.goal(colony,record,s)>0);
  const planned=policy.plan(record)?.tiles || [];
  const missing=planned.filter(p=>!barriers.some(s=>s.structureType===p.type && s.pos.x===p.x && s.pos.y===p.y));
  const missingGoal=(/** @type {BuildingPosition} */ p)=>Math.min(fortificationHits,p.type===STRUCTURE_RAMPART ? RAMPART_HITS_MAX[level]||0 : WALL_HITS_MAX);
  const fortificationEnergy=barriers.reduce((sum,s)=>sum+Math.max(0,policy.goal(colony,record,s)-s.hits)*REPAIR_COST,0)+
    missing.reduce((sum,p)=>sum+missingGoal(p)*REPAIR_COST,0);
  const constructionEnergy=colony.sites.reduce((sum,s)=>sum+Math.max(0,s.progressTotal-s.progress),0)+
    missing.filter(p=>!colony.sites.some(s=>s.structureType===p.type && s.pos.x===p.x && s.pos.y===p.y)).length;
  const gatePositions=new Set([...colony.structures.filter(s=>s.structureType===STRUCTURE_RAMPART && s.my).map(s=>`${s.pos.x},${s.pos.y}`),
    ...planned.filter(p=>p.type===STRUCTURE_RAMPART).map(p=>`${p.x},${p.y}`)]);
  const rampartUpkeep=gatePositions.size*RAMPART_DECAY_AMOUNT/RAMPART_DECAY_TIME*REPAIR_COST;
  // Long-term wall HP is not a demand to fill storage with the entire repair bill.
  const reserveTarget=Math.max(config.defenseReserveTarget[level]||config.reserveTarget,2*reserveFloor)+Math.min(50000,constructionEnergy);
  const reserveRecovery=Math.max(0,(reserveTarget-stored)/config.reserveRecoveryTicks);
  const reserveDraw=Math.max(0,(stored-reserveTarget)/config.reserveRecoveryTicks);
  const emergency=barriers.some(s=>s.structureType===STRUCTURE_RAMPART && s.hits<Math.min(config.defenseEmergencyHits,policy.goal(colony,record,s)));
  const needed=Math.ceil((fortificationEnergy+constructionEnergy/BUILD_POWER)/config.fortificationHorizon+rampartUpkeep);
  const desiredEngineerWork=Math.min(config.engineerWorkByLevel[level]||config.maxEngineerWork,needed);
  const consumption=constructionEnergy>100 ? BUILD_POWER : 1;
  const engineerReplacement=250/Math.max(300,CREEP_LIFE_TIME-50);
  const theoretical=colony.sources.reduce((sum,s)=>sum+s.energyCapacity/ENERGY_REGEN_TIME,0);
  const window=record.economy?.lastWindow;
  const income=window && window.ticks>=ENERGY_REGEN_TIME ? Math.min(theoretical,window.harvested/window.ticks) : theoretical;
  const replacement=colony.workers.filter(c=>c.memory.role!=='engineer').reduce((sum,c)=>sum+c.body.reduce((n,b)=>n+BODYPART_COST[b.type],0)/CREEP_LIFE_TIME,0);
  const localNetIncome=Math.max(0,income-replacement);
  const ops=record.expansion && (record.expansion.remotes || (record.expansion.remote ? [record.expansion.remote] : [])) || [];
  for(const op of ops){
    const peers=ops.filter(other=>other.room===op.room && !other.retiring && other.reason==='ACTIVE' && other.reserve!==false);
    op.reservationShare=1/Math.max(1,peers.length);
    op.netIncome=remoteNet(op);
  }
  const productive=ops.filter(op=>!op.retiring && op.reason==='ACTIVE');
  const activeRemoteIncome=colony.hostiles.length ? 0 : productive.reduce((sum,op)=>sum+(op.deliverySample && op.deliverySample.rate>=0 ? op.netIncome||0 : 0),0);
  const estimates=ops.filter(op=>!op.retiring && (op.netIncome||0)>=config.minimumRemoteNet);
  const remoteNetIncome=estimates.length ? estimates.reduce((sum,op)=>sum+(op.netIncome||0),0)/estimates.length : 6;
  const controllerDemand=Math.min(level===8 ? 15 : Infinity,record.staffing?.requiredWorkerWork ?? Math.max(2,income-5));
  const towerDemand=colony.hostiles.length ? colony.structures.filter(s=>s.structureType===STRUCTURE_TOWER && s.my).length*TOWER_ENERGY_COST : 0;
  const desiredSpending=desiredEngineerWork*(consumption+engineerReplacement)+rampartUpkeep;
  const remoteDemand=Math.max(0,controllerDemand+towerDemand+desiredSpending+reserveRecovery-localNetIncome);
  const remoteTarget=Math.min(config.maxRemoteRooms,Math.max(1,Math.ceil(remoteDemand/remoteNetIncome)));
  const remoteShortfall=Math.max(0,remoteDemand-activeRemoteIncome);
  const available=Math.max(0,localNetIncome+activeRemoteIncome-controllerDemand-towerDemand-rampartUpkeep+reserveDraw);
  const affordable=Math.floor(available/(consumption+engineerReplacement));
  const engineerWork=stored>reserveFloor ? Math.min(desiredEngineerWork,Math.max(emergency?1:0,affordable)) : emergency?1:0;
  const spending=engineerWork*(consumption+engineerReplacement)+rampartUpkeep;
  let sampleTick=old?.sampleTick ?? Game.time,sampleStore=old?.sampleStore ?? stored,stockDeltaPerTick=old?.stockDeltaPerTick ?? 0;
  if(Game.time-sampleTick>=500){stockDeltaPerTick=(stored-sampleStore)/(Game.time-sampleTick);sampleTick=Game.time;sampleStore=stored;}
  record.budget={stored,reserveFloor,reserveTarget,constructionEnergy,fortificationEnergy,rampartUpkeep,spending,engineerWork,
    desiredEngineerWork,desiredSpending,activeRemoteIncome,remoteDemand,remoteShortfall,reserveDraw,
    remoteTarget,remoteNetIncome,localNetIncome,reserveRecovery,stockDeltaPerTick,sampleTick,sampleStore,fortificationHits,
    fortificationStage:policy.tier(colony,record,barriers),
    reason:stored<=reserveFloor ? 'RESERVE_RECOVERY' : engineerWork<desiredEngineerWork ? 'DEFENSE_INCOME_LIMITED' : needed ? 'FUND_DEFENSES' : 'MAINTAIN_RESERVES'};
}
module.exports={update,costBreakdown,remoteNet,remoteCosts,remoteSpawnLoad};

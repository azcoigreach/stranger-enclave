interface BlockBounds { minX: number; maxX: number; minY: number; maxY: number }
interface BuildingPosition { type: BuildableStructureConstant; x: number; y: number }
interface ColonyRecord {
  perimeterMigration?: PerimeterMigration;
  perimeterProposal?: PerimeterPlan;
  mature?: MaturePlan;
  controllerStations?: Array<{x:number;y:number}>;
  expansion?: { reason: string; remote?: RemoteOperation; remotes?: RemoteOperation[]; scoutRetry?: number; capacityReason?: string; capacityChanged?: number; candidate?: RemoteCandidate; ranking?: RemoteCandidate[]; surveyedAt?: number; resurvey?: string[] };
  perimeter?: PerimeterPlan;
  links?: LinkPlan;
  budget?: ColonyBudget;
  layout?: { version: number; buildings: BuildingPosition[] };
  lastSeen: number;
  level: number;
  energy: number;
  capacity: number;
  workers: number;
  desired?: number;
  reason: string;
  spawnResult?: number;
  planning?: string;
  plannerCursor?: number;
  routes?: Record<string, { tick: number; roundTrip: number; minerTravel: number; reachable: boolean }>;
  staffing?: { minerWork: number; haulCarry: number; workerWork: number; requiredMinerWork: number; requiredHaulCarry: number; requiredWorkerWork: number };
  economy?: EconomyMetrics;
  miningSources?: Record<string, {slots:number; assigned:number; waiting:number}>;
}
interface MiningAssignment { source: Source; pos: {x:number; y:number} }
interface SourceDemand { slots: number; id: Id<Source>; work: number; carry: number; travel: number; reachable: boolean; income: number }
interface EconomyDemand { specialized: boolean; sources: SourceDemand[]; workerWork: number; income: number }
interface SpawnRequest { defenseRoom?:string; sponsor?:string; role: string; targetRoom?: string; sourceId?: Id<Source>; body: BodyPartConstant[]; priority: number; reason: string }
interface EconomyWindow { ticks: number; harvested: number; upgradeEnergy: number; bySource: Record<string, number> }
interface EconomyMetrics extends EconomyWindow {
  lastTick: number;
  lastWindow?: EconomyWindow;
  actors: string[];
  sources: Record<string, { energy: number; capacity: number; regen: number; requiredPerTick: number; unusedLastCycle?: number }>;
}
interface IntelSource { id: Id<Source>; x: number; y: number; capacity: number; slots: {x:number; y:number}[] }
interface IntelRecord { hostiles?:CombatProfile[]; lastSeen: number; kind: string; owner?: string; reservation?: string;
  reservationUntil?: number; controller?: {x:number; y:number}; sources?: IntelSource[];
  exits?: string[]; mineral?: string; hostileParts?: Record<string,number>; unsafeUntil?: number; npc?: boolean;
}
interface RemoteCandidate {
  room: string; sourceId: Id<Source>; travel: number|null; reason: string;
  grossIncome?: number; netIncome?: number; spawnLoad?: number;
  costs?: { mining:number; hauling:number; reservation:number; infrastructure:number; guard:number };
}
interface RemoteOperation {
  room: string; sourceId: Id<Source>; reason: string; travel: number; carry: number;
  grossIncome?:number; reserve?:boolean; reservationShare?:number;
  retiring?: boolean; netIncome?: number; deliverySample?: {tick:number; delivered:number; rate:number};
  routeValid?: boolean; checked: number; delivered: number; spawnEnergy: number; actors?: string[]; measuredTick?: number;
}
interface AlertRecord { count: number; last: number; message: string }
interface BotMemory {
  defense?: {tick:number;rooms:Record<string,DefenseIncident>};
  version: number;
  /** Required by schema 2; absent only in legacy schema 1 before migration. */
  home?: string;
  block: BlockBounds;
  colonies: { [name: string]: ColonyRecord };
  intel: { [name: string]: IntelRecord };
  alerts: { [key: string]: AlertRecord };
  samples: { tick: number; cpu: number; bucket: number }[];
  sequence: number;
}
interface Memory { enclave?: BotMemory }
interface CreepMemory {
  defenseRoom?:string;
  evacuation?:{room:string;incident:string;fallback?:string};
    feedingLink?: boolean;
    parkingSpot?: {x:number;y:number;roomName:string};
    moveGoal?: {x:number;y:number;roomName:string;range:number;tick:number};
  role?: string;
  targetRoom?: string;
  scoutSince?: number;
  scoutBlocked?: Record<string,number>;
  home?: string;
  working?: boolean;
  sourceId?: Id<Source>;
  workTarget?: string;
  lastMove?: number;
  moveReason?: 'FATIGUE' | 'IN_RANGE' | 'WAIT_TRAFFIC' | 'YIELD_TRAFFIC' | 'YIELD_TRANSIT' | 'FOLLOW_ROUTE' | 'NO_COMPLETE_ROUTE';
  yieldUntil?: number;
  miningSpot?: {x:number; y:number};
  task?: string;
  lastAction?: number;
  motion?: { previousX?:number;previousY?:number;recoverUntil?:number; x: number; y: number; tick: number; stuck: number };
}
interface ColonySnapshot {
  mining?: Map<string, MiningAssignment>;
  demand?: EconomyDemand;
  room: Room;
  controller: StructureController;
  spawns: StructureSpawn[];
  structures: AnyStructure[];
  sources: Source[];
  sites: ConstructionSite[];
  workers: Creep[];
  hostiles: Creep[];
}
declare const global: {
  approvePerimeter: (name:string, plannedAt:number)=>object;
  status: () => object;
  roomReport: (name: string) => object;
  territoryReport: () => object;
  explain: (name: string) => object;
};

interface PerimeterPlan {
  routes?: Array<{x:number;y:number}>;
  legacyWalls?: Array<{x:number;y:number}>; version:number; status:string; plannedAt:number; tiles:BuildingPosition[]; inside:number[]; gates:number; cutSize:number }
interface LinkPlan { hub:{x:number;y:number}; controller:{x:number;y:number}; status:string; transfer?:{tick:number; amount:number; result:number} }
interface ColonyBudget {
  stored:number; reserveFloor:number; reserveTarget:number; constructionEnergy:number; fortificationEnergy:number;
  rampartUpkeep:number; spending:number; engineerWork:number; remoteTarget:number; remoteNetIncome:number;
  localNetIncome:number; reserveRecovery:number; stockDeltaPerTick:number; sampleTick:number; sampleStore:number;
  fortificationHits:number; fortificationStage:number; desiredEngineerWork:number; desiredSpending:number; activeRemoteIncome:number; remoteDemand:number; remoteShortfall:number; reserveDraw:number; reason:string;
}

interface MaturePlan {
  policyKey?:string;
  buildingArea?:number[];
  version: number;
  status: string;
  buildings: BuildingPosition[];
  labInputs?: Array<{x:number;y:number}>;
  cursor: number;
  labCursor: number;
  footprint: string;
  insideTiles: number;
}

interface PerimeterMigration {
 approvedAt:number; plannedAt:number; phase:string; reason:string;
 legacyWalls:Array<{x:number;y:number}>; conversions:Array<{x:number;y:number}>;
 guard?:{x:number;y:number;creep?:string}; completedAt?:number;
 lastAction?:{tick:number;x:number;y:number;action:string;result:number};
}

interface CombatProfile {
 id:string;owner:string;kind:string;x:number;y:number;parts:Record<string,number>;boosts:Record<string,number>;
 attack:number;ranged:number;heal:number;dismantle:number;move:number;weight:number;reduction:number;effectiveHits:number;maxHits:number;hits:number;ttl:number;fatigue:number;
}
interface DefenseIncident {
 since:number;lastThreat:number;mode:'clear'|'evacuate'|'escort'|'intercept'|'tower';reason:string;
 assigned:string[];roster:Array<{name:string;readyAt:number;lost?:boolean}>;spawned:number;spent:number;losses:number;
 clearance:string;clearSince?:number;lastClear?:number;age?:number;eta?:number;contactIn?:number;request?:SpawnRequest;fallbacks:string[];
}

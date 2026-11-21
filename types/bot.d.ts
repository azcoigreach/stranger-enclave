interface BlockBounds { minX: number; maxX: number; minY: number; maxY: number }
interface BuildingPosition { type: BuildableStructureConstant; x: number; y: number }
interface ColonyRecord {
  expansion?: { reason: string; remote?: RemoteOperation; scoutRetry?: number };
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
interface SpawnRequest { role: string; targetRoom?: string; sourceId?: Id<Source>; body: BodyPartConstant[]; priority: number; reason: string }
interface EconomyWindow { ticks: number; harvested: number; upgradeEnergy: number; bySource: Record<string, number> }
interface EconomyMetrics extends EconomyWindow {
  lastTick: number;
  lastWindow?: EconomyWindow;
  actors: string[];
  sources: Record<string, { energy: number; capacity: number; regen: number; requiredPerTick: number; unusedLastCycle?: number }>;
}
interface IntelSource { id: Id<Source>; x: number; y: number; capacity: number; slots: {x:number; y:number}[] }
interface IntelRecord { lastSeen: number; kind: string; owner?: string; reservation?: string;
  reservationUntil?: number; controller?: {x:number; y:number}; sources?: IntelSource[];
  exits?: string[]; mineral?: string; hostileParts?: Record<string,number>; unsafeUntil?: number; npc?: boolean;
}
interface RemoteOperation {
  room: string; sourceId: Id<Source>; reason: string; travel: number; carry: number;
  routeValid?: boolean; checked: number; delivered: number; spawnEnergy: number; actors?: string[]; measuredTick?: number;
}
interface AlertRecord { count: number; last: number; message: string }
interface BotMemory {
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
  role?: string;
  targetRoom?: string;
  scoutSince?: number;
  scoutBlocked?: Record<string,number>;
  home?: string;
  working?: boolean;
  sourceId?: Id<Source>;
  miningSpot?: {x:number; y:number};
  task?: string;
  lastAction?: number;
  motion?: { x: number; y: number; tick: number; stuck: number };
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
  status: () => object;
  roomReport: (name: string) => object;
  territoryReport: () => object;
  explain: (name: string) => object;
};

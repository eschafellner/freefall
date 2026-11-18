import type { PositionXZ } from '../config/movement.ts';

export type MissionState = 'CARRIER_HUB' | 'MISSION_SELECTION' | 'BOARDING' | 'DEPLOYMENT' |
  'ACTIVE_MISSION' | 'OBJECTIVES_COMPLETED' | 'EXTRACTION_AVAILABLE' | 'EXTRACTION_IN_PROGRESS' |
  'MISSION_RESULTS' | 'RETURN_TO_CARRIER';

export type DeploymentPhase = 'DOCKED' | 'BOARDING' | 'LOCKED' | 'DROPPING' | 'ATMOSPHERIC_ENTRY' |
  'BRAKING' | 'TOUCHDOWN' | 'DEPLOYED';

export type ExtractionMethod = 'albatross' | 'balloon';
export type ThrusterState = 'INTACT' | 'DAMAGED' | 'DESTROYED';

export interface OperatorStatus {
  id: string;
  connected: boolean;
  participating: boolean;
  boarded: boolean;
  ready: boolean;
  endVote: boolean;
}

export interface AlbatrossSnapshot extends PositionXZ {
  id: string;
  hullHealth: number;
  maxHullHealth: number;
  lifecycleState: 'OPERATIONAL' | 'DAMAGED' | 'DISABLED' | 'DESTROYED';
  extractionAvailable: boolean;
  thrusters: { health: number; maxHealth: number; state: ThrusterState; lastHitAt: number }[];
  lastHitAt: number;
}

export interface ConvictSnapshot extends PositionXZ {
  id: string;
  slot: number;
  hp: number;
  maxHp: number;
  yaw: number;
  equipmentId: string;
  weaponId: string;
  team: 'carrier';
  state: 'ABOARD' | 'MOVING' | 'DEFENDING' | 'FIRING' | 'DEAD';
  lastHitAt: number;
  reloadUntil: number;
}

export interface ExtractionSnapshot extends PositionXZ {
  method: ExtractionMethod;
  phase: 'COUNTDOWN' | 'APPROACH' | 'LIFT';
  startedAt: number;
  phaseAt: number;
  endsAt: number;
  securedIds: string[];
  anchorOperatorId?: string;
  radius: number;
}

export interface MissionSelection {
  planetId: string;
  missionId: string;
  difficultyId: string;
}

export type MissionAction = 'ready' | 'balloon' | 'secure' | 'albatross' | 'return-vote';

export const isCarrierScene = (state: MissionState, phase: DeploymentPhase): boolean =>
  state === 'CARRIER_HUB' || state === 'MISSION_SELECTION' || state === 'BOARDING' ||
  (state === 'DEPLOYMENT' && phase !== 'TOUCHDOWN');

export type PatrolState = 'PATROLLING' | 'SUSPICIOUS' | 'INVESTIGATING' | 'ALERTED' |
  'CALLING_REINFORCEMENTS' | 'ENGAGING' | 'SEARCHING' | 'RETURNING' | 'ELIMINATED';

export type NestState = 'EMERGING' | 'ACTIVE' | 'DAMAGED' | 'DESTROYING' | 'DESTROYED';
export type ObjectiveState = 'locked' | 'available' | 'defending' | 'complete';
export interface ObjectiveSnapshot { id: string; state: ObjectiveState; progress: number; completeAt: number }
export interface NestSnapshot extends PositionXZ {
  id: number;
  rotation: number;
  hp: number;
  maxHp: number;
  state: NestState;
  breachId: number;
  startedAt: number;
  opensAt: number;
  destroyedAt: number;
  lastHitAt: number;
  lastSpawnAt: number;
  exit: number;
}

export const NEST_RADIUS = 3.8;
export const NEST_HIT_HEIGHT = 1.55;
export const NEST_EXIT_RADIUS = 4.8;
export const NEST_EXITS = 3;
export const NEST_COLLAPSE_TICKS = 64;

export interface AlarmSnapshot { groupId: number; enemyId: number; startedAt: number; endsAt: number }
export interface MissionResult {
  id: string;
  missionInstanceId: string;
  missionId: string;
  difficultyId: string;
  primaryObjectivesCompleted: boolean;
  extractionAttempted: boolean;
  extractionSucceeded: boolean;
  extractionMethod: ExtractionMethod | 'none';
  extractedOperatorIds: string[];
  convictsDeployed: number;
  convictsSurvived: number;
  albatrossSurvived: boolean;
  baseExperience: number;
  extractionBonusExperience: number;
  rewards: { operatorId: string; baseExperience: number; extractionBonusExperience: number; totalExperience: number }[];
}

export interface MissionSnapshot {
  tick: number;
  missionId: string;
  difficultyId: string;
  state: MissionState;
  instanceId?: string;
  selection?: MissionSelection;
  operators: OperatorStatus[];
  phase: DeploymentPhase;
  phaseAt: number;
  phaseUntil: number;
  boardingUntil: number;
  primaryObjectivesCompleted: boolean;
  albatross?: AlbatrossSnapshot;
  convicts: ConvictSnapshot[];
  extraction?: ExtractionSnapshot;
  resultUntil: number;
  objectives: ObjectiveSnapshot[];
  result?: MissionResult;
  threat: number;
  nests: NestSnapshot[];
  alarms: AlarmSnapshot[];
  groups: number;
  activeNests: number;
  activeBreaches: number;
  breachCount: number;
  nestsDestroyed: number;
  debug: boolean;
}

interface MissionEventData {
  MissionStarted: { missionId: string; difficultyId: string };
  ObjectiveUpdated: ObjectiveSnapshot;
  PatrolAlerted: { groupId: number };
  ReinforcementCallStarted: AlarmSnapshot;
  ReinforcementCallInterrupted: { groupId: number; reason: 'caller-killed' | 'channel-unavailable' | 'mission-ended' };
  ReinforcementCallCompleted: { groupId: number; breachId?: number; boostedNestId?: number };
  SwarmBreachStarted: { id: number; nestId: number; position: PositionXZ; opensAt: number };
  SwarmNestCreated: { nestId: number; breachId: number };
  SwarmNestDamaged: { nestId: number; hp: number; shooter: string };
  SwarmNestDestroyed: { nestId: number; shooter?: string };
  AlbatrossTouchdown: { entityId: string; position: PositionXZ };
  AlbatrossDamaged: { entityId: string; thruster?: number; amount: number };
  ExtractionBeaconActivated: { position: PositionXZ };
  ExtractionStarted: { method: ExtractionMethod; arrivalAt: number };
  MissionCompleted: { result: MissionResult };
}

export type MissionEvent = {
  [K in keyof MissionEventData]: { type: K; tick: number } & MissionEventData[K]
}[keyof MissionEventData];

export type MissionDebugAction = 'patrol' | 'alert' | 'breach' | 'nest' | 'destroy-nest' | 'objectives' |
  'carrier' | 'board' | 'deploy' | 'land' | 'damage-thruster' | 'destroy-albatross' |
  'balloon' | 'fighter';

import { NET, clearGroundLine, distanceSquared, openGround } from '@freefall/shared';
import type { AlarmSnapshot, DifficultyDefinition, MissionEvent, PatrolRegion, PatrolState, PositionXZ, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { GroundNavigation } from './GroundNavigation.ts';

const PERCEPTION_PERIOD = 6;
const CALL_TICKS = 3 * NET.tickHz;
const CONTACT_MEMORY = 6 * NET.tickHz;
const BASE_SIGHT_RANGE = 31;
const BASE_COOLDOWN = 35 * NET.tickHz;

export interface PatrolGroup {
  readonly id: number;
  readonly region: PatrolRegion;
  readonly members: Map<number, number>;
  readonly position: PositionXZ;
  readonly lastKnown: PositionXZ;
  state: PatrolState;
  waypoint: number;
  target: number;
  facing: number;
  until: number;
  lastSeen: number;
  nextCall: number;
  alarm?: AlarmSnapshot;
  caller: number;
  pendingMembers: number;
}

interface Noise extends PositionXZ { radius: number; expires: number }
type Emit = (event: MissionEvent) => void;
type Reinforce = (position: PositionXZ, tick: number) => { breachId?: number; boostedNestId?: number } | undefined;

export class PatrolManager {
  readonly groups = new Map<number, PatrolGroup>();
  private readonly membership: (PatrolGroup | undefined)[] = [];
  private readonly activeIds: Uint32Array;
  private readonly offsetX: Float32Array;
  private readonly offsetZ: Float32Array;
  private readonly noises: Noise[] = [];
  private readonly nav: GroundNavigation;
  private serial = 0;
  private landingContactAt = Infinity;
  private readonly world: WorldDefinition;
  private readonly horde: HordeManager;
  private readonly random: () => number;
  private readonly emit: Emit;

  constructor(world: WorldDefinition, horde: HordeManager, random: () => number, emit: Emit) {
    this.world = world;
    this.horde = horde;
    this.random = random;
    this.emit = emit;
    this.nav = new GroundNavigation(world);
    this.activeIds = new Uint32Array(horde.id.length);
    this.offsetX = new Float32Array(horde.x.length);
    this.offsetZ = new Float32Array(horde.x.length);
  }

  create(region: PatrolRegion, waypoint: number, pendingMembers = 0, origin = region.route.waypoints[waypoint]): PatrolGroup {
    const id = ++this.serial;
    const position = { x: origin.x, z: origin.z };
    const next = region.route.waypoints[(waypoint + 1) % region.route.waypoints.length];
    const group: PatrolGroup = {
      id, region, position, lastKnown: { ...position }, members: new Map(), state: 'PATROLLING',
      waypoint: (waypoint + 1) % region.route.waypoints.length, pendingMembers,
      target: -1, facing: Math.atan2(next.x - origin.x, origin.z - next.z),
      until: 0, lastSeen: -Infinity, nextCall: 0, caller: -1,
    };
    this.groups.set(id, group);
    return group;
  }

  attach(group: PatrolGroup, slot: number): void {
    group.members.set(slot, this.horde.id[slot]);
    this.membership[slot] = group;
    const angle = group.members.size * 2.39996;
    const spacing = Math.sqrt(group.members.size) * (.8 + this.random() * .35);
    this.offsetX[slot] = Math.cos(angle) * spacing;
    this.offsetZ[slot] = Math.sin(angle) * spacing;
    this.horde.yaw[slot] = group.facing;
    this.horde.target[slot] = group.target;
  }

  enableLandingContact(tick: number): void { this.landingContactAt = tick; }

  reportNoise(position: PositionXZ, kind: 'shot' | 'explosion' | 'landing' | 'beacon', tick: number): void {
    if ((kind === 'shot' || kind === 'explosion') && tick < this.landingContactAt && distanceSquared(position, this.world.deployment) < this.world.deployment.radius ** 2) return;
    if (this.noises.length >= 48) this.noises.shift();
    this.noises.push({ x: position.x, z: position.z, radius: { shot: 48, explosion: 82, landing: 100, beacon: 132 }[kind], expires: tick + (kind === 'landing' || kind === 'beacon' ? 4 * NET.tickHz : 12) });
  }

  canPursueSecondary(slot: number): boolean {
    const group = this.membership[slot];
    return !group || (group.caller !== slot && group.state !== 'PATROLLING' && group.state !== 'RETURNING');
  }

  private living(slot: number, id: number): boolean {
    return this.activeIds[slot] === id && this.horde.hp[slot] > 0;
  }

  steer(slot: number, target: PositionXZ): void {
    this.nav.steer(this.horde.x[slot], this.horde.z[slot], target);
  }

  readonly destination = (players: readonly (SimPlayer | undefined)[], slot: number, output: PositionXZ): number => {
    const group = this.membership[slot];
    if (!group || group.caller === slot) return 0;
    const waypoint = group.region.route.waypoints[group.waypoint];
    const player = players[group.target];
    const chasing = player && player.hp > 0 && group.state === 'ENGAGING';
    const movingOnRoute = group.state === 'PATROLLING' || group.state === 'RETURNING';
    const goal = chasing ? player : movingOnRoute ? waypoint : group.lastKnown;
    const offset = chasing ? 0 : 1;
    output.x = goal.x + this.offsetX[slot] * offset;
    output.z = goal.z + this.offsetZ[slot] * offset;
    if (offset && !openGround(this.world, output.x, output.z, .42)) {
      output.x = goal.x;
      output.z = goal.z;
    }
    this.steer(slot, output);
    return movingOnRoute ? .71 : group.state === 'SUSPICIOUS' ? .38 : 1;
  };

  private contact(group: PatrolGroup, players: readonly (SimPlayer | undefined)[], range: number, tick: number): SimPlayer | undefined {
    let seen: SimPlayer | undefined;
    let nearest = range ** 2;
    const { x, z } = group.position;
    const wary = group.state !== 'PATROLLING' && group.state !== 'RETURNING';
    for (const player of players) {
      if (!player || player.hp <= 0 || (tick < this.landingContactAt && distanceSquared(player, this.world.deployment) < this.world.deployment.radius ** 2)) continue;
      const d2 = distanceSquared(player, group.position);
      if (d2 > nearest) continue;
      if (!wary && d2 > 9 ** 2) {
        const dot = (player.x - x) * Math.sin(group.facing) - (player.z - z) * Math.cos(group.facing);
        if (dot < Math.sqrt(d2) * .24) continue;
      }
      if (!clearGroundLine(this.world, x, z, player.x, player.z)) continue;
      seen = player;
      nearest = d2;
    }
    return seen;
  }

  forceAlert(group: PatrolGroup, player: SimPlayer, tick: number): void {
    if (group.alarm || !group.members.size) return;
    this.remember(group, player, tick);
    group.state = 'ALERTED';
    group.until = tick + 10;
    this.emit({ type: 'PatrolAlerted', groupId: group.id, tick });
  }

  private remember(group: PatrolGroup, player: SimPlayer, tick: number): void {
    group.target = player.slot;
    group.lastKnown.x = player.x;
    group.lastKnown.z = player.z;
    group.lastSeen = tick;
  }

  private returnToRoute(group: PatrolGroup): void {
    const points = group.region.route.waypoints;
    group.waypoint = points.reduce((best, point, i) =>
      distanceSquared(point, group.position) < distanceSquared(points[best], group.position) ? i : best, 0);
    group.target = -1;
    group.state = 'RETURNING';
  }

  private perceive(group: PatrolGroup, players: readonly (SimPlayer | undefined)[], tick: number, difficulty: DifficultyDefinition): void {
    const seen = this.contact(group, players, BASE_SIGHT_RANGE * difficulty.detectionRangeMultiplier, tick);
    if (seen) {
      if (group.state === 'PATROLLING' || group.state === 'RETURNING' ||
          group.state === 'INVESTIGATING' || group.state === 'SUSPICIOUS') this.forceAlert(group, seen, tick);
      else {
        this.remember(group, seen, tick);
        if (group.state === 'SEARCHING') group.state = 'ENGAGING';
      }
      return;
    }
    group.target = -1;
    if (group.state === 'PATROLLING' || group.state === 'RETURNING') {
      const noise = this.noises.findLast((noise) => distanceSquared(noise, group.position) <= noise.radius ** 2);
      if (noise) {
        group.lastKnown.x = noise.x;
        group.lastKnown.z = noise.z;
        group.state = 'SUSPICIOUS';
        group.until = tick + 18;
      }
    }
  }

  private advance(group: PatrolGroup, tick: number, difficulty: DifficultyDefinition, canCall: boolean): void {
    const waypoint = group.region.route.waypoints[group.waypoint];
    switch (group.state) {
      case 'PATROLLING':
      case 'RETURNING':
        if (distanceSquared(group.position, waypoint) < 4 ** 2) {
          group.waypoint = (group.waypoint + 1) % group.region.route.waypoints.length;
          group.state = 'PATROLLING';
        }
        break;
      case 'SUSPICIOUS':
        if (tick >= group.until) {
          group.until = tick + 17 * NET.tickHz;
          group.state = 'INVESTIGATING';
        }
        break;
      case 'INVESTIGATING':
        if (tick >= group.until || distanceSquared(group.position, group.lastKnown) < 4 ** 2) {
          group.state = 'SEARCHING';
          group.until = tick + 3 * NET.tickHz;
        }
        break;
      case 'ALERTED':
        if (tick < group.until) break;
        group.state = 'ENGAGING';
        if (!canCall || tick < group.nextCall) break;
        for (const [slot, id] of group.members) {
          if (!this.living(slot, id)) continue;
          group.caller = slot;
          group.alarm = { groupId: group.id, enemyId: id, startedAt: tick, endsAt: tick + CALL_TICKS };
          group.state = 'CALLING_REINFORCEMENTS';
          group.nextCall = tick + Math.ceil(BASE_COOLDOWN * difficulty.reinforcementCooldownMultiplier);
          this.emit({ type: 'ReinforcementCallStarted', ...group.alarm, tick });
          break;
        }
        break;
      case 'ENGAGING':
        if (group.lastSeen + CONTACT_MEMORY <= tick) {
          group.target = -1;
          group.state = 'SEARCHING';
          group.until = tick + 4 * NET.tickHz;
        }
        break;
      case 'SEARCHING':
        if (tick >= group.until) this.returnToRoute(group);
        break;
    }
  }

  private finishCall(group: PatrolGroup, tick: number, request: Reinforce): void {
    const alarm = group.alarm;
    if (!alarm) return;
    const alive = this.living(group.caller, alarm.enemyId);
    if (alive && tick < alarm.endsAt) return;
    if (alive) {
      const result = request(group.lastKnown, tick);
      if (result) this.emit({ type: 'ReinforcementCallCompleted', groupId: group.id, ...result, tick });
      else this.emit({ type: 'ReinforcementCallInterrupted', groupId: group.id, reason: 'channel-unavailable', tick });
    } else {
      this.emit({ type: 'ReinforcementCallInterrupted', groupId: group.id, reason: 'caller-killed', tick });
    }
    group.alarm = undefined;
    group.caller = -1;
    group.state = 'ENGAGING';
  }

  update(players: readonly (SimPlayer | undefined)[], tick: number, difficulty: DifficultyDefinition,
    canCall: boolean, request: Reinforce): void {
    this.activeIds.fill(0);
    for (let i = 0; i < this.horde.count; i++) {
      const slot = this.horde.active[i];
      this.activeIds[slot] = this.horde.id[slot];
    }
    let ongoing = 0;
    for (const group of this.groups.values()) if (group.alarm) ongoing++;
    const callLimit = difficulty.maxConcurrentBreaches + 1;
    for (let i = this.noises.length - 1; i >= 0; i--) if (this.noises[i].expires < tick) this.noises.splice(i, 1);
    for (const group of this.groups.values()) {
      const hadAlarm = Boolean(group.alarm);
      this.finishCall(group, tick, request);
      if (hadAlarm && !group.alarm) ongoing--;
      if ((tick + group.id) % PERCEPTION_PERIOD !== 0) continue;
      let x = 0;
      let z = 0;
      for (const [slot, id] of group.members) {
        if (!this.living(slot, id)) {
          group.members.delete(slot);
          continue;
        }
        x += this.horde.x[slot];
        z += this.horde.z[slot];
      }
      if (group.members.size === 0) {
        if (!group.pendingMembers) {
          group.state = 'ELIMINATED';
          this.groups.delete(group.id);
        }
        continue;
      }
      x /= group.members.size;
      z /= group.members.size;
      if (Math.hypot(x - group.position.x, z - group.position.z) > .12) {
        group.facing = Math.atan2(x - group.position.x, group.position.z - z);
      }
      group.position.x = x;
      group.position.z = z;
      this.perceive(group, players, tick, difficulty);
      const stillCalling = Boolean(group.alarm);
      this.advance(group, tick, difficulty, canCall && ongoing < callLimit);
      if (!stillCalling && group.alarm) ongoing++;
      for (const slot of group.members.keys()) {
        this.horde.target[slot] = group.caller === slot ? -1 : group.target;
      }
    }
  }

  halt(tick: number): void {
    for (const group of this.groups.values()) {
      if (!group.alarm) continue;
      this.emit({ type: 'ReinforcementCallInterrupted', groupId: group.id, reason: 'mission-ended', tick });
      group.alarm = undefined;
      group.caller = -1;
      group.state = 'ENGAGING';
    }
  }

  alarms(): AlarmSnapshot[] {
    const alarms: AlarmSnapshot[] = [];
    for (const group of this.groups.values()) if (group.alarm) alarms.push(group.alarm);
    return alarms;
  }
}

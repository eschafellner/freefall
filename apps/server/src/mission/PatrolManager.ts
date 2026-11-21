import { NET, clearWorldLine, distanceSquared, groundHeight, openGround, postureCollider } from '@freefall/shared';
import type { AlarmSnapshot, MissionBalance, MissionEvent, PatrolRegion, PatrolState, PositionXZ, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { GroundNavigation } from './GroundNavigation.ts';
import { currentOperator, selectOperator, validOperator } from '../systems/enemyTargeting.ts';

export interface PatrolGroup {
  readonly id: number;
  readonly region: PatrolRegion;
  readonly members: Map<number, number>;
  readonly position: PositionXZ;
  readonly lastKnown: PositionXZ;
  state: PatrolState;
  waypoint: number;
  target: number;
  targetPlayer?: SimPlayer;
  targetLife: number;
  committedUntil: number;
  facing: number;
  until: number;
  lastSeen: number;
  nextCall: number;
  routeCheckAt: number;
  alarm?: AlarmSnapshot;
  caller: number;
  pendingMembers: number;
  readonly canReinforce: boolean;
}

interface Noise extends PositionXZ { radius: number; expires: number }
type Emit = (event: MissionEvent) => void;
type Reinforce = (position: PositionXZ, tick: number) => { breachId?: number; boostedNestId?: number } | undefined;

export class PatrolManager {
  readonly groups = new Map<number, PatrolGroup>();
  perceptionMs = 0;
  activeCalls = 0;
  private readonly membership: (PatrolGroup | undefined)[] = [];
  private readonly activeIds: Uint32Array;
  private readonly offsetX: Float32Array;
  private readonly offsetZ: Float32Array;
  private readonly noises: Noise[] = [];
  readonly navigation: GroundNavigation;
  private readonly probe = { x: 0, z: 0 };
  private readonly movement: MissionBalance['movement'];
  private readonly targeting: MissionBalance['hordeAi']['targeting'];
  private serial = 0;
  private landingContactAt = Infinity;
  private readonly world: WorldDefinition;
  private readonly horde: HordeManager;
  private readonly random: () => number;
  private readonly emit: Emit;
  /** Effective patrol and call values of this mission run. Difficulty is already applied. */
  private readonly config: MissionBalance['patrols'];
  private readonly calls: MissionBalance['reinforcements'];
  private readonly limits: MissionBalance['limits'];

  constructor(world: WorldDefinition, horde: HordeManager, random: () => number, emit: Emit, balance: MissionBalance) {
    this.world = world;
    this.horde = horde;
    this.random = random;
    this.emit = emit;
    this.config = balance.patrols;
    this.movement = balance.movement;
    this.targeting = balance.hordeAi.targeting;
    this.calls = balance.reinforcements;
    this.limits = balance.limits;
    this.navigation = new GroundNavigation(world, balance.hordeAi);
    this.activeIds = new Uint32Array(horde.id.length);
    this.offsetX = new Float32Array(horde.x.length);
    this.offsetZ = new Float32Array(horde.x.length);
  }

  create(region: PatrolRegion, waypoint: number, pendingMembers = 0, origin = region.route.waypoints[waypoint],
    canReinforce = true): PatrolGroup {
    const id = ++this.serial;
    const position = { x: origin.x, z: origin.z };
    const next = region.route.waypoints[(waypoint + 1) % region.route.waypoints.length];
    const group: PatrolGroup = {
      id, region, position, lastKnown: { ...position }, members: new Map(), state: 'PATROLLING',
      waypoint: (waypoint + 1) % region.route.waypoints.length, pendingMembers,
      target: -1, targetLife: 0, committedUntil: 0, facing: Math.atan2(next.x - origin.x, origin.z - next.z),
      until: 0, lastSeen: -Infinity, nextCall: 0, routeCheckAt: 0, caller: -1, canReinforce,
    };
    this.groups.set(id, group);
    return group;
  }

  dispatch(region: PatrolRegion, origin: PositionXZ, focus: PositionXZ, until: number): PatrolGroup {
    const group = this.create(region, 0, 0, origin, false);
    Object.assign(group.lastKnown, focus);
    group.state = 'INVESTIGATING';
    group.until = until;
    group.facing = Math.atan2(focus.x - origin.x, origin.z - focus.z);
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
    this.horde.target[slot] = -1;
  }

  enableLandingContact(tick: number): void { this.landingContactAt = tick; }

  reportNoise(position: PositionXZ, kind: 'shot' | 'explosion' | 'landing' | 'beacon', tick: number): void {
    if ((kind === 'shot' || kind === 'explosion') && tick < this.landingContactAt && distanceSquared(position, this.world.deployment) < this.world.deployment.radius ** 2) return;
    if (this.noises.length >= this.config.maxRememberedNoises) this.noises.shift();
    this.noises.push({ x: position.x, z: position.z, radius: this.config.noiseRadius[kind], expires: tick + this.config.noiseLifetimeTicks[kind] });
  }

  groupFor(slot: number): PatrolGroup | undefined {
    const group = this.membership[slot];
    return group?.members.get(slot) === this.horde.id[slot] ? group : undefined;
  }

  targetFor(players: readonly (SimPlayer | undefined)[], slot: number): SimPlayer | undefined {
    const group = this.groupFor(slot);
    if (group && group.caller !== slot && group.target !== -1) {
      return currentOperator(players, group.targetPlayer, group.targetLife);
    }
  }

  canPursueSecondary(slot: number): boolean {
    const group = this.groupFor(slot);
    return !group || (group.caller !== slot && group.state !== 'PATROLLING' && group.state !== 'RETURNING');
  }

  private living(slot: number, id: number): boolean {
    return this.activeIds[slot] === id && this.horde.hp[slot] > 0;
  }

  readonly destination = (players: readonly (SimPlayer | undefined)[], slot: number, output: PositionXZ): number => {
    const group = this.groupFor(slot);
    if (!group || group.caller === slot) return 0;
    const waypoint = group.region.route.waypoints[group.waypoint];
    const player = players[this.horde.target[slot]];
    const chasing = validOperator(player) && group.state === 'ENGAGING';
    const movingOnRoute = group.state === 'PATROLLING' || group.state === 'RETURNING';
    const goal = chasing ? player : movingOnRoute ? waypoint : group.lastKnown;
    const offset = chasing ? 0 : 1;
    output.x = goal.x + this.offsetX[slot] * offset;
    output.z = goal.z + this.offsetZ[slot] * offset;
    if (offset && !openGround(this.world, output.x, output.z, .42)) {
      output.x = goal.x;
      output.z = goal.z;
    }
    return movingOnRoute ? this.config.routeSpeedScale : group.state === 'SUSPICIOUS' ? this.config.suspiciousSpeedScale : 1;
  };

  private contact(group: PatrolGroup, players: readonly (SimPlayer | undefined)[], range: number, tick: number): SimPlayer | undefined {
    const { x, z } = group.position;
    const wary = group.state !== 'PATROLLING' && group.state !== 'RETURNING';
    const facingX = Math.sin(group.facing), facingZ = -Math.cos(group.facing);
    const current = currentOperator(players, group.targetPlayer, group.targetLife);
    return selectOperator(players, x, z, this.targeting, current, tick < group.committedUntil, range, (player) => {
      if (tick < this.landingContactAt && distanceSquared(player, this.world.deployment) < this.world.deployment.radius ** 2) return false;
      const dx = player.x - x, dz = player.z - z;
      const d2 = dx * dx + dz * dz;
      if (!wary && d2 > this.config.closeAwarenessRange ** 2 &&
          dx * facingX + dz * facingZ < Math.sqrt(d2) * this.config.fieldOfViewDot) return false;
      const shape = postureCollider(player.posture, tick, this.movement);
      const eye = groundHeight(this.world, x, z) + 1;
      const sightY = Math.min(groundHeight(this.world, player.x, player.z) + 1, player.y + shape.height * .8);
      if (!clearWorldLine(this.world, x, eye, z, dx, sightY - eye, dz)) return false;
      return this.navigation.reachable(x, z, player.x, player.z);
    });
  }

  forceAlert(group: PatrolGroup, player: SimPlayer, tick: number): void {
    if (group.alarm || !group.members.size || !validOperator(player)) return;
    this.remember(group, player, tick);
    group.state = 'ALERTED';
    group.until = tick + this.config.alertDelayTicks;
    this.emit({ type: 'PatrolAlerted', groupId: group.id, tick });
  }

  private remember(group: PatrolGroup, player: SimPlayer, tick: number): void {
    if (group.targetPlayer !== player || group.targetLife !== player.life) group.committedUntil = tick + this.targeting.commitmentTicks;
    group.target = player.slot;
    group.targetPlayer = player;
    group.targetLife = player.life;
    group.lastKnown.x = player.x;
    group.lastKnown.z = player.z;
    group.lastSeen = tick;
  }

  private returnToRoute(group: PatrolGroup): void {
    const points = group.region.route.waypoints;
    group.waypoint = points.reduce((best, point, i) =>
      distanceSquared(point, group.position) < distanceSquared(points[best], group.position) ? i : best, 0);
    group.target = -1;
    group.targetPlayer = undefined;
    group.routeCheckAt = 0;
    group.state = 'RETURNING';
  }

  private perceive(group: PatrolGroup, players: readonly (SimPlayer | undefined)[], tick: number): void {
    const seen = this.contact(group, players, this.config.sightRange, tick);
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
        group.until = tick + this.config.suspiciousDelayTicks;
      }
    }
  }

  private advance(group: PatrolGroup, tick: number, canCall: boolean): void {
    const waypoint = group.region.route.waypoints[group.waypoint];
    switch (group.state) {
      case 'PATROLLING':
      case 'RETURNING':
        if (distanceSquared(group.position, waypoint) < 4 ** 2) {
          group.waypoint = (group.waypoint + 1) % group.region.route.waypoints.length;
          group.state = 'PATROLLING';
          group.routeCheckAt = 0;
        } else if (tick >= group.routeCheckAt) {
          group.routeCheckAt = tick + NET.tickHz;
          const points = group.region.route.waypoints;
          // A centroid can be inside a blocker even when its members are on valid ground.
          const anchor = group.members.keys().next().value!;
          for (let i = 0; i < points.length; i++) {
            const candidate = (group.waypoint + i) % points.length;
            this.probe.x = points[candidate].x;
            this.probe.z = points[candidate].z;
            if (!this.navigation.reachable(this.horde.x[anchor], this.horde.z[anchor], this.probe.x, this.probe.z)) continue;
            group.waypoint = candidate;
            break;
          }
        }
        break;
      case 'SUSPICIOUS':
        if (tick >= group.until) {
          group.until = tick + this.config.investigateTicks;
          group.state = 'INVESTIGATING';
        }
        break;
      case 'INVESTIGATING':
        if (tick >= group.until || distanceSquared(group.position, group.lastKnown) < 4 ** 2) {
          group.state = 'SEARCHING';
          group.until = tick + this.config.searchTicks;
        }
        break;
      case 'ALERTED':
        if (tick < group.until) break;
        group.state = 'ENGAGING';
        if (!canCall || tick < group.nextCall) break;
        for (const [slot, id] of group.members) {
          if (!this.living(slot, id)) continue;
          group.caller = slot;
          group.alarm = { groupId: group.id, enemyId: id, startedAt: tick, endsAt: tick + this.calls.callTicks };
          group.state = 'CALLING_REINFORCEMENTS';
          group.nextCall = tick + this.calls.callCooldownTicks;
          this.emit({ type: 'ReinforcementCallStarted', ...group.alarm, tick });
          break;
        }
        break;
      case 'ENGAGING':
        if (group.lastSeen + this.config.contactMemoryTicks <= tick) {
          group.target = -1;
          group.state = 'SEARCHING';
          group.until = tick + this.config.lostContactSearchTicks;
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

  update(players: readonly (SimPlayer | undefined)[], tick: number, canCall: boolean, request: Reinforce, profile = false): void {
    this.perceptionMs = 0;
    this.activeIds.fill(0);
    for (let i = 0; i < this.horde.count; i++) {
      const slot = this.horde.active[i];
      this.activeIds[slot] = this.horde.id[slot];
    }
    let ongoing = 0;
    for (const group of this.groups.values()) if (group.alarm) ongoing++;
    const callLimit = this.limits.maxConcurrentBreaches + 1;
    for (let i = this.noises.length - 1; i >= 0; i--) if (this.noises[i].expires < tick) this.noises.splice(i, 1);
    for (const group of this.groups.values()) {
      const hadAlarm = Boolean(group.alarm);
      this.finishCall(group, tick, request);
      if (hadAlarm && !group.alarm) ongoing--;
      if ((tick + group.id) % this.config.perceptionPeriodTicks !== 0) continue;
      let x = 0;
      let z = 0;
      for (const [slot, id] of group.members) {
        if (!this.living(slot, id)) {
          group.members.delete(slot);
          if (this.membership[slot] === group) this.membership[slot] = undefined;
          continue;
        }
        x += this.horde.x[slot];
        z += this.horde.z[slot];
      }
      if (group.members.size === 0) {
        if (!group.pendingMembers) {
          group.state = 'ELIMINATED';
          group.target = -1;
          group.targetPlayer = undefined;
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
      const beforePerception = profile ? performance.now() : 0;
      this.perceive(group, players, tick);
      if (profile) this.perceptionMs += performance.now() - beforePerception;
      const stillCalling = Boolean(group.alarm);
      this.advance(group, tick, group.canReinforce && canCall && ongoing < callLimit);
      if (!stillCalling && group.alarm) ongoing++;
    }
    this.activeCalls = ongoing;
  }

  halt(tick: number): void {
    this.activeCalls = 0;
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

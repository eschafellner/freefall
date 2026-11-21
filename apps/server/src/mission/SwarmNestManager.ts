import {
  CAMERA_BACK, NEST_COLLAPSE_TICKS, NEST_EXITS, NEST_EXIT_RADIUS, NEST_HIT_HEIGHT, NEST_RADIUS, SWARM_FACTION_ID, distanceSquared, groundHeight,
} from '@freefall/shared';
import type { AimRay, MissionBalance, MissionEvent, NestSnapshot, PositionXZ, WorldDefinition } from '@freefall/shared';
import type { CombatTargets } from '../systems/combat.ts';

export interface SwarmNest extends NestSnapshot {
  factionId: typeof SWARM_FACTION_ID;
  spawnInterval: number;
  spawnCooldown: number;
  spawnBudget: number;
  boostUntil: number;
}

export class SwarmNestManager implements CombatTargets {
  readonly active = new Map<number, SwarmNest>();
  private readonly remains = new Map<number, SwarmNest>();
  private serial = 0;
  destroyed = 0;
  private readonly emit: (event: MissionEvent) => void;
  private readonly random: () => number;
  /** Static nest definition of this mission run (`structures.json`, resolved for the difficulty). */
  private readonly config: MissionBalance['nest'];

  private readonly world?: WorldDefinition;

  constructor(emit: (event: MissionEvent) => void, random: () => number, balance: MissionBalance, world?: WorldDefinition) {
    this.world = world;
    this.emit = emit;
    this.random = random;
    this.config = balance.nest;
  }

  /** Static values come from the mission's balance snapshot. Only the live state belongs to the nest. */
  create(position: PositionXZ, tick: number, breachId = 0): SwarmNest {
    const { maxHealth: maxHp, spawnIntervalTicks: spawnInterval, breachTicks } = this.config;
    const opensAt = tick + (breachId ? breachTicks : 0);
    const nest: SwarmNest = {
      id: ++this.serial, factionId: SWARM_FACTION_ID, x: position.x, z: position.z, rotation: this.random() * Math.PI * 2,
      hp: maxHp, maxHp, state: breachId ? 'EMERGING' : 'ACTIVE', breachId, startedAt: tick, opensAt,
      destroyedAt: 0, lastHitAt: -1000, lastSpawnAt: -1000, exit: NEST_EXITS - 1,
      spawnInterval, spawnCooldown: opensAt + spawnInterval, spawnBudget: 1, boostUntil: 0,
    };
    this.active.set(nest.id, nest);
    if (breachId) {
      this.emit({ type: 'SwarmBreachStarted', id: breachId, nestId: nest.id, position: { x: nest.x, z: nest.z }, opensAt, tick });
    } else {
      this.emit({ type: 'SwarmNestCreated', nestId: nest.id, breachId, tick });
    }
    return nest;
  }

  intersect(ray: AimRay, max: number, min = CAMERA_BACK): { nestId: number; distance: number } | undefined {
    let nearest = max;
    let nestId = 0;
    // The mound is a low ellipsoid, so shots above it can still hit a Schabe.
    const vertical = NEST_RADIUS / (NEST_HIT_HEIGHT + .28);
    const dy = ray.dy * vertical;
    const a = ray.dx ** 2 + dy ** 2 + ray.dz ** 2;
    for (const nest of this.active.values()) {
      if (nest.state === 'EMERGING') continue;
      const x = ray.x - nest.x;
      const y = (ray.y - groundHeight(this.world, nest.x, nest.z) - NEST_HIT_HEIGHT) * vertical;
      const z = ray.z - nest.z;
      const b = x * ray.dx + y * dy + z * ray.dz;
      const c = x * x + y * y + z * z - NEST_RADIUS ** 2;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      if ((-b + root) / a < min) continue;
      const distance = Math.max(min, (-b - root) / a);
      if (distance >= nearest) continue;
      nearest = distance;
      nestId = nest.id;
    }
    return nestId ? { nestId, distance: nearest } : undefined;
  }

  hit(nestId: number, amount: number, tick: number, shooter: string): number {
    const nest = this.active.get(nestId);
    if (!nest || nest.state === 'EMERGING') return 0;
    const before = nest.hp;
    nest.hp = Math.max(0, nest.hp - amount);
    nest.lastHitAt = tick;
    this.emit({ type: 'SwarmNestDamaged', nestId, hp: nest.hp, shooter, tick });
    if (nest.hp === 0) this.destroy(nest, tick, shooter);
    else nest.state = 'DAMAGED';
    return before - nest.hp;
  }

  destroy(nest: SwarmNest, tick: number, shooter?: string): void {
    if (!this.active.delete(nest.id)) return;
    nest.hp = 0;
    nest.spawnBudget = 0;
    nest.state = 'DESTROYING';
    nest.destroyedAt = tick;
    this.remains.set(nest.id, nest);
    this.destroyed++;
    this.emit({ type: 'SwarmNestDestroyed', nestId: nest.id, shooter, tick, position: { x: nest.x, z: nest.z } });
  }

  emergingCount(): number {
    let count = 0;
    for (const nest of this.active.values()) if (nest.state === 'EMERGING') count++;
    return count;
  }

  blocksSpawn(position: PositionXZ, radius: number): boolean {
    const clearance = (NEST_RADIUS + radius) ** 2;
    for (const nest of this.active.values()) if (distanceSquared(nest, position) < clearance) return true;
    for (const nest of this.remains.values()) {
      if (nest.state === 'DESTROYING' && distanceSquared(nest, position) < clearance) return true;
    }
    return false;
  }

  hasBoost(tick: number): boolean {
    for (const nest of this.active.values()) if (tick < nest.boostUntil) return true;
    return false;
  }

  halt(): void {
    for (const nest of this.active.values()) nest.spawnBudget = 0;
  }

  update(tick: number, spawn: (nest: SwarmNest, exit: PositionXZ) => boolean | undefined, pressure: number): void {
    for (const nest of this.remains.values()) {
      if (tick >= nest.destroyedAt + NEST_COLLAPSE_TICKS) nest.state = 'DESTROYED';
    }
    for (const nest of this.active.values()) {
      if (nest.state === 'EMERGING') {
        if (tick < nest.opensAt) continue;
        nest.state = 'ACTIVE';
        this.emit({ type: 'SwarmNestCreated', nestId: nest.id, breachId: nest.breachId, tick });
      }
      if (tick < nest.spawnCooldown || !nest.spawnBudget) continue;
      const config = this.config;
      let usedExit = -1;
      for (let offset = 1; offset <= NEST_EXITS; offset++) {
        const exit = (nest.exit + offset) % NEST_EXITS;
        const angle = nest.rotation + exit * Math.PI * 2 / NEST_EXITS;
        const spawned = spawn(nest, { x: nest.x + Math.sin(angle) * NEST_EXIT_RADIUS, z: nest.z + Math.cos(angle) * NEST_EXIT_RADIUS });
        if (spawned === undefined) break;
        if (spawned) {
          usedExit = exit;
          break;
        }
      }
      if (usedExit < 0) {
        // Hold a single due spawn and retry. No backlog of overdue spawn times.
        nest.spawnCooldown = tick + config.blockedSpawnRetryTicks;
        continue;
      }
      nest.spawnBudget--;
      nest.exit = usedExit;
      nest.lastSpawnAt = tick;
      const rate = (tick < nest.boostUntil ? config.reinforcementBoostRate : 1) * pressure;
      nest.spawnCooldown = tick + Math.max(config.minSpawnIntervalTicks, Math.round(nest.spawnInterval / rate));
      nest.spawnBudget = 1;
    }
  }

  snapshot(): NestSnapshot[] {
    return [...this.active.values(), ...this.remains.values()].map((nest) => {
      const { id, x, z, rotation, hp, maxHp, state, breachId, startedAt, opensAt, destroyedAt, lastHitAt, lastSpawnAt, exit } = nest;
      return { id, x, z, rotation, hp, maxHp, state, breachId, startedAt, opensAt, destroyedAt, lastHitAt, lastSpawnAt, exit };
    });
  }
}

import {
  CAMERA_BACK, NET, NEST_COLLAPSE_TICKS, NEST_EXITS, NEST_EXIT_RADIUS, NEST_HIT_HEIGHT, NEST_RADIUS, SWARM_FACTION_ID,
} from '@freefall/shared';
import type { AimRay, DifficultyDefinition, MissionEvent, NestSnapshot, PositionXZ } from '@freefall/shared';
import type { CombatTargets } from '../systems/combat.ts';

export interface SwarmNest extends NestSnapshot {
  factionId: typeof SWARM_FACTION_ID;
  spawnInterval: number;
  spawnCooldown: number;
  spawnBudget: number;
  difficultyModifier: number;
  boostUntil: number;
}

const NEST_HP = 360;
const BASE_INTERVAL = 5.6 * NET.tickHz;
const BREACH_TICKS = Math.round(6.4 * NET.tickHz);

export class SwarmNestManager implements CombatTargets {
  readonly active = new Map<number, SwarmNest>();
  private readonly remains = new Map<number, SwarmNest>();
  private serial = 0;
  destroyed = 0;
  private readonly emit: (event: MissionEvent) => void;
  private readonly random: () => number;

  constructor(emit: (event: MissionEvent) => void, random: () => number) {
    this.emit = emit;
    this.random = random;
  }

  create(position: PositionXZ, tick: number, difficulty: DifficultyDefinition, breachId = 0): SwarmNest {
    const maxHp = Math.round(NEST_HP * difficulty.nestHealthMultiplier);
    const opensAt = tick + (breachId ? BREACH_TICKS : 0);
    const spawnInterval = Math.round(BASE_INTERVAL * difficulty.nestSpawnIntervalMultiplier);
    const nest: SwarmNest = {
      id: ++this.serial, factionId: SWARM_FACTION_ID, x: position.x, z: position.z, rotation: this.random() * Math.PI * 2,
      hp: maxHp, maxHp, state: breachId ? 'EMERGING' : 'ACTIVE', breachId, startedAt: tick, opensAt,
      destroyedAt: 0, lastHitAt: -1000, lastSpawnAt: -1000, exit: NEST_EXITS - 1,
      spawnInterval, spawnCooldown: opensAt + spawnInterval, spawnBudget: 1,
      difficultyModifier: difficulty.nestSpawnIntervalMultiplier, boostUntil: 0,
    };
    this.active.set(nest.id, nest);
    if (breachId) {
      this.emit({ type: 'SwarmBreachStarted', id: breachId, nestId: nest.id, position: { x: nest.x, z: nest.z }, opensAt, tick });
    } else {
      this.emit({ type: 'SwarmNestCreated', nestId: nest.id, breachId, tick });
    }
    return nest;
  }

  intersect(ray: AimRay, max: number): { nestId: number; distance: number } | undefined {
    let nearest = max;
    let nestId = 0;
    // The mound is a low ellipsoid, so shots above it can still hit a Schabe.
    const vertical = NEST_RADIUS / (NEST_HIT_HEIGHT + .28);
    const dy = ray.dy * vertical;
    const a = ray.dx ** 2 + dy ** 2 + ray.dz ** 2;
    for (const nest of this.active.values()) {
      if (nest.state === 'EMERGING') continue;
      const x = ray.x - nest.x;
      const y = (ray.y - NEST_HIT_HEIGHT) * vertical;
      const z = ray.z - nest.z;
      const b = x * ray.dx + y * dy + z * ray.dz;
      const c = x * x + y * y + z * z - NEST_RADIUS ** 2;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      if ((-b + root) / a < CAMERA_BACK) continue;
      const distance = Math.max(CAMERA_BACK, (-b - root) / a);
      if (distance >= nearest) continue;
      nearest = distance;
      nestId = nest.id;
    }
    return nestId ? { nestId, distance: nearest } : undefined;
  }

  hit(nestId: number, amount: number, tick: number, shooter: string): void {
    const nest = this.active.get(nestId);
    if (!nest || nest.state === 'EMERGING') return;
    nest.hp = Math.max(0, nest.hp - amount);
    nest.lastHitAt = tick;
    this.emit({ type: 'SwarmNestDamaged', nestId, hp: nest.hp, shooter, tick });
    if (nest.hp === 0) this.destroy(nest, tick, shooter);
    else nest.state = 'DAMAGED';
  }

  destroy(nest: SwarmNest, tick: number, shooter?: string): void {
    if (!this.active.delete(nest.id)) return;
    nest.hp = 0;
    nest.spawnBudget = 0;
    nest.state = 'DESTROYING';
    nest.destroyedAt = tick;
    this.remains.set(nest.id, nest);
    this.destroyed++;
    this.emit({ type: 'SwarmNestDestroyed', nestId: nest.id, shooter, tick });
  }

  emergingCount(): number {
    let count = 0;
    for (const nest of this.active.values()) if (nest.state === 'EMERGING') count++;
    return count;
  }

  update(tick: number, spawn: (nest: SwarmNest, exit: PositionXZ) => boolean, pressure: number): void {
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
      const exitIndex = (nest.exit + 1) % NEST_EXITS;
      const angle = nest.rotation + exitIndex * Math.PI * 2 / NEST_EXITS;
      if (!spawn(nest, { x: nest.x + Math.sin(angle) * NEST_EXIT_RADIUS, z: nest.z + Math.cos(angle) * NEST_EXIT_RADIUS })) {
        // Hold a single due spawn and retry. No backlog of overdue spawn times.
        nest.spawnCooldown = tick + 9;
        continue;
      }
      nest.spawnBudget--;
      nest.exit = exitIndex;
      nest.lastSpawnAt = tick;
      const rate = (tick < nest.boostUntil ? 1.85 : 1) * pressure;
      nest.spawnCooldown = tick + Math.max(7, Math.round(nest.spawnInterval / rate));
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

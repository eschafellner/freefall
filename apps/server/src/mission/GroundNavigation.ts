import { BALANCE, nearbyObstacles, obstacleIntersection, openGround } from '@freefall/shared';
import type { MissionBalance, PositionXZ, WorldDefinition } from '@freefall/shared';
import { ENEMY_EDGE_MARGIN, ENEMY_GROUND_RADIUS } from '../ecs/EnemyNavigation.ts';

const LINKS = [1, 2, 4, 8] as const;

export class GroundNavigation {
  private readonly xs: number[];
  private readonly zs: number[];
  private readonly stride: number;
  private readonly links: Uint8Array;
  private readonly regions: Int32Array;
  private readonly queue: Int32Array;
  private readonly fields = new Map<number, Int32Array>();
  private readonly steps: number[];
  private requestsLeft = 0;
  private buildsLeft = 0;
  readonly metrics = { requests: 0, builds: 0, hits: 0, deferred: 0 };
  profile = false;
  fieldMs = 0;
  private readonly world: WorldDefinition;
  private readonly config: MissionBalance['hordeAi'];
  private readonly radius: number;

  constructor(world: WorldDefinition, config: MissionBalance['hordeAi'] = BALANCE.swarm.hordeAi, radius = ENEMY_GROUND_RADIUS) {
    this.world = world;
    this.config = config;
    this.radius = radius;
    this.xs = this.axis('x', 'halfX');
    this.zs = this.axis('z', 'halfZ');
    this.stride = this.xs.length;
    this.steps = [-1, 1, -this.stride, this.stride];
    this.links = new Uint8Array(this.stride * this.zs.length);
    this.regions = new Int32Array(this.links.length).fill(-1);
    this.queue = new Int32Array(this.links.length);
    for (let cell = 0; cell < this.links.length; cell++) {
      const x = this.x(cell), z = this.z(cell);
      if (!openGround(world, x, z, radius)) continue;
      this.regions[cell] = 0;
      if (cell % this.stride && this.visible(x, z, this.x(cell - 1), z)) {
        this.links[cell] |= LINKS[0];
        this.links[cell - 1] |= LINKS[1];
      }
      if (cell >= this.stride && this.visible(x, z, x, this.z(cell - this.stride))) {
        this.links[cell] |= LINKS[2];
        this.links[cell - this.stride] |= LINKS[3];
      }
    }
    // Connectivity is baked once. Perception can vet a contact without building a distance field.
    for (let cell = 0; cell < this.links.length; cell++) {
      if (this.regions[cell] === 0) this.flood(cell, this.regions, cell + 1);
    }
  }

  private axis(center: 'x' | 'z', extent: 'halfX' | 'halfZ'): number[] {
    const limit = this.world.half - ENEMY_EDGE_MARGIN;
    const coordinates = new Set([-limit, limit]);
    for (let point = -limit + this.config.gridCellSize / 2; point < limit; point += this.config.gridCellSize) coordinates.add(point);
    // Dense generated maps reserve lanes at placement time. Keep a fixed graph there so the
    // Cartesian product of every trunk's extra coordinates cannot grow quadratically.
    if (this.world.terrain) return Array.from(coordinates).sort((a, b) => a - b);
    const clearance = this.radius + this.config.cornerClearance;
    for (const obstacle of this.world.obstacles) {
      // Extra rows and columns follow the free side of obstacle faces, including bent narrow passages.
      const min = obstacle[center] - obstacle[extent] - clearance;
      const max = obstacle[center] + obstacle[extent] + clearance;
      if (min > -limit && min < limit) coordinates.add(min);
      if (max > -limit && max < limit) coordinates.add(max);
    }
    return Array.from(coordinates).sort((a, b) => a - b);
  }

  private x(cell: number): number { return this.xs[cell % this.stride]; }
  private z(cell: number): number { return this.zs[Math.floor(cell / this.stride)]; }

  private axisIndex(axis: number[], point: number): number {
    let left = 0, right = axis.length - 1;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (axis[middle] < point) left = middle + 1;
      else right = middle;
    }
    return left && point - axis[left - 1] < axis[left] - point ? left - 1 : left;
  }

  beginTick(profile = false): void {
    this.requestsLeft = this.config.routeRequestsPerTick;
    this.buildsLeft = this.config.fieldBuildsPerTick;
    this.profile = profile;
    this.fieldMs = 0;
  }

  visible(x: number, z: number, toX: number, toZ: number): boolean {
    const minX = Math.min(x, toX) - this.radius, maxX = Math.max(x, toX) + this.radius;
    const minZ = Math.min(z, toZ) - this.radius, maxZ = Math.max(z, toZ) + this.radius;
    const clearance = Math.max(maxX - minX, maxZ - minZ) / 2;
    for (const obstacle of nearbyObstacles(this.world, (x + toX) / 2, (z + toZ) / 2, clearance)) {
      if (obstacle.kind === 'arch-span') continue;
      if (maxX < obstacle.x - obstacle.halfX || minX > obstacle.x + obstacle.halfX ||
          maxZ < obstacle.z - obstacle.halfZ || minZ > obstacle.z + obstacle.halfZ) continue;
      if (obstacleIntersection(obstacle, x, obstacle.height, z, toX - x, 0, toZ - z, 0, 1, this.radius) <= 1) return false;
    }
    return true;
  }

  private inside(x: number, z: number): boolean {
    return Math.max(Math.abs(x), Math.abs(z)) <= this.world.half - ENEMY_EDGE_MARGIN;
  }

  private anchor(x: number, z: number, region?: number): number {
    const col = this.axisIndex(this.xs, x), row = this.axisIndex(this.zs, z);
    const reach = this.config.anchorSearchCells;
    let best = -1, distance = Infinity;
    for (let r = Math.max(0, row - reach); r <= Math.min(row + reach, this.zs.length - 1); r++) {
      for (let c = Math.max(0, col - reach); c <= Math.min(col + reach, this.stride - 1); c++) {
        const cell = c + r * this.stride;
        if (this.regions[cell] < 0 || (region !== undefined && this.regions[cell] !== region)) continue;
        const d2 = (this.xs[c] - x) ** 2 + (this.zs[r] - z) ** 2;
        if (d2 >= distance || !this.visible(x, z, this.xs[c], this.zs[r])) continue;
        best = cell;
        distance = d2;
      }
    }
    return best;
  }

  private flood(goal: number, values: Int32Array, region?: number): void {
    const unseen = region === undefined ? -1 : 0;
    values[goal] = region ?? 0;
    this.queue[0] = goal;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const cell = this.queue[head];
      const mask = this.links[cell];
      for (let direction = 0; direction < LINKS.length; direction++) {
        if (!(mask & LINKS[direction])) continue;
        const next = cell + this.steps[direction];
        if (values[next] !== unseen) continue;
        values[next] = region ?? values[cell] + 1;
        this.queue[tail++] = next;
      }
    }
  }

  reachable(x: number, z: number, toX: number, toZ: number): boolean {
    if (!this.inside(x, z) || !this.inside(toX, toZ)) return false;
    if (this.visible(x, z, toX, toZ)) return true;
    const goal = this.anchor(toX, toZ);
    return goal >= 0 && this.anchor(x, z, this.regions[goal]) >= 0;
  }

  /** 1: output contains a live waypoint, 0: budget exhausted, -1: no usable route.
   *  Unbudgeted calls are available for standalone navigation checks. The server uses beginTick + route. */
  route(x: number, z: number, output: PositionXZ, budgeted = true): number {
    const toX = output.x, toZ = output.z;
    if (!this.inside(x, z) || !this.inside(toX, toZ)) return -1;
    if (budgeted && this.requestsLeft === 0) {
      this.metrics.deferred++;
      return 0;
    }
    if (budgeted) this.requestsLeft--;
    this.metrics.requests++;
    if (this.visible(x, z, toX, toZ)) return 1;
    const goal = this.anchor(toX, toZ);
    if (goal < 0) return -1;
    const origin = this.anchor(x, z, this.regions[goal]);
    if (origin < 0) return -1;
    let field = this.fields.get(goal);
    if (field) {
      this.metrics.hits++;
      this.fields.delete(goal);
      this.fields.set(goal, field);
    } else {
      if (budgeted && this.buildsLeft === 0) {
        this.metrics.deferred++;
        return 0;
      }
      if (budgeted) this.buildsLeft--;
      const start = this.profile ? performance.now() : 0;
      this.metrics.builds++;
      if (this.fields.size === this.config.fieldCacheLimit) {
        const oldest = this.fields.keys().next().value!;
        field = this.fields.get(oldest)!;
        this.fields.delete(oldest);
      } else {
        field = new Int32Array(this.links.length);
      }
      this.flood(goal, field.fill(-1));
      this.fields.set(goal, field);
      if (this.profile) this.fieldMs += performance.now() - start;
    }

    let next = origin;
    // Shortcut descending edges if the entire segment is clear. At an obstacle corner, keep the visible anchor.
    for (let advance = 0; advance < this.config.waypointLookahead; advance++) {
      const current = next;
      for (let direction = 0; direction < LINKS.length; direction++) {
        if (!(this.links[current] & LINKS[direction])) continue;
        const candidate = current + this.steps[direction];
        if (field[candidate] < field[next] && this.visible(x, z, this.x(candidate), this.z(candidate))) next = candidate;
      }
      if (next === current) break;
    }
    output.x = this.x(next);
    output.z = this.z(next);
    return 1;
  }

  steer(x: number, z: number, output: PositionXZ): boolean { return this.route(x, z, output, false) > 0; }
}

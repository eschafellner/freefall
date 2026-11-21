import type { WorldDefinition } from '../definitions/missions.ts';

export interface Heightfield {
  readonly half: number;
  readonly step: number;
  readonly cells: number;
  readonly heightsCm: readonly number[];
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly maxGrade: number;
  readonly allowedGrade: number;
}

export function terrainVertex(field: Heightfield, x: number, z: number): number {
  return field.heightsCm[z * (field.cells + 1) + x] * .01;
}

export function terrainHeight(field: Heightfield, x: number, z: number): number {
  const u = Math.max(0, Math.min(field.cells, (x + field.half) / field.step));
  const v = Math.max(0, Math.min(field.cells, (z + field.half) / field.step));
  const ix = Math.min(field.cells - 1, Math.floor(u)), iz = Math.min(field.cells - 1, Math.floor(v));
  const fx = u - ix, fz = v - iz;
  const b = terrainVertex(field, ix + 1, iz), c = terrainVertex(field, ix, iz + 1);
  if (fx + fz <= 1) {
    const a = terrainVertex(field, ix, iz);
    return a + (b - a) * fx + (c - a) * fz;
  }
  const d = terrainVertex(field, ix + 1, iz + 1);
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

export function groundHeight(world: WorldDefinition | undefined, x: number, z: number): number {
  return world?.terrain ? terrainHeight(world.terrain, x, z) : 0;
}

/** Traverse the grid and split each interval at its triangle edge. Clearance within a triangle is linear. */
export function terrainIntersection(world: WorldDefinition | undefined, x: number, y: number, z: number,
  dx: number, dy: number, dz: number, start: number, end: number, padding = 0): number {
  const field = world?.terrain;
  if (!field) {
    if (dy >= 0) return Infinity;
    const contact = (padding - y) / dy;
    return contact <= end ? Math.max(start, contact) : Infinity;
  }
  if (Math.min(y + dy * start, y + dy * end) > field.maxHeight + padding) return Infinity;
  const u = (x + field.half) / field.step, v = (z + field.half) / field.step;
  const du = dx / field.step, dv = dz / field.step;
  const clearance = (t: number) => y + dy * t - padding - terrainHeight(field, x + dx * t, z + dz * t);
  let t = start;
  let before = clearance(t);
  if (before < -1e-8) return start;
  while (t < end) {
    const cu = u + du * t, cv = v + dv * t;
    const ix = Math.floor(cu + Math.sign(du) * 1e-8), iz = Math.floor(cv + Math.sign(dv) * 1e-8);
    const tx = du ? ((du > 0 ? ix + 1 : ix) - u) / du : Infinity;
    const tz = dv ? ((dv > 0 ? iz + 1 : iz) - v) / dv : Infinity;
    let next = Math.min(end, tx, tz);
    if (du + dv && ix >= 0 && iz >= 0 && ix < field.cells && iz < field.cells) {
      const diagonal = (ix + iz + 1 - u - v) / (du + dv);
      if (diagonal > t + 1e-9 && diagonal < next) next = diagonal;
    }
    if (next <= t) break;
    const after = clearance(next);
    if (after <= 0 && (before > 0 || after < -1e-8)) {
      return t + (next - t) * Math.max(0, before) / (Math.max(0, before) - after);
    }
    t = next;
    before = after;
  }
  return Infinity;
}

import * as T from 'three';
import { curve, smooth } from './SwarmOrganism.ts';
import type { Organism, Tissue, Vec3 } from './SwarmOrganism.ts';

/*
 * Building blocks of the warrior castes (Jäger, Durchbruchskäfer): a lofted body from a side profile, shingled armor
 * plates with ragged, spiked rear edges, horn spikes and spiked limb chains. Model space: +Y up, −Z forward, metres.
 */

/** Limb roles read by the warrior animation shader (`limb.x`). */
export const ROLE = { body: 0, leg: 1, arm: 2, jaw: 3, tail: 4, head: 5 } as const;

/** Profile keys [z, centre y, half width, dorsal height, ventral depth], sorted by z. */
export type Profile = readonly (readonly number[])[];

export interface LoftInfo {
  /** Position along the body, 0 at the front … 1 at the rear. */
  along: number;
  z: number;
  /** −1 belly … 1 back. */
  side: number;
}

/** Closed lofted hull through the profile, flattened and slightly squared like an arthropod body. */
export function loft(m: Organism, profile: Profile, rings: number, radial: number, paint: (info: LoftInfo, n: T.Vector3) => Tissue,
  lump = .02): void {
  const z0 = profile[0][0], z1 = profile[profile.length - 1][0];
  const positions: number[] = [];
  const data: LoftInfo[] = [];
  for (let r = 0; r <= rings; r++) {
    // Denser rings at both ends, where the profile changes fastest.
    const s = r / rings;
    const z = z0 + (z1 - z0) * (s - Math.sin(s * Math.PI * 2) * .06);
    const y = curve(profile, z, 1), w = Math.max(.004, curve(profile, z, 2));
    const top = Math.max(.004, curve(profile, z, 3)), bottom = Math.max(.004, curve(profile, z, 4));
    for (let k = 0; k < radial; k++) {
      const angle = k / radial * Math.PI * 2;
      const c = Math.cos(angle), sn = Math.sin(angle);
      const x = w * Math.sign(c) * Math.abs(c) ** .8;
      const h = sn >= 0 ? top * sn ** .85 : -bottom * (-sn) ** 1.2;
      const bump = 1 + lump * Math.sin(Math.abs(x) * 23 + z * 13) * Math.sin(z * 31 + sn * 4);
      positions.push(x * bump, y + h * bump, z);
      data.push({ along: s, z, side: sn });
    }
  }
  const index: number[] = [];
  for (let r = 0; r < rings; r++) for (let k = 0; k < radial; k++) {
    const a = r * radial + k, b = r * radial + (k + 1) % radial, c = a + radial, d = b + radial;
    index.push(a, c, b, b, c, d);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mid = Math.floor(rings / 2) * radial + Math.round(radial / 4);
  if (geometry.getAttribute('normal').getY(mid) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geometry.setIndex(index);
    geometry.computeVertexNormals();
  }
  m.add(geometry, (_p, n, vertex) => paint(data[vertex], n));
}

export interface PlateOptions {
  center: Vec3;
  /** Half width, height of the dome and half length. */
  radii: Vec3;
  /** Pitch (x), yaw (y) and roll (z) in radians. */
  rotation?: Vec3;
  /** Broad lobes the rear edge is drawn out into (vertex displacement; few lobes on finely segmented plates). */
  lobes?: number;
  lobeLift?: number;
  lobeReach?: number;
  /** Number of horn points along the rear edge and how far they rise (unit space). */
  spikes?: number;
  spikeLift?: number;
  /** How far the rear points reach backwards (unit space). */
  spikeReach?: number;
  /** Raised central ridge (unit space). */
  ridge?: number;
  /** Rim that curls down over the flanks (0 … 1). */
  curl?: number;
  /** Polygonal outline with this many straight edges (one corner points to the rear): an angular tile, not a dome. */
  sides?: number;
  /** Blend of the dome towards a faceted pyramid (0 … 1), with folds running from the apex to the corners. */
  facet?: number;
  /** Flat-shaded facets: hard, hewn armor. */
  flat?: boolean;
  segments: readonly [number, number];
}

/**
 * Armor plate: a shallow dome whose rear edge breaks into points. Paint receives the unit-space point (u.z > 0 is the
 * rear) and an edge factor (0 centre … 1 rim) for worn, lighter margins.
 */
export function plate(m: Organism, options: PlateOptions, paint: (u: T.Vector3, edge: number, n: T.Vector3, p: T.Vector3) => Tissue,
  spikePaint?: (t: number) => Tissue): void {
  const { spikes = 0, spikeLift = 0, spikeReach = 0, ridge = 0, curl = 0, lobes = 0, lobeLift = 0, lobeReach = 0, sides = 0,
    facet = 0 } = options;
  const deform = (u: T.Vector3) => {
    if (sides >= 3) {
      // Polygon inscribed in the unit circle; the dome falls off linearly towards the rim (pyramid) by `facet`.
      const rho = Math.min(1, Math.hypot(u.x, u.z));
      const sector = Math.PI * 2 / sides;
      const a = Math.atan2(u.x, u.z) - sector / 2;
      const scale = Math.cos(sector / 2) / Math.cos(a - sector * Math.round(a / sector));
      u.x *= scale;
      u.z *= scale;
      u.y += (Math.max(0, 1 - rho) - u.y) * facet;
    }
    const rim = 1 - smooth(0, .45, u.y);
    if (lobes) {
      const rear = smooth(.15, .95, u.z);
      const point = Math.max(0, Math.cos(Math.atan2(u.x, Math.max(.05, u.z)) * lobes)) ** 3;
      u.z += point * lobeReach * rear;
      u.y += point * lobeLift * rear * (.4 + .6 * rim);
    }
    // Flatter top, steeper rim: a plate rather than a dome.
    u.y = Math.max(0, Math.min(1, u.y * 1.35)) ** .8 * .8 + Math.min(0, u.y);
    // Ragged rim and a gabled ridge give hard, worn edges.
    u.y -= rim * .07 * (Math.sin(u.x * 17 + u.z * 11) * .5 + .5);
    if (ridge) u.y += ridge * Math.max(0, 1 - Math.abs(u.x) / .55) * Math.min(1, u.y * 2);
    if (curl) u.y -= curl * rim * rim * Math.abs(u.x);
  };
  shell(m, options, deform, (p, n, u) => paint(u, 1 - smooth(.06, .4, u.y), n, p));
  if (!spikes) return;
  // Points along the rear rim, built as separate horns so they survive any mesh resolution.
  const matrix = new T.Matrix4().makeRotationFromEuler(new T.Euler(...(options.rotation ?? [0, 0, 0])))
    .setPosition(...options.center);
  const place = (u: T.Vector3): Vec3 => {
    deform(u);
    const p = new T.Vector3(u.x * options.radii[0], u.y * options.radii[1], u.z * options.radii[2]).applyMatrix4(matrix);
    return [p.x, p.y, p.z];
  };
  const size = Math.min(options.radii[0], options.radii[2]);
  for (let k = 0; k < spikes; k++) {
    const a = (spikes === 1 ? 0 : -.78 + 1.56 * k / (spikes - 1)) * Math.PI / 2;
    const s = Math.sin(a), c = Math.cos(a);
    const centre = 1 - Math.abs(a) / (Math.PI / 2) * .5;
    // The base hides under the rim; the horn leaves it outward and up.
    const base = place(new T.Vector3(s * .97, -.04, c * .97));
    const tip = place(new T.Vector3(s * (1 + spikeReach * .55 * centre), .05 + spikeLift * .4 * centre, c * (1 + spikeReach * centre)));
    spike(m, base, tip, size * .16, 4, spikePaint ?? ((t) => paint(new T.Vector3(s, .1, c), .6 + .4 * t, new T.Vector3(0, 1, 0),
      new T.Vector3())));
  }
}

/**
 * Half-sphere shell reshaped by `deform` (unit space) like `Organism.shell`, optionally flat-shaded. Paint receives the
 * undeformed unit point of each vertex.
 */
function shell(m: Organism, options: PlateOptions, deform: (u: T.Vector3) => void,
  paint: (p: T.Vector3, n: T.Vector3, u: T.Vector3) => Tissue): void {
  const { radii, segments } = options;
  const sphere = new T.SphereGeometry(1, segments[0], segments[1], 0, Math.PI * 2, 0, Math.PI * .5);
  const position = sphere.getAttribute('position');
  const unit = new Float32Array(position.count * 3);
  const u = new T.Vector3();
  for (let i = 0; i < position.count; i++) {
    u.fromBufferAttribute(position, i);
    unit.set([u.x, u.y, u.z], i * 3);
    deform(u);
    position.setXYZ(i, u.x * radii[0], u.y * radii[1], u.z * radii[2]);
  }
  sphere.setAttribute('unit', new T.BufferAttribute(unit, 3));
  const geometry = options.flat ? sphere.toNonIndexed() : sphere;
  if (geometry !== sphere) sphere.dispose();
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();
  geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...(options.rotation ?? [0, 0, 0]))));
  geometry.translate(...options.center);
  const units = geometry.getAttribute('unit');
  geometry.deleteAttribute('unit');
  const point = new T.Vector3();
  m.add(geometry, (p, n, vertex) => paint(p, n, point.fromBufferAttribute(units, vertex)));
}

/** Tapered horn or spike from `base` to `tip`. */
export function spike(m: Organism, base: Vec3, tip: Vec3, radius: number, radial: number, paint: (t: number) => Tissue): void {
  m.limb(base, tip, radius, radius * .04, radial, 1, 0, (_p, _n, t) => paint(t));
}

/** A curved spike through three points (hooks, claws, tusks). */
export function hook(m: Organism, points: readonly Vec3[], radius: number, radial: number, paint: (t: number) => Tissue): void {
  m.chain(points, radius, radius * .06, radial, (_p, _n, t) => paint(t));
}

/** Point at fraction `t` between two points, pushed by `offset`. */
export function along(a: Vec3, b: Vec3, t: number, offset: Vec3 = [0, 0, 0]): Vec3 {
  return [a[0] + (b[0] - a[0]) * t + offset[0], a[1] + (b[1] - a[1]) * t + offset[1], a[2] + (b[2] - a[2]) * t + offset[2]];
}

export const mirror = (p: Vec3, side: number): Vec3 => [p[0] * side, p[1], p[2]];

/** Plate laid along a limb segment, dome facing away from `outward` (default up). */
export function limbPlate(m: Organism, from: Vec3, to: Vec3, width: number, height: number, segments: readonly [number, number],
  paint: (u: T.Vector3, edge: number, n: T.Vector3, p: T.Vector3) => Tissue, options: { spikes?: number; spikeLift?: number;
    spikeReach?: number; lobes?: number; outward?: Vec3; lift?: number; scale?: number; sides?: number; facet?: number;
    flat?: boolean } = {}): void {
  const a = new T.Vector3(...from), b = new T.Vector3(...to);
  const zAxis = b.clone().sub(a);
  const length = zAxis.length();
  zAxis.normalize();
  const up = new T.Vector3(...(options.outward ?? [0, 1, 0]));
  const xAxis = new T.Vector3().crossVectors(up, zAxis);
  if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
  xAxis.normalize();
  const yAxis = new T.Vector3().crossVectors(zAxis, xAxis).normalize();
  const rotation = new T.Euler().setFromRotationMatrix(new T.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  const center = a.clone().add(b).multiplyScalar(.5).addScaledVector(yAxis, options.lift ?? height * .2);
  plate(m, { center: center.toArray() as unknown as Vec3, radii: [width, height, length * .5 * (options.scale ?? 1.05)],
    rotation: [rotation.x, rotation.y, rotation.z], spikes: options.spikes, spikeLift: options.spikeLift, spikeReach: options.spikeReach,
    lobes: options.lobes, lobeLift: options.spikeLift, lobeReach: options.spikeReach, sides: options.sides, facet: options.facet,
    flat: options.flat, segments }, paint);
}

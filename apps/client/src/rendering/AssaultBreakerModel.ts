import * as T from 'three';
import { Organism, blend, curve, hex, shade, smooth } from './SwarmOrganism.ts';
import type { RGB, Tissue, Vec3 } from './SwarmOrganism.ts';
import { ROLE, loft, mirror } from './WarriorKit.ts';
import type { Profile } from './WarriorKit.ts';

/*
 * Assaultbreaker (swarm.assaultbreaker): the swarm's signature siege caste after concept_assaultbreaker2.png, built
 * taller than the concept (crest 3.8 m instead of 2.3 m, 7.6 m from horn tip to tail). A massive, low-headed
 * quadruped armored like a pine cone: every plate is a keeled, pointed scale whose tip lifts off the body. A fan of
 * long blades (the crest shield, Stirnschild) rises behind a wedge-shaped skull with two brow horns sweeping forward
 * and up, a nose horn, flared cheek shields and hooked tusks around a fanged maw. Molten tissue glows between the
 * flank plates; four columnar legs end in broad, clawed feet; the tail tapers under rows of scales. The soft, ribbed
 * underside is the weak spot (hit zone `belly`, armor class 2).
 *
 * Rig: legs carry their bone coordinate (0 hip … 1 knee … 2 ankle … 3 sole) in `limb.z` for the leg IK of the
 * animation shader (see AssaultBreakerRig.ts); head, jaw and tail swing about their joints.
 */

const CREVICE = hex(0x170e0a), PLATE_DARK = hex(0x3a281e), PLATE = hex(0x704b38), COPPER = hex(0xa65d3d), WORN = hex(0xc29c7e);
const BONE = hex(0xdecdb2), BONE_MID = hex(0xa48a72), BONE_DARK = hex(0x3a2920);
const MUSCLE = hex(0x43190f), MUSCLE_LIGHT = hex(0x6a2619), BELLY = hex(0x5e2519), MAW = hex(0x1e0706), GUM = hex(0x5e1a14);
const EMBER = hex(0xff6a1e), EMBER_DEEP = hex(0xa82a0a);

/** Body loft keys [z, centre y, half width, dorsal height, ventral depth]: a high shoulder hump falling to the rump. */
const PROFILE: Profile = [
  [-1.96, 1.84, .42, .4, .4],
  [-1.62, 1.93, .84, .74, .76],
  [-1.2, 2.0, 1.07, .98, .98],
  [-.7, 2.0, 1.15, 1.0, 1.02],
  [-.1, 1.94, 1.14, .9, .98],
  [.5, 1.86, 1.07, .76, .9],
  [1.02, 1.78, .95, .62, .78],
  [1.45, 1.7, .76, .5, .6],
  [1.8, 1.64, .48, .36, .42],
  [2.02, 1.6, .12, .1, .1],
];

/** Root joint of head, crest, horns and neck: the gore toss and the lowered charge rotate about it. */
export const ASSAULT_HEAD_PIVOT: Vec3 = [0, 1.9, -1.55];
/** The head (skull, crest, horns, jaw) is built at 1 and scaled by this about the neck joint: a heavier signature head. */
const HEAD_SCALE = 1.1;
const JAW_HINGE: Vec3 = [0, 1.42, -2.3];
export const ASSAULT_JAW_PIVOT: Vec3 = JAW_HINGE.map((v, i) => ASSAULT_HEAD_PIVOT[i] + (v - ASSAULT_HEAD_PIVOT[i]) * HEAD_SCALE) as unknown as Vec3;
export const ASSAULT_TAIL_PIVOT: Vec3 = [0, 1.64, 1.7];
/**
 * Hip, knee, ankle and sole (ground contact) of the fore and hind legs (+X side). Elbows point back, knees forward,
 * like a rhino; the shader's leg IK keeps the bend direction of this rest pose.
 */
export const ASSAULT_LEGS: readonly (readonly [Vec3, Vec3, Vec3, Vec3])[] = [
  [[.96, 1.84, -1.08], [1.36, 1.1, -.72], [1.38, .44, -1.18], [1.4, 0, -1.26]],
  [[.9, 1.74, 1.1], [1.28, 1.06, .6], [1.3, .44, 1.14], [1.32, 0, 1.06]],
];

const v3 = (p: Vec3) => new T.Vector3(p[0], p[1], p[2]);
const arr = (p: T.Vector3): Vec3 => [p.x, p.y, p.z];
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add3 = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
/** Deterministic jitter in [-1, 1] for hand-placed variation. */
const jitter = (k: number) => {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

// ---- Surfaces ----

/**
 * Armor scale finish: dark umber, copper on the raised middle, worn pale rims and tip, sooty where the root tucks under
 * the plate before it, faint molten cracks near the root.
 */
const armor = (tone = 0, ember = 0) => (v: number, u: number, top: boolean, n: T.Vector3): Tissue => {
  if (!top) return { color: blend(PLATE, COPPER, .25 + tone), gloss: 1.12 };
  const rim = Math.max(smooth(.6, 1, Math.abs(u)), smooth(.78, 1, v));
  const root = 1 - smooth(0, .32, v);
  let c = blend(PLATE_DARK, PLATE, Math.min(1, .55 + .4 * (1 - Math.abs(u)) + tone));
  c = blend(c, COPPER, (.42 + tone * .6) * smooth(.1, .6, v) * (1 - Math.abs(u) * .7));
  c = blend(c, WORN, rim * .6);
  c = blend(c, CREVICE, root * .55);
  return { color: shade(c, .7 + .3 * Math.max(0, n.y)), gloss: 1.1 - rim * .12, veins: root * ember * .35 };
};
const hornPaint = (t: number, around = 0): Tissue => ({
  color: shade(blend(blend(BONE_DARK, BONE_MID, smooth(0, .45, t)), BONE, smooth(.35, 1, t)),
    1 - .1 * Math.max(0, Math.sin(t * 46)) * (1 - t) - .06 * around),
  gloss: .72,
  sway: 1,
});
const claw = (t: number): Tissue => ({ color: blend(BONE_DARK, blend(BONE_MID, BONE, .4), smooth(.2, 1, t)), gloss: .78, sway: .6 });
const muscle = (_p: T.Vector3, n: T.Vector3, t: number): Tissue => ({
  color: shade(blend(MUSCLE, MUSCLE_LIGHT, Math.sin(t * Math.PI) * .5), .66 + .34 * Math.max(0, n.y)), gloss: .75, membrane: .35,
  veins: .06 });

// ---- Primitives ----

interface ScaleShape {
  root: Vec3;
  tip: Vec3;
  /** Outward face direction (orthogonalised against the root→tip axis). */
  normal: Vec3;
  /** Half width at the widest point and thickness at the root. */
  width: number;
  thickness: number;
  /** Tip bends toward −normal (hugging the body) by this much (m); negative lifts it. */
  bend?: number;
  /** Rims bend toward −normal (cupped shield). */
  cup?: number;
  /** Raised keel along the middle (m). */
  keel?: number;
  /** Fraction of the length where the outline is widest, and the taper exponent of the point (>1: long, sharp). */
  waist?: number;
  point?: number;
  segments: readonly [number, number];
}
type ScalePaint = (v: number, u: number, top: boolean, n: T.Vector3) => Tissue;

/**
 * Armor scale: a thick, keeled, pointed shield from `root` to `tip`, closed underneath. Paint receives the position
 * along (0 root … 1 tip), across (−1 … 1) and whether the vertex lies on the outer face.
 */
function scale(m: Organism, o: ScaleShape, paint: ScalePaint): void {
  const a = v3(o.root), b = v3(o.tip);
  const axis = b.clone().sub(a);
  const length = axis.length();
  axis.normalize();
  const up = v3(o.normal).projectOnPlane(axis);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0).projectOnPlane(axis);
  up.normalize();
  const side = new T.Vector3().crossVectors(axis, up);
  const [nv, nu] = o.segments;
  const waist = o.waist ?? .34, point = o.point ?? .95;
  const outline = (v: number) => v < waist ? .7 + .3 * Math.sin(Math.PI / 2 * v / waist) : Math.max(0, (1 - v) / (1 - waist)) ** point;
  const positions: number[] = [], info: [number, number, boolean][] = [];
  const p = new T.Vector3();
  for (let i = 0; i <= nv; i++) for (let j = 0; j <= nu; j++) {
    const v = i / nv, u = -1 + 2 * j / nu;
    const hw = o.width * outline(v);
    const across = Math.sqrt(Math.max(0, 1 - u * u));
    const curl = -(o.cup ?? 0) * u * u * (hw / o.width) - (o.bend ?? 0) * v * v;
    const keel = (o.keel ?? 0) * Math.max(0, 1 - Math.abs(u) * 1.7) ** 1.4 * (1 - .35 * v);
    const h = o.thickness * across * (1 - .75 * v * v) + keel * (1 - v * v) + curl;
    p.copy(a).addScaledVector(axis, v * length).addScaledVector(side, u * hw).addScaledVector(up, h);
    positions.push(p.x, p.y, p.z);
    info.push([v, u, true]);
  }
  // Underside: the rim vertices again (own normals), spanned left to right.
  const under = positions.length / 3;
  for (let i = 0; i <= nv; i++) for (const j of [0, nu]) {
    const k = i * (nu + 1) + j;
    positions.push(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
    info.push([i / nv, j ? 1 : -1, false]);
  }
  const row = nu + 1, at = (i: number, j: number) => i * row + j;
  const index: number[] = [];
  for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
    const ta = at(i, j), tb = at(i, j + 1), tc = at(i + 1, j), td = at(i + 1, j + 1);
    index.push(ta, tb, tc, tb, td, tc);
  }
  for (let i = 0; i < nv; i++) {
    const l0 = under + i * 2, r0 = l0 + 1, l1 = l0 + 2, r1 = l0 + 3;
    index.push(l0, l1, r0, r0, l1, r1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  m.add(geometry, (_p, n, vertex) => {
    const [v, u, top] = info[vertex];
    return paint(v, u, top, n);
  });
}

/**
 * Dished fan shield (the solid back of the crest): radius `radius` around `centre`, opening `spread` radians each way
 * from straight up, leaning back by `tilt`, the sides sweeping further back (`collar`). The rim breaks into `teeth`
 * points. Two faces, the back one sooty.
 */
function shield(m: Organism, o: { centre: Vec3; radius: number; spread: number; tilt: number; collar: number; teeth: number; depth: number;
  rings: number; segments: number }, paint: ScalePaint): void {
  const c = v3(o.centre);
  const point = (theta: number, r: number, back: number) => {
    const f = theta / o.spread;
    const lean = o.tilt + o.collar * f * f;
    const dir = new T.Vector3(Math.sin(theta), Math.cos(theta), 0).applyAxisAngle(new T.Vector3(1, 0, 0), lean);
    const face = new T.Vector3(0, 0, -1).applyAxisAngle(new T.Vector3(1, 0, 0), lean);
    const tooth = 1 - Math.abs(((f * .5 + .5) * o.teeth) % 1 - .5) * 2;
    const reach = o.radius * r * (1 - .28 * Math.abs(f) ** 1.5) * (1 + o.depth * (tooth ** 2 - .4) * r);
    // Dished: the rim stands forward of the middle.
    return c.clone().addScaledVector(dir, reach).addScaledVector(face, .16 * r * r - back);
  };
  const positions: number[] = [], info: [number, number, boolean][] = [];
  const cols = o.segments + 1;
  for (const face of [0, 1]) for (let i = 0; i <= o.rings; i++) for (let j = 0; j < cols; j++) {
    const theta = (-1 + 2 * j / o.segments) * o.spread, r = .15 + .85 * i / o.rings;
    const p = point(theta, r, face ? .1 * (1 - .6 * r) : 0);
    positions.push(p.x, p.y, p.z);
    info.push([r, theta / o.spread, face === 0]);
  }
  const at = (f: number, i: number, j: number) => f * (o.rings + 1) * cols + i * cols + j;
  const index: number[] = [];
  for (let i = 0; i < o.rings; i++) for (let j = 0; j < o.segments; j++) {
    const a = at(0, i, j), b = at(0, i, j + 1), cc = at(0, i + 1, j), d = at(0, i + 1, j + 1);
    index.push(a, cc, b, b, cc, d);
    const e = at(1, i, j), f = at(1, i, j + 1), g = at(1, i + 1, j), h = at(1, i + 1, j + 1);
    index.push(e, f, g, f, h, g);
  }
  for (let j = 0; j < o.segments; j++) {
    const a = at(0, o.rings, j), b = at(0, o.rings, j + 1), cc = at(1, o.rings, j), d = at(1, o.rings, j + 1);
    index.push(a, b, cc, b, d, cc);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  m.add(geometry, (_p, n, vertex) => {
    const [r, u, front] = info[vertex];
    return paint(r, u, front, n);
  });
}

/** Smooth tapered tube along a Catmull-Rom curve (horns, tusks, claws, the tail spike). */
function tube(m: Organism, points: readonly Vec3[], radius: (t: number) => number, tubular: number, radial: number,
  paint: (t: number, around: number) => Tissue): void {
  const path = new T.CatmullRomCurve3(points.map(v3), false, 'centripetal');
  const geometry = new T.TubeGeometry(path, tubular, 1, radial, false);
  const position = geometry.getAttribute('position');
  const centre = new T.Vector3(), p = new T.Vector3();
  const along: number[] = [], around: number[] = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    path.getPointAt(t, centre);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(position, k).sub(centre).multiplyScalar(radius(t)).add(centre);
      position.setXYZ(k, p.x, p.y, p.z);
      along[k] = t;
      around[k] = Math.cos(j / radial * Math.PI * 2);
    }
  }
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();
  m.add(geometry, (_p, _n, vertex) => paint(along[vertex], around[vertex]));
}

/** Horn radius: thick, slightly ringed base tapering to a sharp point. */
const hornRadius = (base: number, rings = 0) => (t: number) =>
  base * (1 - t) ** .85 * (1 + rings * Math.max(0, Math.sin(t * Math.PI * 11)) * (1 - t)) + .004;

/**
 * Loft along -z: `keys` are given with z negated (ascending), the hull is built along +z and mirrored. Paint receives
 * the final position and normal.
 */
function mirroredLoft(m: Organism, keys: Profile, rings: number, radial: number, paint: (p: T.Vector3, n: T.Vector3) => Tissue, lump = 0): void {
  const temp = new Organism();
  loft(temp, keys, rings, radial, () => ({ color: [0, 0, 0] }), lump);
  const g = temp.geometry();
  const pos = g.getAttribute('position');
  const out: number[] = [];
  // Mirror z and swap two corners of every triangle to keep the winding outward.
  for (let i = 0; i < pos.count; i += 3) for (const k of [0, 2, 1]) out.push(pos.getX(i + k), pos.getY(i + k), -pos.getZ(i + k));
  g.dispose();
  const tri = new T.BufferGeometry();
  tri.setAttribute('position', new T.Float32BufferAttribute(out, 3));
  tri.computeVertexNormals();
  m.add(tri, (p, n) => paint(p, n));
}

/** Point and outward normal on the body hull at z and angle a (0 right flank, π/2 spine, −π/2 belly). */
function hull(z: number, a: number): { p: Vec3; n: Vec3 } {
  const at = (zz: number, aa: number) => {
    const y = curve(PROFILE, zz, 1), w = curve(PROFILE, zz, 2), top = curve(PROFILE, zz, 3), bottom = curve(PROFILE, zz, 4);
    const c = Math.cos(aa), s = Math.sin(aa);
    const x = w * Math.sign(c) * Math.abs(c) ** .8;
    const h = s >= 0 ? top * s ** .85 : -bottom * (-s) ** 1.2;
    return new T.Vector3(x, y + h, zz);
  };
  const p = at(z, a);
  const dz = at(z + .01, a).sub(at(z - .01, a)), da = at(z, a + .01).sub(at(z, a - .01));
  const n = new T.Vector3().crossVectors(dz, da).normalize();
  const out = new T.Vector3(p.x, p.y - curve(PROFILE, z, 1), 0);
  if (n.dot(out) < 0) n.negate();
  return { p: arr(p), n: arr(n) };
}

/**
 * Scale on the hull at (z, a): root sunk into the body, lying back along it for `length` and drawn down the flank by
 * `down` (radians), the point lifted off the body by `lift`.
 */
function hullScale(m: Organism, z: number, a: number, o: { length: number; width: number; thickness: number; lift: number; down?: number;
  keel?: number; bend?: number; cup?: number; point?: number; segments: readonly [number, number] }, paint: ScalePaint): void {
  const root = hull(z, a), end = hull(z + o.length, a - (o.down ?? 0));
  const tip = add3(end.p, end.n, o.lift);
  scale(m, { root: add3(root.p, root.n, -.04), tip, normal: root.n, width: o.width, thickness: o.thickness, bend: o.bend ?? -.04,
    cup: o.cup ?? .06, keel: o.keel ?? .05, point: o.point, segments: o.segments }, paint);
}

/** Ring of scales around a limb segment, pointing down the limb (pine-cone layering), skipping the side toward the body. */
function limbScales(m: Organism, from: Vec3, to: Vec3, outward: Vec3, rings: number, perRing: number, spread: number, radius: number,
  o: { length: number; width: number; thickness: number; lift: number; segments: readonly [number, number] }, paint: (ring: number) => ScalePaint,
  stagger = .5): void {
  const a = v3(from), b = v3(to);
  const axis = b.clone().sub(a).normalize();
  const out = v3(outward).projectOnPlane(axis).normalize();
  const across = new T.Vector3().crossVectors(axis, out);
  for (let r = 0; r < rings; r++) {
    const t = rings === 1 ? .2 : r / (rings - 1) * .78;
    const centre = a.clone().lerp(b, t);
    const count = perRing - (r % 2 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const f = count === 1 ? 0 : (k + (r % 2 ? stagger : 0)) / (perRing - 1) * 2 - 1;
      const angle = f * spread;
      const radial = out.clone().multiplyScalar(Math.cos(angle)).addScaledVector(across, Math.sin(angle));
      const root = centre.clone().addScaledVector(radial, radius * .85);
      const tip = root.clone().addScaledVector(axis, o.length).addScaledVector(radial, o.lift);
      scale(m, { root: arr(root), tip: arr(tip), normal: arr(radial), width: o.width, thickness: o.thickness, bend: -.03, cup: .05,
        keel: .04, segments: o.segments }, paint(r));
    }
  }
}

// ---- Rig ----

/** Bone coordinate of a leg vertex: 0 hip … 1 knee … 2 ankle … 3 sole, from the closest point on the leg chain. */
function boneCoordinate(chain: readonly Vec3[], p: T.Vector3): number {
  let best = Infinity, coordinate = 0;
  const a = new T.Vector3(), b = new T.Vector3(), q = new T.Vector3();
  for (let i = 0; i < chain.length - 1; i++) {
    a.set(...chain[i]);
    b.set(...chain[i + 1]);
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, q.copy(p).sub(a).dot(ab) / ab.lengthSq()));
    const distance = q.copy(a).addScaledVector(ab, t).distanceTo(p);
    if (distance < best - 1e-6) {
      best = distance;
      coordinate = i + t;
    }
  }
  return coordinate;
}

/** Scales head and jaw vertices about the neck joint (positions only: a uniform scale keeps the normals). */
function scaleHead(geometry: T.BufferGeometry): void {
  const limb = geometry.getAttribute('limb'), pivot = geometry.getAttribute('pivot'), position = geometry.getAttribute('position');
  const [hx, hy, hz] = ASSAULT_HEAD_PIVOT;
  for (let i = 0; i < limb.count; i++) {
    const role = Math.round(limb.getX(i));
    if (role !== ROLE.head && role !== ROLE.jaw) continue;
    position.setXYZ(i, hx + (position.getX(i) - hx) * HEAD_SCALE, hy + (position.getY(i) - hy) * HEAD_SCALE, hz + (position.getZ(i) - hz) * HEAD_SCALE);
    if (role === ROLE.jaw) pivot.setXYZ(i, ...ASSAULT_JAW_PIVOT);
  }
}

/** Writes each leg vertex's bone coordinate into `limb.z` (the generic warrior rig keeps its weight there). */
function bindLegs(geometry: T.BufferGeometry): void {
  const limb = geometry.getAttribute('limb'), pivot = geometry.getAttribute('pivot'), position = geometry.getAttribute('position');
  const p = new T.Vector3();
  for (let i = 0; i < limb.count; i++) {
    if (Math.round(limb.getX(i)) !== ROLE.leg) continue;
    const side = Math.sign(pivot.getX(i)) || 1;
    const chain = ASSAULT_LEGS[pivot.getZ(i) < 0 ? 0 : 1].map((point) => mirror(point, side));
    p.fromBufferAttribute(position, i);
    limb.setZ(i, boneCoordinate(chain, p));
  }
}

// ---- Model ----

export function assaultBreakerGeometry(tier: 0 | 1 | 2): T.BufferGeometry {
  const m = new Organism({ limbs: true });
  const near = tier === 0, far = tier === 2;
  const seg = (n: readonly [number, number], mid: readonly [number, number], f: readonly [number, number] = [2, 2]) => near ? n : far ? f : mid;

  // Barrel body: sooty, plate-backed muscle above, a soft, ribbed, faintly glowing underside below (the weak spot).
  // Low on the flanks between shoulder and hip the molten tissue glows through the gaps of the armor.
  loft(m, PROFILE, near ? 30 : far ? 9 : 16, near ? 22 : far ? 6 : 12, (info, n) => {
    const back = smooth(-.35, .25, info.side);
    const belly = smooth(-.55, -.9, info.side);
    const band = smooth(-.8, -.5, info.side) * (1 - smooth(-.15, .25, info.side)) * smooth(-1.1, -.5, info.z) * (1 - smooth(.7, 1.3, info.z));
    const flicker = (.25 + .75 * Math.max(0, Math.sin(info.z * 17 + Math.sin(info.side * 9) * 1.4)) ** 2) * (.7 + .3 * Math.sin(info.z * 5.3));
    const rib = near ? Math.max(0, Math.sin(info.z * 13)) ** 3 * belly : 0;
    // The back between the scales: dark plate, so gaps read as shadowed armor rather than holes.
    const color = blend(blend(blend(MUSCLE, BELLY, belly * (.7 + .3 * rib)), EMBER_DEEP, band * flicker * .8), blend(PLATE_DARK, PLATE, .3), back);
    return { color: shade(color, .74 + .26 * Math.max(0, n.y) - rib * .2), gloss: back > .5 ? 1.1 : .55, membrane: (1 - back) * .65,
      veins: belly * .1 + band * .12, glow: belly * (.05 + .1 * rib) + band * flicker * (far ? .35 : .9), breath: 1 - back * .7 };
  }, near ? .03 : 0);

  // ---- Back and flanks: rows of pine-cone scales, largest along the spine, the dorsal row standing up as a sawtooth ----
  if (!far) {
    const spine = near ? [-1.5, -1.12, -.72, -.32, .1, .52, .92, 1.28, 1.6] : [-1.4, -.72, 0, .7, 1.36];
    for (const [i, z] of spine.entries()) {
      const k = i / (spine.length - 1);
      // Dorsal blades: big at the shoulder hump, smaller towards the rump; their points stand up and back.
      const crown = Math.sin(Math.PI * Math.min(1, .25 + k * 1.1));
      hullScale(m, z, Math.PI / 2, { length: .7 + .38 * crown, width: .4 + .12 * crown, thickness: .16, lift: .3 + .42 * crown, keel: .14,
        bend: -.12, point: 1.3, segments: seg([7, 6], [3, 4]) }, armor(.12, .2));
      // Paired shingles beside the spine.
      for (const s of [-1, 1]) {
        const a = Math.PI / 2 - s * .42;
        hullScale(m, z + .16, a, { length: .85 - .3 * k, width: .48 - .16 * k, thickness: .13, lift: .3 - .14 * k, down: s * .12,
          keel: .08, point: 1.1, segments: seg([6, 5], [3, 3]) }, armor(.04));
      }
    }
    // Flank rows, pointing back and a little down. The low middle of the flank stays open over the glowing tissue.
    const rows = near ? [.62, .25, -.12, -.46] : [.55, .05, -.4];
    const flankZ = near ? [-1.62, -1.24, -.86, -.48, -.1, .28, .66, 1.04, 1.4, 1.7] : [-1.5, -.8, -.1, .6, 1.3];
    for (const s of [-1, 1]) for (const [r, a] of rows.entries()) {
      for (const [i, z] of flankZ.entries()) {
        const zz = z + (r % 2 ? .19 : 0) * (near ? 1 : 2);
        // Glow window: low flank between shoulder and hip shields.
        if (a < -.05 && zz > -.4 && zz < .8) continue;
        if (a < -.3 && (zz < -1.45 || zz > 1.5)) continue;
        const k = Math.abs(zz) / 1.8;
        const angle = s > 0 ? a : Math.PI - a;
        hullScale(m, zz, angle, { length: .66 - .1 * k - r * .04, width: .36 - .05 * k - r * .02, thickness: .11, lift: .16 + .06 * jitter(i * 7 + r),
          down: s * .18, keel: .05, segments: seg([5, 4], [2, 3]) }, armor(-.02 - r * .05 + .05 * jitter(i + r * 13)));
      }
    }
    // Shoulder and hip shields: big cupped plates over the joints, points raking down and back.
    for (const s of [-1, 1]) {
      for (const [k, [z, a, length, width]] of ([[-1.32, .32, 1.05, .62], [-1.0, .02, .9, .56], [-.66, -.3, .7, .46]] as const).entries()) {
        const angle = s > 0 ? a : Math.PI - a;
        hullScale(m, z, angle, { length, width, thickness: .16, lift: .22, down: s * .5, keel: .1, cup: .14, segments: seg([7, 6], [3, 4]) },
          armor(.06 - k * .04, .3));
      }
      for (const [k, [z, a, length, width]] of ([[.86, .3, .95, .58], [1.12, -.02, .8, .5], [1.36, -.3, .6, .42]] as const).entries()) {
        const angle = s > 0 ? a : Math.PI - a;
        hullScale(m, z, angle, { length, width, thickness: .15, lift: .2, down: s * .45, keel: .09, cup: .12, segments: seg([7, 6], [3, 4]) },
          armor(.04 - k * .04, .3));
      }
    }
  } else {
    for (const z of [-1.1, -.1, .9]) {
      const { p } = hull(z, Math.PI / 2);
      scale(m, { root: add3(p, [0, -.1, 0]), tip: [0, p[1] + .45, z + .7], normal: [0, 1, 0], width: .6, thickness: .25, segments: [2, 2] },
        armor(.1));
    }
  }

  // ---- Head, crest and horns: rigid about the neck joint (lowered for the charge, tossed up for the gore) ----
  m.joint = { role: ROLE.head, phase: 0, side: 0, pivot: ASSAULT_HEAD_PIVOT, reach: 2.2 };
  // Thick neck under the crest.
  m.limb([0, 1.95, -1.35], [0, 1.7, -2.25], .78, .58, near ? 14 : far ? 5 : 8, near ? 3 : 1, .06, muscle);
  // Skull: a heavy wedge from broad cheeks to a blunt, beaked muzzle; brow ridges overhang deep eye sockets.
  const skull: Profile = [
    [-1.98, 1.9, .5, .5, .5],
    [-2.28, 1.82, .66, .52, .5],
    [-2.62, 1.7, .6, .46, .42],
    [-2.95, 1.56, .45, .38, .32],
    [-3.24, 1.44, .31, .3, .24],
    [-3.44, 1.36, .14, .16, .14],
    [-3.52, 1.33, .03, .03, .03],
  ];
  const skullPaint = (n: T.Vector3, y: number, z: number): Tissue => {
    const mouth = smooth(-.2, -.6, n.y) * smooth(1.42, 1.3, y);
    const c = blend(blend(PLATE_DARK, PLATE, .3 + .5 * smooth(1.4, 2.1, y) + .2 * smooth(-2.6, -3.3, z)), MAW, mouth);
    return { color: shade(c, .66 + .34 * Math.max(0, n.y)), gloss: 1.05 };
  };
  mirroredLoft(m, skull.map(([z, y, w, t, b]) => [-z, y, w, t, b]), near ? 22 : far ? 6 : 12, near ? 18 : far ? 6 : 10,
    (p, n) => skullPaint(n, p.y, p.z), near ? .025 : 0);
  if (!far) {
    for (const side of [-1, 1]) {
      // Brow ridge: a heavy, keeled plate slanting down to the snout (the angry brow of the concept).
      scale(m, { root: [side * .26, 2.16, -2.3], tip: [side * .58, 1.88, -3.06], normal: [side * .45, 1, -.35], width: .25, thickness: .17, keel: .1,
        bend: .02, point: 1.15, segments: seg([6, 5], [3, 3]) }, armor(.2));
      // Temple and cheek shields flaring out to the side with raking points.
      scale(m, { root: [side * .46, 1.92, -2.22], tip: [side * .98, 1.84, -1.86], normal: [side * .7, 1, -.3], width: .3, thickness: .12,
        keel: .06, bend: -.05, point: 1.3, segments: seg([6, 5], [3, 3]) }, armor(.1));
      scale(m, { root: [side * .5, 1.6, -2.42], tip: [side * 1.12, 1.48, -2.02], normal: [side, .3, -.4], width: .34, thickness: .12, keel: .07,
        bend: -.06, point: 1.35, segments: seg([6, 5], [3, 3]) }, armor(.06, .2));
      scale(m, { root: [side * .46, 1.36, -2.5], tip: [side * .98, 1.08, -2.2], normal: [side, -.25, -.4], width: .26, thickness: .1, keel: .05,
        bend: -.05, point: 1.3, segments: seg([5, 4], [3, 3]) }, armor(0, .2));
      // Snout plates.
      scale(m, { root: [side * .16, 1.86, -2.62], tip: [side * .3, 1.6, -3.3], normal: [side * .7, 1, -.3], width: .2, thickness: .09, keel: .04,
        bend: .06, segments: seg([5, 4], [2, 3]) }, armor(.14));
    }
    for (const [k, z] of [-2.28, -2.6].entries()) {
      scale(m, { root: [0, 2.12 - k * .1, z + .18], tip: [0, 1.98 - k * .14, z - .42], normal: [0, 1, -.25], width: .3 - k * .06, thickness: .1,
        keel: .06, bend: .05, segments: seg([5, 5], [2, 3]) }, armor(.14));
    }
    // Nasal keel from the snout up between the brows.
    scale(m, { root: [0, 2.0, -2.36], tip: [0, 1.64, -3.38], normal: [0, 1, -.35], width: .2, thickness: .12, keel: .1, bend: .1, point: 1.1,
      segments: seg([7, 4], [3, 3]) }, armor(.2));
  }
  // Crest shield (Stirnschild): a dished fan of broad, keeled blades rising behind the skull in three overlapping rows,
  // the longest in the middle, the outer ones sweeping back into a collar over the neck. Each row covers the seams of
  // the row behind it; the points form the jagged rim.
  {
    const root = new T.Vector3(0, 2.0, -2.0);
    shield(m, { centre: arr(root), radius: far ? 1.6 : 1.72, spread: 1.5, tilt: .5, collar: .55, teeth: far ? 7 : 9, depth: .1,
      rings: near ? 5 : 2, segments: near ? 36 : far ? 12 : 18 }, armor(.05));
    const rows = far ? [[1.95, 7, 0, .5]] as const
      : [[2.0, near ? 9 : 7, 0, .5], [1.45, near ? 8 : 6, .13, .41], [.95, near ? 5 : 4, .25, .34]] as const;
    for (const [r, [length, count, lift, width]] of rows.entries()) {
      const spread = 1.38 - r * .16;
      for (let k = 0; k < count; k++) {
        const f = k / (count - 1) * 2 - 1;
        const theta = f * spread;
        const lean = .58 + .6 * f * f;
        // Blade direction in the fan, leaning back (+z) by `lean`; the face looks forward and a little outward.
        const dir = new T.Vector3(Math.sin(theta), Math.cos(theta), 0).applyAxisAngle(new T.Vector3(1, 0, 0), lean);
        const face = new T.Vector3(0, 0, -1).applyAxisAngle(new T.Vector3(1, 0, 0), lean).add(new T.Vector3(Math.sin(theta) * .35, 0, 0)).normalize();
        // Rows step forward and down toward the brow; the back row stands tallest over the neck.
        const base = root.clone().addScaledVector(dir, .16 + .06 * r).addScaledVector(face, lift).add(new T.Vector3(0, -.1 * r, -.16 * r));
        const reach = length * (1 - .3 * Math.abs(f) ** 1.5) * (1 + (r === 0 ? (k % 2 ? -.07 : .06) : 0) + .03 * jitter(k * 5 + r * 17));
        const tip = base.clone().addScaledVector(dir, reach).addScaledVector(face, -.08);
        scale(m, { root: arr(base), tip: arr(tip), normal: arr(face), width: width * (1 - .22 * Math.abs(f)), thickness: .12, keel: .11 - r * .02,
          bend: .34 - r * .1, cup: .16, point: 1.25, waist: .3, segments: seg([7, 6], [3, 4], [2, 2]) },
          armor(.18 - r * .06 + .05 * jitter(k * 3 + r), .2));
      }
    }
  }
  // Horns: two massive brow horns sweeping out, forward and up; a nose horn; hooked cheek horns.
  for (const side of [-1, 1]) {
    tube(m, [[side * .3, 2.0, -2.42], [side * .58, 2.2, -2.82], [side * .74, 2.58, -3.24], [side * .7, 3.02, -3.56], [side * .56, 3.34, -3.66]],
      hornRadius(.25, near ? .04 : 0), near ? 16 : far ? 4 : 8, near ? 10 : far ? 4 : 6, hornPaint);
  }
  tube(m, [[0, 1.74, -3.12], [0, 1.98, -3.34], [0, 2.3, -3.42], [0, 2.5, -3.36]], hornRadius(.15, near ? .05 : 0), near ? 10 : 4, near ? 8 : 4,
    hornPaint);
  // Eyes: slanted ember slits under the brow, a smaller pair behind.
  if (!far) for (const side of [-1, 1]) {
    const eyes = near ? [[.45, 1.77, -2.9, .13], [.52, 1.69, -2.66, .07]] : [[.45, 1.77, -2.9, .14]];
    for (const [x, y, z, r] of eyes) {
      m.ellipsoid([side * x, y, z], [r * .5, r * .42, r], near ? 10 : 4, near ? 6 : 3, (_p, n) => ({ color: blend(EMBER, hex(0xffd27a),
        Math.max(0, -n.z) * .5), gloss: .2, glow: 2.2, sway: 1 }), [.1, side * .5, side * -.42]);
      // Slit pupil.
      if (near && r > .1) m.ellipsoid([side * (x + .04), y, z], [.03, r * .36, r * .1], 6, 4, () => ({ color: hex(0x1a0602), gloss: .3, sway: 1 }),
        [.1, side * .5, side * -.42]);
    }
  }
  // Upper fangs and the two long tusks hanging from the corners of the mouth, curving in.
  if (near) for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const x = side * (.1 + k * .07), z = -3.3 + k * .14, y = 1.2 + k * .012;
    tube(m, [[x, y + .06, z], [x * 1.02, y - .1, z - .01], [x * .98, y - .2 - (k === 1 ? .08 : 0), z + .01]], hornRadius(.035), 3, 4, (t) => hornPaint(.3 + .7 * t));
  }
  if (!far) for (const side of [-1, 1]) {
    tube(m, [[side * .36, 1.3, -2.92], [side * .46, 1.0, -3.08], [side * .42, .7, -3.08], [side * .26, .5, -2.92]], hornRadius(.085, near ? .05 : 0),
      near ? 9 : 4, near ? 7 : 4, (t, a) => hornPaint(.25 + .75 * t, a));
  }

  // ---- Lower jaw on its own hinge: plated chin, wet dark mouth, a row of lower fangs ----
  m.joint = { role: ROLE.jaw, phase: 0, side: 0, pivot: JAW_HINGE, reach: 1 };
  {
    const jaw: Profile = [[2.2, 1.24, .4, .14, .2], [2.5, 1.18, .46, .12, .2], [2.85, 1.12, .4, .1, .17], [3.12, 1.1, .27, .08, .13],
      [3.28, 1.1, .1, .05, .06], [3.32, 1.1, .02, .02, .02]];
    mirroredLoft(m, jaw, near ? 14 : far ? 5 : 8, near ? 14 : far ? 6 : 8, (p, n) => n.y > .2
      ? { color: blend(MAW, GUM, .2 * smooth(.2, .8, n.y)), gloss: .5, membrane: .4 }
      : { color: shade(blend(PLATE_DARK, PLATE, .4 + .3 * smooth(-2.4, -3.2, p.z)), .62 + .3 * Math.max(0, n.y + .5)), gloss: 1.05 });
  }
  if (!far) {
    scale(m, { root: [0, 1.04, -2.42], tip: [0, .96, -3.32], normal: [0, -1, -.2], width: .32, thickness: .1, keel: .07, bend: .05,
      segments: seg([6, 5], [3, 3]) }, armor(.02));
    for (const side of [-1, 1]) {
      scale(m, { root: [side * .3, 1.08, -2.4], tip: [side * .4, .98, -3.1], normal: [side, -.6, 0], width: .16, thickness: .08, keel: .04,
        bend: .04, segments: seg([5, 3], [2, 2]) }, armor(0));
    }
  }
  if (near) for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const x = side * (.12 + k * .07), z = -3.22 + k * .15;
    tube(m, [[x, 1.18, z], [x, 1.3, z - .01], [x * 1.03, 1.4, z - .02]], hornRadius(.03), 3, 4, (t) => hornPaint(.3 + .7 * t));
  }
  m.joint = undefined;

  // ---- Legs: columnar, armored in rings of downward-pointing scales, broad feet with heavy claws ----
  for (const [pair, leg] of ASSAULT_LEGS.entries()) for (const side of [-1, 1]) {
    const [hip, knee, ankle, sole] = leg.map((p) => mirror(p, side));
    const fore = pair === 0;
    // limb.y tells the rig fore (−1) from hind (+1) legs.
    m.joint = { role: ROLE.leg, phase: fore ? -1 : 1, side, pivot: hip, reach: 2 };
    const outward: Vec3 = [side, 0, fore ? -.35 : .35];
    if (far) {
      m.chain([hip, knee, ankle, add3(sole, [0, .2, 0])], .44, .34, 5, (_p, n) => ({ color: shade(PLATE, .7 + .3 * Math.max(0, n.y)), gloss: 1 }), true);
      m.ellipsoid(add3(sole, [0, .16, 0]), [.36, .2, .4], 5, 2, () => ({ color: PLATE_DARK, gloss: 1 }));
      continue;
    }
    m.limb(hip, knee, .46, .34, near ? 12 : 6, near ? 3 : 1, near ? .14 : .08, muscle);
    m.limb(knee, ankle, .33, .29, near ? 10 : 6, near ? 2 : 1, .05, muscle);
    m.ellipsoid(knee, [.33, .33, .33], near ? 10 : 6, near ? 6 : 3, (_p, n) => muscle(_p, n, .5));
    // Upper leg: big shingles over the thigh / upper arm.
    limbScales(m, add3(hip, [0, -.15, 0]), knee, [side, .15, fore ? -.6 : .6], near ? 2 : 1, near ? 5 : 3, 1.9, .44,
      { length: .62, width: .3, thickness: .1, lift: .12, segments: seg([5, 4], [2, 3]) }, (r) => armor(.04 - r * .05));
    // Lower leg: three staggered rings of smaller scales right round the front and outside (the concept's forefoot).
    limbScales(m, add3(knee, [0, .08, 0]), ankle, [side, 0, fore ? -.3 : .3], near ? 3 : 2, near ? 7 : 4, 2.75, .34,
      { length: .48, width: .23, thickness: .08, lift: .09, segments: seg([4, 4], [2, 2]) }, (r) => armor(-.02 - r * .05, .1));
    // Foot: a broad, plated drum on the ground, toe plates and four heavy claws.
    const foot = add3(sole, [0, 0, 0]);
    m.limb(add3(ankle, [0, .06, 0]), add3(foot, [0, .1, 0]), .32, .42, near ? 12 : 6, 1, .1, (_p, n) => ({
      color: shade(blend(PLATE_DARK, PLATE, .55), .7 + .3 * Math.max(0, n.y)), gloss: 1.05 }));
    limbScales(m, add3(ankle, [0, .1, 0]), add3(foot, [0, .02, 0]), [-side * .3, 0, fore ? 1 : 1], 1, near ? 4 : 2, 1.5, .4,
      { length: .36, width: .2, thickness: .07, lift: .08, segments: seg([3, 3], [2, 2]) }, () => armor(-.06));
    const toes = near ? [-.62, -.2, .22, .64] : [-.4, .4];
    for (const [k, spread] of toes.entries()) {
      const dir = new T.Vector3(Math.sin(spread) * side, 0, -Math.cos(spread));
      if (!fore) dir.z *= .9;
      const base: Vec3 = add3(foot, [dir.x * .26, .3, dir.z * .26]);
      scale(m, { root: base, tip: add3(foot, [dir.x * .52, .08, dir.z * .52]), normal: [dir.x, .8, dir.z], width: .15, thickness: .09, keel: .05,
        bend: .03, segments: seg([4, 3], [2, 2]) }, armor(-.04 + .03 * k));
      const cb: Vec3 = add3(foot, [dir.x * .44, .14, dir.z * .44]);
      const ct: Vec3 = add3(foot, [dir.x * .74, .01, dir.z * .74]);
      tube(m, [cb, add3(lerp3(cb, ct, .5), [0, .08, 0]), ct], hornRadius(k === 0 && toes.length > 2 ? .07 : .085), near ? 5 : 3, near ? 6 : 4, (t) => claw(t));
    }
  }
  m.joint = undefined;

  // ---- Tail: thick and drooping, ringed with back-pointing scales, a dorsal sawtooth and a bone point ----
  m.joint = { role: ROLE.tail, phase: 0, side: 0, pivot: ASSAULT_TAIL_PIVOT, reach: 2.4 };
  const tail: Vec3[] = [[0, 1.66, 1.55], [0, 1.6, 2.15], [0, 1.4, 2.72], [0, 1.14, 3.2], [0, .92, 3.56], [0, .8, 3.76]];
  m.chain(tail, .54, .07, near ? 12 : far ? 4 : 7, (_p, n, t) => ({
    color: shade(blend(blend(CREVICE, PLATE_DARK, .6), BELLY, smooth(.1, -.6, n.y) * .7), .72 + .28 * Math.max(0, n.y)), gloss: .95,
    veins: .25 * smooth(.1, -.6, n.y), glow: .06 * smooth(.1, -.6, n.y) * (1 - t) }));
  if (!far) {
    const rings = near ? 6 : 3;
    for (let i = 0; i < rings; i++) {
      const t = (i + .3) / rings;
      const s = t * (tail.length - 1), j = Math.min(tail.length - 2, Math.floor(s));
      const a = lerp3(tail[j], tail[j + 1], s - j), b = lerp3(tail[Math.min(tail.length - 1, j + 1)], tail[Math.min(tail.length - 1, j + 2)], s - j);
      const girth = .54 * (1 - t * .82);
      limbScales(m, a, b, [0, 1, 0], 1, near ? 5 : 3, 1.75, girth, { length: .62 - t * .3, width: .3 - t * .14, thickness: .09, lift: .12,
        segments: seg([4, 4], [2, 2]) }, () => armor(.02 - t * .06));
      const top = add3(a, [0, girth * .8, 0]);
      scale(m, { root: top, tip: add3(top, [0, .42 - t * .26, .5 - t * .2]), normal: [0, 1, -.6], width: .22 - t * .1, thickness: .1, keel: .06,
        bend: -.06, point: 1.3, segments: seg([5, 4], [2, 2]) }, armor(.1));
    }
  }
  tube(m, [tail[tail.length - 1], [0, .74, 3.92], [0, .7, 4.08]], (t) => .1 * (1 - t) + .003, near ? 5 : 3, near ? 6 : 4, (t) => hornPaint(.4 + .6 * t));
  m.joint = undefined;

  const geometry = m.geometry();
  scaleHead(geometry);
  bindLegs(geometry);
  return geometry;
}

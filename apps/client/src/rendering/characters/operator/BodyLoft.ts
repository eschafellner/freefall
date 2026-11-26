import * as T from 'three';
import type { SkinInfluence } from '../../ModelParts.ts';
import { BODY, BONE_INDEX, boneOf } from './OperatorSkeleton.ts';
import type { OperatorBone, Side } from './OperatorSkeleton.ts';

/**
 * Cross-section of a vertical loft. `rx` is the half width, `front`/`back` the half depth towards −Z/+Z, `n` the
 * superellipse exponent (2 = ellipse, larger = boxier). `shade` darkens creases (1 = unchanged).
 */
export interface Ring {
  y: number;
  x?: number;
  z?: number;
  rx: number;
  front: number;
  back?: number;
  n?: number;
  shade?: number;
}

const smooth = T.MathUtils.smoothstep;

/**
 * Smooth tube through horizontal rings (bind pose: limbs and torso are vertical). Rounded caps close both ends.
 * Normals are averaged before the part is split, so the body shades without facets.
 */
export function loft(rings: readonly Ring[], around = 16, caps: { bottom?: number; top?: number } = {}): T.BufferGeometry {
  const sorted = [...rings].sort((a, b) => a.y - b.y);
  const all: Ring[] = [];
  const cap = (ring: Ring, height: number, direction: 1 | -1) => [.62, .3].map((f, i): Ring => ({
    ...ring, y: ring.y + direction * height * (i ? .9 : .55), rx: ring.rx * f, front: ring.front * f, back: (ring.back ?? ring.front) * f,
    shade: (ring.shade ?? 1) * (direction < 0 ? .9 : 1),
  }));
  if (caps.bottom) all.push(...cap(sorted[0], caps.bottom, -1).reverse());
  all.push(...sorted);
  if (caps.top) all.push(...cap(sorted[sorted.length - 1], caps.top, 1));
  const positions: number[] = [];
  const shades: number[] = [];
  for (const ring of all) {
    const n = ring.n ?? 2;
    for (let k = 0; k < around; k++) {
      const theta = (k / around) * Math.PI * 2;
      const c = Math.cos(theta), s = Math.sin(theta);
      const px = Math.sign(c) * Math.abs(c) ** (2 / n) * ring.rx;
      const pz = Math.sign(s) * Math.abs(s) ** (2 / n) * (s < 0 ? ring.front : ring.back ?? ring.front);
      positions.push((ring.x ?? 0) + px, ring.y, (ring.z ?? 0) + pz);
      shades.push(ring.shade ?? 1);
    }
  }
  const index: number[] = [];
  for (let r = 0; r < all.length - 1; r++) {
    for (let k = 0; k < around; k++) {
      const a = r * around + k, b = r * around + (k + 1) % around;
      const c = b + around, d = a + around;
      index.push(a, c, b, a, d, c);
    }
  }
  const close = (ring: Ring, ringIndex: number, height: number, direction: 1 | -1) => {
    const centre = positions.length / 3;
    positions.push(ring.x ?? 0, ring.y + direction * height, ring.z ?? 0);
    shades.push((ring.shade ?? 1) * (direction < 0 ? .85 : 1));
    for (let k = 0; k < around; k++) {
      const a = ringIndex * around + k, b = ringIndex * around + (k + 1) % around;
      if (direction < 0) index.push(centre, a, b);
      else index.push(centre, b, a);
    }
  };
  if (caps.bottom) close(all[0], 0, caps.bottom * .1, -1);
  if (caps.top) close(all[all.length - 1], all.length - 1, caps.top * .1, 1);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('shade', new T.Float32BufferAttribute(shades, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

const ix = (bone: OperatorBone) => BONE_INDEX[bone];
const sideOf = (x: number): Side => (x < 0 ? -1 : 1);

/** Weight along a chain of (height, bone) anchors, sorted by height. */
function chain(y: number, anchors: readonly (readonly [number, OperatorBone])[]): [number, number][] {
  if (y <= anchors[0][0]) return [[ix(anchors[0][1]), 1]];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [y0, a] = anchors[i], [y1, b] = anchors[i + 1];
    if (y <= y1) {
      const t = smooth(y, y0, y1);
      return a === b ? [[ix(a), 1]] : [[ix(a), 1 - t], [ix(b), t]];
    }
  }
  return [[ix(anchors[anchors.length - 1][1]), 1]];
}

function scale(influences: [number, number][], factor: number): [number, number][] {
  return influences.map(([bone, w]) => [bone, w * factor]);
}

const TORSO: readonly (readonly [number, OperatorBone])[] = [
  [.97, 'Hips'], [1.1, 'Spine'], [1.22, 'Chest'], [1.33, 'UpperChest'], [1.47, 'UpperChest'], [1.53, 'Neck'],
];

/** Torso and pelvis: spine chain by height; shoulders lean on the clavicles, buttocks and groin on the thighs. */
export function torsoWeights(x: number, y: number): SkinInfluence {
  const side = sideOf(x);
  const ax = Math.abs(x);
  const shoulder = smooth(ax, .1, .19) * smooth(y, 1.3, 1.41) * .55;
  const leg = (1 - smooth(y, .79, .95)) * smooth(ax, .015, .1) * .62;
  const base = scale(chain(y, TORSO), 1 - shoulder - leg);
  if (shoulder > 0) base.push([ix(boneOf('Shoulder', side)), shoulder]);
  if (leg > 0) base.push([ix(boneOf('UpperLeg', side)), leg]);
  return base;
}

export function neckWeights(_x: number, y: number): SkinInfluence {
  return chain(y, [[1.43, 'UpperChest'], [1.5, 'Neck'], [1.565, 'Neck'], [1.61, 'Head']]);
}

/** Arm hanging along −Y: shoulder cap on the clavicle, elbow and wrist blends. */
export function armWeights(side: Side) {
  const shoulder = ix(boneOf('Shoulder', side)), upper = ix(boneOf('UpperArm', side));
  const lower = ix(boneOf('LowerArm', side)), hand = ix(boneOf('Hand', side));
  return (_x: number, y: number): SkinInfluence => {
    const top = smooth(y, BODY.shoulder - .02, BODY.shoulder + .06) * .45;
    const elbow = 1 - smooth(y, BODY.elbow - .045, BODY.elbow + .05);
    const wrist = 1 - smooth(y, BODY.wrist - .005, BODY.wrist + .045);
    return [[shoulder, top], [upper, (1 - top) * (1 - elbow)], [lower, elbow * (1 - wrist)], [hand, wrist]];
  };
}

/** Leg hanging along −Y: hip blend into the pelvis, knee and ankle blends. */
export function legWeights(side: Side) {
  const upper = ix(boneOf('UpperLeg', side)), lower = ix(boneOf('LowerLeg', side)), foot = ix(boneOf('Foot', side));
  return (_x: number, y: number): SkinInfluence => {
    const hip = smooth(y, BODY.hipJoint - .03, BODY.hipJoint + .07) * .5;
    const knee = 1 - smooth(y, BODY.knee - .055, BODY.knee + .065);
    const ankle = 1 - smooth(y, BODY.ankle + .01, BODY.ankle + .075);
    return [[ix('Hips'), hip], [upper, (1 - hip) * (1 - knee)], [lower, knee * (1 - ankle)], [foot, ankle]];
  };
}

/** Constant weight on one bone (rigid armour, gloves, boots). */
export function rigidWeights(bone: OperatorBone): () => SkinInfluence {
  const value: SkinInfluence = [[ix(bone), 1]];
  return () => value;
}

/** Proportions of the body under the armour; `bulk` thickens padded suits. Heroic but human: broad chest, strong legs. */
export function torsoRings(bulk = 0): Ring[] {
  const b = bulk;
  return [
    { y: .8, rx: .11 + b, front: .08 + b, back: .09 + b, n: 2.2, shade: .7 },
    { y: .855, rx: .166 + b, front: .1 + b, back: .116 + b, n: 2.3, shade: .82 },
    { y: .93, rx: .186 + b, front: .108 + b, back: .125 + b, n: 2.4 },
    { y: 1.005, rx: .176 + b, front: .1 + b, back: .108 + b, n: 2.4 },
    { y: 1.085, rx: .163 + b, front: .1 + b, back: .098 + b, n: 2.4 },
    { y: 1.17, rx: .171 + b, front: .112 + b, back: .102 + b, n: 2.5 },
    { y: 1.255, rx: .187 + b, front: .126 + b, back: .11 + b, n: 2.6, z: -.004 },
    { y: 1.335, rx: .193 + b, front: .12 + b, back: .112 + b, n: 2.7, z: -.002 },
    { y: 1.4, rx: .174 + b, front: .094 + b, back: .098 + b, n: 2.5 },
    { y: 1.448, rx: .1 + b * .5, front: .07, back: .074, n: 2.2 },
  ];
}

export function armRings(bulk = 0): Ring[] {
  const b = bulk;
  return [
    { y: 1.43, rx: .064 + b, front: .066 + b },
    { y: 1.375, rx: .07 + b, front: .068 + b },
    { y: 1.29, rx: .06 + b, front: .062 + b },
    { y: 1.19, rx: .053 + b, front: .056 + b },
    { y: 1.135, rx: .05 + b, front: .051 + b, shade: .92 },
    { y: 1.1, rx: .05 + b, front: .05 + b, back: .054 + b, shade: .9 },
    { y: 1.04, rx: .053 + b, front: .05 + b },
    { y: .96, rx: .046 + b, front: .042 + b },
    { y: .885, rx: .036 + b * .6, front: .031 + b * .6 },
  ].map((ring) => ({ ...ring, z: .01 }));
}

export function legRings(bulk = 0): Ring[] {
  const b = bulk;
  return [
    { y: .975, rx: .078 + b, front: .083 + b },
    { y: .93, rx: .104 + b, front: .106 + b, back: .114 + b },
    { y: .84, rx: .103 + b, front: .106 + b, back: .11 + b },
    { y: .72, rx: .092 + b, front: .096 + b, back: .096 + b },
    { y: .6, rx: .077 + b, front: .079 + b, back: .079 + b },
    { y: .535, rx: .068 + b, front: .07 + b, back: .067 + b, shade: .93 },
    { y: .49, rx: .067 + b, front: .071 + b, back: .065 + b, shade: .9 },
    { y: .43, rx: .066 + b, front: .061 + b, back: .077 + b },
    { y: .34, rx: .065 + b, front: .053 + b, back: .081 + b },
    { y: .24, rx: .053 + b, front: .048 + b, back: .06 + b },
    { y: .15, rx: .044 + b, front: .044 + b, back: .048 + b },
  ];
}

export function neckRings(): Ring[] {
  return [
    { y: 1.425, rx: .066, front: .06, back: .066 },
    { y: 1.5, rx: .055, front: .05, back: .056, shade: .85 },
    { y: 1.6, rx: .05, front: .046, back: .052, shade: .8 },
  ].map((ring) => ({ ...ring, z: .012 }));
}

/** Ring of a loft at height `y`, linearly interpolated between its rings (outside: clamped to the end ring). */
export function ringAt(rings: readonly Ring[], y: number): Ring {
  const sorted = [...rings].sort((a, b) => a.y - b.y);
  if (y <= sorted[0].y) return { ...sorted[0], y };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      const mix = (p: number, q: number) => p + (q - p) * t;
      return {
        y, x: mix(a.x ?? 0, b.x ?? 0), z: mix(a.z ?? 0, b.z ?? 0), rx: mix(a.rx, b.rx), front: mix(a.front, b.front),
        back: mix(a.back ?? a.front, b.back ?? b.front), n: mix(a.n ?? 2, b.n ?? 2),
      };
    }
  }
  return { ...sorted[sorted.length - 1], y };
}

/** Band around a loft between two heights, `grow` metres proud of the surface (belts, cuffs, seams, straps). */
export function band(rings: readonly Ring[], from: number, to: number, grow: number, steps = 2, n?: number): Ring[] {
  const result: Ring[] = [];
  for (let i = 0; i <= steps; i++) {
    const ring = ringAt(rings, from + (to - from) * i / steps);
    result.push({ ...ring, rx: ring.rx + grow, front: ring.front + grow, back: (ring.back ?? ring.front) + grow, n: n ?? ring.n });
  }
  return result;
}

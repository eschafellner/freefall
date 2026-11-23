import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSource } from './noise.ts';

export type MidPropMaterial = 'foliage' | 'solid' | 'ice';

/**
 * Mid-scale decoration (0.3–2.2 m) between the ground details and the physical solids. No collision: plants stay soft
 * cover, rocks and wood stay low. `radius` is the footprint at scale 1, `height` the tallest point. Colour lives in the
 * vertices; the instance colour only varies brightness and hue between the two `tints`.
 */
export const MID_PROPS = {
  'bush':         { radius: .95, height: 1.15, maxGrade: .32, material: 'foliage', tints: [0xffffff, 0xe6e9cf] },
  'tall-grass':   { radius: 1.1, height: .9, maxGrade: .32, material: 'foliage', tints: [0xffffff, 0xf2e6c4] },
  'meadow':       { radius: .5, height: .5, maxGrade: .3, material: 'foliage', tints: [0xffffff, 0xeeeadf] },
  'boulders':     { radius: 1.15, height: .8, maxGrade: .48, material: 'solid', tints: [0xffffff, 0xd9d6cc] },
  'roots':        { radius: 1.25, height: .4, maxGrade: .4, material: 'solid', tints: [0xffffff, 0xd8cfc4] },
  'dune-grass':   { radius: .72, height: .82, maxGrade: .34, material: 'foliage', tints: [0xffffff, 0xeee2c9] },
  'dry-bush':     { radius: .85, height: .92, maxGrade: .34, material: 'foliage', tints: [0xffffff, 0xe3dccd] },
  'succulent':    { radius: .45, height: 1.35, maxGrade: .3, material: 'foliage', tints: [0xffffff, 0xe7ead6] },
  'sandstone':    { radius: 1.3, height: .62, maxGrade: .5, material: 'solid', tints: [0xffffff, 0xe9d9c6] },
  'ice-shards':   { radius: .82, height: 1.45, maxGrade: .45, material: 'ice', tints: [0xffffff, 0xd9e6ee] },
  'snow-mound':   { radius: 1.9, height: .8, sink: .3, maxGrade: .36, material: 'solid', tints: [0xffffff, 0xeef2f5] },
  'frost-rock':   { radius: 1.05, height: .92, maxGrade: .5, material: 'solid', tints: [0xffffff, 0xdde3e8] },
  'shrub':        { radius: .9, height: 1.2, maxGrade: .34, material: 'foliage', tints: [0xffffff, 0xdfe6d0] },
  'fern-cluster': { radius: .95, height: .75, maxGrade: .34, material: 'foliage', tints: [0xffffff, 0xe4ead2] },
  'sapling':      { radius: .62, height: 2.2, maxGrade: .3, material: 'foliage', tints: [0xffffff, 0xdfe7d6] },
  'log':          { radius: 2.3, height: .62, maxGrade: .22, material: 'solid', tints: [0xffffff, 0xddd2c4] },
  'stump':        { radius: .72, height: .58, maxGrade: .3, material: 'solid', tints: [0xffffff, 0xddd2c4] },
  'moss-rock':    { radius: 1.1, height: .85, maxGrade: .48, material: 'solid', tints: [0xffffff, 0xd9dccc] },
  'mushrooms':    { radius: .34, height: .2, maxGrade: .32, material: 'solid', tints: [0xffffff, 0xe8dccb] },
} as const satisfies Record<string, { radius: number; height: number; maxGrade: number; material: MidPropMaterial;
  tints: readonly [number, number]; sink?: number }>;

export type MidPropId = keyof typeof MID_PROPS;

export type RGB = readonly [number, number, number];
export const rgb = (hex: number): RGB => {
  const c = new T.Color(hex);
  return [c.r, c.g, c.b];
};
export const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Collects parts as non-indexed geometries with position, normal and colour. */
export class Parts {
  readonly list: T.BufferGeometry[] = [];
  readonly random: () => number;
  constructor(seed: number) { this.random = randomSource(seed); }

  /** Adds a geometry with baked colours and optional normal override. */
  add(geometry: T.BufferGeometry, color: (p: T.Vector3, n: T.Vector3) => RGB, normal?: (p: T.Vector3, n: T.Vector3) => void) {
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    part.deleteAttribute('uv');
    part.computeVertexNormals();
    const position = part.getAttribute('position'), normals = part.getAttribute('normal');
    const colors = new Float32Array(position.count * 3);
    const p = new T.Vector3(), n = new T.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i);
      n.fromBufferAttribute(normals, i);
      if (normal) {
        normal(p, n);
        normals.setXYZ(i, n.x, n.y, n.z);
      }
      colors.set(color(p, n), i * 3);
    }
    part.setAttribute('color', new T.BufferAttribute(colors, 3));
    this.list.push(part);
  }

  /** Leafy lobe with soft radial normals and darker underside. */
  lobe(center: T.Vector3Tuple, size: T.Vector3Tuple, base: RGB, light: RGB, detail = 1) {
    const geometry = new T.IcosahedronGeometry(1, detail);
    const position = geometry.getAttribute('position');
    const phase = this.random() * 6;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const bump = .84 + .16 * Math.sin(x * 4.1 + phase) * Math.cos(z * 3.7 + y * 2.3);
      position.setXYZ(i, center[0] + x * size[0] * bump, center[1] + y * size[1] * bump, center[2] + z * size[2] * bump);
    }
    const c = new T.Vector3(...center);
    const top = center[1] + size[1];
    this.add(geometry, (p, n) => scale(mix(base, light, smooth(-.6, 1, n.y) * .7 + smooth(.1, top, p.y) * .3), .6 + .4 * smooth(0, top, p.y)),
    (p, n) => n.copy(p).sub(c).divide(new T.Vector3(...size)).normalize().lerp(new T.Vector3(0, 1, 0), .25).normalize());
  }

  /** Faceted stone; `cap` tints upward faces (moss, snow, sand). */
  rock(center: T.Vector3Tuple, size: T.Vector3Tuple, base: RGB, cap?: { color: RGB; amount: number }, detail = 0) {
    const geometry = new T.IcosahedronGeometry(1, detail);
    const position = geometry.getAttribute('position');
    const phase = this.random() * 6;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const bump = .8 + .2 * Math.sin(x * 5.3 + phase + z * 2.1) + .08 * Math.cos(y * 7 + phase);
      position.setXYZ(i, center[0] + x * size[0] * bump, center[1] + Math.max(-.55, y) * size[1] * bump, center[2] + z * size[2] * bump);
    }
    const shade = .82 + this.random() * .3;
    this.add(geometry, (p, n) => {
      let color = scale(base, shade * (.62 + .38 * smooth(center[1] - size[1] * .5, center[1] + size[1] * .6, p.y)));
      if (cap) color = mix(color, cap.color, smooth(.95 - cap.amount * .6, 1.05 - cap.amount * .4, n.y + Math.sin(p.x * 9 + p.z * 7) * .08));
      return color;
    });
  }

  /** Double-sided bent blade from root to tip; normals point up for soft foliage light. */
  blade(root: T.Vector3Tuple, tip: T.Vector3Tuple, width: number, base: RGB, tipColor: RGB, bend = .25) {
    const mid: T.Vector3Tuple = [root[0] + (tip[0] - root[0]) * (.5 - bend * .3), root[1] + (tip[1] - root[1]) * (.55 + bend * .2),
      root[2] + (tip[2] - root[2]) * (.5 - bend * .3)];
    const dx = tip[0] - root[0], dz = tip[2] - root[2], len = Math.hypot(dx, dz) || 1;
    const sx = -dz / len * width, sz = dx / len * width;
    const v = [
      root[0] - sx, root[1], root[2] - sz, root[0] + sx, root[1], root[2] + sz,
      mid[0] + sx * .7, mid[1], mid[2] + sz * .7, mid[0] - sx * .7, mid[1], mid[2] - sz * .7,
    ];
    const positions = [
      ...v.slice(0, 3), ...v.slice(3, 6), ...v.slice(6, 9),
      ...v.slice(0, 3), ...v.slice(6, 9), ...v.slice(9, 12),
      ...v.slice(9, 12), ...v.slice(6, 9), ...tip,
    ];
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const height = Math.max(.001, tip[1] - root[1]);
    this.add(geometry, (p) => scale(mix(base, tipColor, smooth(root[1], tip[1], p.y)), .55 + .45 * smooth(root[1], root[1] + height * .6, p.y)),
      (_, n) => n.set(sx * .4, 1, sz * .4).normalize());
  }

  /** Tapered cylinder between two points. */
  limb(from: T.Vector3Tuple, to: T.Vector3Tuple, r0: number, r1: number, sides: number, color: (p: T.Vector3, n: T.Vector3) => RGB, capped = true) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to);
    const length = a.distanceTo(b);
    const geometry = new T.CylinderGeometry(r1, r0, length, sides, 1, !capped);
    geometry.translate(0, length / 2, 0);
    const turn = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    geometry.applyMatrix4(new T.Matrix4().compose(a, turn, new T.Vector3(1, 1, 1)));
    this.add(geometry, color);
  }

  cone(base: T.Vector3Tuple, radius: number, height: number, sides: number, color: (p: T.Vector3, n: T.Vector3) => RGB) {
    const geometry = new T.ConeGeometry(radius, height, sides, 1);
    geometry.rotateY(this.random() * Math.PI);
    geometry.translate(base[0], base[1] + height / 2, base[2]);
    this.add(geometry, color);
  }

  shard(base: T.Vector3Tuple, radius: number, height: number, tilt: T.Vector3Tuple, deep: RGB, bright: RGB) {
    const geometry = new T.ConeGeometry(radius, height, 4, 1);
    geometry.translate(0, height / 2 - height * .08, 0);
    geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(tilt[0], tilt[1], tilt[2])));
    geometry.translate(...base);
    this.add(geometry, (p, n) => mix(deep, bright, smooth(0, height, p.y) * .6 + Math.max(0, n.y) * .4));
  }

  /** Box with optional rotation; colour from position and normal. */
  box(center: T.Vector3Tuple, size: T.Vector3Tuple, rotation: T.Vector3Tuple, color: (p: T.Vector3, n: T.Vector3) => RGB) {
    const geometry = new T.BoxGeometry(...size);
    geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...center),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(1, 1, 1)));
    this.add(geometry, color);
  }

  merge(): T.BufferGeometry {
    const merged = mergeGeometries(this.list, false)!;
    for (const part of this.list) part.dispose();
    return merged;
  }
}

export const around = (random: () => number, count: number, reach: number, fn: (x: number, z: number, i: number, angle: number) => void) => {
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996 + random() * .5, r = reach * Math.sqrt((i + .5) / count) * (.7 + random() * .3);
    fn(Math.cos(angle) * r, Math.sin(angle) * r, i, angle);
  }
};

const bark = rgb(0x5d4a3a), wood = rgb(0x9a8264), moss = rgb(0x56663a);

/** Local metre geometry, pivot at the ground contact, colour in vertices. */
export function midPropGeometry(id: MidPropId): T.BufferGeometry {
  const parts = new Parts(9137 + Object.keys(MID_PROPS).indexOf(id) * 389);
  const { random } = parts;
  const info = MID_PROPS[id];
  switch (id) {
    case 'bush':
    case 'shrub': {
      const forest = id === 'shrub';
      const base = rgb(forest ? 0x334227 : 0x4a5a30), light = rgb(forest ? 0x5c7040 : 0x7d8a4a);
      const lobes = forest ? 6 : 5;
      around(random, lobes, info.radius * .45, (x, z, i) => {
        const r = info.radius * (.36 + random() * .14) * (i ? .85 : 1.1);
        const h = info.height * (.32 + random() * .14);
        parts.lobe([x, h * .9 + (i ? 0 : h * .4), z], [r, h, r * (.85 + random() * .3)], base, light);
      });
      around(random, forest ? 10 : 6, info.radius * .8, (x, z) => parts.blade([x * .4, 0, z * .4], [x, info.height * (.3 + random() * .3), z],
        .05, base, light, .4));
      break;
    }
    case 'tall-grass':
    case 'dune-grass': {
      const dune = id === 'dune-grass';
      const base = rgb(dune ? 0x7d6e45 : 0x5b6a33), tip = rgb(dune ? 0xc8b27a : 0xb0a862);
      around(random, dune ? 20 : 40, info.radius * (dune ? .35 : .55), (x, z, _, angle) => {
        const lean = info.radius * (dune ? .55 + random() * .45 : .3 + random() * .3);
        const h = info.height * (.55 + random() * .45);
        parts.blade([x, -.02, z], [x + Math.cos(angle) * lean, h, z + Math.sin(angle) * lean], dune ? .02 : .03, base, tip, dune ? .1 : .35);
      });
      // Seed stalks: a lighter blade with a broadened tip reads as a seed head without extra geometry.
      if (!dune) around(random, 6, info.radius * .45, (x, z) => {
        const h = info.height * (.9 + random() * .1);
        parts.blade([x, 0, z], [x * 1.15, h, z * 1.15], .022, base, rgb(0xd1c084), 0);
      });
      break;
    }
    case 'meadow': {
      const stem = rgb(0x4f6034), leaf = rgb(0x7b8a4c);
      const blossoms = [rgb(0xd2bf63), rgb(0xe0dccd), rgb(0x9a82ad), rgb(0xc98a5a)];
      around(random, 14, info.radius * .7, (x, z, i, angle) => {
        parts.blade([x * .3, -.01, z * .3], [x + Math.cos(angle) * .12, .18 + random() * .1, z + Math.sin(angle) * .12], .03, stem, leaf, .4);
        if (i % 2) return;
        const h = info.height * (.6 + random() * .4);
        parts.blade([x, 0, z], [x * 1.1, h, z * 1.1], .005, stem, leaf, 0);
        const color = blossoms[(i / 2) % blossoms.length | 0];
        parts.rock([x * 1.1, h, z * 1.1], [.045, .025, .045], color);
      });
      break;
    }
    case 'boulders':
    case 'moss-rock':
    case 'frost-rock':
    case 'sandstone': {
      const palette: Record<string, [RGB, { color: RGB; amount: number } | undefined]> = {
        'boulders': [rgb(0x77766b), { color: rgb(0x5d6a37), amount: .35 }],
        'moss-rock': [rgb(0x63675d), { color: rgb(0x4d6331), amount: .85 }],
        'frost-rock': [rgb(0x56616b), { color: rgb(0xdfe6ea), amount: .8 }],
        'sandstone': [rgb(0x967051), { color: rgb(0xb8966a), amount: .45 }],
      };
      const [stone, cap] = palette[id];
      const flat = id === 'sandstone';
      const count = id === 'boulders' ? 5 : flat ? 4 : 3;
      around(random, count, info.radius * .5, (x, z, i) => {
        const big = i === 0;
        const r = info.radius * (big ? .48 : .2 + random() * .18);
        const h = info.height * (big ? .9 : .35 + random() * .3) * (flat ? .6 : 1);
        parts.rock([x, h * .35, z], [r, h * .62, r * (.7 + random() * .3)], flat ? mix(stone, rgb(0xa98463), random() * .5) : stone, cap, big && !flat ? 1 : 0);
      });
      break;
    }
    case 'roots': {
      around(random, 6, .25, (x, z, _, angle) => {
        const reach = info.radius * (.75 + random() * .25);
        const end: T.Vector3Tuple = [Math.cos(angle) * reach, -.08, Math.sin(angle) * reach];
        const mid: T.Vector3Tuple = [Math.cos(angle) * reach * .45, info.height * (.6 + random() * .4), Math.sin(angle) * reach * .45];
        const color = (p: T.Vector3) => mix(bark, moss, smooth(.1, .3, p.y) * .4);
        parts.limb([x, info.height * .7, z], mid, .16, .11, 5, color, false);
        parts.limb(mid, end, .11, .04, 5, color, false);
      });
      break;
    }
    case 'dry-bush': {
      const twig = rgb(0x5e4c3c), leaf = rgb(0x8a8763);
      around(random, 9, .08, (x, z, _, angle) => {
        const r = info.radius * (.6 + random() * .4), h = info.height * (.6 + random() * .4);
        const mid: T.Vector3Tuple = [Math.cos(angle) * r * .45, h * .55, Math.sin(angle) * r * .45];
        const tip: T.Vector3Tuple = [Math.cos(angle + .3) * r, h, Math.sin(angle + .3) * r];
        parts.limb([x, 0, z], mid, .028, .018, 4, () => twig, false);
        parts.limb(mid, tip, .018, .006, 3, () => twig, false);
        if (random() < .6) parts.lobe(tip, [.14, .1, .14], scale(leaf, .7), leaf, 0);
      });
      break;
    }
    case 'succulent': {
      const skin = rgb(0x5f6f4d), dust = rgb(0x8f8e6c), bloom = rgb(0xb0745a);
      const columns = 1 + Math.floor(random() * 2.5);
      around(random, columns + 1, info.radius * .4, (x, z, i) => {
        if (i > columns) return;
        const h = info.height * (i ? .45 + random() * .25 : 1);
        const r = .13 - i * .02;
        parts.limb([x * (i ? 1 : 0), 0, z * (i ? 1 : 0)], [x * (i ? 1.15 : 0), h, z * (i ? 1.15 : 0)], r * 1.1, r * .8, 7,
          (p, n) => scale(mix(skin, dust, smooth(.4, 1, Math.abs(Math.sin(Math.atan2(n.z, n.x) * 3.5))) * .5), .7 + .3 * smooth(0, h, p.y)));
        parts.rock([x * (i ? 1.15 : 0), h, z * (i ? 1.15 : 0)], [r * .85, r * .5, r * .85], i ? skin : bloom);
      });
      around(random, 7, .1, (x, z, _, angle) => parts.blade([x, 0, z], [Math.cos(angle) * .4, .22, Math.sin(angle) * .4], .05, skin, dust, .5));
      break;
    }
    case 'ice-shards': {
      const deep = rgb(0x5f8597), bright = rgb(0xc5d8e2);
      around(random, 6, info.radius * .45, (x, z, i, angle) => {
        const h = info.height * (i ? .35 + random() * .4 : 1);
        parts.shard([x, 0, z], .1 + h * .1, h, [Math.sin(angle) * .35 * (i ? 1 : .3), random() * 3, -Math.cos(angle) * .35 * (i ? 1 : .3)], deep, bright);
      });
      parts.rock([0, 0, 0], [info.radius * .55, .14, info.radius * .45], rgb(0xd6dee3));
      break;
    }
    case 'snow-mound': {
      const geometry = new T.IcosahedronGeometry(1, 2);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        // Long tail downwind (+x), steep face toward the obstacle.
        const tail = x > 0 ? 1 + x * .35 : 1;
        position.setXYZ(i, x * info.radius * .62 * tail, Math.max(-.3, y) * info.height * (x > 0 ? 1 - x * .45 : 1) + .12 * info.height,
          z * info.radius * .46);
      }
      const snow = rgb(0xd5dde2), shade = rgb(0xa9b8c4);
      parts.add(geometry, (_p, n) => mix(shade, snow, smooth(-.2, .9, n.y)));
      break;
    }
    case 'fern-cluster': {
      const base = rgb(0x3f5a2d), light = rgb(0x7d9550);
      around(random, 7, .12, (x, z, _, angle) => {
        const reach = info.radius * (.7 + random() * .3), h = info.height * (.6 + random() * .4);
        const axis = (t: number): T.Vector3Tuple => [x + Math.cos(angle) * reach * t, h * Math.sin(t * 2.2) * (1 - t * .25), z + Math.sin(angle) * reach * t];
        parts.blade(axis(0), axis(1), .012, base, light, 0);
        for (let j = 1; j < 7; j++) {
          const t = j / 7.5, [px, py, pz] = axis(t), w = reach * .32 * (1 - t * .8);
          for (const side of [-1, 1]) {
            const ox = -Math.sin(angle) * side * w + Math.cos(angle) * w * .3, oz = Math.cos(angle) * side * w + Math.sin(angle) * w * .3;
            parts.blade([px, py, pz], [px + ox, py - .06, pz + oz], .03 * (1 - t * .6), base, light, .1);
          }
        }
      });
      break;
    }
    case 'sapling': {
      const needles = rgb(0x2f4a2c), tipColor = rgb(0x587a46);
      parts.limb([0, 0, 0], [0, info.height * .5, 0], .05, .03, 5, () => bark);
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers, r = info.radius * (1 - t * .7), h = info.height * (.38 - t * .05);
        parts.cone([0, info.height * (.22 + t * .5), 0], r, h, 7, (p, n) => scale(mix(needles, tipColor, smooth(-.2, .8, n.y) * .6),
          .65 + .35 * smooth(0, info.height, p.y)));
      }
      break;
    }
    case 'log': {
      const length = info.radius * 1.8, r = info.height * .45;
      const color = (p: T.Vector3, n: T.Vector3) => Math.abs(n.x) > .8 ? wood : mix(bark, moss, smooth(.5, .95, n.y) * .7);
      parts.limb([-length / 2, r * .85, 0], [length / 2, r * .78, .1], r, r * .82, 9, color);
      parts.limb([length * .1, r * 1.1, 0], [length * .22, r * 1.9, .45], .06, .03, 4, () => bark);
      parts.limb([-length * .25, r * 1.2, 0], [-length * .38, r * 1.5, -.5], .05, .025, 4, () => bark);
      break;
    }
    case 'stump': {
      const r = info.radius * .45;
      parts.limb([0, -.05, 0], [0, info.height, 0], r * 1.15, r, 9, (p, n) => n.y > .8 ? mix(wood, rgb(0x6f5a44), smooth(0, r, Math.hypot(p.x, p.z)) * .7) : bark);
      around(random, 4, .1, (x, z, _, angle) => parts.limb([Math.cos(angle) * r * .7, info.height * .35, Math.sin(angle) * r * .7],
        [Math.cos(angle) * info.radius, -.05, Math.sin(angle) * info.radius], .11, .05, 5, () => bark, false));
      break;
    }
    case 'mushrooms': {
      const stem = rgb(0xd0c4a8), caps = [rgb(0x9b5b3c), rgb(0xb88b4f), rgb(0x8a6b55)];
      around(random, 7, info.radius * .7, (x, z, i) => {
        const h = info.height * (.4 + random() * .6);
        parts.limb([x, 0, z], [x, h, z], .014, .011, 5, () => stem, false);
        parts.rock([x, h, z], [.035 + h * .15, .02 + h * .06, .035 + h * .15], caps[i % caps.length]);
      });
      break;
    }
  }
  const geometry = parts.merge();
  geometry.computeBoundingBox();
  // Keep the measured footprint: squeeze sprawling clumps horizontally into the catalogue radius.
  const box = geometry.boundingBox!;
  const reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
  const tall = box.max.y;
  if (reach > info.radius || tall > info.height) {
    const across = Math.min(1, info.radius / reach), up = Math.min(1, info.height / tall);
    geometry.scale(across, up, across);
    geometry.computeBoundingBox();
  }
  geometry.computeBoundingSphere();
  geometry.name = 'mid/' + id;
  return geometry;
}

import * as T from 'three';
import { Parts, around, mix, rgb, scale, smooth } from './MidPropAssets.ts';
import type { RGB } from './MidPropAssets.ts';
import { vividColors } from '../ToneMapping.ts';

export type TraceMaterial = 'metal' | 'solid' | 'resin' | 'lamp';

/**
 * Traces of war and of the swarm. Small traces have no collision and stay low; the three `solid` entries replace the
 * look of an existing rock collider and are modelled inside the unit box [-1, 1]³ that is scaled to its AABB.
 */
export const WAR_TRACES = {
  'crater-rim':  { radius: 1.15, height: .4, material: 'solid' },
  'crates':      { radius: .95, height: 1.25, material: 'solid' },
  'sandbags':    { radius: 1.75, height: .62, material: 'solid' },
  'debris':      { radius: 1.5, height: .42, material: 'metal' },
  'shells':      { radius: .7, height: .32, material: 'metal' },
  'mast':        { radius: 3.45, height: .82, material: 'metal' },
  'beacon':      { radius: .3, height: 1.55, material: 'metal' },
  'beacon-lamp': { radius: .3, height: 1.6, material: 'lamp' },
  'resin':       { radius: 1.25, height: .28, material: 'resin' },
  'cocoons':     { radius: 1.05, height: .95, material: 'resin' },
  'husk':        { radius: .8, height: .42, material: 'resin' },
  'spines':      { radius: .7, height: 1.25, material: 'resin' },
  'pod-wreck':   { radius: 1, height: 1, material: 'metal', solid: true },
  'hull-wreck':  { radius: 1, height: 1, material: 'metal', solid: true },
  'ruin':        { radius: 1, height: 1, material: 'solid', solid: true },
} as const satisfies Record<string, { radius: number; height: number; material: TraceMaterial; solid?: true }>;

export type TraceId = keyof typeof WAR_TRACES;
export type SolidTraceId = 'pod-wreck' | 'hull-wreck' | 'ruin';

const olive = rgb(0x66704e), oliveDark = rgb(0x40463a), steel = rgb(0x6d706c), scorch = rgb(0x1e1b18), rust = rgb(0x6a4a33);
const brass = rgb(0x9a7f45), concrete = rgb(0x8a877d), hazard = rgb(0xb0873a);
const chitin = rgb(0x453223), resin = rgb(0x2e2117), amber = rgb(0x7c5530), leather = rgb(0x8a7258);

/** Burnt toward the bottom and in noisy patches. */
const burnt = (base: RGB, p: T.Vector3, amount: number) =>
  mix(base, scorch, Math.min(1, amount * (.5 + .5 * Math.sin(p.x * 3.1 + p.z * 2.3) * Math.cos(p.y * 4.7))));

export function traceGeometry(id: TraceId): T.BufferGeometry {
  const parts = new Parts(5521 + Object.keys(WAR_TRACES).indexOf(id) * 613);
  const { random } = parts;
  switch (id) {
    case 'crater-rim': {
      // Unit-radius ring: a low earth lip with small clods; the instance scale is the crater radius, so the clods stay
      // fine-grained. Tinted per planet through the instance colour.
      for (let i = 0; i < 14; i++) {
        const angle = i / 14 * Math.PI * 2;
        parts.rock([Math.cos(angle) * .95, -.04, Math.sin(angle) * .95], [.22, .07 + random() * .03, .16], rgb(0xb3ab9c));
      }
      around(random, 22, .05, (_x, _z, i) => {
        const angle = i / 22 * Math.PI * 2 + random() * .3, r = .85 + random() * .3;
        const size = .025 + random() * .04;
        parts.rock([Math.cos(angle) * r, size * .2, Math.sin(angle) * r], [size * 1.3, size, size], rgb(0xa39b8c));
      });
      break;
    }
    case 'crates': {
      const crate = (c: T.Vector3Tuple, yaw: number, s: T.Vector3Tuple) => {
        parts.box(c, s, [0, yaw, 0], (p, n) => {
          const band = Math.abs(p.y - c[1]) < s[1] * .12 && Math.abs(n.y) < .5;
          return band ? hazard : mix(olive, oliveDark, Math.abs(n.y) > .5 ? .2 : .45 * random());
        });
      };
      crate([0, .3, 0], random() * .3, [.9, .6, .6]);
      crate([.05, .9, .02], random() * .6, [.8, .6, .55]);
      crate([.0, .25, .62], random(), [.55, .5, .45]);
      break;
    }
    case 'sandbags': {
      const bag = rgb(0x8c7b5c);
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 9 - layer; i++) {
        const t = (i + layer * .5) / 8 - .5, angle = t * 1.3;
        const x = Math.sin(angle) * 1.45, z = (1 - Math.cos(angle)) * 1.45 - .3;
        parts.lobe([x, .14 + layer * .26, z], [.24, .14, .14], scale(bag, .75 + random() * .2), bag, 0);
      }
      break;
    }
    case 'debris': {
      around(random, 6, 1.0, (x, z) => {
        const w = .3 + random() * .6, d = .2 + random() * .5;
        parts.box([x, .04, z], [w, .05, d], [(random() - .5) * .5, random() * 3, (random() - .5) * .5],
          (p) => burnt(random() < .5 ? olive : steel, p, .8));
      });
      parts.limb([-.6, .05, .2], [.5, .38, -.3], .05, .04, 5, (p) => burnt(steel, p, .6));
      parts.limb([.3, .05, .6], [.9, .25, .2], .04, .03, 5, () => rust);
      break;
    }
    case 'shells': {
      around(random, 6, .4, (x, z, _i, angle) => {
        const lie = random() < .7;
        if (lie) parts.limb([x, .055, z], [x + Math.cos(angle) * .32, .055, z + Math.sin(angle) * .32], .055, .05, 7, () => brass);
        else parts.limb([x, 0, z], [x, .3, z], .055, .05, 7, () => brass);
      });
      break;
    }
    case 'mast': {
      // Toppled lattice mast along +X: three rails, cross braces, a dish ring at the head.
      const length = 6.2, r = .26;
      const rail = (k: number): [number, number] => [Math.cos(k * 2.094) * r, Math.sin(k * 2.094) * r + r + .05];
      for (let k = 0; k < 3; k++) {
        const [y, z] = rail(k);
        parts.limb([-length / 2, y, z], [length / 2, y * .9, z * .9], .03, .025, 4, (p) => burnt(steel, p, .3));
      }
      for (let s = 0; s < 9; s++) {
        const x0 = -length / 2 + s * length / 9, x1 = x0 + length / 9;
        for (let k = 0; k < 3; k++) {
          const [y0, z0] = rail(k), [y1, z1] = rail(k + 1);
          parts.limb([x0, y0, z0], [x1, y1, z1], .015, .015, 3, () => steel, false);
        }
      }
      parts.limb([length / 2, .05, -.3], [length / 2 + .02, .58, .3], .32, .3, 10, () => mix(steel, hazard, .3), false);
      break;
    }
    case 'beacon': {
      parts.limb([0, -.1, 0], [0, 1.4, 0], .045, .035, 6, (p) => Math.floor(p.y * 4) % 2 ? hazard : oliveDark);
      parts.box([0, .06, 0], [.34, .12, .34], [0, .4, 0], () => oliveDark);
      break;
    }
    case 'beacon-lamp': {
      parts.box([0, 1.48, 0], [.12, .16, .12], [0, .4, 0], () => rgb(0xffffff));
      break;
    }
    case 'resin': {
      around(random, 9, .8, (x, z) => {
        const r = .2 + random() * .3;
        parts.lobe([x, -.02, z], [r * 1.3, .07 + random() * .1, r], resin, amber, 0);
      });
      break;
    }
    case 'cocoons': {
      parts.lobe([0, -.03, 0], [.85, .12, .75], resin, amber, 1);
      around(random, 5, .55, (x, z, i) => {
        const h = .45 + random() * .4 + (i ? 0 : .1);
        parts.lobe([x, h * .5, z], [h * .3, h * .52, h * .3], scale(leather, .7), leather, 1);
      });
      break;
    }
    case 'husk': {
      for (let s = 0; s < 6; s++) {
        const t = s / 5, x = (t - .5) * 1.1;
        parts.lobe([x, .08 + Math.sin(t * Math.PI) * .18, Math.sin(t * 2.4) * .08], [.13, .14 - Math.abs(t - .5) * .08, .3 - Math.abs(t - .5) * .2],
          scale(chitin, .7), mix(chitin, amber, .3), 0);
      }
      around(random, 6, .3, (x, z, _i, angle) => parts.limb([x * .8, .1, z * .5], [Math.cos(angle) * .7, .02, Math.sin(angle) * .55], .025, .01, 3,
        () => chitin, false));
      break;
    }
    case 'spines': {
      around(random, 5, .45, (x, z, i, angle) => {
        const h = (i ? .5 + random() * .45 : 1) * 1.2;
        parts.shard([x, 0, z], .07 + h * .06, h, [Math.sin(angle) * .4, random() * 3, -Math.cos(angle) * .4], scale(chitin, .6), mix(chitin, amber, .4));
      });
      parts.lobe([0, -.02, 0], [.55, .08, .5], resin, amber, 0);
      break;
    }
    case 'pod-wreck': {
      // Drop pod rammed into the ground at an angle; hatch blown open.
      const tilt = .62;
      const axis = new T.Vector3(Math.sin(tilt), Math.cos(tilt), 0);
      const at = (t: number): T.Vector3Tuple => [-.35 + axis.x * t, -.9 + axis.y * t, 0];
      const shell = (p: T.Vector3) => burnt(mix(olive, steel, .3), p, .55 + (1 - smooth(-1, 1, p.y)) * .4);
      parts.limb(at(0), at(1.25), .62, .6, 10, shell);
      parts.limb(at(1.25), at(1.75), .6, .2, 10, (p) => burnt(steel, p, .7));
      parts.limb(at(.2), at(.35), .66, .66, 10, () => hazard, false);
      parts.box([.55, .1, .55], [.8, .06, .55], [.4, .3, -.5], (p) => burnt(olive, p, .5));
      parts.rock([-.5, -.75, 0], [.9, .3, .85], rgb(0x6f6457));
      break;
    }
    case 'hull-wreck': {
      // Curved hull section with ribs, half buried, torn edge.
      const shellRgb = (p: T.Vector3) => burnt(mix(oliveDark, steel, .4), p, .5);
      const geometry = new T.CylinderGeometry(1, 1, 1.9, 12, 3, true, 0, Math.PI * 1.1);
      geometry.rotateZ(Math.PI / 2);
      geometry.translate(0, -.15, 0);
      const pos = geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.sin(pos.getX(i) * 7 + pos.getZ(i) * 3) * .06);
      parts.add(geometry, shellRgb);
      for (let k = 0; k < 4; k++) {
        const x = -.8 + k * .53;
        parts.limb([x, -.95, -.92], [x, .7, -.4], .05, .05, 4, () => rust, false);
      }
      parts.rock([0, -.9, 0], [1, .25, .95], rgb(0x6f6457));
      break;
    }
    case 'ruin': {
      // Broken concrete wall segment with a jagged top and bent rebar.
      const wall = (p: T.Vector3, n: T.Vector3) => mix(scale(concrete, .8 + .2 * Math.sin(p.y * 9)), scorch, Math.abs(n.y) > .5 ? .1 : .25 * (1 - smooth(-1, .6, p.y)));
      parts.box([0, -.4, 0], [1.9, 1.2, .55], [0, 0, 0], wall);
      parts.box([-.45, .45, 0], [.95, .6, .5], [0, 0, .08], wall);
      parts.box([.55, .3, .05], [.7, .35, .45], [0, 0, -.18], wall);
      for (let k = 0; k < 4; k++) parts.limb([-.8 + k * .5, .2, 0], [-.85 + k * .5 + random() * .3, .92, (random() - .5) * .4], .02, .02, 3, () => rust, false);
      parts.box([.6, -.92, .65], [.5, .2, .4], [.2, .5, .1], wall);
      break;
    }
  }
  const geometry = parts.merge();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  vividColors(geometry, 1.12);
  geometry.name = 'trace/' + id;
  return geometry;
}

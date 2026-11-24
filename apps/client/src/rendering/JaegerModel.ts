import * as T from 'three';
import { Organism, blend, hex, shade, smooth } from './SwarmOrganism.ts';
import type { Tissue, Vec3 } from './SwarmOrganism.ts';
import { ROLE, along, hook, limbPlate, loft, mirror, plate, spike } from './WarriorKit.ts';
import type { Profile } from './WarriorKit.ts';

/*
 * Jäger (swarm.jaeger): the fast warrior caste after concept_hunter.png. Deliberately unlike any terrestrial insect: a
 * hunched, forward-pitched predator with the thorax carried high and a wasp-thin waist, an elongated cranial helmet that
 * sweeps back into blade fins, six ember eyes, a split maw with hooked side mandibles, dagger-shaped blade shingles
 * instead of round segments, an exposed rib cage, glowing vent slits along the abdomen and four-jointed legs whose knees
 * rise above the crest. Matte, worn chitin in the swarm palette; the ember accents tie it to the Schabe and the nests.
 */

const DARK = hex(0x1d1816), CHITIN = hex(0x352c27), WORN = hex(0x6b5b4d), BONE = hex(0x9a8670);
const SINEW = hex(0x4a1f24), SINEW_LIGHT = hex(0x6c2e33), BELLY = hex(0x3a2826), MAW = hex(0x240909);
const EMBER = hex(0xff5c1c), EMBER_DEEP = hex(0xb8360f);

/** Body profile from the snout (−Z) to the tail tip: [z, centre y, half width, dorsal height, ventral depth]. */
const PROFILE: Profile = [
  [-1.62, 1.22, .012, .012, .012],
  [-1.52, 1.25, .085, .061, .061],
  [-1.36, 1.29, .171, .122, .11],
  [-1.16, 1.31, .207, .159, .146],
  [-.98, 1.29, .146, .122, .11],
  [-.86, 1.28, .171, .134, .122],
  [-.7, 1.28, .293, .244, .232],
  [-.45, 1.24, .342, .305, .268],
  [-.2, 1.16, .281, .256, .22],
  [-.04, 1.06, .122, .11, .11],
  [.1, 1.0, .232, .207, .183],
  [.35, .95, .28, .235, .224],
  [.62, .88, .246, .202, .19],
  [.88, .8, .157, .134, .123],
  [1.1, .72, .09, .078, .067],
  [1.3, .64, .045, .045, .039],
  [1.46, .57, .011, .011, .011],
];

/** Hip, knee, ankle and foot per leg pair (raptorial front limbs, middle, rear) for the +X side; mirrored for −X. */
export const JAEGER_LEGS: readonly (readonly [Vec3, Vec3, Vec3, Vec3])[] = [
  [[.22, 1.2, -.72], [.6, 1.5, -1.04], [.82, .8, -1.44], [.84, .04, -1.62]],
  [[.28, 1.18, -.42], [.98, 1.56, -.5], [1.36, .48, -.62], [1.46, .02, -.68]],
  [[.24, 1.08, -.12], [.92, 1.52, .38], [1.22, .44, .95], [1.32, .02, 1.12]],
];

/** Bounding gait: the front pair strikes the ground together, the rear pair half a cycle later. */
const GAIT_PHASE = [0, Math.PI * .5, Math.PI] as const;
const TAIL_PIVOT: Vec3 = [0, 1.0, .05];
const JAW_PIVOT: Vec3 = [0, 1.22, -1.08];

const chitin = (u: T.Vector3, edge: number, n: T.Vector3, tone = 0): Tissue => ({
  color: shade(blend(blend(DARK, CHITIN, .35 + .5 * u.y + tone), WORN, edge * .75), .78 + .22 * Math.max(0, n.y)),
  gloss: 1.05 - edge * .15,
});
const bone = (t: number): Tissue => ({ color: blend(CHITIN, BONE, smooth(.2, 1, t)), gloss: .9 });
/** Ember slit: glows, and its veins beat with the swarm pulse. */
const vent = (): Tissue => ({ color: EMBER_DEEP, gloss: .3, glow: .75, membrane: 1, veins: 1 });

export function jaegerGeometry(tier: 0 | 1 | 2): T.BufferGeometry {
  const m = new Organism({ limbs: true });
  const near = tier === 0, far = tier === 2;

  // Body: sinewy core, darker on the back where the blades sit. The abdomen behind the waist sways.
  m.joint = { role: ROLE.tail, phase: 0, side: 0, pivot: TAIL_PIVOT, reach: 1.4 };
  loft(m, PROFILE, near ? 34 : far ? 9 : 18, near ? 14 : far ? 6 : 8, (info, n) => {
    const back = smooth(-.55, .1, info.side);
    const color = blend(blend(BELLY, SINEW, smooth(-.95, -.5, info.side)), blend(DARK, CHITIN, .4), back);
    return { color: shade(color, .8 + .2 * Math.max(0, n.y)), gloss: back > .5 ? 1 : .7, membrane: (1 - back) * .7,
      veins: (1 - back) * .6 * (info.z > -.8 ? 1 : 0) };
  }, near ? .03 : 0);

  if (!far) {
    // Dagger shingles: each blade ends in one long point that rises backwards, layered from the neck to the tail.
    const count = near ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const s = i / (count - 1);
      const z = -.78 + s * 1.85;
      const crest = 1 - smooth(.15, 1, s);
      const top = 1.5 - s * .62 - (s > .3 ? (s - .3) * .1 : 0);
      plate(m, { center: [0, top - .12, z], radii: [.36 * (1 - s * .55), .11 + .06 * crest, .3 - s * .08],
        rotation: [-.3 - crest * .2, 0, 0], lobes: 1, lobeLift: .9 + crest * 1.6, lobeReach: 1.1 + crest * .5, ridge: .7, curl: .55,
        sides: 4, facet: .7, flat: true, segments: near ? [12, 4] : [8, 2] }, (u, edge, n) => chitin(u, edge, n, -.05));
    }
    // Swept shoulder blades over the thorax and armored flanks over the vital organs.
    for (const side of [-1, 1]) {
      plate(m, { center: [side * .24, 1.38, -.55], radii: [.18, .07, .32], rotation: [-.32, side * .32, side * .75],
        lobes: 1, lobeLift: .8, lobeReach: 1.1, ridge: .4, sides: 4, facet: .6, flat: true, segments: near ? [8, 3] : [4, 2] },
        (u, edge, n) => chitin(u, edge, n));
      plate(m, { center: [side * .22, 1.22, -.3], radii: [.12, .07, .26], rotation: [-.1, side * .12, side * 1.2],
        lobes: near ? 1 : 0, lobeLift: .4, lobeReach: .7, curl: .2, segments: near ? [8, 3] : [5, 2] },
        (u, edge, n) => chitin(u, edge, n, -.04));
    }
  }

  // Overlapping side plates down the abdomen.
  if (!far) {
    m.joint = { role: ROLE.tail, phase: 0, side: 0, pivot: TAIL_PIVOT, reach: 1.4 };
    for (const side of [-1, 1]) for (const [z, y, w] of (near ? [[.2, 1.02, .2], [.44, .96, .19], [.68, .88, .15]] : [[.3, 1.0, .2], [.66, .88, .16]])) {
      plate(m, { center: [side * w, y, z], radii: [.13, .06, near ? .14 : .2], rotation: [-.2, 0, side * 1.0], lobes: 1, lobeLift: .5,
        lobeReach: .6, sides: 4, facet: .6, flat: true, segments: near ? [8, 3] : [4, 2] }, (u, edge, n) => chitin(u, edge, n, -.08));
    }
    m.joint = undefined;
  }

  // Exposed rib cage under the thorax and ember vent slits along the abdomen.
  if (near) for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = -.66 + i * .14;
      hook(m, [[side * .1, 1.16, z], [side * .25, 1.12 - i * .02, z + .04], [side * .16, .98 - i * .03, z + .08]], .018, 3, bone);
    }
    for (let i = 0; i < 4; i++) {
      const z = .18 + i * .2, y = .98 - i * .055;
      const w = .25 - Math.abs(i - 1.2) * .03;
      m.joint = { role: ROLE.tail, phase: 0, side: 0, pivot: TAIL_PIVOT, reach: 1.4 };
      m.ellipsoid([side * w * .92, y, z], [.012, .045, .075], 6, 3, vent, [0, 0, side * .3]);
      m.joint = undefined;
    }
  } else if (!far) for (const side of [-1, 1]) {
    m.ellipsoid([side * .23, .96, .38], [.014, .05, .16], 4, 3, vent);
  }

  // Head: an elongated cranial helmet sweeping back and up into a blade, flanked by swept cheek fins.
  m.joint = undefined;
  plate(m, { center: [0, 1.38, -1.12], radii: [.27, .18, .56], rotation: [-.24, 0, 0], lobes: far ? 0 : 1,
    lobeLift: 1.4, lobeReach: 1.15, ridge: .65, curl: .5, sides: far ? 0 : 5, facet: .45, flat: !far, segments: near ? [14, 5] : far ? [6, 2] : [8, 3] },
    (u, edge, n) => chitin(u, edge, n, .05));
  if (!far) for (const side of [-1, 1]) {
    plate(m, { center: [side * .15, 1.3, -1.06], radii: [.09, .06, .36], rotation: [-.34, side * .3, side * .9],
      lobes: 1, lobeLift: .5, lobeReach: 1.1, sides: 4, facet: .6, flat: true, segments: near ? [8, 3] : [4, 2] },
      (u, edge, n) => chitin(u, edge, n));
    // Three ember eyes in a row under the helmet rim.
    const eyes = near ? [[.13, 1.28, -1.4, .02], [.155, 1.3, -1.31, .017], [.17, 1.31, -1.22, .014]] : [[.15, 1.29, -1.32, .026]];
    for (const [x, y, z, r] of eyes) {
      m.ellipsoid([side * x, y, z], [r, r, r], near ? 6 : 4, near ? 4 : 3, () => ({ color: EMBER, gloss: .2, glow: .95 }));
    }
  }
  // Split maw: a long lower jaw with hooked side mandibles that drop open together.
  m.joint = { role: ROLE.jaw, phase: 0, side: 0, pivot: JAW_PIVOT, reach: .6 };
  if (!far) {
    m.ellipsoid([0, 1.19, -1.3], [.12, .045, .26], near ? 10 : 6, near ? 5 : 3, (p, n) => ({
      color: shade(blend(CHITIN, MAW, smooth(1.17, 1.22, p.y) * .8), .8 + .2 * Math.max(0, -n.y)), gloss: .8 }), [-.1, 0, 0]);
    for (const side of [-1, 1]) {
      hook(m, [[side * .1, 1.2, -1.36], [side * .2, 1.15, -1.5], [side * .07, 1.1, -1.62]], .026, near ? 4 : 3, bone);
    }
  }
  if (near) for (const side of [-1, 1]) {
    // A pair of slender secondary arms folded under the jaw, hooked like the talons.
    hook(m, [[side * .09, 1.12, -1.12], [side * .2, 1.0, -1.28], [side * .16, .98, -1.46], [side * .08, 1.04, -1.54]], .018, 4, bone);
  }
  if (near) {
    // Mouth interior with a faint inner glow, and two rows of teeth (the lower row moves with the jaw).
    m.ellipsoid([0, 1.22, -1.3], [.09, .032, .2], 8, 4, () => ({ color: MAW, gloss: .4, glow: .25, membrane: .8, veins: .6 }));
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const z = -1.5 + i * .075, x = side * (.04 + i * .02);
      spike(m, [x, 1.21, z], [x * .9, 1.27, z + .01], .011, 3, bone);
    }
  }
  m.joint = undefined;
  if (near) for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = -1.52 + i * .07, x = side * (.045 + i * .022);
    spike(m, [x, 1.26, z], [x * .92, 1.18, z - .01], .012, 3, bone);
  }
  if (near) {
    // Blade crest above the neck and the barbed, forked tail.
    for (const [z, y, h] of [[-.86, 1.42, .28], [-.66, 1.46, .3], [-.44, 1.44, .24]] as const) {
      spike(m, [0, y, z], [0, y + h, z + .3], .04, 4, bone);
    }
    m.joint = { role: ROLE.tail, phase: 0, side: 0, pivot: TAIL_PIVOT, reach: 1.4 };
    for (let i = 0; i < 5; i++) {
      const z = .4 + i * .2, y = 1.08 - i * .085;
      spike(m, [0, y - .04, z], [0, y + .1 - i * .012, z + .16], .024, 4, bone);
    }
    for (const side of [-1, 1]) hook(m, [[0, .6, 1.36], [side * .07, .56, 1.5], [side * .11, .5, 1.6]], .03, 4, bone);
    m.joint = undefined;
  }

  // Six legs with an extra joint: muscled femur under a spiked plate, knee spur, thorny tibia, hooked tarsal claw; the
  // front pair ends in long scythe talons.
  for (const [pair, leg] of JAEGER_LEGS.entries()) for (const side of [-1, 1]) {
    const [hip, knee, ankle, foot] = leg.map((p) => mirror(p, side));
    const reach = Math.hypot(foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]);
    m.joint = { role: pair === 0 ? ROLE.arm : ROLE.leg, phase: GAIT_PHASE[pair] + side * .12, side, pivot: hip, reach };
    const sinew = (_p: T.Vector3, n: T.Vector3, t: number): Tissue => ({
      color: shade(blend(blend(DARK, SINEW, .55), SINEW_LIGHT, Math.sin(t * Math.PI) * .25), .75 + .25 * Math.max(0, n.y)), gloss: .8,
      membrane: .3, veins: .35 });
    if (far) {
      m.chain([hip, knee, foot], .06, .025, 3, () => ({ color: CHITIN, gloss: 1 }));
      continue;
    }
    m.limb(hip, knee, .13, .085, near ? 7 : 5, near ? 3 : 1, near ? .3 : .15, sinew);
    limbPlate(m, hip, knee, .16, .09, near ? [8, 3] : [4, 2], (u, edge, n) => chitin(u, edge, n),
      { spikes: near ? 3 : 0, spikeLift: .8, spikeReach: .7, outward: [side * .5, 1, 0], lift: .07, sides: 4, facet: .5, flat: true });
    // Spur rising backwards from the knee, above the crest line.
    spike(m, knee, [knee[0] + side * .05, knee[1] + .12, knee[2] + (pair === 0 ? .14 : .1)], .03, near ? 4 : 3, bone);
    limbPlate(m, knee, ankle, .09, .06, near ? [8, 3] : [4, 2], (u, edge, n) => chitin(u, edge, n, -.05),
      { spikes: near ? 2 : 0, spikeLift: .6, spikeReach: .6, outward: [side, .3, 0], scale: .85, sides: 4, facet: .5, flat: true });
    m.limb(knee, ankle, .085, .04, near ? 6 : 4, near ? 2 : 1, 0, (_p, n, t) => ({
      color: shade(blend(CHITIN, DARK, t), .78 + .22 * Math.max(0, n.y)), gloss: 1 }));
    if (near) {
      m.ellipsoid(knee, [.06, .06, .06], 6, 4, () => ({ color: SINEW, gloss: .7, glow: .12, membrane: .6, veins: .8 }));
      for (const t of [.2, .42, .64, .84]) {
        const base = along(knee, ankle, t);
        spike(m, base, [base[0] + side * .07, base[1] + .03, base[2] + (pair === 0 ? -.05 : .05)], .015, 3, bone);
      }
    }
    if (pair === 0) {
      // Scythe talon: a long blade curving forward and down from the wrist.
      hook(m, [ankle, along(ankle, foot, .45, [side * .05, .1, -.16]), along(ankle, foot, .85, [0, .04, -.12]), foot], .045,
        near ? 5 : 3, (t) => ({ color: blend(DARK, BONE, smooth(.5, 1, t) * .8), gloss: .95 }));
    } else {
      const bend: Vec3 = along(ankle, foot, .5, [side * .06, .06, 0]);
      hook(m, [ankle, bend, foot], .032, near ? 5 : 3, (t) => ({ color: blend(DARK, BONE, smooth(.6, 1, t) * .7), gloss: .95 }));
    }
  }
  m.joint = undefined;
  return m.geometry();
}

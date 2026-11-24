import * as T from 'three';
import { Organism, blend, hex, shade, smooth } from './SwarmOrganism.ts';
import type { Tissue, Vec3 } from './SwarmOrganism.ts';
import { ROLE, along, hook, limbPlate, loft, mirror, plate, spike } from './WarriorKit.ts';
import type { Profile } from './WarriorKit.ts';

/*
 * Durchbruchskäfer (swarm.durchbruchskaefer): the heavy warrior caste after concept_breacher.png, built taller and
 * bulkier than a terrestrial beetle. A towering, hunched silhouette: a sloped head shield like a dozer blade, a massive
 * shoulder hump, a high carapace of keeled, overlapping armor tiles with bony studs along the spine and molten ember
 * seams glowing between the plates, armored skirts over the flanks, two huge digging forelimbs with spade claws and four
 * thick, high-kneed legs. Under the shield, between the tusks, sits its one frontal weakness: a pulsing, glowing throat
 * sac (hit zone `weak-spot`, unarmored).
 */

const PLATE_DARK = hex(0x26211e), PLATE = hex(0x4a423c), WORN = hex(0x8e8577), BONE = hex(0xa08c74);
const MUSCLE = hex(0x431c22), MUSCLE_LIGHT = hex(0x6a2c32), BELLY = hex(0x34201f), MAW = hex(0x220808);
const EMBER = hex(0xff5c1c), EMBER_DEEP = hex(0xb8360f), SAC = hex(0xd8501e);

const PROFILE: Profile = [
  [-1.74, .7, .02, .02, .02],
  [-1.62, .74, .2, .12, .1],
  [-1.42, .8, .34, .2, .2],
  [-1.18, .86, .4, .26, .26],
  [-.98, .94, .48, .34, .3],
  [-.78, 1.04, .74, .54, .4],
  [-.45, 1.1, .92, .64, .46],
  [-.1, 1.1, .96, .66, .48],
  [.3, 1.08, .94, .62, .46],
  [.7, 1.02, .82, .54, .42],
  [1.05, .96, .6, .42, .34],
  [1.3, .9, .32, .24, .2],
  [1.46, .86, .02, .02, .02],
];

/** Shoulder, elbow, wrist and claw tip of the digging forelimbs (+X side). */
export const BREACHER_ARM: readonly [Vec3, Vec3, Vec3, Vec3] = [[.7, 1.04, -.72], [1.18, 1.2, -1.0], [1.12, .5, -1.44], [1.0, .03, -1.62]];
/** Hip, knee, ankle and foot of the middle and rear legs (+X side). */
export const BREACHER_LEGS: readonly (readonly [Vec3, Vec3, Vec3, Vec3])[] = [
  [[.72, .84, -.05], [1.3, 1.24, .12], [1.46, .34, .14], [1.5, .02, .12]],
  [[.66, .84, .7], [1.22, 1.2, 1.0], [1.36, .32, 1.14], [1.4, .02, 1.18]],
];
/** The glowing throat sac: centre and radius in model space, matching the `weak-spot` hit zone. */
export const BREACHER_WEAK_SPOT: { readonly center: Vec3; readonly halfWidth: number; readonly radius: number } =
  { center: [0, .55, -1.47], halfWidth: .08, radius: .1 };
/** Diagonal gait: middle-left with rear-right; the forelimbs knuckle-walk in between. */
const LEG_PHASE = [[0, Math.PI], [Math.PI, 0]] as const;
const JAW_PIVOT: Vec3 = [0, .74, -1.35];

const armor = (u: T.Vector3, edge: number, n: T.Vector3, tone = 0): Tissue => ({
  color: shade(blend(blend(PLATE_DARK, PLATE, .3 + .55 * u.y + tone), WORN, edge * .8), .72 + .28 * Math.max(0, n.y)),
  gloss: 1.1 - edge * .1,
  // Faint molten cracks running in from the worn rims.
  veins: smooth(.55, 1, edge) * .7,
});
const bone = (t: number): Tissue => ({ color: blend(PLATE, BONE, smooth(.15, 1, t)), gloss: .95 });
const muscle = (_p: T.Vector3, n: T.Vector3, t: number): Tissue => ({
  color: shade(blend(MUSCLE, MUSCLE_LIGHT, Math.sin(t * Math.PI) * .6), .72 + .28 * Math.max(0, n.y)), gloss: .7, membrane: .35, veins: .35 });
/** Molten seam between armor plates: glows, and its veins beat with the swarm pulse. */
const seam = (): Tissue => ({ color: EMBER_DEEP, gloss: .3, glow: .6, membrane: 1, veins: 1 });

export function breacherGeometry(tier: 0 | 1 | 2): T.BufferGeometry {
  const m = new Organism({ limbs: true });
  const near = tier === 0, far = tier === 2;

  // Massive muscular core, darkest on the back under the plates.
  loft(m, PROFILE, near ? 30 : far ? 9 : 16, near ? 16 : far ? 6 : 9, (info, n) => {
    const back = smooth(-.1, .5, info.side);
    const color = blend(blend(BELLY, MUSCLE, smooth(-.8, -.1, info.side) * (1 - smooth(-.1, .3, info.side))), PLATE_DARK, back);
    return { color: shade(color, .78 + .22 * Math.max(0, n.y)), gloss: back > .5 ? 1.05 : .72, membrane: (1 - back) * .5,
      veins: (1 - back) * .3 };
  }, near ? .035 : 0);

  // Head shield like a dozer blade (its points face forward) and the massive shoulder hump behind it: hewn, faceted
  // armor with a keel, not a smooth dome.
  plate(m, { center: [0, 1.02, -1.3], radii: [.7, .24, .56], rotation: [-.42, Math.PI, 0], spikes: far ? 0 : 4, spikeLift: .5,
    spikeReach: .55, ridge: .5, curl: .35, sides: 5, facet: .5, flat: !far, segments: near ? [20, 5] : far ? [5, 2] : [10, 3] },
    (u, edge, n) => armor(u, edge, n, .08));
  plate(m, { center: [0, 1.46, -.66], radii: [1.04, .36, .52], rotation: [-.16, 0, 0], spikes: far ? 0 : 3, spikeLift: .7,
    spikeReach: .5, ridge: .6, curl: .6, sides: 6, facet: .45, flat: !far, segments: near ? [24, 5] : far ? [6, 2] : [12, 3] },
    (u, edge, n) => armor(u, edge, n, .04));
  if (!far) {
    // Armored back: a mosaic of keeled, angular tiles overlapping towards the rear: a spine row and a lower row on each
    // flank angled down over the sides.
    const spine = near
      ? [[-.22, 1.74, .62, .26], [.12, 1.74, .6, .26], [.46, 1.66, .56, .24], [.78, 1.52, .48, .21], [1.06, 1.34, .38, .18]]
      : [[-.12, 1.74, .64, .28], [.42, 1.64, .58, .25], [.94, 1.4, .44, .2]];
    for (const [i, [z, y, w, h]] of spine.entries()) {
      // Each tile follows the slope of the hump: lifted at the front, laid down towards the rear.
      const pitch = -.22 + .6 * i / (spine.length - 1);
      plate(m, { center: [0, y - h * .7, z], radii: [w, h, near ? .38 : .46], rotation: [pitch, 0, 0], lobes: 1, lobeLift: 1.5,
        lobeReach: .55, ridge: .6, curl: .35, sides: 6, facet: .6, flat: true, segments: near ? [12, 4] : [6, 2] },
        (u, edge, n) => armor(u, edge, n, (i % 2) * -.06));
      // Molten seam glowing out from under the rear rim, and a bony stud on the keel.
      if (near) {
        m.ellipsoid([0, y - h * .8, z + .3], [w * .82, .03, .05], 10, 3, seam, [pitch, 0, 0]);
        spike(m, [0, y + h * .05, z - .08], [0, y + h * .05 + .17, z + .06], .07, 5, bone);
      }
    }
    const flank = near ? [[-.36, 1.5, .44], [-.02, 1.52, .44], [.32, 1.48, .42], [.66, 1.38, .38], [.96, 1.22, .3]]
      : [[-.2, 1.5, .46], [.4, 1.46, .42], [.92, 1.24, .32]];
    for (const side of [-1, 1]) for (const [i, [z, y, w]] of flank.entries()) {
      plate(m, { center: [side * .62, y - .1, z], radii: [w, .17, near ? .36 : .44], rotation: [-.1 + .4 * i / (flank.length - 1), 0, side * -.72], lobes: 1,
        lobeLift: 1.1, lobeReach: .5, ridge: .45, curl: .2, sides: 5, facet: .7, flat: true, segments: near ? [10, 3] : [5, 2] },
        (u, edge, n) => armor(u, edge, n, -.03 - (i % 2) * .04));
      if (near) m.ellipsoid([side * .78, y - .32, z + .2], [.2, .025, .045], 6, 3, seam, [0, 0, side * -.72]);
    }
    // Armored skirts hanging over the hips.
    for (const side of [-1, 1]) for (const z of (near ? [-.36, .24, .82] : [-.1, .7])) {
      plate(m, { center: [side * 1.0, 1.06, z], radii: [.34, .13, .32], rotation: [.12, 0, side * 1.25], lobes: 1, lobeLift: .4,
        lobeReach: .5, spikes: near ? 2 : 0, spikeLift: .7, spikeReach: .7, ridge: .35, curl: .15, sides: 5, facet: .6, flat: true,
        segments: near ? [10, 3] : [5, 2] }, (u, edge, n) => armor(u, edge, n, -.07));
    }
  }

  // Head under the shield: a cluster of ember eyes, a dark maw with teeth and, between the tusks, the throat sac.
  if (!far) for (const side of [-1, 1]) {
    const eyes = near ? [[.3, .8, -1.5, .032], [.22, .84, -1.56, .022], [.37, .84, -1.43, .02]] : [[.3, .8, -1.5, .036]];
    for (const [x, y, z, r] of eyes) {
      m.ellipsoid([side * x, y, z], [r, r, r], near ? 6 : 4, near ? 4 : 3, () => ({ color: EMBER, gloss: .2, glow: .95 }));
    }
  }
  const sac = BREACHER_WEAK_SPOT;
  m.ellipsoid(sac.center, [sac.halfWidth + sac.radius, sac.radius, sac.radius * .9], near ? 12 : far ? 5 : 8, near ? 8 : far ? 3 : 5,
    (p) => ({ color: blend(MUSCLE, SAC, smooth(.1, .95, -(p.z - sac.center[2]) / sac.radius) * .85), gloss: .35, glow: .14,
      membrane: 1, veins: 1 }));
  // Armored breast plate under the head; the sac sits in front of it.
  plate(m, { center: [0, .6, -1.12], radii: [.5, .12, .26], rotation: [-1.3, 0, 0], ridge: .3, curl: .2, sides: far ? 0 : 6,
    facet: .5, flat: !far, segments: near ? [12, 3] : far ? [5, 2] : [6, 2] }, (u, edge, n) => armor(u, edge, n, -.04));
  if (!far) for (const side of [-1, 1]) {
    // Lip flaps that frame the sac from the sides and leave only its front exposed.
    plate(m, { center: [side * .19, sac.center[1], sac.center[2] - .02], radii: [.1, .05, .15], rotation: [0, side * .5, side * 1.45],
      lobes: 1, lobeLift: .4, lobeReach: .4, sides: 4, facet: .5, flat: true, segments: near ? [8, 3] : [4, 2] },
      (u, edge, n) => armor(u, edge, n, -.1));
  }
  if (near) {
    // Fleshy collar around the sac, the maw above it and a row of teeth.
    m.ellipsoid([0, sac.center[1], sac.center[2] + .07], [.24, .14, .1], 12, 5, () => ({ color: MUSCLE, gloss: .6, membrane: .7,
      veins: .6 }));
    m.ellipsoid([0, .7, -1.5], [.22, .07, .14], 10, 4, () => ({ color: MAW, gloss: .45, membrane: .6, veins: .5 }));
    for (let i = 0; i < 7; i++) {
      const x = -.18 + i * .06;
      spike(m, [x, .77, -1.6 + Math.abs(x) * .4], [x * .95, .65, -1.62 + Math.abs(x) * .4], .018, 3, bone);
    }
  }
  m.joint = { role: ROLE.jaw, phase: 0, side: 0, pivot: JAW_PIVOT, reach: .7 };
  if (!far) for (const side of [-1, 1]) {
    hook(m, [[side * .24, .7, -1.5], [side * .33, .46, -1.74], [side * .2, .24, -1.86]], .065, near ? 6 : 4, bone);
  }
  m.joint = undefined;

  // Digging forelimbs: muscled upper arm and forearm under heavy plates, three spade claws.
  for (const side of [-1, 1]) {
    const [shoulder, elbow, wrist, tip] = BREACHER_ARM.map((p) => mirror(p, side));
    m.joint = { role: ROLE.arm, phase: Math.PI * (side < 0 ? .5 : 1.5), side, pivot: shoulder, reach: 1.4 };
    if (far) {
      m.chain([shoulder, elbow, wrist, tip], .18, .08, 4, () => ({ color: PLATE, gloss: 1 }));
      continue;
    }
    m.limb(shoulder, elbow, .23, .18, near ? 8 : 5, near ? 3 : 1, near ? .25 : .1, muscle);
    m.limb(elbow, wrist, .19, .13, near ? 8 : 5, near ? 2 : 1, near ? .15 : 0, muscle);
    limbPlate(m, shoulder, elbow, .28, .17, near ? [10, 3] : [6, 2], (u, edge, n) => armor(u, edge, n),
      { spikes: near ? 3 : 0, spikeLift: .6, spikeReach: .4, outward: [side * .8, 1, 0], lift: .09, sides: 5, facet: .45, flat: true });
    limbPlate(m, elbow, wrist, .27, .14, near ? [14, 4] : [6, 2], (u, edge, n) => armor(u, edge, n, .05),
      { spikes: near ? 4 : 2, spikeLift: 1, spikeReach: .8, outward: [side, .25, -.6], lift: .1, scale: 1.2, sides: 5, facet: .45,
        flat: true });
    if (near) m.ellipsoid(elbow, [.17, .17, .17], 8, 5, () => ({ color: MUSCLE, gloss: .7, membrane: .4, veins: .6 }));
    for (const offset of [-.12, 0, .12]) {
      const end: Vec3 = [tip[0] + side * offset, .02, tip[2] - Math.abs(offset) * .3];
      hook(m, [wrist, along(wrist, end, .55, [side * offset * .5, .04, -.12]), end], .08, near ? 5 : 3,
        (t) => ({ color: blend(PLATE_DARK, BONE, smooth(.5, 1, t) * .8), gloss: 1 }));
    }
  }

  // Four thick, high-kneed legs under armor plates.
  for (const [pair, leg] of BREACHER_LEGS.entries()) for (const side of [-1, 1]) {
    const [hip, knee, ankle, foot] = leg.map((p) => mirror(p, side));
    m.joint = { role: ROLE.leg, phase: LEG_PHASE[pair][side < 0 ? 0 : 1], side, pivot: hip,
      reach: Math.hypot(foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]) };
    if (far) {
      m.chain([hip, knee, foot], .13, .06, 3, () => ({ color: PLATE_DARK, gloss: 1 }));
      continue;
    }
    m.limb(hip, knee, .2, .14, near ? 7 : 5, near ? 2 : 1, near ? .2 : .1, muscle);
    limbPlate(m, hip, knee, .2, .12, near ? [8, 3] : [5, 2], (u, edge, n) => armor(u, edge, n, .03),
      { spikes: near ? 2 : 0, spikeLift: .6, spikeReach: .5, outward: [side * .7, 1, 0], lift: .08, sides: 4, facet: .5, flat: true });
    m.limb(knee, ankle, .14, .095, near ? 6 : 4, 1, 0, (_p, n, t) => ({
      color: shade(blend(PLATE, PLATE_DARK, t), .75 + .25 * Math.max(0, n.y)), gloss: 1.05 }));
    limbPlate(m, knee, ankle, .17, .1, near ? [8, 3] : [5, 2], (u, edge, n) => armor(u, edge, n),
      { spikes: near ? 2 : 0, spikeLift: .5, spikeReach: .45, outward: [side, .4, 0], sides: 4, facet: .5, flat: true });
    if (near) m.ellipsoid(knee, [.12, .12, .12], 6, 4, () => ({ color: MUSCLE, gloss: .7, membrane: .4, veins: .6 }));
    hook(m, [ankle, along(ankle, foot, .5, [side * .06, .03, -.04]), foot], .08, near ? 5 : 3,
      (t) => ({ color: blend(PLATE_DARK, BONE, smooth(.6, 1, t) * .7), gloss: 1 }));
  }
  m.joint = undefined;
  return m.geometry();
}

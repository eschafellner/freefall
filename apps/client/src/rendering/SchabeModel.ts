import * as T from 'three';
import { Organism, blend, curve, hex, shade, smooth } from './SwarmOrganism.ts';
import type { RGB, Tissue, Vec3 } from './SwarmOrganism.ts';

export type { Tissue } from './SwarmOrganism.ts';

/** Hull profile from the head scoop (-Z) to the abdomen tip: [z, centre y, half width, dorsal height, ventral depth]. */
const PROFILE: readonly (readonly number[])[] = [
  [-.86, .47, .004, .004, .004],
  [-.83, .47, .12, .05, .05],
  [-.76, .5, .2, .09, .09],
  [-.67, .53, .21, .12, .11],
  [-.59, .56, .15, .11, .1],
  [-.52, .6, .3, .15, .12],
  [-.4, .62, .4, .18, .14],
  [-.24, .63, .42, .19, .15],
  [-.1, .62, .34, .17, .14],
  [0, .62, .38, .19, .15],
  [.18, .62, .44, .21, .16],
  [.38, .6, .42, .2, .15],
  [.55, .56, .32, .15, .11],
  [.66, .52, .17, .09, .07],
  [.73, .5, .004, .004, .004],
];
const ABDOMEN = { start: -.02, end: .73, segments: 6 } as const;
const THORAX_GROOVES = [-.56, -.1] as const;

// Swarm palette: plum-black chitin with an oil-film sheen, fleshy membranes like the nest tissue, ember bioluminescence.
const CHITIN = hex(0x2c1e26), CHITIN_DEEP = hex(0x140b10), CHITIN_LIGHT = hex(0x452a34), EDGE = hex(0x6a2f2c);
const MEMBRANE = hex(0x8a3c30), VENTRAL = hex(0x3a2228), LEG = hex(0x241519), JOINT = hex(0x6a3028), CLAW = hex(0x0d0709);
const EMBER = hex(0xff5c1c), RESIN = hex(0xd8742a), MANDIBLE = hex(0x120a0c);

/** Position inside an abdomen segment (0 front … 1 rear edge) or -1 outside the abdomen. */
function segmentPhase(z: number): number {
  if (z < ABDOMEN.start || z > ABDOMEN.end) return -1;
  const u = (z - ABDOMEN.start) / (ABDOMEN.end - ABDOMEN.start) * ABDOMEN.segments;
  return u - Math.floor(u);
}

/** Breathing weight: only the abdomen behind the thorax swells. */
const breathAt = (z: number) => smooth(0, .3, z);

function body(m: Organism, rings: readonly number[], radial: number, plates: boolean): void {
  const positions: number[] = [], data: { z: number; side: number; groove: number; margin: number }[] = [];
  for (const z of rings) {
    const y = curve(PROFILE, z, 1), w = Math.max(.004, curve(PROFILE, z, 2));
    let top = Math.max(.004, curve(PROFILE, z, 3)), bottom = Math.max(.004, curve(PROFILE, z, 4));
    let width = w, groove = 0, margin = 0;
    const s = segmentPhase(z);
    if (plates && s >= 0) {
      // Ring segments of the abdomen, visible on the belly and behind the wing case.
      const swell = s < .8 ? .95 + .07 * smooth(0, .8, s) : 1.02 - .09 * smooth(.8, 1, s);
      width *= swell;
      top *= swell;
      bottom *= .96 + .04 * swell;
      groove = smooth(.84, .98, s) + (1 - smooth(0, .1, s)) * .6;
      margin = smooth(.55, .8, s) * (1 - smooth(.8, .9, s));
    }
    if (plates) for (const g of THORAX_GROOVES) {
      const d = Math.abs(z - g);
      groove = Math.max(groove, 1 - smooth(0, .05, d));
      width *= 1 - .06 * (1 - smooth(0, .05, d));
      top *= 1 - .08 * (1 - smooth(0, .05, d));
    }
    for (let k = 0; k < radial; k++) {
      const angle = k / radial * Math.PI * 2;
      const c = Math.cos(angle), sn = Math.sin(angle);
      const x = width * Math.sign(c) * Math.abs(c) ** .78;
      const h = sn >= 0 ? top * sn ** .9 : -bottom * (-sn) ** 1.25;
      const lump = plates ? 1 + .02 * Math.sin(Math.abs(x) * 21 + z * 17) * Math.sin(z * 29 + sn * 5) : 1;
      positions.push(x * lump, y + h * lump, z);
      data.push({ z, side: sn, groove, margin });
    }
  }
  const index: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < radial; k++) {
    const a = r * radial + k, b = r * radial + (k + 1) % radial, c = a + radial, d = b + radial;
    index.push(a, b, c, b, d, c);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mid = Math.floor(rings.length / 2) * radial + Math.round(radial / 4);
  if (geometry.getAttribute('normal').getY(mid) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geometry.setIndex(index);
    geometry.computeVertexNormals();
  }
  m.add(geometry, (_p, n, vertex) => {
    const info = data[vertex];
    const dorsal = smooth(-.25, .55, info.side);
    let color = blend(VENTRAL, blend(CHITIN_DEEP, CHITIN, .5), dorsal);
    color = blend(color, EDGE, info.margin * .6);
    const membrane = Math.min(1, info.groove);
    color = blend(color, MEMBRANE, membrane * .9);
    const occlusion = (1 - .3 * Math.max(0, -n.y)) * (1 - .25 * membrane * (1 - dorsal));
    return { color: shade(color, occlusion), gloss: membrane > .5 ? .55 : .45 + .2 * (1 - dorsal), membrane,
      veins: membrane * .55, breath: breathAt(info.z) };
  });
}

/** Hip, knee, ankle and foot per leg pair (front, middle, rear) for the +X side; mirrored for −X. */
export const SCHABE_LEGS: readonly (readonly [Vec3, Vec3, Vec3, Vec3])[] = [
  [[.27, .49, -.4], [.53, .6, -.58], [.63, .13, -.72], [.67, .02, -.82]],
  [[.34, .47, -.12], [.66, .6, -.1], [.8, .13, -.06], [.87, .02, -.02]],
  [[.31, .47, .18], [.6, .58, .42], [.74, .13, .64], [.8, .02, .77]],
];

const ELYTRA = { center: [0, .6, .27] as Vec3, radii: [.47, .27, .42] as Vec3, tilt: .08 };

/** Height of the wing case at (|x|, z), for parts that sit on it. */
function elytraTop(x: number, z: number): number {
  const q = 1 - (x / ELYTRA.radii[0]) ** 2 - ((z - ELYTRA.center[2]) / ELYTRA.radii[2]) ** 2;
  return ELYTRA.center[1] + ELYTRA.radii[1] * Math.sqrt(Math.max(0, q)) - Math.tan(ELYTRA.tilt) * (z - ELYTRA.center[2]);
}

/**
 * Procedural swarm worker ("Schabe") in three detail tiers (+Y up, −Z forward): an alien beetle with a domed, split
 * wing case and glowing suture, a horned and crested pronotum, a digging scoop over the head, clustered glowing eyes,
 * two pairs of sickle mandibles, sensor stalks with glowing tips, resin sacs under the wing case and spiked, clawed
 * legs. Legs carry a `rig` attribute (tripod phase, weight from hip to foot) for the gait, abdomen parts and stalks a
 * `tissue` weight for breathing and sway.
 */
export function schabeGeometry(tier: 0 | 1 | 2): T.BufferGeometry {
  const m = new Organism();
  const near = tier === 0;
  const ringCount = near ? [14, 12] : tier === 1 ? [8, 6] : [5, 4];
  const rings: number[] = [];
  for (let i = 0; i < ringCount[0]; i++) rings.push(-.86 + (ABDOMEN.start + .86) * i / ringCount[0]);
  for (let i = 0; i <= ringCount[1]; i++) rings.push(ABDOMEN.start + (.73 - ABDOMEN.start) * i / ringCount[1]);
  body(m, rings, near ? 16 : tier === 1 ? 10 : 6, tier < 2);

  if (tier === 2) {
    // Far silhouette: splayed stub legs, no gait.
    for (const [hip, knee, , foot] of SCHABE_LEGS) for (const side of [-1, 1]) {
      m.chain([[hip[0] * side, hip[1], hip[2]], [knee[0] * side, knee[1], knee[2]], [foot[0] * side, foot[1], foot[2]]], .05, .025, 3,
        () => ({ color: LEG, gloss: .6 }));
    }
    return m.geometry();
  }

  const chitin = (u: T.Vector3, n: T.Vector3, edge: number): Tissue => {
    const color = blend(blend(CHITIN_DEEP, CHITIN, .45 + .4 * u.y), CHITIN_LIGHT, smooth(.6, 1, u.y) * .35);
    return { color: shade(blend(color, EDGE, edge * .7), .8 + .2 * Math.max(0, n.y)), gloss: .44 };
  };

  // Wing case: one dome split by a glowing suture, flared rim, slightly lowered toward the rear.
  m.shell(ELYTRA.center, ELYTRA.radii, near ? 16 : 8, near ? 8 : 3, .5, [ELYTRA.tilt, 0, 0], (u) => {
    u.y -= .1 * Math.exp(-((u.x / .06) ** 2)) * u.y;
    const lip = 1 + .07 * (1 - smooth(0, .25, u.y));
    u.x *= lip;
    u.z *= lip;
  }, (p, n, u) => ({ ...chitin(u, n, (1 - smooth(0, .18, u.y)) * .8), gloss: .56, breath: breathAt(p.z) }));
  // Suture along the groove of the dome's centre meridian, in the dome's own transform.
  const suture: Vec3[] = [];
  const caseTilt = new T.Euler(ELYTRA.tilt, 0, 0);
  for (let i = 0; i <= (near ? 6 : 2); i++) {
    const a = (-.42 + .86 * i / (near ? 6 : 2)) * Math.PI;
    const point = new T.Vector3(0, Math.cos(a) * .9 * ELYTRA.radii[1] + .004, Math.sin(a) * ELYTRA.radii[2]).applyEuler(caseTilt);
    suture.push([0, point.y + ELYTRA.center[1], point.z + ELYTRA.center[2]]);
  }
  m.chain(suture, .02, .008, near ? 4 : 3, (p) => ({ color: EMBER, gloss: .4, glow: .75, breath: breathAt(p.z) }));

  // Pronotum: broad shield with a central crest, a notch over the head and forward horns at the corners.
  m.shell([0, .66, -.33], [.45, .17, .27], near ? 16 : 8, near ? 7 : 3, .55, [-.1, 0, 0], (u) => {
    u.y += .25 * Math.exp(-((u.x / .08) ** 2)) * Math.max(0, u.y);
    u.z += .22 * Math.exp(-((u.x / .3) ** 2)) * Math.max(0, -u.z) ** 2;
  }, (_p, n, u) => {
    // Two glowing swarm marks under the shield, the same on every worker.
    const mark = Math.max(0, 1 - Math.hypot(Math.abs(u.x) - .42, u.z + .05) / .2) * smooth(.3, .6, u.y);
    const finish = chitin(u, n, (1 - smooth(.05, .3, u.y)) + Math.exp(-((u.x / .05) ** 2)) * u.y * .4);
    return { ...finish, color: blend(finish.color, EMBER, mark * .8), glow: mark * .55, veins: mark };
  });
  for (const side of [-1, 1]) {
    m.chain(near ? [[side * .34, .68, -.48], [side * .41, .71, -.62], [side * .37, .75, -.75]] : [[side * .34, .68, -.48], [side * .37, .75, -.75]],
      .055, .004, near ? 6 : 4, (_p, n, t) => ({ color: shade(blend(CHITIN, EDGE, t * .6), .8 + .2 * Math.max(0, n.y)), gloss: .3 }));
  }

  // Digging scoop over the head with a toothed front lip.
  m.shell([0, .53, -.72], [.21, .075, .15], near ? 12 : 6, near ? 5 : 2, .5, [0, 0, 0], (u) => {
    const front = Math.max(0, -u.z);
    u.y -= .5 * front ** 3;
    u.z *= 1 + .14 * front * Math.max(0, Math.cos(u.x * 9));
  }, (_p, n, u) => chitin(u, n, smooth(.5, .95, Math.max(0, -u.z)) * .6));

  // Clustered eyes, glowing from inside.
  const eyes: [Vec3, number][] = near
    ? [[[.17, .52, -.74], .028], [[.19, .5, -.67], .022], [[.12, .5, -.83], .018]]
    : [[[.17, .52, -.75], .04]];
  for (const side of [-1, 1]) for (const [[x, y, z], r] of eyes) {
    m.ellipsoid([side * x, y, z], [r, r, r], near ? 6 : 4, near ? 4 : 3, (_p, n) => ({
      color: shade(blend(EMBER, MANDIBLE, .25), .7 + .3 * Math.max(0, -n.z)), gloss: .12, glow: .8 }));
  }

  // Two pairs of sickle mandibles; the outer pair carries inner teeth.
  for (const side of [-1, 1]) {
    const sickle: Vec3[] = [[side * .1, .45, -.8], [side * .19, .43, -.9], [side * .15, .42, -1], [side * .05, .43, -1.05]];
    const tone = (_p: T.Vector3, _n: T.Vector3, t: number): Tissue => ({ color: blend(JOINT, MANDIBLE, smooth(0, .4, t)), gloss: .25 });
    m.chain(near ? sickle : [sickle[0], sickle[1], sickle[3]], .045, .006, near ? 5 : 4, tone);
    if (near) {
      for (const [base, tip] of [[[.18, .43, -.93], [.13, .43, -.93]], [[.14, .42, -1.0], [.1, .425, -.99]]] as [Vec3, Vec3][]) {
        m.limb([side * base[0], base[1], base[2]], [side * tip[0], tip[1], tip[2]], .013, .001, 3, 1, 0, () => ({ color: MANDIBLE, gloss: .25 }));
      }
      m.chain([[side * .05, .41, -.8], [side * .07, .37, -.89], [side * .03, .36, -.94]], .024, .005, 4, tone);
    }
  }

  // Sensor stalks with glowing tips, swaying toward the tips.
  for (const side of [-1, 1]) {
    const count = near ? 4 : 2;
    const points: Vec3[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      points.push([side * (.07 + .16 * t), .6 + .26 * Math.sin(t * 1.9), -.68 - .2 * t + .1 * t * t]);
    }
    m.chain(points, .02, .008, near ? 4 : 3, (_p, _n, t) => ({ color: blend(LEG, JOINT, t * .5), gloss: .4, sway: t }));
    const tip = points[count];
    m.ellipsoid(tip, [.03, .03, .03], near ? 6 : 4, near ? 4 : 2, () => ({ color: EMBER, gloss: .2, glow: .85, membrane: .4, sway: 1 }));
  }

  // Resin sacs under the wing-case rim: translucent, veined and pulsing with the swarm.
  for (const side of [-1, 1]) for (const [z, r] of (near ? [[.1, .1], [.36, .12]] : [[.24, .12]]) as [number, number][]) {
    m.ellipsoid([side * .39, .53, z], [r * .62, r * .66, r], near ? 8 : 4, near ? 5 : 3, (p, n) => ({
      color: shade(blend(MEMBRANE, RESIN, .35 + .25 * Math.max(0, n.y)), .7), gloss: .3, glow: .03, membrane: 1, veins: 1,
      breath: breathAt(p.z) }));
  }

  if (near) {
    // Crest spines on the pronotum, spikes along the wing-case rim and a pair of rear spikes.
    for (const z of [-.42, -.31, -.2]) {
      const y = .66 + .17 * Math.sqrt(1 - ((z + .33) / .27) ** 2) + .035 + .1 * Math.tan(.1) * (z + .33);
      m.limb([0, y - .02, z], [0, y + .045, z + .045], .022, .002, 4, 1, 0, () => ({ color: CHITIN_LIGHT, gloss: .3 }));
    }
    for (const side of [-1, 1]) {
      for (const z of [.06, .27, .48]) {
        const half = ELYTRA.radii[0] * 1.07 * Math.sqrt(Math.max(0, 1 - ((z - ELYTRA.center[2]) / (ELYTRA.radii[2] * 1.07)) ** 2));
        const y = ELYTRA.center[1] - Math.tan(ELYTRA.tilt) * (z - ELYTRA.center[2]) + .01;
        m.limb([side * (half - .02), y, z], [side * (half + .065), y - .01, z + .05], .02, .002, 4, 1, 0,
          (p) => ({ color: EDGE, gloss: .3, breath: breathAt(p.z) }));
      }
      m.chain([[side * .1, .68, .58], [side * .16, .67, .7], [side * .19, .62, .8]], .04, .003, 5,
        (p, n, t) => ({ color: shade(blend(CHITIN, EDGE, t * .7), .8 + .2 * Math.max(0, n.y)), gloss: .3, breath: breathAt(p.z) }));
    }
  }

  // Six legs, tripod gait: left front, right middle and left rear move together.
  for (const [pair, leg] of SCHABE_LEGS.entries()) {
    for (const side of [-1, 1]) {
      const [hip, knee, ankle, foot] = leg.map(([x, y, z]) => [x * side, y, z] as Vec3);
      const reach = Math.hypot(foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]);
      const group = (side < 0) === (pair !== 1) ? 0 : 1;
      m.rig = (p) => [group * Math.PI + pair * .3, Math.min(1, Math.hypot(p.x - hip[0], p.y - hip[1], p.z - hip[2]) / reach)];
      const legColor = (base: RGB, light: RGB) => (_p: T.Vector3, n: T.Vector3, t: number): Tissue => ({
        color: shade(blend(base, light, smooth(.8, 1, t) * .6), .78 + .22 * Math.max(0, n.y)), gloss: .36 });
      m.limb(hip, knee, .07, .045, near ? 6 : 5, near ? 2 : 1, near ? .22 : .12, legColor(LEG, JOINT));
      m.limb(knee, ankle, .046, .024, near ? 5 : 4, near ? 2 : 1, 0, legColor(blend(LEG, CHITIN, .4), EDGE));
      // Spike above each knee.
      if (near) m.limb([knee[0] - side * .01, knee[1] + .01, knee[2]], [knee[0] + side * .03, knee[1] + .11, knee[2] + .06], .03, .002,
        near ? 4 : 3, 1, 0, () => ({ color: CHITIN_LIGHT, gloss: .3 }));
      if (near) {
        m.ellipsoid(knee, [.045, .045, .045], 6, 4, () => ({ color: JOINT, gloss: .5, membrane: .4, veins: .4 }));
        // Serrated tibia: digging teeth on the front legs, smaller spurs behind.
        const along = new T.Vector3(...ankle).sub(new T.Vector3(...knee));
        const size = pair === 0 ? 1.5 : 1;
        for (const t of [.35, .6, .85]) {
          const base = new T.Vector3(...knee).addScaledVector(along, t);
          const tip = base.clone().add(new T.Vector3(side * .045 * size, -.005, (pair === 0 ? -.03 : .04) * size));
          m.limb(base.toArray(), tip.toArray(), .013 * size, .001, 3, 1, 0, () => ({ color: CLAW, gloss: .3 }));
        }
        const mid: Vec3 = [(ankle[0] + foot[0]) / 2 + side * .01, (ankle[1] + foot[1]) / 2 + .03, (ankle[2] + foot[2]) / 2];
        m.chain([ankle, mid, foot], .022, .012, 4, (_p, n) => ({ color: shade(blend(CLAW, LEG, .5), .8 + .2 * Math.max(0, n.y)), gloss: .35 }), true);
        // Hooked double claw.
        for (const [dx, dz] of [[.035, -.04], [-.012, -.05]]) {
          m.limb([foot[0], .022, foot[2]], [foot[0] + side * dx, .006, foot[2] + dz], .012, .001, 3, 1, 0, () => ({ color: CLAW, gloss: .25 }));
        }
      } else {
        m.limb(ankle, foot, .022, .012, 3, 1, 0, () => ({ color: CLAW, gloss: .4 }));
      }
    }
  }
  m.rig = undefined;
  return m.geometry();
}

/** Value noise and derivative bump in GLSL, shared by the Schabe and the swarm nests. */
export const ORGANIC_GLSL = `
    float schabeHash(vec3 p) {
      p = fract(p * .3183099 + .1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float schabeNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(schabeHash(i), schabeHash(i + vec3(1, 0, 0)), f.x),
                     mix(schabeHash(i + vec3(0, 1, 0)), schabeHash(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(schabeHash(i + vec3(0, 0, 1)), schabeHash(i + vec3(1, 0, 1)), f.x),
                     mix(schabeHash(i + vec3(0, 1, 1)), schabeHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    vec3 schabeBump(vec3 surf, vec3 n, vec2 dh, float facing) {
      vec3 sx = normalize(dFdx(surf)), sy = normalize(dFdy(surf));
      vec3 r1 = cross(sy, n), r2 = cross(n, sx);
      float det = dot(sx, r1) * facing;
      return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
    }
`;

/**
 * GLSL for the alien finish: plum-black chitin with punctured striae, an oil-film iridescence, fleshy translucent
 * membranes and ember veins that pulse with `vSchabePulse` (set by the gait shader for living bodies, 0 otherwise).
 */
export function applySchabeTissue(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `
    #include <common>
    attribute vec4 tissue;
    varying vec3 vSchabeLocal;
    varying vec4 vSchabeTissue;
    varying float vSchabePulse;
  `).replace('#include <begin_vertex>', `
    vSchabeLocal = position;
    vSchabeTissue = tissue;
    vSchabePulse = 0.0;
    #include <begin_vertex>
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
    #include <common>
    varying vec3 vSchabeLocal;
    varying vec4 vSchabeTissue;
    varying float vSchabePulse;
    ${ORGANIC_GLSL}
  `).replace('#include <color_fragment>', `
    #include <color_fragment>
    vec3 schabeP = vSchabeLocal;
    float schabeMembrane = vSchabeTissue.z;
    float schabeHardness = 1.0 - schabeMembrane;
    float schabeMottle = schabeNoise(schabeP * 9.0) * .6 + schabeNoise(schabeP * 23.0) * .4;
    // Punctured striae along the wing case, rows of pits on the shield.
    float schabeStriae = smoothstep(.68, .74, schabeP.y) * smoothstep(-.12, -.04, schabeP.z) * schabeHardness
      * smoothstep(.6, .95, abs(sin(schabeP.x * 40.0 + schabeNoise(schabeP * 6.0) * 1.5)));
    float schabePits = smoothstep(.78, .9, schabeNoise(schabeP * 30.0)) * schabeHardness * smoothstep(.6, .75, schabeP.y)
      * (1.0 - smoothstep(-.12, -.04, schabeP.z));
    // Ember veins through membranes and resin sacs: ridged noise.
    float schabeVeins = vSchabeTissue.w * smoothstep(.86, .97,
      1.0 - abs(schabeNoise(schabeP * 13.0 + vec3(0, 0, schabeP.x * 4.0)) * 2.0 - 1.0));
    diffuseColor.rgb *= mix(.82 + .34 * schabeMottle, .9 + .2 * schabeMottle, schabeMembrane);
    diffuseColor.rgb *= 1.0 - .45 * schabeStriae - .35 * schabePits;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.08, .02, .01), schabeVeins * .5);
  `).replace('#include <normal_fragment_maps>', `
    #include <normal_fragment_maps>
    {
      // Pitted, striated chitin and wrinkled membrane; fades out before it can shimmer at distance.
      float relief = schabeNoise(schabeP * 52.0) * schabeHardness * .45 - schabeStriae * .8 - schabePits * .6
        + schabeNoise(schabeP * vec3(14.0, 30.0, 70.0)) * schabeMembrane * 1.4 + schabeVeins * .7;
      float schabeNear = 1.0 - smoothstep(9.0, 26.0, length(vViewPosition));
      if (schabeNear > 0.0) normal = schabeBump(-vViewPosition, normal, vec2(dFdx(relief), dFdy(relief)) * .9 * schabeNear, faceDirection);
    }
  `).replace('#include <opaque_fragment>', `
    {
      // Light level at this fragment, so the reflective terms never glow in the dark.
      float schabeLight = clamp(dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(.333))
        / max(.03, dot(diffuseColor.rgb, vec3(.333))), 0.0, 2.0);
      vec3 schabeView = normalize(vViewPosition);
      float schabeFacing = clamp(dot(normal, schabeView), 0.0, 1.0);
      float schabeRim = pow(1.0 - schabeFacing, 2.2);
      // Oil-film iridescence on hard chitin: violet through teal to gold with the viewing angle.
      vec3 schabeFilm = .5 + .5 * cos(6.2832 * (vec3(.0, .33, .67) + schabeFacing * 1.1 + schabeMottle * .35 + .55));
      float schabeHard = schabeHardness * clamp(1.15 - vSurface.x, 0.0, 1.0);
      outgoingLight += schabeFilm * (schabeRim * .13 + .012) * schabeHard * schabeLight;
      outgoingLight += vec3(.7, .2, .1) * schabeMembrane * (.35 * schabeRim + .06) * schabeLight * diffuseColor.rgb * 2.0;
      // Bioluminescent veins, beating with the swarm.
      outgoingLight += vec3(1.0, .3, .07) * schabeVeins * (.12 + .55 * vSchabePulse);
    }
    #include <opaque_fragment>
  `);
}

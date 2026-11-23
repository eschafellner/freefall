import * as T from 'three';
import { DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID, groundHeight } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';
import { randomSource } from './noise.ts';
import type { VegetationWind } from './VegetationWind.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';

type FlierKind = 'manta' | 'glider' | 'quad';
interface Fliers {
  readonly kind: FlierKind; readonly flocks: number; readonly perFlock: number;
  readonly altitude: readonly [number, number]; readonly circle: readonly [number, number];
  readonly speed: number; readonly size: readonly [number, number]; readonly flap: number;
  readonly body: number; readonly wing: number; readonly tip: number;
}
interface Floaters { readonly count: number; readonly height: readonly [number, number]; readonly size: number; readonly skin: number; readonly glow: number }
interface Motes {
  readonly swarms: number; readonly perSwarm: number; readonly color: number; readonly size: number;
  readonly spread: number; readonly height: readonly [number, number]; readonly drift: boolean;
}
interface LifeProfile {
  readonly fliers: readonly Fliers[];
  readonly floaters?: Floaters;
  readonly motes?: Motes;
  readonly fall?: { readonly count: number; readonly color: number };
  readonly devils?: { readonly count: number; readonly color: number };
}

/**
 * Alien wildlife and ambient motion per planet. Purely cosmetic and client-side: nothing here is simulated on the
 * server, collides or reacts to players.
 */
export const LIFE_PROFILES: Readonly<Record<string, LifeProfile>> = {
  [GREEN_PLAINS_ID]: {
    // Segelrochen: violet-grey mantas sailing in loose circles; Schwebeblasen: gas bladders with glowing cores.
    fliers: [{ kind: 'manta', flocks: 2, perFlock: 4, altitude: [9, 20], circle: [18, 34], speed: .15, size: [2.4, 3.4], flap: .9,
      body: 0x5e4f78, wing: 0x9a84b8, tip: 0x5fe6d2 }],
    floaters: { count: 12, height: [3, 9], size: .9, skin: 0xb59ad6, glow: 0xe07bff },
    motes: { swarms: 10, perSwarm: 30, color: 0xd38bff, size: .16, spread: 1.4, height: [.5, 1.8], drift: false },
  },
  [DESERT_ID]: {
    // Hitzesegler riding the thermals; Funkenkäfer; dust devils.
    fliers: [{ kind: 'glider', flocks: 2, perFlock: 2, altitude: [22, 38], circle: [22, 40], speed: .11, size: [2.4, 3.2], flap: .55,
      body: 0x6a3f28, wing: 0xc08a52, tip: 0xffb24a }],
    motes: { swarms: 6, perSwarm: 18, color: 0xffb347, size: .12, spread: 1.1, height: [.3, 1.2], drift: false },
    devils: { count: 3, color: 0xc9a777 },
  },
  [ICE_ID]: {
    // Frostrochen gliding low over the ice; Frostmotten drifting in pale light.
    fliers: [{ kind: 'manta', flocks: 2, perFlock: 2, altitude: [8, 18], circle: [18, 32], speed: .12, size: [2.2, 3.2], flap: .65,
      body: 0x7f9ab2, wing: 0xd2e4f0, tip: 0x6fe8ff }],
    motes: { swarms: 8, perSwarm: 24, color: 0x9ff2ff, size: .14, spread: 2.6, height: [.5, 3], drift: true },
  },
  [FOREST_ID]: {
    // Vierflügler darting between trunks; Leuchtsporen; falling needles; bladders over clearings.
    fliers: [{ kind: 'quad', flocks: 2, perFlock: 3, altitude: [3, 9], circle: [6, 12], speed: .5, size: [1, 1.4], flap: 9,
      body: 0x2b3a2c, wing: 0x9fdccb, tip: 0x3fffd2 }],
    floaters: { count: 8, height: [4, 10], size: .8, skin: 0x7fc9b8, glow: 0x52ffd8 },
    motes: { swarms: 14, perSwarm: 26, color: 0x6dffe0, size: .13, spread: 3, height: [.5, 6], drift: true },
    fall: { count: 220, color: 0x9a9258 },
  },
};

const RANGE = 75;
const colorOf = (hex: number) => new T.Color(hex);

/**
 * Creature meshes with volume. Attributes: `span` (0 body … 1 wing tip) drives the wing beat, `tail` (0 root … 1 tip)
 * the tail sway. The glow geometry shares both attributes so markings move with the wings.
 */
class CreatureBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly spans: number[] = [];
  readonly tails: number[] = [];
  vertex(p: T.Vector3Tuple, c: T.Color, span: number, tail = 0) {
    this.positions.push(...p);
    this.colors.push(c.r, c.g, c.b);
    this.spans.push(span);
    this.tails.push(tail);
  }
  tri(a: T.Vector3Tuple, b: T.Vector3Tuple, c: T.Vector3Tuple, color: T.Color | [T.Color, T.Color, T.Color], spans: [number, number, number],
    tails: [number, number, number] = [0, 0, 0]) {
    const cs = Array.isArray(color) ? color : [color, color, color];
    this.vertex(a, cs[0], spans[0], tails[0]);
    this.vertex(b, cs[1], spans[1], tails[1]);
    this.vertex(c, cs[2], spans[2], tails[2]);
  }
  /** Ellipsoid from an icosahedron, all span 0. */
  ellipsoid(centre: T.Vector3Tuple, size: T.Vector3Tuple, top: T.Color, belly: T.Color, detail = 1, tail = 0) {
    const shape = new T.IcosahedronGeometry(1, detail);
    const p = shape.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      this.vertex([centre[0] + p.getX(i) * size[0], centre[1] + y * size[1], centre[2] + p.getZ(i) * size[2]],
        belly.clone().lerp(top, y * .5 + .5), 0, tail);
    }
    shape.dispose();
  }
  /** Wing membrane as a grid from root edge to tip, with darker veins running toward the tip. */
  membrane(side: number, root: [T.Vector3Tuple, T.Vector3Tuple], tip: T.Vector3Tuple, trailing: number, base: T.Color, edge: T.Color,
    vein: T.Color, rows = 5, cols = 3, veins = 4) {
    const point = (u: number, v: number): T.Vector3Tuple => {
      // u: 0 root … 1 tip; v: 0 leading … 1 trailing edge. The trailing edge is scalloped between the spars.
      const lead: T.Vector3Tuple = [root[0][0] + (tip[0] - root[0][0]) * u, root[0][1] + (tip[1] - root[0][1]) * u + Math.sin(u * Math.PI) * .08,
        root[0][2] + (tip[2] - root[0][2]) * u];
      const back: T.Vector3Tuple = [root[1][0] + (tip[0] - root[1][0]) * u, root[1][1] + (tip[1] - root[1][1]) * u,
        root[1][2] + (tip[2] - root[1][2]) * u - Math.sin(u * Math.PI) * trailing * (1 - .35 * Math.abs(Math.sin(u * veins * Math.PI)))];
      return [side * (lead[0] + (back[0] - lead[0]) * v), lead[1] + (back[1] - lead[1]) * v - v * (1 - v) * .06, lead[2] + (back[2] - lead[2]) * v];
    };
    const color = (u: number, v: number) => {
      const c = base.clone().lerp(edge, Math.pow(u, 1.6));
      const veinMask = Math.pow(Math.abs(Math.cos((u * .4 + v) * veins * Math.PI * .5)), 24);
      return c.lerp(vein, veinMask * .55 + v * .12);
    };
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const u0 = i / rows, u1 = (i + 1) / rows, v0 = j / cols, v1 = (j + 1) / cols;
      const a = point(u0, v0), b = point(u1, v0), c = point(u1, v1), d = point(u0, v1);
      this.tri(a, b, c, [color(u0, v0), color(u1, v0), color(u1, v1)], [u0, u1, u1]);
      this.tri(a, c, d, [color(u0, v0), color(u1, v1), color(u0, v1)], [u0, u1, u0]);
    }
  }
  /** Tapered tail made of segments that sway. */
  tailCone(from: T.Vector3Tuple, length: number, radius: number, c: T.Color, segments = 5) {
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments, t1 = (s + 1) / segments;
      const r0 = radius * (1 - t0), r1 = radius * (1 - t1);
      const z0 = from[2] - length * t0, z1 = from[2] - length * t1;
      for (let k = 0; k < 4; k++) {
        const a0 = k / 4 * Math.PI * 2, a1 = (k + 1) / 4 * Math.PI * 2;
        const p = (r: number, a: number, z: number): T.Vector3Tuple => [from[0] + Math.cos(a) * r, from[1] + Math.sin(a) * r * .7, z];
        this.tri(p(r0, a0, z0), p(r1, a0, z1), p(r1, a1, z1), c, [0, 0, 0], [t0, t1, t1]);
        this.tri(p(r0, a0, z0), p(r1, a1, z1), p(r0, a1, z0), c, [0, 0, 0], [t0, t1, t0]);
      }
    }
  }
  geometry(name: string): T.BufferGeometry {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('span', new T.Float32BufferAttribute(this.spans, 1));
    geometry.setAttribute('tail', new T.Float32BufferAttribute(this.tails, 1));
    geometry.computeVertexNormals();
    geometry.name = name;
    return geometry;
  }
}

/** Body and glowing markings of one species, nose along local +Z, wingspan about 2.6–4 units. */
function creature(kind: FlierKind, bodyHex: number, wingHex: number, tipHex: number): { body: T.BufferGeometry; glow: T.BufferGeometry } {
  const body = new CreatureBuilder(), glow = new CreatureBuilder();
  const b = colorOf(bodyHex), w = colorOf(wingHex), t = colorOf(tipHex);
  const belly = b.clone().lerp(new T.Color(0xffffff), .35), dark = b.clone().multiplyScalar(.55);
  const white = new T.Color(1, 1, 1);
  if (kind === 'manta') {
    // Segelrochen / Frostrochen: broad diamond with cephalic fins, scalloped trailing edge and a long whip tail.
    body.ellipsoid([0, 0, .05], [.34, .16, .85], b, belly);
    body.ellipsoid([0, .02, .8], [.2, .1, .22], b, belly, 0);
    for (const s of [-1, 1]) {
      body.membrane(s, [[.22, .03, .55], [.26, 0, -.55]], [1.45, -.04, -.35], .35, w, t.clone().lerp(w, .4), dark, 6, 3, 3);
      // Cephalic fins curling forward from the head.
      body.tri([s * .14, .02, .95], [s * .26, .04, 1.25], [s * .3, -.02, .95], [b, w, b], [0, .05, 0]);
      // Glowing leading-edge stripe and three spots along the wing.
      for (let i = 0; i < 6; i++) {
        const u0 = i / 6, u1 = (i + 1) / 6;
        const lead = (u: number): T.Vector3Tuple => [s * (.22 + 1.23 * u), .045 + Math.sin(u * Math.PI) * .08, .55 - .9 * u];
        const back = (u: number): T.Vector3Tuple => [s * (.22 + 1.2 * u), .04 + Math.sin(u * Math.PI) * .08, .48 - .9 * u];
        glow.tri(lead(u0), lead(u1), back(u1), white, [u0, u1, u1]);
        glow.tri(lead(u0), back(u1), back(u0), white, [u0, u1, u0]);
      }
      for (const [u, z] of [[.3, .05], [.5, -.1], [.68, -.22]]) {
        const x = s * (.22 + 1.2 * u), y = .06 + Math.sin(u * Math.PI) * .07, r = .05;
        glow.tri([x - r, y, z], [x + r, y, z], [x, y, z + r * 1.6], white, [u, u, u]);
      }
    }
    body.tailCone([0, 0, -.75], 1.6, .07, dark);
    glow.tri([-.03, .17, .4], [.03, .17, .4], [0, .17, -.5], white, [0, 0, 0]);
  } else if (kind === 'glider') {
    // Hitzesegler: long fingered wings, slender neck with a head crest, forked tail.
    body.ellipsoid([0, 0, 0], [.16, .14, .55], b, belly);
    body.ellipsoid([0, .06, .72], [.07, .06, .2], b, belly, 0);
    body.ellipsoid([0, .07, .98], [.08, .07, .16], b, belly, 0);
    body.tri([0, .12, .95], [0, .32, .7], [0, .1, .8], [b, t, b], [0, 0, 0]);
    for (const s of [-1, 1]) {
      body.membrane(s, [[.12, .03, .25], [.14, 0, -.3]], [2.1, .1, -.45], .45, w, w.clone().lerp(dark, .3), dark, 7, 2, 5);
      // Finger spars along the membrane.
      for (const f of [.35, .6, .85]) body.tri([s * .14, .05, .2], [s * 2.1 * f, .09 * f + .05, -.45 * f + .05], [s * 2.1 * f, .06 * f + .04, -.45 * f + .02], dark, [0, f, f]);
      body.tri([s * .03, 0, -.5], [s * .32, -.02, -1.2], [s * .12, 0, -.95], dark, [0, 0, 0], [0, 1, .7]);
      glow.tri([s * .07, .11, .97], [s * .09, .12, 1.0], [s * .08, .1, 1.02], white, [0, 0, 0]);
    }
  } else {
    // Vierflügler: segmented body, two pairs of veined wings, long antennae, glowing abdomen tip.
    body.ellipsoid([0, 0, .32], [.09, .08, .12], b, belly, 0);
    body.ellipsoid([0, 0, .08], [.11, .1, .16], b, belly, 0);
    body.ellipsoid([0, 0, -.35], [.08, .07, .38], b, belly, 1);
    for (const s of [-1, 1]) {
      body.tri([s * .03, .05, .4], [s * .35, .25, 1.0], [s * .33, .26, .98], dark, [0, .3, .3]);
      for (const [z, len, rake] of [[.14, 1.15, .12], [-.02, .95, -.18]] as const) {
        body.membrane(s, [[.06, .06, z + .05], [.06, .05, z - .07]], [len, .08, z + rake], .14, w, t.clone().lerp(w, .5), dark, 4, 2, 6);
      }
    }
    for (let k = 0; k < 4; k++) {
      const a0 = k / 4 * Math.PI * 2, a1 = (k + 1) / 4 * Math.PI * 2, r = .05;
      glow.tri([Math.cos(a0) * r, Math.sin(a0) * r, -.68], [Math.cos(a1) * r, Math.sin(a1) * r, -.68], [0, 0, -.8], white, [0, 0, 0]);
    }
  }
  return { body: body.geometry('life/' + kind), glow: glow.geometry('life/' + kind + '/glow') };
}

interface Flock { cx: number; cz: number; radius: number; altitude: number; speed: number; phase: number }

export class AmbientLife {
  readonly root = new T.Group();
  private readonly world: WorldDefinition;
  private readonly profile?: LifeProfile;
  private readonly time = { value: 0 };
  private readonly random: () => number;
  private readonly wind?: VegetationWind;
  private readonly flierSets: { mesh: T.InstancedMesh; markings: T.InstancedMesh; spec: Fliers; flocks: Flock[]; sizes: number[] }[] = [];
  /** Bioluminescent materials: dim by day, bright at dawn and dusk. */
  private readonly glowMaterials: { material: T.MeshBasicMaterial; base: T.Color }[] = [];
  private twilight = 0;
  private floaters?: { bladders: T.InstancedMesh; tendrils: T.InstancedMesh; state: { x: number; z: number; h: number; s: number; p: number }[] };
  private motes?: { points: T.Points; centres: T.BufferAttribute; spec: Motes; swarms: { x: number; y: number; z: number }[] };
  private fall?: T.Points;
  private devils?: { points: T.Points; centres: T.Vector4[]; heading: number[] };
  private readonly view = { value: new T.Vector3() };
  private last = 0;
  private density = 1;
  private readonly transform = new T.Object3D();

  constructor(world: WorldDefinition, wind?: VegetationWind) {
    this.world = world;
    this.wind = wind;
    this.root.name = 'Ambient life';
    this.profile = world.planetId ? LIFE_PROFILES[world.planetId] : undefined;
    this.random = randomSource((Number.parseInt(world.id.slice(-8), 16) ^ 0x1f3a) >>> 0);
    if (!this.profile) return;
    for (const spec of this.profile.fliers) this.addFliers(spec);
    if (this.profile.floaters) this.addFloaters(this.profile.floaters);
    if (this.profile.motes) this.addMotes(this.profile.motes);
    if (this.profile.fall) this.addFall(this.profile.fall.count, this.profile.fall.color);
    if (this.profile.devils) this.addDevils(this.profile.devils.count, this.profile.devils.color);
  }

  private ground(x: number, z: number): number {
    const h = this.world.half - 1;
    return groundHeight(this.world, Math.max(-h, Math.min(h, x)), Math.max(-h, Math.min(h, z)));
  }

  /** Shared wing beat: gliding phases with bursts of flapping, wing tips lagging, tail swaying. */
  private flap(material: T.Material, key: string, flap: number): void {
    const time = this.time;
    material.customProgramCacheKey = () => 'ambient-flier-v2/' + key;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.lifeTime = time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        attribute float span;
        attribute float tail;
        uniform float lifeTime;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float lifePhase = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23;
        float bursts = smoothstep(.3, .75, sin(lifeTime * .32 + lifePhase) * .5 + .5);
        float beat = sin(lifeTime * ${flap.toFixed(2)} * 6.2832 * (.6 + .4 * bursts) + lifePhase - span * .9);
        transformed.y += beat * span * span * (.12 + .5 * bursts) + span * .07;
        transformed.y += sin(lifeTime * 2.3 + lifePhase + span * 3.) * span * .03;
        transformed.x += sin(lifeTime * 2.1 + lifePhase - tail * 2.6) * tail * tail * .35;
      `);
    };
  }

  private addFliers(spec: Fliers): void {
    const count = spec.flocks * spec.perFlock;
    const { body, glow } = creature(spec.kind, spec.body, spec.wing, spec.tip);
    const material = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: .62, metalness: 0 });
    this.flap(material, spec.kind, spec.flap);
    const shine = new T.MeshBasicMaterial({ color: spec.tip, side: T.DoubleSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    this.flap(shine, spec.kind + '/glow', spec.flap);
    this.glowMaterials.push({ material: shine, base: colorOf(spec.tip) });
    const mesh = new T.InstancedMesh(body, material, count);
    const markings = new T.InstancedMesh(glow, shine, count);
    mesh.name = 'Ambient fliers ' + spec.kind;
    markings.name = 'Ambient flier markings ' + spec.kind;
    mesh.frustumCulled = markings.frustumCulled = false;
    mesh.castShadow = spec.kind !== 'quad';
    const flocks = Array.from({ length: spec.flocks }, () => ({
      cx: (this.random() * 2 - 1) * 120, cz: (this.random() * 2 - 1) * 120,
      radius: spec.circle[0] + this.random() * (spec.circle[1] - spec.circle[0]),
      altitude: spec.altitude[0] + this.random() * (spec.altitude[1] - spec.altitude[0]),
      speed: spec.speed * (.8 + this.random() * .4) * (this.random() < .5 ? -1 : 1), phase: this.random() * 6.3,
    }));
    const sizes = Array.from({ length: count }, () => spec.size[0] + this.random() * (spec.size[1] - spec.size[0]));
    this.flierSets.push({ mesh, markings, spec, flocks, sizes });
    this.root.add(mesh, markings);
  }

  private addFloaters(spec: Floaters): void {
    const skin = new T.MeshStandardMaterial({ color: spec.skin, emissive: spec.glow, emissiveIntensity: .45, transparent: true,
      opacity: .62, roughness: .3, depthWrite: false });
    const bladder = new T.IcosahedronGeometry(1, 2);
    const p = bladder.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setXYZ(i, p.getX(i) * (1 - Math.max(0, -y) * .35), y * .8 + Math.sin(p.getX(i) * 5) * .04, p.getZ(i) * (1 - Math.max(0, -y) * .35));
    }
    bladder.computeVertexNormals();
    // Tendrils: a few hanging strips that sway in the vertex shader.
    const positions: number[] = [];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, r = .45, w = .035, len = 2.2 + (k % 3) * .7;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      positions.push(x - w, -.5, z, x + w, -.5, z, x, -.5 - len, z);
    }
    const tendril = new T.BufferGeometry();
    tendril.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    tendril.computeVertexNormals();
    const glow = new T.MeshBasicMaterial({ color: spec.glow, transparent: true, opacity: .7, side: T.DoubleSide, depthWrite: false });
    const time = this.time;
    glow.onBeforeCompile = (shader) => {
      shader.uniforms.lifeTime = time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float lifeTime;')
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float hang = max(0., -.5 - position.y);
          transformed.x += sin(lifeTime * 1.3 + hang * 1.7 + instanceMatrix[3].x) * hang * .12;
          transformed.z += cos(lifeTime * 1.1 + hang * 1.5 + instanceMatrix[3].z) * hang * .12;
        `);
    };
    glow.customProgramCacheKey = () => 'ambient-tendril-v1';
    const bladders = new T.InstancedMesh(bladder, skin, spec.count);
    const tendrils = new T.InstancedMesh(tendril, glow, spec.count);
    bladders.name = 'Ambient floaters';
    tendrils.name = 'Ambient floater tendrils';
    bladders.frustumCulled = tendrils.frustumCulled = false;
    bladders.renderOrder = tendrils.renderOrder = 2;
    const state = Array.from({ length: spec.count }, () => ({ x: 0, z: 0, h: spec.height[0] + this.random() * (spec.height[1] - spec.height[0]),
      s: spec.size * (.6 + this.random() * .7), p: this.random() * 6.3 }));
    for (const s of state) this.respawn(s, 20, RANGE);
    this.floaters = { bladders, tendrils, state };
    this.root.add(bladders, tendrils);
  }

  private respawn(s: { x: number; z: number }, near: number, far: number): void {
    const a = this.random() * Math.PI * 2, r = near + this.random() * (far - near);
    s.x = this.view.value.x + Math.cos(a) * r;
    s.z = this.view.value.z + Math.sin(a) * r;
  }

  private glowMaterial(color: number, size: number, additive: boolean, vertex: string): T.ShaderMaterial {
    return new T.ShaderMaterial({
      uniforms: { lifeTime: this.time, lifeColor: { value: colorOf(color) }, lifeSize: { value: size }, lifeView: this.view, lifeGlow: { value: 1 } },
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
      vertexShader: `
        uniform float lifeTime, lifeSize;
        uniform vec3 lifeView;
        attribute vec4 lifeSeed;
        varying float vAlpha;
        ${vertex}
      `,
      fragmentShader: `
        uniform vec3 lifeColor;
        uniform float lifeGlow;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord * 2. - 1.;
          float r = dot(c, c);
          if (r > 1.) discard;
          float core = exp(-r * 4.);
          gl_FragColor = vec4(lifeColor * (${additive ? '(.6 + 1.6 * core) * lifeGlow' : '1.'}), vAlpha * ${additive ? 'core' : '(1. - r)'});
        }
      `,
    });
  }

  private addMotes(spec: Motes): void {
    const count = spec.swarms * spec.perSwarm;
    const centres = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set([this.random() * 2 - 1, this.random() * 2 - 1, this.random() * 2 - 1, this.random() * 6.3], i * 4);
    const geometry = new T.BufferGeometry();
    const centreAttribute = new T.BufferAttribute(centres, 3);
    geometry.setAttribute('position', centreAttribute);
    geometry.setAttribute('lifeSeed', new T.BufferAttribute(seeds, 4));
    const motion = spec.drift
      ? 'vec3(sin(t * .21 + s.w) * 2.2 + s.x * 1.5, sin(t * .37 + s.w * 1.7) * .9 + s.y * .6, cos(t * .19 + s.w) * 2.2 + s.z * 1.5)'
      : 'vec3(sin(t * 2.3 + s.w) * s.x, sin(t * 3.1 + s.w * 1.3) * .45 + s.y * .4, sin(t * 1.9 + s.w * .7) * s.z) + s.xyz * .6';
    const material = this.glowMaterial(spec.color, spec.size, true, `
      void main() {
        vec4 s = lifeSeed;
        float t = lifeTime;
        vec3 p = position + (${motion}) * ${spec.spread.toFixed(2)};
        vec4 view = modelViewMatrix * vec4(p, 1.);
        float flicker = .55 + .45 * sin(t * (4. + s.x * 3.) + s.w * 9.);
        vAlpha = flicker * (1. - smoothstep(${(RANGE * .7).toFixed(1)}, ${RANGE.toFixed(1)}, length(p - lifeView)));
        gl_PointSize = clamp(lifeSize * 900. / -view.z, 1.5, 22.);
        gl_Position = projectionMatrix * view;
      }
    `);
    const points = new T.Points(geometry, material);
    points.name = 'Ambient motes';
    points.frustumCulled = false;
    const swarms = Array.from({ length: spec.swarms }, () => ({ x: 0, y: 0, z: 0 }));
    this.motes = { points, centres: centreAttribute, spec, swarms };
    for (let k = 0; k < spec.swarms; k++) this.placeSwarm(k, 8, RANGE * .8);
    this.root.add(points);
  }

  private placeSwarm(k: number, near: number, far: number): void {
    const motes = this.motes!;
    const swarm = motes.swarms[k];
    this.respawn(swarm, near, far);
    swarm.y = this.ground(swarm.x, swarm.z) + motes.spec.height[0] + this.random() * (motes.spec.height[1] - motes.spec.height[0]);
    const array = motes.centres.array as Float32Array;
    for (let i = k * motes.spec.perSwarm; i < (k + 1) * motes.spec.perSwarm; i++) array.set([swarm.x, swarm.y, swarm.z], i * 3);
    motes.centres.needsUpdate = true;
  }

  private addFall(count: number, color: number): void {
    // A box of falling needles and leaves that wraps around the camera; heights are relative to the ground below it.
    const positions = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      positions.set([this.random() * 40, this.random() * 14, this.random() * 40], i * 3);
      seeds.set([this.random(), this.random(), this.random(), this.random() * 6.3], i * 4);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('lifeSeed', new T.BufferAttribute(seeds, 4));
    const material = this.glowMaterial(color, .055, false, `
      uniform float lifeGround;
      void main() {
        vec4 s = lifeSeed;
        vec3 p = position;
        p.xz = mod(p.xz - lifeView.xz + 20., 40.) - 20. + lifeView.xz;
        float y = mod(p.y - lifeTime * (.5 + s.x * .6), 14.);
        p.y = lifeGround - 1. + y;
        p.x += sin(lifeTime * 1.7 + s.w) * .6;
        p.z += cos(lifeTime * 1.3 + s.w) * .6;
        vec4 view = modelViewMatrix * vec4(p, 1.);
        // Only below the canopy: needles fade out well before they would read as specks against the sky.
        vAlpha = .7 * smoothstep(0., 1.5, y) * (1. - smoothstep(5., 9., y));
        gl_PointSize = clamp(lifeSize * 900. / -view.z, 1., 9.);
        gl_Position = projectionMatrix * view;
      }
    `);
    material.uniforms.lifeGround = { value: 0 };
    this.fall = new T.Points(geometry, material);
    this.fall.name = 'Ambient falling leaves';
    this.fall.frustumCulled = false;
    this.root.add(this.fall);
  }

  private addDevils(count: number, color: number): void {
    const per = 220, total = count * per;
    const positions = new Float32Array(total * 3), seeds = new Float32Array(total * 4);
    for (let i = 0; i < total; i++) seeds.set([Math.floor(i / per), this.random(), this.random() * 6.3, this.random()], i * 4);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('lifeSeed', new T.BufferAttribute(seeds, 4));
    const centres = Array.from({ length: count }, () => new T.Vector4());
    const material = this.glowMaterial(color, .55, false, `
      uniform vec4 lifeDevils[${count}];
      void main() {
        vec4 s = lifeSeed;
        vec4 c = lifeDevils[int(s.x + .5)];
        float h = fract(s.y + lifeTime * (.05 + s.w * .05));
        float r = .4 + h * h * 4.5;
        float a = s.z + lifeTime * (2.6 - h * 1.2);
        vec3 p = vec3(c.x + cos(a) * r, c.y + h * 18., c.z + sin(a) * r);
        vec4 view = modelViewMatrix * vec4(p, 1.);
        vAlpha = c.w * .32 * smoothstep(0., .08, h) * (1. - smoothstep(.65, 1., h));
        gl_PointSize = clamp(lifeSize * 900. / -view.z * (.6 + h), 2., 40.);
        gl_Position = projectionMatrix * view;
      }
    `);
    material.uniforms.lifeDevils = { value: centres };
    const points = new T.Points(geometry, material);
    points.name = 'Ambient dust devils';
    points.frustumCulled = false;
    const heading = centres.map(() => this.random() * Math.PI * 2);
    for (const c of centres) {
      c.set((this.random() * 2 - 1) * 180, 0, (this.random() * 2 - 1) * 180, 1);
      c.y = this.ground(c.x, c.z);
    }
    this.devils = { points, centres, heading };
    this.root.add(points);
  }

  /** 0 by day, 1 in full dawn or dusk light: bioluminescence brightens. */
  setTwilight(amount: number): void { this.twilight = Math.max(0, Math.min(1, amount)); }

  configure(quality: GraphicsQuality): void {
    this.density = quality.weatherParticles >= 300 ? 1 : quality.weatherParticles >= 150 ? .75 : .4;
    for (const points of [this.motes?.points, this.fall, this.devils?.points]) {
      if (!points) continue;
      const total = points.geometry.getAttribute('lifeSeed').count;
      points.geometry.setDrawRange(0, Math.max(1, Math.floor(total * this.density)));
    }
    if (this.floaters) this.floaters.bladders.count = this.floaters.tendrils.count =
      Math.max(1, Math.round(this.floaters.state.length * this.density));
  }

  update(camera: T.Camera): void {
    if (!this.profile) return;
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(.1, now - this.last) : 0;
    this.last = now;
    this.time.value = now % 3600;
    const { x, z } = camera.position;
    this.view.value.copy(camera.position);
    const below = this.ground(x, z);
    // Hidden during the drop and from the ship: the creatures belong to the ground view.
    this.root.visible = camera.position.y - below < 70;
    if (!this.root.visible) return;
    const t = this.time.value, transform = this.transform;
    const glow = .35 + .65 * this.twilight;
    for (const { material, base } of this.glowMaterials) material.color.copy(base).multiplyScalar(glow);
    if (this.motes) (this.motes.points.material as T.ShaderMaterial).uniforms.lifeGlow.value = .7 + .8 * this.twilight;

    for (const { mesh, markings, spec, flocks, sizes } of this.flierSets) {
      for (const [f, flock] of flocks.entries()) {
        // Flocks drift with the camera so they stay in view, re-centring when far behind.
        if (Math.hypot(flock.cx - x, flock.cz - z) > 140) { flock.cx = x + (this.random() * 2 - 1) * 80; flock.cz = z + (this.random() * 2 - 1) * 80; }
        const ground = this.ground(flock.cx, flock.cz);
        for (let k = 0; k < spec.perFlock; k++) {
          const i = f * spec.perFlock + k;
          const angle = flock.phase + t * flock.speed * (spec.kind === 'quad' ? 1.6 : 1) + k * (spec.kind === 'quad' ? 2.1 : .45);
          const r = flock.radius * (1 + .18 * Math.sin(k * 1.7 + t * .2));
          const px = flock.cx + Math.cos(angle) * r, pz = flock.cz + Math.sin(angle) * r;
          // Slow climbs and occasional swoops toward the ground.
          const swoop = Math.max(0, Math.sin(t * .07 + flock.phase + k * .3)) ** 6 * flock.altitude * .45;
          const py = ground + flock.altitude - swoop + Math.sin(t * .4 + k) * (spec.kind === 'quad' ? 1.2 : 2.2) + k * .5;
          const dir = Math.sign(flock.speed);
          transform.position.set(px, Math.max(py, this.ground(px, pz) + 2), pz);
          // Heading along the circle tangent (nose is local +Z), banking into the turn.
          transform.lookAt(px - Math.sin(angle) * dir, transform.position.y, pz + Math.cos(angle) * dir);
          transform.rotateZ(-.3 * dir);
          transform.scale.setScalar(sizes[i]);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
          markings.setMatrixAt(i, transform.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = markings.instanceMatrix.needsUpdate = true;
    }

    if (this.floaters) {
      const flow = this.wind?.flow.value;
      for (const [i, s] of this.floaters.state.entries()) {
        s.x += (flow ? flow.x : .2) * dt * .8;
        s.z += (flow ? flow.y : .1) * dt * .8;
        if (Math.hypot(s.x - x, s.z - z) > RANGE) this.respawn(s, RANGE * .6, RANGE * .95);
        transform.position.set(s.x, this.ground(s.x, s.z) + s.h + Math.sin(t * .6 + s.p) * .6, s.z);
        transform.rotation.set(Math.sin(t * .5 + s.p) * .12, t * .1 + s.p, Math.cos(t * .4 + s.p) * .12);
        // Slow pulsing like breathing.
        transform.scale.set(s.s, s.s * (1 + .08 * Math.sin(t * 1.4 + s.p)), s.s);
        transform.updateMatrix();
        this.floaters.bladders.setMatrixAt(i, transform.matrix);
        this.floaters.tendrils.setMatrixAt(i, transform.matrix);
      }
      this.floaters.bladders.instanceMatrix.needsUpdate = this.floaters.tendrils.instanceMatrix.needsUpdate = true;
    }

    if (this.motes) for (const [k, swarm] of this.motes.swarms.entries()) {
      if (Math.hypot(swarm.x - x, swarm.z - z) > RANGE) this.placeSwarm(k, RANGE * .5, RANGE * .9);
    }
    if (this.fall) (this.fall.material as T.ShaderMaterial).uniforms.lifeGround.value = below;
    if (this.devils) for (const [k, c] of this.devils.centres.entries()) {
      this.devils.heading[k] += (this.random() - .5) * dt * .6;
      c.x += Math.cos(this.devils.heading[k]) * dt * 2.2;
      c.z += Math.sin(this.devils.heading[k]) * dt * 2.2;
      const far = Math.hypot(c.x - x, c.z - z) > 160 || Math.max(Math.abs(c.x), Math.abs(c.z)) > this.world.half;
      if (far) {
        const a = this.random() * Math.PI * 2;
        c.x = x + Math.cos(a) * 70;
        c.z = z + Math.sin(a) * 70;
      }
      c.y = this.ground(c.x, c.z);
      // Each devil fades in and out over a slow cycle.
      c.w = Math.max(0, Math.sin(t * .05 + k * 2.1));
    }
  }
}

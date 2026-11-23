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
    fliers: [{ kind: 'manta', flocks: 3, perFlock: 5, altitude: [22, 42], circle: [26, 50], speed: .16, size: [1.6, 2.6], flap: 1.1,
      body: 0x6d6280, wing: 0x9d8fb0, tip: 0x5fd6c8 }],
    floaters: { count: 12, height: [3, 9], size: .9, skin: 0xb59ad6, glow: 0xe07bff },
    motes: { swarms: 10, perSwarm: 30, color: 0xd38bff, size: .16, spread: 1.4, height: [.5, 1.8], drift: false },
  },
  [DESERT_ID]: {
    // Hitzesegler riding the thermals; Funkenkäfer; dust devils.
    fliers: [{ kind: 'glider', flocks: 2, perFlock: 4, altitude: [40, 70], circle: [30, 55], speed: .1, size: [2.4, 3.4], flap: .5,
      body: 0x5a3a28, wing: 0xb48a5a, tip: 0x3a241a }],
    motes: { swarms: 6, perSwarm: 18, color: 0xffb347, size: .12, spread: 1.1, height: [.3, 1.2], drift: false },
    devils: { count: 3, color: 0xc9a777 },
  },
  [ICE_ID]: {
    // Frostrochen gliding low over the ice; Frostmotten drifting in pale light.
    fliers: [{ kind: 'manta', flocks: 2, perFlock: 4, altitude: [14, 32], circle: [24, 44], speed: .12, size: [1.8, 2.8], flap: .7,
      body: 0x9fb4c6, wing: 0xdce8f0, tip: 0x7fe3ff }],
    motes: { swarms: 8, perSwarm: 24, color: 0x9ff2ff, size: .14, spread: 2.6, height: [.5, 3], drift: true },
  },
  [FOREST_ID]: {
    // Vierflügler darting between trunks; Leuchtsporen; falling needles; bladders over clearings.
    fliers: [{ kind: 'quad', flocks: 4, perFlock: 3, altitude: [3, 10], circle: [6, 14], speed: .55, size: [.7, 1.1], flap: 9,
      body: 0x2d3b2a, wing: 0x8fd6c4, tip: 0x3fffd2 }],
    floaters: { count: 8, height: [4, 10], size: .8, skin: 0x7fc9b8, glow: 0x52ffd8 },
    motes: { swarms: 14, perSwarm: 26, color: 0x6dffe0, size: .13, spread: 3, height: [.5, 6], drift: true },
    fall: { count: 220, color: 0x9a9258 },
  },
};

const RANGE = 75;
const colorOf = (hex: number) => new T.Color(hex);

/** Flat creature meshes; attribute `span` (0 body … 1 tip) drives the wing beat in the vertex shader. */
function flierGeometry(kind: FlierKind, body: number, wing: number, tip: number): T.BufferGeometry {
  const positions: number[] = [], spans: number[] = [], colors: number[] = [];
  const b = colorOf(body), w = colorOf(wing), t = colorOf(tip);
  const tri = (pts: [number, number, number, number][]) => {
    for (const [x, y, z, span] of pts) {
      positions.push(x, y, z);
      spans.push(span);
      const c = span > .85 ? t : span > .05 ? w.clone().lerp(b, 1 - span) : b;
      colors.push(c.r, c.g, c.b);
    }
  };
  if (kind === 'manta') {
    for (const s of [-1, 1]) {
      tri([[0, .05, .7, 0], [s * .55, 0, .1, .4], [0, .08, -.4, 0]]);
      tri([[s * .55, 0, .1, .4], [s * 1.35, -.05, -.25, 1], [0, .08, -.4, 0]]);
      tri([[s * .55, 0, .1, .4], [s * 1.1, -.03, .2, .85], [s * 1.35, -.05, -.25, 1]]);
      tri([[0, .08, -.4, 0], [s * .5, 0, -.45, .35], [0, 0, -1.6, 0]]);
    }
    tri([[0, .05, .7, 0], [.15, -.05, .2, 0], [-.15, -.05, .2, 0]]);
  } else if (kind === 'glider') {
    for (const s of [-1, 1]) {
      tri([[0, 0, .5, 0], [s * 1.0, .05, .05, .45], [0, 0, -.4, 0]]);
      tri([[s * 1.0, .05, .05, .45], [s * 2.0, .12, -.25, 1], [s * .9, .04, -.2, .4]]);
      tri([[s * 1.0, .05, .05, .45], [s * 1.9, .1, -.05, .95], [s * 2.0, .12, -.25, 1]]);
      tri([[0, 0, -.4, 0], [s * .35, 0, -1.05, .2], [0, 0, -.8, 0]]);
    }
  } else {
    // Four slim wings in two pairs on a segmented body.
    for (const [z, len] of [[.15, 1], [-.12, .85]] as const) for (const s of [-1, 1]) {
      tri([[0, .02, z + .07, 0], [s * len * .9, .04, z + .1, 1], [s * len * .85, .03, z - .06, .95]]);
      tri([[0, .02, z + .07, 0], [s * len * .85, .03, z - .06, .95], [0, .02, z - .07, 0]]);
    }
    tri([[0, .05, .45, 0], [.05, 0, -.6, 0], [-.05, 0, -.6, 0]]);
    tri([[0, .05, .45, 0], [0, -.04, -.6, 0], [.05, 0, -.6, 0]]);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('span', new T.Float32BufferAttribute(spans, 1));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.name = 'life/' + kind;
  return geometry;
}

interface Flock { cx: number; cz: number; radius: number; altitude: number; speed: number; phase: number }

export class AmbientLife {
  readonly root = new T.Group();
  private readonly world: WorldDefinition;
  private readonly profile?: LifeProfile;
  private readonly time = { value: 0 };
  private readonly random: () => number;
  private readonly wind?: VegetationWind;
  private readonly flierSets: { mesh: T.InstancedMesh; spec: Fliers; flocks: Flock[]; sizes: number[] }[] = [];
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

  private addFliers(spec: Fliers): void {
    const count = spec.flocks * spec.perFlock;
    const material = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: .7, metalness: 0 });
    const time = this.time, flap = spec.flap;
    material.customProgramCacheKey = () => 'ambient-flier-v1';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.lifeTime = time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        attribute float span;
        uniform float lifeTime;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float lifePhase = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23;
        float beat = sin(lifeTime * ${flap.toFixed(2)} * 6.2832 + lifePhase);
        // Membrane wings ripple from root to tip; gliders mostly hold still.
        transformed.y += beat * span * span * .55 + sin(lifeTime * 3.1 + lifePhase + span * 2.5) * span * .08;
      `);
    };
    const mesh = new T.InstancedMesh(flierGeometry(spec.kind, spec.body, spec.wing, spec.tip), material, count);
    mesh.name = 'Ambient fliers ' + spec.kind;
    mesh.frustumCulled = false;
    const flocks = Array.from({ length: spec.flocks }, () => ({
      cx: (this.random() * 2 - 1) * 150, cz: (this.random() * 2 - 1) * 150,
      radius: spec.circle[0] + this.random() * (spec.circle[1] - spec.circle[0]),
      altitude: spec.altitude[0] + this.random() * (spec.altitude[1] - spec.altitude[0]),
      speed: spec.speed * (.8 + this.random() * .4) * (this.random() < .5 ? -1 : 1), phase: this.random() * 6.3,
    }));
    const sizes = Array.from({ length: count }, () => spec.size[0] + this.random() * (spec.size[1] - spec.size[0]));
    this.flierSets.push({ mesh, spec, flocks, sizes });
    this.root.add(mesh);
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
      uniforms: { lifeTime: this.time, lifeColor: { value: colorOf(color) }, lifeSize: { value: size }, lifeView: this.view },
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
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord * 2. - 1.;
          float r = dot(c, c);
          if (r > 1.) discard;
          float core = exp(-r * 4.);
          gl_FragColor = vec4(lifeColor * (${additive ? '.6 + 1.6 * core' : '1.'}), vAlpha * ${additive ? 'core' : '(1. - r)'});
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

    for (const { mesh, spec, flocks, sizes } of this.flierSets) {
      for (const [f, flock] of flocks.entries()) {
        // Flocks drift with the camera so they stay in view, re-centring when far behind.
        if (Math.hypot(flock.cx - x, flock.cz - z) > 140) { flock.cx = x + (this.random() * 2 - 1) * 80; flock.cz = z + (this.random() * 2 - 1) * 80; }
        const ground = this.ground(flock.cx, flock.cz);
        for (let k = 0; k < spec.perFlock; k++) {
          const i = f * spec.perFlock + k;
          const angle = flock.phase + t * flock.speed * (spec.kind === 'quad' ? 1.6 : 1) + k * (spec.kind === 'quad' ? 2.1 : .45);
          const r = flock.radius * (1 + .18 * Math.sin(k * 1.7 + t * .2));
          const px = flock.cx + Math.cos(angle) * r, pz = flock.cz + Math.sin(angle) * r;
          const py = ground + flock.altitude + Math.sin(t * .4 + k) * (spec.kind === 'quad' ? 1.5 : 3) + k * .6;
          const dir = Math.sign(flock.speed);
          transform.position.set(px, Math.max(py, this.ground(px, pz) + 2), pz);
          // Heading along the circle tangent (nose is local +Z), banking into the turn.
          transform.lookAt(px - Math.sin(angle) * dir, transform.position.y, pz + Math.cos(angle) * dir);
          transform.rotateZ(-.3 * dir);
          transform.scale.setScalar(sizes[i]);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
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

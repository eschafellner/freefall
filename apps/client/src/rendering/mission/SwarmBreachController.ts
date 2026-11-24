import * as T from 'three';
import { groundHeight } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';
import { NET, NEST_COLLAPSE_TICKS, NEST_EXITS, NEST_EXIT_RADIUS, NEST_RADIUS } from '@freefall/shared';
import type { NestSnapshot } from '@freefall/shared';
import { randomSource, smoothstep } from '../environment/noise.ts';
import type { SurfaceMaterials } from '../environment/SurfaceMaterials.ts';
import { ORGANIC_GLSL } from '../SchabeModel.ts';

const MAX_NEST_VISUALS = 44;
const MAX_PARTICLES = 720;

function moundGeometry(): T.BufferGeometry {
  const columns = 96, rows = 28;
  const terrain = new T.PlaneGeometry(1, 1, columns, rows);
  const positions = terrain.getAttribute('position');
  const uv = terrain.getAttribute('uv');
  const colors = new Float32Array(positions.count * 3);
  const tint = new T.Color();
  const soil = new T.Color(0x796044);
  const crust = new T.Color(0x30291f);
  const flesh = new T.Color(0x5a2c22);
  const resin = new T.Color(0x2a1712);
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const i = row * (columns + 1) + column;
    const radius = .003 + .997 * row / rows;
    const angle = column * Math.PI * 2 / columns;
    const ridges = 1 + .12 * Math.sin(5 * angle + radius * 4) + .07 * Math.sin(angle * 11 - radius * 6);
    // Bulbous growths and sinewy folds on the flanks, strongest halfway up.
    const flank = Math.sin(Math.PI * Math.min(1, radius * 1.15));
    const bulbs = (Math.max(0, Math.sin(angle * 7 + radius * 9) * Math.sin(radius * 17 - angle * 3)) ** 2 * .45
      + Math.sin(angle * 23 + radius * 31) * .035) * flank;
    const distance = radius * NEST_RADIUS * ridges * (1 + bulbs * .12);
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    const h = 3.42 * (1 - radius ** 1.45) ** 1.13 * ridges + Math.sin(radius * 31 + angle * 3) * .15 * Math.sin(Math.PI * radius)
      + bulbs * .55;
    positions.setXYZ(i, x, h - .09, z);
    // Soil at the foot blends into the ground; living tissue and dark resin further up.
    const living = smoothstep(.95, .45, radius);
    tint.copy(soil).lerp(crust, .32 + .23 * Math.sin(angle * 9 + radius * 15) + radius * .17);
    tint.lerp(flesh, living * (.55 + .3 * Math.sin(angle * 5 - radius * 7))).lerp(resin, living * bulbs * .9);
    tint.toArray(colors, i * 3);
    uv.setXY(i, x * .24, z * .24 + h * .18);
  }
  terrain.setAttribute('color', new T.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  return terrain;
}

/**
 * Living nest surface: vertex colours from soil to flesh, ridged veins that pulse with a slow heartbeat, a wet sheen on
 * the tissue and fine wrinkled relief close up.
 */
function nestMaterial(time: { value: number }): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .04 });
  material.customProgramCacheKey = () => 'swarm-nest-tissue-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nestTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 vNestLocal;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vNestLocal = position;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform float nestTime;
      varying vec3 vNestLocal;
      ${ORGANIC_GLSL}
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 nestP = vNestLocal;
      float nestLiving = smoothstep(.6, 2.2, nestP.y + .4);
      // Ridged noise gives branching vein lines.
      float nestVeinA = 1.0 - abs(schabeNoise(nestP * vec3(.9, 1.6, .9)) * 2.0 - 1.0);
      float nestVeinB = 1.0 - abs(schabeNoise(nestP * vec3(2.1, 3.3, 2.1) + 7.0) * 2.0 - 1.0);
      float nestVeins = max(smoothstep(.93, .99, nestVeinA), smoothstep(.95, .992, nestVeinB) * .6) * nestLiving;
      float nestBeat = pow(.5 + .5 * sin(nestTime * 2.4 - length(nestP.xz) * .8), 6.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.2, .04, .03), nestVeins * .75);
      diffuseColor.rgb *= .85 + .3 * schabeNoise(nestP * 6.0);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .28, nestLiving * (.6 + .4 * schabeNoise(nestP * 3.0)));
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      {
        float nestRelief = schabeNoise(nestP * vec3(4.0, 9.0, 4.0)) * .7 + schabeNoise(nestP * 13.0) * .3 - nestVeins * .9;
        float nestNear = 1.0 - smoothstep(18.0, 45.0, length(vViewPosition));
        if (nestNear > 0.0) normal = schabeBump(-vViewPosition, normal, vec2(dFdx(nestRelief), dFdy(nestRelief)) * 1.4 * nestNear, faceDirection);
      }
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(.8, .22, .07) * nestVeins * (.03 + .28 * nestBeat);
    `);
  };
  return material;
}

function cracksGeometry(): T.BufferGeometry {
  const random = randomSource(331);
  const vertices: number[] = [];
  for (let crack = 0; crack < 12; crack++) {
    let angle = crack * Math.PI / 6;
    let x = Math.sin(angle) * 1.5;
    let z = Math.cos(angle) * 1.5;
    for (let part = 0; part < 5; part++) {
      angle += (random() - .5) * .72;
      const step = .69 + random() * .52;
      const endX = x + Math.sin(angle) * step;
      const endZ = z + Math.cos(angle) * step;
      const side = (.17 - part * .026) * (1 + random());
      vertices.push(x - Math.cos(angle) * side, .045, z + Math.sin(angle) * side,
        x + Math.cos(angle) * side, .045, z - Math.sin(angle) * side, endX, .045, endZ);
      x = endX;
      z = endZ;
    }
  }
  return new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
}

export class SwarmBreachController {
  readonly root = new T.Group();
  private readonly body: T.InstancedMesh;
  private readonly cracks: T.InstancedMesh;
  private readonly crater: T.InstancedMesh;
  private readonly throats: T.InstancedMesh;
  private readonly rims: T.InstancedMesh;
  private readonly rubble: T.InstancedMesh;
  private readonly particles: T.Points;
  private readonly dustPosition = new T.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(T.DynamicDrawUsage);
  private readonly dustShape = new T.BufferAttribute(new Float32Array(MAX_PARTICLES * 2), 2).setUsage(T.DynamicDrawUsage);
  private readonly matrix = new T.Object3D();
  private readonly offsets = Array.from({ length: 36 }, (_, i) => (i * .61803398875) % 1);
  private count = 0;
  private readonly nestTime = { value: 0 };
  world?: WorldDefinition;

  constructor(_materials: SurfaceMaterials) {
    const batches = (geometry: T.BufferGeometry, material: T.Material, factor = 1) => {
      const mesh = new T.InstancedMesh(geometry, material, MAX_NEST_VISUALS * factor);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.root.add(mesh);
      return mesh;
    };
    this.body = batches(moundGeometry(), nestMaterial(this.nestTime));
    this.body.receiveShadow = true;
    this.cracks = batches(cracksGeometry(), new T.MeshStandardMaterial({ color: 0x261f18, side: T.DoubleSide, roughness: 1 }));
    this.crater = batches(new T.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x332821, roughness: 1 }));
    this.throats = batches(new T.CircleGeometry(1, 18), new T.MeshBasicMaterial({ color: 0x2a0e09, side: T.DoubleSide }), NEST_EXITS);
    // Fleshy sphincter lips around the exits.
    this.rims = batches(new T.TorusGeometry(1, .2, 8, 28), new T.MeshStandardMaterial({
      color: 0x5e2c22, roughness: .36, metalness: .05,
    }), NEST_EXITS);
    this.rubble = batches(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({
      color: 0x685342, roughness: .98, flatShading: true,
    }), 15);
    const dust = new T.BufferGeometry().setAttribute('position', this.dustPosition).setAttribute('shape', this.dustShape);
    const mist = new T.ShaderMaterial({
      uniforms: { viewportHeight: { value: 700 }, tint: { value: new T.Color(0xad9478) } },
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec2 shape;
        uniform float viewportHeight;
        varying float alpha;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_PointSize = clamp(shape.x * viewportHeight / max(1.0, -p.z), 1.0, 82.0);
          alpha = shape.y * (1.0 - smoothstep(65.0, 150.0, -p.z));
        }`,
      fragmentShader: `
        uniform vec3 tint;
        varying float alpha;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float cloud = max(0.0, 1.0 - dot(uv, uv));
          gl_FragColor = vec4(tint, alpha * cloud * cloud);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.particles = new T.Points(dust, mist);
    this.particles.frustumCulled = false;
    this.root.add(this.particles);
  }

  setViewport(height: number): void {
    (this.particles.material as T.ShaderMaterial).uniforms.viewportHeight.value = height;
  }

  private place(mesh: T.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, pitch = 0): void {
    const matrix = this.matrix;
    matrix.position.set(x, y + groundHeight(this.world, x, z), z);
    matrix.scale.set(sx, sy, sz);
    matrix.rotation.set(pitch, yaw, 0, 'YXZ');
    matrix.updateMatrix();
    mesh.setMatrixAt(mesh.count++, matrix.matrix);
  }

  private plume(x: number, z: number, tick: number, density: number, force: number, seed: number, amount: number): void {
    for (let i = 0; i < amount && this.count < MAX_PARTICLES; i++) {
      const angle = (this.offsets[i] * 6.28 + seed) % 6.28;
      const life = ((tick * (.38 + this.offsets[(i + 1) % 36] * .9) + this.offsets[(i + 18) % 36]) % 1 + 1) % 1;
      const reach = life * force * (.45 + this.offsets[(i + 6) % 36]);
      const y = .08 + (Math.sin(life * 2.62) * (.58 + this.offsets[(i + 9) % 36]) * force) / 2.7;
      this.dustPosition.setXYZ(this.count, x + Math.sin(angle) * reach, y + groundHeight(this.world, x, z), z + Math.cos(angle) * reach);
      this.dustShape.setXY(this.count, .22 + life * force * .43, density * (1 - life) * .61);
      this.count++;
    }
  }

  update(nests: readonly NestSnapshot[], tick: number, camera: T.Camera, low: boolean): void {
    const { body, cracks, crater, rims, throats, rubble } = this;
    this.nestTime.value = tick / NET.tickHz;
    body.count = cracks.count = crater.count = rims.count = throats.count = rubble.count = this.count = 0;
    let visible = 0;
    for (const nest of nests) {
      const { id, x, z, rotation } = nest;
      const distance = Math.hypot(camera.position.x - x, camera.position.z - z);
      if (distance > 155 || visible++ >= MAX_NEST_VISUALS) continue;
      const emerging = nest.state === 'EMERGING';
      const dying = nest.state === 'DESTROYING' || nest.state === 'DESTROYED';
      const t = nest.breachId ? T.MathUtils.clamp((tick - nest.startedAt) / (nest.opensAt - nest.startedAt), 0, 1) : 1;
      const collapse = dying ? (nest.state === 'DESTROYED' ? 1 : smoothstep(0, NEST_COLLAPSE_TICKS, tick - nest.destroyedAt)) : 0;
      const ground = smoothstep(.08, .52, t);
      const rise = smoothstep(.31, .95, t);
      const vibration = emerging ? Math.sin(tick * 1.2) * .04 * (1 - rise) : Math.sin(tick * .085 + id) * .022;
      this.place(cracks, x, 0, z, .16 + ground * 1.08, 1, .16 + ground * 1.08, rotation);
      this.place(crater, x, .033, z, .45 + ground * 3.75, 1, .45 + ground * 3.75, rotation);
      if (rise > 0) {
        this.place(body, x, -.21 + vibration, z, .62 + .38 * rise + .2 * collapse, Math.max(.10, rise * (1 - collapse * .86)),
          .62 + .38 * rise + .2 * collapse, rotation);
      }
      for (let i = 0; i < NEST_EXITS && rise > .19 && collapse < .86; i++) {
        const a = rotation + i * Math.PI * 2 / NEST_EXITS;
        const scale = rise * (1 - collapse);
        const hx = x + Math.sin(a) * (2.48 + (1 - rise) * -.82 + collapse * .42);
        const hz = z + Math.cos(a) * (2.48 + (1 - rise) * -.82 + collapse * .42);
        const hy = .36 + vibration + scale * 1.17;
        this.place(throats, hx, hy, hz, .93 * scale, .74 * scale, 1, a, -.47);
        this.place(rims, hx, hy, hz, .99 * scale, .78 * scale, .65 * scale, a, -.47);
      }
      if (distance < 105 && ground > .26) {
        for (let i = 0; i < 15; i++) {
          const angle = rotation + i * 2.39996;
          const spread = 3.4 + this.offsets[i] * 2.4 + collapse;
          const eject = Math.sin(smoothstep(.29, .65, t) * Math.PI) * (1 + this.offsets[i] * 1.6);
          const scale = .14 + this.offsets[(i + 8) % 36] * .43;
          this.place(rubble, x + Math.sin(angle) * spread * ground, eject + .12, z + Math.cos(angle) * spread * ground,
            scale * 1.3, scale * .67, scale, angle, angle * .6);
        }
      }
      const recentSpawn = (tick - nest.lastSpawnAt) / NET.tickHz;
      if (emerging && t < 1) this.plume(x, z, tick / 30, .38, 1.4 + Math.sin(t * Math.PI) * 6, id, low ? 13 : 32);
      if (dying && collapse < 1) this.plume(x, z, tick / 30, (1 - collapse) * .47, 7 + collapse * 3, id, low ? 12 : 30);
      if (!dying && recentSpawn >= 0 && recentSpawn < 1.25) {
        const angle = rotation + nest.exit * Math.PI * 2 / NEST_EXITS;
        this.plume(x + Math.sin(angle) * NEST_EXIT_RADIUS, z + Math.cos(angle) * NEST_EXIT_RADIUS,
          tick / 30, .42 * (1 - recentSpawn / 1.25), 2.4, id, low ? 6 : 12);
      }
    }
    for (const mesh of [body, cracks, crater, rims, throats, rubble]) {
      mesh.visible = mesh.count > 0;
      if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
    }
    this.particles.visible = this.count > 0;
    this.particles.geometry.setDrawRange(0, this.count);
    if (this.count) {
      this.dustPosition.needsUpdate = this.dustShape.needsUpdate = true;
    }
  }
}
